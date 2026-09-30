// FIDELITY.md's content, built from the registry in src/science/ and figures counted from the runtime
// data. Pure, so it can be tested; scripts/docs/fidelity.ts writes or checks the page.

import { CITATIONS, reference, type CitationId } from '../../src/science/citations.ts';
import type { Facts } from '../../src/science/facts.ts';
import {
  COMPONENTS,
  OMITTED,
  PRESENTATION,
  SUBSYSTEMS,
  render,
  subsystemLevels,
  CHECKS,
  type Component,
  type Test,
  type SubsystemId,
} from '../../src/science/fidelity.ts';
import { SCALE, levelRange, type Tag } from '../../src/science/levels.ts';
import {
  FREE_PARAMETER_BUDGET,
  PARAMS,
  freeParams,
  type Param,
  type ParamId,
  type Subsystem,
} from '../../src/science/params.ts';
import { usedCitations } from '../../src/science/used.ts';
import { CALIBRATION_TARGETS, REFERENCE_DATA } from '../../src/science/validation.ts';
import { table } from '../data/render.ts';

const TAG_SYMBOL: Record<Tag, string> = { omitted: '—', presentation: '◇' };
const PARAM_GROUPS: Record<Subsystem, string> = {
  neural: 'Neurons and synapses',
  sensing: 'Sensing',
  rhythm: 'Rhythm and proprioception',
  muscle: 'Neuromuscular transfer and muscles',
  body: 'Body',
  environment: 'Environment',
};

const levelsText = (levels: Component['levels']): string =>
  typeof levels === 'string' ? TAG_SYMBOL[levels] : levels.join(' / ');

