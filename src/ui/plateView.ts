// The plate view (spec §5, §6): the worm on a 10 cm agar dish, its whole loop, brain and body, stepped on the
// GPU and drawn from the GPU's own body buffer. The camera follows the worm at body scale, with the whole
// dish in an inset. The worm starts straight at the dish's centre, heading where its seed says.
// - Mouse: click the worm to touch it, drag to pan, scroll to zoom, double-click to follow the worm again (on
//   the worm, a double-click touches it once and follows).
// - Touch: tap the worm to touch it, drag to pan, pinch to zoom, double-tap to follow.
// - Keyboard, with the plate focused: space pauses and resumes, arrows pan, + and − zoom, F follows the worm,
//   Home resets the view. Keys held with Ctrl, Cmd or Alt are left to the browser. "Touch front" and "Touch
//   back" touch the worm from anywhere (PLAN §4.2).
// - Food (PLAN §5.2): "Add food" arms placing, and the next click on the dish drops a lawn there, or Enter at
//   the view's centre; Escape cancels. A lawn drags, and dragged off the dish is removed; "Clear food" removes
//   them all. The URL's ?food= follows the lawns. The odour field is stepped on the GPU with the worm.

import type { WormlightData } from '../data/schema.ts';
import { dispatches } from '../gpu/brain.ts';
import { ROD_CONSTANTS, ROD_WORDS } from '../gpu/brainShader.ts';
import { GpuField } from '../gpu/field.ts';
import { packOdour } from '../gpu/loopLayout.ts';
import { GpuWorld } from '../gpu/world.ts';
import { PlateRenderer, type PlateFrame } from '../render/plate.ts';
import {
  halfExtent,
  metresPerPixel,
  scaleBar,
  toScreen,
  toWorld,
  zoomAbout,
  type PlateCamera,
} from '../render/plateCamera.ts';
import { PARAMS } from '../science/params.ts';
import { between, nearestOnMidline } from '../sim/body/body.ts';
import { FIRST_LAWN, inDish, LAWN_RADIUS, lawnField, lawnSources, MAX_LAWNS, type Lawn } from '../sim/env/dish.ts';
import { OdourField } from '../sim/env/odour.ts';
import { NEURAL_STEP } from '../sim/numerics.ts';
import { BACK, FRONT } from '../sim/touch.ts';
import { Pacer, Rates } from './pacing.ts';
import { writeFood, type PlateParams } from './params.ts';
import { appWorld } from './start.ts';

const DISH = PARAMS.dishDiameter.value / 200; // cm → m, radius
const LENGTH = PARAMS.bodyLength.value / 1000; // mm → m
const SPAN = 3 * LENGTH; // the default field of view across the shorter side
const SPAN_LIMITS: [number, number] = [0.4 * LENGTH, 2.4 * DISH];
const FOLLOW = 0.6; // s of worm time, the camera's lag behind the worm
const SPEEDS = [0.25, 1, 4, 10];
const TRAIL_EVERY = 0.5; // s of worm time between the inset's trail points
const TRAIL_MAX = 7200;
const STAGING = 3; // readback buffers in flight
const SLOP = { mouse: 4, touch: 10 }; // px a press may move and still not pan
const VALIDATION = 'https://github.com/chrisjz/wormlight/blob/main/VALIDATION.md';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(className: string, text: string, label?: string): HTMLButtonElement {
  const b = el('button', className, text);
  b.type = 'button';
  if (label) b.setAttribute('aria-label', label);
  return b;
}

const SVG = 'http://www.w3.org/2000/svg';
function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attributes)) node.setAttribute(k, String(v));
  return node;
}

// A seed for a visit that doesn't name one.
const randomSeed = (): number => crypto.getRandomValues(new Uint32Array(1))[0];

const clock = (seconds: number): string => {
  const s = Math.floor(seconds);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
};

export interface PlateHandle {
  // Resolves once the first frame has been drawn, or, with ?norender=1, once the plate is ready to snapshot.
  ready: Promise<void>;
  snapshot(): Promise<ImageData>;
  // Frames a second, and simulated seconds a wall second, over the last second.
  rates(): { fps: number; speed: number };
  // How long the GPU takes to finish the work already submitted (ms), and the steps it has taken: a
  // benchmark's check that the steps counted were run, not queued.
  drain(): Promise<{ milliseconds: number; steps: number }>;
  stop(): void;
}

