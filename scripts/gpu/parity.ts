// GPU parity in headless Chrome (PLAN §7.2, §8): the dev server serves the parity page, whose checks run the
// GPU brain against the CPU reference from identical states. This prints the results and the speed
// benchmark, writes both to the output directory, and fails if any check fails.
//
//   npm run gpu:parity [-- outDir]      (default gpu-out)
//   CHROME_PATH, WEBGPU_CI as in scripts/browser.ts

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Browser } from 'puppeteer-core';
import { closeChrome, collectErrors, describeAdapter, launchChrome, serve, withTimeout } from '../browser.ts';
import { ROOT } from '../data/sources.ts';

// What the page reports (src/gpu/parity.ts), as far as this prints it.
interface Report {
  pass: boolean;
  seconds: number;
  noise: {
    hashes: number;
    hashMismatches: number;
    uniformMismatches: number;
    gaussians: number;
    worstShare: number;
    worstError: number;
    pass: boolean;
  };
  oneStep: {
    label: string;
    voltageShare: number;
    activationShare: number;
    cpuIterations: number;
    gpu: { iterations: number };
    pass: boolean;
  }[];
  oneSecond: {
    label: string;
    voltageRms: number;
    activationRms: number;
    referenceRms: number;
    graded: boolean;
    pass: boolean;
  }[];
}
interface Bench {
  gpu: { stepsPerDispatch: number; milliseconds: number; realTime: number }[];
  cpuRealTime: number;
  meanIterations: number;
}

const PORT = Number(process.env.PARITY_PORT ?? 5231);
const outDir = resolve(ROOT, process.argv[2] ?? 'gpu-out');
mkdirSync(outDir, { recursive: true });

const mark = (pass: boolean): string => (pass ? '✓' : '✗');
const g = (x: number, digits = 3): string =>
  x === 0 ? '0' : Math.abs(x) < 1e-3 ? x.toExponential(2) : x.toFixed(digits);

let browser: Browser | null = null;
let stopServer = (): void => {};
let failed = true;
try {
  stopServer = await serve([], PORT);
  browser = await launchChrome(1000, 800);
  console.log(`Chrome ${await browser.version()}`);
  const page = await browser.newPage();
  const errors = collectErrors(page);
  await page.goto(`http://localhost:${PORT}/parity.html`, { waitUntil: 'networkidle0', timeout: 60000 });
  console.log(`GPU adapter: ${await describeAdapter(page)}`);
  const report = await withTimeout(
    page.evaluate(() => (globalThis as unknown as { __parity: () => Promise<Report> }).__parity()),
    600000,
    'the parity checks',
  );
  writeFileSync(join(outDir, 'parity.json'), `${JSON.stringify(report, null, 2)}\n`);
  const { noise } = report;
  console.log(
    `\n${mark(noise.pass)} noise: ${noise.hashes} hashes (${noise.hashMismatches} different), ${noise.gaussians} ` +
      `draws (${noise.uniformMismatches} uniforms different); largest Gaussian error ${g(noise.worstError)}, ` +
      `${g(100 * noise.worstShare, 1)}% of WGSL's bound`,
  );
  console.log('\none step: worst |ΔV| and |Δs| as shares of their tolerances; solver iterations CPU / GPU');
  for (const r of report.oneStep) {
    console.log(
      `  ${mark(r.pass)} ${r.label.padEnd(12)} V ${g(r.voltageShare).padStart(9)}   s ${g(r.activationShare).padStart(9)}` +
        `   ${r.cpuIterations} / ${r.gpu.iterations}`,
    );
  }
  console.log(
    '\none second: worst RMS relative error over ten samples (tolerance 0.01), and the CPU reference against ' +
      "itself at the GPU's solver tolerance; a state where that exceeds 0.01 is not graded",
  );
  for (const r of report.oneSecond) {
    console.log(
      `  ${r.graded ? mark(r.pass) : '·'} ${r.label.padEnd(12)} V ${g(r.voltageRms, 5).padStart(9)}   s ` +
        `${g(r.activationRms, 5).padStart(9)}   reference ${g(r.referenceRms, 5).padStart(9)}` +
        (r.graded ? '' : '   not graded'),
    );
  }
  console.log(`\nparity ${report.pass ? 'passed' : 'FAILED'} in ${g(report.seconds, 1)} s`);

  const bench = await withTimeout(
    page.evaluate(() => (globalThis as unknown as { __bench: () => Promise<Bench> }).__bench()),
    120000,
    'the benchmark',
  );
  writeFileSync(join(outDir, 'bench.json'), `${JSON.stringify(bench, null, 2)}\n`);
  console.log('\nspeed of the brain step at 2.5 ms');
  for (const r of bench.gpu) {
    console.log(
      `  ${String(r.stepsPerDispatch).padStart(3)} steps a dispatch: ${g(r.milliseconds, 2)} ms, ${g(r.realTime, 1)}× real time`,
    );
  }
  console.log(
    `  the CPU reference in the page: ${g(bench.cpuRealTime, 1)}× real time; ${g(bench.meanIterations, 1)} GPU iterations a step`,
  );
  if (errors.length > 0) throw new Error(`the page reported errors: ${errors.join('; ')}`);
  failed = !report.pass;
} catch (e) {
  console.error(`✗ ${e instanceof Error ? e.message : String(e)}`);
} finally {
  await closeChrome(browser);
  stopServer();
}
process.exit(failed ? 1 : 0);
