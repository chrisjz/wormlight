// The go/no-go experiment tables (DECISIONS.md, 2026-09-26), and the parameter draws they share. Draw i
// takes the same random numbers in every variant, so variants compare on equal terms; relative and global
// neuromuscular drive map them onto their own ranges.

import { hash, uniform } from '../../../src/sim/brain/rng.ts';
import type { KimDraw, KimSetup } from './kim.ts';
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
// to the head, the head forced at 0.3 Hz, oscillators off, drive relative per muscle. The D-types stay,
// cut off from the B-types.
const isolated: Variant = {
  forcedHead: 0.3,
  bMode: 'off',
  aMode: 'off',
  nmj: 'relative',
  keepB: () => false,
  remove: A_TYPES,
  smdReach: 0.3,
};

// The biology-informed combination: A-types resting 20 mV below threshold and without proprioception, AVB
// driving the B-types without their loading it, no B–B gap junctions, SMD confined to the head, drive
// relative per muscle, oscillators off.
const informed: Variant = {
  bMode: 'off',
  aMode: 'off',
  aProprio: false,
  nmj: 'relative',
  smdReach: 0.3,
  avbDrives: true,
  keepB: (kind, row, col) => kind === 'chem' || (!(isB(row) && isB(col)) && !touchesAvb(row, col)),
  aOffset: 20,
};

// Fallback 3 on top of the changes that helped most: a class-level gain on every B-type connection. The
// A-types keep their oscillators.
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
    '+ AVB driving the B-types, unloaded': {
      ...isolated,
      keepB: (kind, row, col) => kind === 'gap' && touchesAvb(row, col),
      avbDrives: true,
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
  // Checkpoint 0's control for the settings that can reach checkpoint 1's partial speed. Silencing cuts
  // every B-type link, so fallback 3's scale no longer matters and one row stands for all three.
  silenced: {
    'fallback 3, silenced': { ...scaled(0.1), silenced: true },
    'informed, head switch driving RMD, silenced': { ...informed, rmd: true, silenced: true },
    'informed, head forced, silenced': { ...informed, forcedHead: 0.3, silenced: true },
  },
};

// Coordinate k of draw i has its own hash, so no two coordinates or draws are correlated.
const coordinate = (seed: number, i: number, k: number): number => uniform(hash(seed, i, k));
const DRAW_SEED = 0x0c;
const KIM_SEED = 0x0c + 1;

const logUniform = (u: number, a: number, b: number): number => Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * u);

// Ranges wide enough to hold every plausible value; relative drive takes its own gain and threshold.
export function draw(i: number, relative: boolean): Draw {
  const u = (k: number): number => coordinate(DRAW_SEED, i, k);
  return {
    gOsc: logUniform(u(0), 0.3, 5),
    tauW: logUniform(u(1), 0.2, 3),
    theta: -30 + 35 * u(2),
    gSw: logUniform(u(3), 20, 400),
    gP: logUniform(u(4), 0.1, 30),
    gNmj: relative ? logUniform(u(5), 2, 40) : logUniform(u(5), 0.2, 5),
    tNmj: relative ? -0.3 + 1.1 * u(6) : 0.5 + 7.5 * u(6),
  };
}

// Kim et al.'s preset pulses (modWorm's presets_input): PLM for forward movement, ALM and AVM for backward.
const PLM = {
  pulses: [{ neurons: ['PLML', 'PLMR'], amplitude: 3000 }],
  halfTime: 1.23,
  width: 0.145,
  direction: 1,
} as const;
const ANTERIOR = {
  pulses: [
    { neurons: ['ALML', 'ALMR'], amplitude: 6800 },
    { neurons: ['AVM'], amplitude: 3000 },
  ],
  halfTime: 2,
  width: 0.25,
  direction: -1,
} as const;

// Each setup, and whether it draws the feedback's gain and delay rather than taking theirs.
export const KIM_SETUPS: Record<string, KimSetup & { sweep: boolean }> = {
  'their mechanism, PLM pulse': { ...PLM, muscles: 'kim', thresholds: 'ni', sweep: false },
  'their mechanism, ALM and AVM pulse': { ...ANTERIOR, muscles: 'kim', thresholds: 'ni', sweep: false },
  'PLM pulse, feedback gain and delay drawn': { ...PLM, muscles: 'kim', thresholds: 'ni', sweep: true },
  'PLM pulse, rest thresholds': { ...PLM, muscles: 'kim', thresholds: 'rest', sweep: false },
  "PLM pulse, Wormlight's muscles": { ...PLM, muscles: 'wormlight', thresholds: 'ni', sweep: false },
};

// Their gain of 1 and delay of 0.6 s unless the setup draws them. The muscle scale is always drawn, since
// Wormlight's neuromuscular map is not theirs.
export function kimDraw(i: number, setup: KimSetup & { sweep: boolean }): KimDraw {
  const u = (k: number): number => coordinate(KIM_SEED, i, k);
  const { sweep, ...fixed } = setup;
  return {
    ...fixed,
    gain: sweep ? logUniform(u(0), 0.1, 10) : 1,
    delay: sweep ? 0.3 + 0.5 * u(1) : 0.6,
    hill: logUniform(u(2), 0.1, 10),
    gNmj: logUniform(u(3), 0.2, 5),
    tNmj: 0.5 + 7.5 * u(4),
  };
}
