// The sensitivity runs' settings (spec §2.4; PLAN §2.4, §3.2): which signs are uncertain, what each setting makes of
// them, and that the model's own setting is the model.

import { describe, expect, it } from 'vitest';
import { parseArgs } from '../scripts/harness/run.ts';
import { validateWormlightData } from '../src/data/schema.ts';
import { PARAMS } from '../src/science/params.ts';
import { connections, cookNetwork } from '../src/sim/brain/network.ts';
import {
  RANDOM_DRAWS,
  resigned,
  SETTINGS,
  settingNetwork,
  SHARED_SCALES,
  uncertain,
} from '../src/validation/sensitivity.ts';
import { readJson } from './checks.ts';

const data = validateWormlightData(readJson('public/data/wormlight.v1.json'));
const doubtful = data.chemical.filter(uncertain);

describe('the uncertain signs', () => {
  it("are the 1,986 connections PLAN §2.4 names: the rule's 1,453 and the 533 with no basis", () => {
    expect(doubtful.length).toBe(1986);
    expect(doubtful.filter((c) => c.signSource === 'rule').length).toBe(1453);
    expect(doubtful.filter((c) => c.signSource === 'none').length).toBe(533);
  });
});

describe('the settings', () => {
  it('are fourteen: the rule, all excitatory, all silent, ten random draws, and the shared scales', () => {
    expect(SETTINGS.map((s) => s.id)).toEqual([
      'rule',
      'excitatory',
      'silent',
      ...Array.from({ length: RANDOM_DRAWS }, (_, k) => `random-${k + 1}`),
      'shared-scales',
    ]);
    expect(RANDOM_DRAWS).toBe(10);
    expect(() => resigned(data.chemical, 'random-11')).toThrow(/unknown sensitivity setting/);
    expect(() => resigned(data.chemical, 'inhibitory')).toThrow(/unknown sensitivity setting/);
  });

  it("make the model's own brain by the rule", () => {
    expect(settingNetwork(data, 'rule')).toEqual(cookNetwork(data));
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

  it('draw each random sign the same each time, about half each way, and differently for each draw', () => {
    const signs = (k: number): number[] =>
      resigned(data.chemical, `random-${k}`)
        .filter(uncertain)
        .map((c) => c.sign);
    expect(signs(3)).toEqual(signs(3));
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

describe("the harness's --sensitivity", () => {
  it('runs by itself, with the trials and the seconds a run can shorten', () => {
    expect(parseArgs(['--sensitivity', '--jobs', '6'])).toMatchObject({ sensitivity: true, checkpoints: [], jobs: 6 });
    expect(parseArgs(['--checkpoint', '1']).sensitivity).toBe(false);
    expect(() => parseArgs(['--sensitivity', '--checkpoint', '1'])).toThrow(/by itself/);
    expect(() => parseArgs([])).toThrow(/say which checkpoint/);
  });
});
