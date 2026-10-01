// npm run data:build: read every pinned input, write public/data/wormlight.v1.json and its notices,
// and generate DATA_SOURCES.md and the reports in data/reports/. Every output is deterministic.
// With --check (npm run data:check), build in memory and exit 1 if any committed output differs.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { SCHEMA, validateWormlightData, type Neuromuscular, type WormlightData } from '../../src/data/schema.ts';
import { CITATIONS, reference, type CitationId } from '../../src/science/citations.ts';
import { PARAMS } from '../../src/science/params.ts';
import { proprioceptiveFields } from '../../src/sim/proprio.ts';
import { bodyFrame, checkAxes, muscles, oscillator, position, sensing } from './anatomy.ts';
import { dataSourcesPage, noticePage } from './docs.ts';
import { parseMorphology, type Morphology } from './nml.ts';
import { formatMarkdown, formatTypeScript, renderJson } from './render.ts';
import { MID_ROD } from '../../src/validation/motion.ts';
import { addPosture, covariance, emptySums, spanCurvature, varianceCaptured } from '../../src/validation/posture.ts';
import { checkEigenworms, checkPostures, parseMatrix } from './eigenworms.ts';
import { checkExport, type NematodeExport } from './export.ts';
import { buildReport, crossCheckReport, parseCreamer } from './reports.ts';
import { edgeKey, parseOverrides, readFenyves, signChemical, signNeuromuscular } from './signs.ts';
import { ROOT, loadSources, pinById, readFile, readManifest, sha256, type Pin } from './sources.ts';
import { dataVersion } from './version.ts';
import { readSheet } from './xlsx.ts';

const OVERRIDES = 'data/sign-overrides.csv';
// Track S's measured signs, which only its model applies until its fit is chosen (DECISIONS.md, 2026-10-01), and the
// module the build generates from them.
const TRACK_S_OVERRIDES = 'data/sign-overrides-s.csv';
const TRACK_S_MODULE = 'src/data/trackSSigns.ts';

function firstFile(pin: Pin): NonNullable<Pin['files']>[number] {
  const file = pin.files?.[0];
  if (!file) throw new Error(`pin ${pin.id} has no file`);
  return file;
}

