// GPU parity in headless Chrome (PLAN §7.2, §8): the dev server serves the parity page, whose checks run the
// GPU against the CPU reference from identical states, the brain alone and then the whole loop. This prints the
// results and the speed benchmark, and with --long the long runs, writes each to the output directory, and
// fails if any check fails.
//
//   npm run gpu:parity [-- outDir] [--long]      (default gpu-out)
//   --long            adds long-run parity: 265 seeds a side for 60 s, 11 to 18 minutes on an M5 Max and
//                     far too long for CI's software GPU
//   CHROME_PATH, WEBGPU_CI as in scripts/browser.ts

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Browser } from 'puppeteer-core';
import { closeChrome, collectErrors, describeAdapter, launchChrome, serve, withTimeout } from '../browser.ts';
import { ROOT } from '../data/sources.ts';

// What the page reports (src/gpu/parity.ts), as far as this prints it.
interface Step {
  label: string;
  voltageShare: number;
  bareShare: number;
  activationShare: number;
  recoveryShare: number;
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
  switchSame: boolean;
}
interface LoopSecond {
  label: string;
  shares: { voltage: number; activation: number; curvature: number; centroid: number };
  switchSame: boolean;
  referenceShare: number;
  referenceSwitchSame: boolean;
  graded: boolean;
  pass: boolean;
}
interface Long {
  seeds: number;
  seconds: number;
  cpu: { sd: number; frequency: number }[];
  gpu: { sd: number; frequency: number }[];
  sd: { difference: number; margin: number; p: number; equivalent: boolean };
  frequency: { difference: number; margin: number; p: number; equivalent: boolean };
  spread: { sd: { ratio: number; p: number }; frequency: { ratio: number; p: number } };
  unconverged: { cpu: number; gpu: number };
  pass: boolean;
}
interface Report {
  pass: boolean;
  brainPass: boolean;
  loop:
    | {
        api: { name: string; detail: string; pass: boolean }[];
        oneStep: LoopStep[];
        oneSecond: LoopSecond[];
        pass: boolean;
        seconds: number;
      }
    | { error: string; pass: false };
  seconds: number;
  thresholds: {
    oneStep: { voltage: number; activation: number; recovery: number };
    oneSecond: { rms: number };
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
const args = process.argv.slice(2);
const long = args.includes('--long');
const outDir = resolve(ROOT, args.find((a) => !a.startsWith('--')) ?? 'gpu-out');
mkdirSync(outDir, { recursive: true });
for (const file of ['parity.json', 'bench.json', 'long.json']) rmSync(join(outDir, file), { force: true });

const mark = (pass: boolean): string => (pass ? '✓' : '✗');
const g = (x: number, digits = 3): string =>
  x === 0 ? '0' : Math.abs(x) < 1e-3 ? x.toExponential(2) : x.toFixed(digits);
const stepLine = (r: Step): string =>
  `  ${mark(r.pass)} ${r.label.padEnd(12)} V ${g(r.voltageShare).padStart(9)} (no allowance ${g(r.bareShare).padStart(9)})` +
  `   s ${g(r.activationShare).padStart(9)}   w ${g(r.recoveryShare).padStart(9)}` +
  `   reference V ${g(r.referenceShare).padStart(6)}   ${r.iterations.cpu} / ${r.iterations.gpu}`;
const secondLine = (r: Second): string =>
  `  ${r.graded ? mark(r.pass) : '·'} ${r.label.padEnd(12)} V ${g(r.voltageRms, 5).padStart(9)}   s ` +
  `${g(r.activationRms, 5).padStart(9)}   reference ${g(r.referenceRms, 5).padStart(9)}` +
  (r.graded ? '' : '   not graded');

let browser: Browser | null = null;
let stopServer = (): void => {};
let failed = true;
let errors: string[] = [];
try {
  stopServer = await serve([], PORT);
  browser = await launchChrome(1000, 800);
  console.log(`Chrome ${await browser.version()}`);
  const page = await browser.newPage();
  errors = collectErrors(page);
  await page.goto(`http://localhost:${PORT}/parity.html`, { waitUntil: 'networkidle0', timeout: 60000 });
  console.log(`GPU adapter: ${await describeAdapter(page)}`);
  const report = await withTimeout(
    page.evaluate(() => (globalThis as unknown as { __parity: () => Promise<Report> }).__parity()),
    600000,
    'the parity checks',
  );
  writeFileSync(join(outDir, 'parity.json'), `${JSON.stringify(report, null, 2)}\n`);
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
      "max(|w|, 1)), against the CPU reference at the GPU's solver tolerance; ΔV against the reference at its own " +
      'tolerance is reported, not graded; solver iterations CPU / GPU',
  );
  for (const r of report.oneStep) console.log(stepLine(r));
  console.log(
    `\none second: worst RMS relative error over the samples (tolerance ${thresholds.oneSecond.rms}), and the CPU ` +
      "reference against itself at the GPU's solver tolerance; a state where that exceeds the tolerance is not " +
      `graded, and more than ${100 * thresholds.mostIllPosed}% not graded fails`,
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
        "largest), muscles (10⁻⁴) and the head switch; the rods' end points reported",
    );
    for (const r of loop.oneStep) {
      console.log(
        `${stepLine(r)}   centres ${r.centreShares.map((v) => g(v)).join(' ')} (ends ${r.endShares.map((v) => g(v)).join(' ')})` +
          `   A ${g(r.muscleShare)}   switch ${r.switchSame ? 'same' : 'DIFFERS'}`,
      );
    }
    console.log('\none second: shares of the thresholds and the switch throughout, and the reference against itself');
    for (const r of loop.oneSecond) {
      const s = r.shares;
      console.log(
        `  ${r.graded ? mark(r.pass) : '·'} ${r.label.padEnd(32)} V ${g(s.voltage).padStart(7)}  s ` +
          `${g(s.activation).padStart(9)}  κL ${g(s.curvature).padStart(7)}  centroid ${g(s.centroid).padStart(7)}` +
          `  switch ${r.switchSame ? 'same' : 'DIFFERS'}   reference ${g(r.referenceShare).padStart(7)}` +
          `${r.referenceSwitchSame ? '' : ' (its switch differs)'}${r.graded ? '' : '   not graded'}`,
      );
    }
    console.log(`the loop's checks took ${g(loop.seconds, 1)} s`);
  }
  console.log(`\nthe brain ${report.brainPass ? 'passed' : 'FAILED'}, the loop ${loop.pass ? 'passed' : 'FAILED'}`);
  console.log(`parity ${report.pass ? 'passed' : 'FAILED'} in ${g(report.seconds, 1)} s`);

