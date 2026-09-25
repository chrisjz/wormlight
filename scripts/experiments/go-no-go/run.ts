// Run the go/no-go experiments (DECISIONS.md, 2026-09-26) and print their tables.
//
//   node scripts/experiments/go-no-go/run.ts [fallbacks|forced|ladder|informed|silenced|kim|all]
//     [--draws 48] [--draw i] [--seconds 30] [--jobs N]
//
// Every variant runs the same draws of the calibrated parameters, 30 s each unless --seconds says otherwise,
// in parallel worker processes; --draw runs one draw alone. Speeds are measured after the first 10 s. Raw
// results go to harness-out/go-no-go/. On 18 cores the default set takes about 4 minutes.

import { fork } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateWormlightData } from '../../../src/data/schema.ts';
import { ROOT } from '../../data/sources.ts';
import { runKim } from './kim.ts';
import { runVariant, type Metrics } from './loop.ts';
import { draw, KIM_SETUPS, kimDraw, TABLES } from './variants.ts';

interface Job {
  table: string;
  variant: string;
  index: number;
  seconds: number;
}

interface Result extends Job {
  metrics: Metrics;
}

const DATA = join(ROOT, 'public/data/wormlight.v1.json');

let cached: ReturnType<typeof validateWormlightData> | undefined;

function runJob(job: Job): Metrics {
  const data = (cached ??= validateWormlightData(JSON.parse(readFileSync(DATA, 'utf8'))));
  if (job.table === 'kim') return runKim(data, kimDraw(job.index, KIM_SETUPS[job.variant]), job.seconds);
  const variant = TABLES[job.table][job.variant];
  return runVariant(data, draw(job.index, variant.nmj === 'relative'), variant, job.seconds);
}

if (process.argv.includes('--worker')) {
  process.on('message', (job: Job) => {
    process.send?.({ ...job, metrics: runJob(job) } satisfies Result);
  });
} else {
  const args = process.argv.slice(2);
  const option = (name: string, fallback: number): number => {
    const at = args.indexOf(name);
    return at >= 0 ? Number(args[at + 1]) : fallback;
  };
  const draws = option('--draws', 48);
  const only = option('--draw', -1);
  const seconds = option('--seconds', 30);
  const jobs = option('--jobs', availableParallelism());
  const indices = only >= 0 ? [only] : Array.from({ length: draws }, (_, index) => index);
  const chosen = args.filter((a) => !a.startsWith('--') && !/^\d+$/.test(a));
  const tables = chosen.length === 0 || chosen.includes('all') ? [...Object.keys(TABLES), 'kim'] : chosen;
  const queue: Job[] = tables.flatMap((table) =>
    Object.keys(table === 'kim' ? KIM_SETUPS : TABLES[table]).flatMap((variant) =>
      indices.map((index) => ({ table, variant, index, seconds })),
    ),
  );
  const results: Result[] = [];
  const total = queue.length;
  const self = fileURLToPath(import.meta.url);
  await Promise.all(
    Array.from({ length: Math.min(jobs, total) }, async () => {
      const worker = fork(self, ['--worker']);
      for (let job = queue.shift(); job; job = queue.shift()) {
        const next = job;
        results.push(
          await new Promise<Result>((resolve) => {
            worker.once('message', (r: Result) => resolve(r));
            worker.send(next);
          }),
        );
        if (results.length % 50 === 0) process.stderr.write(`${results.length}/${total}\n`);
      }
      worker.kill();
    }),
  );
  const out = join(ROOT, 'harness-out/go-no-go');
  mkdirSync(out, { recursive: true });
  const suffix = (only >= 0 ? `-draw${only}` : '') + (seconds !== 30 ? `-${seconds}s` : '');
  for (const table of tables) {
    const rows = results.filter((r) => r.table === table);
    writeFileSync(join(out, `${table}${suffix}.jsonl`), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
    const variants = Object.keys(table === 'kim' ? KIM_SETUPS : TABLES[table]);
    const lines = [
      `\n## ${table} (${only >= 0 ? `draw ${only}` : `${draws} draws each`}, ${seconds} s)\n`,
      '| Variant | Best forward speed (L/s) | Draws above 0.06 | Its draw | Its frequency (Hz) | Its mid-body SD of κL |',
      '| --- | --- | --- | --- | --- | --- |',
    ];
    for (const variant of variants) {
      const ok = rows.filter((r) => r.variant === variant && r.metrics.finite);
      const best = ok.reduce((a, b) => (b.metrics.speed > a.metrics.speed ? b : a), ok[0]);
      const m = best.metrics;
      lines.push(
        `| ${variant} | ${m.speed.toFixed(3)} | ${ok.filter((r) => r.metrics.speed > 0.06).length} | ${best.index} | ${m.freq.toFixed(2)} | ${m.sdMid.toFixed(2)} |`,
      );
    }
    process.stdout.write(lines.join('\n') + '\n');
  }
}
