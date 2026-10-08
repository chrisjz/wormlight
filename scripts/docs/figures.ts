// npm run docs:figures: draw REPORT.md's figures, as SVGs in docs/images/report/, from the committed records: checkpoint
// 6's summaries, the reflex diagnosis and the runtime data. With --check, exit 1 if a committed figure is stale.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { validateWormlightData } from '../../src/data/schema.ts';
import { cookNetwork } from '../../src/sim/brain/network.ts';
import { motorHops, nullNetwork, NULLS } from '../../src/validation/wiringTest.ts';
import { ROOT } from '../data/sources.ts';
import { readSummaries } from '../harness/wiring.ts';

const OUT = join(ROOT, 'docs/images/report');
const WIDTH = 720;
const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif';

// Colours as classes, light or dark by the reader's system setting, which inside an <img> need not match the page's.
const STYLE = `<style>
svg { --bg: #ffffff; --fg: #1f2328; --muted: #59636e; --grid: #d1d9e0; --band: #eef1f4; --real: #cf222e; --null: #0969da; }
@media (prefers-color-scheme: dark) {
  svg { --bg: #0d1117; --fg: #e6edf3; --muted: #9198a1; --grid: #3d444d; --band: #1c2128; --real: #ff7b72; --null: #4493f8; }
}
.bg { fill: var(--bg); }
text { font-family: ${FONT}; font-size: 13px; fill: var(--fg); }
.muted { fill: var(--muted); font-size: 12px; }
.grid { stroke: var(--grid); stroke-width: 1; }
.band { fill: var(--band); }
.real { fill: var(--real); stroke: var(--real); }
.null { fill: var(--null); stroke: var(--null); }
.hollow { fill: none; stroke: var(--null); stroke-width: 1.5; }
.line { fill: none; stroke: var(--fg); stroke-width: 2; }
.dash { stroke: var(--muted); stroke-width: 1.5; stroke-dasharray: 4 3; }
.fade { opacity: 0.45; }
</style>`;

const n = (x: number): string => (Math.round(x * 10) / 10).toString();
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const text = (x: number, y: number, s: string, attrs = ''): string =>
  `<text x="${n(x)}" y="${n(y)}" ${attrs}>${esc(s)}</text>`;
const line = (x1: number, y1: number, x2: number, y2: number, cls: string): string =>
  `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" class="${cls}"/>`;
const rect = (x: number, y: number, w: number, h: number, cls: string): string =>
  `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" class="${cls}"/>`;
const circle = (x: number, y: number, r: number, cls: string): string =>
  `<circle cx="${n(x)}" cy="${n(y)}" r="${r}" class="${cls}"/>`;
function svg(height: number, label: string, body: string[]): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${height}" width="${WIDTH}" height="${height}" role="img" aria-label="${esc(label)}">`,
    STYLE,
    // Its own background, so its colours hold whichever theme the page around it takes.
    `<rect width="${WIDTH}" height="${height}" class="bg"/>`,
    ...body,
    '</svg>',
    '',
  ].join('\n');
}

// A linear axis along x, from `lo` to `hi`, between pixels `left` and `right`.
const scale =
  (lo: number, hi: number, left: number, right: number) =>
  (v: number): number =>
    left + ((v - lo) / (hi - lo)) * (right - left);

const { real, nulls } = readSummaries();
const wirings = [real, ...nulls];
const label = (k: number): string => (k === 0 ? 'Real wiring' : `Rewiring ${k}`);

