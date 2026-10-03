// Track D0's run (DECISIONS.md, 2026-10-03): the linear analyses of src/validation/trackD0.ts over S's fit, the ten
// primary rewirings at it, a Latin hypercube of 20,000 points of D0's box, and a CMA-ES search of 5,000 evaluations
// on the oscillators-off margin in the band, then the readings the rules declared.
//
//   node scripts/experiments/d0/run.ts [--jobs N] [--resume]
//
// It runs only at a commit. Each sample is appended to harness-out/track-d/d0-samples.jsonl as it comes back, and the
// search's generations to harness-out/track-d/d0-search.jsonl, so --resume takes a stopped run up at the same commit,
// skipping the samples it has and replaying the search's generations. It writes the summary, the readings and the
// samples that decide them to data/track-d/d0.json. About 1.4 s a sample on one core: a few hours on 14 workers.

import { fork, type ChildProcess } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateWormlightData, type WormlightData } from '../../../src/data/schema.ts';
import { nullNetwork, NULLS } from '../../../src/validation/wiringTest.ts';
import { Cmaes } from '../../../src/validation/cmaes.ts';
import {
  analyse,
  classPairs,
  fromUnit,
  hypercubePoint,
  hypercubeRanks,
  PARAMETERS,
  sampleWorld,
  BAND,
  PASS_BAND,
  type Pair,
  type Sample,
} from '../../../src/validation/trackD0.ts';
import { outside, type Values } from '../../../src/validation/calibration.ts';
import { machine } from '../../calibrate/machine.ts';
import { formatJson } from '../../data/render.ts';
import { ROOT } from '../../data/sources.ts';
import { commit } from '../../harness/commit.ts';
import { registryValues } from '../../harness/wiring.ts';
import { writeWhole } from '../trees.ts';

export const D0 = { samples: 20_000, search: { budget: 5000, sigma: 0.3, seed: 1 }, touchAVA: 10 } as const;
const DATA = join(ROOT, 'public/data/wormlight.v1.json');
const OUT = join(ROOT, 'harness-out/track-d');
const SAMPLES = join(OUT, 'd0-samples.jsonl');
const SEARCH = join(OUT, 'd0-search.jsonl');
const RECORD = join(ROOT, 'data/track-d/d0.json');

// A job: a point of the unit box, or S's fit, or a null at S's fit, each with its key.
interface Job {
  key: string;
  unit?: number[];
  rewiring?: number;
  touches: boolean;
  // The oscillators-on condition, which the search's objective doesn't read.
  on: boolean;
}

let cached: { data: WormlightData; pairs: Pair[]; fit: Values; reference: ReturnType<typeof sampleWorld> } | undefined;
function setUp(): NonNullable<typeof cached> {
  if (cached) return cached;
  const data = validateWormlightData(JSON.parse(readFileSync(DATA, 'utf8')));
  const pairs = classPairs(data);
  const fit = { ...registryValues(), headSwitchGain: 0 };
  const reference = sampleWorld(data, fit, new Float64Array(pairs.length).fill(1), pairs);
  cached = { data, pairs, fit, reference };
  return cached;
}

function runJob(job: Job): Sample {
  const { data, pairs, fit, reference } = setUp();
  const ones = new Float64Array(pairs.length).fill(1);
  if (job.unit) {
    const { values, gains } = fromUnit(job.unit, fit);
    return analyse(data, values, gains, pairs, reference, { touches: job.touches, on: job.on });
  }
  return analyse(data, fit, ones, pairs, reference, {
    touches: job.touches,
    on: job.on,
    ...(job.rewiring === undefined ? {} : { base: nullNetwork(data, job.rewiring) }),
  });
}

// Parallel over workers, one job at a time each; results by key.
async function runAll(workers: ChildProcess[], jobs: Job[], done: (key: string, s: Sample) => void): Promise<void> {
  const queue = [...jobs];
  await Promise.all(
    workers.map(
      (worker) =>
        new Promise<void>((resolve, reject) => {
          const onExit = (code: number | null): void => reject(new Error(`a worker exited (${code})`));
          const next = (): void => {
            const job = queue.shift();
            if (!job) {
              worker.off('message', onMessage);
              worker.off('exit', onExit);
              resolve();
              return;
            }
            worker.send(job);
          };
          const onMessage = (m: { key: string; sample?: Sample; error?: string }): void => {
            if (m.error || !m.sample) {
              reject(new Error(`${m.key}: ${m.error ?? 'no sample'}`));
              return;
            }
            done(m.key, m.sample);
            next();
          };
          worker.on('message', onMessage);
          worker.once('exit', onExit);
          next();
        }),
    ),
  );
}

