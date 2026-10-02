// GPU parity in headless Chrome, or in Safari (PLAN §7.2, §8): the dev server serves the parity page, whose
// checks run the GPU against the CPU reference from identical states, the brain alone and then the whole loop,
// and the odour field's stepping.
// This prints the results and the speed benchmark, and with --long the long runs, writes each to the output
// directory, and fails if any check fails. With --shards=N it deals the one-second checks across N pages, each
// Chrome of its own, and merges their reports (src/gpu/parityShards.ts): CI's software GPU runs a world on one CPU
// core, so the shards use the runner's others (DECISIONS.md, 2026-10-02). A sharded run takes no benchmark.
//
//   npm run gpu:parity [-- outDir] [--long] [--safari] [--shards=N]      (default gpu-out, or gpu-out/safari)
//   --shards=N        N pages, each with its share of the one-second checks; 4 on CI (WEBGPU_CI), else 1
//   --long            adds long-run parity: 265 seeds a side for 60 s, about 8 minutes in Chrome on an M5 Max
//                     on track S's fit, 11 to 18 on earlier fits and in Safari, and far too long for CI's
//                     software GPU
//   --safari          runs the page in Safari, on this Mac's GPU, through safaridriver (scripts/safari.ts),
//                     which needs Safari's "Allow remote automation" setting; npm run gpu:parity:safari
//   CHROME_PATH, WEBGPU_CI as in scripts/browser.ts

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { JUMP } from '../../src/gpu/parityCases.ts';
import { mergeShards, type Shard } from '../../src/gpu/parityShards.ts';
import {
  ADAPTER,
  ci,
  closeChrome,
  collectErrors,
  describeAdapter,
  launchChrome,
  serve,
  withTimeout,
} from '../browser.ts';
import { ROOT } from '../data/sources.ts';
import { Safari } from '../safari.ts';

// What the page reports (src/gpu/parity.ts), as far as this prints it.
interface Step {
  label: string;
  voltageShare: number;
  bareShare: number;
  activationShare: number;
  recoveryShare: number;
  noiseShare: number;
  referenceShare: number;
  iterations: { cpu: number; gpu: number };
  pass: boolean;
}
interface Second {
  label: string;
  voltageRms: number;
  activationRms: number;
  referenceRms: number;
  graded: boolean;
  pass: boolean;
}
interface LoopStep extends Step {
  endShares: [number, number];
  centreShares: [number, number, number];
  muscleShare: number;
  thresholdShare: number;
  smellError: number;
  switchSame: boolean;
  touchSame: boolean;
}
interface LoopSecond {
  label: string;
  shares: { voltage: number; activation: number; curvature: number; centroid: number; threshold: number };
  switchSame: boolean;
  touchSame: boolean;
  referenceShare: number;
  referenceSwitchSame: boolean;
  graded: boolean;
  pass: boolean;
}
interface Equivalent {
  difference: number;
  margin: number;
  p: number;
  equivalent: boolean;
}
interface Measures {
  finite: boolean;
  bouts: number;
  speed: number | null;
  frequency: number | null;
  wave: { sd: number; frequency: number };
}
interface Long {
  seeds: number;
  seconds: number;
  cpu: Measures[];
  gpu: Measures[];
  speed: Equivalent | null;
  frequency: Equivalent | null;
  boutless: { cpu: number; gpu: number };
  broken: { cpu: number; gpu: number };
  wave: { sd: Equivalent; frequency: Equivalent };
  spread: { speed: { ratio: number; p: number } | null; frequency: { ratio: number; p: number } | null };
  unconverged: { cpu: number; gpu: number };
  pass: boolean;
}
interface Report {
  shard: Shard;
  timing?: Record<string, number>;
  pass: boolean;
  brainPass: boolean;
  oneSecondPlaces: number;
  shardFailures?: string[];
  loop:
    | {
        api: { name: string; detail: string; pass: boolean }[];
        oneStep: LoopStep[];
        oneSecond: LoopSecond[];
        oneSecondPlaces: number;
        timing?: Record<string, number>;
        pass: boolean;
        seconds: number;
      }
    | { error: string; pass: false };
  field:
    | {
        results: { label: string; share: number; totalShare: number | null; pass: boolean }[];
        api: { name: string; detail: string; pass: boolean }[];
        pass: boolean;
        seconds: number;
      }
    | { error: string; pass: false };
  seconds: number;
  thresholds: {
    oneStep: { voltage: number; activation: number; recovery: number };
    oneSecond: { rms: number };
    wellPosed: number;
    mostIllPosed: number;
  };
  noise: {
    hashes: number;
    hashMismatches: number;
    uniformMismatches: number;
    gaussians: number;
    worstShare: number;
    worstError: number;
    pass: boolean;
  };
  api: { name: string; detail: string; pass: boolean }[];
  oneStep: Step[];
  oneSecond: Second[];
  variant: { lesions: string[]; oneStep: Step; oneSecond: Second };
}
interface Bench {
  dt: number;
  gpu: { stepsPerDispatch: number; milliseconds: number; realTime: number }[];
  loop: { stepsPerDispatch: number; milliseconds: number; realTime: number }[];
  cpuRealTime: number;
  meanIterations: number;
}

