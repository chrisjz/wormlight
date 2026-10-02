// The 3D graph of all 302 neurons (spec §7), with the selected neuron's connections lit. While the worm runs its
// neurons glow with their simulated activity (PLAN §1), or show their classes, and with none selected the synapses of
// those most active above their rest are faintly lit. It shows the brain the experiment runs, the real wiring or a
// rewiring of it, and draws lesioned neurons hollow, their links faint; the inspector ablates and restores the
// selected neuron (spec §6) and reads its activity.
// - Mouse: drag to turn, scroll to zoom, shift- or right-drag to pan, click a neuron to select it, double-click
//   a neuron to fly to it or empty space to reset.
// - Touch: drag to turn, pinch to zoom, drag two fingers to pan, tap to select, double-tap to fly or reset.
// - Keyboard, with the canvas focused: arrows turn, shift and arrows pan, + and − zoom, [ and ] step through
//   the neurons from nose to tail, Home resets and Escape clears the selection. Keys held with Ctrl, Cmd or
//   Alt are left to the browser.

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
import {
  activeStrength,
  CLASS_COLOURS,
  GLOW_COLOUR,
  glowBrightness,
  glowHalo,
  LINK_COLOURS,
  NEUTRAL,
  rgb,
  type LinkKind,
} from '../render/palette.ts';
import { CITATIONS, type CitationId } from '../science/citations.ts';
import type { About } from './about.ts';
import type { LinkNote } from './linkNote.ts';
import type { Activity } from './activity.ts';
import { linkKind, linkStyle, Wiring, type Connection } from './connections.ts';
import { brainName, describeChange, lesionSummary, type ExperimentStore } from './experiment.ts';
import { CLASS_NAMES, inspect, musclesByNeuron } from './inspection.ts';
import { Inspector } from './inspector.ts';
import { applyTarget, readParams } from './params.ts';
import { pick, type Projected } from './picking.ts';

const LINK_NAMES: Record<LinkKind, string> = {
  excitatory: 'Excitatory',
  inhibitory: 'Inhibitory',
  unsigned: 'No sign known',
  gap: 'Gap junction',
};
const DIMMED = 0.28;
// How much of its opacity a link a lesion cuts keeps.
const CUT = 0.3;
// How opaque an active synapse's link is at the most, drawn while the neurons glow and none is selected.
const ACTIVE_LINK = 0.3;
// While the neurons glow, how strongly each is rimmed in the palette's neutral grey.
const RIM = 0.45;
const HOME_YAW = (-50 * Math.PI) / 180;
const HOME_PITCH = (20 * Math.PI) / 180;
// The camera's home target along the body: a little ahead of the middle, towards the crowded head.
const HOME_X = -0.8;
const FRAME = 0.88; // the share of the half-frame the fitted graph may reach
const MIN_DISTANCE = 0.6;
// How close Find, a double-click or a pick in the inspector flies to a neuron: a share of the distance that frames
// the whole graph beside the overlays, near enough to single it out and far enough to keep its neighbours in view.
const FOCUS_SHARE = 1 / 3;
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

