// The 3D graph of all 302 neurons (spec §7), with the selected neuron's connections lit.
// - Mouse: drag to turn, scroll to zoom, shift- or right-drag to pan, click a neuron to select it, double-click
//   a neuron to fly to it or empty space to reset.
// - Touch: drag to turn, pinch to zoom, drag two fingers to pan, tap to select, double-tap to fly or reset.
// - Keyboard, with the canvas focused: arrows turn, shift and arrows pan, + and − zoom, [ and ] step through
//   the neurons from nose to tail, Home resets and Escape clears the selection.

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
import { CITATIONS, type CitationId } from '../science/citations.ts';
import { linkKind, linkStyle, Wiring } from './connections.ts';
import { inspect, musclesByNeuron } from './inspection.ts';
import { Inspector } from './inspector.ts';
import { applyTarget, readParams } from './params.ts';
import { pick, type Projected } from './picking.ts';

const CLASS_NAMES: Record<CellClass, string> = {
  sensory: 'Sensory',
  interneuron: 'Interneuron',
  motor: 'Motor',
  pharyngeal: 'Pharyngeal',
};
const LINK_NAMES: Record<LinkKind, string> = {
  excitatory: 'Excitatory',
  inhibitory: 'Inhibitory',
  unsigned: 'No sign known',
  gap: 'Gap junction',
};
const DIMMED = 0.28;
const HOME_YAW = (-50 * Math.PI) / 180;
const HOME_PITCH = (20 * Math.PI) / 180;
// The camera's home target along the body: a little ahead of the middle, towards the crowded head.
const HOME_X = -0.8;
const FRAME = 0.88; // the share of the half-frame the fitted graph may reach
const MIN_DISTANCE = 0.6;
const FOCUS_DISTANCE = 3.5; // how close a double-click on a neuron flies
const NEAR = 0.02; // the near plane, as a share of the camera's distance
const SLOP = { mouse: 4, touch: 10 }; // px a press may move and still be a click
const REACH = { mouse: 8, touch: 18 }; // px within which a small disc can still be picked

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

function link(text: string, href: string): HTMLAnchorElement {
  const a = el('a', undefined, text);
  a.href = href;
  a.rel = 'noopener';
  return a;
}

const cite = (id: CitationId): HTMLAnchorElement => link(CITATIONS[id].short, `https://doi.org/${CITATIONS[id].doi}`);
const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

// How the chemical signs were set, counted from the data so the note can't drift from it.
function signNote(data: WormlightData): string {
  const share = (source: string): number =>
    Math.round((100 * data.chemical.filter((c) => c.signSource === source).length) / data.chemical.length);
  return (
    `Signs are inferred, not measured: ${share('expression')}% from transmitter and receptor expression ` +
    `(Fenyves et al. 2020), ${share('rule')}% from the transmitter alone, and ${share('none')}% have no basis.`
  );
}

function legend(data: WormlightData): HTMLElement {
  const box = el('section', 'legend');
  box.setAttribute('aria-label', 'Legend');
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
  const about = el('details', 'legend-about');
  // Open where there is room for it beside the graph.
  about.open = window.matchMedia('(min-width: 72rem) and (min-height: 48rem)').matches;
  about.append(
    el('summary', undefined, 'About this view'),
    el(
      'p',
      'legend-note',
      'Somata from one reconstruction, unbent along the ventral cord, with the body axis stretched where neurons ' +
        `crowd and the cross-section enlarged. ${signNote(data)}`,
    ),
  );
  box.append(neurons, links, about);
  return box;
}

function credit(): HTMLElement {
  const p = el('p', 'credit');
  const nematode = link('Quantum Nematode', 'https://github.com/SyntheticBrains/nematode');
  const notice = link('notices', `${import.meta.env.BASE_URL}data/NOTICE.md`);
  p.append(
    'Connectome: ',
    cite('cook2019'),
    ', as released in ',
    cite('emmons2024'),
    ' (CC BY 4.0). Neurotransmitter identities: ',
    cite('wang2024'),
    '. Signs: ',
    cite('fenyves2020'),
    '. Exported via ',
    nematode,
    ' (',
    notice,
    ').',
  );
  return p;
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
  // Resolves once the first frame has been drawn, or, with ?norender=1, once the graph is ready to snapshot.
  ready: Promise<void>;
  stop(): void;
}

