// The go/no-go experiment tables (DECISIONS.md, 2026-09-26), and the parameter draws they share. Draw i
// is the same for every variant, so variants compare on equal terms.

import type { KimDraw } from './kim.ts';
import type { Draw, Variant } from './loop.ts';

const A_TYPES = ['VA1', 'VA2', 'VA3', 'VA4', 'VA5', 'VA6', 'VA7', 'VA8', 'VA9', 'VA10', 'VA11', 'VA12'].concat([
  'DA1',
  'DA2',
  'DA3',
  'DA4',
  'DA5',
  'DA6',
  'DA7',
  'DA8',
  'DA9',
]);
const isB = (name: string): boolean => /^(VB|DB)\d/.test(name);
const touchesAvb = (row: string, col: string): boolean => row.startsWith('AVB') || col.startsWith('AVB');

// The B-type proprioceptive chain alone: B-types cut from every other neuron, A-types removed, SMD confined
// to the head, the head forced at 0.3 Hz, oscillators off, drive relative per muscle.
const isolated: Variant = {
  forcedHead: 0.3,
  bMode: 'off',
  aMode: 'off',
  nmj: 'relative',
  keepB: () => false,
  remove: A_TYPES,
  smdReach: 0.3,
};

// The biology-informed combination: A-types resting 20 mV below threshold, AVB driving the B-types one
// way, no B–B gap junctions, SMD confined to the head, drive relative per muscle, oscillators off.
const informed: Variant = {
  bMode: 'off',
  aMode: 'off',
  aProprio: false,
  nmj: 'relative',
  smdReach: 0.3,
  avbOneWay: true,
  keepB: (kind, row, col) => kind === 'chem' || (!(isB(row) && isB(col)) && !touchesAvb(row, col)),
  aOffset: 20,
};

// Fallback 3 on top of the changes that helped most: a class-level gain on every B-type connection.
const scaled = (scaleB: number): Variant => ({ aProprio: false, nmj: 'relative', rmd: true, bMode: 'off', scaleB });

export const TABLES: Record<string, Record<string, Variant>> = {
  fallbacks: {
    'the plan as merged': {},
    'fallback 1: delay 80 ms': { delay: 0.08 },
    'fallback 1: delay 300 ms': { delay: 0.3 },
    'fallback 1: delay 550 ms': { delay: 0.55 },
    'fallback 2: bistable B-types': { bMode: 'bistable' },
    'no A-type proprioception': { aProprio: false },
    'drive relative per muscle': { nmj: 'relative' },
    'both of those': { aProprio: false, nmj: 'relative' },
    'both, and bistable B-types': { aProprio: false, nmj: 'relative', bMode: 'bistable' },
    'both, and delay 300 ms': { aProprio: false, nmj: 'relative', delay: 0.3 },
    'both, and the switch drives RMD': { aProprio: false, nmj: 'relative', rmd: true },
    'fallback 3: B-type links × 0.3': scaled(0.3),
    'fallback 3: B-type links × 0.1': scaled(0.1),
    'fallback 3: B-type links × 0': scaled(0),
  },
  forced: {
    'head forced': { forcedHead: 0.3, aProprio: false, nmj: 'relative' },
    'head forced, oscillators off': { forcedHead: 0.3, aProprio: false, nmj: 'relative', bMode: 'off', aMode: 'off' },
    'head forced, all gap junctions × 0.1': {
      forcedHead: 0.3,
      aProprio: false,
      nmj: 'relative',
      bMode: 'off',
      aMode: 'off',
      gapScale: 0.1,
    },
    'head forced, no gap junctions': {
      forcedHead: 0.3,
      aProprio: false,
      nmj: 'relative',
      bMode: 'off',
      aMode: 'off',
      gapScale: 0,
    },
  },
  ladder: {
    'the B-type chain alone': isolated,
    '+ AVB–B gap junctions': { ...isolated, keepB: (kind, row, col) => kind === 'gap' && touchesAvb(row, col) },
    '+ AVB–B one way only': {
      ...isolated,
      keepB: (kind, row, col) => kind === 'gap' && touchesAvb(row, col),
      avbOneWay: true,
    },
    '+ B–B gap junctions': { ...isolated, keepB: (kind, row, col) => kind === 'gap' && isB(row) && isB(col) },
    '+ all B-type gap junctions': { ...isolated, keepB: (kind) => kind === 'gap' },
    '+ all B-type chemical synapses': { ...isolated, keepB: (kind) => kind === 'chem' },
    '+ A-types (no A-type proprioception)': { ...isolated, remove: [], aProprio: false },
    "+ SMD's full reach": { ...isolated, smdReach: undefined },
    '+ FitzHugh–Nagumo oscillators': { ...isolated, bMode: 'fhn', aMode: 'fhn' },
    '+ one neuromuscular threshold': { ...isolated, nmj: 'global' },
  },
  informed: {
    'informed, head forced': { ...informed, forcedHead: 0.3 },
    'informed, head switch': informed,
    'informed, head switch driving RMD': { ...informed, rmd: true },
  },
  // Checkpoint 0's control for the settings above that reached checkpoint 1's partial speed.
  silenced: {
    'fallback 3: B-type links × 0.1, silenced': { ...scaled(0.1), silenced: true },
    'fallback 3: B-type links × 0, silenced': { ...scaled(0), silenced: true },
    'informed, head switch driving RMD, silenced': { ...informed, rmd: true, silenced: true },
  },
};

// A deterministic generator for draw i.
function generator(i: number): () => number {
  let seed = (i + 1) * 7919 + 17;
  return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
}

const logUniform = (random: () => number, a: number, b: number): number =>
  Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * random());

// Ranges wide enough to hold every plausible value; relative drive takes its own gain and threshold.
export function draw(i: number, relative: boolean): Draw {
  const random = generator(i);
  return {
    gOsc: logUniform(random, 0.3, 5),
    tauW: logUniform(random, 0.2, 3),
    theta: -30 + 35 * random(),
    gSw: logUniform(random, 20, 400),
    gP: logUniform(random, 0.1, 30),
    gNmj: relative ? logUniform(random, 2, 40) : logUniform(random, 0.2, 5),
    tNmj: relative ? -0.3 + 1.1 * random() : 0.5 + 7.5 * random(),
  };
}

export const KIM_SETUPS: Record<string, Pick<KimDraw, 'stimulus' | 'muscles' | 'thresholds'>> = {
  "Kim's mechanism, PLM pulse": { stimulus: ['PLML', 'PLMR'], muscles: 'kim', thresholds: 'ni' },
  'with rest thresholds': { stimulus: ['PLML', 'PLMR'], muscles: 'kim', thresholds: 'rest' },
  "with Wormlight's muscles": { stimulus: ['PLML', 'PLMR'], muscles: 'wormlight', thresholds: 'ni' },
  'ALM and AVM pulse': { stimulus: ['ALML', 'ALMR', 'AVM'], muscles: 'kim', thresholds: 'ni' },
};

export function kimDraw(i: number, setup: Pick<KimDraw, 'stimulus' | 'muscles' | 'thresholds'>): KimDraw {
  const random = generator(i);
  return {
    ...setup,
    alpha: (random() < 0.5 ? -1 : 1) * logUniform(random, 0.01, 10),
    delay: [0.3, 0.5, 0.6, 0.8][Math.floor(random() * 4)],
    pulse: logUniform(random, 5, 200),
    muscleScale: logUniform(random, 0.001, 1),
    gNmj: logUniform(random, 0.2, 5),
    tNmj: 0.5 + 8 * random(),
  };
}
