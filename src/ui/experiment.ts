// The experiment a viewer sets up (spec §6): which brain runs the worm, the real wiring or one of the contrast
// brain's rewirings (PLAN §3.5), and which neurons are lesioned. Both views share one: the graph's inspector
// lesions and restores neurons, and the plate's controls choose the brain. A link carries it as ?brain=rewired-3
// and ?lesions=AVAL+AVAR, left out while the brain is the real wiring and nothing is lesioned.

import type { WormlightData } from '../data/schema.ts';
import { cookNetwork, type Network } from '../sim/brain/network.ts';
import { CONTRAST, contrastData } from '../sim/brain/rewire.ts';

export interface Experiment {
  // 0 for the real wiring, k for the contrast brain's rewiring k.
  brain: number;
  // The lesioned neurons, in the data's order.
  lesions: readonly string[];
}

export const INTACT: Experiment = { brain: 0, lesions: [] };

// What a link's experiment couldn't be read as: a brain that isn't one, and names that aren't neurons.
export interface Unread {
  brain: string | null;
  lesions: string[];
}

export const brainName = (brain: number): string => (brain === 0 ? 'Real wiring' : `Rewired ${brain}`);

export const sameExperiment = (a: Experiment, b: Experiment): boolean =>
  a.brain === b.brain && a.lesions.length === b.lesions.length && a.lesions.every((name, i) => name === b.lesions[i]);

// ?brain= and ?lesions=: a brain other than the rewirings reads as the real wiring, and names that aren't neurons
// are left out, each reported. Names are separated by spaces (a + in the URL) or commas, match whatever their case,
// and each counts once.
export function readExperiment(search: string, data: WormlightData): { experiment: Experiment; unread: Unread } {
  const p = new URLSearchParams(search);
  const brainText = p.get('brain')?.trim() ?? '';
  const m = /^rewired-(\d+)$/.exec(brainText);
  const k = m ? Number(m[1]) : NaN;
  const brain = Number.isInteger(k) && k >= 1 && k <= CONTRAST.rewirings ? k : 0;
  const unreadBrain = brainText !== '' && brainText !== 'real' && brain === 0 ? brainText : null;
  const named = (p.get('lesions') ?? '').split(/[\s,]+/).filter((s) => s !== '');
  const known = new Map(data.neurons.map((n) => [n.name.toUpperCase(), n.name]));
  const found = new Set(named.flatMap((s) => known.get(s.toUpperCase()) ?? []));
  return {
    experiment: { brain, lesions: data.neurons.flatMap((n) => (found.has(n.name) ? [n.name] : [])) },
    unread: { brain: unreadBrain, lesions: named.filter((s) => !known.has(s.toUpperCase())) },
  };
}

// What to tell a viewer whose link held an experiment it couldn't all be read, or null if it could.
export function unreadMessage(unread: Unread): string | null {
  const parts: string[] = [];
  if (unread.brain !== null)
    parts.push(`The link's brain, ${unread.brain}, isn't one of the app's, so the worm runs on the real wiring.`);
  if (unread.lesions.length > 0) {
    const [one] = unread.lesions;
    parts.push(
      unread.lesions.length === 1
        ? `The link lesions ${one}, which isn't a neuron, so that was left out.`
        : `The link lesions ${unread.lesions.join(', ')}, which aren't neurons, so those were left out.`,
    );
  }
  return parts.length > 0 ? parts.join(' ') : null;
}

// The page's URL with the experiment in it; its other parameters stay as they are.
export function experimentUrl(href: string, experiment: Experiment): string {
  const url = new URL(href);
  if (experiment.brain === 0) url.searchParams.delete('brain');
  else url.searchParams.set('brain', `rewired-${experiment.brain}`);
  if (experiment.lesions.length === 0) url.searchParams.delete('lesions');
  else url.searchParams.set('lesions', experiment.lesions.join(' '));
  return url.toString();
}

// The data for a brain: the runtime data, or the contrast brain's rewiring in place of its chemical synapses.
// Each is made once.
export class Brains {
  private readonly made = new Map<number, { data: WormlightData; network: Network }>();
  private readonly real: WormlightData;

  constructor(real: WormlightData) {
    this.real = real;
  }

  private get(brain: number): { data: WormlightData; network: Network } {
    let entry = this.made.get(brain);
    if (!entry) {
      const data = brain === 0 ? this.real : contrastData(this.real, brain);
      entry = { data, network: cookNetwork(data) };
      this.made.set(brain, entry);
    }
    return entry;
  }

  data(brain: number): WormlightData {
    return this.get(brain).data;
  }

  network(brain: number): Network {
    return this.get(brain).network;
  }
}

// The experiment both views share: whoever changes it tells the others.
export class ExperimentStore {
  private current: Experiment;
  private readonly listeners = new Set<(experiment: Experiment) => void>();
  readonly data: WormlightData;
  readonly brains: Brains;
  private readonly order: Map<string, number>;

  // What the link's experiment held that couldn't be read, for the views to say.
  readonly unread: Unread;

  constructor(data: WormlightData, start: Experiment = INTACT, unread: Unread = { brain: null, lesions: [] }) {
    this.data = data;
    this.unread = unread;
    this.brains = new Brains(data);
    this.order = new Map(data.neurons.map((n, i) => [n.name, i]));
    this.current = start;
  }

  get(): Experiment {
    return this.current;
  }

  isLesioned(name: string): boolean {
    return this.current.lesions.includes(name);
  }

  set(next: Experiment): void {
    for (const name of next.lesions) if (!this.order.has(name)) throw new Error(`unknown neuron ${name} to lesion`);
    if (!Number.isInteger(next.brain) || next.brain < 0 || next.brain > CONTRAST.rewirings) {
      throw new Error(`there is no brain ${next.brain}`);
    }
    const lesions = [...new Set(next.lesions)].sort((a, b) => (this.order.get(a) ?? 0) - (this.order.get(b) ?? 0));
    const experiment = { brain: next.brain, lesions };
    if (sameExperiment(experiment, this.current)) return;
    this.current = experiment;
    for (const listener of this.listeners) listener(experiment);
  }

  setBrain(brain: number): void {
    this.set({ ...this.current, brain });
  }

  lesion(name: string): void {
    this.set({ ...this.current, lesions: [...this.current.lesions, name] });
  }

  restore(name: string): void {
    this.set({ ...this.current, lesions: this.current.lesions.filter((n) => n !== name) });
  }

  restoreAll(): void {
    this.set({ ...this.current, lesions: [] });
  }

  // Call `listener` after each change; returns what stops it.
  subscribe(listener: (experiment: Experiment) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
