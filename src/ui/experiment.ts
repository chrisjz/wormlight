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

// A change from one experiment to another, in words: the swap, the neuron ablated or restored, or, for more than
// one of those, "that change".
export function describeChange(from: Experiment, to: Experiment): string {
  const added = to.lesions.filter((n) => !from.lesions.includes(n));
  const removed = from.lesions.filter((n) => !to.lesions.includes(n));
  const brain = from.brain !== to.brain;
  if (brain && added.length + removed.length === 0)
    return `the swap to ${to.brain === 0 ? 'the real wiring' : brainName(to.brain)}`;
  if (!brain && added.length === 1 && removed.length === 0) return `ablating ${added[0]}`;
  if (!brain && removed.length === 1 && added.length === 0) return `restoring ${removed[0]}`;
  if (!brain && added.length === 0 && to.lesions.length === 0) return 'restoring every lesioned neuron';
  return 'that change';
}

// The lesions as a status line gives them: the first few by name, and how many more.
export function lesionSummary(lesions: readonly string[], named = 6): string {
  const more = lesions.length - named;
  return `Lesioned: ${lesions.slice(0, named).join(', ')}${more > 0 ? ` and ${more} more` : ''}.`;
}

export const sameExperiment = (a: Experiment, b: Experiment): boolean =>
  a.brain === b.brain && a.lesions.length === b.lesions.length && a.lesions.every((name, i) => name === b.lesions[i]);

// ?brain= and ?lesions=: a brain other than the rewirings reads as the real wiring, and names that aren't neurons
// are left out, each reported. Names are separated by spaces (a + in the URL) or commas; they and the brain match
// whatever their case, and each name counts once.
export function readExperiment(search: string, data: WormlightData): { experiment: Experiment; unread: Unread } {
  const p = new URLSearchParams(search);
  const brainText = p.get('brain')?.trim() ?? '';
  const m = /^rewired-(\d+)$/i.exec(brainText);
  const k = m ? Number(m[1]) : NaN;
  const brain = Number.isInteger(k) && k >= 1 && k <= CONTRAST.rewirings ? k : 0;
  const unreadBrain = brainText !== '' && brainText.toLowerCase() !== 'real' && brain === 0 ? brainText : null;
  const named = (p.get('lesions') ?? '').split(/[\s,]+/).filter((s) => s !== '');
  const known = new Map(data.neurons.map((n) => [n.name.toUpperCase(), n.name]));
  const found = new Set(named.flatMap((s) => known.get(s.toUpperCase()) ?? []));
  return {
    experiment: { brain, lesions: data.neurons.flatMap((n) => (found.has(n.name) ? [n.name] : [])) },
    unread: { brain: unreadBrain, lesions: named.filter((s) => !known.has(s.toUpperCase())) },
  };
}

// What to tell a viewer whose link held an experiment it couldn't all be read, or null if it could. The app shows
// it, so it repeats nothing of the link's but a few words shaped like a neuron's name (PLAN §1): a link can't put
// words of its own on the page.
export const REPEATED = 3;
const nameLike = (s: string): boolean => /^[A-Za-z0-9]{1,6}$/.test(s);
export function unreadMessage(unread: Unread): string | null {
  const parts: string[] = [];
  if (unread.brain !== null)
    parts.push("The link's brain isn't one of the app's, so the worm runs on the real wiring.");
  const n = unread.lesions.length;
  if (n > 0) {
    const named = n <= REPEATED && unread.lesions.every(nameLike);
    parts.push(
      !named
        ? `The link lesions ${n} ${n === 1 ? "name that isn't a neuron, so that was" : "names that aren't neurons, so those were"} left out.`
        : n === 1
          ? `The link lesions ${unread.lesions[0]}, which isn't a neuron, so that was left out.`
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
  private readonly listeners = new Set<(experiment: Experiment, reverted: boolean) => void>();
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

  // Change the experiment. `reverted` marks a change undone because it couldn't be made, as when the GPU can't build
  // the new brain, so that listeners can say so rather than announce it.
  set(next: Experiment, reverted = false): void {
    for (const name of next.lesions) if (!this.order.has(name)) throw new Error(`unknown neuron ${name} to lesion`);
    if (!Number.isInteger(next.brain) || next.brain < 0 || next.brain > CONTRAST.rewirings) {
      throw new Error(`there is no brain ${next.brain}`);
    }
    const lesions = [...new Set(next.lesions)].sort((a, b) => (this.order.get(a) ?? 0) - (this.order.get(b) ?? 0));
    const experiment = { brain: next.brain, lesions };
    if (sameExperiment(experiment, this.current)) return;
    this.current = experiment;
    for (const listener of this.listeners) listener(experiment, reverted);
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

  // Call `listener` after each change, with whether it undid one; returns what stops it.
  subscribe(listener: (experiment: Experiment, reverted: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
