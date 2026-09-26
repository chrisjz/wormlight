// The GPU parity page (PLAN §8), served by the dev server only: `npm run dev`, then /parity.html. It runs the
// parity checks and the speed benchmark on this browser's GPU and shows the results, which is how the
// Safari check is made; headless Chrome reads the same results through window.__parity() and
// window.__bench() (scripts/gpu/parity.ts).

import '../style.css';
import { validateWormlightData, type WormlightData } from '../data/schema.ts';
import { runBench, runParity, type BenchReport, type ParityReport, type StepResult } from './parity.ts';
import { describeGpuSupport, probeWebGpu } from './support.ts';

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

const fixed = (x: number, digits = 2): string =>
  x === 0 ? '0' : Math.abs(x) < 1e-3 ? x.toExponential(1) : x.toFixed(digits);
const verdict = (pass: boolean): string => (pass ? 'pass' : 'FAIL');

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

const stepRow = (r: StepResult): string[] => [
  r.label,
  fixed(r.voltageShare, 3),
  fixed(r.bareShare, 3),
  fixed(r.activationShare, 3),
  fixed(r.recoveryShare, 3),
  fixed(r.referenceShare, 3),
  `${r.iterations.cpu} / ${r.iterations.gpu}`,
  verdict(r.pass),
];
const STEP_HEAD = ['State', 'ΔV', 'ΔV, no allowance', 'Δs', 'Δw', 'ΔV, reference', 'Iterations', ''];

function showParity(report: ParityReport): void {
  const { noise, thresholds, variant } = report;
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
    el('h3', 'The API'),
    table(
      ['Check', 'What', ''],
      report.api.map((r) => [r.name, r.detail, verdict(r.pass)]),
    ),
    el(
      'h3',
      `One step: |ΔV| ≤ ${thresholds.oneStep.voltage} × max(|V|, 1 mV) plus the noise's allowance, ` +
        `|Δs| ≤ ${thresholds.oneStep.activation}, |Δw| ≤ ${thresholds.oneStep.recovery} × max(|w|, 1)`,
    ),
    el(
      'p',
      "Each worst error as a share of its tolerance, against the CPU reference solved at the GPU's tolerance. " +
        'The column against the reference at its own tolerance is reported, not graded.',
    ),
    table(STEP_HEAD, report.oneStep.map(stepRow)),
    el('h3', `One second: RMS relative error ≤ ${thresholds.oneSecond.rms}`),
    el(
      'p',
      "A state is graded only if the CPU reference, rerun at the GPU's solver tolerance, stays within the " +
        `threshold of itself; the check fails if more than ${100 * thresholds.mostIllPosed}% of states are not graded.`,
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
    el('h3', `Lesioned (${variant.lesions.join(', ')}), no oscillators, no noise, restarting halfway`),
    table(STEP_HEAD, [stepRow(variant.oneStep)]),
    table(
      ['One second', 'Voltage RMS', 'Activation RMS', 'Reference against itself', ''],
      [
        [
          variant.oneSecond.label,
          fixed(variant.oneSecond.voltageRms, 4),
          fixed(variant.oneSecond.activationRms, 4),
          fixed(variant.oneSecond.referenceRms, 4),
          variant.oneSecond.graded ? verdict(variant.oneSecond.pass) : 'not graded: FAIL',
        ],
      ],
    ),
  );
}

function showBench(report: BenchReport): void {
  root.append(
    el('h2', `Speed at ${1000 * report.dt} ms steps`, 'status-title'),
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

// A failure is shown on the page once and reported to the harness as a console error.
let failed = false;
function fail(e: unknown): void {
  status.remove();
  if (failed) return;
  failed = true;
  const message = e instanceof Error ? e.message : String(e);
  root.append(el('p', `The checks stopped: ${message}`, 'status-body'));
  console.error(message);
}

async function start(): Promise<{ parity: Promise<ParityReport>; bench: Promise<BenchReport> }> {
  const support = await probeWebGpu(navigator.gpu);
  if (support.kind !== 'ready') {
    const { title, body } = describeGpuSupport(support);
    throw new Error(`${title}. ${body}`);
  }
  const { device, adapter } = support;
  device.addEventListener('uncapturederror', (e) => console.error(e.error.message));
  void device.lost.then((info) => {
    if (info.reason !== 'destroyed') fail(new Error(`the GPU was lost: ${info.message || info.reason}`));
  });
  status.textContent = 'Running the checks…';
  const response = await fetch(`${import.meta.env.BASE_URL}data/wormlight.v1.json`);
  if (!response.ok) throw new Error(`the connectome could not be loaded: the server answered ${response.status}`);
  const data: WormlightData = validateWormlightData(await response.json());
  const parity = runParity(device, adapter, data);
  const bench = parity.then(() => runBench(device, adapter, data));
  parity.then(showParity, fail);
  bench.then(showBench, fail).finally(() => status.remove());
  return { parity, bench };
}

const started = start();
started.catch(fail);
const hooks = window as unknown as { __parity: () => Promise<ParityReport>; __bench: () => Promise<BenchReport> };
hooks.__parity = () => started.then((s) => s.parity);
hooks.__bench = () => started.then((s) => s.bench);
