// Checkpoint 6, the wiring test (spec §8; PLAN §3.5, §7.4; DECISIONS.md, 2026-10-03): the primary null's ten
// rewirings, each tuned by track S's procedure in a box of its own. A null is another brain on the same neurons, so a
// world takes it as its network, with thresholds at its own rest (PLAN §3.3); every layer outside the brain is the real
// wiring's. Its box takes the rules that set S's: the 1 mV rule for g_sw and g_p on its rest, and θ_osc's floor, the
// first whole mV above its silenced head-switch drive, each over κ_gap,B's bounds; every other bound is the form's,
// the same for every brain.

import type { WormlightData } from '../data/schema.ts';
import { BOUND_RULE_CURVATURE, BOUND_RULE_MV, PARAMS } from '../science/params.ts';
import { passiveLoads } from '../sim/brain/brain.ts';
import { cookNetwork, type Network } from '../sim/brain/network.ts';
import { CONTRAST, contrastData } from '../sim/brain/rewire.ts';
import { partsOf, type Model } from '../sim/trackS.ts';
import { loopParams, World } from '../sim/world.ts';
import { boxOf, provisionalValues, type Box } from './calibration.ts';

// The primary null's rewirings, numbered 1 to 10.
export const NULLS = Array.from({ length: CONTRAST.rewirings }, (_, k) => k + 1);

export function nullNetwork(data: WormlightData, rewiring: number): Network {
  if (!NULLS.includes(rewiring))
    throw new Error(`the primary null has rewirings 1 to ${NULLS.length}, not ${rewiring}`);
  return cookNetwork(contrastData(data, rewiring));
}

// Whether an error is the rest solver's: its solve with activations held didn't converge, or the rectifier's gates
// cycled (src/sim/brain/brain.ts). Any other is a fault, not a brain that can't be built.
export const unsolvable = (e: unknown): boolean =>
  e instanceof Error && /did not converge|gates cycle at rest/.test(e.message);

// What the rules read of a brain, unrounded: g_sw's and g_p's ranges by the 1 mV rule, g_p's divided by the curvature
// at the 95th percentile of real worms', and the highest silenced head-switch drive; and the values of κ_gap,B at
// which its rest couldn't be solved and why, which the rules leave out.
export interface RuleReading {
  headSwitchGain: [number, number];
  proprioceptiveGain: [number, number];
  silencedDrive: number;
  unsolved: { gapGainB: number; why: string }[];
}

// The rules on a brain, the real wiring's without `network`, on a model's whole loop (its offsets and rectifier), at
// each of κ_gap,B's bounds; if its rest can't be solved at either, why at each, and the brain can't be built.
export type Unbuilt = { unbuilt: RuleReading['unsolved'] };
export function ruleReading(data: WormlightData, model: Model, network?: Network): RuleReading | Unbuilt {
  const reach = (targets: number[], loads: Float64Array, w: World, range: [number, number]): void => {
    for (const i of targets) {
      const rest = w.brain.threshold[i] - w.brain.offset[i];
      for (const e of [PARAMS.reversalExcitatory.value, PARAMS.reversalInhibitory.value]) {
        const room = Math.abs(e - rest) - BOUND_RULE_MV;
        range[0] = Math.min(range[0], loads[i] / room);
        range[1] = Math.max(range[1], loads[i] * room);
      }
    }
  };
  const sw: [number, number] = [Infinity, 0];
  const p: [number, number] = [Infinity, 0];
  let silencedDrive = -Infinity;
  const unsolved: RuleReading['unsolved'] = [];
  for (const gapGainB of PARAMS.gapGainB.bounds ?? []) {
    const params = { ...loopParams({ ...provisionalValues('current'), gapGainB }, 'current'), ...partsOf(model) };
    let w: World;
    let silenced: World;
    try {
      w = new World(data, params, network ? { network } : {});
      silenced = new World(data, params, { ...(network ? { network } : {}), silenced: true });
    } catch (e) {
      if (!unsolvable(e)) throw e;
      unsolved.push({ gapGainB, why: (e as Error).message });
      continue;
    }
    const loads = passiveLoads(w.brain.restNetwork(), w.brain.restActivations());
    reach([...w.dorsalSwitch, ...w.ventralSwitch], loads, w, sw);
    reach(
      w.fields.map((f) => f.neuron),
      loads,
      w,
      p,
    );
    silencedDrive = Math.max(silencedDrive, silenced.headDrive());
  }
  if (unsolved.length === (PARAMS.gapGainB.bounds ?? []).length) return { unbuilt: unsolved };
  return {
    headSwitchGain: sw,
    proprioceptiveGain: [p[0] / BOUND_RULE_CURVATURE, p[1] / BOUND_RULE_CURVATURE],
    silencedDrive,
    unsolved,
  };
}