function subsystemRange(id: SubsystemId): string {
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
function checkpoints(numbers: readonly number[]): string {
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

const cite = (ids: readonly CitationId[]): string => ids.map((id) => CITATIONS[id].short).join('; ');

function paramRows(ids: ParamId[]): string[][] {
  return ids.map((id) => {
    const p: Param = PARAMS[id];
    const bounds =
      p.bounds === undefined
        ? ''
        : p.bounds === null
          ? 'Its bounds are set before calibration runs.'
          : `Bounds ${formatNumber(p.bounds[0])} to ${formatNumber(p.bounds[1])}.`;
    const c = p.conductance;
    // The conductance form's entry beside the current form's (PLAN §4.3).
    const conductance = c
      ? `In the conductance form, in ${c.unit}: ${c.value === null ? `not yet calibrated; provisionally ${formatNumber(c.provisional)}` : formatNumber(c.value)}, bounds ${formatNumber(c.bounds[0])} to ${formatNumber(c.bounds[1])}, by ${c.rule}.`
      : '';
    const note = [
      p.note,
      p.rule,
      p.calibratedAgainst ? `Calibrated against ${p.calibratedAgainst}.` : '',
      bounds,
      conductance,
    ]
      .filter(Boolean)
      .join(' ');
    return [p.name, `\`${p.symbol}\``, formatValue(p), p.unit, String(p.level), cite(p.sources), note, p.upgrade];
  });
}

function referencedCitations(): CitationId[] {
  const byShort = (a: CitationId, b: CitationId): number => {
    const [x, y] = [CITATIONS[a].short, CITATIONS[b].short];
    return x < y ? -1 : x > y ? 1 : 0;
  };
  return [...usedCitations()].sort(byShort);
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

export function fidelityPage(facts: Facts): string {
  const subsystems = Object.keys(SUBSYSTEMS) as SubsystemId[];
  const free = freeParams();
  const calibrated = free.filter((id) => PARAMS[id].level === 1);
  const values = calibratedText(calibrated.map((id): Param => PARAMS[id]));
  const groups = Object.keys(PARAM_GROUPS) as Subsystem[];
  return [
    '# Fidelity ledger',
    '<!-- Generated from the registry in src/science/ by `npm run docs:fidelity`. Edit the registry, not this page. -->',
    'How well biology supports each part of Wormlight (spec §1.3). It lets a viewer tell measured fact from informed guess, and it tells later work what to replace when new research lands.',
    `> **Status: milestone 5 done; milestone 6 under way.** The CPU reference and the GPU simulate the network, the layers outside it, AWC-ON's sense of odour, touch and the body, and the app shows the worm on its dish, with food lawns the user can drop, move and remove, whose odour field is stepped on the GPU and smelt, a wall, and a way to touch it. A viewer can lesion any neuron and restore it, and swap the real wiring for the contrast brain, a rewiring of its chemical synapses on the same values, untuned, as the worm runs; and the graph's neurons glow with their simulated activity (DECISIONS.md, 2026-09-30). Crawling as checkpoint 1 asks for it does not yet emerge (DECISIONS.md, 2026-09-26). The calibrated parameters are research track R's model's (PLAN §9), ${values} (DECISIONS.md, 2026-09-28). R's refit passes §7.2's equivalence test and fails checkpoint 1, so R's first round ended; a second, changing the calibration, found a partial crawler in one probe search of four but not in its full run, so its fit wasn't chosen. A third, R's last, was paused: that crawl rests on the head switch's and proprioception's currents, which have no reversal potential, and a conductance form of them is built beside them, a survey of which found partial crawlers in two of sixteen searches, so the round ran on it. None of its picks passed §7.2's comparison, so the refit stays and R has ended below partial, and checkpoints 2 to 6 stay not reached (DECISIONS.md, 2026-09-29 and 2026-09-30). Checkpoints 0 and 1 have run in the harness (\`VALIDATION.md\`) and the other checkpoints haven't, so "Tested by" lists the checks planned for each part. Figures quoted from the data, such as connection counts and sign coverage, are counted from \`public/data/wormlight.v1.json\` when the page is generated.`,
    '## The scale',
    table(
      ['Level', 'Name', 'Meaning', 'Example'],
      SCALE.map((s) => [s.symbol, s.name, s.meaning, s.example]),
    ),
    "A level describes the kind of evidence, not how much a part matters, and not certainty: a measured wiring diagram is still assembled from a few animals, with gaps filled by extrapolation. A subsystem's levels are the range of its components' levels, listed below under the same headings.",
    '## At a glance',
    table(
      ['Subsystem', 'Levels', "What's solid", "What isn't", 'What would raise it'],
      subsystems.map((id) => {
        const s = SUBSYSTEMS[id];
        return [
          s.name,
          subsystemRange(id),
          render(s.solid, facts),
          render(s.notSolid, facts),
          render(s.upgrade, facts),
        ];
      }),
    ),
    '## Components',
    ...subsystems
      .filter((id) => COMPONENTS.some((c) => c.subsystem === id))
      .flatMap((id) => [
        `### ${SUBSYSTEMS[id].name}`,
        table(
          ['Component', 'Level', 'Basis', 'Caveats', 'What would raise it', 'Tested by'],
          COMPONENTS.filter((c) => c.subsystem === id).map((c) => [
            render(c.name, facts),
            levelsText(c.levels),
            render(c.basis, facts),
            render(c.caveats, facts),
            render(c.upgrade, facts),
            testedByText(c.testedBy),
          ]),
        ),
      ]),
    '## Omitted biology',
    OMITTED.map((item) => `- ${item.text}`).join('\n'),
    '## Presentation',
    PRESENTATION.map((item) => `- ${item.text}`).join('\n'),
    '## Reference data for validation',
    REFERENCE_DATA.map(
      (r) =>
        `- **${checkpoints(r.checkpoints)}** (pin \`${r.pin}\` in \`data/sources.json\`): ${r.use} Sources: ${cite(r.sources)}.`,
    ).join('\n'),
    "The calibration's targets (PLAN §7.3), which the calibrated parameters are tuned against:",
    CALIBRATION_TARGETS.map((r) => `- **${r.target}**: ${r.use} Sources: ${cite(r.sources)}.`).join('\n'),
    '## Parameters',
    `Every constant the plan fixes so far, from \`src/science/params.ts\`. A parameter is free when we set it ourselves, at level 1 or 0. There are ${free.length} free parameters, ${calibrated.length} calibrated and ${free.length - calibrated.length} fixed in advance, against a budget of ${FREE_PARAMETER_BUDGET} (PLAN.md §6.2). Constants that only later milestones use, such as the body's spring constants and the oscillator's fixed coefficients, join the registry with the code that uses them.`,
    ...groups.flatMap((group) => [
      `### ${PARAM_GROUPS[group]}`,
      table(
        ['Parameter', 'Symbol', 'Value', 'Unit', 'Level', 'Source', 'Notes', 'What would raise it'],
        paramRows((Object.keys(PARAMS) as ParamId[]).filter((id) => PARAMS[id].subsystem === group)),
      ),
    ]),
    '## Sources',
    referencedCitations()
      .map((id) => `- **${CITATIONS[id].short}.** ${reference(id)}`)
      .join('\n'),
  ].join('\n\n');
}
