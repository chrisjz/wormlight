import { describe, expect, it } from 'vitest';
import { checkExport, type NematodeExport } from './export.ts';

const commit = 'fb6a162f7ef9ed3d701475bce497050fb4ab79ed';

function exported(): NematodeExport {
  return {
    schema: 'wormlight.connectome/1',
    provenance: { nematodeCommit: commit, nematodeDirty: false },
    neurons: [
      { name: 'AWCL', class: 'sensory', transmitters: ['Glu'], ruleSign: 1 },
      { name: 'DD1', class: 'motor', transmitters: ['GABA'], ruleSign: -1 },
      { name: 'AVFL', class: 'interneuron', transmitters: [], ruleSign: null },
    ],
    muscles: [],
    chemical: [],
    gap: [],
    neuromuscular: [],
  };
}

describe('checkExport', () => {
  it('accepts a clean export from the pinned commit', () => {
    expect(checkExport(exported(), commit)).toEqual(exported());
  });

  const broken: [string, (e: NematodeExport) => void, RegExp][] = [
    ['another schema', (e) => (e.schema = 'wormlight.connectome/2'), /schema/],
    ['a dirty tree', (e) => (e.provenance.nematodeDirty = true), /dirty/],
    ['another commit', (e) => (e.provenance.nematodeCommit = '0'.repeat(40)), /not the pinned/],
    ['a rule sign that its identities do not imply', (e) => (e.neurons[1].ruleSign = 1), /DD1: rule sign 1/],
  ];
  it.each(broken)('refuses %s', (_, breakIt, message) => {
    const e = exported();
    breakIt(e);
    expect(() => checkExport(e, commit)).toThrow(message);
  });
});
