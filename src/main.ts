import './style.css';
import { validateWormlightData, type WormlightData } from './data/schema';
import { describeGpuSupport, probeWebGpu } from './gpu/support';
import { startGraph, type GraphHandle } from './ui/graphView';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const FAILURES = new Set(['no-webgpu', 'no-adapter', 'failed']);

// A page with the title and one message: while loading, and whenever the graph can't run. Failures are
// announced as alerts.
function message(root: HTMLElement, kind: string, title: string | null, body: string): void {
  const header = el('header', 'masthead');
  header.append(
    el('h1', 'title', 'Wormlight'),
    el(
      'p',
      'lede',
      "A living C. elegans in the browser, under construction. The worm's full connectome will run on your GPU " +
        'and drive a physically simulated body, with neurons glowing as they activate.',
    ),
  );
  const status = el('section', 'status');
  status.setAttribute('role', FAILURES.has(kind) ? 'alert' : 'status');
  status.dataset.kind = kind;
  if (title) status.append(el('h2', 'status-title', title));
  status.append(el('p', 'status-body', body));
  root.classList.remove('graph');
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
  let failed = false;
  const fail = (title: string, body: string): void => {
    if (failed) return;
    failed = true;
    graph?.stop();
    message(root, 'failed', title, body);
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
    fail('The graph could not be drawn', `The GPU reported: ${error.message}`);
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
  try {
    graph = await startGraph(root, device, data);
    await graph.ready;
  } catch (err) {
    fail('The graph could not start', reason(err));
    throw err;
  }
  if (failed) throw new Error('the graph failed while starting');
}

const root = document.querySelector<HTMLElement>('#app');
if (root) {
  // The visual tests wait on this before taking a snapshot (scripts/visual/capture.ts). The page itself
  // explains any failure, so the rejection is only logged here.
  const ready = start(root);
  ready.catch((err: unknown) => console.error(err));
  (window as unknown as { __ready?: Promise<void> }).__ready = ready;
}
