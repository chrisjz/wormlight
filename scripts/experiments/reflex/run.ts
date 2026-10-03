// The reflex diagnosis (DECISIONS.md, 2026-10-03): why track S's worm doesn't back up, as the closing record of
// Wormlight's research. Exploratory, never shipped, grading nothing. On S's fit, it reads:
//
// 1. The chain, at rest: the synapse model's constants, each neuron's driving force, and for each stage from the touch
//    receptors to the command interneurons and from them to the motor neurons, the most a stage's synapses could move
//    its target if every presynaptic activation rose to its ceiling, against the target's input conductance with
//    every activation held, the oscillators off.
// 2. The drive: current injected into chosen neurons from 10 s, sized from each one's input conductance at rest to a
//    nominal depolarisation, on seeds 1 to 10 for 60 s: whether the worm backs up when AVA is driven, or the motor
//    circuit itself, with the head switch on and off.
// 3. The efficacy: every chemical synapse's weight multiplied by k, its sign kept and its brain's thresholds at its own
//    rest, on the same seeds: spontaneous behaviour, a front touch at 30 s, each touched run beside its untouched twin,
//    and AVA driven; and, by track D0's linear analysis, how far a touch moves its receptors and AVA at each k. The touch
//    currents are the ×1 brain's at every k, as the model builds them on the real wiring for every brain.
//
//   node scripts/experiments/reflex/run.ts [--jobs N]
//
// It runs only at a commit, takes about 80 s on 6 workers, its default, and writes data/reflex/diagnosis.json.
// The injection lives here, not in the model: each worker wraps the brain's step to add its job's currents after the
// world has set its inputs, restarting the integrator when they switch on, as a touch restarts it.

import { fork } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateWormlightData, type WormlightData } from '../../../src/data/schema.ts';
import { PARAMS } from '../../../src/science/params.ts';
import { Brain, inputConductance } from '../../../src/sim/brain/brain.ts';
import { cookNetwork, type Network } from '../../../src/sim/brain/network.ts';
import { currentParams, World, type LoopParams } from '../../../src/sim/world.ts';
import { MEASURE_FROM, MOTION_SAMPLE, reversals } from '../../../src/validation/motion.ts';
import { runTrial } from '../../../src/validation/trial.ts';
import { analyse, classPairs } from '../../../src/validation/trackD0.ts';
import { machine } from '../../calibrate/machine.ts';
import { formatJson } from '../../data/render.ts';
import { ROOT } from '../../data/sources.ts';
import { commit } from '../../harness/commit.ts';
import { readPostures } from '../../harness/pinned.ts';
import { registryValues } from '../../harness/wiring.ts';
import { writeWhole } from '../trees.ts';

export const REFLEX = {
  seeds: Array.from({ length: 10 }, (_, i) => i + 1),
  seconds: 60,
  // The drive and the efficacy's injection start here; the touch comes at `touch`.
  from: 10,
  touch: 30,
  scales: [1, 3, 10, 30],
  linearScales: [1, 3, 10, 30, 100],
} as const;
const DATA = join(ROOT, 'public/data/wormlight.v1.json');
const RECORD = join(ROOT, 'data/reflex/diagnosis.json');
// Neurons whose mean voltage over the measured time the drive's report gives, less their rest.
const WATCH = ['AVAL', 'AVAR', 'AVBL', 'AVBR', 'VA5', 'DA4', 'VB5', 'DB3'];

// A drive: nominal depolarisations (mV), by neuron or by class; the head switch on or off.
interface Drive {
  label: string;
  targets: Record<string, number>;
  switchOff?: boolean;
}
const A_TYPES = /^(DA|VA)\d+$/;
const B_TYPES = /^(DB|VB)\d+$/;
export const DRIVES: Drive[] = [
  { label: 'None', targets: {} },
  { label: 'AVA +10 mV', targets: { AVAL: 10, AVAR: 10 } },
  { label: 'AVA +20 mV', targets: { AVAL: 20, AVAR: 20 } },
  { label: 'AVA +40 mV', targets: { AVAL: 40, AVAR: 40 } },
  { label: 'AVA, AVD and AVE +20 mV', targets: { AVAL: 20, AVAR: 20, AVDL: 20, AVDR: 20, AVEL: 20, AVER: 20 } },
  { label: 'AVA +40 mV, AVB −40 mV', targets: { AVAL: 40, AVAR: 40, AVBL: -40, AVBR: -40 } },
  { label: 'The A-types +80 mV, the B-types −40 mV', targets: { A: 80, B: -40 } },
  { label: 'Head switch off: none', targets: {}, switchOff: true },
  {
    label: 'Head switch off: AVA +40 mV, AVB −40 mV',
    targets: { AVAL: 40, AVAR: 40, AVBL: -40, AVBR: -40 },
    switchOff: true,
  },
  { label: 'Head switch off: the A-types +80 mV, the B-types −40 mV', targets: { A: 80, B: -40 }, switchOff: true },
];

