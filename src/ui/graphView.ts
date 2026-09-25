// The 3D graph of all 302 neurons (spec §7), with the selected neuron's connections lit. Drag to turn it,
// scroll or pinch to zoom, shift-drag or right-drag to pan, click a neuron to select it.

import type { CellClass, WormlightData } from '../data/schema.ts';
import {
  basis,
  FIELD_OF_VIEW,
  multiply,
  perspective,
  PITCH_LIMIT,
  project,
  viewMatrix,
  type Orbit,
} from '../render/camera.ts';
import { GraphRenderer, LINK_FLOATS, NEURON_FLOATS, type FrameState } from '../render/graph.ts';
import { graphLayout } from '../render/layout.ts';
import { CLASS_COLOURS, LINK_COLOURS, rgb, type LinkKind } from '../render/palette.ts';
import { linkKind, linkStyle, Wiring } from './connections.ts';
import { applyTarget, readParams } from './params.ts';

const CLASS_NAMES: Record<CellClass, string> = {
  sensory: 'Sensory',
  interneuron: 'Interneuron',
  motor: 'Motor',
  pharyngeal: 'Pharyngeal',
};
const LINK_NAMES: Record<LinkKind, string> = {
  excitatory: 'Excitatory',
  inhibitory: 'Inhibitory',
  unsigned: 'No fast effect',
  gap: 'Gap junction',
};
const DIMMED = 0.28;
const HOME_YAW = (-50 * Math.PI) / 180;
const HOME_PITCH = (20 * Math.PI) / 180;
const FRAME = 0.88; // the share of the half-frame the fitted graph may reach
const DRAG_SLOP = 4; // px before a press becomes a drag

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

function legend(): HTMLElement {
  const box = el('footer', 'legend');
  const neurons = el('ul', 'legend-row');
  for (const c of Object.keys(CLASS_COLOURS) as CellClass[]) {
    const item = el('li', 'legend-item');
    const dot = el('span', 'swatch swatch-dot');
    dot.style.background = CLASS_COLOURS[c];
    item.append(dot, CLASS_NAMES[c]);
    neurons.append(item);
  }
  const links = el('ul', 'legend-row');
  for (const k of Object.keys(LINK_COLOURS) as LinkKind[]) {
    const item = el('li', 'legend-item');
    const line = el('span', `swatch swatch-line${k === 'gap' ? ' swatch-dashed' : ''}`);
    line.style.color = LINK_COLOURS[k];
    item.append(line, LINK_NAMES[k]);
    links.append(item);
  }
  const note = el(
    'p',
    'legend-note',
    'Somata from one reconstruction, the body axis stretched where neurons crowd and the cross-section enlarged. ' +
      'Connection signs are mostly predicted from gene expression, not measured.',
  );
  box.append(neurons, links, note);
  return box;
}

function lede(): HTMLElement {
  const p = el('p', 'brand-lede', 'The connectome of ');
  p.append(
    el('i', undefined, 'C. elegans'),
    ': 302 neurons where they sit in the body. Select one to see its connections.',
  );
  return p;
}

export interface GraphHandle {
  ready: Promise<void>;
}