// The readings the rules declared (DECISIONS.md, 2026-10-03), over the samples given, S's fit, the hypercube and the
// search, those that couldn't be read left out.
const largest = (r: Record<string, number>, a: string, b: string): number => Math.max(r[a], r[b]);
export function readings(samples: readonly { key: string; sample: Sample }[]): {
  oscillation: string;
  touch: string;
  posterior: string;
  bodyModesOff: { key: string; frequency: number; margin: number; participation: number }[];
  frontAVA: { key: string; value: number; stable: boolean | null } | null;
  backAVB: { key: string; value: number; stable: boolean | null } | null;
} {
  const read = samples.filter((x) => !x.sample.failed);
  const bodyModesOff = read.flatMap(({ key, sample }) =>
    (sample.off?.live ?? [])
      .filter((m) => m.body)
      .map((m) => ({ key, frequency: m.frequency, margin: m.margin, participation: m.participation ?? 0 })),
  );
  const best = (pick: (s: Sample) => number | null): { key: string; value: number; stable: boolean | null } | null =>
    read.reduce<{ key: string; value: number; stable: boolean | null } | null>((b, { key, sample }) => {
      const v = pick(sample);
      return v !== null && (b === null || v > b.value) ? { key, value: v, stable: sample.off?.stable ?? null } : b;
    }, null);
  const frontAVA = best((s) => (s.touch ? largest(s.touch.front.command, 'AVAL', 'AVAR') : null));
  const backAVB = best((s) => (s.touch ? largest(s.touch.back.command, 'AVBL', 'AVBR') : null));
  return {
    oscillation:
      bodyModesOff.length > 0
        ? "a live mode of the network across the B-types in the crawl's band, with the oscillators off, among D0's samples"
        : "no linear oscillation of the network in the crawl's band among D0's samples",
    touch:
      frontAVA && frontAVA.value >= D0.touchAVA
        ? "a touch can reach the command interneurons among D0's samples"
        : "linearly, a touch can't reach the command interneurons among D0's samples",
    posterior:
      backAVB && backAVB.value >= D0.touchAVA
        ? "a posterior touch can depolarise AVB by 10 mV among D0's samples"
        : "linearly, a posterior touch can't depolarise AVB by 10 mV among D0's samples",
    bodyModesOff: bodyModesOff.sort((x, y) => y.margin - x.margin).slice(0, 20),
    frontAVA,
    backAVB,
  };
}

// Quantiles of a list.
const quantiles = (xs: number[]): Record<string, number> | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const at = (q: number): number => s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))];
  return { min: s[0], median: at(0.5), p95: at(0.95), max: s[s.length - 1] };
};

