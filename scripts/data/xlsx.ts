// A minimal reader for the .xlsx files the data build reads: it finds one sheet by name and returns its
// cell values as rows. An .xlsx file is a zip of XML parts, so this reads the zip's central directory,
// inflates the parts it needs with Node's zlib, and parses the sheet XML. It handles what the pinned
// files use (shared and inline strings, numbers, booleans) and nothing more; formulas are read as their
// cached values.

import { inflateRawSync } from 'node:zlib';

export type Cell = string | number | boolean | null;

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_DIRECTORY_ENTRY = 0x02014b50;
const LOCAL_FILE_HEADER = 0x04034b50;

// Every file in the zip, by name, still compressed until asked for.
function readZip(zip: Buffer): Map<string, () => Buffer> {
  let end = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65_557); i--) {
    if (zip.readUInt32LE(i) === END_OF_CENTRAL_DIRECTORY) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error('not a zip file: no end-of-central-directory record');
  const entries = zip.readUInt16LE(end + 10);
  let offset = zip.readUInt32LE(end + 16);
  const files = new Map<string, () => Buffer>();
  for (let n = 0; n < entries; n++) {
    if (zip.readUInt32LE(offset) !== CENTRAL_DIRECTORY_ENTRY) throw new Error('corrupt zip central directory');
    const method = zip.readUInt16LE(offset + 10);
    const compressedSize = zip.readUInt32LE(offset + 20);
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const local = zip.readUInt32LE(offset + 42);
    const name = zip.toString('utf8', offset + 46, offset + 46 + nameLength);
    files.set(name, () => {
      if (zip.readUInt32LE(local) !== LOCAL_FILE_HEADER) throw new Error(`corrupt zip entry ${name}`);
      const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      const data = zip.subarray(start, start + compressedSize);
      if (method === 0) return data;
      if (method === 8) return inflateRawSync(data);
      throw new Error(`zip entry ${name} uses unsupported compression method ${method}`);
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

function decodeXml(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_, entity: string) => {
    if (entity.startsWith('#x')) return String.fromCodePoint(parseInt(entity.slice(2), 16));
    if (entity.startsWith('#')) return String.fromCodePoint(parseInt(entity.slice(1), 10));
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[entity] ?? '';
  });
}

function attribute(tag: string, name: string): string | undefined {
  const match = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return match ? decodeXml(match[1]) : undefined;
}

// The text of a string item: a plain <t>, or the concatenated <t> of each rich-text run.
function itemText(xml: string): string {
  return [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decodeXml(m[1])).join('');
}

function columnIndex(reference: string): number {
  let index = 0;
  for (const ch of /^[A-Z]+/.exec(reference)?.[0] ?? '') index = index * 26 + (ch.charCodeAt(0) - 64);
  return index - 1;
}

// The rows of the named sheet. Row i of the result is the sheet's row i + 1. A row runs to its last
// written cell, and cells between written ones are null. Anything the reader cannot interpret, such as a
// shared string that does not exist or prefixed (namespaced) sheet XML, is an error rather than a blank.
export function readSheet(xlsx: Buffer, sheetName: string): Cell[][] {
  const files = readZip(xlsx);
  const part = (name: string): string => {
    const read = files.get(name);
    if (!read) throw new Error(`workbook has no part ${name}`);
    return read().toString('utf8');
  };

  const sheets = [...part('xl/workbook.xml').matchAll(/<sheet\s[^>]*>/g)].map((m) => m[0]);
  const sheet = sheets.find((tag) => attribute(tag, 'name') === sheetName);
  if (!sheet) {
    const names = sheets.map((tag) => attribute(tag, 'name'));
    throw new Error(`workbook has no sheet "${sheetName}"; it has ${JSON.stringify(names)}`);
  }
  const relationshipId = attribute(sheet, 'r:id');
  const relationship = [...part('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\s[^>]*>/g)]
    .map((m) => m[0])
    .find((tag) => attribute(tag, 'Id') === relationshipId);
  const target = relationship && attribute(relationship, 'Target');
  if (!target) throw new Error(`sheet "${sheetName}" has no target part`);
  const sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target}`;

  const shared: string[] = [];
  if (files.has('xl/sharedStrings.xml')) {
    const xml = part('xl/sharedStrings.xml');
    for (const item of xml.matchAll(/<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g)) shared.push(itemText(item[1] ?? ''));
    const declared = attribute(/<sst\b[^>]*>/.exec(xml)?.[0] ?? '', 'uniqueCount');
    if (declared !== undefined && Number(declared) !== shared.length) {
      throw new Error(`shared strings: read ${shared.length}, the workbook declares ${declared}`);
    }
  }
  const sharedString = (raw: string, where: string): string => {
    const value = shared[Number(raw)];
    if (value === undefined) throw new Error(`${where}: shared string ${raw} does not exist`);
    return value;
  };

  const xml = part(sheetPath);
  if (/<\w+:(?:row|c)\b/.test(xml))
    throw new Error(`sheet "${sheetName}" uses prefixed element names, which this reader does not read`);

  const rows: Cell[][] = [];
  let rowNumber = 0;
  for (const row of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const numbered = attribute(` ${row[1]}`, 'r');
    rowNumber = numbered === undefined ? rowNumber + 1 : Number(numbered);
    const cells: Cell[] = [];
    let column = -1;
    for (const cell of (row[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const tag = ` ${cell[1]}`;
      const body = cell[2] ?? '';
      const reference = attribute(tag, 'r');
      column = reference === undefined ? column + 1 : columnIndex(reference);
      const where = `row ${rowNumber}, column ${column + 1}`;
      if (column < 0) throw new Error(`${where}: unreadable cell reference ${reference}`);
      const type = attribute(tag, 't') ?? 'n';
      const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let value: Cell = null;
      if (type === 'inlineStr') value = itemText(body);
      else if (raw === '') throw new Error(`${where}: empty value`);
      else if (raw !== undefined) {
        if (type === 's') value = sharedString(raw, where);
        else if (type === 'str') value = decodeXml(raw);
        else if (type === 'b') value = raw === '1';
        else if (type === 'n') value = Number(raw);
        else throw new Error(`${where}: unsupported cell type ${type}`);
      }
      while (cells.length < column) cells.push(null);
      cells[column] = value;
    }
    while (rows.length < rowNumber - 1) rows.push([]);
    rows[rowNumber - 1] = cells;
  }
  return rows;
}
