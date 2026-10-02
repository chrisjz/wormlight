// FIDELITY.md's content, built from the registry in src/science/ and figures counted from the runtime
// data. Pure, so it can be tested; scripts/docs/fidelity.ts writes or checks the page.

import { CITATIONS, reference, type CitationId } from '../../src/science/citations.ts';
import type { Facts } from '../../src/science/facts.ts';
import { COMPONENTS, OMITTED, PRESENTATION, SUBSYSTEMS, render, type SubsystemId } from '../../src/science/fidelity.ts';
import {
  asRun,
  calibratedText,
  checkpoints,
  formatNumber,
  formatValue,
  levelsText,
  ledgerStatus,
  PARAM_GROUPS,
  paramNote,
  subsystemRange,
  testedByText,
} from '../../src/science/ledger.ts';
import { SCALE } from '../../src/science/levels.ts';
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

// The ledger's helpers live in src/science/ledger.ts, which the app shares; the harness and the tests take these
// from here.
export { calibratedText, formatNumber, formatValue, testedByText };

const cite = (ids: readonly CitationId[]): string => ids.map((id) => CITATIONS[id].short).join('; ');

function paramRows(ids: ParamId[]): string[][] {
  return ids.map((id) => {
    const p: Param = PARAMS[id];
    // As the chosen fit runs it: g_sw and g_p in the conductance form, their current form's entry in the note.
    const shown = asRun(p);
    const note = paramNote(p);
    return [
      p.name,
      `\`${p.symbol}\``,
      formatValue(shown),
      shown.unit,
      String(p.level),
      cite(p.sources),
      note,
      p.upgrade,
    ];
  });
}

function referencedCitations(): CitationId[] {
  const byShort = (a: CitationId, b: CitationId): number => {
    const [x, y] = [CITATIONS[a].short, CITATIONS[b].short];
    return x < y ? -1 : x > y ? 1 : 0;
  };
  return [...usedCitations()].sort(byShort);
}

export function fidelityPage(facts: Facts): string {
  const subsystems = Object.keys(SUBSYSTEMS) as SubsystemId[];
  const free = freeParams();
  const calibrated = free.filter((id) => PARAMS[id].level === 1);
  const groups = Object.keys(PARAM_GROUPS) as Subsystem[];
  return [
    '# Fidelity ledger',
    '<!-- Generated from the registry in src/science/ by `npm run docs:fidelity`. Edit the registry, not this page. -->',
    'How well biology supports each part of Wormlight (spec §1.3). It lets a viewer tell measured fact from informed guess, and it tells later work what to replace when new research lands.',
    `> ${ledgerStatus()} Figures quoted from the data, such as connection counts and sign coverage, are counted from \`public/data/wormlight.v1.json\` when the page is generated.`,
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
    `Every constant the plan fixes so far, from \`src/science/params.ts\`. A parameter is free when we set it ourselves, at level 1 or 0. There are ${free.length} free parameters, ${calibrated.length} calibrated and ${free.length - calibrated.length} fixed in advance, against a budget of ${FREE_PARAMETER_BUDGET} (PLAN.md §6.2). A few constants are part of a form, not parameters of their own, and are levelled with their components: the oscillator's 0.7 and 0.8, κ_SMD's boundary of 0.3, and the 16 mV rise that sets AWC-ON's gain.`,
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