const PORT = Number(process.env.PARITY_PORT ?? 5231);
const DRIVER_PORT = Number(process.env.SAFARI_DRIVER_PORT ?? 5232);
const args = process.argv.slice(2);
const long = args.includes('--long');
const safari = args.includes('--safari');
const outDir = resolve(ROOT, args.find((a) => !a.startsWith('--')) ?? (safari ? 'gpu-out/safari' : 'gpu-out'));
for (const a of args) {
  if (a.startsWith('--') && !['--long', '--safari'].includes(a) && !/^--shards=/.test(a)) {
    throw new Error(`unknown option ${a}; the options are --long, --safari and --shards=N`);
  }
}
if (args.filter((a) => !a.startsWith('--')).length > 1) throw new Error('give at most one output directory');
const shardsArg = args.find((a) => a.startsWith('--shards='));
const shards = shardsArg ? Number(shardsArg.slice('--shards='.length)) : ci && !safari && !long ? 4 : 1;
if (!Number.isInteger(shards) || shards < 1 || shards > 16)
  throw new Error('--shards=N takes a whole number from 1 to 16');
if (shards > 1 && (safari || long)) throw new Error('a sharded run is for Chrome alone, without --long');
mkdirSync(outDir, { recursive: true });
// A run without --long leaves the last long runs' results where they are.
for (const file of ['parity.json', 'bench.json', ...(long ? ['long.json'] : [])]) {
  rmSync(join(outDir, file), { force: true });
}

const mark = (pass: boolean): string => (pass ? '✓' : '✗');
const g = (x: number, digits = 3): string =>
  x === 0 ? '0' : Math.abs(x) < 1e-3 ? x.toExponential(2) : x.toFixed(digits);
const stepLine = (r: Step): string =>
  `  ${mark(r.pass)} ${r.label.padEnd(12)} V ${g(r.voltageShare).padStart(9)} (no allowance ${g(r.bareShare).padStart(9)})` +
  `   s ${g(r.activationShare).padStart(9)}   w ${g(r.recoveryShare).padStart(9)}   η ${g(r.noiseShare).padStart(9)}` +
  `   reference V ${g(r.referenceShare).padStart(6)}   ${r.iterations.cpu} / ${r.iterations.gpu}`;
const secondLine = (r: Second): string =>
  `  ${r.graded ? mark(r.pass) : '·'} ${r.label.padEnd(12)} V ${g(r.voltageRms, 5).padStart(9)}   s ` +
  `${g(r.activationRms, 5).padStart(9)}   reference ${g(r.referenceRms, 5).padStart(9)}` +
  (r.graded ? '' : '   not graded');

// The browser the page runs in: what it is, its GPU adapter, a call to one of the page's async globals, the
// errors the page reported, and closing it.
interface Driver {
  name: string;
  adapter: () => Promise<string>;
  call: <T>(global: string) => Promise<T>;
  errors: () => Promise<string[]>;
  close: () => Promise<void>;
}

async function chrome(url: string): Promise<Driver> {
  const browser = await launchChrome(1000, 800);
  try {
    const page = await browser.newPage();
    const errors = collectErrors(page);
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
    return {
      name: `Chrome ${await browser.version()}`,
      adapter: () => describeAdapter(page),
      call: <T>(global: string) =>
        page.evaluate((name) => (globalThis as unknown as Record<string, () => Promise<T>>)[name](), global),
      errors: () => Promise.resolve(errors),
      close: () => closeChrome(browser),
    };
  } catch (e) {
    await closeChrome(browser);
    throw e;
  }
}

