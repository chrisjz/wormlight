import { crc32, deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { readSheet } from './xlsx.ts';

// A zip holding the given files, the first stored and the rest deflated, as spreadsheet tools write them.
function zip(files: Record<string, string>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [index, [name, text]] of Object.entries(files).entries()) {
    const data = Buffer.from(text);
    const method = index === 0 ? 0 : 8;
    const stored = method === 8 ? deflateRawSync(data) : data;
    const nameBytes = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc32(data), 14);
    local.writeUInt32LE(stored.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc32(data), 16);
    central.writeUInt32LE(stored.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, stored);
    centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length + stored.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

// Relationships point each sheet at the other's file name, so a reader that guessed a sheet's part
// from its position would read the wrong one.
function workbook(sheet: string, shared = sharedStrings): Buffer {
  return zip({
    'xl/workbook.xml':
      '<workbook xmlns:r="r"><sheets><sheet name="Other" sheetId="1" r:id="rId1"/>' +
      '<sheet name="5. Sign &amp; prediction" sheetId="2" r:id="rId2"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels':
      '<Relationships><Relationship Id="rId1" Target="worksheets/sheet2.xml"/>' +
      '<Relationship Id="rId2" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/sharedStrings.xml': shared,
    'xl/worksheets/sheet2.xml': '<worksheet><sheetData><row r="1"><c r="A1"><v>9</v></c></row></sheetData></worksheet>',
    'xl/worksheets/sheet1.xml': `<worksheet><sheetData>${sheet}</sheetData></worksheet>`,
  });
}

const sharedStrings =
  '<sst uniqueCount="4"><si><t>AWCL</t></si><si/><si><r><t>AI</t></r><r><t xml:space="preserve">YL</t></r></si>' +
  '<si><t>&lt;&amp;&gt;</t></si></sst>';

const rows =
  '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="D1" t="s"><v>2</v></c><c r="E1"><v>22</v></c></row>' +
  '<row r="2"/>' +
  '<row r="3"><c r="B3" t="inlineStr"><is><t>inline</t></is></c><c r="C3" t="b"><v>1</v></c>' +
  '<c r="D3" t="str"><v>formula</v></c><c r="E3" t="s"><v>3</v></c><c r="F3"/></row>' +
  '<row><c t="s"><v>1</v></c><c><v>7</v></c></row>';

describe('readSheet', () => {
  it('reads shared, rich-text and inline strings, numbers and booleans, in their columns', () => {
    const read = readSheet(workbook(rows), '5. Sign & prediction');
    expect(read[0]).toEqual(['AWCL', null, null, 'AIYL', 22]);
    expect(read[1]).toEqual([]);
    expect(read[2]).toEqual([null, 'inline', true, 'formula', '<&>', null]);
  });

  it('numbers rows and cells without a reference after the one before', () => {
    expect(readSheet(workbook(rows), '5. Sign & prediction')[3]).toEqual(['', 7]);
  });

  it('finds a sheet through its relationship, not its position', () => {
    expect(readSheet(workbook(rows), 'Other')).toEqual([[9]]);
  });

  it('names the sheets it has when asked for one it lacks', () => {
    expect(() => readSheet(workbook(rows), 'Missing')).toThrow(/"Other","5. Sign & prediction"/);
  });

  it('refuses what it cannot read rather than returning blanks', () => {
    const sheet = '5. Sign & prediction';
    expect(() => readSheet(workbook('<row r="1"><c r="A1" t="s"><v>9</v></c></row>'), sheet)).toThrow(/does not exist/);
    expect(() => readSheet(workbook('<row r="1"><c r="A1"><v></v></c></row>'), sheet)).toThrow(/empty value/);
    expect(() => readSheet(workbook('<x:row r="1"></x:row>'), sheet)).toThrow(/prefixed/);
    expect(() => readSheet(workbook(rows, sharedStrings.replace('uniqueCount="4"', 'uniqueCount="5"')), sheet)).toThrow(
      /declares 5/,
    );
  });

  it('refuses a file that is not a zip', () => {
    expect(() => readSheet(Buffer.from('not a zip at all, just text padding it out'), 'Other')).toThrow(/not a zip/);
  });
});