// Rounded outward to one significant figure, as the registry's bounds were.
export function outward([lo, hi]: readonly [number, number]): [number, number] {
  const p = (x: number): number => 10 ** Math.floor(Math.log10(x));
  return [+(Math.floor(lo / p(lo)) * p(lo)).toPrecision(6), +(Math.ceil(hi / p(hi)) * p(hi)).toPrecision(6)];
}

// A brain's box in the conductance form: the rules' bounds where they set them, θ_osc's top and every other bound the
// model's.
export function ruleBox(reading: RuleReading, model: Model): Box {
  const box = boxOf('conductance', model);
  return {
    ...box,
    headSwitchGain: outward(reading.headSwitchGain),
    proprioceptiveGain: outward(reading.proprioceptiveGain),
    oscillatorDriveThreshold: [Math.floor(reading.silencedDrive) + 1, box.oscillatorDriveThreshold[1]],
  };
}

// A wiring's grades for the verdict map: the real wiring's or a null's, with whether it has a fit, its checkpoint 1
// grade (null without a fit), whether it crawls, and, if it does, its grades on checkpoints 2 to 5.
export type Grade = 'pass' | 'partial' | 'fail';
export const LATER = [2, 3, 4, 5] as const;
export type Later = (typeof LATER)[number];
export interface WiringGrades {
  fit: boolean;
  checkpoint1: Grade | null;
  crawls: boolean;
  later: Partial<Record<Later, Grade>>;
}

// A wiring crawls if checkpoint 1 grades it at least partial (PLAN §7.4's crawl gate).
export const crawls = (grade: Grade | null): boolean => grade === 'pass' || grade === 'partial';

// PLAN §7.4's verdict map, with the maintainer's change where the real wiring doesn't pass (DECISIONS.md,
// 2026-10-03): crawling, the wiring matters if the real wiring crawls and at most 2 of the 10 nulls do, there is no
// evidence it does if 5 or more crawl, and it is inconclusive otherwise. Each of checkpoints 2 to 5, among the crawling
// nulls only: with fewer than 5, "insufficient nulls"; where the real wiring doesn't pass, "no evidence that the
// wiring matters (the real wiring doesn't pass)"; otherwise the wiring matters if at most 20% of them pass, there is
// no evidence it does if 50% or more pass, and it is inconclusive between. A null passes a checkpoint if it grades
// pass; partials are counted beside it.
export const VERDICT_MAP = {
  crawling: { matters: 2, noEvidence: 5 },
  later: { least: 5, matters: 0.2, noEvidence: 0.5 },
} as const;
export type Verdict =
  | 'the wiring matters'
  | 'no evidence that the wiring matters'
  | "no evidence that the wiring matters (the real wiring doesn't pass)"
  | 'inconclusive'
  | 'insufficient nulls';
