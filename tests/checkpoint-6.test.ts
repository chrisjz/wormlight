// Checkpoint 6's grading (DECISIONS.md, 2026-10-03): the voltage spread by §7.3's linear analysis, the verdict map with
// the maintainer's change, a null's grading guards, the summaries, the section, and the harness's options.

import { describe, expect, it } from 'vitest';
import { checkpoint6Section } from '../scripts/harness/report.ts';
import { parseArgs } from '../scripts/harness/run.ts';
import {
  gradesOf,
  gradingRefused,
  registryValues,
  type NullRecord,
  type WiringSummary,
} from '../scripts/harness/wiring.ts';
import { validateWormlightData } from '../src/data/schema.ts';
import { inputConductance } from '../src/sim/brain/brain.ts';
import { cookNetwork, type Network } from '../src/sim/brain/network.ts';
import { currentParams, World } from '../src/sim/world.ts';
import { boxOf, variants } from '../src/validation/calibration.ts';
import { symmetricEigen, voltageSpread, widest } from '../src/validation/noiseSpread.ts';
import { verdicts, type Grade, type WiringGrades } from '../src/validation/wiringTest.ts';
import { readJson } from './checks.ts';

const data = validateWormlightData(readJson('public/data/wormlight.v1.json'));

describe("each neuron's voltage spread, by §7.3's linear analysis", () => {
  it("finds a symmetric matrix's eigenvalues and eigenvectors", () => {
    const a = Float64Array.of(2, 1, 0, 1, 2, 1, 0, 1, 2);
    const { values, vectors } = symmetricEigen(a, 3);
    expect([...values].sort((x, y) => x - y).map((x) => +x.toFixed(12))).toEqual(
      [2 - Math.SQRT2, 2, 2 + Math.SQRT2].map((x) => +x.toFixed(12)),
    );
    // A v = λ v for each.
    for (let k = 0; k < 3; k++) {
      for (let i = 0; i < 3; i++) {
        let av = 0;
        for (let j = 0; j < 3; j++) av += a[i * 3 + j] * vectors[j * 3 + k];
        expect(av).toBeCloseTo(values[k] * vectors[i * 3 + k], 12);
      }
    }
  });

  it("gives a lone neuron the one-pole filter's spread, σ/√(2G²(τ + C/G))", () => {
    const lone = cookNetwork(data);
    const n = lone.names.length;
    const empty = { start: new Int32Array(n + 1), index: new Int32Array(0), weight: new Float64Array(0) };
    const isolated: Network = { ...lone, gap: empty, chemical: { ...empty, reversal: new Float64Array(0) } };
    const spread = voltageSpread(isolated, 0.5, 0.1, 0.05);
    const G = isolated.leak;
    const C = isolated.capacitance;
    expect(spread[0]).toBeCloseTo(0.1 / Math.sqrt(2 * G * G * (0.05 + C / G)), 10);
  });

  it(
    "reproduces white noise's σ/√(2·C·G_in) as τ falls to 0, and σ_n's bound's 20 mV in its widest neuron",
    { timeout: 60000 },
    () => {
      const w = new World(data, currentParams());
      const net = w.brain.restNetwork();
      const s = w.brain.restActivations();
      const white = voltageSpread(net, s, 0.169, 0);
      for (const i of [0, 37, 150, 290]) {
        const g = inputConductance(net, s, i);
        expect(white[i] / (0.169 / Math.sqrt(2 * net.capacitance * g))).toBeCloseTo(1, 10);
      }
      expect(widest(net, white)).toMatchObject({ neuron: 'IL2DL' });
      expect(widest(net, white).spread).toBeCloseTo(20, 0);
      // Coloured noise moves the network less than white noise of the same intensity.
      const coloured = voltageSpread(net, s, 0.169, 0.05);
      expect(coloured.every((x, i) => x < white[i])).toBe(true);
    },
  );
});

const wiring = (crawl: boolean, later: Partial<Record<2 | 3 | 4 | 5, Grade>> = {}): WiringGrades => ({
  fit: true,
  checkpoint1: crawl ? 'partial' : 'fail',
  crawls: crawl,
  later,
});

