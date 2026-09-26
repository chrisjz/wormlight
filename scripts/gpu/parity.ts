// GPU parity in headless Chrome (PLAN §7.2, §8): the dev server serves the parity page, whose checks run the
// GPU brain against the CPU reference from identical states. This prints the results and the speed
// benchmark, writes both to the output directory, and fails if any check fails.
//
//   npm run gpu:parity [-- outDir]      (default gpu-out)
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
interface Report {
  pass: boolean;
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
  cpuRealTime: number;
  meanIterations: number;
}

const PORT = Number(process.env.PARITY_PORT ?? 5231);
const outDir = resolve(ROOT, process.argv[2] ?? 'gpu-out');
mkdirSync(outDir, { recursive: true });
for (const file of ['parity.json', 'bench.json']) rmSync(join(outDir, file), { force: true });

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
  console.log(`\nparity ${report.pass ? 'passed' : 'FAILED'} in ${g(report.seconds, 1)} s`);

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
  if (errors.length > 0) throw new Error('the page reported errors');
  failed = !report.pass;
} catch (e) {
  console.error(`✗ ${e instanceof Error ? e.message : String(e)}`);
  for (const error of errors) console.error(`    ${error}`);
} finally {
  await closeChrome(browser);
  stopServer();
}
process.exit(failed ? 1 : 0);
