// Run the go/no-go experiments (DECISIONS.md, 2026-09-26) and print their tables.
//
//   node scripts/experiments/go-no-go/run.ts [fallbacks|forced|ladder|informed|silenced|kim|all]
//     [--draws 96] [--draw i] [--seconds 30] [--jobs N]
//
// Every variant runs the same draws of the calibrated parameters, 30 s each unless --seconds says otherwise,
// in parallel worker processes; --draw runs one draw alone. Speeds are measured after the first 10 s. Raw
// results go to harness-out/go-no-go/. On 18 cores the default set takes about 10 minutes.

import { fork, type ChildProcess } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateWormlightData } from '../../../src/data/schema.ts';
import { ROOT } from '../../data/sources.ts';
import { runKim } from './kim.ts';
import { NOT_FINITE, runVariant, type Metrics } from './loop.ts';
import { draw, KIM_SETUPS, kimDraw, TABLES } from './variants.ts';

interface Job {
  table: string;
  variant: string;
  index: number;
  seconds: number;
}

interface Result extends Job {
  metrics: Metrics;
  error?: string;
}

const DATA = join(ROOT, 'public/data/wormlight.v1.json');
const DEFAULT_DRAWS = 96;
const DEFAULT_SECONDS = 30;

let cached: ReturnType<typeof validateWormlightData> | undefined;

function runJob(job: Job): Metrics {
  const data = (cached ??= validateWormlightData(JSON.parse(readFileSync(DATA, 'utf8'))));
  if (job.table === 'kim') return runKim(data, kimDraw(job.index, KIM_SETUPS[job.variant]), job.seconds);
  const variant = TABLES[job.table][job.variant];
  return runVariant(data, draw(job.index, variant.nmj === 'relative'), variant, job.seconds);
}

const variantsOf = (table: string): string[] => Object.keys(table === 'kim' ? KIM_SETUPS : TABLES[table]);

// Send a job to a worker and wait for its result, failing if the worker dies first.
function send(worker: ChildProcess, job: Job): Promise<Result> {
  return new Promise((resolve, reject) => {
    const onExit = (code: number | null): void =>
      reject(new Error(`a worker exited (${code}) during ${JSON.stringify(job)}`));
    worker.once('exit', onExit);
    worker.once('message', (r: Result) => {
      worker.off('exit', onExit);
      resolve(r);
    });
    worker.send(job);
  });
}

if (process.argv.includes('--worker')) {
  process.on('message', (job: Job) => {
    try {
      process.send?.({ ...job, metrics: runJob(job) } satisfies Result);
    } catch (e) {
      process.send?.({ ...job, metrics: NOT_FINITE, error: String(e) } satisfies Result);
    }
  });
} else {
  const args = process.argv.slice(2);
  const options = new Map<string, number>();
  const tables: string[] = [];
  for (let a = 0; a < args.length; a++) {
    if (args[a].startsWith('--')) {
      const value = Number(args[a + 1]);
      if (!Number.isFinite(value)) throw new Error(`${args[a]} needs a number`);
      options.set(args[a], value);
      a++;
    } else tables.push(args[a]);
  }
  const chosen = tables.length === 0 || tables.includes('all') ? [...Object.keys(TABLES), 'kim'] : tables;
  for (const table of chosen) {
    if (table !== 'kim' && !(table in TABLES)) throw new Error(`no table ${table}`);
  }
  const draws = options.get('--draws') ?? DEFAULT_DRAWS;
  const only = options.get('--draw');
  const seconds = options.get('--seconds') ?? DEFAULT_SECONDS;
  const jobs = options.get('--jobs') ?? availableParallelism();
  const indices = only !== undefined ? [only] : Array.from({ length: draws }, (_, index) => index);
  const queue: Job[] = chosen.flatMap((table) =>
    variantsOf(table).flatMap((variant) => indices.map((index) => ({ table, variant, index, seconds }))),
  );
  const results: Result[] = [];
  const total = queue.length;
  const self = fileURLToPath(import.meta.url);
  await Promise.all(
    Array.from({ length: Math.min(jobs, total) }, async () => {
      const worker = fork(self, ['--worker']);
      try {
        for (let job = queue.shift(); job; job = queue.shift()) {
          const result = await send(worker, job);
          if (result.error) {
            process.stderr.write(`${result.table} / ${result.variant} / ${result.index}: ${result.error}\n`);
          }
          results.push(result);
          if (results.length % 50 === 0) process.stderr.write(`${results.length}/${total}\n`);
        }
      } finally {
        worker.kill();
      }
    }),
  );
  const out = join(ROOT, 'harness-out/go-no-go');
  mkdirSync(out, { recursive: true });
  const suffix =
    (only !== undefined ? `-draw${only}` : draws !== DEFAULT_DRAWS ? `-${draws}draws` : '') +
    (seconds !== DEFAULT_SECONDS ? `-${seconds}s` : '');
  for (const table of chosen) {
    const rows = results.filter((r) => r.table === table);
    writeFileSync(join(out, `${table}${suffix}.jsonl`), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
    const lines = [
      `\n## ${table} (${only !== undefined ? `draw ${only}` : `${draws} draws each`}, ${seconds} s)\n`,
      '| Variant | Best forward speed (L/s) | Draws above 0.06 | Its draw | Its frequency (Hz) | Its mid-body SD of κL |',
      '| --- | --- | --- | --- | --- | --- |',
    ];
    for (const variant of variantsOf(table)) {
      const ok = rows.filter((r) => r.variant === variant && r.metrics.finite);
      if (ok.length === 0) {
        lines.push(`| ${variant} | no finite run | | | | |`);
        continue;
      }
      const best = ok.reduce((a, b) => (b.metrics.speed > a.metrics.speed ? b : a));
      const m = best.metrics;
      lines.push(
        `| ${variant} | ${m.speed.toFixed(4)} | ${ok.filter((r) => r.metrics.speed > 0.06).length} | ${best.index} | ${m.freq.toFixed(3)} | ${m.sdMid.toFixed(2)} |`,
      );
    }
    process.stdout.write(lines.join('\n') + '\n');
  }
}