describe("checkpoint 6's verdict map", () => {
  const realFails = wiring(true, { 2: 'fail', 3: 'fail', 4: 'fail', 5: 'fail' });

  it('reads crawling as PLAN §7.4 has it', () => {
    const n = (c: number): WiringGrades[] => Array.from({ length: 10 }, (_, k) => wiring(k < c));
    expect(verdicts(realFails, n(2)).crawling).toMatchObject({ verdict: 'the wiring matters', crawl: 2 });
    expect(verdicts(realFails, n(3)).crawling.verdict).toBe('inconclusive');
    expect(verdicts(realFails, n(4)).crawling.verdict).toBe('inconclusive');
    expect(verdicts(realFails, n(5)).crawling.verdict).toBe('no evidence that the wiring matters');
    expect(verdicts(wiring(false), n(1)).crawling.verdict).toBe('inconclusive');
  });

  it('gives "insufficient nulls" first, then the real wiring\'s failure its own label', () => {
    const four = Array.from({ length: 10 }, (_, k) => wiring(k < 4, { 2: 'pass' }));
    expect(verdicts(realFails, four).later[2].verdict).toBe('insufficient nulls');
    const six = Array.from({ length: 10 }, (_, k) => wiring(k < 6, { 2: k < 1 ? 'pass' : 'fail', 3: 'partial' }));
    const v = verdicts(realFails, six).later;
    expect(v[2]).toMatchObject({
      verdict: "no evidence that the wiring matters (the real wiring doesn't pass)",
      real: 'fail',
      pass: 1,
      of: 6,
    });
    expect(v[3]).toMatchObject({ pass: 0, partial: 6 });
    // A partial real wiring doesn't pass either.
    const partialReal = wiring(true, { 2: 'partial' });
    expect(verdicts(partialReal, six).later[2].verdict).toMatch(/doesn't pass/);
  });

  it('reads the map as written where the real wiring passes', () => {
    const real = wiring(true, { 2: 'pass' });
    const crawling = (passing: number): WiringGrades[] =>
      Array.from({ length: 10 }, (_, k) => wiring(true, { 2: k < passing ? 'pass' : 'fail' }));
    expect(verdicts(real, crawling(2)).later[2].verdict).toBe('the wiring matters');
    expect(verdicts(real, crawling(3)).later[2].verdict).toBe('inconclusive');
    expect(verdicts(real, crawling(5)).later[2].verdict).toBe('no evidence that the wiring matters');
  });
});

describe("a null's grading", () => {
  const m = {
    platform: 'linux',
    release: '5.15',
    os: '#1',
    arch: 'x64',
    cpu: 'Intel i9-9900X',
    cores: 20,
    memoryGB: 16,
    node: 'v26.7.0',
  };
  const record: NullRecord = {
    complete: true,
    rewiring: 3,
    data: data.meta.version,
    node: 'v26.7.0',
    commit: 'abc1234',
    machine: m,
    bounds: boxOf('conductance', 'track S'),
    fit: { seed: 11, from: 'generation 3, candidate 2', values: registryValues(), value: 0.4 },
  };
  const here = { data: data.meta.version, node: 'v26.7.0', machine: { ...m, memoryGB: 26 } };

  it('runs on the machine, Node and data its search ran on, once the search has finished', () => {
    expect(gradingRefused(record, here)).toBeNull();
    expect(gradingRefused({ ...record, complete: false }, here)).toMatch(/not finished/);
    expect(gradingRefused(record, { ...here, data: '00000000' })).toMatch(/data/);
    expect(gradingRefused(record, { ...here, node: 'v24.0.0' })).toMatch(/Node/);
    expect(gradingRefused(record, { ...here, machine: { ...m, cpu: 'Apple M5 Max' } })).toMatch(/i9-9900X/);
  });

  it("takes the real wiring's values from the registry, and the same variants in a null's own box", () => {
    expect(registryValues().headSwitchGain).toBeCloseTo(50, 6);
    const own = { ...boxOf('conductance', 'track S'), headSwitchGain: [0.01, 40] as const };
    const runs = variants(data.neurons, registryValues(), 'conductance', 'track S', own);
    expect(runs.map((r) => r.name)).toEqual([
      'The head switch off, g_sw at 0',
      'g_sw at its lower bound',
      'The 18 B-types lesioned',
      'The 21 A-types lesioned',
      'AVBL and AVBR lesioned',
    ]);
    expect(runs[1].values.headSwitchGain).toBe(0.01);
  });
});

// A summary as `--wiring` writes it.
const summary = (name: string, rewiring: number | undefined, grade: Grade | null, later?: Grade): WiringSummary => ({
  wiring: name,
  ...(rewiring === undefined ? {} : { rewiring }),
  date: '2026-10-08',
  commit: 'abc1234',
  data: data.meta.version,
  machine: { cpu: rewiring === undefined ? 'Apple M5 Max' : 'Intel i9-9900X', node: 'v26.7.0' },
  fit: grade === null ? null : { values: registryValues(), value: 0.5 },
  box: boxOf('conductance', 'track S'),
  failures: rewiring === 4 ? 3 : 0,
  checkpoint1: grade === null ? null : { grade, clauses: [] },
  crawls: grade === 'pass' || grade === 'partial',
  ...(grade === null
    ? {}
    : {
        speed: { value: 0.068, interval: [0.067, 0.069] as [number, number], unmeasured: 0 },
        pacing: { open: 1, margin: { mean: 13, sd: 2 }, cycleRate: 0.21 },
        variants: [{ name: 'The head switch off, g_sw at 0', grade: 'fail', forward: 0.1, meanVelocity: 0.001 }],
        spread: { neuron: 'IL2DL', spread: 3.94, sigma: 0.056, tau: 0.055 },
      }),
  ...(later
    ? {
        later: {
          0: 'pass' as Grade,
          2: later,
          3: later,
          4: { grade: later, klinokinesis: 'absent', weathervaning: 'reproduced' },
          5: { grade: later, rows: [] },
        },
      }
    : {}),
});

describe("checkpoint 6's section", () => {
  it('gives the verdicts, every wiring whichever way it falls, and what the nulls never got', () => {
    const real = summary('real', undefined, 'partial', 'fail');
    const nulls = [
      summary('null-1', 1, 'partial', 'fail'),
      summary('null-2', 2, null),
      ...Array.from({ length: 8 }, (_, k) =>
        summary(`null-${k + 3}`, k + 3, k < 4 ? 'partial' : 'fail', k < 4 ? 'fail' : undefined),
      ),
    ];
    const v = verdicts(gradesOf(real), nulls.map(gradesOf));
    const section = checkpoint6Section(v, real, nulls);
    expect(section).toContain('### Checkpoint 6: the wiring test');
    expect(section).toContain(
      '| Crawling: checkpoint 1 at least partial | No evidence that the wiring matters | 5 of 10 nulls crawl; the real wiring is partial |',
    );
    expect(section).toContain(
      "| Checkpoint 2, among the crawling nulls | No evidence that the wiring matters (the real wiring doesn't pass) | the real wiring: fail; 0 of 5 crawling nulls pass, 0 partial |",
    );
    expect(section).toMatch(/\| Rewiring 2 +\| 50 · 7 · −28 +\| — +\| 0 +\| No fit /);
    expect(section).toMatch(/\| Rewiring 4 +\| [^|]+\| 0\.500 +\| 3 +\| \*\*Partial\*\* /);
    expect(section).toContain('IL2DL, 3.94 mV');
    expect(section).toContain('Intel i9-9900X, Node v26.7.0');
    expect(section).toContain("What the real wiring got and the nulls don't");
    expect(section).toContain('read in a smoke run before the grading was built');
  });
});

describe("the harness's checkpoint 6", () => {
  it('grades a wiring, or writes the verdict, each by itself and whole', () => {
    expect(parseArgs(['--wiring', 'real'])).toMatchObject({ wiring: 'real', verdict: false, checkpoints: [] });
    expect(parseArgs(['--wiring', '7', '--jobs', '20'])).toMatchObject({ wiring: 7, jobs: 20 });
    expect(parseArgs(['--checkpoint', '6'])).toMatchObject({ verdict: true, checkpoints: [] });
    expect(() => parseArgs(['--wiring', '0'])).toThrow(/real or a rewiring from 1 to 10/);
    expect(() => parseArgs(['--wiring', '1', '--checkpoint', '1'])).toThrow(/each run by itself/);
    expect(() => parseArgs(['--checkpoint', '6', '--seconds', '30'])).toThrow(/whole/);
  });
});