// Each wiring's checkpoint 1 speed with its 95% interval, against checkpoint 1's bands and a real worm's speed.
function crawl(): string {
  const left = 120;
  const right = WIDTH - 24;
  const top = 40;
  const row = 26;
  const bottom = top + row * wirings.length;
  const x = scale(0, 0.3, left, right);
  const body: string[] = [
    rect(x(0.06), top - 10, x(0.12) - x(0.06), bottom - top + 4, 'band'),
    rect(x(0.12), top - 10, x(0.3) - x(0.12), bottom - top + 4, 'band fade'),
    text(x(0.03), top - 18, 'fail', 'class="muted" text-anchor="middle"'),
    text(x(0.09), top - 18, 'partial', 'class="muted" text-anchor="middle"'),
    text(x(0.16), top - 18, 'pass', 'class="muted" text-anchor="middle"'),
    line(x(0.22), top - 10, x(0.22), bottom - 6, 'dash'),
    text(x(0.22) - 4, top - 18, 'a real worm, 0.22', 'class="muted" text-anchor="middle"'),
  ];
  wirings.forEach((w, k) => {
    const y = top + row * k + 8;
    const speed = w.speed;
    body.push(text(left - 10, y + 4, label(k), 'text-anchor="end"'));
    if (!speed || speed.value === null) return;
    const [lo, hi] = speed.interval;
    if (lo !== null && hi !== null) body.push(line(x(lo), y, x(hi), y, k === 0 ? 'real' : 'null'));
    body.push(circle(x(speed.value), y, k === 0 ? 6 : 5, k === 0 ? 'real' : w.crawls ? 'null' : 'hollow'));
  });
  body.push(line(left, bottom, right, bottom, 'grid'));
  for (const t of [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3]) {
    body.push(line(x(t), bottom, x(t), bottom + 5, 'grid'));
    body.push(text(x(t), bottom + 20, t.toFixed(2), 'class="muted" text-anchor="middle"'));
  }
  body.push(
    text(
      (left + right) / 2,
      bottom + 42,
      'Speed on checkpoint 1, body lengths per second (95% interval)',
      'text-anchor="middle"',
    ),
    circle(left + 6, bottom + 66, 5, 'null'),
    text(left + 16, bottom + 70, 'crawls (checkpoint 1 at least partial)', 'class="muted"'),
    circle(left + 286, bottom + 66, 5, 'hollow'),
    text(left + 296, bottom + 70, "doesn't crawl", 'class="muted"'),
  );
  return svg(bottom + 84, "Checkpoint 1's speed for the real wiring and the ten tuned rewirings", body);
}

// How far forward each wiring moves under the runs that show what paces its crawl.
function pacing(): string {
  const left = 190;
  const right = WIDTH - 24;
  const top = 24;
  const row = 44;
  const x = scale(0, 1, left, right);
  const shown = [
    ['The head switch off, g_sw at 0', 'Head switch off'],
    ['The 18 B-types lesioned', 'B-types lesioned'],
    ['The 21 A-types lesioned', 'A-types lesioned'],
    ['AVBL and AVBR lesioned', 'AVB lesioned'],
  ] as const;
  const bottom = top + row * shown.length;
  const body: string[] = [];
  shown.forEach(([name, short], r) => {
    const y = top + row * r + row / 2;
    body.push(line(left, y, right, y, 'grid'), text(left - 12, y + 4, short, 'text-anchor="end"'));
    nulls.forEach((w, k) => {
      const v = w.variants?.find((x) => x.name === name);
      // A small, fixed vertical offset per rewiring keeps dots at the same share apart.
      if (v) body.push(circle(x(v.forward), y - 8 + (k % 5) * 4, 4.5, w.crawls ? 'null' : 'hollow'));
    });
    const v = real.variants?.find((x) => x.name === name);
    if (v) body.push(`<path d="M ${n(x(v.forward))} ${n(y - 8)} l 7 8 l -7 8 l -7 -8 z" class="real"/>`);
  });
  body.push(line(left, bottom, right, bottom, 'grid'));
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    body.push(line(x(t), bottom, x(t), bottom + 5, 'grid'));
    body.push(text(x(t), bottom + 20, `${t * 100}%`, 'class="muted" text-anchor="middle"'));
  }
  body.push(
    text(
      (left + right) / 2,
      bottom + 42,
      "Share of checkpoint 1's measured samples moving forward",
      'text-anchor="middle"',
    ),
    `<path d="M ${left + 6} ${bottom + 58} l 7 8 l -7 8 l -7 -8 z" class="real"/>`,
    text(left + 18, bottom + 70, 'real wiring', 'class="muted"'),
    circle(left + 116, bottom + 66, 4.5, 'null'),
    text(left + 126, bottom + 70, 'rewiring that crawls', 'class="muted"'),
    circle(left + 286, bottom + 66, 4.5, 'hollow'),
    text(left + 296, bottom + 70, "rewiring that doesn't", 'class="muted"'),
  );
  return svg(bottom + 84, 'Forward share with the head switch off and with classes lesioned, for every wiring', body);
}

const diagnosis = JSON.parse(readFileSync(join(ROOT, 'data/reflex/diagnosis.json'), 'utf8')) as {
  chain: {
    rise: number;
    decay: number;
    slope: number;
    activationAtRest: number;
    activationCeiling: number;
    stages: { pre: string[]; post: string; ceilingShift: number }[];
  };
};

