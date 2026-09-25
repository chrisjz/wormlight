import { describe, expect, it } from 'vitest';
import { parseMorphology } from './nml.ts';

const cell = `
<neuroml>
  <cell id="TEST">
    <morphology id="morphology_TEST">
      <segment id="0" name="Seg0_soma_0">
        <proximal x="3.8" y="-267.95" z="38.95" diameter="2.7"/>
        <distal x="3.8" y="-267.95" z="38.95" diameter="2.7"/>
      </segment>
      <segment id="1" name="Seg1_dendrite_0">
        <parent segment="0"/>
        <proximal x="3.8" y="-268" z="39" diameter="0.5"/>
        <distal x="3.9" y="-349.45" z="40" diameter="0.5"/>
      </segment>
      <segment id="2" name="Seg2_axon_0">
        <parent segment="0"/>
        <distal x="3.7" y="-265.5" z="37" diameter="0.5"/>
      </segment>
      <segmentGroup id="Soma" neuroLexId="sao864921383">
        <member segment="0"/>
      </segmentGroup>
    </morphology>
  </cell>
</neuroml>`;

describe('parseMorphology', () => {
  it('takes the soma from the Soma group and collects every point', () => {
    const morphology = parseMorphology(cell, 'TEST');
    expect(morphology.soma).toEqual([3.8, -267.95, 38.95]);
    expect(morphology.points).toHaveLength(5);
    expect(Math.min(...morphology.points.map(([, y]) => y))).toBe(-349.45);
    expect(Math.max(...morphology.points.map(([, y]) => y))).toBe(-265.5);
  });

  it('refuses a cell with no soma group', () => {
    expect(() => parseMorphology(cell.replace('id="Soma"', 'id="Other"'), 'TEST')).toThrow(/no soma/);
  });

  it('refuses a malformed coordinate', () => {
    expect(() => parseMorphology(cell.replace('y="-265.5"', 'y="nope"'), 'TEST')).toThrow(/bad y/);
  });
});
