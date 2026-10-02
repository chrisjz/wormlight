// The sensitivity runs' settings (spec §2.4; PLAN §2.4, §3.2): which signs are uncertain, what each setting makes of
// them, and that the model's own setting is the model.

import { describe, expect, it } from 'vitest';
import { jobParams, parseArgs } from '../scripts/harness/run.ts';
import { validateWormlightData } from '../src/data/schema.ts';
import { createHash } from 'node:crypto';
import { PARAMS } from '../src/science/params.ts';
import { connections, cookNetwork } from '../src/sim/brain/network.ts';
import { currentParams, World } from '../src/sim/world.ts';
import {
  RANDOM_DRAWS,
  resigned,
  SETTINGS,
  settingNetwork,
  settingParams,
  SHARED_SCALES,
  uncertain,
} from '../src/validation/sensitivity.ts';
import { startingWorld } from '../src/validation/trial.ts';
import { readJson } from './checks.ts';

const data = validateWormlightData(readJson('public/data/wormlight.v1.json'));
// The random draws, each a digest of its signs, on the runtime data since track S's signs moved into it (DECISIONS.md,
// 2026-10-02), as the runs VALIDATION.md records ("Sensitivity") drew them on S's fit. The runs before, on the refit
// and the data before S's signs, drew others: 26f8847794b0, ab84094e7fac, 3611fd17fbfe, 545050fbfc5f, cf154e50588e,
// 98f548eb58b4, e2e6463bd19a, 1c1db8127608, 073f8feb800e and c48d89cdeca4.
const DRAWN = [
  'bf9fe2262009',
  'a6d0a90676e8',
  '40cc1d8fe20a',
  '4436787e81cb',
  '3201a6926218',
  'a5d33ca3a2ab',
  '91f9eb9d0530',
  '56e13631a0a5',
  '1675f9ed9bdc',
  '014d5ee42807',
];
const doubtful = data.chemical.filter(uncertain);

describe('the uncertain signs', () => {
  // 1,986 before track S's signs moved into the data, 27 of which took a measured sign then (PLAN §2.4).
  it("are the 1,959 connections PLAN §2.4 names: the rule's 1,426 and the 533 with no basis", () => {
    expect(doubtful.length).toBe(1959);
    expect(doubtful.filter((c) => c.signSource === 'rule').length).toBe(1426);
    expect(doubtful.filter((c) => c.signSource === 'none').length).toBe(533);
  });
});