async function build(): Promise<Map<string, string>> {
  const sources = loadSources();
  const exportPin = pinById(sources, 'nematode-export');
  const exported = checkExport(
    JSON.parse((await readFile(firstFile(exportPin))).toString('utf8')) as NematodeExport,
    exportPin.origin?.commit,
  );
  const neuronNames = new Set(exported.neurons.map((n) => n.name));
  const edges = new Set(exported.chemical.map((c) => edgeKey(c.pre, c.post)));

  const cells = await readManifest(pinById(sources, 'c302-cells'));
  const morphologies = new Map<string, Morphology>();
  for (const name of [...neuronNames].sort()) {
    const xml = cells.get(`${name}.cell.nml`);
    if (!xml) throw new Error(`no c302 morphology for ${name}`);
    morphologies.set(name, parseMorphology(xml.toString('utf8'), name));
  }
  const frame = bodyFrame(morphologies);
  const axes = checkAxes(morphologies);

  const fenyvesS1 = readFenyves(
    readSheet(await readFile(firstFile(pinById(sources, 'fenyves2020-s1'))), '5. Sign prediction'),
    'S1 Data',
    neuronNames,
    edges,
  );
  const fenyvesS5 = readFenyves(
    readSheet(await readFile(firstFile(pinById(sources, 'fenyves2020-s5'))), '5. Sign prediction (Cook)'),
    'S5 Data',
    neuronNames,
    edges,
  );
  const overridesText = readFileSync(join(ROOT, OVERRIDES), 'utf8');
  const overrides = parseOverrides(overridesText);
  // Every citation the runtime file uses resolves in the registry, src/science/citations.ts.
  const signBasis = { expression: 'fenyves2020', ruleIdentities: 'wang2024', receptor: 'richmond1999' } as const;
  const isCitation = (id: string): id is CitationId => Object.hasOwn(CITATIONS, id);
  for (const o of overrides) {
    if (!isCitation(o.citation))
      throw new Error(`sign override ${o.pre} → ${o.post} cites ${o.citation}, which is not in the registry`);
  }
  const cited = [
    ...new Set<CitationId>([...Object.values(signBasis), ...overrides.map((o) => o.citation as CitationId)]),
  ].sort();
  // Track S's rows are checked as the main file's are, and against it: each cites the registry, names an edge Cook
  // has, and appears once across both files, which signChemical below enforces with them merged.
  const trackSText = readFileSync(join(ROOT, TRACK_S_OVERRIDES), 'utf8');
  const trackS = parseOverrides(trackSText, TRACK_S_OVERRIDES);
  for (const o of trackS) {
    if (!isCitation(o.citation))
      throw new Error(`track S's sign ${o.pre} → ${o.post} cites ${o.citation}, which is not in the registry`);
  }

  const identities = new Map(exported.neurons.map((n) => [n.name, n.transmitters]));
  const { chemical, setAside } = signChemical(exported.chemical, {
    identities,
    ruleSign: new Map(exported.neurons.map((n) => [n.name, n.ruleSign])),
    fenyves: [fenyvesS1, fenyvesS5],
    overrides,
  });
  // Run for its checks alone: it throws on an edge Cook doesn't have, or one listed twice across the two files.
  signChemical(exported.chemical, {
    identities,
    ruleSign: new Map(exported.neurons.map((n) => [n.name, n.ruleSign])),
    fenyves: [fenyvesS1, fenyvesS5],
    overrides: [...overrides, ...trackS],
  });
  const before = new Map(chemical.map((c) => [`${c.pre}→${c.post}`, c]));
  const trackSRows = trackS.map((o) => {
    const was = before.get(`${o.pre}→${o.post}`) as (typeof chemical)[number];
    return { pre: o.pre, post: o.post, sign: o.sign, citation: o.citation, was: was.sign, wasSource: was.signSource };
  });
  const neuromuscular: Neuromuscular[] = exported.neuromuscular.map((j) => ({
    ...j,
    ...signNeuromuscular(identities.get(j.pre)?.[0]),
  }));

  // What the model reads, which the data's version is a digest of.
  const body: Omit<WormlightData, 'meta'> = {
    neurons: exported.neurons.map((n) => {
      const morphology = morphologies.get(n.name) as Morphology;
      return {
        name: n.name,
        class: n.class,
        transmitters: n.transmitters,
        position: position(frame, morphology),
        sensing: sensing(frame, n.name, morphology),
        oscillator: oscillator(n.name),
      };
    }),
    muscles: muscles(exported.muscles),
    chemical,
    gap: exported.gap,
    neuromuscular,
  };
  const data = validateWormlightData({
    meta: {
      schema: SCHEMA,
      version: dataVersion(body),
      signBasis,
      muscleSpacing: 'shared-grid',
      citations: Object.fromEntries(cited.map((id) => [id, reference(id)])),
      licences: sources.datasets
        .filter((d) => d.use === 'shipped' && d.notice)
        .map((d) => ({ dataset: d.id, spdx: d.notice?.spdx ?? '' })),
      notice: 'NOTICE.md',
      sources: [
        ...sources.pins.flatMap((pin) =>
          pin.manifest
            ? [{ id: pin.id, sha256: pin.manifest.sha256 }]
            : (pin.files ?? []).map((f) => ({ id: pin.id, sha256: f.sha256 })),
        ),
        { id: 'sign-overrides', sha256: sha256(Buffer.from(overridesText)) },
      ],
    },
    ...body,
  } satisfies WormlightData);

  const creamer = parseCreamer(
    (await readFile(firstFile(pinById(sources, 'creamer-lds')))).toString('utf8'),
    neuronNames,
  );
  const basis = parseMatrix((await readFile(firstFile(pinById(sources, 'eigenworms')))).toString('utf8'));
  const eigenworms = checkEigenworms(basis, 100);
  const postureRows = parseMatrix(
    (await readFile(firstFile(pinById(sources, 'oist-postures')))).toString('utf8'),
    'real postures',
  );
  const sums = emptySums();
  for (const row of postureRows) addPosture(sums, row);
  const postures = { ...checkPostures(postureRows, 100), captured: varianceCaptured(covariance(sums), basis) };
  // The curvature PLAN §7.3's 1 mV rule takes for proprioception's bounds in the conductance form: the magnitude of
  // the mean κL over each of the model's proprioceptive fields, in every posture (DECISIONS.md, 2026-09-29).
  const fields = proprioceptiveFields(data, PARAMS.proprioceptiveReach.value);
  const bends = postureRows
    .flatMap((row) => fields.map((f) => Math.abs(spanCurvature(row, f.from, f.to))))
    .sort((a, b) => a - b);
  const quantile = (q: number): number => bends[Math.floor(q * (bends.length - 1))];
  const fieldCurvature = { fields: fields.length, median: quantile(0.5), p95: quantile(0.95) };
  // The band checkpoint 1's frequency takes (PLAN §7.4, changed after results 2026-10-01, DECISIONS.md): the 5th
  // percentile of the magnitude of the mid-body κL less its mean, read over one segment's span about the rod the
  // trials record, as the model reads it.
  const segment = 1 / PARAMS.bodyUnits.value;
  const centre = MID_ROD * segment;
  const mids = postureRows.map((row) => spanCurvature(row, centre - segment / 2, centre + segment / 2));
  const midMean = mids.reduce((a, b) => a + b, 0) / mids.length;
  const spread = mids.map((k) => Math.abs(k - midMean)).sort((a, b) => a - b);
  const at = (q: number): number => spread[Math.floor(q * (spread.length - 1))];
  const midCurvature = { at: centre, mean: midMean, p5: at(0.05), p10: at(0.1), median: at(0.5) };
  const report = buildReport({
    data,
    fenyves: [fenyvesS1, fenyvesS5],
    setAside,
    overrides,
    frame,
    axes,
    exportCommit: exported.provenance.nematodeCommit,
    eigenworms,
    postures,
    fieldCurvature,
    midCurvature,
    trackS: trackSRows,
  });

  const outputs = new Map<string, string>();
  outputs.set('public/data/wormlight.v1.json', renderJson(data as unknown as Record<string, unknown>));
  outputs.set(
    TRACK_S_MODULE,
    await formatTypeScript(trackSModule(trackSRows, sha256(Buffer.from(trackSText))), join(ROOT, TRACK_S_MODULE)),
  );
  for (const [path, markdown] of [
    ['public/data/NOTICE.md', noticePage(sources)],
    ['DATA_SOURCES.md', dataSourcesPage(sources)],
    ['data/reports/sign-crosscheck.md', crossCheckReport(chemical, creamer, sources)],
    ['data/reports/data-build.md', report],
  ] as const) {
    outputs.set(path, await formatMarkdown(markdown, join(ROOT, path)));
  }
  return outputs;
}

