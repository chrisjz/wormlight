// The fidelity ledger as it is written (spec §1.3): the helpers both FIDELITY.md (scripts/docs/page.ts) and the app's
// "About the science" view use to put the registry into words, and the status that heads both, so the two can't
// drift.

import { CHECKS, SUBSYSTEMS, subsystemLevels, type Component, type SubsystemId, type Test } from './fidelity.ts';
import { levelRange, type Tag } from './levels.ts';
import { CHOSEN_MODEL } from '../sim/trackS.ts';
import { CHOSEN_FORM, freeParams, PARAMS, type Param, type Subsystem } from './params.ts';

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

// A parameter's notes as the ledger gives them: its note and rule, what it is calibrated against, its bounds, and
// its conductance form's entry beside the current form's (PLAN §4.3).
export function paramNote(p: Param): string {
  const shown = asRun(p);
  const bounds =
    shown.bounds === undefined
      ? ''
      : shown.bounds === null
        ? 'Its bounds are set before calibration runs.'
        : `Bounds ${formatNumber(shown.bounds[0])} to ${formatNumber(shown.bounds[1])}.`;
  const c = p.conductance;
  const range = (b: readonly [number, number]): string => `${formatNumber(b[0])} to ${formatNumber(b[1])}`;
  let forms = '';
  if (c && CHOSEN_FORM === 'conductance') {
    // The chosen fit's form is the conductance form: its bounds' rule, and the current form's entry, which the refit ran.
    const own = CHOSEN_MODEL === 'track S' && c.trackS;
    forms = [
      own
        ? `In the conductance form, which the chosen fit runs, its bounds are ${range(c.bounds)} by ${c.rule}; on track S's model, whose fit is chosen, ${range(c.trackS?.bounds ?? c.bounds)}, by ${c.trackS?.rule}.`
        : `In the conductance form, which the chosen fit runs, by ${c.rule}.`,
      `In the current form, which the refit ran, in ${p.unit}: bounds ${p.bounds ? range(p.bounds) : 'none'}${p.provisional === undefined ? '' : `, provisionally ${formatNumber(p.provisional)}`}.`,
    ].join(' ');
  } else if (c) {
    forms = [
      `In the conductance form, in ${c.unit}: ${c.value === null ? `not yet calibrated; provisionally ${formatNumber(c.provisional)}` : formatNumber(c.value)}, bounds ${range(c.bounds)}, by ${c.rule}.`,
      c.trackS ? `On track S's model, bounds ${range(c.trackS.bounds)}, by ${c.trackS.rule}.` : '',
    ].join(' ');
  }
  return [p.note, p.rule, p.calibratedAgainst ? `Calibrated against ${p.calibratedAgainst}.` : '', bounds, forms]
    .filter(Boolean)
    .join(' ');
}

// A parameter as the chosen fit runs it: in the conductance form, g_sw's and g_p's conductance entries, their value,
// unit, provisional value and bounds, track S's own where its model is chosen; every other parameter as it stands.
export function asRun(p: Param): Param {
  const c = p.conductance;
  if (CHOSEN_FORM !== 'conductance' || !c) return p;
  const bounds = (CHOSEN_MODEL === 'track S' ? c.trackS?.bounds : undefined) ?? c.bounds;
  return { ...p, value: c.value, unit: c.unit, provisional: c.provisional, bounds };
}

// Where the project stands, heading both FIDELITY.md and the app's "About the science" view, so the two can't drift.
// It is Markdown, with **strong**, _emphasis_ and `code` its only marks; `values` says what the calibrated parameters
// are (calibratedText).
export function statusText(values: string): string {
  return (
    '**Status: every milestone is closed.** The CPU reference and the GPU simulate the connectome, ' +
    "the layers outside it, among them touch and AWC-ON's sense of odour, and the body. The app shows the worm on " +
    'its dish, with food lawns a viewer can drop, move and remove, whose odour the worm smells, and a way to touch ' +
    'it; a viewer can lesion any neuron and restore it, swap the real wiring for the contrast brain, a rewiring of ' +
    'its chemical synapses, and watch the neurons glow with their simulated activity. **The worm crawls at checkpoint ' +
    "1's partial grade, paced by its head switch.** Research track R fitted its model in three rounds and no fit its " +
    'rules could choose reached partial. Track S then gave the model measured synapse signs, a resting offset for the ' +
    "D-type motor neurons and AVA's rectified gap junctions, and its fit, chosen by rules set before it ran, holds at " +
    'half the time step and grades partial on checkpoint 1 on its own trials: its frequency passes, and its wavelength ' +
    "and speed are partial, the speed about a third of a real worm's (DECISIONS.md, 2026-10-02). The rhythm is not the " +
    "network's own: the head switch, a layer the spec permits, paces it at its strongest gain, the B-type motor neurons " +
    "have no oscillator, and the worm hardly reverses. Checkpoint 0 passes on it, and half the sensitivity runs' " +
    'settings stay partial (`VALIDATION.md`). Of the checkpoints that need crawling, the touch reflexes, ' +
    'chemotaxis and the lesions, checkpoints 2 to 5, fail on it, and checkpoint 6, the wiring test, finds no evidence that the wiring matters, nine of ten ' +
    'rewired brains crawling once tuned (DECISIONS.md, 2026-10-08). "Tested by" lists the checks planned for each part. ' +
    `The calibrated parameters are track S's fit's, ${values} (DECISIONS.md, 2026-10-02).`
  );
}

// The status as the registry gives it now.
export function ledgerStatus(): string {
  const calibrated = freeParams().filter((id) => PARAMS[id].level === 1);
  return statusText(calibratedText(calibrated.map((id): Param => asRun(PARAMS[id]))));
}

// The registry's text in its marks: plain text, **strong**, _emphasis_ and `code`. Emphasis opens and closes only
// where no letter, digit or underscore stands beside it, in any script, so a symbol such as κ_gap,B or σ_n stays as
// it is.
export type Mark = 'text' | 'strong' | 'em' | 'code';
export function tokens(text: string): { mark: Mark; text: string }[] {
  const out: { mark: Mark; text: string }[] = [];
  const pattern = /\*\*(.+?)\*\*|(?<![\p{L}\p{N}_])_(.+?)_(?![\p{L}\p{N}_])|`(.+?)`/gu;
  let at = 0;
  for (const m of text.matchAll(pattern)) {
    if (m.index > at) out.push({ mark: 'text', text: text.slice(at, m.index) });
    if (m[1] !== undefined) out.push({ mark: 'strong', text: m[1] });
    else if (m[2] !== undefined) out.push({ mark: 'em', text: m[2] });
    else out.push({ mark: 'code', text: m[3] });
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push({ mark: 'text', text: text.slice(at) });
  return out;
}
