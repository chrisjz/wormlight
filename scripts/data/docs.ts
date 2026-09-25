// DATA_SOURCES.md and public/data/NOTICE.md, generated from data/sources.json.

import type { Dataset, Pin, Sources } from './sources.ts';
import { table } from './render.ts';

const GENERATED = '<!-- Generated from data/sources.json by `npm run data:build`. Edit that file, not this one. -->';

function pinned(pin: Pin): string[][] {
  const commit = pin.origin ? ` at \`${pin.origin.commit.slice(0, 12)}\`` : '';
  if (pin.manifest) {
    return [
      [
        pin.id,
        `${pin.description}${commit}, listed in \`${pin.manifest.path}\``,
        `\`${pin.manifest.sha256}\` (manifest)`,
        pin.retrieved,
      ],
    ];
  }
  return (pin.files ?? []).map((file) => [
    pin.id,
    `${pin.description}${commit}: ${file.path ? `\`${file.path}\`` : `<${file.url}>`}`,
    `\`${file.sha256}\``,
    pin.retrieved,
  ]);
}

function route(dataset: Dataset): string {
  if (dataset.planned) return `Pinned in ${dataset.planned}`;
  return dataset.route ?? 'Wormlight data build';
}

export function dataSourcesPage(sources: Sources): string {
  const by = (use: Dataset['use']): Dataset[] => sources.datasets.filter((d) => d.use === use);
  const exporter = sources.pins.find((p) => p.id === 'nematode-export')?.origin;
  return [
    '# Data sources',
    GENERATED,
    'Every dataset Wormlight reads, what it is used for, and its licence. Literature that supplies parameters rather than data is cited in `FIDELITY.md`.',
    "Each input is pinned in `data/sources.json` by URL or path, commit where there is one, retrieval date and SHA-256. `npm run data:build` checks every byte it reads against its pin, and CI rebuilds the data and fails if any committed output differs. The same file generates `public/data/NOTICE.md`, which ships with the site, so the data's licences and attributions travel with it.",
    '## Shipped with the app',
    table(
      ['Dataset', 'What Wormlight takes', 'Route', 'Licence and attribution'],
      by('shipped').map((d) => [d.dataset, d.takes, route(d), d.licence ?? '']),
    ),
    '## Used in tests and reports only (not shipped)',
    table(
      ['Dataset', 'Use', 'Route', 'Licence'],
      by('tests').map((d) => [d.dataset, d.takes, route(d), d.licence ?? '']),
    ),
    '## Consulted, not bundled',
    table(
      ['Source', 'Use'],
      by('consulted').map((d) => [d.dataset, d.takes]),
    ),
    '## Pins',
    exporter
      ? `The Quantum Nematode export is regenerated from a clean checkout of <${exporter.repository}> at the pinned commit with \`${exporter.command ?? ''}\`; the export records that commit, and the build refuses one that does not match.`
      : '',
    table(['Pin', 'What', 'SHA-256', 'Retrieved'], sources.pins.flatMap(pinned)),
  ].join('\n\n');
}

export function noticePage(sources: Sources): string {
  const shipped = sources.datasets.filter((d) => d.use === 'shipped' && d.notice);
  const texts = [...new Set(shipped.flatMap((d) => (d.notice?.licenceText ? [d.notice.licenceText] : [])))];
  return [
    '# Data notices',
    GENERATED,
    "`wormlight.v1.json` combines the datasets below. Each keeps its own licence and attribution requirements, reproduced here. Wormlight's code is licensed separately, under Apache-2.0.",
    ...shipped.flatMap((d) => [
      `## ${d.notice?.title ?? d.id}`,
      d.notice?.attribution ?? '',
      `Licence: ${d.notice?.licence ?? ''}`,
    ]),
    ...texts.flatMap((key) => [`## Licence text (${key})`, `\`\`\`text\n${sources.licenceTexts[key]}\n\`\`\``]),
  ].join('\n\n');
}
