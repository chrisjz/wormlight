// npm run data:build: read every pinned input, write public/data/wormlight.v1.json and its notices,
// and generate DATA_SOURCES.md and the reports in data/reports/. Every output is deterministic.
// With --check (npm run data:check), build in memory and exit 1 if any committed output differs.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { SCHEMA, validateWormlightData, type Neuromuscular, type WormlightData } from '../../src/data/schema.ts';
import { bodyFrame, checkAxes, muscles, oscillator, position, sensing } from './anatomy.ts';
import { dataSourcesPage, noticePage } from './docs.ts';
import { parseMorphology, type Morphology } from './nml.ts';
import { formatMarkdown, renderJson } from './render.ts';
import { buildReport, crossCheckReport, parseCreamer } from './reports.ts';
import { edgeKey, parseOverrides, readFenyves, signChemical, signNeuromuscular } from './signs.ts';
import { ROOT, loadSources, pinById, readFile, readManifest, sha256, type Pin } from './sources.ts';
import { readSheet } from './xlsx.ts';

// The part of Quantum Nematode's `wormlight.connectome/1` export this build reads.
interface NematodeExport {
  schema: string;
  provenance: { nematodeCommit: string; nematodeDirty: boolean };
  neurons: {
    name: string;
    class: WormlightData['neurons'][number]['class'];
    transmitters: string[];
    ruleSign: 1 | -1 | null;
  }[];
  muscles: string[];
  chemical: { pre: string; post: string; sections: number }[];
  gap: { a: string; b: string; sections: number }[];
  neuromuscular: { pre: string; muscle: string; sections: number }[];
}

const OVERRIDES = 'data/sign-overrides.csv';
const TRANSMITTER_SIGN: Record<string, 1 | -1> = { ACh: 1, Glu: 1, GABA: -1 };

function firstFile(pin: Pin): NonNullable<Pin['files']>[number] {
  const file = pin.files?.[0];
  if (!file) throw new Error(`pin ${pin.id} has no file`);
  return file;
}

async function readExport(pin: Pin): Promise<NematodeExport> {
  const exported = JSON.parse((await readFile(firstFile(pin))).toString('utf8')) as NematodeExport;
  if (exported.schema !== 'wormlight.connectome/1') throw new Error(`nematode export has schema ${exported.schema}`);
  if (exported.provenance.nematodeDirty) throw new Error('nematode export was made from a dirty tree');
  if (exported.provenance.nematodeCommit !== pin.origin?.commit) {
    throw new Error(
      `nematode export records commit ${exported.provenance.nematodeCommit}, not the pinned ${pin.origin?.commit}`,
    );
  }
  // The export's rule sign must be the one its primary identity implies, so the primary can be read
  // as the first identity.
  for (const n of exported.neurons) {
    const implied = TRANSMITTER_SIGN[n.transmitters[0] ?? ''] ?? null;
    if (implied !== n.ruleSign)
      throw new Error(`${n.name}: rule sign ${n.ruleSign} does not follow from ${n.transmitters[0]}`);
  }
  return exported;
}

async function build(): Promise<Map<string, string>> {
  const sources = loadSources();
  const exportPin = pinById(sources, 'nematode-export');
  const exported = await readExport(exportPin);
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

  const primary = new Map(exported.neurons.map((n) => [n.name, n.transmitters[0]]));
  const chemical = signChemical(exported.chemical, {
    ruleSign: new Map(exported.neurons.map((n) => [n.name, n.ruleSign])),
    fenyves: [fenyvesS1, fenyvesS5],
    overrides,
  });
  const neuromuscular: Neuromuscular[] = exported.neuromuscular.map((j) => ({
    ...j,
    ...signNeuromuscular(primary.get(j.pre)),
  }));

  const data = validateWormlightData({
    meta: {
      schema: SCHEMA,
      signCitations: { expression: 'fenyves2020', rule: 'wang2024', receptor: 'richmond1999' },
      muscleSpacing: 'even',
      sources: [
        ...sources.pins.flatMap((pin) =>
          pin.manifest
            ? [{ id: pin.id, sha256: pin.manifest.sha256 }]
            : (pin.files ?? []).map((f) => ({ id: pin.id, sha256: f.sha256 })),
        ),
        { id: 'sign-overrides', sha256: sha256(Buffer.from(overridesText)) },
      ],
    },
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
  } satisfies WormlightData);

  const creamer = parseCreamer(
    (await readFile(firstFile(pinById(sources, 'creamer-lds')))).toString('utf8'),
    neuronNames,
  );
  const report = buildReport({
    data,
    fenyves: [fenyvesS1, fenyvesS5],
    overrides,
    frame,
    axes,
    exportCommit: exported.provenance.nematodeCommit,
  });

  const outputs = new Map<string, string>();
  outputs.set('public/data/wormlight.v1.json', renderJson(data as unknown as Record<string, unknown>));
  for (const [path, markdown] of [
    ['public/data/NOTICE.md', noticePage(sources)],
    ['DATA_SOURCES.md', dataSourcesPage(sources)],
    ['data/reports/sign-crosscheck.md', crossCheckReport(chemical, creamer)],
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
