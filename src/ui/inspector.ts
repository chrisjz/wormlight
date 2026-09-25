// The inspector panel: the selected neuron's facts and connections, each with a badge giving the fidelity
// level and source of its sign (spec §1.3, §6). Partners are buttons that select them, and pointing at one
// marks it in the graph. A key under the lists explains every badge shown, for readers who can't hover.

import { SCALE } from '../science/levels.ts';
import type { Provenance } from '../science/provenance.ts';
import type { Inspection, Row } from './inspection.ts';

const SHOWN = 8; // rows per group before "Show all"
const CLASS_NAMES = { sensory: 'Sensory', interneuron: 'Interneuron', motor: 'Motor', pharyngeal: 'Pharyngeal' };

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

const levelName = (p: Provenance): string => SCALE.find((s) => s.level === p.level)?.name ?? '';

export function badge(p: Provenance): HTMLElement {
  const b = el('span', `badge badge-${p.level}`);
  b.title = p.detail;
  b.append(el('span', 'badge-level', String(p.level)), el('span', 'badge-label', p.label));
  b.setAttribute('aria-label', `${p.label}, level ${p.level}, ${levelName(p).toLowerCase()}`);
  return b;
}

const SIGNS = { '1': ['+', 'excitatory'], '-1': ['−', 'inhibitory'], '0': ['0', 'no fast effect'] } as const;

export interface InspectorActions {
  select(neuron: number): void;
  point(neuron: number | null): void;
  close(): void;
}

export class Inspector {
  readonly element: HTMLElement;
  private readonly actions: InspectorActions;
  private expanded = new Set<string>();
  private current: Inspection | null = null;

  constructor(actions: InspectorActions) {
    this.actions = actions;
    this.element = el('aside', 'inspector');
    this.element.setAttribute('aria-label', 'Neuron inspector');
    this.element.hidden = true;
  }

  show(inspection: Inspection | null): void {
    if (inspection?.index !== this.current?.index) this.expanded = new Set();
    this.current = inspection;
    this.element.hidden = inspection === null;
    if (!inspection) {
      this.element.replaceChildren();
      return;
    }
    const head = el('header', 'inspector-head');
    const title = el('h2', 'inspector-name', inspection.name);
    const close = el('button', 'inspector-close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close the inspector');
    close.addEventListener('click', () => this.actions.close());
    head.append(title, el('span', 'inspector-class', CLASS_NAMES[inspection.cellClass]), close);

    const facts = el('dl', 'inspector-facts');
    for (const { label, value } of inspection.facts)
      facts.append(el('dt', undefined, label), el('dd', undefined, value));

    const body: HTMLElement[] = [head, facts];
    const used = new Map<string, Provenance>();
    for (const group of inspection.groups) {
      const section = el('section', 'inspector-group');
      const heading = el('h3', 'inspector-heading', `${group.title} `);
      heading.append(el('span', 'inspector-count', String(group.rows.length)));
      const most = Math.max(...group.rows.map((r) => r.sections));
      const open = this.expanded.has(group.kind);
      const list = el('ol', 'inspector-rows');
      for (const row of open ? group.rows : group.rows.slice(0, SHOWN)) {
        list.append(this.row(row, most));
        used.set(`${row.provenance.level}${row.provenance.label}`, row.provenance);
      }
      section.append(heading, list);
      if (group.rows.length > SHOWN) {
        const more = el('button', 'inspector-more', open ? 'Show fewer' : `Show all ${group.rows.length}`);
        more.type = 'button';
        more.addEventListener('click', () => {
          if (open) this.expanded.delete(group.kind);
          else this.expanded.add(group.kind);
          this.show(this.current);
        });
        section.append(more);
      }
      body.push(section);
    }
    // Every badge on show, explained.
    const key = el('details', 'inspector-key');
    key.append(el('summary', undefined, 'What the badges mean'));
    const entries = el('dl');
    for (const p of [...used.values()].sort((a, b) => b.level - a.level || a.label.localeCompare(b.label))) {
      const term = el('dt');
      term.append(badge(p));
      entries.append(term, el('dd', undefined, p.detail));
    }
    const scale = el('p', 'inspector-scale', 'Levels run from 5, measured, to 0, assumed; the ');
    const ledger = el('a', undefined, 'fidelity ledger');
    ledger.href = 'https://github.com/chrisjz/wormlight/blob/main/FIDELITY.md';
    ledger.rel = 'noopener';
    scale.append(ledger, ' explains each.');
    key.append(entries, scale);
    body.push(key);
    this.element.replaceChildren(...body);
  }

  private row(row: Row, most: number): HTMLElement {
    const item = el('li', 'inspector-row');
    const name = row.neuron === null ? el('span', 'row-name', row.name) : el('button', 'row-name', row.name);
    if (name instanceof HTMLButtonElement) {
      const neuron = row.neuron as number;
      name.type = 'button';
      name.addEventListener('click', () => this.actions.select(neuron));
      for (const on of ['pointerenter', 'focus'] as const) name.addEventListener(on, () => this.actions.point(neuron));
      for (const off of ['pointerleave', 'blur'] as const) name.addEventListener(off, () => this.actions.point(null));
    }
    const sign = el('span', 'row-sign');
    if (row.sign === null) sign.textContent = '';
    else {
      const [glyph, meaning] = SIGNS[String(row.sign) as keyof typeof SIGNS];
      sign.textContent = glyph;
      sign.dataset.sign = String(row.sign);
      sign.title = meaning;
      sign.setAttribute('aria-label', meaning);
    }
    const sections = el('span', 'row-sections');
    const bar = el('span', 'row-bar');
    bar.style.width = `${Math.max(4, (100 * row.sections) / most)}%`;
    sections.append(bar, el('span', 'row-count', String(row.sections)));
    sections.title = `${row.sections} EM section${row.sections === 1 ? '' : 's'}`;
    item.append(name, sign, sections, badge(row.provenance));
    return item;
  }
}