  const bench = await withTimeout(
    page.evaluate(() => (globalThis as unknown as { __bench: () => Promise<Bench> }).__bench()),
    120000,
    'the benchmark',
  );
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
  let longPass = true;
  if (long) {
    const result = await withTimeout(
      page.evaluate(() => (globalThis as unknown as { __long: () => Promise<Long> }).__long()),
      3600000,
      'the long runs',
    );
    writeFileSync(join(outDir, 'long.json'), `${JSON.stringify(result, null, 2)}\n`);
    const mean = (x: number[]): number => x.reduce((a, b) => a + b, 0) / x.length;
    console.log(`\nlong runs: ${result.seeds} seeds a side, ${result.seconds} s each`);
    for (const k of ['sd', 'frequency'] as const) {
      const e = result[k];
      console.log(
        `  ${mark(e.equivalent)} ${k === 'sd' ? 'SD of κL' : 'frequency'}: CPU ${g(mean(result.cpu.map((w) => w[k])), 4)}, ` +
          `GPU ${g(mean(result.gpu.map((w) => w[k])), 4)}, difference ${g(e.difference, 4)} within ±${g(e.margin, 4)}? ` +
          `p = ${g(e.p, 4)}`,
      );
    }
    console.log(
      `  reported: the GPU's variance over the CPU's, ${g(result.spread.sd.ratio, 3)} for the SD ` +
        `(p = ${g(result.spread.sd.p, 3)}) and ${g(result.spread.frequency.ratio, 3)} for the frequency ` +
        `(p = ${g(result.spread.frequency.p, 3)}); unconverged solves ${result.unconverged.cpu} on the CPU, ` +
        `${result.unconverged.gpu} on the GPU`,
    );
    longPass = result.pass;
  }
  if (errors.length > 0) throw new Error('the page reported errors');
  failed = !report.pass || !longPass;
} catch (e) {
  console.error(`✗ ${e instanceof Error ? e.message : String(e)}`);
  for (const error of errors) console.error(`    ${error}`);
} finally {
  await closeChrome(browser);
  stopServer();
}
process.exit(failed ? 1 : 0);
