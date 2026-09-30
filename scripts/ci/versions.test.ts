import { describe, expect, it } from 'vitest';
import { historyProblem, type Pinned } from './versions.ts';

const entry = (model: number, data: string, print: string): Pinned => ({ model, data, prints: [print] });

describe("the model versions' history", () => {
  const main = [entry(1, 'aaaaaaaa', 'p1'), entry(2, 'aaaaaaaa', 'p2')];

  it('may grow, or stay as it is', () => {
    expect(historyProblem(main, main)).toBeNull();
    expect(historyProblem(main, [...main, entry(2, 'bbbbbbbb', 'p3')])).toBeNull();
    expect(historyProblem([], [entry(1, 'aaaaaaaa', 'p1')])).toBeNull();
  });

  it('may not change or lose an entry', () => {
    expect(historyProblem(main, [main[0], entry(2, 'aaaaaaaa', 'edited')])).toBe(
      'entry 2 (model 2, data aaaaaaaa) changed',
    );
    expect(historyProblem(main, [main[0]])).toBe('entry 2 (model 2, data aaaaaaaa) was removed');
    expect(historyProblem(main, [main[1], main[0]])).toMatch(/^entry 1 .* changed$/);
  });
});