async function safariDriver(url: string): Promise<Driver> {
  const session = await Safari.launch(DRIVER_PORT);
  try {
    await session.open(url, '__parity');
    return {
      name: `Safari ${session.version}`,
      adapter: () => session.evaluate<string>(ADAPTER),
      call: <T>(global: string) => session.call<T>(global),
      errors: () => session.errors(),
      close: () => session.close(),
    };
  } catch (e) {
    await session.close();
    throw e;
  }
}

// The speed benchmark of a whole run, which prints and writes its results.
async function benchmark(browser: Driver): Promise<void> {
  const bench = await withTimeout(browser.call<Bench>('__bench'), 120000, 'the benchmark');
  writeFileSync(join(outDir, 'bench.json'), `${JSON.stringify(bench, null, 2)}\n`);
  console.log(`\nspeed of the brain step at ${1000 * bench.dt} ms`);
  for (const r of bench.gpu) {
    console.log(
      `  ${String(r.stepsPerDispatch).padStart(3)} steps a dispatch: ${g(r.milliseconds, 2)} ms, ` +
        `${g(r.realTime, 1)}× real time`,
    );
  }
  console.log(
    `  the CPU reference in the page: ${g(bench.cpuRealTime, 1)}× real time; ${g(bench.meanIterations, 1)} GPU ` +
      'iterations a step',
  );
  console.log('the whole step, brain and loop');
  for (const r of bench.loop) {
    console.log(
      `  ${String(r.stepsPerDispatch).padStart(3)} steps a dispatch: ${g(r.milliseconds, 2)} ms, ` +
        `${g(r.realTime, 1)}× real time`,
    );
  }
}

