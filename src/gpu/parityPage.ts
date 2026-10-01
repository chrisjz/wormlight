// The GPU parity page (PLAN §8), served by the dev server only: `npm run dev`, then /parity.html. It runs the
// parity checks, the brain's, the whole loop's and the odour field's, and the speed benchmark on this browser's
// GPU and shows the results, which is how the Safari check is made by hand (npm run gpu:parity:safari makes it
// from a script); /parity.html?long adds long-run parity, which takes 11 to 18 minutes on an M5 Max. Headless
// Chrome reads the same results through window.__parity(), window.__bench() and window.__long()
// (scripts/gpu/parity.ts).

import '../style.css';
import { validateWormlightData, type WormlightData } from '../data/schema.ts';
import {
  runLongParity,
  runLoopBench,
  runLoopParity,
  type LongReport,
  type LoopReport,
  type LoopSpeed,
} from './loopParity.ts';
import { runFieldParity, type FieldReport } from './fieldParity.ts';
import { runBench, runParity, type BenchReport, type ParityReport, type StepResult } from './parity.ts';
import { parseShard, type Shard } from './parityShards.ts';
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
  fixed(r.noiseShare, 3),
  fixed(r.referenceShare, 3),
  `${r.iterations.cpu} / ${r.iterations.gpu}`,
  verdict(r.pass),
];
const STEP_HEAD = ['State', 'ΔV', 'ΔV, no allowance', 'Δs', 'Δw', 'Δη', 'ΔV, reference', 'Iterations', ''];

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
        `|Δs| ≤ ${thresholds.oneStep.activation}, |Δw| ≤ ${thresholds.oneStep.recovery} × max(|w|, 1), ` +
        "|Δη| within the coloured noise's rounding bound",
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
      "A state is graded only if the CPU reference, rerun at the GPU's solver tolerance, stays within " +
        `${fixed(thresholds.wellPosed, 3)} of the threshold of itself; the check fails if more than ` +
        `${100 * thresholds.mostIllPosed}% of states are not graded.`,
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

type FullReport = ParityReport & {
  // The share of the one-second checks this page ran (DECISIONS.md, 2026-10-01): the whole run unless its query
  // names a shard, as CI's runner does.
  shard: Shard;
  loop: LoopReport | { error: string; pass: false };
  field: FieldReport | { error: string; pass: false };
  brainPass: boolean;
};
type FullBench = BenchReport & { loop: LoopSpeed[] };

function showField(report: FieldReport | { error: string }): void {
  if ('error' in report) {
    root.append(el('h3', 'The odour field: FAIL'), el('p', `The field's checks stopped: ${report.error}`));
    return;
  }
  root.append(
    el('h3', `The odour field: ${verdict(report.pass)}`),
    el(
      'p',
      "From the app's steady lawn field with a second lawn just dropped at the dish's centre: every cell within " +
        "10⁻⁵ of the field's largest concentration after one sub-step and 10⁻⁴ after one second, and the change " +
        "in the total odour over the second within 10⁻⁴ of the CPU's. Shares of those tolerances.",
    ),
    table(
      ['Check', 'What', ''],
      report.api.map((r) => [r.name, r.detail, verdict(r.pass)]),
    ),
    table(
      ['After', 'Worst cell', 'Total odour', ''],
      report.results.map((r) => [
        r.label,
        fixed(r.share, 3),
        r.totalShare === null ? '–' : fixed(r.totalShare, 3),
        verdict(r.pass),
      ]),
    ),
  );
}

function showLoop(report: LoopReport | { error: string }): void {
  if ('error' in report) {
    root.append(el('h3', 'The whole loop: FAIL'), el('p', `The loop's checks stopped: ${report.error}`));
    return;
  }
  root.append(
    el('h3', `The whole loop: ${verdict(report.pass)}`),
    table(
      ['Check', 'What', ''],
      report.api.map((r) => [r.name, r.detail, verdict(r.pass)]),
    ),
    el(
      'p',
      "One step: the brain as above, each rod's centre's velocity within 10⁻² of the largest (x, y and θ), each " +
        "muscle within 10⁻⁴, AWC-ON's threshold T within 10⁻⁴ of itself (or of 0.01 µM), the same head switch and " +
        "touch pulses; the rods' end points and the relative error of the odour AWC-ON sensed, C, are reported. One " +
        'second: shares of the thresholds and the switch throughout, graded under the well-posed rule, and the same ' +
        'touch pulses at every sample, required of every state.',
    ),
    table(
      [
        ...STEP_HEAD.slice(0, -1),
        'Centres ẋ',
        'Centres ẏ',
        'θ̇',
        'Ends ẋ, ẏ',
        'Muscles',
        'T',
        'C',
        'Switch',
        'Touch',
        '',
      ],
      report.oneStep.map((r) => [
        ...stepRow(r).slice(0, -1),
        ...r.centreShares.map((v) => fixed(v, 3)),
        r.endShares.map((v) => fixed(v, 2)).join(', '),
        fixed(r.muscleShare, 3),
        fixed(r.thresholdShare, 3),
        fixed(r.smellError, 2),
        r.switchSame ? 'same' : 'differs',
        r.touchSame ? 'same' : 'differs',
        verdict(r.pass),
      ]),
    ),
    table(
      [
        'State',
        'Voltage',
        'Activation',
        'Curvature',
        'Centroid',
        'T',
        'Switch',
        'Touch',
        'Reference against itself',
        '',
      ],
      report.oneSecond.map((r) => [
        r.label,
        fixed(r.shares.voltage, 3),
        fixed(r.shares.activation, 3),
        fixed(r.shares.curvature, 3),
        fixed(r.shares.centroid, 3),
        fixed(r.shares.threshold, 3),
        r.switchSame ? 'same' : 'differs',
        r.touchSame ? 'same' : 'differs',
        `${fixed(r.referenceShare, 3)}${r.referenceSwitchSame ? '' : ', switch differs'}`,
        r.graded ? verdict(r.pass) : 'not graded',
      ]),
    ),
    el('p', `${fixed(report.seconds, 1)} s.`),
  );
}

