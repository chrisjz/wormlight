// The fidelity ledger as it is written (spec §1.3): the helpers both FIDELITY.md (scripts/docs/page.ts) and the app's
// "About the science" view use to put the registry into words, and the status that heads both, so the two can't
// drift.

import { CHECKS, SUBSYSTEMS, subsystemLevels, type Component, type SubsystemId, type Test } from './fidelity.ts';
import { levelRange, type Tag } from './levels.ts';
import type { Param, Subsystem } from './params.ts';

export const TAG_SYMBOL: Record<Tag, string> = { omitted: '—', presentation: '◇' };
// The parameter registry's groups, by the subsystem each parameter belongs to.
export const PARAM_GROUPS: Record<Subsystem, string> = {
  neural: 'Neurons and synapses',
  sensing: 'Sensing',
  rhythm: 'Rhythm and proprioception',
  muscle: 'Neuromuscular transfer and muscles',
  body: 'Body',
  environment: 'Environment',
};

// A component's levels as the ledger writes them, highest first, or its tag's symbol.
export const levelsText = (levels: Component['levels']): string =>
  typeof levels === 'string' ? TAG_SYMBOL[levels] : levels.join(' / ');

// A subsystem's levels: the range of its components', or its tag's symbol.
export function subsystemRange(id: SubsystemId): string {
  const tag = SUBSYSTEMS[id].tag;
  return tag ? TAG_SYMBOL[tag] : levelRange(subsystemLevels(id));
}

// A number as the page writes it: the shortest digits that identify the value exactly, never rounded,
// with a true minus sign, and in scientific form when very small or very large.
export function formatNumber(v: number): string {
  const minus = (text: string): string => text.replace('-', '−');
  if (v !== 0 && (Math.abs(v) < 0.01 || Math.abs(v) >= 1e6)) {
    const [mantissa, exponent] = v.toExponential().split('e');
    const superscript = exponent
      .replace('+', '')
      .replace('-', '⁻')
      .replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(d)]);
    return `${minus(mantissa)} × 10${superscript}`;
  }
  return minus(String(v));
}

export function formatValue(param: Param): string {
  if (param.value === null) {
    if (param.level !== 1) return 'set by rule';
    return param.provisional === undefined
      ? 'not yet calibrated'
      : `not yet calibrated; provisionally ${formatNumber(param.provisional)}`;
  }
  // A calibrated value is the fit's, unrounded in the registry; the page shows it to three significant figures.
  return formatNumber(param.level === 1 ? Number(param.value.toPrecision(3)) : param.value);
}

// Plain checkpoints folded into ranges: "Checkpoint 4", "Checkpoints 2 and 3", "Checkpoints 1–6".
export function checkpoints(numbers: readonly number[]): string {
  const sorted = [...new Set(numbers)].sort((a, b) => a - b);
  if (sorted.length === 1) return `Checkpoint ${sorted[0]}`;
  const runs: number[][] = [];
  for (const n of sorted) {
    const run = runs.at(-1);
    if (run && n === (run.at(-1) ?? NaN) + 1) run.push(n);
    else runs.push([n]);
  }
  const parts = runs.flatMap((run) => (run.length >= 3 ? [`${run[0]}–${run.at(-1)}`] : run.map(String)));
  return `Checkpoints ${parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`}`;
}

// The checks a component lists, in order, with its plain checkpoints folded in where the first appears.
export function testedByText(tests: readonly Test[]): string {
  const isPlainCheckpoint = (t: Test): boolean => t.check.startsWith('checkpoint') && !t.detail;
  const plain = tests.filter(isPlainCheckpoint).map((t) => Number(t.check.slice('checkpoint'.length)));
  const parts: string[] = [];
  for (const t of tests) {
    if (!isPlainCheckpoint(t)) parts.push(t.detail ? `${CHECKS[t.check]} (${t.detail})` : CHECKS[t.check]);
    else if (!parts.includes(checkpoints(plain))) parts.push(checkpoints(plain));
  }
  return parts.join('; ');
}

// What the status says of the calibrated values: rounded from a fit, with how many it left on a bound, which the
// page reports as limited by it; or, before the refit, the provisional values the model runs on.
export function calibratedText(calibrated: readonly Param[]): string {
  const onBound = calibrated.filter(
    (p) => p.value !== null && p.bounds != null && (p.value === p.bounds[0] || p.value === p.bounds[1]),
  ).length;
  return calibrated.every((p) => p.value !== null)
    ? `shown below rounded from its fit, ${onBound} of them on a bound`
    : "not yet calibrated for the coloured noise it runs with: each is shown with the provisional value it runs on, where its refit starts, and R's first fit, with white noise, is recorded in `data/calibration/r1.json`";
}

// Where the project stands, heading both FIDELITY.md and the app's "About the science" view. It is Markdown, with
// **strong**, _emphasis_ and `code` its only marks; `values` says what the calibrated parameters are (calibratedText).
export function statusText(values: string): string {
  return (
    '**Status: milestone 5 done; milestone 6 under way.** The CPU reference and the GPU simulate the connectome, the ' +
    "layers outside it, AWC-ON's sense of odour and touch, and the body. The app shows the worm on its dish, with food " +
    'lawns a viewer can drop, move and remove, whose odour the worm smells, and a way to touch it; a viewer can lesion ' +
    'any neuron and restore it, swap the real wiring for the contrast brain, a rewiring of its chemical synapses, and ' +
    'watch the neurons glow with their simulated activity. **Crawling as checkpoint 1 asks for it does not emerge.** ' +
    "Research track R's three rounds of fitting found no model that both crawls as checkpoint 1 asks and gives the " +
    'same result at half the time step, so R ended below partial, and checkpoints 2 to 6, which need crawling, are ' +
    'not reached (DECISIONS.md, 2026-09-29 and 2026-09-30). The negative result is the headline. Checkpoint 0 passes, ' +
    'which says little while the worm barely crawls, and checkpoint 1 fails (`VALIDATION.md`). The calibrated ' +
    `parameters are R's refit's, ${values} (DECISIONS.md, 2026-09-28).`
  );
}
