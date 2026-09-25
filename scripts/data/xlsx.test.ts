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

const workbook = zip({
  'xl/workbook.xml':
    '<workbook xmlns:r="r"><sheets><sheet name="Other" sheetId="1" r:id="rId1"/>' +
    '<sheet name="5. Sign &amp; prediction" sheetId="2" r:id="rId2"/></sheets></workbook>',
  'xl/_rels/workbook.xml.rels':
    '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/>' +
    '<Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>',
  'xl/sharedStrings.xml':
    '<sst><si><t>AWCL</t></si><si><r><t>AI</t></r><r><t xml:space="preserve">YL</t></r></si><si><t>&lt;&amp;&gt;</t></si></sst>',
  'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row r="1"><c r="A1"><v>9</v></c></row></sheetData></worksheet>',
  'xl/worksheets/sheet2.xml':
    '<worksheet><sheetData>' +
    '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="D1" t="s"><v>1</v></c><c r="E1"><v>22</v></c></row>' +
    '<row r="3"><c r="B3" t="inlineStr"><is><t>inline</t></is></c><c r="C3" t="b"><v>1</v></c>' +
    '<c r="D3" t="str"><v>formula</v></c><c r="E3" t="s"><v>2</v></c><c r="F3"/></row>' +
    '</sheetData></worksheet>',
});

describe('readSheet', () => {
  it('reads shared, rich-text and inline strings, numbers and booleans, in their columns', () => {
    const rows = readSheet(workbook, '5. Sign & prediction');
    expect(rows[0]).toEqual(['AWCL', null, null, 'AIYL', 22]);
    expect(rows[1]).toEqual([]);
    expect(rows[2]).toEqual([null, 'inline', true, 'formula', '<&>', null]);
  });

  it('finds a sheet by name, not by position', () => {
    expect(readSheet(workbook, 'Other')).toEqual([[9]]);
  });

  it('names the sheets it has when asked for one it lacks', () => {
    expect(() => readSheet(workbook, 'Missing')).toThrow(/"Other","5. Sign & prediction"/);
  });

  it('refuses a file that is not a zip', () => {
    expect(() => readSheet(Buffer.from('not a zip at all, just text padding it out'), 'Other')).toThrow(/not a zip/);
  });
});