// A graded synapse's steady activation against its presynaptic voltage, a_r·φ / (a_r·φ + a_d), with φ the sigmoid.
function synapse(): string {
  const { rise, decay, slope, activationAtRest, activationCeiling } = diagnosis.chain;
  const left = 70;
  const right = WIDTH - 24;
  const top = 20;
  const bottom = 280;
  const x = scale(-40, 40, left, right);
  const y = (s: number): number => bottom - (s / 0.2) * (bottom - top);
  const points = Array.from({ length: 161 }, (_, i) => {
    const v = -40 + i * 0.5;
    const phi = 1 / (1 + Math.exp(-slope * v));
    return `${n(x(v))},${n(y((rise * phi) / (rise * phi + decay)))}`;
  });
  const body: string[] = [
    line(left, y(activationCeiling), right, y(activationCeiling), 'dash'),
    text(
      left + 8,
      y(activationCeiling) - 8,
      `ceiling a_r/(a_r + a_d) = ${activationCeiling.toFixed(3)}`,
      'class="muted"',
    ),
    `<polyline points="${points.join(' ')}" class="line"/>`,
    circle(x(0), y(activationAtRest), 6, 'real'),
    text(x(0) + 12, y(activationAtRest) + 18, `at rest, V = V_th: ${activationAtRest.toFixed(3)}`, ''),
    text(
      x(0) + 12,
      y(activationAtRest) + 36,
      `no voltage lifts it more than ${Math.round((activationCeiling / activationAtRest - 1) * 100)}% above rest`,
      'class="muted"',
    ),
    line(left, bottom, right, bottom, 'grid'),
    line(left, top, left, bottom, 'grid'),
  ];
  for (const t of [-40, -20, 0, 20, 40]) {
    body.push(line(x(t), bottom, x(t), bottom + 5, 'grid'));
    body.push(text(x(t), bottom + 20, t > 0 ? `+${t}` : `${t}`, 'class="muted" text-anchor="middle"'));
  }
  for (const s of [0, 0.05, 0.1, 0.15, 0.2]) {
    body.push(line(left - 5, y(s), left, y(s), 'grid'));
    body.push(text(left - 9, y(s) + 4, s.toFixed(2), 'class="muted" text-anchor="end"'));
  }
  body.push(
    text(
      (left + right) / 2,
      bottom + 42,
      'Presynaptic voltage above its threshold, V − V_th (mV)',
      'text-anchor="middle"',
    ),
    text(
      18,
      (top + bottom) / 2,
      'Steady activation',
      `text-anchor="middle" transform="rotate(-90 18 ${n((top + bottom) / 2)})"`,
    ),
  );
  return svg(bottom + 56, "A graded synapse's steady activation against its presynaptic voltage", body);
}

// The most each stage of the touch-to-motor chain could move its target, every presynaptic activation at its ceiling.
function chain(): string {
  const left = 190;
  const right = WIDTH - 24;
  const top = 16;
  const row = 22;
  const stages = diagnosis.chain.stages;
  const bottom = top + row * stages.length + 6;
  const x = (mV: number): number => scale(-3, 2, left, right)(Math.log10(mV));
  const group = (pre: readonly string[]): string =>
    pre.includes('ALML')
      ? 'ALM, AVM'
      : pre.includes('PLML')
        ? 'PLM, PVM'
        : pre.includes('AVDL')
          ? 'AVD'
          : pre.includes('AVAL')
            ? 'AVA'
            : pre.includes('AVBL')
              ? 'AVB'
              : pre.join(', ');
  const body: string[] = [line(x(10), top - 6, x(10), bottom, 'dash')];
  stages.forEach((s, k) => {
    const y = top + row * k + row / 2;
    body.push(text(left - 10, y + 4, `${group(s.pre)} → ${s.post}`, 'text-anchor="end"'));
    if (s.ceilingShift > 0) {
      const v = Math.max(s.ceilingShift, 0.001);
      body.push(rect(left, y - 7, x(v) - left, 14, s.pre.includes('AVAL') ? 'real' : 'null'));
      body.push(
        text(
          x(v) + 6,
          y + 4,
          `${s.ceilingShift < 0.1 ? s.ceilingShift.toFixed(3) : s.ceilingShift.toFixed(2)} mV`,
          'class="muted"',
        ),
      );
    } else {
      body.push(text(left + 6, y + 4, 'no such synapse', 'class="muted"'));
    }
  });
  body.push(line(left, bottom, right, bottom, 'grid'));
  for (const t of [0.001, 0.01, 0.1, 1, 10, 100]) {
    body.push(line(x(t), bottom, x(t), bottom + 5, 'grid'));
    body.push(text(x(t), bottom + 20, `${t}`, 'class="muted" text-anchor="middle"'));
  }
  body.push(
    text(x(10) - 6, bottom + 38, "a touch's 10 mV at its receptors", 'class="muted" text-anchor="end"'),
    text(
      (left + right) / 2,
      bottom + 58,
      'Most the synapses could move their target, at rest (mV, log scale)',
      'text-anchor="middle"',
    ),
  );
  return svg(bottom + 70, "The touch-to-motor chain's ceilings at rest", body);
}

