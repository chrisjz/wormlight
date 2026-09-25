// The port check (PLAN §7.2): the CPU reference in Neural Interactome mode, at the production step,
// against golden trajectories from Neural Interactome's own code, solved by Radau at rtol = atol = 1e-10.
// Regenerate the goldens with `uv run --project tools/reference python tools/reference/ni_reference.py`.

import { describe, expect, it } from 'vitest';
import { loadSources, pinById } from '../scripts/data/sources.ts';
import { NiRun, type NiNetworkFile } from '../src/sim/brain/ni.ts';
import { NEURAL_STEP } from '../src/sim/numerics.ts';
import { digest, failures, readJson, readTrajectory, score } from './checks.ts';

const DIR = 'tests/fixtures/ni';

interface Manifest {
  generatorSha256: string;
  helperSha256: string;
  inputs: Record<string, string>;
  sample: number;
  end: number;
  presets: string[];
}

const manifest = readJson<Manifest>(`${DIR}/manifest.json`);
const network = readJson<NiNetworkFile>(`${DIR}/network.json`);

// Run a preset at the production step and score it on the samples after the input ramp.
function check(file: NiNetworkFile, preset: string) {
  const n = file.names.length;
  const reference = readTrajectory(`${DIR}/${preset}.f32`, n);
  const run = new NiRun(file, preset);
  const per = Math.round(manifest.sample / NEURAL_STEP);
  const compared: Float32Array[] = [];
  const model: Float64Array[] = [];
  for (let k = 1; k < reference.length; k++) {
    for (let q = 0; q < per; q++) run.step(NEURAL_STEP);
    if (k * manifest.sample <= file.constants.transitEnd + 1e-9) continue;
    compared.push(reference[k]);
    model.push(Float64Array.from(run.brain.voltage, (v, i) => v - run.brain.threshold[i]));
  }
  return { scores: score(file.names, compared, model), capped: run.brain.capped };
}

describe('the port check goldens', () => {
  it('come from the committed reference script', () => {
    expect(manifest.generatorSha256).toBe(digest('tools/reference/ni_reference.py'));
    expect(manifest.helperSha256).toBe(digest('tools/reference/pins.py'));
  });

  it('were made from the pinned Neural Interactome files, whose licence sits beside them', () => {
    const pin = pinById(loadSources(), 'neural-interactome');
    expect(Object.values(manifest.inputs).sort()).toEqual((pin.files ?? []).map((f) => f.sha256).sort());
    expect(digest(`${DIR}/LICENSE`)).toBe(manifest.inputs.LICENSE);
  });

  it('cover a 5 s run of each preset from 0 s, every 10 ms', () => {
    expect(manifest.presets).toEqual(['ALM', 'AVA', 'AVB', 'PLM']);
    for (const preset of manifest.presets) {
      expect(readTrajectory(`${DIR}/${preset}.f32`, network.names.length)).toHaveLength(
        Math.round(manifest.end / manifest.sample) + 1,
      );
    }
  });
});

describe('the port check', () => {
  for (const preset of manifest.presets) {
    it(`passes for every neuron in the ${preset} preset at the production step`, () => {
      const { scores, capped } = check(network, preset);
      expect(failures(scores)).toEqual([]);
      expect(capped).toBe(0);
    });
  }

  it("fails when Neural Interactome's [post, pre] matrix is read the other way round", () => {
    const transposed = {
      ...network,
      chemical: network.chemical.map(([post, pre, w]): [number, number, number] => [pre, post, w]),
    };
    expect(failures(check(transposed, 'AVA').scores).length).toBe(network.names.length);
  });
});
