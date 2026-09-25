// npm run docs:fidelity: generate FIDELITY.md from the registry in src/science/, quoting figures counted
// from public/data/wormlight.v1.json. With --check (npm run docs:check), exit 1 if the page is stale.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateWormlightData } from '../../src/data/schema.ts';
import { CITATIONS, reference, type CitationId } from '../../src/science/citations.ts';
import { countFacts, type Facts } from '../../src/science/facts.ts';
import {
  COMPONENTS,
  OMITTED,
  PRESENTATION,
  SUBSYSTEMS,
  render,
  subsystemLevels,
  type Component,
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
import { formatMarkdown, table } from '../data/render.ts';
import { ROOT } from '../data/sources.ts';

const PAGE = join(ROOT, 'FIDELITY.md');
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

// Numbers as a person would write them: no floating-point noise, and small ones in scientific form.
function formatValue(param: Param): string {
  if (param.value === null) return param.level === 1 ? 'calibrated in milestone 0c' : 'set by rule';
  const v = param.value;
  if (v !== 0 && Math.abs(v) < 0.01) {
    const exponent = Math.floor(Math.log10(Math.abs(v)));
    const superscript = String(exponent)
      .replace('-', '⁻')
      .replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(d)]);
    return `${Number((v / 10 ** exponent).toPrecision(4))} × 10${superscript}`;
  }
  return String(Number(v.toPrecision(6))).replace('-', '−');
}

const cite = (ids: readonly CitationId[]): string => ids.map((id) => CITATIONS[id].short).join('; ');

function paramRows(ids: ParamId[]): string[][] {
  return ids.map((id) => {
    const p: Param = PARAMS[id];
    const note = [p.note, p.rule, p.calibratedAgainst ? `Calibrated against ${p.calibratedAgainst}.` : '']
      .filter(Boolean)
      .join(' ');
    return [p.name, `\`${p.symbol}\``, formatValue(p), p.unit, String(p.level), cite(p.sources), note];
  });
}

function referencedCitations(): CitationId[] {
  const ids = new Set<CitationId>();
  for (const c of COMPONENTS) c.sources.forEach((id) => ids.add(id));
  for (const s of Object.values(SUBSYSTEMS)) s.sources.forEach((id) => ids.add(id));
  for (const p of Object.values(PARAMS) as Param[]) p.sources.forEach((id) => ids.add(id));
  for (const item of [...OMITTED, ...PRESENTATION]) item.sources.forEach((id) => ids.add(id));
  return [...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function fidelityPage(facts: Facts): string {
  const subsystems = Object.keys(SUBSYSTEMS) as SubsystemId[];
  const free = freeParams();
  const calibrated = free.filter((id) => PARAMS[id].level === 1);
  const groups = Object.keys(PARAM_GROUPS) as Subsystem[];
  return [
    '# Fidelity ledger',
    '<!-- Generated from the registry in src/science/ by `npm run docs:fidelity`. Edit the registry, not this page. -->',
    'How well biology supports each part of Wormlight (spec §1.3). It lets a viewer tell measured fact from informed guess, and it tells later work what to replace when new research lands.',
    '> **Status: planned.** Nothing is simulated yet, so each level is the one the part is planned at. Figures quoted from the data, such as connection counts and sign coverage, are counted from `public/data/wormlight.v1.json` when the page is generated.',
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
            c.testedBy.join('; '),
          ]),
        ),
      ]),
    '## Omitted biology',
    OMITTED.map((item) => `- ${item.text}`).join('\n'),
    '## Presentation',
    PRESENTATION.map((item) => `- ${item.text}`).join('\n'),
    '## Parameters',
    `Every constant the plan fixes so far, from \`src/science/params.ts\`. A parameter is free when we set it ourselves, at level 1 or 0. There are ${free.length} free parameters, ${calibrated.length} calibrated and ${free.length - calibrated.length} fixed in advance, against a budget of ${FREE_PARAMETER_BUDGET} (PLAN.md §6.2). Constants that only later milestones use, such as the body's spring constants and the oscillator's fixed coefficients, join the registry with the code that uses them.`,
    ...groups.flatMap((group) => [
      `### ${PARAM_GROUPS[group]}`,
      table(
        ['Parameter', 'Symbol', 'Value', 'Unit', 'Level', 'Source', 'Notes'],
        paramRows((Object.keys(PARAMS) as ParamId[]).filter((id) => PARAMS[id].subsystem === group)),
      ),
    ]),
    '## Sources',
    referencedCitations()
      .map((id) => `- **${CITATIONS[id].short}.** ${reference(id)}`)
      .join('\n'),
  ].join('\n\n');
}

const data = validateWormlightData(JSON.parse(readFileSync(join(ROOT, 'public/data/wormlight.v1.json'), 'utf8')));
const page = await formatMarkdown(fidelityPage(countFacts(data)), PAGE);
if (process.argv.includes('--check')) {
  if (readFileSync(PAGE, 'utf8') !== page) {
    console.error('FIDELITY.md is out of date. Run npm run docs:fidelity and commit the result.');
    process.exit(1);
  }
  console.log('FIDELITY.md is up to date.');
} else {
  writeFileSync(PAGE, page);
  console.log('Wrote FIDELITY.md.');
}