const outputs = await build();
if (process.argv.includes('--check')) {
  const stale = [...outputs].filter(([path, content]) => {
    try {
      return readFileSync(join(ROOT, path), 'utf8') !== content;
    } catch {
      return true;
    }
  });
  if (stale.length > 0) {
    console.error(
      `Out of date: ${stale.map(([path]) => path).join(', ')}. Run npm run data:build and commit the result.`,
    );
    process.exit(1);
  }
  console.log(`All ${outputs.size} data build outputs are up to date.`);
} else {
  for (const [path, content] of outputs) {
    mkdirSync(dirname(join(ROOT, path)), { recursive: true });
    writeFileSync(join(ROOT, path), content);
  }
  console.log(`Wrote ${[...outputs.keys()].join(', ')}.`);
}

// The module track S's model reads its signs from (DECISIONS.md, 2026-10-01): each row's edge, sign and citation, and
// the side file's digest, so a stale module fails `data:check`.
function trackSModule(rows: readonly { pre: string; post: string; sign: 1 | -1; citation: string }[], digest: string) {
  const lines = rows.map(
    (r) => `  { pre: '${r.pre}', post: '${r.post}', sign: ${r.sign}, citation: '${r.citation}' },`,
  );
  return [
    `// Generated by \`npm run data:build\` from ${TRACK_S_OVERRIDES}; never edit it by hand. Track S's measured signs`,
    '// (DECISIONS.md, 2026-10-01): every chemical sign for which a response was recorded in the postsynaptic cell to a',
    "// manipulation targeted at the presynaptic cell, which only track S's model applies until its fit is chosen.",
    '',
    "import type { CitationId } from '../science/citations.ts';",
    '',
    'export interface TrackSSign {',
    '  pre: string;',
    '  post: string;',
    '  sign: 1 | -1;',
    '  citation: CitationId;',
    '}',
    '',
    `export const TRACK_S_SOURCE = { path: '${TRACK_S_OVERRIDES}', sha256: '${digest}' } as const;`,
    '',
    'export const TRACK_S_SIGNS: readonly TrackSSign[] = [',
    ...lines,
    '];',
    '',
  ].join('\n');
}
