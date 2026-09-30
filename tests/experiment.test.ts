// The experiment both views share (spec §6): the brain and the lesions, and how a link carries them.

import { describe, expect, it } from 'vitest';
import { validateWormlightData } from '../src/data/schema.ts';
import { cookNetwork } from '../src/sim/brain/network.ts';
import { contrastData } from '../src/sim/brain/rewire.ts';
import {
  experimentUrl,
  ExperimentStore,
  describeChange,
  INTACT,
  lesionSummary,
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
    expect(readExperiment('?brain=Real', data).unread.brain).toBeNull();
  });

  it('reads the brain whatever its case', () => {
    expect(readExperiment('?brain=REWIRED-4', data).experiment.brain).toBe(4);
  });

  it('leaves out what it cannot read, and says so', () => {
    for (const brain of ['rewired-0', 'rewired-11', 'rewired-2.5', 'null', 'rewired 1']) {
      const { experiment, unread } = readExperiment(`?brain=${brain}&lesions=AVAL,XYZ`, data);
      expect(experiment, brain).toEqual({ brain: 0, lesions: ['AVAL'] });
      expect(unread, brain).toEqual({ brain, lesions: ['XYZ'] });
      expect(unreadMessage(unread)).toMatch(/runs on the real wiring.*XYZ, which isn't a neuron/);
    }
    expect(unreadMessage({ brain: null, lesions: ['A', 'B'] })).toMatch(/A, B, which aren't neurons/);
  });

  it("repeats nothing of the link's but a few names, so a link can't put words on the page", () => {
    const brain = 'the real wiring was retracted; see evil.example';
    const said = unreadMessage(readExperiment(`?brain=${encodeURIComponent(brain)}`, data).unread) ?? '';
    expect(said).toBe("The link's brain isn't one of the app's, so the worm runs on the real wiring.");
    expect(unreadMessage({ brain: null, lesions: ['Your', 'GPU', 'is', 'unsafe'] })).toBe(
      "The link lesions 4 names that aren't neurons, so those were left out.",
    );
    expect(unreadMessage({ brain: null, lesions: ['evil.example'] })).toBe(
      "The link lesions 1 name that isn't a neuron, so that was left out.",
    );
    expect(unreadMessage({ brain: null, lesions: ['XYZ', 'QQ1', 'ABCDEF'] })).toMatch(/XYZ, QQ1, ABCDEF, which/);
    expect(Math.max(...data.neurons.map((n) => n.name.length))).toBeLessThanOrEqual(6);
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

describe('a change in words', () => {
  it('names a swap, an ablation or a restoration, and calls anything more "that change"', () => {
    const one = { brain: 0, lesions: ['AVAL'] };
    expect(describeChange(INTACT, { brain: 3, lesions: [] })).toBe('the swap to Rewired 3');
    expect(describeChange({ brain: 3, lesions: [] }, INTACT)).toBe('the swap to the real wiring');
    expect(describeChange(INTACT, one)).toBe('ablating AVAL');
    expect(describeChange(one, INTACT)).toBe('restoring AVAL');
    expect(describeChange({ brain: 0, lesions: ['AVAL', 'AVAR'] }, INTACT)).toBe('restoring every lesioned neuron');
    expect(describeChange(INTACT, { brain: 2, lesions: ['AVAL'] })).toBe('that change');
  });
});

describe('the lesions in a status line', () => {
  it('names the first six and counts the rest', () => {
    expect(lesionSummary(['AVAL'])).toBe('Lesioned: AVAL.');
    const many = data.neurons.slice(0, 51).map((n) => n.name);
    expect(lesionSummary(many)).toBe(`Lesioned: ${many.slice(0, 6).join(', ')} and 45 more.`);
    expect(lesionSummary(many.slice(0, 6))).toBe(`Lesioned: ${many.slice(0, 6).join(', ')}.`);
  });
});

describe('the experiment store', () => {
  it('tells its listeners of each change, and not of a change to the same experiment', () => {
    const store = new ExperimentStore(data);
    const heard: Experiment[] = [];
    const reverts: boolean[] = [];
    const stop = store.subscribe((e, reverted) => {
      heard.push(e);
      reverts.push(reverted);
    });
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
    store.set({ brain: 2, lesions: ['AVAL'] }, true);
    expect(reverts).toEqual([false, false, false, false, false, true]);
    stop();
    store.lesion('AVBL');
    expect(heard).toHaveLength(6);
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
    expect(store.brains.network(4)).toBe(store.brains.network(4));
    expect(store.brains.data(4).chemical).toEqual(contrastData(data, 4).chemical);
    expect(store.brains.network(4)).toEqual(cookNetwork(contrastData(data, 4)));
  });
});