// nematode's Logbook 071 statistic: motor neurons at each number of hops from the six food sensors.
function hops(): string {
  const data = validateWormlightData(JSON.parse(readFileSync(join(ROOT, 'public/data/wormlight.v1.json'), 'utf8')));
  const counts = [cookNetwork(data), ...NULLS.map((k) => nullNetwork(data, k))].map(motorHops);
  const left = 120;
  const right = WIDTH - 24;
  const top = 16;
  const row = 24;
  const bottom = top + row * counts.length + 6;
  const x = scale(0, 39, left, right);
  const classes = ['real', 'null', 'null fade'];
  const body: string[] = [];
  counts.forEach((h, k) => {
    const y = top + row * k + row / 2;
    body.push(text(left - 10, y + 4, label(k), 'text-anchor="end"'));
    let at = 0;
    h.atHops.forEach((c, i) => {
      if (c > 0) body.push(rect(x(at), y - 8, x(at + c) - x(at), 16, classes[Math.min(i, classes.length - 1)]));
      if (c > 0 && i === 0) body.push(text(x(at) + 4, y + 4, `${c}`, 'style="fill: #fff; font-size: 12px"'));
      at += c;
    });
  });
  body.push(line(left, bottom, right, bottom, 'grid'));
  for (const t of [0, 10, 20, 30, 39]) {
    body.push(line(x(t), bottom, x(t), bottom + 5, 'grid'));
    body.push(text(x(t), bottom + 20, `${t}`, 'class="muted" text-anchor="middle"'));
  }
  body.push(
    text(
      (left + right) / 2,
      bottom + 42,
      'The 39 A- and B-type motor neurons, by hops from the nearest food sensor',
      'text-anchor="middle"',
    ),
    rect(left, bottom + 58, 14, 14, 'real'),
    text(left + 20, bottom + 70, 'one hop', 'class="muted"'),
    rect(left + 100, bottom + 58, 14, 14, 'null'),
    text(left + 120, bottom + 70, 'two hops', 'class="muted"'),
    rect(left + 200, bottom + 58, 14, 14, 'null fade'),
    text(left + 220, bottom + 70, 'three hops', 'class="muted"'),
  );
  return svg(bottom + 84, "Motor neurons by hops from a food sensor, nematode's Logbook 071 statistic", body);
}

const FIGURES: Record<string, () => string> = {
  'crawl.svg': crawl,
  'pacing.svg': pacing,
  'synapse.svg': synapse,
  'chain.svg': chain,
  'hops.svg': hops,
};

const check = process.argv.includes('--check');
const stale: string[] = [];
if (!check) mkdirSync(OUT, { recursive: true });
for (const [name, draw] of Object.entries(FIGURES)) {
  const path = join(OUT, name);
  const figure = draw();
  if (check) {
    let committed = '';
    try {
      committed = readFileSync(path, 'utf8');
    } catch {
      // A missing figure is stale.
    }
    if (committed !== figure) stale.push(relative(ROOT, path));
  } else {
    writeFileSync(path, figure);
  }
}
if (stale.length > 0) {
  console.error(`Stale report figures: ${stale.join(', ')}. Run npm run docs:figures and commit the result.`);
  process.exit(1);
}
console.log(
  check
    ? "REPORT.md's figures are up to date."
    : `Wrote ${Object.keys(FIGURES).length} figures to ${relative(ROOT, OUT)}.`,
);
