// The production check (PLAN §7.2): the Cook model as the app runs it (rest thresholds, a reversal
// potential per connection, autapses, oscillators off), at the production step, against an independent
// dense implementation solved by Radau at rtol = atol = 1e-10.
// Regenerate the goldens with `uv run --project tools/reference python tools/reference/cook_reference.py`.

import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { validateWormlightData, type WormlightData } from '../src/data/schema.ts';
import { PARAMS } from '../src/science/params.ts';
import { Brain, equilibrium, inputConductance, midpointActivation } from '../src/sim/brain/brain.ts';
import { cookNetwork } from '../src/sim/brain/network.ts';
import { NEURAL_STEP } from '../src/sim/numerics.ts';
import { digest, failures, readJson, readTrajectory, score } from './checks.ts';

const DIR = 'tests/fixtures/cook';

interface Stimulus {
  neurons: string[];
  on: number;
  off: number | null;
  amplitudes: Record<string, number>;
}

interface Manifest {
  generatorSha256: string;
  helperSha256: string;
  wiringSha256: string;
  outputs: Record<string, string>;
  constants: Record<string, number>;
  depolarisation: number;
  stimuli: Record<string, Stimulus>;
  sample: number;
  end: number;
}

const manifest = readJson<Manifest>(`${DIR}/manifest.json`);
const data = validateWormlightData(readJson('public/data/wormlight.v1.json'));
const network = cookNetwork(data);
const names = network.names;
const rest = midpointActivation(network);
const threshold = equilibrium(network, rest);

// The same digest cook_reference.py takes: the wiring alone, so edits elsewhere in the data file don't
// make the goldens stale.
function wiringDigest(d: WormlightData): string {
  const wiring = {
    neurons: d.neurons.map((n) => n.name),
    chemical: d.chemical.map((c) => [c.pre, c.post, c.sections, c.sign]),
    gap: d.gap.map((g) => [g.a, g.b, g.sections]),
  };
  return createHash('sha256').update(JSON.stringify(wiring)).digest('hex');
}

describe('the production check goldens', () => {
  it('come from the committed reference script and the current wiring', () => {
    expect(manifest.generatorSha256).toBe(digest('tools/reference/cook_reference.py'));
    expect(manifest.helperSha256).toBe(digest('tools/reference/pins.py'));
    expect(manifest.wiringSha256).toBe(wiringDigest(data));
  });

  it('are unedited', () => {
    expect(Object.keys(manifest.outputs).sort()).toEqual(
      Object.keys(manifest.stimuli)
        .map((s) => `${s}.f32`)
        .sort(),
    );
    for (const [file, sha256] of Object.entries(manifest.outputs)) expect(digest(`${DIR}/${file}`), file).toBe(sha256);
  });

  it('were made with the constants in the registry', () => {
    const p = PARAMS;
    expect(manifest.constants).toEqual({
      capacitance: p.membraneCapacitance.value / 1000,
      leak: p.leakConductance.value / 1000,
      leakPotential: p.leakPotential.value,
      reversalExcitatory: p.reversalExcitatory.value,
      reversalInhibitory: p.reversalInhibitory.value,
      rise: p.synapticRise.value,
      decay: p.synapticDecay.value,
      slope: p.sigmoidWidth.value,
      conductancePerSynapse: p.conductancePerSynapse.value / 1000,
      cookToVarshneyChemical: p.cookToVarshneyChemical.value,
      cookToVarshneyGap: p.cookToVarshneyGap.value,
    });
  });

  it('drive each stimulated neuron with its input conductance times 10 mV, as this model computes it', () => {
    for (const stimulus of Object.values(manifest.stimuli)) {
      for (const [cell, amplitude] of Object.entries(stimulus.amplitudes)) {
        const expected = manifest.depolarisation * inputConductance(network, rest, names.indexOf(cell));
        expect(Math.abs(amplitude - expected) / expected).toBeLessThan(1e-9);
      }
    }
  });
});

describe('the production check', () => {
  for (const [name, stimulus] of Object.entries(manifest.stimuli)) {
    it(`passes for every neuron under the ${name} at the production step`, () => {
      const reference = readTrajectory(`${DIR}/${name}.f32`, names.length);
      expect(reference).toHaveLength(Math.round(manifest.end / manifest.sample) + 1);
      const brain = new Brain(network, threshold);
      const per = Math.round(manifest.sample / NEURAL_STEP);
      // The input is on for on < t ≤ off, counted in whole steps, and the step after each switch restarts.
      const on = Math.round(stimulus.on / NEURAL_STEP);
      const off = stimulus.off === null ? Infinity : Math.round(stimulus.off / NEURAL_STEP);
      const model = [Float64Array.from(brain.voltage, (v, i) => v - threshold[i])];
      for (let k = 1; k < reference.length; k++) {
        for (let q = 0; q < per; q++) {
          const step = brain.steps + 1;
          if (step === on + 1 || step === off + 1) brain.restart();
          brain.input.fill(0);
          if (step > on && step <= off) {
            for (const [cell, amplitude] of Object.entries(stimulus.amplitudes)) {
              brain.input[names.indexOf(cell)] = amplitude;
            }
          }
          brain.step(NEURAL_STEP);
        }
        model.push(Float64Array.from(brain.voltage, (v, i) => v - threshold[i]));
      }
      expect(failures(score(names, reference, model))).toEqual([]);
      expect(brain.unconverged).toBe(0);
    });
  }
});
