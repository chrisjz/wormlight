// Milestone 6's Safari check of the app itself (PLAN §8, DECISIONS.md 2026-09-30): the built app driven in Safari
// through safaridriver (scripts/safari.ts), on this Mac's GPU, in a window of its own. Each scenario loads a link,
// waits for the app to be ready, acts as a viewer would, and checks what should follow; every page must also run
// without an error and its worm's time advance. A screenshot of each is saved for the maintainer to look over.
//
//   npm run build && npm run app:safari
//
// It needs Safari → Settings → Developer → "Allow remote automation" on, and its window left uncovered. It writes
// harness-out/safari-app/<scenario>.png and prints a table of the scenarios.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ADAPTER, serve } from '../browser.ts';
import { ROOT } from '../data/sources.ts';
import { Safari } from '../safari.ts';

const PORT = Number(process.env.PREVIEW_PORT ?? 5224);
const SAFARI_PORT = Number(process.env.SAFARI_PORT ?? 4445);
const OUT = join(ROOT, 'harness-out', 'safari-app');
const [WIDTH, HEIGHT] = [1440, 900];

// A scenario: the link it loads, an element it clicks as a viewer would, if any, and what it does and checks there,
// as an async function's body run in the page that returns what it found wrong, or '' if nothing.
interface Scenario {
  name: string;
  query: string;
  click?: string;
  check: string;
}

// Helpers the checks share, defined in the page before each check.
const HELPERS = `
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (s) => document.querySelector(s);
  const until = async (test, ms = 5000) => {
    for (const end = performance.now() + ms; performance.now() < end; await wait(100)) if (test()) return true;
    return false;
  };
  const param = (key) => new URL(location.href).searchParams.get(key);
  const said = () => [...document.querySelectorAll('[aria-live]')].map((e) => e.textContent).join(' ');
`;

const SCENARIOS: Scenario[] = [
  {
    name: 'split',
    query: '?seed=4',
    check: `return param('model') === '1' && /^[0-9a-f]{8}$/.test(param('data') ?? '') ? '' : 'versions not written';`,
  },
  { name: 'plate-alone', query: '?view=plate&seed=4', check: `return $('.pane-graph') ? 'a graph pane' : '';` },
  {
    name: 'graph-alone',
    query: '?view=graph&seed=4',
    check: `return $('.pane-plate:not([hidden])') ? 'a plate shown' : '';`,
  },
  {
    name: 'lesions-rewired',
    query: '?seed=4&lesions=AVAL+AVAR&brain=rewired-3',
    check: `
      if ($('#plate-brain-select').value !== '3') return 'the brain control shows ' + $('#plate-brain-select').value;
      return /AVAL/.test($('.plate-experiment').textContent) ? '' : 'the lesions are not listed';`,
  },
  {
    name: 'food',
    query: '?seed=4&food=10,0;-20,5',
    check: `
      const lawns = document.querySelectorAll('.plate-lawn').length;
      return lawns === 2 && param('food') === '10,0;-20,5' ? '' : lawns + ' lawns, food ' + param('food');`,
  },
  {
    name: 'about',
    query: '?seed=4&about=science',
    check: `
      if (!$('dialog.about')?.open) return 'About the science is not open';
      return $('dialog.about').textContent.includes('Sharing a link') ? '' : 'no part on sharing a link';`,
  },
  {
    name: 'link-note',
    query: '?seed=4&model=0&food=bad',
    check: `
      const text = $('.link-note-text')?.innerText ?? '';
      if (!/another version/.test(text)) return 'the note reads: ' + text;
      $('.link-note-more').click();
      await wait(100);
      return $('.link-note-details').hidden ? 'Details did not unfold' : '';`,
  },
  {
    name: 'touch',
    query: '?seed=4',
    check: `
      document.querySelector('button[aria-label^="Touch front"]').click();
      return (await until(() => /Touched 20%.*ALM/.test(said()))) ? '' : 'no touch was announced: ' + said();`,
  },
  {
    name: 'swap-live',
    query: '?seed=4',
    check: `
      const select = $('#plate-brain-select');
      select.value = '2';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      if (!(await until(() => param('brain') === 'rewired-2'))) return 'the URL did not follow the swap';
      const before = $('.plate-time').textContent;
      return (await until(() => $('.plate-time').textContent !== before)) ? '' : 'the worm stopped after the swap';`,
  },
  {
    name: 'lesion-live',
    query: '?seed=4',
    check: `
      const find = $('.find');
      find.value = 'AVAL';
      // A plain input naming a neuron exactly, as a pick from the list arrives in some browsers, selects it.
      find.dispatchEvent(new Event('input', { bubbles: true }));
      if (!(await until(() => $('.inspector-ablate')))) return 'the inspector did not open';
      if (!(await until(() => /%/.test($('.inspector-activity')?.textContent ?? '')))) return 'no activity shown';
      $('.inspector-ablate').click();
      return (await until(() => param('lesions') === 'AVAL')) ? '' : 'the lesion did not reach the URL';`,
  },
  {
    name: 'copy-link',
    query: '?seed=4',
    click: '.plate-copy',
    check: `
      await wait(300);
      const label = $('.plate-copy').textContent;
      return label === 'Copied' ? '' : 'the button reads ' + label;`,
  },
];

mkdirSync(OUT, { recursive: true });
const stopServer = await serve(['preview'], PORT);
let safari: Safari | null = null;
let failed = 0;
try {
  safari = await Safari.launch(SAFARI_PORT);
  await safari.resize(WIDTH, HEIGHT);
  console.log(`Safari ${safari.version}, in a window of ${WIDTH} × ${HEIGHT}`);
  let adapter = '';
  const rows: string[] = [];
  for (const s of SCENARIOS) {
    const problems: string[] = [];
    try {
      // The app defines __rates once it is ready, or never if it fails to start.
      await safari.open(`http://localhost:${PORT}/${s.query}`, '__rates', 60000);
      adapter ||= await safari.evaluate<string>(ADAPTER);
      if (s.click) await safari.click(s.click);
      const found = await safari.evaluate<string>(`${HELPERS}\n${s.check}`);
      if (found) problems.push(found);
      // The worm's time advances, but where no plate is shown.
      const time = await safari.evaluate<string>(`
        const t = document.querySelector('.plate-time')?.textContent ?? null;
        if (t === null) return 'none';
        await new Promise((r) => setTimeout(r, 1500));
        return document.querySelector('.plate-time').textContent !== t ? 'advances' : 'stuck at ' + t;`);
      if (time !== 'advances' && time !== 'none') problems.push(`the worm's time is ${time}`);
      problems.push(...(await safari.errors()));
      writeFileSync(join(OUT, `${s.name}.png`), await safari.screenshot());
    } catch (e) {
      problems.push(e instanceof Error ? e.message : String(e));
    }
    if (problems.length > 0) failed++;
    rows.push(`| ${s.name} | \`${s.query}\` | ${problems.length === 0 ? 'passes' : problems.join('; ')} |`);
  }
  console.log(`GPU adapter: ${adapter}`);
  console.log('\n| Scenario | Link | Result |\n| --- | --- | --- |');
  for (const row of rows) console.log(row);
  console.log(`\nScreenshots in ${OUT}.`);
} finally {
  await safari?.close();
  stopServer();
}
if (failed > 0) {
  console.error(`${failed} of ${SCENARIOS.length} scenarios failed.`);
  process.exit(1);
}