describe('the settings', () => {
  it("are sixteen: the rule, all excitatory, all silent, ten random draws, the shared scales, and track S's two of its rest", () => {
    expect(SETTINGS.map((s) => s.id)).toEqual([
      'rule',
      'excitatory',
      'silent',
      ...Array.from({ length: RANDOM_DRAWS }, (_, k) => `random-${k + 1}`),
      'shared-scales',
      'offsets-off',
      'ava-offsets',
    ]);
    expect(RANDOM_DRAWS).toBe(10);
    expect(() => resigned(data.chemical, 'random-11')).toThrow(/unknown sensitivity setting/);
    expect(() => resigned(data.chemical, 'inhibitory')).toThrow(/unknown sensitivity setting/);
  });

  it("make the model's own brain by the rule, and under the settings of track S's rest", () => {
    expect(settingNetwork(data, 'rule')).toEqual(cookNetwork(data));
    expect(settingNetwork(data, 'offsets-off')).toEqual(cookNetwork(data));
    expect(settingNetwork(data, 'ava-offsets')).toEqual(cookNetwork(data));
  });

  it("change only track S's offsets, and only under the settings of its rest", () => {
    const params = currentParams();
    expect(params.restOffsets).toBe('measured');
    for (const { id } of SETTINGS.filter((s) => s.id !== 'offsets-off' && s.id !== 'ava-offsets')) {
      expect(settingParams(params, id), id).toBe(params);
    }
    expect(settingParams(params, 'offsets-off')).toEqual({ ...params, restOffsets: undefined });
    expect(settingParams(params, 'ava-offsets')).toEqual({ ...params, restOffsets: 'measured with AVA' });
    // On a fit without S's offsets they would repeat it, or add an offset it never had, so they refuse.
    const { restOffsets: none, ...without } = params;
    expect(none).toBe('measured');
    for (const id of ['offsets-off', 'ava-offsets']) {
      expect(() => settingParams(without, id), id).toThrow(/which these parameters don't run/);
      expect(() => settingParams({ ...params, restOffsets: 'measured with AVA' }, id), id).toThrow(/don't run/);
    }
  });

  it('leave every sign with a basis of its own as it is, under every setting', () => {
    for (const { id } of SETTINGS) {
      const changed = resigned(data.chemical, id).filter((c, i) => c.sign !== data.chemical[i].sign);
      expect(changed.every(uncertain), id).toBe(true);
    }
  });

  it('set the uncertain signs all excitatory, or all silent', () => {
    expect(
      resigned(data.chemical, 'excitatory')
        .filter(uncertain)
        .every((c) => c.sign === 1),
    ).toBe(true);
    expect(
      resigned(data.chemical, 'silent')
        .filter(uncertain)
        .every((c) => c.sign === 0),
    ).toBe(true);
    // Silent, only the connections with a sign of their own are left; excitatory, every connection is there.
    const sure = data.chemical.filter((c) => !uncertain(c) && c.sign !== 0).length;
    expect(connections(settingNetwork(data, 'silent')).chemical.length).toBe(sure);
    expect(connections(settingNetwork(data, 'excitatory')).chemical.length).toBe(sure + doubtful.length);
  });

  it('draw the signs they draw on the runtime data', () => {
    // A digest of each draw's signs, in the data's order: a change to the draws, or to the runtime data's list of
    // chemical connections, changes what every sensitivity run means (VALIDATION.md, "Sensitivity").
    const print = (k: number): string =>
      createHash('sha256')
        .update(
          resigned(data.chemical, `random-${k}`)
            .map((c) => c.sign)
            .join(','),
        )
        .digest('hex')
        .slice(0, 12);
    expect(Array.from({ length: RANDOM_DRAWS }, (_, k) => print(k + 1))).toEqual(DRAWN);
  });

  it('draw each random sign about half each way, and differently for each draw', () => {
    const signs = (k: number): number[] =>
      resigned(data.chemical, `random-${k}`)
        .filter(uncertain)
        .map((c) => c.sign);
    const seen = new Set<string>();
    for (let k = 1; k <= RANDOM_DRAWS; k++) {
      const s = signs(k);
      expect(s.every((x) => x === 1 || x === -1)).toBe(true);
      const excitatory = s.filter((x) => x === 1).length / s.length;
      expect(excitatory, `draw ${k}`).toBeGreaterThan(0.45);
      expect(excitatory, `draw ${k}`).toBeLessThan(0.55);
      seen.add(s.join(''));
    }
    expect(seen.size).toBe(RANDOM_DRAWS);
  });

  it("scale the model's connections by the shared-connection scales, signs unchanged", () => {
    const [model, shared] = [connections(cookNetwork(data)), connections(settingNetwork(data, 'shared-scales'))];
    expect(SHARED_SCALES).toEqual({ gap: 0.33, chemical: 0.5 });
    expect(shared.gap.length).toBe(model.gap.length);
    expect(shared.chemical.length).toBe(model.chemical.length);
    const gap = SHARED_SCALES.gap / PARAMS.cookToVarshneyGap.value;
    const chemical = SHARED_SCALES.chemical / PARAMS.cookToVarshneyChemical.value;
    shared.gap.forEach(([, , g], i) => expect(g).toBeCloseTo(model.gap[i][2] * gap, 12));
    shared.chemical.forEach(([post, pre, g, e], i) => {
      expect([post, pre, e]).toEqual([model.chemical[i][0], model.chemical[i][1], model.chemical[i][3]]);
      expect(g).toBeCloseTo(model.chemical[i][2] * chemical, 12);
    });
  });
});

describe('a setting in a world', () => {
  const params = currentParams();
  const postures = [Array.from({ length: 100 }, () => 0)];
  // The silenced network's head-switch drive less θ_osc, at rest: it keeps each setting's intact thresholds.
  const margin = (id: string): number =>
    startingWorld(data, {
      seed: 1,
      params: settingParams(params, id),
      postures,
      silenced: true,
      network: settingNetwork(data, id),
    }).world.headDrive() - params.driveThreshold;

  // On track S's fit every setting leaves the silenced head switch shut, by 4.6 mV at least, where on the refit, and the
  // data before S's signs, it was shut by under half a millivolt on the model's own signs and open under eleven of the
  // fourteen settings it had (DECISIONS.md, 2026-09-30 and 2026-10-02).
  it("reaches a trial's world, and its silenced network keeps the setting's thresholds", () => {
    expect(margin('rule')).toBeCloseTo(-13.32, 2);
    expect(margin('excitatory')).toBeCloseTo(-14.87, 2);
    expect(margin('shared-scales')).toBeCloseTo(-13.36, 2);
    expect(margin('silent')).toBeCloseTo(-10.07, 2);
    for (let k = 1; k <= RANDOM_DRAWS; k++) expect(margin(`random-${k}`), `draw ${k}`).toBeLessThan(-4);
    expect(margin('offsets-off')).toBeCloseTo(-13.346, 3);
    expect(margin('ava-offsets')).toBeCloseTo(-13.325, 3);
  });

  it("rests the settings of track S's rest as their offsets ask", () => {
    const brain = (id: string) =>
      startingWorld(data, { seed: 1, params: settingParams(params, id), postures }).world.brain;
    const at = (name: string): number => data.neurons.findIndex((n) => n.name === name);
    const [rule, off, ava] = [brain('rule'), brain('offsets-off'), brain('ava-offsets')];
    // Each neuron's offset below its threshold: the D-types' −7.4 mV under the model's own; none with the offsets
    // off; and AVAL's −29 and AVAR's −16 beside the D-types' with AVA's (Liu, Chen & Wang 2020).
    expect([rule.offset[at('VD5')], rule.offset[at('AVAL')], rule.offset[at('AVAR')]]).toEqual([-7.4, 0, 0]);
    expect(off.offset.every((x) => x === 0)).toBe(true);
    expect([ava.offset[at('VD5')], ava.offset[at('AVAL')], ava.offset[at('AVAR')]]).toEqual([-7.4, -29, -16]);
    // Their thresholds move with them: VD5's without its offset, AVA's with theirs.
    expect(off.threshold[at('VD5')]).not.toBeCloseTo(rule.threshold[at('VD5')], 1);
    expect(ava.threshold[at('AVAL')]).not.toBeCloseTo(rule.threshold[at('AVAL')], 1);
  });

  it("steps the model's own setting as the model, bit for bit", () => {
    const [model, rule] = [
      new World(data, params, { seed: 3 }),
      new World(data, params, { seed: 3, network: settingNetwork(data, 'rule') }),
    ];
    for (let k = 0; k < 400; k++) {
      model.step();
      rule.step();
    }
    expect(rule.snapshot()).toEqual(model.snapshot());
  });
});

describe("the harness's --sensitivity", () => {
  it("runs each job on the registry's fit, or on its setting's parameters", () => {
    expect(jobParams()).toEqual(currentParams());
    expect(jobParams('random-3')).toEqual(currentParams());
    expect(jobParams('offsets-off')).toEqual({ ...currentParams(), restOffsets: undefined });
    expect(jobParams('ava-offsets').restOffsets).toBe('measured with AVA');
  });

  it('runs by itself, with the trials and the seconds a run can shorten', () => {
    expect(parseArgs(['--sensitivity', '--jobs', '6'])).toMatchObject({ sensitivity: true, checkpoints: [], jobs: 6 });
    expect(parseArgs(['--checkpoint', '1']).sensitivity).toBe(false);
    expect(() => parseArgs(['--sensitivity', '--checkpoint', '1'])).toThrow(/by itself/);
    expect(() => parseArgs([])).toThrow(/say which checkpoint/);
  });
});