export async function startGraph(root: HTMLElement, device: GPUDevice, data: WormlightData): Promise<GraphHandle> {
  const params = readParams(location.search);
  const canvas = el('canvas');
  canvas.id = 'gpu';
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute(
    'aria-label',
    'A 3D graph of the 302 neurons of C. elegans, placed where they sit in the body. With it focused, ' +
      'the arrow keys turn it, plus and minus zoom, and the square brackets step through the neurons.',
  );
  // Build the renderer before the page changes, so a failure leaves the message page to explain it.
  const renderer = await GraphRenderer.create(device, canvas);

  // Selections are announced here; the inspector shows them.
  const selection = el('p', 'sr-only');
  selection.setAttribute('aria-live', 'polite');
  const find = el('input', 'find');
  find.type = 'search';
  find.placeholder = 'Find a neuron';
  find.autocomplete = 'off';
  find.spellcheck = false;
  find.setAttribute('aria-label', 'Find a neuron by name');
  find.setAttribute('list', 'neuron-names');
  const names = el('datalist');
  names.id = 'neuron-names';
  for (const neuron of data.neurons) names.append(new Option(neuron.name));
  const brand = el('header', 'brand');
  brand.append(el('h1', 'brand-title', 'Wormlight'), lede(), find, names);
  const label = el('div', 'hover-label');
  label.hidden = true;
  const inspector = new Inspector({
    select: (i) => select(i),
    point: (i) => hover(i),
    close: () => {
      select(null);
      canvas.focus();
    },
  });
  const hint = el('p', 'hint');
  hint.append(
    el('span', 'hint-pointer', 'Drag to turn · scroll to zoom · shift-drag to pan · click a neuron'),
    el('span', 'hint-touch', 'Drag to turn · pinch to zoom · two fingers to pan · tap a neuron'),
  );
  const footer = el('footer', 'footer');
  const aside = el('div', 'footer-aside');
  aside.append(hint, credit());
  footer.append(legend(data), aside);
  root.replaceChildren(canvas, brand, inspector.element, selection, label, footer);
  root.classList.add('graph');

  const wiring = new Wiring(data);
  const muscles = musclesByNeuron(data);
  const n = data.neurons.length;
  const positions = graphLayout(data.neurons);
  const maxDegree = Math.max(...wiring.degree);
  const radii = Float32Array.from(wiring.degree, (d) => 0.045 + 0.05 * Math.sqrt(d / maxDegree));
  // The neurons from nose to tail, for stepping through them from the keyboard.
  const alongBody = Array.from({ length: n }, (_, i) => i).sort((a, b) => positions[3 * a] - positions[3 * b]);

  let lo = [Infinity, Infinity, Infinity];
  let hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++) {
    lo = lo.map((v, k) => Math.min(v, positions[3 * i + k]));
    hi = hi.map((v, k) => Math.max(v, positions[3 * i + k]));
  }
  const centre: [number, number, number] = [HOME_X, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];

  // The graph is framed in the space the overlays leave: above the footer, and left of the inspector on a
  // wide screen or above it on a narrow one, where it is a sheet along the bottom. The projection is
  // shifted to centre that space, and the frame shrinks to fit it.
  const narrow = window.matchMedia('(max-width: 40rem)');
  const clampShare = (v: number): number => Math.max(0, Math.min(0.6, v));
  const insets = (): { right: number; bottom: number } => {
    const box = canvas.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return { right: 0, bottom: 0 };
    const above = (overlay: HTMLElement): number => {
      const r = overlay.getBoundingClientRect();
      return r.height === 0 ? 0 : (box.bottom - r.top) / box.height;
    };
    const panel = inspector.element.getBoundingClientRect();
    const open = !inspector.element.hidden && panel.width > 0;
    return {
      right: clampShare(open && !narrow.matches ? (box.right - panel.left) / box.width : 0),
      bottom: clampShare(Math.max(above(footer), open && narrow.matches ? above(inspector.element) : 0)),
    };
  };
  let shift = { right: 0, bottom: 0 };
  // The nearest distance from which every neuron falls inside that space, less a margin.
  const fit = (o: Omit<Orbit, 'distance'>, aspect: number): number => {
    const inside = (distance: number): boolean => {
      const vp = multiply(perspective(FIELD_OF_VIEW, aspect, 0.01, 1000), viewMatrix({ ...o, distance }));
      for (let i = 0; i < n; i++) {
        const p = project(vp, positions.subarray(3 * i, 3 * i + 3), 2, 2);
        if (!p || Math.abs(p.x - 1) > FRAME * (1 - shift.right) || Math.abs(p.y - 1) > FRAME * (1 - shift.bottom)) {
          return false;
        }
      }
      return true;
    };
    let near = 0.5;
    let far = 500;
    for (let k = 0; k < 30; k++) {
      const mid = (near + far) / 2;
      if (inside(mid)) far = mid;
      else near = mid;
    }
    return far;
  };
  const aspect = (): number => canvas.clientWidth / Math.max(canvas.clientHeight, 1);
  const homeBase = (): Omit<Orbit, 'distance'> => ({
    target: applyTarget(centre, params.target),
    yaw: params.yaw ?? HOME_YAW,
    pitch: params.pitch ?? HOME_PITCH,
  });
  let homeDistance = fit(homeBase(), aspect());
  const maxDistance = (): number => Math.max(3 * homeDistance, 10);
  const clampDistance = (d: number): number => Math.max(MIN_DISTANCE, Math.min(maxDistance(), d));
  const home = (): Orbit => ({ ...homeBase(), distance: clampDistance(params.distance ?? homeDistance) });
  let orbit = home();
  // Until the camera is moved, it keeps the whole graph in frame as the window changes shape.
  let moved = params.distance !== null;

  const found =
    params.neuron === null ? -1 : wiring.names.findIndex((name) => name.toUpperCase() === params.neuron?.toUpperCase());
  let selected: number | null = found >= 0 ? found : null;
  let hovered: number | null = null;
  let dirty = true;
  let stopped = false;

  // Device pixels per CSS pixel, as the drawing buffer actually has them.
  const pixelRatio = (): number => renderer.size[0] / Math.max(canvas.clientWidth, 1);
  const frameState = (): FrameState => {
    const [w, h] = renderer.size;
    const view = viewMatrix(orbit);
    const projection = perspective(FIELD_OF_VIEW, w / h, orbit.distance * NEAR, orbit.distance * 4 + 20);
    // Centre the image in the space the overlays leave: x_clip −= right · w_clip, y_clip += bottom · w_clip.
    for (let c = 0; c < 4; c++) {
      projection[4 * c] -= shift.right * projection[4 * c + 3];
      projection[4 * c + 1] += shift.bottom * projection[4 * c + 3];
    }
    return {
      view,
      projection,
      viewProjection: multiply(projection, view),
      pixelRatio: pixelRatio(),
      fog: [orbit.distance - 1.5, orbit.distance + 9],
    };
  };

  const describe = (): string => {
    if (selected === null) return params.neuron !== null && found < 0 ? `No neuron is named ${params.neuron}.` : '';
    const neuron = data.neurons[selected];
    const shown = wiring.of(selected);
    const count = (kind: string): number => shown.filter((c) => c.kind === kind).length;
    return (
      `${neuron.name} · ${CLASS_NAMES[neuron.class].toLowerCase()} · synapses onto ${plural(count('out'), 'neuron', 'neurons')}, ` +
      `from ${plural(count('in'), 'neuron', 'neurons')} · gap junctions with ${plural(count('gap'), 'neuron', 'neurons')}`
    );
  };

  const upload = (): void => {
    const shown = selected === null ? [] : wiring.of(selected);
    const partners = new Set(shown.map((c) => c.partner));
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
    dirty = true;
  };
  const select = (next: number | null): void => {
    if (next === selected) return;
    selected = next;
    upload();
    inspector.show(selected === null ? null : inspect(data, wiring, muscles, selected));
    root.classList.toggle('inspecting', selected !== null);
    // The live region changes only with the selection, not with hovering.
    selection.textContent = describe();
  };
  // Fly the camera to a neuron.
  const fly = (i: number): void => {
    const target: Orbit['target'] = [positions[3 * i], positions[3 * i + 1], positions[3 * i + 2]];
    move({ ...orbit, target, distance: Math.min(orbit.distance, FOCUS_DISTANCE) });
  };
  const findNeuron = (): void => {
    const query = find.value.trim();
    if (!query) return;
    const i = wiring.names.findIndex((name) => name.toUpperCase() === query.toUpperCase());
    if (i < 0) {
      find.setAttribute('aria-invalid', 'true');
      selection.textContent = `No neuron is named ${query}.`;
      return;
    }
    find.removeAttribute('aria-invalid');
    find.value = '';
    select(i);
    fly(i);
  };
  find.addEventListener('change', findNeuron);
  find.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') findNeuron();
    if (e.key === 'Escape') canvas.focus();
  });
  const hover = (next: number | null): void => {
    if (next === hovered) return;
    hovered = next;
    upload();
  };
  const move = (next: Orbit): void => {
    orbit = {
      ...next,
      pitch: Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, next.pitch)),
      distance: clampDistance(next.distance),
    };
    moved = true;
    dirty = true;
  };

  // The neuron under a point on the canvas (CSS pixels).
  const pickAt = (x: number, y: number, pointer: 'mouse' | 'touch'): number | null => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const { viewProjection } = frameState();
    const focal = 1 / Math.tan(FIELD_OF_VIEW / 2);
    const near = orbit.distance * NEAR;
    const shown: Projected[] = [];
    for (let i = 0; i < n; i++) {
      const p = project(viewProjection, positions.subarray(3 * i, 3 * i + 3), w, h);
      if (!p || p.w < near) continue;
      shown.push({ index: i, x: p.x, y: p.y, w: p.w, radius: (radii[i] * focal * h) / (2 * p.w) });
    }
    return pick(shown, x, y, REACH[pointer]);
  };
  const pointerKind = (e: PointerEvent): 'mouse' | 'touch' => (e.pointerType === 'mouse' ? 'mouse' : 'touch');
  const pan = (dx: number, dy: number): void => {
    const { right, up } = basis(orbit);
    const perPixel = (2 * orbit.distance * Math.tan(FIELD_OF_VIEW / 2)) / Math.max(canvas.clientHeight, 1);
    move({
      ...orbit,
      target: [0, 1, 2].map((k) => orbit.target[k] - (right[k] * dx - up[k] * dy) * perPixel) as Orbit['target'],
    });
  };

  // Pointers: one turns (or pans with shift or the right button); two pinch to zoom and pan together.
  const pointers = new Map<number, { x: number; y: number }>();
  let press: { x: number; y: number; dragged: boolean; pan: boolean; slop: number } | null = null;
  let pinch: { span: number; x: number; y: number } | null = null;
  let suppressClick = false;
  const twoFinger = (): { span: number; x: number; y: number } => {
    const [a, b] = [...pointers.values()];
    return { span: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    suppressClick = false;
    if (pointers.size === 1) {
      press = {
        x: e.offsetX,
        y: e.offsetY,
        dragged: false,
        pan: e.shiftKey || e.button === 2,
        slop: SLOP[pointerKind(e)],
      };
    } else {
      // A second finger: pinch and two-finger pan take over, and the gesture is no longer a tap.
      press = null;
      suppressClick = true;
      pinch = twoFinger();
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    const last = pointers.get(e.pointerId);
    if (!last) {
      if (e.pointerType === 'mouse' && e.buttons === 0) {
        const over = pickAt(e.offsetX, e.offsetY, 'mouse');
        canvas.style.cursor = over === null ? '' : 'pointer';
        hover(over);
        label.hidden = over === null;
        if (over !== null) {
          const neuron = data.neurons[over];
          label.textContent = `${neuron.name} · ${CLASS_NAMES[neuron.class].toLowerCase()}`;
          label.style.transform = `translate(${e.offsetX + 14}px, ${e.offsetY + 14}px)`;
        }
      }
      return;
    }
    const dx = e.offsetX - last.x;
    const dy = e.offsetY - last.y;
    last.x = e.offsetX;
    last.y = e.offsetY;
    if (pointers.size === 2 && pinch) {
      const now = twoFinger();
      if (pinch.span > 0 && now.span > 0) move({ ...orbit, distance: orbit.distance * (pinch.span / now.span) });
      pan(now.x - pinch.x, now.y - pinch.y);
      pinch = now;
      return;
    }
    if (!press) return;
    if (!press.dragged && Math.hypot(e.offsetX - press.x, e.offsetY - press.y) > press.slop) press.dragged = true;
    if (!press.dragged) return;
    suppressClick = true;
    label.hidden = true;
    canvas.style.cursor = 'grabbing';
    if (press.pan) pan(dx, dy);
    else move({ ...orbit, yaw: orbit.yaw - dx * 0.006, pitch: orbit.pitch + dy * 0.006 });
  });
  const release = (e: PointerEvent): void => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    // After a pinch, the finger left behind starts a fresh drag rather than jumping.
    if (pointers.size === 1) {
      const [rest] = [...pointers.values()];
      press = { x: rest.x, y: rest.y, dragged: true, pan: false, slop: SLOP.touch };
    } else press = null;
    canvas.style.cursor = '';
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('lostpointercapture', (e) => {
    if (pointers.has(e.pointerId)) release(e);
  });
  canvas.addEventListener('pointerleave', (e) => {
    if (e.pointerType !== 'mouse') return;
    hover(null);
    label.hidden = true;
  });
  // Selection on click, which fires for the primary button only; the second click of a double-click is left
  // to dblclick.
  canvas.addEventListener('click', (e) => {
    if (suppressClick || e.detail > 1) return;
    const hit = pickAt(e.offsetX, e.offsetY, e instanceof PointerEvent ? pointerKind(e) : 'mouse');
    select(hit === selected ? null : hit);
  });
  canvas.addEventListener('dblclick', (e) => {
    const hit = pickAt(e.offsetX, e.offsetY, 'mouse');
    if (hit === null) {
      orbit = home();
      moved = params.distance !== null;
      dirty = true;
      return;
    }
    select(hit);
    fly(hit);
  });
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      // A trackpad pinch arrives as a wheel with ctrlKey, its delta about 100 per doubling.
      const per = e.ctrlKey ? 0.01 : e.deltaMode === 1 ? 0.05 : e.deltaMode === 2 ? 1 : 0.0015;
      move({ ...orbit, distance: orbit.distance * Math.exp(e.deltaY * per) });
    },
    { passive: false },
  );
  canvas.addEventListener('keydown', (e) => {
    const turn = 0.08;
    const step = (by: number): void => {
      const at = selected === null ? (by > 0 ? -1 : n) : alongBody.indexOf(selected);
      select(alongBody[Math.max(0, Math.min(n - 1, at + by))]);
    };
    switch (e.key) {
      case 'ArrowLeft':
      case 'ArrowRight':
      case 'ArrowUp':
      case 'ArrowDown': {
        const dx = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
        const dy = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
        if (e.shiftKey) pan(dx * 30, dy * 30);
        else move({ ...orbit, yaw: orbit.yaw - dx * turn, pitch: orbit.pitch + dy * turn });
        break;
      }
      case '+':
      case '=':
        move({ ...orbit, distance: orbit.distance / 1.2 });
        break;
      case '-':
      case '_':
        move({ ...orbit, distance: orbit.distance * 1.2 });
        break;
      case ']':
        step(1);
        break;
      case '[':
        step(-1);
        break;
      case 'Home':
        orbit = home();
        moved = params.distance !== null;
        dirty = true;
        break;
      case 'Escape':
        if (selected === null) return;
        select(null);
        break;
      case '/':
        find.focus();
        break;
      default:
        return;
    }
    e.preventDefault();
  });

  // Draw only when something changed. With ?norender=1 nothing reaches the screen, and snapshots are the
  // only GPU work, as software stacks need (scripts/visual/capture.ts).
  const refit = (): void => {
    // On a wide screen the inspector ends above the footer.
    const footerTop = footer.getBoundingClientRect().top;
    const panelTop = inspector.element.getBoundingClientRect().top;
    inspector.element.style.maxHeight =
      narrow.matches || footerTop <= panelTop ? '' : `${Math.max(160, footerTop - panelTop - 16)}px`;
    shift = insets();
    homeDistance = fit(homeBase(), aspect());
    if (!moved) orbit = home();
    dirty = true;
  };
  const resize = (width: number, height: number): void => {
    renderer.resize(width, height);
    refit();
  };
  const observer = new ResizeObserver((entries) => {
    const entry = entries[entries.length - 1];
    const box = entry.devicePixelContentBoxSize?.[0];
    if (box) resize(box.inlineSize, box.blockSize);
    else resize(canvas.clientWidth * window.devicePixelRatio, canvas.clientHeight * window.devicePixelRatio);
  });
  try {
    observer.observe(canvas, { box: 'device-pixel-content-box' });
  } catch {
    observer.observe(canvas);
  }
  const footerObserver = new ResizeObserver(refit);
  footerObserver.observe(footer);
  footerObserver.observe(inspector.element);
  narrow.addEventListener('change', refit);
  resize(canvas.clientWidth * window.devicePixelRatio, canvas.clientHeight * window.devicePixelRatio);
  upload();
  if (selected !== null) {
    inspector.show(inspect(data, wiring, muscles, selected));
    root.classList.add('inspecting');
  }
  selection.textContent = describe();

  let first: (() => void) | null = null;
  const ready = new Promise<void>((resolve) => {
    first = resolve;
  });
  const tick = (): void => {
    if (stopped) return;
    if (dirty && !params.noRender) renderer.render(frameState());
    if (first) {
      const done = first;
      first = null;
      void device.queue.onSubmittedWorkDone().then(done);
    }
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
  return {
    ready,
    stop: () => {
      stopped = true;
      observer.disconnect();
      footerObserver.disconnect();
      narrow.removeEventListener('change', refit);
    },
  };
}
