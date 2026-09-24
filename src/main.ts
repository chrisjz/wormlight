import './style.css';
import { describeGpuSupport, probeWebGpu } from './gpu/support';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

async function start(root: HTMLElement): Promise<void> {
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
  status.append(el('p', 'status-body', 'Checking for WebGPU…'));
  root.replaceChildren(header, status);

  const support = await probeWebGpu(navigator.gpu);
  const { title, body } = describeGpuSupport(support);
  status.dataset.kind = support.kind;
  status.replaceChildren(el('h2', 'status-title', title), el('p', 'status-body', body));
}

const root = document.querySelector<HTMLElement>('#app');
if (root) void start(root);