export async function startPlate(
  pane: HTMLElement,
  device: GPUDevice,
  data: WormlightData,
  params: PlateParams,
  noRender: boolean,
): Promise<PlateHandle> {
  const canvas = el('canvas');
  canvas.id = 'plate';
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute(
    'aria-label',
    'The worm on its agar dish, seen from above. Clicking the worm touches it; with Add food on, clicking the ' +
      'dish drops a lawn there, and a lawn can be dragged, or dragged off the dish to remove it. With the dish ' +
      'focused, space pauses and resumes, the arrow keys pan, plus and minus zoom, F or a double-click follows ' +
      "the worm, Home resets the view, and with Add food on, Enter drops a lawn at the view's centre and Escape " +
      'cancels.',
  );

  let seed = params.seed ?? randomSeed();
  // The lawns in place, the URL's or the app's first.
  let lawns: Lawn[] = [...(params.food ?? [FIRST_LAWN])];
  // The GPU compiles the world's pipeline while the CPU solves the lawns' steady odour field: the page yields
  // first, so the browser sends the GPU its work before the solve holds the thread. Its world smells nothing
  // until the field is ready.
  const creating = GpuWorld.create(device, appWorld(data, seed));
  await new Promise((resolve) => setTimeout(resolve, 0));
  let field: OdourField;
  try {
    field = lawnField(lawns);
  } catch (e) {
    creating.then(
      (made) => made.destroy(),
      () => undefined,
    );
    throw e;
  }
  const gpu = await creating;
  const rods = gpu.layout.rods;
  const radii = Float32Array.from({ length: rods }, (_, i) => gpu.layout.rodConstants[ROD_CONSTANTS * i]);
  // The field the GPU steps from here on, which the worm senses and the plate draws.
  let made: GpuField | null = null;
  let renderer: PlateRenderer;
  try {
    made = await GpuField.create(device, packOdour(field), field.source);
    // The worm smells the lawns' odour, adapted to it where it starts.
    gpu.useField(made);
    gpu.restore(appWorld(data, seed, field).snapshot());
    renderer = await PlateRenderer.create(device, canvas, gpu.brain.bodyBuffer, radii, LENGTH, made.cells * made.cell);
  } catch (e) {
    made?.destroy();
    gpu.destroy();
    throw e;
  }
  const stepped = made;

  // The overlays: the title and the notice, the time controls, the dish inset and the scale.
  const header = el('header', 'plate-head');
  const lede = el(
    'p',
    'plate-lede',
    'A C. elegans on a 10 cm agar dish, its body moved through its muscles by its connectome.',
  );
  const notice = el('p', 'plate-notice');
  const why = el('a', undefined, 'Why');
  why.href = VALIDATION;
  why.rel = 'noopener';
  notice.append(
    el('strong', undefined, "Crawling doesn't emerge yet. "),
    'No parameter values tried so far make this model crawl: the worm bends and creeps, but does not crawl. ',
    why,
  );
  header.append(el('h1', 'brand-title', 'Wormlight'), lede, notice);

  const controls = el('div', 'plate-controls');
  controls.setAttribute('role', 'group');
  controls.setAttribute('aria-label', 'Controls');
  const play = button('plate-play', 'Pause');
  const speeds = el('div', 'plate-speeds');
  speeds.setAttribute('role', 'radiogroup');
  speeds.setAttribute('aria-label', 'Speed');
  const speedButtons = SPEEDS.map((s) => {
    const text = s === 0.25 ? '¼×' : `${s}×`;
    const b = button('plate-speed', text, `${text} real time`);
    b.setAttribute('role', 'radio');
    speeds.append(b);
    return b;
  });
  const restart = button('plate-button', 'Restart', 'Restart this worm');
  const fresh = button('plate-button', 'New worm', 'Start a new worm with a new seed');
  const touches = el('div', 'plate-touches');
  touches.setAttribute('role', 'group');
  touches.setAttribute('aria-label', 'Touch');
  const touchFront = button('plate-button', 'Touch front', 'Touch front, where ALM and AVM sense');
  const touchBack = button('plate-button', 'Touch back', 'Touch back, where PLM senses');
  touches.append(touchFront, touchBack);
  const food = el('div', 'plate-touches');
  food.setAttribute('role', 'group');
  food.setAttribute('aria-label', 'Food');
  const addFood = button(
    'plate-button',
    'Add food',
    "Add food: click the dish to drop a lawn there, or press Enter to drop it at the view's centre",
  );
  addFood.setAttribute('aria-pressed', 'false');
  const clearFood = button('plate-button', 'Clear food', 'Clear food, removing every lawn');
  food.append(addFood, clearFood);
  const time = el('span', 'plate-time');
  const timeValue = el('span');
  time.append(el('span', 'sr-only', 'Worm time '), timeValue);
  const seedText = el('span', 'plate-seed');
  controls.append(play, speeds, restart, fresh, touches, food, time, seedText);

  const follow = button('plate-follow', 'Follow the worm');
  follow.hidden = true;
  const map = el('figure', 'plate-map');
  const inset = svg('svg', { viewBox: '-1.08 -1.08 2.16 2.16', 'aria-hidden': 'true' });
  const trail = svg('polyline', { class: 'plate-trail', points: '' });
  const view = svg('rect', { class: 'plate-view' });
  const dot = svg('circle', { class: 'plate-dot', r: 0.035 });
  const lawnMarks = svg('g', {});
  inset.append(svg('circle', { class: 'plate-dish', r: 1 }), lawnMarks, trail, view, dot);
  const scale = el('div', 'plate-scale');
  const bar = el('span', 'plate-bar');
  const barLabel = el('span', 'plate-bar-label');
  scale.append(bar, barLabel);
  const caption = el('figcaption', 'sr-only', 'The whole dish: where the worm is, and the food lawns.');
  map.append(scale, inset, caption);
  const stats = el('span', 'plate-stats');
  stats.hidden = !params.stats;
  controls.append(stats);
  // The controls and the inset share the bottom edge, the inset moving above the controls where both don't fit.
  const bottom = el('div', 'plate-bottom');
  bottom.append(controls, map);
  const live = el('p', 'sr-only');
  live.setAttribute('aria-live', 'polite');
  pane.replaceChildren(canvas, header, follow, bottom, live);

  // State.
  let running = !params.paused;
  let speed = 1;
  let steps = 0;
  let stopped = false;
  const clampSpan = (s: number): number => Math.max(SPAN_LIMITS[0], Math.min(SPAN_LIMITS[1], s));
  const homeSpan = clampSpan(params.span ?? SPAN);
  // A URL may centre the camera elsewhere, and then it doesn't follow the worm until asked.
  let camera: PlateCamera = { centre: params.centre ?? [0, 0], span: homeSpan };
  let following = params.centre === null;
  let centroid: [number, number] = [0, 0];
  // The rods' centres as last read back, [x0, y0, x1, y1, …], once this run has had a reading.
  const bodyAt = new Float64Array(2 * rods);
  let bodyKnown = false;
  const points: [number, number][] = [];
  let lastTrail = -Infinity;
  let trailChanged = true;
  // Which run of the worm this is: a readback from an earlier run, landing after a restart, is dropped.
  let run = 0;
  const pacer = new Pacer(NEURAL_STEP);
  const rates = new Rates();
  let pending = 0;
  let dirty = true;

  const setSpeed = (s: number): void => {
    speed = s;
    // One radio is always reachable by Tab: the checked one, or the first if a URL asked for another speed.
    const at = SPEEDS.indexOf(s);
    speedButtons.forEach((b, k) => {
      b.setAttribute('aria-checked', String(k === at));
      b.tabIndex = k === Math.max(at, 0) ? 0 : -1;
    });
  };
  const setRunning = (on: boolean, announce = true): void => {
    running = on;
    play.textContent = on ? 'Pause' : 'Play';
    pacer.reset();
    if (announce) live.textContent = on ? 'Running.' : 'Paused.';
    dirty = true;
  };
  const showSeed = (): void => {
    seedText.textContent = `Seed ${seed}`;
  };
  const restartWith = (next: number): void => {
    seed = next;
    // The setup a link reproduces: these lawns, their field steady, as the page began.
    cancelDrag();
    field = lawnField(lawns);
    stepped.set(packOdour(field).values);
    stepped.setSources(field.source);
    // The seed draws which AWC is ON, so the GPU takes the whole world, not only its state.
    gpu.load(appWorld(data, seed, field));
    steps = 0;
    run++;
    points.length = 0;
    lastTrail = -Infinity;
    trailChanged = true;
    centroid = [0, 0];
    bodyKnown = false;
    if (following) camera = { ...camera, centre: [0, 0] };
    pacer.reset();
    showSeed();
    live.textContent = `Restarted with seed ${seed}.`;
    dirty = true;
    // Paused, no step reads the body back, and a tap needs it.
    readBody();
  };
  setSpeed(params.speed);
  setRunning(running, false);
  showSeed();
  follow.hidden = following;

  play.addEventListener('click', () => setRunning(!running));
  speedButtons.forEach((b, k) => b.addEventListener('click', () => setSpeed(SPEEDS[k])));
  // A radio group's keys: right and down go to the next speed, left and up to the one before, wrapping; Home
  // and End go to the slowest and fastest.
  speeds.addEventListener('keydown', (e) => {
    const at = Math.max(SPEEDS.indexOf(speed), 0);
    const last = SPEEDS.length - 1;
    const next =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? (at + 1) % SPEEDS.length
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? (at + last) % SPEEDS.length
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? last
              : null;
    if (next === null) return;
    e.preventDefault();
    setSpeed(SPEEDS[next]);
    speedButtons[next].focus();
  });
  restart.addEventListener('click', () => restartWith(seed));
  fresh.addEventListener('click', () => restartWith(randomSeed()));
  const setFollowing = (on: boolean): void => {
    following = on;
    follow.hidden = on;
    dirty = true;
  };
  follow.addEventListener('click', () => {
    setFollowing(true);
    canvas.focus();
  });

  // The camera, in CSS pixels for the pointer and device pixels for the renderer.
  const size = (): [number, number] => [Math.max(canvas.clientWidth, 1), Math.max(canvas.clientHeight, 1)];
  const zoom = (factor: number, x?: number, y?: number): void => {
    const [w, h] = size();
    const next = zoomAbout(camera, clampSpan(camera.span * factor) / camera.span, x ?? w / 2, y ?? h / 2, w, h);
    // Following keeps the worm centred, so zoom about the centre.
    camera = following ? { ...camera, span: next.span } : next;
    dirty = true;
  };
  const pan = (dx: number, dy: number): void => {
    const [w, h] = size();
    const m = metresPerPixel(camera, w, h);
    camera = { ...camera, centre: [camera.centre[0] - dx * m, camera.centre[1] + dy * m] };
    setFollowing(false);
  };

  // Touching the worm (PLAN §4.2): a tap at body coordinate s, marked by a ring where it lands and announced
  // with the receptors it reaches.
  const touchAt = (s: number): void => {
    const reached = [...new Set(gpu.touch(s).map((r) => r.name.replace(/[LR]$/, '')))];
    const text =
      `Touched ${Math.round(100 * s)}% of the way along the worm: ` +
      `${reached.length > 0 ? reached.join(', ') : 'no touch receptor there'}.`;
    // The same words again are cleared first, or a screen reader may not read them twice.
    if (live.textContent === text) {
      live.textContent = '';
      setTimeout(() => {
        live.textContent = text;
      }, 50);
    } else live.textContent = text;
    if (!bodyKnown) return;
    const [k, f] = between(s, rods - 1);
    const point: [number, number] = [
      bodyAt[2 * k] + f * (bodyAt[2 * k + 2] - bodyAt[2 * k]),
      bodyAt[2 * k + 1] + f * (bodyAt[2 * k + 3] - bodyAt[2 * k + 1]),
    ];
    const [x, y] = toScreen(camera, point, ...size());
    const mark = el('span', 'plate-ring');
    mark.setAttribute('aria-hidden', 'true');
    mark.style.left = `${canvas.offsetLeft + x}px`;
    mark.style.top = `${canvas.offsetTop + y}px`;
    pane.append(mark);
    setTimeout(() => mark.remove(), 800);
  };
  touchFront.addEventListener('click', () => touchAt(FRONT));
  touchBack.addEventListener('click', () => touchAt(BACK));
  // A click or tap on the body touches its nearest point: within the body's radius there, or the pointer's slop
  // outside it, of the midline read back a frame or two ago.
  // A second tap soon after the first and close by is a double-click's or double-tap's, which follows instead.
  let lastTap = { time: -Infinity, x: 0, y: 0 };
  const DOUBLE = 500; // ms
  const tapAt = (x: number, y: number, slop: number): void => {
    const now = performance.now();
    const second = now - lastTap.time < DOUBLE && Math.hypot(x - lastTap.x, y - lastTap.y) <= 2 * slop;
    lastTap = second ? { time: -Infinity, x: 0, y: 0 } : { time: now, x, y };
    if (second || !bodyKnown) return;
    const [w, h] = size();
    const [px, py] = toWorld(camera, x, y, w, h);
    const nearest = nearestOnMidline(bodyAt, radii, px, py);
    if (nearest.distance <= nearest.radius + slop * metresPerPixel(camera, w, h)) touchAt(nearest.s);
  };

  // The food (PLAN §5.2). Each lawn releases while it is in place, the one being dragged where it is while that
  // is on the dish; the field's sources follow them, and what a lawn released stays to diffuse and decay.
  let drag: { index: number; at: Lawn } | null = null;
  let placing = false;
  const placed = (): Lawn[] => {
    const moving = drag;
    if (moving === null) return lawns;
    return lawns.flatMap((lawn, k) => (k !== moving.index ? [lawn] : inDish(...moving.at) ? [moving.at] : []));
  };
  const drawLawns = (now: readonly Lawn[]): void => {
    lawnMarks.replaceChildren(
      ...now.map(([x, y]) =>
        svg('circle', {
          class: 'plate-lawn',
          cx: (x / DISH).toFixed(4),
          cy: (-y / DISH).toFixed(4),
          r: (LAWN_RADIUS / DISH).toFixed(4),
        }),
      ),
    );
  };
  const refreshFood = (): void => {
    const now = placed();
    const sources = new OdourField(field.geometry);
    sources.setSources(lawnSources(now));
    stepped.setSources(sources.source);
    drawLawns(now);
    addFood.disabled = lawns.length >= MAX_LAWNS;
    clearFood.disabled = lawns.length === 0;
    dirty = true;
  };
  // The URL follows the lawns, leaving ?food= out while they are the app's first alone.
  const writeUrl = (): void => {
    const url = new URL(location.href);
    const first = lawns.length === 1 && lawns[0][0] === FIRST_LAWN[0] && lawns[0][1] === FIRST_LAWN[1];
    if (first) url.searchParams.delete('food');
    else url.searchParams.set('food', writeFood(lawns));
    history.replaceState(history.state, '', url);
  };
  const setLawns = (next: Lawn[]): void => {
    lawns = next;
    refreshFood();
    writeUrl();
  };
  const cancelDrag = (): void => {
    if (drag === null) return;
    drag = null;
    refreshFood();
  };
  const setPlacing = (on: boolean): void => {
    placing = on && lawns.length < MAX_LAWNS;
    addFood.setAttribute('aria-pressed', String(placing));
    canvas.style.cursor = placing ? 'crosshair' : '';
    if (placing) {
      canvas.focus();
      live.textContent =
        "Placing food: click the dish, or press Enter to drop it at the view's centre. Escape cancels.";
    }
  };
  const drop = (at: Lawn): void => {
    if (!inDish(...at)) {
      live.textContent = 'That is off the dish; food goes on the agar.';
      return;
    }
    setLawns([...lawns, at]);
    setPlacing(false);
    live.textContent = `Dropped a lawn ${Math.round(Math.hypot(...at) * 1000)} mm from the dish's centre.`;
  };
  // The lawn under a pointer, within its radius or the pointer's slop outside it, the nearest if several.
  const lawnAt = (x: number, y: number, slop: number): number | null => {
    const [w, h] = size();
    const point = toWorld(camera, x, y, w, h);
    const reach = LAWN_RADIUS + slop * metresPerPixel(camera, w, h);
    let best: number | null = null;
    let nearest = Infinity;
    lawns.forEach(([lx, ly], k) => {
      const d = Math.hypot(point[0] - lx, point[1] - ly);
      if (d <= reach && d < nearest) {
        best = k;
        nearest = d;
      }
    });
    return best;
  };
  addFood.addEventListener('click', () => {
    setPlacing(!placing);
    if (!placing) live.textContent = 'Placing cancelled.';
  });
  clearFood.addEventListener('click', () => {
    cancelDrag();
    setLawns([]);
    live.textContent = 'Food cleared. Its odour fades over a few minutes.';
  });
  refreshFood();

  // Pointers: one pans once it has moved past the slop, or drags the lawn it was pressed on; a click or a tap
  // drops a lawn while placing, touches the worm if it is on it, and elsewhere only focuses; two pinch to zoom.
  const pointers = new Map<
    number,
    { x: number; y: number; startX: number; startY: number; slop: number; lawn: number | null }
  >();
  let dragging = false;
  let pinch: { span: number } | null = null;
  // Whether the gesture under way has had two pointers down, so its release is no tap.
  let pinched = false;
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    const slop = e.pointerType === 'mouse' ? SLOP.mouse : SLOP.touch;
    const lawn = placing || pointers.size > 0 ? null : lawnAt(e.offsetX, e.offsetY, slop);
    pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY, startX: e.offsetX, startY: e.offsetY, slop, lawn });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { span: Math.hypot(a.x - b.x, a.y - b.y) };
      pinched = true;
      cancelDrag();
    }
  });
  const release = (e: PointerEvent): void => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 0) {
      dragging = false;
      pinched = false;
    }
    canvas.style.cursor = '';
  };
  canvas.addEventListener('pointermove', (e) => {
    const last = pointers.get(e.pointerId);
    if (!last) return;
    // A mouse whose buttons are all up has lost its release, as behind a context menu.
    if (e.pointerType === 'mouse' && e.buttons === 0) {
      release(e);
      return;
    }
    const dx = e.offsetX - last.x;
    const dy = e.offsetY - last.y;
    last.x = e.offsetX;
    last.y = e.offsetY;
    if (pointers.size === 2 && pinch) {
      const [a, b] = [...pointers.values()];
      const span = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch.span > 0 && span > 0) zoom(pinch.span / span, (a.x + b.x) / 2, (a.y + b.y) / 2);
      pinch = { span };
      return;
    }
    if (pointers.size !== 1) return;
    if (!dragging && Math.hypot(e.offsetX - last.startX, e.offsetY - last.startY) <= last.slop) return;
    // Past the slop, a lawn pressed on follows the pointer.
    if (last.lawn !== null && !pinched) {
      dragging = true;
      canvas.style.cursor = 'grabbing';
      const [w, h] = size();
      drag = { index: last.lawn, at: toWorld(camera, e.offsetX, e.offsetY, w, h) };
      refreshFood();
      return;
    }
    // Past the slop, the pan catches up with the pointer from where it was pressed.
    const [fx, fy] = dragging ? [dx, dy] : [e.offsetX - last.startX, e.offsetY - last.startY];
    dragging = true;
    canvas.style.cursor = 'grabbing';
    pan(fx, fy);
  });
  canvas.addEventListener('pointerup', (e) => {
    const pointer = pointers.get(e.pointerId);
    // Only a primary press taps: not a right-click, a Ctrl-click (a right-click on a Mac) or a pen's barrel button.
    const tap =
      pointer &&
      pointers.size === 1 &&
      !dragging &&
      !pinched &&
      e.button === 0 &&
      !(e.pointerType === 'mouse' && e.ctrlKey);
    release(e);
    const moving = drag;
    if (moving !== null && pointers.size === 0) {
      // A lawn dropped on the dish stays there; dragged off it, it goes.
      drag = null;
      if (inDish(...moving.at)) {
        setLawns(lawns.map((lawn, k) => (k === moving.index ? moving.at : lawn)));
        live.textContent = `Moved a lawn to ${Math.round(Math.hypot(...moving.at) * 1000)} mm from the dish's centre.`;
      } else {
        setLawns(lawns.filter((_, k) => k !== moving.index));
        live.textContent = 'Removed a lawn. Its odour fades over a few minutes.';
      }
      return;
    }
    if (!tap) return;
    if (placing) {
      const [w, h] = size();
      drop(toWorld(camera, e.offsetX, e.offsetY, w, h));
    } else tapAt(e.offsetX, e.offsetY, pointer.slop);
  });
  canvas.addEventListener('pointercancel', (e) => {
    release(e);
    cancelDrag();
  });
  canvas.addEventListener('lostpointercapture', (e) => {
    if (!pointers.has(e.pointerId)) return;
    release(e);
    cancelDrag();
  });
  canvas.addEventListener('dblclick', () => setFollowing(true));
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const per = e.ctrlKey ? 0.01 : e.deltaMode === 1 ? 0.05 : e.deltaMode === 2 ? 1 : 0.0015;
      zoom(Math.exp(e.deltaY * per), e.offsetX, e.offsetY);
    },
    { passive: false },
  );
  canvas.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    switch (e.key) {
      case ' ':
        setRunning(!running);
        break;
      case 'ArrowLeft':
      case 'ArrowRight':
      case 'ArrowUp':
      case 'ArrowDown':
        pan(
          e.key === 'ArrowLeft' ? 40 : e.key === 'ArrowRight' ? -40 : 0,
          e.key === 'ArrowUp' ? 40 : e.key === 'ArrowDown' ? -40 : 0,
        );
        break;
      case '+':
      case '=':
        zoom(1 / 1.25);
        break;
      case '-':
      case '_':
        zoom(1.25);
        break;
      case 'f':
      case 'F':
        setFollowing(true);
        break;
      // Home: back to following the worm, at the view the page opened with.
      case 'Home':
        camera = { centre: centroid, span: homeSpan };
        setFollowing(true);
        break;
      case 'Enter':
        if (!placing) return;
        drop([camera.centre[0], camera.centre[1]]);
        break;
      case 'Escape':
        if (!placing) return;
        setPlacing(false);
        live.textContent = 'Placing cancelled.';
        break;
      default:
        return;
    }
    e.preventDefault();
  });

  const resize = (width: number, height: number): void => {
    renderer.resize(width, height);
    dirty = true;
  };
  const observer = new ResizeObserver((entries) => {
    const box = entries[entries.length - 1].devicePixelContentBoxSize?.[0];
    if (box) resize(box.inlineSize, box.blockSize);
    else resize(canvas.clientWidth * window.devicePixelRatio, canvas.clientHeight * window.devicePixelRatio);
  });
  try {
    observer.observe(canvas, { box: 'device-pixel-content-box' });
  } catch {
    observer.observe(canvas);
  }
  resize(canvas.clientWidth * window.devicePixelRatio, canvas.clientHeight * window.devicePixelRatio);

  const frame = (): PlateFrame => {
    const [w, h] = renderer.size;
    return {
      centre: camera.centre,
      half: halfExtent(camera, w, h),
      pixel: metresPerPixel(camera, w, h),
      dish: DISH,
      lawns: placed(),
    };
  };

  // The rods' centres, read back a frame or two behind for the camera, the inset and touching the worm.
  const bytes = 4 * ROD_WORDS * rods;
  const reading = new Float64Array(2 * rods);
  const staging = Array.from({ length: STAGING }, () => ({
    buffer: device.createBuffer({ size: bytes, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ }),
    busy: false,
  }));
  const readBody = (): void => {
    const slot = staging.find((s) => !s.busy);
    if (!slot) return;
    slot.busy = true;
    const at = steps;
    const from = run;
    const encoder = device.createCommandEncoder();
    encoder.copyBufferToBuffer(gpu.brain.bodyBuffer, 0, slot.buffer, 0, bytes);
    device.queue.submit([encoder.finish()]);
    slot.buffer.mapAsync(GPUMapMode.READ).then(
      () => {
        // Stopped, the buffer is gone; from an earlier run, the reading is stale.
        if (stopped) return;
        let x = 0;
        let y = 0;
        if (from === run) {
          const words = new Float32Array(slot.buffer.getMappedRange());
          for (let i = 0; i < rods; i++) {
            reading[2 * i] = words[ROD_WORDS * i] + words[ROD_WORDS * i + 1];
            reading[2 * i + 1] = words[ROD_WORDS * i + 2] + words[ROD_WORDS * i + 3];
            x += reading[2 * i];
            y += reading[2 * i + 1];
          }
        }
        slot.buffer.unmap();
        slot.busy = false;
        if (from !== run || !Number.isFinite(x + y)) return;
        bodyAt.set(reading);
        bodyKnown = true;
        centroid = [x / rods, y / rods];
        const t = at * NEURAL_STEP;
        if (t - lastTrail >= TRAIL_EVERY) {
          lastTrail = t;
          points.push(centroid);
          if (points.length > TRAIL_MAX) points.splice(0, points.length - TRAIL_MAX);
          trailChanged = true;
        }
      },
      () => {
        slot.busy = false;
      },
    );
  };

  // The inset: the dish, the worm's path and where it is, and the field of view.
  const drawInset = (): void => {
    const s = (v: number): number => v / DISH;
    if (trailChanged) {
      trail.setAttribute('points', points.map(([x, y]) => `${s(x).toFixed(4)},${(-s(y)).toFixed(4)}`).join(' '));
      trailChanged = false;
    }
    dot.setAttribute('cx', s(centroid[0]).toFixed(4));
    dot.setAttribute('cy', (-s(centroid[1])).toFixed(4));
    const [w, h] = size();
    const [hw, hh] = halfExtent(camera, w, h);
    view.setAttribute('x', s(camera.centre[0] - hw).toFixed(4));
    view.setAttribute('y', (-s(camera.centre[1] + hh)).toFixed(4));
    view.setAttribute('width', s(2 * hw).toFixed(4));
    view.setAttribute('height', s(2 * hh).toFixed(4));
    const { pixels, label } = scaleBar(metresPerPixel(camera, w, h), 120);
    bar.style.width = `${pixels.toFixed(1)}px`;
    barLabel.textContent = label;
    timeValue.textContent = clock(steps * NEURAL_STEP);
    if (params.stats) {
      const r = rates.get();
      stats.textContent = `${r.fps.toFixed(0)} fps · ${r.speed.toFixed(2)}× real time · ${speed}× asked`;
    }
  };

  // The worm and its odour field advance together: each of the worm's dispatches senses the field as it stood
  // when the dispatch began, and the field then steps through the same time (PLAN §5.2).
  const advance = (count: number): void => {
    for (const n of dispatches(count)) {
      gpu.useField(stepped);
      gpu.run(n);
      stepped.step(n * NEURAL_STEP);
    }
  };

  // Before the first frame, run the worm to the time the URL asks for.
  const warm = Math.round(params.time / NEURAL_STEP);
  if (warm > 0) {
    advance(warm);
    steps = warm;
  }
  readBody();

  let first: (() => void) | null = null;
  const ready = new Promise<void>((resolve) => {
    first = resolve;
  });
  let last = performance.now();
  let lastInset = -Infinity;
  const tick = (now: number): void => {
    if (stopped) return;
    const wall = (now - last) / 1000;
    last = now;
    // Busy while two frames' work is still on the GPU. The rates count steps as they are submitted, which
    // this bounds to at most two frames ahead of the steps done.
    const n = pacer.advance(wall, speed, running, pending >= 2);
    if (n > 0) {
      advance(n);
      steps += n;
      dirty = true;
    }
    if (n > 0 || first) readBody();
    rates.record(now, n * NEURAL_STEP);
    if (following) {
      // The lag is in worm time, so a fast-forwarded worm doesn't leave the view.
      const k = 1 - Math.exp(-(Math.min(wall, 0.1) * Math.max(1, running ? speed : 1)) / FOLLOW);
      const next: [number, number] = [
        camera.centre[0] + (centroid[0] - camera.centre[0]) * k,
        camera.centre[1] + (centroid[1] - camera.centre[1]) * k,
      ];
      if (next[0] !== camera.centre[0] || next[1] !== camera.centre[1]) dirty = true;
      camera = { ...camera, centre: next };
    }
    const draw = dirty && !noRender;
    if (draw) renderer.render(frame(), stepped.current);
    // Every frame that gave the GPU work counts until that work is done, drawn or not.
    if (n > 0 || draw) {
      pending++;
      void device.queue.onSubmittedWorkDone().then(() => {
        pending--;
      });
    }
    dirty = false;
    if (now - lastInset > 250) {
      lastInset = now;
      drawInset();
    }
    if (first) {
      const done = first;
      first = null;
      void device.queue.onSubmittedWorkDone().then(done);
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  return {
    ready,
    snapshot: () => renderer.snapshot(frame(), stepped.current),
    rates: () => rates.get(),
    drain: async () => {
      const start = performance.now();
      const at = steps;
      await device.queue.onSubmittedWorkDone();
      return { milliseconds: performance.now() - start, steps: at };
    },
    stop: () => {
      stopped = true;
      observer.disconnect();
      renderer.destroy();
      for (const s of staging) s.buffer.destroy();
      gpu.destroy();
      stepped.destroy();
    },
  };
}
