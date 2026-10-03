// Checkpoint 6's preview (DECISIONS.md, 2026-10-03), an exploration graded by nothing: the primary null's ten
// rewirings run untuned on track S's fitted values, by checkpoint 1's protocol on seeds 4001 to 4020, not the crawl
// gate's seeds 1 to 20, beside the real wiring on the same seeds. Each is graded by checkpoint 1's grading only to
// describe it. It runs before any null is tuned, under rules already set; anything the build settles after it is marked
// as set after it.
//
//   node scripts/experiments/null-preview/run.ts [--jobs N]
//
// It writes data/checkpoint-6/preview.json, committed, and prints a table. About 220 trials of 120 s: a few minutes on
// 6 workers, which it takes by default.

import { fork } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateWormlightData, type WormlightData } from '../../../src/data/schema.ts';
import type { Network } from '../../../src/sim/brain/network.ts';
import { currentParams } from '../../../src/sim/world.ts';
import { checkpoint1 } from '../../../src/validation/checkpoints.ts';
import { runTrial, type TrialRecord } from '../../../src/validation/trial.ts';
import { nullNetwork, NULLS } from '../../../src/validation/wiringTest.ts';
import { formatJson } from '../../data/render.ts';
import { ROOT } from '../../data/sources.ts';
import { commit } from '../../harness/commit.ts';
import { readPinned, readPostures } from '../../harness/pinned.ts';
import { writeWhole } from '../trees.ts';

export const PREVIEW_SEEDS = Array.from({ length: 20 }, (_, i) => 4001 + i);
const DATA = join(ROOT, 'public/data/wormlight.v1.json');
const RECORD = join(ROOT, 'data/checkpoint-6/preview.json');

interface Job {
  rewiring: number | null;
  seed: number;
}

let cached: { data: WormlightData; postures: number[][]; networks: Map<number, Network> } | undefined;
async function trial(job: Job): Promise<TrialRecord> {
  cached ??= {
    data: validateWormlightData(JSON.parse(readFileSync(DATA, 'utf8'))),
    postures: await readPostures(),
    networks: new Map(),
  };
  const { data, postures, networks } = cached;
  let network: Network | undefined;
  if (job.rewiring !== null) {
    network = networks.get(job.rewiring) ?? nullNetwork(data, job.rewiring);
    networks.set(job.rewiring, network);
  }
  return runTrial(data, {
    seed: job.seed,
    seconds: 120,
    params: currentParams(),
    postures,
    ...(network ? { network } : {}),
  });
}

if (process.argv.includes('--worker')) {
  process.on('disconnect', () => process.exit());
  process.on('message', (job: Job) => {
    trial(job).then(
      (record) => process.send?.({ job, record }),
      (e: unknown) => process.send?.({ job, error: String(e) }),
    );
  });
} else if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const at = process.argv.indexOf('--jobs');
  const jobs = at >= 0 ? Number(process.argv[at + 1]) : 6;
  if (!(Number.isInteger(jobs) && jobs >= 1))
    throw new Error('usage: node scripts/experiments/null-preview/run.ts [--jobs N]');
  const committed = commit();
  await readPostures();
  const basis = await readPinned('eigenworms');
  const queue: Job[] = [null, ...NULLS].flatMap((rewiring) => PREVIEW_SEEDS.map((seed) => ({ rewiring, seed })));
  const results = new Map<string, TrialRecord>();
  const key = (j: Job): string => `${j.rewiring ?? 'real'} ${j.seed}`;
  const started = Date.now();
  const self = fileURLToPath(import.meta.url);
  await new Promise<void>((resolve, reject) => {
    let next = 0;
    let done = 0;
    const workers = Array.from({ length: Math.min(jobs, queue.length) }, () =>
      fork(self, ['--worker'], { execArgv: [...process.execArgv, '--max-old-space-size=2048'] }),
    );
    const give = (w: (typeof workers)[number]): void => {
      if (next < queue.length) w.send(queue[next++]);
    };
    for (const w of workers) {
      w.on('message', (m: { job: Job; record?: TrialRecord; error?: string }) => {
        if (m.error || !m.record) {
          for (const x of workers) x.kill();
          reject(new Error(`${key(m.job)}: ${m.error ?? 'no record'}`));
          return;
        }
        results.set(key(m.job), m.record);
        if (++done === queue.length) {
          for (const x of workers) x.kill();
          resolve();
        } else give(w);
      });
      give(w);
    }
  });
  const graded = [null, ...NULLS].map((rewiring) => {
    const records = PREVIEW_SEEDS.map((seed) => results.get(key({ rewiring, seed })) as TrialRecord);
    const g = checkpoint1(records, basis);
    const samples = records.flatMap((r) => r.velocity);
    return {
      brain: rewiring === null ? 'the real wiring' : `rewiring ${rewiring}`,
      grade: g.grade,
      clauses: g.clauses.map((c) => ({ name: c.name, value: c.value, grade: c.grade })),
      forwardShare: samples.filter((v) => v > 0.01).length / samples.length,
      meanVelocity: samples.reduce((a, b) => a + b, 0) / samples.length,
      finite: records.every((r) => r.finite),
      unconverged: records.reduce((n, r) => n + r.unconverged, 0),
    };
  });
  const record = {
    what: "checkpoint 6's preview, untuned, graded by nothing (DECISIONS.md, 2026-10-03)",
    commit: committed,
    date: new Date().toISOString().slice(0, 10),
    node: process.version,
    seeds: PREVIEW_SEEDS,
    params: currentParams(),
    seconds: Math.round((Date.now() - started) / 1000),
    brains: graded,
  };
  mkdirSync(dirname(RECORD), { recursive: true });
  writeWhole(RECORD, await formatJson(JSON.stringify(record), RECORD));
  for (const b of graded) {
    process.stdout.write(
      `${b.brain.padEnd(16)} ${b.grade.padEnd(8)} forward ${(100 * b.forwardShare).toFixed(0)}%, mean velocity ${b.meanVelocity.toFixed(4)}; ${b.clauses.map((c) => `${c.name} ${c.value === null ? '—' : c.value.toFixed(3)} ${c.grade}`).join('; ')}\n`,
    );
  }
  process.stdout.write(`${queue.length} trials in ${record.seconds} s on ${jobs} workers; wrote ${RECORD}\n`);
}
