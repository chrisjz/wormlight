import './style.css';
import { validateWormlightData } from './data/schema';
import { describeGpuSupport, probeWebGpu } from './gpu/support';
import { startGraph } from './ui/graphView';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// A page with the title and one message: while loading, and whenever the graph can't run.
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
  status.setAttribute('aria-live', 'polite');
  status.dataset.kind = kind;
  if (title) status.append(el('h2', 'status-title', title));
  status.append(el('p', 'status-body', body));
  root.classList.remove('graph');
  root.replaceChildren(header, status);
}

async function start(root: HTMLElement): Promise<void> {
  message(root, 'checking', null, 'Checking for WebGPU…');
  const support = await probeWebGpu(navigator.gpu);
  if (support.kind !== 'ready') {
    const { title, body } = describeGpuSupport(support);
    message(root, support.kind, title, body);
    throw new Error(title);
  }
  const { device } = support;
  void device.lost.then((info) => {
    if (info.reason !== 'destroyed') message(root, 'failed', 'The GPU stopped responding', info.message);
  });
  let data;
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}data/wormlight.v1.json`);
    if (!response.ok) throw new Error(`the server answered ${response.status}`);
    data = validateWormlightData(await response.json());
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    message(root, 'failed', 'The connectome could not be loaded', reason);
    throw err;
  }
  await startGraph(root, device, data).ready;
}

const root = document.querySelector<HTMLElement>('#app');
if (root) {
  // The visual tests wait on this before taking a snapshot (scripts/visual/capture.ts).
  const ready = start(root);
  ready.catch(() => undefined); // the page already explains the failure
  (window as unknown as { __ready?: Promise<void> }).__ready = ready;
}