interface Job {
  key: string;
  seed: number;
  drive?: number;
  scale?: number;
  touch?: boolean;
}
interface Outcome {
  key: string;
  forward: number;
  backward: number;
  reversals: number;
  meanVelocity: number;
  // Whether any backward sample came within the 2 s after the touch's time, touched or not: a run and its untouched twin
  // are the same until the touch.
  window: boolean;
  shift?: number[];
}

let state:
  { data: WormlightData; postures: number[][]; params: LoopParams; networks: Map<number, Network> } | undefined;
// The job's currents, which the wrapped step adds; and the watched neurons' running sums.
let plan: { idx: number[]; amps: number[] } = { idx: [], amps: [] };
let sums = new Float64Array(WATCH.length);
let samples = 0;
if (process.argv.includes('--worker')) {
  // eslint-disable-next-line @typescript-eslint/unbound-method -- called with the brain as `this` below
  const step = Brain.prototype.step;
  Brain.prototype.step = function (this: Brain & { injectionSteps?: number }, dt: number): void {
    const n = (this.injectionSteps = (this.injectionSteps ?? 0) + 1);
    const t = n * dt;
    if (t >= REFLEX.from && plan.idx.length > 0) {
      if (t - dt < REFLEX.from) this.restart();
      plan.idx.forEach((i, k) => (this.input[i] += plan.amps[k]));
    }
    if (t >= REFLEX.from) {
      WATCH.forEach((nm, k) => (sums[k] += this.voltage[this.network.names.indexOf(nm)] - restOf(this, nm)));
      samples++;
    }
    step.call(this, dt);
  };
}
const restOf = (brain: Brain, name: string): number => {
  const i = brain.network.names.indexOf(name);
  return brain.threshold[i] - brain.offset[i];
};

function setUp(): NonNullable<typeof state> {
  state ??= {
    data: validateWormlightData(JSON.parse(readFileSync(DATA, 'utf8'))),
    postures: [],
    params: currentParams(),
    networks: new Map(),
  };
  return state;
}
const scaled = (data: WormlightData, k: number, cache: Map<number, Network>): Network => {
  const known = cache.get(k);
  if (known) return known;
  const base = cookNetwork(data);
  const network = { ...base, chemical: { ...base.chemical, weight: base.chemical.weight.map((w) => w * k) } };
  cache.set(k, network);
  return network;
};

// Each target's current: its nominal depolarisation times its input conductance at rest with every activation held.
function currents(
  data: WormlightData,
  params: LoopParams,
  network: Network | undefined,
  targets: Record<string, number>,
) {
  const world = new World(data, params, network ? { network } : {});
  const names = world.brain.network.names;
  const held = world.brain.restNetwork();
  const act = world.brain.restActivations();
  const idx: number[] = [];
  const amps: number[] = [];
  for (const [target, dv] of Object.entries(targets)) {
    const members =
      target === 'A'
        ? names.filter((n) => A_TYPES.test(n))
        : target === 'B'
          ? names.filter((n) => B_TYPES.test(n))
          : [target];
    for (const name of members) {
      const i = names.indexOf(name);
      idx.push(i);
      amps.push(inputConductance(held, act, i) * dv);
    }
  }
  return { idx, amps };
}

async function runJob(job: Job): Promise<Outcome> {
  const s = setUp();
  if (s.postures.length === 0) s.postures = await readPostures();
  const drive = job.drive === undefined ? undefined : DRIVES[job.drive];
  const params = drive?.switchOff ? { ...s.params, switchGain: 0 } : s.params;
  const network = job.scale === undefined || job.scale === 1 ? undefined : scaled(s.data, job.scale, s.networks);
  const targets =
    drive?.targets ?? (job.scale !== undefined && job.key.includes('drive') ? { AVAL: 20, AVAR: 20 } : {});
  plan = currents(s.data, params, network, targets);
  sums = new Float64Array(WATCH.length);
  samples = 0;
  const r = runTrial(s.data, {
    seed: job.seed,
    seconds: REFLEX.seconds,
    params,
    postures: s.postures,
    ...(network ? { network } : {}),
    ...(job.touch ? { touches: [{ time: REFLEX.touch, s: 0.2 }] } : {}),
  });
  plan = { idx: [], amps: [] };
  const v = r.velocity;
  const after = Math.round((REFLEX.touch - MEASURE_FROM) / MOTION_SAMPLE);
  return {
    key: job.key,
    forward: v.filter((x) => x > 0.01).length / v.length,
    backward: v.filter((x) => x < -0.01).length / v.length,
    reversals: reversals(v).length,
    meanVelocity: v.reduce((a, b) => a + b, 0) / v.length,
    window: v.slice(after, after + Math.round(2 / MOTION_SAMPLE)).some((x) => x < -0.01),
    shift: Array.from(sums, (x) => x / Math.max(samples, 1)),
  };
}

