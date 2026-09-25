import { describe, expect, it } from 'vitest';
import { SCHEMA, validateWormlightData, type WormlightData } from './schema';

function valid(): WormlightData {
  const position = { s: 0.1, lateralUm: 3.8, dorsalUm: 39, source: 'c302' as const };
  return {
    meta: {
      schema: SCHEMA,
      signCitations: { expression: 'fenyves2020', rule: 'wang2024', receptor: 'richmond1999' },
      muscleSpacing: 'even',
      sources: [{ id: 'nematode-export', sha256: '0'.repeat(64) }],
    },
    neurons: [
      {
        name: 'AWCL',
        class: 'sensory',
        transmitters: ['Glu'],
        position,
        sensing: { kind: 'tip', s: 0 },
        oscillator: null,
      },
      {
        name: 'AIYL',
        class: 'interneuron',
        transmitters: ['ACh'],
        position,
        sensing: { kind: 'none' },
        oscillator: null,
      },
      { name: 'DA9', class: 'motor', transmitters: ['ACh'], position, sensing: { kind: 'none' }, oscillator: 'A' },
    ],
    muscles: [{ name: 'dBWML24', quadrant: 'DL', index: 24, s0: 0.9583, s1: 1 }],
    chemical: [
      { pre: 'AWCL', post: 'AIYL', sections: 22, sign: -1, signSource: 'physiology', citation: 'chalasani2007' },
      { pre: 'AIYL', post: 'AWCL', sections: 1, sign: 0, signSource: 'none' },
    ],
    gap: [{ a: 'AIYL', b: 'AWCL', sections: 2 }],
    neuromuscular: [{ pre: 'DA9', muscle: 'dBWML24', sections: 4, sign: 1, signSource: 'receptor' }],
  };
}

describe('validateWormlightData', () => {
  it('accepts a well-formed file', () => {
    expect(validateWormlightData(valid())).toEqual(valid());
  });

  const broken: [string, (d: WormlightData) => void, RegExp][] = [
    ['a wrong schema', (d) => ((d.meta as { schema: string }).schema = 'wormlight/0'), /schema/],
    ['a repeated neuron', (d) => d.neurons.push({ ...d.neurons[0] }), /repeats AWCL/],
    ['a position off the body', (d) => (d.neurons[0].position.s = 1.2), /position\.s/],
    ['a backwards field', (d) => (d.neurons[1].sensing = { kind: 'field', s0: 0.5, s1: 0.4 }), /backwards/],
    ['a connection to an unknown neuron', (d) => (d.chemical[0].post = 'XYZ'), /unknown neurons/],
    ['a sign with no source', (d) => (d.chemical[1].sign = 1), /sign 1 from none/],
    ['a physiology sign with no citation', (d) => delete d.chemical[0].citation, /cite/],
    ['a gap junction out of order', (d) => (d.gap[0] = { a: 'AWCL', b: 'AIYL', sections: 2 }), /canonical/],
    ['a synapse onto an unknown muscle', (d) => (d.neuromuscular[0].muscle = 'pm1'), /unknown neuron or muscle/],
    ['a zero section count', (d) => (d.gap[0].sections = 0), /positive count/],
  ];
  it.each(broken)('refuses %s', (_, breakIt, message) => {
    const data = valid();
    breakIt(data);
    expect(() => validateWormlightData(data)).toThrow(message);
  });
});
