// GPU parity dealt across shards (DECISIONS.md, 2026-10-02): the deal, the merge and the pass rules, which the page
// and the merge share.

import { describe, expect, it } from 'vitest';
import { MOST_ILL_POSED } from '../src/gpu/parityCases.ts';
import {
  interleave,
  mergeShards,
  parseShard,
  shardText,
  takes,
  WHOLE,
  type Shard,
  type ShardReport,
} from '../src/gpu/parityShards.ts';

describe('the deal', () => {
  it('reads a shard as k of n from 1, and the whole run without one', () => {
    expect(parseShard('2/4')).toEqual({ index: 1, count: 4 });
    expect(parseShard(null)).toEqual(WHOLE);
    expect(shardText({ index: 3, count: 4 })).toBe('4/4');
    for (const bad of ['0/4', '5/4', '1/0', 'a/b', '2', '1/4/2']) expect(() => parseShard(bad), bad).toThrow(/k\/n/);
  });

  it('gives every place to exactly one shard, and interleaving puts the full run back in order', () => {
    for (const count of [1, 2, 3, 4, 7]) {
      const places = Array.from({ length: 145 }, (_, k) => k);
      const lists = Array.from({ length: count }, (_, index) => places.filter((k) => takes({ index, count }, k)));
      expect(lists.flat().sort((a, b) => a - b)).toEqual(places);
      expect(interleave(lists, places.length)).toEqual(places);
    }
  });

  it('refuses shards whose lists the deal could not have made, or that are short of the run', () => {
    expect(() => interleave([[0, 3], [1], [2, 4]], 5)).toThrow(/shard 2 of 3 has 1 results, not 2/);
    expect(() => interleave([[0], [1, 3]], 3)).toThrow(/shard 1 of 2/);
    // A last shard short by its final result looks like a deal of 7, but the run has 8.
    expect(() => interleave([[0, 4], [1, 5], [2, 6], [3]], 8)).toThrow(/hold 7 results of the run's 8/);
  });
});

// A shard's report of a run with `places` one-second states in the brain and in the loop, `ungraded` of them
// ungraded at the given places, each check passing unless the shard is told otherwise.
interface Placed {
  place: number;
  graded: boolean;
  pass: boolean;
}
interface TestReport extends ShardReport {
  oneSecond: Placed[];
}
function shard(
  s: Shard,
  places: number,
  ungraded: readonly number[] = [],
  options: { apiFails?: boolean; loopStops?: boolean; fieldFails?: boolean; places?: number } = {},
): TestReport {
  const seconds = Array.from({ length: places }, (_, place) => ({
    place,
    graded: !ungraded.includes(place),
    pass: true,
  })).filter((r) => takes(s, r.place));
  const pass = { pass: true };
  return {
    shard: s,
    noise: pass,
    api: [{ pass: !options.apiFails }],
    oneStep: [pass, pass],
    oneSecond: seconds,
    oneSecondPlaces: options.places ?? places,
    variant: { oneStep: pass, oneSecond: { graded: true, pass: true } },
    loop: options.loopStops
      ? { error: 'the GPU was lost', pass: false }
      : {
          api: [pass],
          oneStep: [pass],
          oneSecond: seconds,
          oneSecondPlaces: places,
          pass: true,
          seconds: 10 * (s.index + 1),
        },
    field: { pass: !options.fieldFails },
    brainPass: true,
    pass: true,
    seconds: 10 * (s.index + 1),
  };
}
const shards = (count: number, places: number, ungraded: readonly number[] = []) =>
  Array.from({ length: count }, (_, index) => shard({ index, count }, places, ungraded));

describe('the merge', () => {
  it('puts every one-second result back in place, and takes the slowest shard as the run', () => {
    const merged = mergeShards(shards(4, 21));
    expect(merged.oneSecond.map((r) => r.place)).toEqual(Array.from({ length: 21 }, (_, k) => k));
    expect(merged.shard).toEqual(WHOLE);
    expect(merged.pass).toBe(true);
    expect(merged.seconds).toBe(40);
    expect('error' in merged.loop ? null : merged.loop.seconds).toBe(40);
  });

  it('applies the ungraded share to the merged run, not to each shard', () => {
    // Five of 20 states ungraded is the most allowed, though all five land in one shard of four.
    const most = Math.floor(MOST_ILL_POSED * 20);
    const ungraded = Array.from({ length: most }, (_, k) => 4 * k);
    expect(mergeShards(shards(4, 20, ungraded)).pass).toBe(true);
    expect(mergeShards(shards(4, 20, [...ungraded, 1])).pass).toBe(false);
    expect(mergeShards(shards(4, 20, [...ungraded, 1])).brainPass).toBe(false);
  });

  it('fails when any shard fails a check it runs whole, or its loop stops', () => {
    const failing = shards(3, 12);
    failing[2] = shard({ index: 2, count: 3 }, 12, [], { apiFails: true });
    expect(mergeShards(failing)).toMatchObject({ brainPass: false, pass: false });
    const stopped = shards(3, 12);
    stopped[1] = shard({ index: 1, count: 3 }, 12, [], { loopStops: true });
    const merged = mergeShards(stopped);
    expect(merged.pass).toBe(false);
    expect(merged.loop).toEqual({ error: 'shard 2: the GPU was lost', pass: false });
  });

  it("fails when a later shard's odour field fails, and names the shard", () => {
    const reports = shards(3, 12);
    reports[2] = shard({ index: 2, count: 3 }, 12, [], { fieldFails: true });
    const merged = mergeShards(reports);
    expect(merged.pass).toBe(false);
    expect(merged.field.pass).toBe(false);
    expect(merged.shardFailures).toEqual(['shard 3: the odour field']);
    expect(mergeShards(shards(3, 12)).shardFailures).toEqual([]);
  });

  it('refuses shards that counted different runs', () => {
    const reports = shards(2, 12);
    reports[1] = shard({ index: 1, count: 2 }, 12, [], { places: 13 });
    expect(() => mergeShards(reports)).toThrow(/counted 12, 13 brain one-second places/);
  });

  it('refuses shards out of order or of another deal', () => {
    const swapped = shards(3, 12);
    [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
    expect(() => mergeShards(swapped)).toThrow(/reported itself as 2\/3/);
    expect(() => mergeShards([])).toThrow(/no shards/);
  });

  it('leaves a whole run as it is', () => {
    const [whole] = shards(1, 21);
    expect(mergeShards([whole]).oneSecond).toEqual(whole.oneSecond);
  });
});
