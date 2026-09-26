// The GPU parity page (PLAN §8), served by the dev server only: `npm run dev`, then /parity.html. It runs the
// parity checks and the speed benchmark on this browser's GPU and shows the results, which is how the
// Safari check is made; headless Chrome reads the same results through window.__parity() and
// window.__bench() (scripts/gpu/parity.ts).

import '../style.css';
import { validateWormlightData, type WormlightData } from '../data/schema.ts';
import { runBench, runParity, type BenchReport, type ParityReport } from './parity.ts';
import { ONE_SECOND, ONE_STEP } from './parityCases.ts';
import { probeWebGpu } from './support.ts';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text?: string,
  className?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

const root = document.getElementById('app') as HTMLElement;
const status = el('p', 'Checking for WebGPU…', 'status-body');
root.replaceChildren(el('h1', 'GPU parity', 'title'), status);

const fixed = (x: number, digits = 2): string => (x === 0 ? '0' : x < 1e-3 ? x.toExponential(1) : x.toFixed(digits));

function table(head: string[], rows: string[][]): HTMLTableElement {
  const t = el('table', undefined, 'parity-table');
  const tr = el('tr');
  for (const h of head) tr.append(el('th', h));
  t.append(tr);
  for (const row of rows) {
    const r = el('tr');
    for (const cell of row) r.append(el('td', cell));
    t.append(r);
  }
  return t;
}

function showParity(report: ParityReport): void {
  const verdict = (pass: boolean): string => (pass ? 'pass' : 'FAIL');
  const { noise } = report;
  root.append(
    el('h2', `Parity: ${verdict(report.pass)}`, 'status-title'),
    el(
      'p',
      `${report.adapter}; ${report.neurons} neurons; ${report.oneStep.length} states; ${fixed(report.seconds, 1)} s.`,
      'status-body',
    ),
    el('h3', `Noise: ${verdict(noise.pass)}`),
    el(
      'p',
      `${noise.hashes} hashes, ${noise.hashMismatches} different; ${noise.gaussians} draws, ${noise.uniformMismatches} ` +
        `uniforms different, the largest Gaussian error ${fixed(noise.worstError)} (${fixed(100 * noise.worstShare, 1)}% ` +
        "of WGSL's bound).",
    ),
    el('h3', `One step: |ΔV| ≤ ${ONE_STEP.voltage} × max(|V|, 1 mV), |Δs| ≤ ${ONE_STEP.activation}`),
    table(
      ['State', 'Worst ΔV / tolerance', 'Worst Δs / tolerance', 'Iterations CPU / GPU', ''],
      report.oneStep.map((r) => [
        r.label,
        fixed(r.voltageShare, 3),
        fixed(r.activationShare, 3),
        `${r.cpuIterations} / ${r.gpu.iterations}`,
        verdict(r.pass),
      ]),
    ),
    el('h3', `One second: RMS relative error ≤ ${ONE_SECOND.rms}`),
    el(
      'p',
      "A state is graded only if the CPU reference, rerun at the GPU's solver tolerance, stays within the " +
        'threshold of itself.',
    ),
    table(
      ['State', 'Voltage RMS', 'Activation RMS', 'Reference against itself', ''],
      report.oneSecond.map((r) => [
        r.label,
        fixed(r.voltageRms, 4),
        fixed(r.activationRms, 4),
        fixed(r.referenceRms, 4),
        r.graded ? verdict(r.pass) : 'not graded',
      ]),
    ),
  );
}

function showBench(report: BenchReport): void {
  root.append(
    el('h2', 'Speed', 'status-title'),
    table(
      ['Steps per dispatch', 'ms per dispatch', '× real time'],
      report.gpu.map((r) => [String(r.stepsPerDispatch), fixed(r.milliseconds), fixed(r.realTime, 1)]),
    ),
    el(
      'p',
      `The CPU reference's brain here: ${fixed(report.cpuRealTime, 1)}× real time. ${fixed(report.meanIterations, 1)} ` +
        'solver iterations a step on the GPU.',
    ),
  );
}

async function start(): Promise<{ parity: Promise<ParityReport>; bench: Promise<BenchReport> }> {
  const support = await probeWebGpu(navigator.gpu);
  if (support.kind !== 'ready') throw new Error(`no WebGPU: ${support.kind}`);
  const { device, adapter } = support;
  device.addEventListener('uncapturederror', (e) => console.error(e.error.message));
  status.textContent = 'Running the checks…';
  const response = await fetch(`${import.meta.env.BASE_URL}data/wormlight.v1.json`);
  const data: WormlightData = validateWormlightData(await response.json());
  const parity = runParity(device, adapter, data);
  const bench = parity.then(() => runBench(device, adapter, data));
  void parity.then(showParity);
  void bench.then(showBench).then(() => status.remove());
  return { parity, bench };
}

const started = start();
started.catch((e: unknown) => {
  status.textContent = e instanceof Error ? e.message : String(e);
  console.error(status.textContent);
});
const hooks = window as unknown as { __parity: () => Promise<ParityReport>; __bench: () => Promise<BenchReport> };
hooks.__parity = () => started.then((s) => s.parity);
hooks.__bench = () => started.then((s) => s.bench);
