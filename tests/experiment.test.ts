// The experiment both views share (spec §6): the brain and the lesions, and how a link carries them.

import { describe, expect, it } from 'vitest';
import { validateWormlightData } from '../src/data/schema.ts';
import { cookNetwork } from '../src/sim/brain/network.ts';
import { contrastData } from '../src/sim/brain/rewire.ts';
import {
  experimentUrl,
  ExperimentStore,
  INTACT,
  readExperiment,
  unreadMessage,
  type Experiment,
} from '../src/ui/experiment.ts';
import { readJson } from './checks.ts';

const data = validateWormlightData(readJson('public/data/wormlight.v1.json'));

describe("a link's experiment", () => {
  it("reads the brain and the lesions, in the data's order, whatever their case", () => {
    const { experiment, unread } = readExperiment('?brain=rewired-3&lesions=avar,AVAL+AVAL', data);
    expect(experiment).toEqual({ brain: 3, lesions: ['AVAL', 'AVAR'] });
    expect(unread).toEqual({ brain: null, lesions: [] });
    expect(unreadMessage(unread)).toBeNull();
  });

  it('is the intact real wiring when the link has none', () => {
    expect(readExperiment('?seed=4', data).experiment).toEqual(INTACT);
    expect(readExperiment('?brain=real&lesions=', data).experiment).toEqual(INTACT);
  });

  it('leaves out what it cannot read, and says so', () => {
    for (const brain of ['rewired-0', 'rewired-11', 'rewired-2.5', 'null', 'Rewired-1']) {
      const { experiment, unread } = readExperiment(`?brain=${brain}&lesions=AVAL,XYZ`, data);
      expect(experiment, brain).toEqual({ brain: 0, lesions: ['AVAL'] });
      expect(unread, brain).toEqual({ brain, lesions: ['XYZ'] });
      expect(unreadMessage(unread)).toMatch(/runs on the real wiring.*XYZ, which isn't a neuron/);
    }
    expect(unreadMessage({ brain: null, lesions: ['A', 'B'] })).toMatch(/A, B, which aren't neurons/);
  });

  it('writes the experiment into the URL, keeping the rest, and reads it back', () => {
    const experiment: Experiment = { brain: 7, lesions: ['AVBL', 'PVCR'] };
    const href = experimentUrl('https://example.org/app/?seed=5&food=', experiment);
    expect(href).toContain('lesions=AVBL+PVCR');
    const url = new URL(href);
    expect(url.searchParams.get('seed')).toBe('5');
    expect(url.searchParams.get('food')).toBe('');
    expect(readExperiment(url.search, data).experiment).toEqual(experiment);
    const intact = new URL(experimentUrl(href, INTACT));
    expect(intact.searchParams.has('brain')).toBe(false);
    expect(intact.searchParams.has('lesions')).toBe(false);
  });
});

describe('the experiment store', () => {
  it('tells its listeners of each change, and not of a change to the same experiment', () => {
    const store = new ExperimentStore(data);
    const heard: Experiment[] = [];
    const stop = store.subscribe((e) => heard.push(e));
    store.lesion('AVAR');
    store.lesion('AVAL');
    store.lesion('AVAL');
    store.setBrain(2);
    store.restore('AVAR');
    store.setBrain(2);
    expect(heard).toEqual([
      { brain: 0, lesions: ['AVAR'] },
      { brain: 0, lesions: ['AVAL', 'AVAR'] },
      { brain: 2, lesions: ['AVAL', 'AVAR'] },
      { brain: 2, lesions: ['AVAL'] },
    ]);
    expect(store.isLesioned('AVAL')).toBe(true);
    store.restoreAll();
    expect(store.get()).toEqual({ brain: 2, lesions: [] });
    stop();
    store.lesion('AVAL');
    expect(heard).toHaveLength(5);
  });

  it('refuses a neuron or a brain there is not', () => {
    const store = new ExperimentStore(data);
    expect(() => store.lesion('XYZ')).toThrow(/unknown neuron/);
    expect(() => store.setBrain(11)).toThrow(/no brain 11/);
    expect(() => store.setBrain(1.5)).toThrow(/no brain/);
    expect(store.get()).toEqual(INTACT);
  });

  it("makes each brain's data and network once, the real wiring's from the data itself", () => {
    const store = new ExperimentStore(data);
    expect(store.brains.data(0)).toBe(data);
    expect(store.brains.network(0)).toEqual(cookNetwork(data));
    expect(store.brains.data(4)).toBe(store.brains.data(4));
    expect(store.brains.data(4).chemical).toEqual(contrastData(data, 4).chemical);
    expect(store.brains.network(4)).toEqual(cookNetwork(contrastData(data, 4)));
  });
});
