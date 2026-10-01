// Track S's rectifier's two reported checks (DECISIONS.md, 2026-10-01 and 2026-10-02), neither graded, and print
// their tables.
//
//   node scripts/experiments/rectification/run.ts
//
// The amplifier. Liu et al. 2017 found that knocking the AVA–A-type junctions down greatly reduces AVA's bursts of
// transmission in VA5 and DA4: the rectified junction amplifies the chemical synapse. Here each AVA takes a current
// step for 1 s from rest, on the brain alone, with no oscillators, no noise and nothing outside it, in S's model three
// ways: its junctions rectified, the 37 removed, and conducting both ways. Each network starts at its own rest, as a
// rewired brain solves its own (PLAN §3.3). It prints AVA's rise, the A-types' mean rise in voltage and in activation,
// VA5's and DA4's, and how many gates are open at the step's end.
//
// The input resistances: each neuron's with every activation held at rest and each gate as the rest sets it, in the
// runtime model, in S's model without its rectifier, and in S's whole model, beside Liu et al.'s 2.50 GΩ for AVA and
// 3.47 GΩ for VA5. It takes a few seconds and writes nothing.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateWormlightData } from '../../../src/data/schema.ts';
import { Brain, inputConductance, restOf } from '../../../src/sim/brain/brain.ts';
import { connections, cookNetwork, gapRows, openRectified, type Network } from '../../../src/sim/brain/network.ts';
import { NEURAL_STEP } from '../../../src/sim/numerics.ts';
import { rectify, restOffsets, withMeasuredSigns } from '../../../src/sim/trackS.ts';
import { ROOT } from '../../data/sources.ts';

const data = validateWormlightData(JSON.parse(readFileSync(join(ROOT, 'public/data/wormlight.v1.json'), 'utf8')));
const signed = withMeasuredSigns(data);
const both = cookNetwork(signed);
const rectified = rectify(both);
const at = (name: string): number => both.names.indexOf(name);
const pairs = new Set((rectified.rectified ?? []).flatMap(([a, b]) => [`${a} ${b}`, `${b} ${a}`]));
const removed: Network = {
  ...both,
  gap: gapRows(
    both.names.length,
    connections(both).gap.filter(([a, b]) => !pairs.has(`${a} ${b}`)),
  ),
};
const aTypes = both.names.flatMap((name, i) => (/^(DA|VA)\d+$/.test(name) ? [i] : []));
const ava = [at('AVAL'), at('AVAR')];
const offset = restOffsets(signed, 'measured');
const fixed = (x: number, digits = 2): string => (x >= 0 ? '+' : '') + x.toFixed(digits);

console.log("The amplifier: a current step into each AVA for 1 s, from rest, in S's model.\n");
console.log(
  '| Into each AVA | Junctions | AVA (mV) | A-types (mV) | A-types (activation) | VA5 (mV) | DA4 (mV) | Open |',
);
console.log(
  '| ------------- | --------- | -------- | ------------ | -------------------- | -------- | -------- | ---- |',
);
for (const current of [10, 50]) {
  for (const [label, network] of [
    ['rectified', rectified],
    ['removed', removed],
    ['both ways', both],
  ] as const) {
    const rest = restOf(network, offset);
    const brain = new Brain(network, rest.threshold, {}, offset);
    const [v0, s0] = [Float64Array.from(brain.voltage), Float64Array.from(brain.activation)];
    for (let k = Math.round(1 / NEURAL_STEP); k > 0; k--) {
      brain.input.fill(0);
      for (const i of ava) brain.input[i] = current;
      brain.step(NEURAL_STEP);
    }
    const mean = (of: Float64Array, from: Float64Array, set: number[]): number =>
      set.reduce((sum, i) => sum + of[i] - from[i], 0) / set.length;
    const open = network === rectified ? `${openRectified(network, brain.voltage).open} of 37` : '';
    console.log(
      `| ${current} pA | ${label} | ${fixed(mean(brain.voltage, v0, ava))} | ${fixed(mean(brain.voltage, v0, aTypes))} | ` +
        `${fixed(mean(brain.activation, s0, aTypes), 4)} | ${fixed(brain.voltage[at('VA5')] - v0[at('VA5')])} | ` +
        `${fixed(brain.voltage[at('DA4')] - v0[at('DA4')])} | ${open} |`,
    );
  }
}

console.log('\nInput resistances (GΩ), every activation held at rest and each gate as the rest sets it.\n');
const runtime = restOf(cookNetwork(data), new Float64Array(both.names.length));
const unrectified = restOf(both, offset);
const whole = restOf(rectified, offset);
const resistance = (rest: ReturnType<typeof restOf>, name: string): string =>
  (1 / inputConductance(rest.network, rest.activation, at(name))).toFixed(2);
const measured: Record<string, string> = { AVAL: '2.50 (AVA)', AVAR: '2.50 (AVA)', VA5: '3.47' };
console.log("| Neuron | Runtime model | S's, unrectified | S's whole | Liu et al. 2017 |");
console.log('| ------ | ------------- | ---------------- | --------- | --------------- |');
for (const name of ['AVAL', 'AVAR', 'VA5', 'VA8', 'DA4']) {
  console.log(
    `| ${name} | ${resistance(runtime, name)} | ${resistance(unrectified, name)} | ${resistance(whole, name)} | ${measured[name] ?? ''} |`,
  );
}
console.log(`\nGates open at S's rest: ${openRectified(rectified, whole.voltage).open} of 37.`);