// The chain at rest: the synapse model's constants and each stage's ceiling.
function chain(data: WormlightData): Record<string, unknown> {
  const world = new World(data, currentParams());
  const net = world.brain.network;
  const names = [...net.names];
  const held = world.brain.restNetwork();
  const act = world.brain.restActivations();
  const at = (n: string): number => names.indexOf(n);
  const rest = (i: number): number => world.brain.threshold[i] - world.brain.offset[i];
  const ceiling = net.rise / (net.rise + net.decay);
  const stage = (pre: string[], post: string) => {
    const j = at(post);
    let synapses = 0;
    let most = 0;
    for (let e = net.chemical.start[j]; e < net.chemical.start[j + 1]; e++) {
      const p = net.chemical.index[e];
      if (!pre.includes(names[p])) continue;
      synapses += net.chemical.weight[e];
      most += net.chemical.weight[e] * (ceiling - act[p]) * (net.chemical.reversal[e] - rest(j));
    }
    let gap = 0;
    for (let e = held.gap.start[j]; e < held.gap.start[j + 1]; e++) gap += held.gap.weight[e];
    const input = inputConductance(held, act, j);
    return { pre, post, synapses, input, gap, ceilingShift: most / input };
  };
  const front = ['ALML', 'ALMR', 'AVM'];
  const back = ['PLML', 'PLMR', 'PVM'];
  return {
    rise: net.rise,
    decay: net.decay,
    slope: net.slope,
    activationAtRest: act[at('AVAL')],
    activationCeiling: ceiling,
    reversal: { excitatory: PARAMS.reversalExcitatory.value, inhibitory: PARAMS.reversalInhibitory.value },
    rest: Object.fromEntries(
      ['ALML', 'AVDL', 'AVAL', 'AVBL', 'PVCL', 'VA5', 'DA4', 'VB5', 'DB3'].map((n) => [n, rest(at(n))]),
    ),
    stages: [
      ...['AVDL', 'AVDR', 'PVCL', 'PVCR', 'AVBL', 'AVAL'].map((t) => stage(front, t)),
      ...['AVAL', 'AVAR', 'AVDL', 'PVCL'].map((t) => stage(back, t)),
      stage(['AVDL', 'AVDR'], 'AVAL'),
      ...['VA5', 'DA4', 'VA8'].map((t) => stage(['AVAL', 'AVAR'], t)),
      stage(['AVBL', 'AVBR'], 'VB5'),
    ],
  };
}

// D0's linear touch response with every chemical synapse scaled by k.
function linear(data: WormlightData): Record<string, unknown>[] {
  const pairs = classPairs(data);
  const ones = new Float64Array(pairs.length).fill(1);
  const fit = { ...registryValues(), headSwitchGain: 0 };
  const cache = new Map<number, Network>();
  const reference = new World(data, currentParams());
  return REFLEX.linearScales.map((k) => {
    const s = analyse(data, fit, ones, pairs, reference, { on: false, base: scaled(data, k, cache) });
    const c = s.touch;
    const frontAVA = c ? Math.max(c.front.command.AVAL, c.front.command.AVAR) : null;
    const frontAVM = c ? c.front.receptors.AVM : null;
    return {
      scale: k,
      failed: s.failed ?? null,
      stable: s.off?.stable ?? null,
      frontAVA,
      frontAVD: c ? Math.max(c.front.command.AVDL, c.front.command.AVDR) : null,
      backAVB: c ? Math.max(c.back.command.AVBL, c.back.command.AVBR) : null,
      // The receptors' own response to the same currents, and AVA's per mV of AVM's, which the currents' fixed size
      // doesn't confound.
      frontReceptors: c ? { ALML: c.front.receptors.ALML, ALMR: c.front.receptors.ALMR, AVM: frontAVM } : null,
      backReceptors: c ? { PLML: c.back.receptors.PLML, PLMR: c.back.receptors.PLMR } : null,
      avaPerAVM: frontAVA !== null && frontAVM ? frontAVA / frontAVM : null,
    };
  });
}