function showLong(report: LongReport): void {
  const mean = (x: number[]): number => x.reduce((a, b) => a + b, 0) / x.length;
  root.append(
    el('h2', `Long runs: ${verdict(report.pass)}`, 'status-title'),
    el(
      'p',
      `${report.seeds} seeds a side, ${report.seconds} s each; the mid-body curvature's SD and frequency, by Welch's ` +
        "two one-sided tests at ±5% of the CPU's mean.",
    ),
    table(
      ['Statistic', 'CPU mean', 'GPU mean', 'Difference', 'Margin', 'p', ''],
      (['sd', 'frequency'] as const).map((k) => [
        k === 'sd' ? 'SD of κL' : 'Frequency (Hz)',
        fixed(mean(report.cpu.map((w) => w[k])), 4),
        fixed(mean(report.gpu.map((w) => w[k])), 4),
        fixed(report[k].difference, 4),
        fixed(report[k].margin, 4),
        fixed(report[k].p, 4),
        verdict(report[k].equivalent),
      ]),
    ),
    el(
      'p',
      `Reported, not graded: the GPU's spread over the CPU's, as variances, ${fixed(report.spread.sd.ratio, 2)} for ` +
        `the SD (F test p = ${fixed(report.spread.sd.p, 3)}) and ${fixed(report.spread.frequency.ratio, 2)} for the ` +
        `frequency (p = ${fixed(report.spread.frequency.p, 3)}). Unconverged solves: ${report.unconverged.cpu} on the ` +
        `CPU, ${report.unconverged.gpu} on the GPU.`,
    ),
  );
}

function showBench(report: FullBench): void {
  root.append(
    el('h2', `Speed at ${1000 * report.dt} ms steps`, 'status-title'),
    table(
      ['Steps per dispatch', 'ms per dispatch', '× real time'],
      report.gpu.map((r) => [String(r.stepsPerDispatch), fixed(r.milliseconds), fixed(r.realTime, 1)]),
    ),
    el('p', 'The whole step, brain and loop:'),
    table(
      ['Steps per dispatch', 'ms per dispatch', '× real time'],
      report.loop.map((r) => [String(r.stepsPerDispatch), fixed(r.milliseconds), fixed(r.realTime, 1)]),
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

async function start(): Promise<{
  parity: Promise<FullReport>;
  bench: () => Promise<FullBench>;
  long: () => Promise<LongReport>;
}> {
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
  // The loop's and the field's checks run after the brain's; if they stop, the brain's results still stand.
  const query = new URLSearchParams(location.search);
  const shard = parseShard(query.get('shard'));
  const began = performance.now();
  const parity = runParity(device, adapter, data, shard).then(async (brain): Promise<FullReport> => {
    const stopped = (e: unknown): { error: string; pass: false } => ({
      error: e instanceof Error ? e.message : String(e),
      pass: false,
    });
    const loop = await runLoopParity(device, data, shard).catch(stopped);
    const field = await runFieldParity(device).catch(stopped);
    return {
      ...brain,
      shard,
      loop,
      field,
      brainPass: brain.pass,
      pass: brain.pass && loop.pass && field.pass,
      seconds: (performance.now() - began) / 1000,
    };
  });
  // The benchmark follows the checks on a whole run, and waits to be asked for on a shard, whose fellows may still
  // be running on the same cores.
  let benched: Promise<FullBench> | null = null;
  const runBenchmark = (): Promise<FullBench> =>
    (benched ??= parity.then(async (): Promise<FullBench> => ({
      ...(await runBench(device, adapter, data)),
      loop: await runLoopBench(device, data),
    })));
  const bench = shard.count === 1 ? runBenchmark() : parity.then(() => null);
  let long: Promise<LongReport> | null = null;
  const runLong = (): Promise<LongReport> => (long ??= runBenchmark().then(() => runLongParity(device, data)));
  parity.then((report) => {
    showParity(report);
    showLoop(report.loop);
    showField(report.field);
  }, fail);
  bench
    .then((report) => report && showBench(report), fail)
    .finally(() => {
      if (!query.has('long')) status.remove();
    });
  if (query.has('long')) {
    void bench.then(() => {
      status.textContent = 'Running the long runs…';
    });
    runLong()
      .then(showLong, fail)
      .finally(() => status.remove());
  }
  return { parity, bench: runBenchmark, long: runLong };
}

const started = start();
started.catch(fail);
const hooks = window as unknown as {
  __parity: () => Promise<FullReport>;
  __bench: () => Promise<FullBench>;
  __long: () => Promise<LongReport>;
};
hooks.__parity = () => started.then((s) => s.parity);
hooks.__bench = () => started.then((s) => s.bench());
hooks.__long = () => started.then((s) => s.long());
