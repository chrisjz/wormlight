import { describe, expect, it } from 'vitest';
import { PITCH_LIMIT } from '../render/camera';
import {
  aboutAsked,
  aboutUrl,
  applyTarget,
  plateUrl,
  readFood,
  readParams,
  readPlateParams,
  readVersions,
  snapLawn,
  versionMessage,
  versionState,
  versionUrl,
  writeFood,
} from './params';

describe('readParams', () => {
  it('reads nothing from an empty query', () => {
    expect(readParams('')).toEqual({
      neuron: null,
      yaw: null,
      pitch: null,
      distance: null,
      target: {},
      noRender: false,
      colour: 'activity',
    });
  });

  it('starts the graph on class colours only when asked', () => {
    expect(readParams('?colour=class').colour).toBe('class');
    expect(readParams('?colour=activity').colour).toBe('activity');
    expect(readParams('?colour=CLASS').colour).toBe('activity');
  });

  it('reads a neuron, the camera in degrees, its target and norender', () => {
    const p = readParams('?neuron=AVAL&yaw=90&pitch=-45&dist=7.5&tx=-3.3&tz=0&norender=1');
    expect(p.neuron).toBe('AVAL');
    expect(p.yaw).toBeCloseTo(Math.PI / 2, 12);
    expect(p.pitch).toBeCloseTo(-Math.PI / 4, 12);
    expect(p.distance).toBe(7.5);
    expect(p.target).toEqual({ 0: -3.3, 2: 0 });
    expect(p.noRender).toBe(true);
  });

  it("keeps pitch within the camera's limit, and draws unless norender is 1", () => {
    expect(readParams('?pitch=90').pitch).toBeCloseTo(PITCH_LIMIT, 12);
    expect(readParams('?pitch=-120').pitch).toBeCloseTo(-PITCH_LIMIT, 12);
    expect(readParams('?norender=0').noRender).toBe(false);
    expect(readParams('?norender').noRender).toBe(false);
    expect(readParams('?neuron=%20').neuron).toBeNull();
  });

  it('ignores values that are not numbers, and distances that are not positive', () => {
    const p = readParams('?yaw=left&pitch=&dist=-2&tx=NaN');
    expect([p.yaw, p.pitch, p.distance]).toEqual([null, null, null]);
    expect(p.target).toEqual({});
  });
});

describe('applyTarget', () => {
  it('replaces only the axes given', () => {
    expect(applyTarget([1, 2, 3], { 1: 9 })).toEqual([1, 9, 3]);
    expect(applyTarget([1, 2, 3], {})).toEqual([1, 2, 3]);
  });
});

describe('readPlateParams', () => {
  it('starts split, running, with a random seed and the default field of view', () => {
    expect(readPlateParams('')).toEqual({
      layout: 'split',
      seed: null,
      time: 0,
      paused: false,
      speed: 1,
      span: null,
      centre: null,
      stats: false,
      food: null,
      foodIgnored: false,
    });
  });

  it('reads a layout, a seed, a start time, a pause, a field of view in millimetres and the stats', () => {
    expect(readPlateParams('?view=plate&seed=42&t=12.5&paused=1&speed=10&span=110&cx=45&cy=-2&stats=1')).toEqual({
      layout: 'plate',
      seed: 42,
      time: 12.5,
      paused: true,
      speed: 10,
      span: 0.11,
      centre: [0.045, -0.002],
      stats: true,
      food: null,
      foodIgnored: false,
    });
    expect(readPlateParams('?cx=45').centre).toEqual([0.045, 0]);
    expect(readPlateParams('?cy=-2.5').centre).toEqual([0, -0.0025]);
    expect(readPlateParams('?cx=1e3&cy=0x10').centre).toBeNull();
    expect(readPlateParams('?cx=&cy=').centre).toBeNull();
    expect(readPlateParams('?cx=5000&cy=-5000').centre).toEqual([0.12, -0.12]);
    expect(readPlateParams('?view=graph').layout).toBe('graph');
  });

  it('ignores what it cannot use', () => {
    expect(readPlateParams('?view=both&seed=-3&t=abc&speed=0&span=0')).toEqual({
      layout: 'split',
      seed: null,
      time: 0,
      paused: false,
      speed: 1,
      span: null,
      centre: null,
      stats: false,
      food: null,
      foodIgnored: false,
    });
    expect(readPlateParams('?seed=4294967296').seed).toBeNull();
    expect(readPlateParams('?seed=1e3').seed).toBeNull();
    expect(readPlateParams('?t=100000').time).toBe(600);
    for (const t of ['0x10', '1e2', '-5', ' ']) expect(readPlateParams(`?t=${t}`).time).toBe(0);
    expect(readPlateParams('?speed=1000').speed).toBe(100);
  });
});

describe('the food in the URL', () => {
  it('places lawns at x,y pairs in millimetres from the dish centre, and none for an empty list', () => {
    expect(readFood(null)).toBeNull();
    expect(readFood('')).toEqual([]);
    expect(readFood('45,0')).toEqual([[0.045, 0]]);
    expect(readFood(' 45,0 ; -20.5,10 ')).toEqual([
      [0.045, 0],
      [-0.0205, 0.01],
    ]);
    expect(readPlateParams('?food=0,0').food).toEqual([[0, 0]]);
  });

  it('ignores a list it cannot use whole: off the dish, malformed, or more than eight lawns', () => {
    for (const bad of ['45,0;60,0', '50,0', 'x,1', '1,2,3', '1e1,0', '1;2', Array(9).fill('0,0').join(';')]) {
      expect(readFood(bad), bad).toBeNull();
    }
    expect(readFood(Array(8).fill('0,0').join(';'))).toHaveLength(8);
  });

  it('writes lawns to a tenth of a millimetre, as it reads them', () => {
    const lawns: [number, number][] = [
      [0.045, 0],
      [-0.02051, 0.0100004],
    ];
    expect(writeFood(lawns)).toBe('45,0;-20.5,10');
    expect(readFood(writeFood(lawns))).toEqual([
      [0.045, 0],
      [-0.0205, 0.01],
    ]);
    expect(writeFood([])).toBe('');
  });
});