export interface Verdicts {
  crawling: { verdict: Verdict; crawl: number; of: number };
  later: Record<Later, { verdict: Verdict; real: Grade | null; pass: number; partial: number; of: number }>;
}
export function verdicts(real: WiringGrades, nulls: readonly WiringGrades[]): Verdicts {
  const crawling = nulls.filter((n) => n.crawls);
  const c = crawling.length;
  const { crawling: cm, later: lm } = VERDICT_MAP;
  const crawlVerdict: Verdict =
    real.crawls && c <= cm.matters
      ? 'the wiring matters'
      : c >= cm.noEvidence
        ? 'no evidence that the wiring matters'
        : 'inconclusive';
  const later = Object.fromEntries(
    LATER.map((k) => {
      const pass = crawling.filter((n) => n.later[k] === 'pass').length;
      const partial = crawling.filter((n) => n.later[k] === 'partial').length;
      const share = c > 0 ? pass / c : 0;
      const verdict: Verdict =
        c < lm.least
          ? 'insufficient nulls'
          : real.later[k] !== 'pass'
            ? "no evidence that the wiring matters (the real wiring doesn't pass)"
            : share <= lm.matters
              ? 'the wiring matters'
              : share >= lm.noEvidence
                ? 'no evidence that the wiring matters'
                : 'inconclusive';
      return [k, { verdict, real: real.later[k] ?? null, pass, partial, of: c }];
    }),
  ) as Verdicts['later'];
  return { crawling: { verdict: crawlVerdict, crawl: c, of: nulls.length }, later };
}

// The sister project's hop statistic, reported beside the verdict and never graded (nematode's Logbook 071;
// DECISIONS.md, 2026-10-01): how many of the 39 A- and B-type motor neurons sit 1, 2, 3 or more hops from its six food
// sensors, walking each chemical synapse from its presynaptic neuron and each gap junction both ways. A rewiring
// moves only the chemical synapses, as nematode's chemical-only null does. The network holds only the signed chemical
// synapses, where nematode walks the unsigned too, and AVA's rectified junctions are walked both ways, as nematode
// walks every junction; neither changes a count on the real wiring or its rewirings but one, where the rectifier would
// move one motor neuron of rewiring 1 from 2 hops to 3 (DECISIONS.md, 2026-10-08).
export const FOOD_SENSORS = ['ASEL', 'ASER', 'AWCL', 'AWCR', 'AWAL', 'AWAR'] as const;
const HOP_MOTORS = /^(VB|DB|VA|DA)\d+$/;
export interface MotorHops {
  motors: number;
  // atHops[h − 1] motor neurons sit h hops from the nearest food sensor; `unreached` sit at none.
  atHops: number[];
  unreached: number;
}
export function motorHops(network: Network): MotorHops {
  const { names, chemical, gap } = network;
  const index = new Map(names.map((name, i) => [name, i]));
  const next: number[][] = names.map(() => []);
  for (let post = 0; post < names.length; post++) {
    for (let k = chemical.start[post]; k < chemical.start[post + 1]; k++) next[chemical.index[k]].push(post);
    for (let k = gap.start[post]; k < gap.start[post + 1]; k++) next[post].push(gap.index[k]);
  }
  const queue = FOOD_SENSORS.map((name) => {
    const i = index.get(name);
    if (i === undefined) throw new Error(`the network has no ${name}`);
    return i;
  });
  const hops = new Map(queue.map((i) => [i, 0]));
  for (let q = 0; q < queue.length; q++) {
    for (const j of next[queue[q]]) {
      if (!hops.has(j)) {
        hops.set(j, (hops.get(queue[q]) ?? 0) + 1);
        queue.push(j);
      }
    }
  }
  const motors = names.flatMap((name, i) => (HOP_MOTORS.test(name) ? [hops.get(i) ?? -1] : []));
  const farthest = Math.max(0, ...motors);
  return {
    motors: motors.length,
    atHops: Array.from({ length: farthest }, (_, h) => motors.filter((m) => m === h + 1).length),
    unreached: motors.filter((m) => m < 0).length,
  };
}
