import './style.css';
import { validateWormlightData, type WormlightData } from './data/schema';
import { describeGpuSupport, probeWebGpu } from './gpu/support';
import { startGraph, type GraphHandle } from './ui/graphView';
import { readParams, readPlateParams } from './ui/params';
import { startPlate, type PlateHandle } from './ui/plateView';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const FAILURES = new Set(['no-webgpu', 'no-adapter', 'failed']);

// A page with the title and one message: while loading, and whenever the app can't run. Failures are
// announced as alerts.
function message(root: HTMLElement, kind: string, title: string | null, body: string): void {
  const header = el('header', 'masthead');
  header.append(
    el('h1', 'title', 'Wormlight'),
    el(
      'p',
      'lede',
      "A living C. elegans in the browser, under construction. The worm's full connectome runs on your GPU and " +
        'drives a physically simulated body; its neurons will glow as they activate.',
    ),
  );
  const status = el('section', 'status');
  status.setAttribute('role', FAILURES.has(kind) ? 'alert' : 'status');
  status.dataset.kind = kind;
  if (title) status.append(el('h2', 'status-title', title));
  status.append(el('p', 'status-body', body));
  root.className = '';
  root.replaceChildren(header, status);
}

const reason = (err: unknown): string => (err instanceof Error ? err.message : String(err));

async function start(root: HTMLElement): Promise<void> {
  message(root, 'checking', null, 'Checking for WebGPU…');
  const support = await probeWebGpu(navigator.gpu);
  if (support.kind !== 'ready') {
    const { title, body } = describeGpuSupport(support);
    message(root, support.kind, title, body);
    throw new Error(title);
  }
  const { device } = support;
  let graph: GraphHandle | null = null;
  let plate: PlateHandle | null = null;
  let failed = false;
  // Rejects when anything fails, so no wait outlasts a failure.
  let reject: (err: Error) => void = () => undefined;
  const failure = new Promise<never>((_, no) => {
    reject = no;
  });
  failure.catch(() => undefined);
  const fail = (title: string, body: string): void => {
    if (failed) return;
    failed = true;
    graph?.stop();
    plate?.stop();
    message(root, 'failed', title, body);
    reject(new Error(title));
  };
  void device.lost.then((info) => {
    if (info.reason === 'destroyed') return;
    fail(
      'The GPU stopped responding',
      `${info.message || 'The browser gave no reason.'} Reload the page to try again.`,
    );
  });
  device.addEventListener('uncapturederror', (e) => {
    const { error } = e;
    console.error(error.message);
    fail('The worm could not be drawn', `The GPU reported: ${error.message}`);
  });

  message(root, 'loading', null, 'Loading the connectome…');
  let data: WormlightData;
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}data/wormlight.v1.json`);
    if (!response.ok) throw new Error(`the server answered ${response.status}`);
    data = validateWormlightData(await response.json());
  } catch (err) {
    fail('The connectome could not be loaded', reason(err));
    throw err;
  }
  if (failed) throw new Error('the GPU was lost while loading');
  // The plate and the graph side by side, or one alone (?view=plate, ?view=graph).
  const { layout, ...start } = readPlateParams(location.search);
  const { noRender } = readParams(location.search);
  const pane = (kind: string, label: string): HTMLElement => {
    const section = el('section', `pane pane-${kind}`);
    section.setAttribute('aria-label', label);
    return section;
  };
  const platePane = layout === 'graph' ? null : pane('plate', 'The worm on its dish');
  const graphPane = layout === 'plate' ? null : pane('graph', 'The connectome');
  root.className = `app ${layout}`;
  root.replaceChildren(...[platePane, graphPane].filter((p) => p !== null));
  // A view that finishes starting after a failure is stopped at once.
  const guard = <T extends { stop(): void }>(starting: Promise<T>): Promise<T> => {
    starting.then(
      (view) => {
        if (failed) view.stop();
      },
      () => undefined,
    );
    return Promise.race([starting, failure]);
  };
  try {
    if (platePane) plate = await guard(startPlate(platePane, device, data, { layout, ...start }, noRender));
    if (graphPane) graph = await guard(startGraph(graphPane, device, data, layout === 'graph'));
    await Promise.race([Promise.all([plate?.ready, graph?.ready]), failure]);
  } catch (err) {
    fail('Wormlight could not start', reason(err));
    throw err;
  }
  // The visual tests read either view back as a PNG (scripts/visual/capture.ts), and the plate's benchmark reads
  // its rates (scripts/plate/bench.ts).
  const hooks = window as unknown as {
    __snap?: (pane?: 'plate' | 'graph') => Promise<string>;
    __rates?: () => { fps: number; speed: number } | null;
    __drain?: () => Promise<{ milliseconds: number; steps: number } | null>;
  };
  hooks.__rates = () => plate?.rates() ?? null;
  hooks.__drain = async () => (plate ? await plate.drain() : null);
  hooks.__snap = async (which = graph ? 'graph' : 'plate') => {
    const view = which === 'plate' ? plate : graph;
    if (!view) throw new Error(`no ${which} view is showing`);
    return await png(await view.snapshot());
  };
}

// An image as a PNG data URL.
async function png(image: ImageData): Promise<string> {
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
}

const root = document.querySelector<HTMLElement>('#app');
if (root) {
  // The visual tests wait on this before taking a snapshot (scripts/visual/capture.ts). The page itself
  // explains any failure, so the rejection is only logged here.
  const ready = start(root);
  ready.catch((err: unknown) => console.error(err));
  (window as unknown as { __ready?: Promise<void> }).__ready = ready;
}