export function startGraph(root: HTMLElement, device: GPUDevice, data: WormlightData): GraphHandle {
  const params = readParams(location.search);
  const canvas = el('canvas');
  canvas.id = 'gpu';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute(
    'aria-label',
    'A rotatable 3D graph of the 302 neurons of C. elegans, placed where they sit in the body, head to the left.',
  );
  const selection = el('p', 'selection');
  selection.setAttribute('aria-live', 'polite');
  const brand = el('header', 'brand');
  brand.append(el('h1', 'brand-title', 'Wormlight'), lede());
  const hint = el('p', 'hint', 'Drag to turn · scroll or pinch to zoom · shift-drag to pan · click a neuron');
  const credit = el('p', 'credit');
  const notice = el('a', undefined, 'Cook et al. 2019, as released in Emmons 2024 (CC BY 4.0)');
  notice.href = `${import.meta.env.BASE_URL}data/NOTICE.md`;
  credit.append('Connectome: ', notice);
  root.replaceChildren(canvas, brand, selection, legend(), hint, credit);
  root.classList.add('graph');

  const renderer = new GraphRenderer(device, canvas);
  const wiring = new Wiring(data);
  const n = data.neurons.length;
  const positions = graphLayout(data.neurons);
  const maxDegree = Math.max(...wiring.degree);
  const radii = Float32Array.from(wiring.degree, (d) => 0.045 + 0.05 * Math.sqrt(d / maxDegree));

  // The camera starts in front of the animal's left side and a little above it, the head nearest.
  let lo = [Infinity, Infinity, Infinity];
  let hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++) {
    lo = lo.map((v, k) => Math.min(v, positions[3 * i + k]));
    hi = hi.map((v, k) => Math.max(v, positions[3 * i + k]));
  }
  const centre: [number, number, number] = [-0.8, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
  // The nearest distance from which every neuron falls inside the frame, less a margin.
  const fit = (o: Omit<Orbit, 'distance'>, aspect: number): number => {
    const inside = (distance: number): boolean => {
      const vp = multiply(perspective(FIELD_OF_VIEW, aspect, 0.01, 1000), viewMatrix({ ...o, distance }));
      for (let i = 0; i < n; i++) {
        const p = project(vp, positions.subarray(3 * i, 3 * i + 3), 2, 2);
        if (!p || Math.abs(p.x - 1) > FRAME || Math.abs(p.y - 1) > FRAME) return false;
      }
      return true;
    };
    let near = 0.5;
    let far = 200;
    for (let k = 0; k < 30; k++) {
      const mid = (near + far) / 2;
      if (inside(mid)) far = mid;
      else near = mid;
    }
    return far;
  };
  const aspect = (): number => canvas.clientWidth / Math.max(canvas.clientHeight, 1);
  const home = (): Orbit => {
    const base = {
      target: applyTarget(centre, params.target),
      yaw: params.yaw ?? HOME_YAW,
      pitch: params.pitch ?? HOME_PITCH,
    };
    return { ...base, distance: params.distance ?? fit(base, aspect()) };
  };
  let orbit = home();
  let selected: number | null = params.neuron === null ? null : wiring.names.indexOf(params.neuron);
  if (selected === -1) selected = null;
  let hovered: number | null = null;
  let dirty = true;

  const pixelRatio = (): number => window.devicePixelRatio || 1;
  const frameState = (): FrameState => {
    const [w, h] = renderer.size;
    const view = viewMatrix(orbit);
    const projection = perspective(
      FIELD_OF_VIEW,
      w / h,
      Math.max(orbit.distance * 0.02, 0.01),
      orbit.distance * 4 + 20,
    );
    return {
      view,
      projection,
      viewProjection: multiply(projection, view),
      pixelRatio: pixelRatio(),
      fog: [orbit.distance - 1.5, orbit.distance + 9],
    };
  };

  const upload = (): void => {
    const partners = new Set(selected === null ? [] : wiring.of(selected).map((c) => c.partner));
    const neurons = new Float32Array(n * NEURON_FLOATS);
    for (let i = 0; i < n; i++) {
      const o = i * NEURON_FLOATS;
      const [r, g, b] = rgb(CLASS_COLOURS[data.neurons[i].class]);
      const lit = selected === null || i === selected || partners.has(i) ? 1 : DIMMED;
      neurons.set([positions[3 * i], positions[3 * i + 1], positions[3 * i + 2], radii[i]], o);
      neurons.set([r * lit, g * lit, b * lit, 1], o + 4);
      neurons.set([i === selected ? 1 : 0, i === hovered && i !== selected ? 1 : 0, 0, 0], o + 8);
    }
    renderer.setNeurons(neurons);
    const shown = selected === null ? [] : wiring.of(selected);
    const links = new Float32Array(shown.length * LINK_FLOATS);
    // Weakest first, so the strongest are drawn on top.
    [...shown].reverse().forEach((c, k) => {
      const o = k * LINK_FLOATS;
      const s = selected as number;
      const { width, alpha } = linkStyle(c.sections, wiring.largest);
      const [r, g, b] = rgb(LINK_COLOURS[linkKind(c)]);
      links.set([positions[3 * s], positions[3 * s + 1], positions[3 * s + 2], width], o);
      links.set(
        [
          positions[3 * c.partner],
          positions[3 * c.partner + 1],
          positions[3 * c.partner + 2],
          c.kind === 'gap' ? 6 : 0,
        ],
        o + 4,
      );
      links.set([r, g, b, alpha], o + 8);
    });
    renderer.setLinks(links);
    if (selected === null) selection.textContent = '';
    else {
      const neuron = data.neurons[selected];
      const count = (kind: string): number => shown.filter((c) => c.kind === kind).length;
      selection.textContent =
        `${neuron.name} · ${CLASS_NAMES[neuron.class].toLowerCase()} · ` +
        `${count('out')} synapses out, ${count('in')} in, ${count('gap')} gap junctions`;
    }
    dirty = true;
  };

  // The neuron under a point on the canvas (CSS pixels), preferring the nearest to the camera.
  const pick = (x: number, y: number): number | null => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const { viewProjection } = frameState();
    const focal = 1 / Math.tan(FIELD_OF_VIEW / 2);
    let best: number | null = null;
    let bestDepth = Infinity;
    for (let i = 0; i < n; i++) {
      const p = project(viewProjection, positions.subarray(3 * i, 3 * i + 3), w, h);
      if (!p) continue;
      const reach = Math.max((radii[i] * focal * h) / (2 * p.w), 6);
      if (Math.hypot(p.x - x, p.y - y) <= reach && p.w < bestDepth) {
        best = i;
        bestDepth = p.w;
      }
    }
    return best;
  };

  // Pointer handling: one pointer turns (or pans with shift or the right button), two pinch to zoom.
  const pointers = new Map<number, { x: number; y: number }>();
  let press: { x: number; y: number; dragged: boolean; pan: boolean } | null = null;
  let pinch = 0;
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    if (pointers.size === 1) press = { x: e.offsetX, y: e.offsetY, dragged: false, pan: e.shiftKey || e.button === 2 };
    else {
      press = null;
      const [a, b] = [...pointers.values()];
      pinch = Math.hypot(a.x - b.x, a.y - b.y);
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    const last = pointers.get(e.pointerId);
    if (!last) {
      if (e.pointerType === 'mouse') {
        const over = pick(e.offsetX, e.offsetY);
        canvas.style.cursor = over === null ? 'grab' : 'pointer';
        if (over !== hovered) {
          hovered = over;
          upload();
        }
      }
      return;
    }
    const dx = e.offsetX - last.x;
    const dy = e.offsetY - last.y;
    last.x = e.offsetX;
    last.y = e.offsetY;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const span = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch > 0 && span > 0) orbit = { ...orbit, distance: clampDistance(orbit.distance * (pinch / span)) };
      pinch = span;
      dirty = true;
      return;
    }
    if (!press) return;
    if (!press.dragged && Math.hypot(e.offsetX - press.x, e.offsetY - press.y) > DRAG_SLOP) press.dragged = true;
    if (!press.dragged) return;
    canvas.style.cursor = 'grabbing';
    if (press.pan) {
      const { right, up } = basis(orbit);
      const perPixel = (2 * orbit.distance * Math.tan(FIELD_OF_VIEW / 2)) / canvas.clientHeight;
      orbit = {
        ...orbit,
        target: [0, 1, 2].map((k) => orbit.target[k] - (right[k] * dx - up[k] * dy) * perPixel) as Orbit['target'],
      };
    } else {
      const pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, orbit.pitch + dy * 0.006));
      orbit = { ...orbit, yaw: orbit.yaw - dx * 0.006, pitch };
    }
    dirty = true;
  });
  const release = (e: PointerEvent): void => {
    pointers.delete(e.pointerId);
    if (press && !press.dragged && e.type === 'pointerup') {
      const hit = pick(e.offsetX, e.offsetY);
      selected = hit === selected ? null : hit;
      upload();
    }
    press = null;
    canvas.style.cursor = '';
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  const maxDistance = 3 * fit({ target: centre, yaw: HOME_YAW, pitch: HOME_PITCH }, 1);
  const clampDistance = (d: number): number => Math.max(0.6, Math.min(maxDistance, d));
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const scale = e.deltaMode === 1 ? 0.05 : 0.0015;
      orbit = { ...orbit, distance: clampDistance(orbit.distance * Math.exp(e.deltaY * scale)) };
      dirty = true;
    },
    { passive: false },
  );
  canvas.addEventListener('dblclick', () => {
    orbit = home();
    dirty = true;
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && selected !== null) {
      selected = null;
      upload();
    }
  });

  // Draw only when something changed. With ?norender=1 nothing reaches the screen, and snapshots are the
  // only GPU work, as software stacks need (scripts/visual/capture.ts).
  const resize = (): void => {
    const ratio = pixelRatio();
    renderer.resize(canvas.clientWidth * ratio, canvas.clientHeight * ratio);
    dirty = true;
  };
  new ResizeObserver(resize).observe(canvas);
  resize();
  if (params.distance === null) orbit = { ...orbit, distance: fit(orbit, aspect()) };
  upload();
  const tick = (): void => {
    if (dirty && !params.noRender) renderer.render(frameState());
    dirty = false;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  const hooks = window as unknown as { __snap?: () => Promise<string> };
  hooks.__snap = async () => {
    const image = await renderer.snapshot(frameState());
    const out = new OffscreenCanvas(image.width, image.height);
    const context = out.getContext('2d');
    if (!context) throw new Error('no 2D context for the snapshot');
    context.putImageData(image, 0, 0);
    const blob = await out.convertToBlob({ type: 'image/png' });
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('the snapshot could not be encoded'));
      reader.readAsDataURL(blob);
    });
  };
  return { ready: device.queue.onSubmittedWorkDone() };
}
