// npm run docs:fidelity: generate FIDELITY.md from the registry in src/science/, quoting figures counted
// from public/data/wormlight.v1.json. With --check (npm run docs:check), exit 1 if the page is stale.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateWormlightData } from '../../src/data/schema.ts';
import { countFacts } from '../../src/science/facts.ts';
import { formatMarkdown } from '../data/render.ts';
import { ROOT } from '../data/sources.ts';
import { fidelityPage } from './page.ts';

const PAGE = join(ROOT, 'FIDELITY.md');
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
