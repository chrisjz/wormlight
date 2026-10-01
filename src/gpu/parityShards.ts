// GPU parity's checks dealt across shards, each a page of its own, so that a software GPU that runs a world's
// workgroup on one CPU core can use several (PLAN §7.2; DECISIONS.md, 2026-10-01). Only the one-second checks are
// dealt, round-robin by their place in the full run: they take nearly all the time, about 400 GPU steps each. Every
// shard runs everything else, which is cheap and deterministic, so the shards agree on it. The pass rules are here,
// so the page and the merge apply the same ones; the share of ungraded states is taken over the merged run.

import { MOST_ILL_POSED } from './parityCases.ts';

export interface Shard {
  // From 0, of `count`.
  index: number;
  count: number;
}
export const WHOLE: Shard = { index: 0, count: 1 };

// "k/n", k from 1 to n, as a page's query and the runner write it; none, the whole run.
export function parseShard(text: string | null): Shard {
  if (text === null) return WHOLE;
  const found = /^([1-9][0-9]*)\/([1-9][0-9]*)$/.exec(text);
  const [k, n] = found ? [Number(found[1]), Number(found[2])] : [0, 0];
  if (!found || k > n) throw new Error(`a shard is k/n with k from 1 to n, not "${text}"`);
  return { index: k - 1, count: n };
}
export const shardText = (shard: Shard): string => `${shard.index + 1}/${shard.count}`;

// Whether a shard runs the one-second check at this place in the full run's order.
export const takes = (shard: Shard, place: number): boolean => place % shard.count === shard.index;

// The full run's list from the shards' lists, each in the full run's order: the place k is shard k mod n's
// (k div n)-th. Each shard's list must be as long as the deal makes it.
export function interleave<T>(lists: readonly (readonly T[])[]): T[] {
  const n = lists.length;
  const total = lists.reduce((sum, list) => sum + list.length, 0);
  lists.forEach((list, i) => {
    const dealt = Math.ceil((total - i) / n);
    if (list.length !== dealt) throw new Error(`shard ${i + 1} of ${n} has ${list.length} results, not ${dealt}`);
  });
  return Array.from({ length: total }, (_, k) => lists[k % n][Math.floor(k / n)]);
}

interface Passing {
  pass: boolean;
}
interface Graded extends Passing {
  graded: boolean;
}

// Whether no more than the allowed share of the one-second states is ungraded (PLAN §7.2).
export const mostlyGraded = (oneSecond: readonly Graded[]): boolean =>
  oneSecond.filter((r) => !r.graded).length <= MOST_ILL_POSED * oneSecond.length;

export interface BrainChecks {
  noise: Passing;
  api: readonly Passing[];
  oneStep: readonly Passing[];
  oneSecond: readonly Graded[];
  variant: { oneStep: Passing; oneSecond: Graded };
}
export const brainPasses = (r: BrainChecks): boolean =>
  r.noise.pass &&
  r.api.every((x) => x.pass) &&
  r.oneStep.every((x) => x.pass) &&
  r.oneSecond.every((x) => x.pass) &&
  mostlyGraded(r.oneSecond) &&
  r.variant.oneStep.pass &&
  r.variant.oneSecond.graded &&
  r.variant.oneSecond.pass;

export interface LoopChecks {
  api: readonly Passing[];
  oneStep: readonly Passing[];
  oneSecond: readonly Graded[];
}
export const loopPasses = (r: LoopChecks): boolean =>
  r.api.every((x) => x.pass) &&
  r.oneStep.every((x) => x.pass) &&
  r.oneSecond.every((x) => x.pass) &&
  mostlyGraded(r.oneSecond);

// What a shard's page reports, as far as the merge needs it: the brain's checks at the top, the loop's and the
// field's below, each of those an error if it stopped.
export interface ShardReport extends BrainChecks {
  shard: Shard;
  loop: (LoopChecks & { pass: boolean; seconds: number }) | { error: string; pass: false };
  field: Passing;
  brainPass: boolean;
  pass: boolean;
  seconds: number;
}

// The full run from its shards, given in order: the first shard's report with every shard's one-second results
// dealt back into place, and the pass rules applied again. What every shard runs whole must pass in each, and the
// odour field's check is the first shard's.
export function mergeShards<R extends ShardReport>(reports: readonly R[]): R {
  const [first] = reports;
  if (!first) throw new Error('no shards to merge');
  reports.forEach((r, i) => {
    if (r.shard.index !== i || r.shard.count !== reports.length) {
      throw new Error(`shard ${i + 1} of ${reports.length} reported itself as ${shardText(r.shard)}`);
    }
  });
  const whole = (b: BrainChecks): boolean =>
    b.noise.pass &&
    b.api.every((x) => x.pass) &&
    b.oneStep.every((x) => x.pass) &&
    b.variant.oneStep.pass &&
    b.variant.oneSecond.graded &&
    b.variant.oneSecond.pass;
  const oneSecond = interleave(reports.map((r) => r.oneSecond));
  const brainPass = brainPasses({ ...first, oneSecond }) && reports.every(whole);
  let loop: R['loop'];
  const stopped = reports.flatMap((r, i) => ('error' in r.loop ? [`shard ${i + 1}: ${r.loop.error}`] : []));
  if (stopped.length > 0) {
    loop = { error: stopped.join('; '), pass: false };
  } else {
    const loops = reports.map((r) => r.loop as LoopChecks & { pass: boolean; seconds: number });
    const merged = { ...loops[0], oneSecond: interleave(loops.map((l) => l.oneSecond)) };
    const shared = loops.every((l) => l.api.every((x) => x.pass) && l.oneStep.every((x) => x.pass));
    loop = { ...merged, pass: loopPasses(merged) && shared, seconds: Math.max(...loops.map((l) => l.seconds)) };
  }
  return {
    ...first,
    shard: WHOLE,
    oneSecond,
    brainPass,
    loop,
    pass: brainPass && loop.pass && first.field.pass,
    seconds: Math.max(...reports.map((r) => r.seconds)),
  };
}