if (process.argv.includes('--worker')) {
  process.on('disconnect', () => process.exit());
  process.on('message', (job: Job) => {
    try {
      process.send?.({ key: job.key, sample: runJob(job) });
    } catch (e) {
      process.send?.({ key: job.key, error: e instanceof Error ? e.message : String(e) });
    }
  });
} else if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const at = process.argv.indexOf('--jobs');
  const jobs = at >= 0 ? Number(process.argv[at + 1]) : availableParallelism();
  const resume = process.argv.includes('--resume');
  const committed = commit();
  if (/uncommitted/.test(committed)) throw new Error('commit first: D0 records the commit it runs at');
  mkdirSync(OUT, { recursive: true });
  const headFile = join(OUT, 'd0-head.json');
  if (resume) {
    const head = JSON.parse(readFileSync(headFile, 'utf8')) as { commit: string; node: string };
    if (head.commit !== committed || head.node !== process.version) {
      throw new Error(`D0 ran at ${head.commit} on Node ${head.node}; resume it there`);
    }
  } else {
    if (existsSync(SAMPLES) || existsSync(SEARCH)) throw new Error(`${OUT} holds a run: --resume it, or move it aside`);
    writeFileSync(headFile, JSON.stringify({ commit: committed, node: process.version }) + '\n');
  }
  const { pairs } = setUp();
  const dims = PARAMETERS.length + pairs.length;
  const have = new Map<string, Sample>();
  if (existsSync(SAMPLES)) {
    for (const line of readFileSync(SAMPLES, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const { key, sample } = JSON.parse(line) as { key: string; sample: Sample };
        have.set(key, sample);
      } catch {
        // A line cut short by a stop: run that sample again.
      }
    }
  }
  const started = Date.now();
  const self = fileURLToPath(import.meta.url);
  const workers = Array.from({ length: jobs }, () =>
    fork(self, ['--worker'], { execArgv: [...process.execArgv, '--max-old-space-size=2048'] }),
  );
  let count = 0;
  const keep = (key: string, sample: Sample): void => {
    have.set(key, sample);
    appendFileSync(SAMPLES, JSON.stringify({ key, sample }) + '\n');
    if (++count % 100 === 0)
      process.stderr.write(`${count} samples, ${((Date.now() - started) / 1000).toFixed(0)} s\n`);
  };
  try {
    // S's fit, the nulls at it, then the hypercube.
    const ranks = hypercubeRanks(D0.samples, dims);
    const fixed: Job[] = [
      { key: 'fit', touches: true, on: true },
      ...NULLS.map((k) => ({ key: `null-${k}`, rewiring: k, touches: true, on: true })),
      ...Array.from({ length: D0.samples }, (_, j) => ({
        key: `lhs-${j}`,
        unit: hypercubePoint(j, D0.samples, ranks),
        touches: true,
        on: true,
      })),
    ].filter((j) => !have.has(j.key));
    await runAll(workers, fixed, keep);
    // The search: CMA-ES on the oscillators-off margin in the band, from the box's centre, its generations replayed
    // from their record on a resume.
    const cma = new Cmaes({ mean: Array(dims).fill(0.5) as number[], sigma: D0.search.sigma, seed: D0.search.seed });
    const recorded = existsSync(SEARCH)
      ? readFileSync(SEARCH, 'utf8')
          .split('\n')
          .filter((l) => l.trim())
          .map((l) => JSON.parse(l) as { generation: number; values: number[] })
      : [];
    let evaluations = 0;
    while (evaluations < D0.search.budget) {
      const candidates = cma.ask();
      const take = Math.min(candidates.length, D0.search.budget - evaluations);
      const generation = cma.generation;
      const replay = recorded.find((r) => r.generation === generation);
      let values: number[];
      if (replay) values = replay.values;
      else {
        const results = new Map<string, Sample>();
        await runAll(
          workers,
          candidates
            .slice(0, take)
            .map((unit, c) => ({ key: `search-${generation}-${c}`, unit, touches: false, on: false })),
          (key, sample) => {
            results.set(key, sample);
            keep(key, sample);
          },
        );
        values = candidates
          .slice(0, take)
          .map((_, c) => results.get(`search-${generation}-${c}`)?.off?.objective ?? -Infinity);
        appendFileSync(SEARCH, JSON.stringify({ generation, values }) + '\n');
      }
      evaluations += take;
      // CMA-ES minimises: the negated objective, an unreadable sample worst, with the calibration's penalty for a
      // candidate outside the box, which is clipped into it.
      if (take === candidates.length) {
        cma.tell(values.map((v, c) => (Number.isFinite(v) ? -v : 1e9) + outside(candidates[c])));
      }
    }
  } finally {
    for (const worker of workers) worker.kill();
  }
  // The record: the readings, S's fit and the nulls whole, the failures by kind and phase, and the distributions over
  // the hypercube's samples that could be read.
  const all = [...have].map(([key, sample]) => ({ key, sample }));
  const phase = (key: string): string =>
    key === 'fit' ? 'fit' : key.startsWith('null-') ? 'nulls' : key.startsWith('lhs-') ? 'hypercube' : 'search';
  const failed = all.filter((x) => x.sample.failed);
  const failures: Record<string, number> = {};
  for (const x of failed) {
    const k = `${phase(x.key)}, ${x.sample.failure ?? 'unknown'}`;
    failures[k] = (failures[k] ?? 0) + 1;
  }
  const lhs = all.filter((x) => x.key.startsWith('lhs-') && !x.sample.failed);
  const touched = lhs.filter((x) => x.sample.touch);
  const of = (side: 'front' | 'back', a: string, b: string): number[] =>
    touched.map((x) => largest(x.sample.touch![side].command, a, b));
  const share = (f: (s: Sample) => boolean): number => lhs.filter((x) => f(x.sample)).length;
  const depolarised = (xs: number[]): number => xs.filter((v) => v > 0).length;
  const searched = all.filter((x) => x.key.startsWith('search-') && !x.sample.failed);
  const record = {
    what: "track D0's linear analyses, exploratory and never shipped (DECISIONS.md, 2026-10-03)",
    commit: committed,
    date: new Date().toISOString().slice(0, 10),
    machine: machine(),
    jobs,
    band: BAND,
    passBand: PASS_BAND,
    pairs,
    samples: {
      hypercube: all.filter((x) => x.key.startsWith('lhs-')).length,
      search: all.filter((x) => x.key.startsWith('search-')).length,
      read: lhs.length,
    },
    failures,
    failed: failed.slice(0, 20).map((x) => ({ key: x.key, failure: x.sample.failure, why: x.sample.failed })),
    readings: readings(all.filter((x) => !x.key.startsWith('null-'))),
    fit: have.get('fit'),
    nulls: Object.fromEntries(NULLS.map((k) => [`null-${k}`, have.get(`null-${k}`)])),
    hypercube: {
      unstableOff: share((s) => s.off?.stable === false),
      unstableOn: share((s) => s.on?.stable === false),
      liveInBandOff: share((s) => (s.off?.live.length ?? 0) > 0),
      liveInBandOn: share((s) => (s.on?.live.length ?? 0) > 0),
      liveInPassBandOff: share((s) =>
        (s.off?.live ?? []).some((m) => m.frequency >= PASS_BAND[0] && m.frequency <= PASS_BAND[1]),
      ),
      liveInPassBandOn: share((s) =>
        (s.on?.live ?? []).some((m) => m.frequency >= PASS_BAND[0] && m.frequency <= PASS_BAND[1]),
      ),
      bodyModeOff: share((s) => (s.off?.live ?? []).some((m) => m.body)),
      bodyModeOn: share((s) => (s.on?.live ?? []).some((m) => m.body)),
      objectiveOff: quantiles(lhs.map((x) => x.sample.off?.objective ?? -20)),
      // A touch's response over its pulse at each command class, the larger of the pair (mV), and how many samples
      // it depolarised.
      touch: {
        front: {
          AVA: quantiles(of('front', 'AVAL', 'AVAR')),
          AVD: quantiles(of('front', 'AVDL', 'AVDR')),
          AVB: quantiles(of('front', 'AVBL', 'AVBR')),
          PVC: quantiles(of('front', 'PVCL', 'PVCR')),
          depolarisedAVA: depolarised(of('front', 'AVAL', 'AVAR')),
          depolarisedAVD: depolarised(of('front', 'AVDL', 'AVDR')),
        },
        back: {
          AVA: quantiles(of('back', 'AVAL', 'AVAR')),
          AVD: quantiles(of('back', 'AVDL', 'AVDR')),
          AVB: quantiles(of('back', 'AVBL', 'AVBR')),
          PVC: quantiles(of('back', 'PVCL', 'PVCR')),
          depolarisedAVB: depolarised(of('back', 'AVBL', 'AVBR')),
          depolarisedPVC: depolarised(of('back', 'PVCL', 'PVCR')),
        },
        of: touched.length,
      },
    },
    search: {
      evaluations: searched.length,
      best: searched.reduce<{ key: string; objective: number; live: number } | null>((b, x) => {
        const v = x.sample.off?.objective ?? -20;
        return b === null || v > b.objective ? { key: x.key, objective: v, live: x.sample.off?.live.length ?? 0 } : b;
      }, null),
    },
    seconds: Math.round((Date.now() - started) / 1000),
  };
  mkdirSync(dirname(RECORD), { recursive: true });
  writeWhole(RECORD, await formatJson(JSON.stringify(record), RECORD));
  process.stdout.write(`${JSON.stringify(record.readings, null, 2)}\nwrote ${RECORD}\n`);
}