// The legend, with a key to lesioned neurons that the caller shows while there are any, and the control that
// colours the neurons by their glow or by their class, whose keys it swaps between.
function legend(data: WormlightData, pane: HTMLElement, lesionKey: HTMLElement, colouring: HTMLElement): HTMLElement {
  const box = el('section', 'legend');
  box.setAttribute('aria-label', 'Legend');
  // On a short pane the key folds away behind a button.
  const toggle = el('button', 'legend-toggle', 'Key');
  toggle.type = 'button';
  toggle.setAttribute('aria-expanded', 'false');
  const body = el('div', 'legend-body');
  body.id = 'legend-body';
  toggle.setAttribute('aria-controls', body.id);
  toggle.addEventListener('click', () => {
    const open = !box.classList.contains('legend-open');
    box.classList.toggle('legend-open', open);
    toggle.setAttribute('aria-expanded', String(open));
  });
  const neurons = el('ul', 'legend-row');
  const activityItem = el('li', 'legend-item legend-activity');
  const ramp = el('span', 'swatch swatch-ramp');
  // The glow's scale as the neurons show it, brightness rising as the square of the glow, rest at its middle.
  const [gr, gg, gb] = rgb(GLOW_COLOUR).map((c) => Math.round(255 * c));
  const stops = [0, 0.25, 0.5, 0.75, 1].map(
    (g) => `rgb(${gr} ${gg} ${gb} / ${glowBrightness(g).toFixed(3)}) ${100 * g}%`,
  );
  ramp.style.background = `linear-gradient(90deg, ${stops.join(', ')})`;
  activityItem.append(ramp, 'Simulated activity: quiet, rest, active');
  neurons.append(activityItem);
  for (const c of Object.keys(CLASS_COLOURS) as CellClass[]) {
    const item = el('li', 'legend-item legend-class');
    const dot = el('span', 'swatch swatch-dot');
    dot.style.background = CLASS_COLOURS[c];
    item.append(dot, CLASS_NAMES[c]);
    neurons.append(item);
  }
  lesionKey.append(el('span', 'swatch swatch-dot swatch-hollow'), 'Lesioned');
  neurons.append(lesionKey);
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
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const room = pane.getBoundingClientRect();
  about.open = room.width >= 72 * rem && room.height >= 48 * rem;
  about.append(
    el('summary', undefined, 'About this view'),
    el(
      'p',
      'legend-note',
      'Somata from one reconstruction, unbent along the ventral cord, with the body axis stretched where neurons ' +
        `crowd and the cross-section enlarged. ${signNote(data)} Coloured by activity, each neuron glows with its ` +
        "simulated activity, the model's activation filtered as the GCaMP6s indicator would smooth it (Chen et al. " +
        '2013), on one fixed scale: a simulation, not imaging data. With no neuron selected, the chemical synapses of ' +
        'those whose glow rises well above their own rest are drawn faintly.',
    ),
  );
  body.append(colouring, neurons, links, about);
  box.append(toggle, body);
  return box;
}