describe('lawns placed and linked', () => {
  it('are placed to a tenth of a millimetre, pulled inside where rounding would push them past the wall', () => {
    expect(snapLawn([0.012345, -0.00666])).toEqual([0.0123, -0.0067]);
    // 49.96 mm rounds to 50.0, on the wall; it goes to 49.9 instead, and reads back.
    expect(snapLawn([0.04996, 0])).toEqual([0.0499, 0]);
    expect(readFood(writeFood([snapLawn([0.04996, 0]) ?? [0, 0]]))).toEqual([[0.0499, 0]]);
    expect(snapLawn([0.06, 0])).toBeNull();
  });

  it("write the seed and the lawns into the URL, leaving the rest, and the app's first lawn alone out", () => {
    const url = new URL(plateUrl('https://x.test/wormlight/?view=plate&span=110', 42, [[0.045, 0]]));
    expect(url.searchParams.get('seed')).toBe('42');
    expect(url.searchParams.get('food')).toBeNull();
    expect(url.searchParams.get('span')).toBe('110');
    expect(url.pathname).toBe('/wormlight/');
    const more = new URL(
      plateUrl(url.toString(), 7, [
        [0.045, 0],
        [-0.02, 0.01],
      ]),
    );
    expect([more.searchParams.get('seed'), more.searchParams.get('food')]).toEqual(['7', '45,0;-20,10']);
    expect(new URL(plateUrl(more.toString(), 7, [])).searchParams.get('food')).toBe('');
  });

  it('say when a link held food that could not be read', () => {
    expect(readPlateParams('?food=60,0')).toMatchObject({ food: null, foodIgnored: true });
    expect(readPlateParams('?food=45.04,0')).toMatchObject({ food: [[0.045, 0]], foodIgnored: false });
  });
});

describe("About the science's URL", () => {
  it('opens from ?about=science, and writes and clears it, keeping the rest', () => {
    expect(aboutAsked('?seed=4&about=science')).toBe(true);
    expect(aboutAsked('?about=1')).toBe(false);
    const open = aboutUrl('https://example.org/app/?seed=4', true);
    expect(new URL(open).searchParams.get('about')).toBe('science');
    expect(new URL(open).searchParams.get('seed')).toBe('4');
    expect(new URL(aboutUrl(open, false)).search).toBe('?seed=4');
  });
});

describe("the versions in a link's URL", () => {
  const now = { model: 2, data: '5e1f0c9a' };

  it('reads each as given, empty as none, and writes this version, keeping the rest', () => {
    expect(readVersions('?model=1&data=3F9A2C1D')).toEqual({ model: '1', data: '3F9A2C1D' });
    expect(readVersions('?seed=4&model=')).toEqual({ model: null, data: null });
    const url = new URL(versionUrl('https://example.org/app/?seed=4&model=1&data=00000000', now));
    expect(url.search).toBe('?seed=4&model=2&data=5e1f0c9a');
  });

  it('takes a whole number with leading zeros as a model version, and anything else as unreadable', () => {
    expect(versionState({ model: '0000000002', data: null }, now).model).toBe('same');
    expect(versionState({ model: '0000000001', data: null }, now).model).toBe('other');
    for (const model of ['1.0', '-1', 'x', '99999999999999999999']) {
      expect(versionState({ model, data: null }, now).model, model).toBe('unreadable');
    }
    expect(versionState({ model: null, data: '5E1F0C9A' }, now).data).toBe('same');
    expect(versionState({ model: null, data: '5e1f0c9' }, now).data).toBe('unreadable');
  });

  it('says nothing of a link with no versions, or with these', () => {
    expect(versionMessage({ model: null, data: null }, now)).toBeNull();
    expect(versionMessage({ model: '2', data: '5E1F0C9A' }, now)).toBeNull();
    expect(versionMessage({ model: '02', data: null }, now)).toBeNull();
  });

  it('names both versions where they differ, and does not repeat one it cannot read', () => {
    const end = ', so the worm may behave differently from when it was shared.';
    expect(versionMessage({ model: '1', data: '5e1f0c9a' }, now)).toBe(
      `This link was made with model version 1; the app now runs model version 2${end}`,
    );
    expect(versionMessage({ model: '2', data: '3f9a2c1d' }, now)).toBe(
      `This link was made with data version 3f9a2c1d; the app now runs on data version 5e1f0c9a${end}`,
    );
    expect(versionMessage({ model: '1', data: '3f9a2c1d' }, now)).toBe(
      'This link was made with model version 1 and data version 3f9a2c1d; the app now runs model version 2 on ' +
        `data version 5e1f0c9a${end}`,
    );
    expect(versionMessage({ model: 'x<b>', data: 'beta' }, now)).toBe(
      "This link's model and data versions can't be read; the app now runs model version 2 on data version " +
        `5e1f0c9a${end}`,
    );
    expect(versionMessage({ model: '1', data: 'beta' }, now)).toBe(
      "This link was made with model version 1, and its data version can't be read; the app now runs model version " +
        `2 on data version 5e1f0c9a${end}`,
    );
    expect(versionMessage({ model: 'x', data: null }, now)).toBe(
      `This link's model version can't be read; the app now runs model version 2${end}`,
    );
  });
});
