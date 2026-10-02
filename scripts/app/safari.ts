// Milestone 6's Safari check of the app itself (PLAN §8, DECISIONS.md 2026-09-30): the built app driven in Safari
// through safaridriver (scripts/safari.ts), on this Mac's GPU, in a window of its own. Each scenario loads a link,
// waits for the app to be ready, acts as a viewer would, and checks what should follow. Every page must also report
// no error once it is ready (what it logs while it loads, the driver can't see; a start that fails is caught, as
// the page never becoming ready), its GPU go on stepping the worm, and each view shown have drawn. A screenshot
// of each is saved for the maintainer to look over, failed or not.
//
//   npm run build && npm run app:safari
//
// It needs Safari → Settings → Developer → "Allow remote automation" on, and its window left uncovered. It writes
// harness-out/safari-app/<scenario>.png and prints a table of the scenarios. Copy link's scenario leaves its link on
// the clipboard.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { MODEL_VERSION } from '../../src/sim/version.ts';
import { ADAPTER, serve } from '../browser.ts';
import { ROOT } from '../data/sources.ts';
import { Safari } from '../safari.ts';

const PORT = Number(process.env.PREVIEW_PORT ?? 5224);
const SAFARI_PORT = Number(process.env.SAFARI_DRIVER_PORT ?? 4445);
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
  const shown = (s) => Boolean($(s)) && !$(s).hidden;
`;

// What every page must do besides its own check: the GPU goes on running the worm's steps, and each view shown has
// drawn more than a flat colour, read back from its canvas as the visual tests read it.
const COMMON = `
  const problems = [];
  const steps = async () => (await globalThis.__drain())?.steps ?? null;
  const before = await steps();
  if (before === null) problems.push('no worm runs');
  else {
    let ran = false;
    for (const end = performance.now() + 5000; !ran && performance.now() < end; ) {
      await new Promise((r) => setTimeout(r, 250));
      ran = (await steps()) > before;
    }
    if (!ran) problems.push('the GPU ran no step in 5 s');
  }
  for (const which of ['plate', 'graph']) {
    const pane = document.querySelector('.pane-' + which);
    if (!pane || pane.hidden) continue;
    const image = await createImageBitmap(await (await fetch(await globalThis.__snap(which))).blob());
    const canvas = new OffscreenCanvas(image.width, image.height);
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, image.width, image.height);
    let differing = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (Math.abs(data[i] - data[0]) + Math.abs(data[i + 1] - data[1]) + Math.abs(data[i + 2] - data[2]) > 24) differing++;
    }
    if (differing < 200) problems.push('the ' + which + ' drew only ' + differing + ' pixels off its background');
  }
  return problems;`;

const SCENARIOS: Scenario[] = [
  {
    name: 'split',
    query: '?seed=4',
    check: `
      if (!shown('.pane-plate') || !shown('.pane-graph')) return 'a pane is missing';
      return param('model') === '${MODEL_VERSION}' && /^[0-9a-f]{8}$/.test(param('data') ?? '') ? '' : 'versions not written';`,
  },
  {
    name: 'plate-alone',
    query: '?view=plate&seed=4',
    check: `return shown('.pane-plate') && !$('.pane-graph') ? '' : 'not the plate alone';`,
  },
  {
    name: 'graph-alone',
    query: '?view=graph&seed=4',
    check: `return shown('.pane-graph') && !shown('.pane-plate') ? '' : 'not the graph alone';`,
  },
  {
    name: 'lesions-rewired',
    query: '?seed=4&lesions=AVAL+AVAR&brain=rewired-3',
    check: `
      if ($('#plate-brain-select').value !== '3') return 'the brain control shows ' + $('#plate-brain-select').value;
      if (!/AVAL.*AVAR/.test($('.plate-experiment').textContent)) return 'the lesions are not both listed';
      // A few seconds in, so the screenshot shows the rewired brain's glow.
      await until(() => $('.plate-time').textContent >= '0:03', 6000);
      return '';`,
  },
  {
    name: 'food',
    query: '?seed=4&food=10,0;-20,5',
    check: `
      const lawns = document.querySelectorAll('.plate-lawn').length;
      return lawns === 2 ? '' : lawns + ' lawns, not the two the link places';`,
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
      // Announced once the GPU runs the new wiring.
      if (!(await until(() => /now runs on the contrast brain/.test(said())))) return 'no swap was announced';
      return param('brain') === 'rewired-2' ? '' : 'the URL did not follow the swap';`,
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
      if (!(await until(() => param('lesions') === 'AVAL'))) return 'the lesion did not reach the URL';
      return (await until(() => /none, lesioned/.test($('.inspector-activity')?.textContent ?? '')))
        ? ''
        : 'the inspector still shows activity';`,
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

const firstLine = (e: unknown): string => (e instanceof Error ? e.message : String(e)).split('\n')[0];

mkdirSync(OUT, { recursive: true });
const stopServer = await serve(['preview'], PORT);
let safari: Safari | null = null;
let failed = 0;
let crashed: unknown = null;
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
      problems.push(...(await safari.evaluate<string[]>(COMMON)));
      problems.push(...(await safari.errors()));
    } catch (e) {
      problems.push(firstLine(e));
      // A page that couldn't start says why itself.
      const status = await safari
        .evaluate<string>(`return document.querySelector('.status-body')?.textContent ?? '';`)
        .catch(() => '');
      if (status) problems.push(`the page says: ${status}`);
    }
    try {
      writeFileSync(join(OUT, `${s.name}.png`), await safari.screenshot());
    } catch (e) {
      problems.push(`no screenshot: ${firstLine(e)}`);
    }
    if (problems.length > 0) failed++;
    rows.push(`| ${s.name} | \`${s.query}\` | ${problems.length === 0 ? 'passes' : problems.join('; ')} |`);
  }
  console.log(`GPU adapter: ${adapter}`);
  console.log('\n| Scenario | Link | Result |\n| --- | --- | --- |');
  for (const row of rows) console.log(row);
  console.log(`\nScreenshots in ${OUT}.`);
} catch (e) {
  crashed = e;
} finally {
  // A browser that won't close mustn't hide the run's result or leave the server up.
  await safari?.close().catch((e: unknown) => console.error(e));
  stopServer();
}
if (crashed) {
  console.error(crashed);
  process.exit(1);
}
if (failed > 0) console.error(`${failed} of ${SCENARIOS.length} scenarios failed.`);
process.exit(failed > 0 ? 1 : 0);