// The credits. On a small pane they keep to the connectome's source and licence, with a button that shows the
// rest in place; CC BY 4.0 lets attribution be given in any reasonable manner for the medium.
function credit(): HTMLElement {
  const p = el('p', 'credit');
  const nematode = link('Quantum Nematode', 'https://github.com/SyntheticBrains/nematode');
  const notice = link('notices', `${import.meta.env.BASE_URL}data/NOTICE.md`);
  const full = el('span', 'credit-full');
  full.id = 'credit-full';
  full.append(
    'Connectome: ',
    cite('cook2019'),
    ', as released in ',
    cite('emmons2024'),
    ' (CC BY 4.0). Neurotransmitter identities: ',
    cite('wang2024'),
    '. Exported via ',
    nematode,
    ' (',
    notice,
    '). Signs: ',
    cite('fenyves2020'),
    '. ',
  );
  const short = el('span', 'credit-short');
  short.append('Connectome: ', cite('cook2019'), ' (CC BY 4.0). ');
  const toggle = el('button', 'credit-toggle', 'All credits');
  toggle.type = 'button';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', full.id);
  toggle.addEventListener('click', () => {
    const open = !p.classList.contains('credit-open');
    p.classList.toggle('credit-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.textContent = open ? 'Fewer' : 'All credits';
  });
  p.append(full, short, toggle);
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
  snapshot(): Promise<ImageData>;
  stop(): void;
}

// The graph in its pane. With `title`, it is the page's only view and carries the page's title.
export async function startGraph(
  pane: HTMLElement,
  device: GPUDevice,
  data: WormlightData,
  title: boolean,
  experiment: ExperimentStore,
  activity: Activity,
  about: About | null = null,
  note: LinkNote | null = null,
): Promise<GraphHandle> {
  const params = readParams(location.search);
  const canvas = el('canvas');
  canvas.id = 'gpu';
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute(
    'aria-label',
    'A 3D graph of the 302 neurons of C. elegans, placed where they sit in the body, coloured by their simulated ' +
      'activity while the worm runs, or by their class. With it focused, ' +
      'the arrow keys turn it, plus and minus zoom, and the square brackets step through the neurons; ' +
      'slash finds a neuron by name.',
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
  find.setAttribute('aria-keyshortcuts', '/');
  find.setAttribute('aria-describedby', 'find-error');
  find.setAttribute('list', 'neuron-names');
  const findError = el('p', 'find-error');
  findError.id = 'find-error';
  findError.hidden = true;
  const names = el('datalist');
  names.id = 'neuron-names';
  for (const neuron of data.neurons) names.append(new Option(neuron.name));
  // Which brain the graph shows, while it isn't the real wiring; and, with the graph alone, which neurons are
  // lesioned, with a way to restore them all (beside the plate, the plate's controls list them).
  const brainNote = el('p', 'brand-brain');
  const lesionNote = el('p', 'brand-lesions');
  const lesionText = el('span');
  const restoreLesions = el('button', undefined, 'Restore all');
  restoreLesions.type = 'button';
  restoreLesions.setAttribute('aria-label', 'Restore all lesioned neurons');
  lesionNote.append(lesionText, restoreLesions);
  const brand = el('header', 'brand');
  // Alone on the page, the graph carries the way to About the science and a link's notes; beside the plate, the plate
  // does.
  const aboutLink = title ? (about?.button() ?? null) : null;
  brand.append(
    title ? el('h1', 'brand-title', 'Wormlight') : el('h2', 'sr-only', 'The connectome'),
    lede(),
    ...(aboutLink ? [aboutLink] : []),
    brainNote,
    lesionNote,
    find,
    findError,
    names,
  );
  if (title) note?.mount(brand, aboutLink, brainNote);
  const label = el('div', 'hover-label');
  label.hidden = true;
  label.setAttribute('aria-hidden', 'true');
  const inspector = new Inspector({
    select: (i) => {
      select(i);
      if (!inView(i)) fly(i);
    },
    point: (i) => hover(i),
    close: () => {
      select(null);
      canvas.focus();
    },
    lesion: (i, on) => {
      const name = wiring.names[i];
      if (on) experiment.lesion(name);
      else experiment.restore(name);
      announce(on ? `${name} ablated: every connection it has is cut.` : `${name} restored: its connections are back.`);
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
  const lesionKey = el('li', 'legend-item');
  // Colour by: the glow, while a worm runs, or the neurons' classes.
  const colouring = el('fieldset', 'legend-colouring');
  colouring.append(el('legend', 'legend-choice-name', 'Colour by'));
  const colourChoice = (value: 'activity' | 'class', text: string): HTMLInputElement => {
    const label = el('label', 'legend-choice');
    const input = el('input');
    input.type = 'radio';
    input.name = 'colouring';
    input.value = value;
    label.append(input, text);
    colouring.append(label);
    return input;
  };
  const byActivity = colourChoice('activity', 'Activity');
  const byClass = colourChoice('class', 'Class');
  const legendBox = legend(data, pane, lesionKey, colouring);
  footer.append(legendBox, aside);
  pane.replaceChildren(canvas, brand, inspector.element, selection, label, footer);

  // The brain shown and its lesions, as the experiment has them. A neuron's size follows its total EM sections in
  // the brain shown.
  let brain = experiment.get().brain;
  let lesioned = new Set(experiment.get().lesions);
  lesionKey.hidden = lesioned.size === 0;
  // How the neurons are coloured: by their glow while a worm runs, or by their class, which a URL may start them on.
  // The glow shows from the worm's first reading on.
  let colouredBy = params.colour;
  let live = activity.published;
  const glowing = (): boolean => colouredBy === 'activity' && live;
  const keyToggle = legendBox.querySelector('.legend-toggle');
  const showColouring = (): void => {
    byActivity.checked = colouredBy === 'activity';
    byClass.checked = colouredBy === 'class';
    legendBox.classList.toggle('legend-glowing', glowing());
    // Folded away on a short pane, the key still says what the colours are.
    if (keyToggle) keyToggle.textContent = glowing() ? 'Key: simulated activity' : 'Key';
  };
  showColouring();
  // The selected neuron's activity for the inspector: the glow's value, or none while no worm runs.
  const activityOf = (i: number | null): number | 'lesioned' | null =>
    i === null || !live ? null : lesioned.has(wiring.names[i]) ? 'lesioned' : activity.glow.value[i];
  let wiring = new Wiring(experiment.brains.data(brain));
  const sizes = (): Float32Array => {
    const maxDegree = Math.max(...wiring.degree);
    return Float32Array.from(wiring.degree, (d) => 0.045 + 0.05 * Math.sqrt(d / maxDegree));
  };
  let radii = sizes();
  const showBrain = (): void => {
    brainNote.hidden = brain === 0;
    brainNote.replaceChildren(
      el(
        'span',
        'form-long',
        `Showing the contrast brain, ${brainName(brain)}: its chemical synapses rewired at random, every neuron ` +
          'keeping how many it sends and receives.',
      ),
      el('span', 'form-short', `Showing the contrast brain, ${brainName(brain)}.`),
    );
  };
  showBrain();
  const showLesions = (): void => {
    lesionNote.hidden = !title || lesioned.size === 0;
    lesionText.textContent = `${lesionSummary([...lesioned])} `;
  };
  showLesions();
  const muscles = musclesByNeuron(data);
  const n = data.neurons.length;
  const positions = graphLayout(data.neurons);
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
  // Below this pane size the inspector is a sheet along the bottom (style.css's container query).
  const narrow = {
    get matches(): boolean {
      // As the container query measures it: the pane's content box, without its border, and a max-width that
      // includes the limit itself.
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const box = pane.getBoundingClientRect();
      const style = getComputedStyle(pane);
      const width = box.width - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth);
      const height = box.height - parseFloat(style.borderTopWidth) - parseFloat(style.borderBottomWidth);
      return width <= 56 * rem || height <= 30 * rem;
    },
  };
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
  // The share of the canvas the overlays take, as drawn and as it is heading when they change; the framing
  // eases between the two so the graph never jumps.
  let shift = { right: 0, bottom: 0 };
  let shiftGoal = { right: 0, bottom: 0 };
  // The nearest distance from which every neuron falls inside that space, less a margin.
  const fit = (o: Omit<Orbit, 'distance'>, aspect: number, share = shiftGoal): number => {
    const inside = (distance: number): boolean => {
      const vp = multiply(perspective(FIELD_OF_VIEW, aspect, 0.01, 1000), viewMatrix({ ...o, distance }));
      for (let i = 0; i < n; i++) {
        const p = project(vp, positions.subarray(3 * i, 3 * i + 3), 2, 2);
        if (!p || Math.abs(p.x - 1) > FRAME * (1 - share.right) || Math.abs(p.y - 1) > FRAME * (1 - share.bottom)) {
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
      `${neuron.name}${lesioned.has(neuron.name) ? ' (lesioned)' : ''} · ${CLASS_NAMES[neuron.class].toLowerCase()} · ` +
      `synapses onto ${plural(count('out'), 'neuron', 'neurons')}, ` +
      `from ${plural(count('in'), 'neuron', 'neurons')} · gap junctions with ${plural(count('gap'), 'neuron', 'neurons')}`
    );
  };

  const glowRgb = rgb(GLOW_COLOUR);
  const lesionRgb = rgb(NEUTRAL);
  const upload = (): void => {
    const shown = selected === null ? [] : wiring.of(selected);
    const partners = new Set(shown.map((c) => c.partner));
    const glow = glowing() ? activity.glow.value : null;
    const neurons = new Float32Array(n * NEURON_FLOATS);
    for (let i = 0; i < n; i++) {
      const o = i * NEURON_FLOATS;
      const cut = lesioned.has(wiring.names[i]);
      // While glowing, a lesioned neuron has no activity worth showing: its hollow outline is drawn in the neutral
      // grey, with no halo. Every other neuron gets a faint neutral rim, which keeps it findable at any glow.
      const g = glow && !cut ? glow[i] : 0;
      const [r, gr, b] = !glow
        ? rgb(CLASS_COLOURS[data.neurons[i].class])
        : cut
          ? lesionRgb
          : glowRgb.map((c) => c * glowBrightness(g));
      const lit = selected === null || i === selected || partners.has(i) ? 1 : DIMMED;
      neurons.set([positions[3 * i], positions[3 * i + 1], positions[3 * i + 2], radii[i]], o);
      neurons.set([r * lit, gr * lit, b * lit, 1], o + 4);
      neurons.set(
        [i === selected ? 1 : 0, i === hovered && i !== selected ? 1 : 0, cut ? 1 : 0, glow ? glowHalo(g) * lit : 0],
        o + 8,
      );
      neurons.set([glow ? RIM * lit : 0, 0, 0, 0], o + 12);
    }
    renderer.setNeurons(neurons);
    // The selected neuron's connections; or, while the neurons glow and none is selected, the chemical synapses of
    // those whose glow has risen more than ACTIVE_RISE above their own rest, faintly, fainter the nearer they are to
    // it.
    const drawn: { from: number; c: Connection; alpha: number; width: number }[] = [];
    if (selected !== null) {
      const s = selected;
      // Weakest first, so the strongest are drawn on top.
      for (const c of [...shown].reverse()) {
        const { width, alpha: full } = linkStyle(c.sections, wiring.largest);
        const alpha = lesioned.has(wiring.names[s]) || lesioned.has(wiring.names[c.partner]) ? full * CUT : full;
        drawn.push({ from: s, c, alpha, width });
      }
    } else if (glow) {
      for (let i = 0; i < n; i++) {
        const strength = activeStrength(glow[i], activity.rest[i]);
        if (strength === null || lesioned.has(wiring.names[i])) continue;
        for (const c of wiring.of(i)) {
          if (c.kind !== 'out' || lesioned.has(wiring.names[c.partner])) continue;
          drawn.push({ from: i, c, alpha: ACTIVE_LINK * strength, width: 1 });
        }
      }
    }
    const links = new Float32Array(drawn.length * LINK_FLOATS);
    drawn.forEach(({ from, c, alpha, width }, k) => {
      const o = k * LINK_FLOATS;
      const [r, g, b] = rgb(LINK_COLOURS[linkKind(c)]);
      links.set([positions[3 * from], positions[3 * from + 1], positions[3 * from + 2], width], o);
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
    inspector.setActivity(activityOf(selected));
    inspector.show(selected === null ? null : inspect(data, wiring, muscles, selected, lesioned));
    pane.classList.toggle('inspecting', selected !== null);
    // The live region changes only with the selection, not with hovering.
    selection.textContent = describe();
  };
  // Fly the camera to a neuron.
  const fly = (i: number): void => {
    const target: Orbit['target'] = [positions[3 * i], positions[3 * i + 1], positions[3 * i + 2]];
    // From the default camera, whatever view a link set, and with the overlays as they stand now the inspector is
    // open, so a first find flies about as far as a later one (the sheet's height depends a little on the neuron).
    const distance = FOCUS_SHARE * fit({ target: centre, yaw: HOME_YAW, pitch: HOME_PITCH }, aspect(), insets());
    move({ ...orbit, target, distance: Math.min(orbit.distance, distance) });
  };
  // Announce in the live region, clearing it first so a repeated message is announced again.
  let announcing = 0;
  const announce = (text: string): void => {
    selection.textContent = '';
    cancelAnimationFrame(announcing);
    announcing = requestAnimationFrame(() => {
      selection.textContent = text;
    });
  };
  const clearFindError = (): void => {
    find.removeAttribute('aria-invalid');
    findError.hidden = true;
    findError.textContent = '';
  };
  const findNeuron = (): void => {
    const query = find.value.trim();
    if (!query) return;
    const i = wiring.names.findIndex((name) => name.toUpperCase() === query.toUpperCase());
    if (i < 0) {
      find.setAttribute('aria-invalid', 'true');
      findError.textContent = `No neuron is named ${query}.`;
      findError.hidden = false;
      announce(findError.textContent);
      return;
    }
    clearFindError();
    find.value = '';
    select(i);
    fly(i);
  };
  find.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      findNeuron();
    }
    if (e.key === 'Escape') {
      clearFindError();
      canvas.focus();
    }
  });
  find.addEventListener('input', (e) => {
    clearFindError();
    // A pick from the list arrives as a replacement, or in some browsers as a plain event; act on it when
    // it names a neuron exactly. Typing acts only on Enter.
    const picked = !(e instanceof InputEvent) || e.inputType === 'insertReplacementText';
    const query = find.value.trim().toUpperCase();
    if (picked && wiring.names.some((name) => name.toUpperCase() === query)) findNeuron();
  });
  // Slash finds a neuron from anywhere but a text field.
  const onSlash = (e: KeyboardEvent): void => {
    const target = e.target as HTMLElement | null;
    if (e.key !== '/' || target?.closest('input, textarea, select, [contenteditable="true"]')) return;
    // Behind a modal dialog, such as About the science, the key is the browser's.
    if (document.querySelector('dialog:modal')) return;
    e.preventDefault();
    find.focus();
  };
  document.addEventListener('keydown', onSlash);
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
    label.hidden = true;
  };
  // Whether a neuron is drawn inside the space the overlays leave.
  const inView = (i: number): boolean => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const p = project(frameState().viewProjection, positions.subarray(3 * i, 3 * i + 3), w, h);
    return (
      p !== null &&
      p.w > orbit.distance * NEAR &&
      p.x > 0 &&
      p.y > 0 &&
      p.x < w * (1 - shiftGoal.right) &&
      p.y < h * (1 - shiftGoal.bottom)
    );
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
  // to dblclick, which acts on what the first click hit, since that click may have opened the inspector and
  // moved the graph out from under the pointer.
  let lastClick = { hit: null as number | null, at: -Infinity };
  canvas.addEventListener('click', (e) => {
    if (suppressClick || e.detail > 1) return;
    const hit = pickAt(e.offsetX, e.offsetY, e instanceof PointerEvent ? pointerKind(e) : 'mouse');
    lastClick = { hit, at: performance.now() };
    select(hit === selected ? null : hit);
  });
  canvas.addEventListener('dblclick', (e) => {
    const hit = performance.now() - lastClick.at < 800 ? lastClick.hit : pickAt(e.offsetX, e.offsetY, 'mouse');
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
    if (e.ctrlKey || e.metaKey || e.altKey) return;
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
      default:
        return;
    }
    e.preventDefault();
  });

  // Until the graph is first framed, framing changes take effect at once; after that they ease in.
  let settled = false;
  let easing = false;
  const refit = (): void => {
    // On a wide screen the inspector ends above the footer. Its top comes from its CSS, not its box, which is
    // empty while it is hidden, and its height is set outside this ResizeObserver's callback.
    const footerTop = footer.getBoundingClientRect().top;
    const panelTop = canvas.getBoundingClientRect().top + parseFloat(getComputedStyle(inspector.element).top);
    const maxHeight = narrow.matches || !(footerTop > panelTop) ? '' : `${Math.max(160, footerTop - panelTop - 16)}px`;
    requestAnimationFrame(() => {
      if (inspector.element.style.maxHeight !== maxHeight) inspector.element.style.maxHeight = maxHeight;
    });
    shiftGoal = insets();
    homeDistance = fit(homeBase(), aspect(), shiftGoal);
    if (settled) easing = true;
    else {
      shift = shiftGoal;
      if (!moved) orbit = home();
    }
    dirty = true;
  };
  // One step of the framing towards its goal: the overlays' share and, until the camera is moved, the
  // home distance.
  let lastTick = performance.now();
  const ease = (now: number): void => {
    const k = 1 - Math.exp(-Math.max(0, now - lastTick) / 90);
    const towards = (from: number, to: number): number => (Math.abs(to - from) < 1e-4 ? to : from + (to - from) * k);
    shift = { right: towards(shift.right, shiftGoal.right), bottom: towards(shift.bottom, shiftGoal.bottom) };
    const distance = moved ? orbit.distance : towards(orbit.distance, home().distance);
    if (!moved) orbit = { ...home(), distance };
    easing =
      shift.right !== shiftGoal.right || shift.bottom !== shiftGoal.bottom || (!moved && distance !== home().distance);
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
  upload();
  if (selected !== null) {
    inspector.setActivity(activityOf(selected));
    inspector.show(inspect(data, wiring, muscles, selected, lesioned));
    pane.classList.add('inspecting');
  }
  // The experiment changed, here or in the plate: the brain shown, its lesions, and the inspector with them.
  // The experiment changed, here or in the plate: the brain shown, its lesions, and the inspector with them, keeping
  // the keyboard's place there. A change undone because it couldn't be made drops the graph's word on it: the plate
  // says what was undone.
  const unsubscribe = experiment.subscribe((e, reverted) => {
    const before = {
      brain,
      lesions: data.neurons.flatMap((neuron) => (lesioned.has(neuron.name) ? [neuron.name] : [])),
    };
    if (reverted) {
      cancelAnimationFrame(announcing);
      selection.textContent = '';
      // With the graph alone, the plate that failed to make the change speaks unseen, so the graph says it.
      if (title) announce(`Couldn't finish ${describeChange(e, before)}, so it was undone.`);
    }
    const focused = inspector.element.contains(document.activeElement);
    if (e.brain !== brain) {
      brain = e.brain;
      wiring = new Wiring(experiment.brains.data(brain));
      radii = sizes();
      showBrain();
    }
    lesioned = new Set(e.lesions);
    lesionKey.hidden = lesioned.size === 0;
    showLesions();
    upload();
    inspector.setActivity(activityOf(selected));
    if (selected !== null) inspector.show(inspect(data, wiring, muscles, selected, lesioned), focused);
  });
  // The worm's activity moved on: the glow redrawn, and the inspector's reading.
  const stopActivity = activity.subscribe(() => {
    if (!live) {
      live = true;
      showColouring();
      inspector.setActivity(activityOf(selected));
      if (selected !== null) inspector.show(inspect(data, wiring, muscles, selected, lesioned));
    }
    if (glowing()) upload();
    inspector.setActivity(activityOf(selected));
  });
  for (const input of [byActivity, byClass]) {
    input.addEventListener('change', () => {
      colouredBy = input.value === 'class' ? 'class' : 'activity';
      // Where no worm runs yet, as with the graph alone on class colours, the glow asks for one.
      if (colouredBy === 'activity' && !activity.published) activity.request?.();
      showColouring();
      upload();
    });
  }
  restoreLesions.addEventListener('click', () => {
    experiment.restoreAll();
    // The note hides itself; keep the keyboard's place on the search beside it.
    find.focus();
    announce('Every lesioned neuron is restored.');
  });
  resize(canvas.clientWidth * window.devicePixelRatio, canvas.clientHeight * window.devicePixelRatio);
  settled = true;
  selection.textContent = describe();

  let first: (() => void) | null = null;
  const ready = new Promise<void>((resolve) => {
    first = resolve;
  });
  // Draw only when something changed. With ?norender=1 nothing reaches the screen, and snapshots are the
  // only GPU work, as software stacks need (scripts/visual/capture.ts).
  const tick = (now: number): void => {
    if (stopped) return;
    if (easing) ease(now);
    lastTick = now;
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

  return {
    ready,
    snapshot: () => renderer.snapshot(frameState()),
    stop: () => {
      stopped = true;
      unsubscribe();
      stopActivity();
      observer.disconnect();
      footerObserver.disconnect();
      document.removeEventListener('keydown', onSlash);
    },
  };
}