if (process.argv.includes('--worker')) {
  process.on('disconnect', () => process.exit());
  process.on('message', (job: Job) => {
    runJob(job).then(
      (outcome) => process.send?.({ outcome }),
      (e: unknown) => process.send?.({ key: job.key, error: e instanceof Error ? e.message : String(e) }),
    );
  });
} else if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const at = process.argv.indexOf('--jobs');
  const jobs = at >= 0 ? Number(process.argv[at + 1]) : 6;
  const committed = commit();
  if (/uncommitted/.test(committed)) throw new Error('commit first: the diagnosis records the commit it runs at');
  const started = Date.now();
  const data = validateWormlightData(JSON.parse(readFileSync(DATA, 'utf8')));
  await readPostures();
  const queue: Job[] = [
    ...DRIVES.flatMap((_, drive) => REFLEX.seeds.map((seed) => ({ key: `drive ${drive} ${seed}`, seed, drive }))),
    ...REFLEX.scales.flatMap((scale) =>
      REFLEX.seeds.flatMap((seed) => [
        { key: `scale ${scale} spontaneous ${seed}`, seed, scale },
        { key: `scale ${scale} touch ${seed}`, seed, scale, touch: true },
        { key: `scale ${scale} drive ${seed}`, seed, scale },
      ]),
    ),
  ];
  const outcomes = new Map<string, Outcome>();
  const self = fileURLToPath(import.meta.url);
  const workers = Array.from({ length: Math.min(jobs, queue.length) }, () =>
    fork(self, ['--worker'], { execArgv: [...process.execArgv, '--max-old-space-size=2048'] }),
  );
  try {
    await Promise.all(
      workers.map(
        (worker) =>
          new Promise<void>((resolve, reject) => {
            const next = (): void => {
              const job = queue.shift();
              if (job) worker.send(job);
              else resolve();
            };
            worker.on('message', (m: { outcome?: Outcome; key?: string; error?: string }) => {
              if (!m.outcome) {
                reject(new Error(`${m.key}: ${m.error ?? 'no outcome'}`));
                return;
              }
              outcomes.set(m.outcome.key, m.outcome);
              next();
            });
            next();
          }),
      ),
    );
  } finally {
    for (const worker of workers) worker.kill();
  }
  const pool = (prefix: string) => {
    const xs = REFLEX.seeds.map((seed) => outcomes.get(`${prefix} ${seed}`) as Outcome);
    const mean = (f: (o: Outcome) => number): number => xs.reduce((a, o) => a + f(o), 0) / xs.length;
    return {
      forward: mean((o) => o.forward),
      backward: mean((o) => o.backward),
      reversals: xs.reduce((a, o) => a + o.reversals, 0),
      meanVelocity: mean((o) => o.meanVelocity),
      window: xs.filter((o) => o.window).length,
      shift: Object.fromEntries(WATCH.map((n, k) => [n, mean((o) => (o.shift ?? [])[k] ?? 0)])),
    };
  };
  const record = {
    what: 'the reflex diagnosis, exploratory and never shipped (DECISIONS.md, 2026-10-03)',
    commit: committed,
    date: new Date().toISOString().slice(0, 10),
    machine: machine(),
    jobs,
    settings: REFLEX,
    chain: chain(data),
    drives: DRIVES.map((d, k) => ({
      label: d.label,
      targets: d.targets,
      switchOff: d.switchOff ?? false,
      ...pool(`drive ${k}`),
    })),
    efficacy: REFLEX.scales.map((scale) => ({
      scale,
      spontaneous: pool(`scale ${scale} spontaneous`),
      touch: pool(`scale ${scale} touch`),
      // Seeds whose touched run went backward in the window while its untouched twin didn't.
      touchedOnly: REFLEX.seeds.filter(
        (seed) =>
          outcomes.get(`scale ${scale} touch ${seed}`)?.window &&
          !outcomes.get(`scale ${scale} spontaneous ${seed}`)?.window,
      ).length,
      drive: pool(`scale ${scale} drive`),
    })),
    linear: linear(data),
    seconds: Math.round((Date.now() - started) / 1000),
  };
  mkdirSync(dirname(RECORD), { recursive: true });
  writeWhole(RECORD, await formatJson(JSON.stringify(record), RECORD));
  const pct = (x: number): string => `${(100 * x).toFixed(0)}%`;
  for (const d of record.drives) {
    process.stdout.write(
      `${d.label.padEnd(58)} forward ${pct(d.forward)}, backward ${pct(d.backward)}, reversals ${d.reversals}, v ${d.meanVelocity.toFixed(4)}\n`,
    );
  }
  for (const e of record.efficacy) {
    process.stdout.write(
      `×${String(e.scale).padEnd(3)} spontaneous: reversals ${e.spontaneous.reversals}, v ${e.spontaneous.meanVelocity.toFixed(4)}; touch: backward within 2 s ${e.touch.window} of ${REFLEX.seeds.length}, untouched twins ${e.spontaneous.window}, touched only ${e.touchedOnly}; AVA driven: reversals ${e.drive.reversals}, backward ${pct(e.drive.backward)}\n`,
    );
  }
  for (const l of record.linear) process.stdout.write(`linear: ${JSON.stringify(l)}\n`);
  process.stdout.write(`${record.seconds} s; wrote ${RECORD}\n`);
}