let drivers: Driver[] = [];
let stopServer = (): void => {};
let failed = true;
let errors: string[] = [];
try {
  stopServer = await serve([], PORT);
  const url = `http://localhost:${PORT}/parity.html`;
  const pages = Array.from({ length: shards }, (_, k) => (shards === 1 ? url : `${url}?shard=${k + 1}/${shards}`));
  if (safari) drivers = [await safariDriver(url)];
  else {
    const launched = await Promise.allSettled(pages.map((page) => chrome(page)));
    drivers = launched.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
    const refused = launched.find((r) => r.status === 'rejected');
    if (refused) throw refused.reason;
  }
  const browser = drivers[0];
  console.log(shards === 1 ? browser.name : `${browser.name}, ${shards} pages each in a Chrome of its own`);
  console.log(`GPU adapter: ${await browser.adapter()}`);
  // CI's software GPU took 462 to 599 s over the checks in September 2026, against a limit of 600 s then, and 621 s
  // whole on 2026-10-01, when the run was first dealt across shards.
  const reports = await Promise.all(
    drivers.map((d, k) =>
      withTimeout(d.call<Report>('__parity'), 900000, shards === 1 ? 'the parity checks' : `shard ${k + 1}'s checks`),
    ),
  );
  // Each shard's own report first, so a merge that refuses them still leaves them to read.
  if (shards > 1) {
    reports.forEach((r, k) =>
      writeFileSync(join(outDir, `parity-shard-${k + 1}.json`), `${JSON.stringify(r, null, 2)}\n`),
    );
  }
  const report = shards === 1 ? reports[0] : mergeShards(reports);
  writeFileSync(join(outDir, 'parity.json'), `${JSON.stringify({ ...report, shards }, null, 2)}\n`);
  const { noise, thresholds } = report;
  console.log(
    `\n${mark(noise.pass)} noise: ${noise.hashes} hashes (${noise.hashMismatches} different), ${noise.gaussians} ` +
      `draws (${noise.uniformMismatches} uniforms different); largest Gaussian error ${g(noise.worstError)}, ` +
      `${g(100 * noise.worstShare, 1)}% of WGSL's bound`,
  );
  console.log('\nthe API');
  for (const r of report.api) console.log(`  ${mark(r.pass)} ${r.name}: ${r.detail}`);
  console.log(
    `\none step: worst errors as shares of their tolerances (|ΔV| ≤ ${thresholds.oneStep.voltage} × max(|V|, 1 mV) ` +
      `plus the noise's allowance, |Δs| ≤ ${thresholds.oneStep.activation}, |Δw| ≤ ${thresholds.oneStep.recovery} × ` +
      "max(|w|, 1), |Δη| within the coloured noise's rounding bound), against the CPU reference at the GPU's " +
      'solver tolerance; ΔV against the reference at its own ' +
      'tolerance is reported, not graded; solver iterations CPU / GPU',
  );
  for (const r of report.oneStep) console.log(stepLine(r));
  console.log(
    `\none second: worst RMS relative error over the samples (tolerance ${thresholds.oneSecond.rms}), the voltages' ` +
      `without the neurons the reference moved more than ${JUMP} mV over the step before, and the CPU ` +
      `reference against itself at the GPU's solver tolerance; a state where that exceeds ${g(thresholds.wellPosed)} ` +
      `of the tolerance is not graded, and more than ${100 * thresholds.mostIllPosed}% not graded fails`,
  );
  for (const r of report.oneSecond) console.log(secondLine(r));
  const { variant } = report;
  console.log(`\nlesioned (${variant.lesions.join(', ')}), no oscillators, no noise, restarting halfway`);
  console.log(stepLine(variant.oneStep));
  console.log(secondLine(variant.oneSecond));
  const { loop } = report;
  if ('error' in loop) {
    console.log(`\n✗ the whole loop's checks stopped: ${loop.error}`);
  } else {
    console.log('\nthe whole loop');
    for (const r of loop.api) console.log(`  ${mark(r.pass)} ${r.name}: ${r.detail}`);
    console.log(
      "\none step: the brain as above, then the rods' centres' velocities ẋ, ẏ, θ̇ (each within 10⁻² of the " +
        "largest), muscles (10⁻⁴), AWC-ON's threshold T (10⁻⁴), the head switch and the touch pulses; the rods' end " +
        'points and the relative error of the odour AWC-ON sensed, C, reported',
    );
    for (const r of loop.oneStep) {
      console.log(
        `${stepLine(r)}   centres ${r.centreShares.map((v) => g(v)).join(' ')} (ends ${r.endShares.map((v) => g(v)).join(' ')})` +
          `   A ${g(r.muscleShare)}   T ${g(r.thresholdShare)} (C ${g(r.smellError)})   switch ` +
          `${r.switchSame ? 'same' : 'DIFFERS'}   touch ${r.touchSame ? 'same' : 'DIFFERS'}`,
      );
    }
    console.log(
      "\none second: shares of the thresholds, the voltages' without the neurons mid-jump, the switch and the touch " +
        'pulses throughout, and the reference against ' +
        `itself; a state where that exceeds ${g(thresholds.wellPosed)} or its switch differs is not graded`,
    );
    for (const r of loop.oneSecond) {
      const s = r.shares;
      console.log(
        `  ${r.graded ? mark(r.pass) : '·'} ${r.label.padEnd(32)} V ${g(s.voltage).padStart(7)}  s ` +
          `${g(s.activation).padStart(9)}  κL ${g(s.curvature).padStart(7)}  centroid ${g(s.centroid).padStart(7)}` +
          `  T ${g(s.threshold).padStart(7)}` +
          `  switch ${r.switchSame ? 'same' : 'DIFFERS'}  touch ${r.touchSame ? 'same' : 'DIFFERS'}` +
          `   reference ${g(r.referenceShare).padStart(7)}` +
          `${r.referenceSwitchSame ? '' : ' (its switch differs)'}${r.graded ? '' : '   not graded'}`,
      );
    }
    console.log(`the loop's checks took ${g(loop.seconds, 1)} s`);
  }
  const { field } = report;
  if ('error' in field) {
    console.log(`\n✗ the odour field's checks stopped: ${field.error}`);
  } else {
    console.log(
      '\nthe odour field: every cell within 10⁻⁵ of the largest concentration after one sub-step and 10⁻⁴ after ' +
        "one second, and the total odour's change over the second within 10⁻⁴ of the CPU's (shares)",
    );
    for (const r of field.api) console.log(`  ${mark(r.pass)} ${r.name}: ${r.detail}`);
    for (const r of field.results) {
      console.log(
        `  ${mark(r.pass)} ${r.label.padEnd(14)} worst cell ${g(r.share).padStart(9)}` +
          (r.totalShare === null ? '' : `   total ${g(r.totalShare).padStart(9)}`),
      );
    }
  }
  console.log(
    `\nthe brain ${report.brainPass ? 'passed' : 'FAILED'}, the loop ${loop.pass ? 'passed' : 'FAILED'}, the field ` +
      `${field.pass ? 'passed' : 'FAILED'}`,
  );
  for (const failure of report.shardFailures ?? []) console.log(`✗ ${failure} failed; see parity-shard-*.json`);
  // Where the time went, by part, in each page: reported, not graded.
  const parts = (t: Record<string, number> | undefined): string =>
    Object.entries(t ?? {})
      .map(([k, v]) => `${k} ${v.toFixed(0)}`)
      .join(', ');
  console.log('\ntime by part (s):');
  reports.forEach((r, k) => {
    const loopTiming = 'error' in r.loop ? undefined : r.loop.timing;
    console.log(`  ${shards === 1 ? 'run' : `shard ${k + 1}`}: brain ${parts(r.timing)}; loop ${parts(loopTiming)}`);
  });
  console.log(
    `parity ${report.pass ? 'passed' : 'FAILED'} in ${g(report.seconds, 1)} s` +
      (shards === 1 ? '' : `, the slowest of ${shards} shards`),
  );

  if (shards === 1) await benchmark(browser);
  else console.log('\nno benchmark: a sharded run shares its cores');
  let longPass = true;
  if (long) {
    const result = await withTimeout(browser.call<Long>('__long'), 3600000, 'the long runs');
    writeFileSync(join(outDir, 'long.json'), `${JSON.stringify(result, null, 2)}\n`);
    const mean = (x: number[]): number => x.reduce((a, b) => a + b, 0) / x.length;
    const line = (pass: boolean, name: string, a: number[], b: number[], e: Equivalent | null): string =>
      e === null
        ? `  ${mark(false)} ${name}: fewer than two runs with a bout on a side`
        : `  ${mark(pass)} ${name}: CPU ${g(mean(a), 4)}, GPU ${g(mean(b), 4)}, difference ${g(e.difference, 4)} ` +
          `within ±${g(e.margin, 4)}? p = ${g(e.p, 4)}`;
    const crawled = (side: Measures[], k: 'speed' | 'frequency'): number[] =>
      side.flatMap((m) => (m[k] === null ? [] : [m[k]]));
    console.log(
      `\nlong runs: ${result.seeds} seeds a side, ${result.seconds} s each; each run's crawl over its forward bouts ` +
        `of 10 s or more, as checkpoint 1 measures it; runs without one, left out: ${result.boutless.cpu} on the ` +
        `CPU, ${result.boutless.gpu} on the GPU; runs whose body left the finite numbers, which fail: ` +
        `${result.broken.cpu} on the CPU, ${result.broken.gpu} on the GPU`,
    );
    for (const k of ['speed', 'frequency'] as const) {
      const e = result[k];
      console.log(line(e?.equivalent ?? false, k, crawled(result.cpu, k), crawled(result.gpu, k), e));
    }
    for (const k of ['sd', 'frequency'] as const) {
      const e = result.wave[k];
      const values = (side: Measures[]): number[] => side.map((m) => m.wave[k]);
      console.log(
        `  reported: the body wave's ${k === 'sd' ? 'SD of κL' : 'frequency'}: CPU ${g(mean(values(result.cpu)), 4)}, ` +
          `GPU ${g(mean(values(result.gpu)), 4)}, difference ${g(e.difference, 4)} within ±${g(e.margin, 4)}? ` +
          `p = ${g(e.p, 4)}`,
      );
    }
    const ratio = (r: { ratio: number; p: number } | null): string =>
      r === null ? '—' : `${g(r.ratio, 3)} (p = ${g(r.p, 3)})`;
    console.log(
      `  reported: the GPU's variance over the CPU's, ${ratio(result.spread.speed)} for the speed and ` +
        `${ratio(result.spread.frequency)} for the frequency; unconverged solves ${result.unconverged.cpu} on the ` +
        `CPU, ${result.unconverged.gpu} on the GPU`,
    );
    longPass = result.pass;
  }
  errors = (await Promise.all(drivers.map((d) => d.errors()))).flatMap((list, k) =>
    shards === 1 ? list : list.map((e) => `shard ${k + 1}: ${e}`),
  );
  if (errors.length > 0) throw new Error('the page reported errors');
  failed = !report.pass || !longPass;
} catch (e) {
  console.error(`✗ ${e instanceof Error ? e.message : String(e)}`);
  for (const error of errors) console.error(`    ${error}`);
} finally {
  await Promise.all(drivers.map((d) => d.close().catch(() => undefined)));
  stopServer();
}
process.exit(failed ? 1 : 0);
