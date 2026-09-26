// The plate view (spec §5, §6): the worm on a 10 cm agar dish, its whole loop, brain and body, stepped on the
// GPU and drawn from the GPU's own body buffer. The camera follows the worm at body scale, with the whole
// dish in an inset. The worm starts straight at the dish's centre, heading where its seed says.
// - Mouse: drag to pan, scroll to zoom, double-click to follow the worm again.
// - Touch: drag to pan, pinch to zoom, double-tap to follow.
// - Keyboard, with the plate focused: space pauses and resumes, arrows pan, + and − zoom, F follows the worm,
//   Home resets the view. Keys held with Ctrl, Cmd or Alt are left to the browser.

import type { WormlightData } from '../data/schema.ts';
import { ROD_CONSTANTS, ROD_WORDS } from '../gpu/brainShader.ts';
import { GpuWorld } from '../gpu/world.ts';
import { PlateRenderer, type PlateFrame, type PlateScene } from '../render/plate.ts';
import { halfExtent, metresPerPixel, scaleBar, zoomAbout, type PlateCamera } from '../render/plateCamera.ts';
import { PARAMS } from '../science/params.ts';
import { LAWN_RADIUS, SPOT, steadyField } from '../sim/env/dish.ts';
import type { OdourField } from '../sim/env/odour.ts';
import { NEURAL_STEP } from '../sim/numerics.ts';
import { Pacer, Rates } from './pacing.ts';
import type { PlateParams } from './params.ts';
import { plateScene } from './scene.ts';
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
    'The worm on its agar dish, seen from above. With it focused, space pauses and resumes, the arrow keys ' +
      'pan, plus and minus zoom, F or a double-click follows the worm, and Home resets the view.',
  );

  let seed = params.seed ?? randomSeed();
  // The GPU compiles the world's pipeline while the CPU solves the lawn's steady odour field: the page yields
  // first, so the browser sends the GPU its work before the solve holds the thread. Its world smells nothing
  // until the field is ready.
  const creating = GpuWorld.create(device, appWorld(data, seed));
  await new Promise((resolve) => setTimeout(resolve, 0));
  let field: OdourField;
  let scene: PlateScene;
  try {
    field = steadyField('lawn');
    scene = plateScene(field);
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
  // The worm smells the lawn's odour, adapted to it where it starts.
  let world = appWorld(data, seed, field);
  let renderer: PlateRenderer;
  try {
    gpu.setOdour(field);
    gpu.restore(world.snapshot());
    renderer = await PlateRenderer.create(device, canvas, gpu.brain.bodyBuffer, radii, LENGTH, scene);
  } catch (e) {
    gpu.destroy();
    throw e;
  }

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
  controls.setAttribute('aria-label', 'Time');
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
  const time = el('span', 'plate-time');
  const timeValue = el('span');
  time.append(el('span', 'sr-only', 'Worm time '), timeValue);
  const seedText = el('span', 'plate-seed');
  controls.append(play, speeds, restart, fresh, time, seedText);

  const follow = button('plate-follow', 'Follow the worm');
  follow.hidden = true;
  const map = el('figure', 'plate-map');
  const inset = svg('svg', { viewBox: '-1.08 -1.08 2.16 2.16', 'aria-hidden': 'true' });
  const trail = svg('polyline', { class: 'plate-trail', points: '' });
  const view = svg('rect', { class: 'plate-view' });
  const dot = svg('circle', { class: 'plate-dot', r: 0.035 });
  const lawn = svg('circle', {
    class: 'plate-lawn',
    cx: (SPOT[0] / DISH).toFixed(4),
    cy: (-SPOT[1] / DISH).toFixed(4),
    r: (LAWN_RADIUS / DISH).toFixed(4),
  });
  inset.append(svg('circle', { class: 'plate-dish', r: 1 }), lawn, trail, view, dot);
  const scale = el('div', 'plate-scale');
  const bar = el('span', 'plate-bar');
  const barLabel = el('span', 'plate-bar-label');
  scale.append(bar, barLabel);
  const caption = el('figcaption', 'sr-only', 'The whole dish: the worm near its centre, the food lawn near its edge.');
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
    world = appWorld(data, seed, field);
    gpu.restore(world.snapshot());
    gpu.brain.seed = world.brain.seed;
    gpu.brain.noise = world.brain.noise;
    steps = 0;
    run++;
    points.length = 0;
    lastTrail = -Infinity;
    trailChanged = true;
    centroid = [0, 0];
    if (following) camera = { ...camera, centre: [0, 0] };
    pacer.reset();
    showSeed();
    live.textContent = `Restarted with seed ${seed}.`;
    dirty = true;
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

  // Pointers: one pans once it has moved past the slop, so a click or a tap only focuses; two pinch to zoom.
  const pointers = new Map<number, { x: number; y: number; startX: number; startY: number; slop: number }>();
  let dragging = false;
  let pinch: { span: number } | null = null;
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    const slop = e.pointerType === 'mouse' ? SLOP.mouse : SLOP.touch;
    pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY, startX: e.offsetX, startY: e.offsetY, slop });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { span: Math.hypot(a.x - b.x, a.y - b.y) };
    }
  });
  const release = (e: PointerEvent): void => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 0) dragging = false;
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
    // Past the slop, the pan catches up with the pointer from where it was pressed.
    const [fx, fy] = dragging ? [dx, dy] : [e.offsetX - last.startX, e.offsetY - last.startY];
    dragging = true;
    canvas.style.cursor = 'grabbing';
    pan(fx, fy);
  });
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('lostpointercapture', (e) => {
    if (pointers.has(e.pointerId)) release(e);
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
    };
  };

  // The rods' centres, read back a frame or two behind for the camera and the inset.
  const bytes = 4 * ROD_WORDS * rods;
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
            x += words[ROD_WORDS * i] + words[ROD_WORDS * i + 1];
            y += words[ROD_WORDS * i + 2] + words[ROD_WORDS * i + 3];
          }
        }
        slot.buffer.unmap();
        slot.busy = false;
        if (from !== run || !Number.isFinite(x + y)) return;
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

  // Before the first frame, run the worm to the time the URL asks for.
  const warm = Math.round(params.time / NEURAL_STEP);
  if (warm > 0) {
    gpu.run(warm);
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
      gpu.run(n);
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
    if (draw) renderer.render(frame());
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
    snapshot: () => renderer.snapshot(frame()),
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
    },
  };
}
