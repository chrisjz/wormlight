// The inspector panel: the selected neuron's facts and connections, each with a badge giving the fidelity
// level and source of its sign (spec §1.3, §6). A partner's row is a button that selects it, and pointing
// at one marks it in the graph. A key under the lists explains every badge shown, for readers who can't
// hover, and each badge's level and source are also given in words to screen readers. A button ablates the
// neuron or restores it (spec §6), and rows a lesion cuts are struck through.

import type { Sign } from '../data/schema.ts';
import { SCALE } from '../science/levels.ts';
import type { Provenance } from '../science/provenance.ts';
import { badgeKey, CLASS_NAMES, type GroupKind, type Inspection, type Row } from './inspection.ts';

const SHOWN = 8; // rows per group before "Show all"

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

// Text for screen readers only.
const hidden = (text: string): HTMLElement => el('span', 'sr-only', text);

const levelName = (p: Provenance): string => (SCALE.find((s) => s.level === p.level)?.name ?? '').toLowerCase();

// A badge, and for a rewired connection the real wiring's connection whose sign it keeps.
function badge(p: Provenance, origin?: Row['origin']): HTMLElement {
  const b = el('span', `badge badge-${p.level}`);
  const from = origin
    ? `sign from ${origin.pre} → ${origin.post} in the real wiring, whose source is ` +
      `${origin.provenance.label}, level ${origin.provenance.level}`
    : '';
  b.title = from ? `${p.detail} This one's ${from}.` : p.detail;
  const face = el('span', 'badge-face');
  face.setAttribute('aria-hidden', 'true');
  face.append(el('span', 'badge-level', String(p.level)), el('span', 'badge-label', p.label));
  b.append(face, hidden(`sign source: ${p.label}, level ${p.level}, ${levelName(p)}${from ? `; ${from}` : ''}`));
  return b;
}

const SIGNS: Record<Sign, { glyph: string; meaning: string }> = {
  1: { glyph: '+', meaning: 'excitatory' },
  [-1]: { glyph: '−', meaning: 'inhibitory' },
  0: { glyph: '0', meaning: 'no fast effect' },
};

export interface InspectorActions {
  select(neuron: number): void;
  point(neuron: number | null): void;
  close(): void;
  // Ablate the neuron, or with `on` false restore it.
  lesion(neuron: number, on: boolean): void;
}

export class Inspector {
  readonly element: HTMLElement;
  private readonly actions: InspectorActions;
  private expanded = new Set<GroupKind>();
  private keyOpen = false;
  private current: Inspection | null = null;
  // The neuron's simulated activity, which the inspector shows while a worm runs and updates in place.
  private activity: number | 'lesioned' | null = null;
  private activityValue: HTMLElement | null = null;
  // Where focus goes after the next rebuild: the heading, after moving to a partner; a group's toggle; or the
  // lesion button, after it is pressed.
  private focusNext: 'heading' | 'lesion' | GroupKind | null = null;

  constructor(actions: InspectorActions) {
    this.actions = actions;
    this.element = el('aside', 'inspector');
    this.element.setAttribute('aria-label', 'Neuron inspector');
    this.element.hidden = true;
    this.element.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      this.actions.close();
    });
  }

  // Show a neuron, or none. With `keepFocus`, as when the experiment changes while the keyboard is in the inspector,
  // focus goes to the lesion button unless something else has asked for it.
  show(inspection: Inspection | null, keepFocus = false): void {
    if (keepFocus) this.focusNext ??= 'lesion';
    // The rows are about to be replaced, so none is pointed at any more.
    this.actions.point(null);
    const changed = inspection?.index !== this.current?.index;
    if (changed) this.expanded = new Set();
    this.current = inspection;
    this.element.hidden = inspection === null;
    if (!inspection) {
      this.element.replaceChildren();
      return;
    }
    const head = el('header', 'inspector-head');
    const title = el('h2', 'inspector-name', inspection.name);
    title.tabIndex = -1;
    const close = el('button', 'inspector-close', '×');
    close.type = 'button';
    close.title = 'Close (Esc)';
    close.setAttribute('aria-label', 'Close the inspector');
    close.addEventListener('click', () => this.actions.close());
    head.append(title, el('span', 'inspector-class', CLASS_NAMES[inspection.cellClass]), close);

    const facts = el('dl', 'inspector-facts');
    for (const { label, value } of inspection.facts)
      facts.append(el('dt', undefined, label), el('dd', undefined, value));
    this.activityValue = null;
    if (this.activity !== null) {
      this.activityValue = el('dd', 'inspector-activity');
      this.activityValue.title =
        "Simulated: the model's activation, filtered as the GCaMP6s indicator would smooth it, on one fixed scale.";
      facts.append(el('dt', undefined, 'Activity'), this.activityValue);
      this.setActivity(this.activity);
    }

    const lesion = el('div', 'inspector-lesion');
    const index = inspection.index;
    const on = !inspection.lesioned;
    const ablate = el('button', 'inspector-ablate', on ? 'Ablate' : 'Restore');
    ablate.type = 'button';
    ablate.setAttribute('aria-label', `${on ? 'Ablate' : 'Restore'} ${inspection.name}`);
    ablate.title = on
      ? 'Cut every connection it has, as a laser ablation does; the worm runs on without it'
      : 'Put back every connection it had';
    ablate.addEventListener('click', () => {
      this.focusNext = 'lesion';
      this.actions.lesion(index, on);
    });
    if (inspection.lesioned) {
      lesion.append(el('p', 'inspector-lesioned', 'Lesioned: every connection it has is cut.'));
    }
    lesion.append(ablate);

    const body: HTMLElement[] = [head, facts, lesion];
    const toggles = new Map<GroupKind, HTMLButtonElement>();
    const shown: Row[] = [];
    for (const group of inspection.groups) {
      const section = el('section', 'inspector-group');
      const heading = el('h3', 'inspector-heading', `${group.title} `);
      heading.append(el('span', 'inspector-count', String(group.rows.length)));
      const most = Math.max(...group.rows.map((r) => r.sections));
      const open = this.expanded.has(group.kind);
      const rows = open ? group.rows : group.rows.slice(0, SHOWN);
      shown.push(...rows);
      const list = el('ol', 'inspector-rows');
      for (const row of rows) list.append(this.row(row, most));
      section.append(heading, list);
      if (group.rows.length > SHOWN) {
        const more = el('button', 'inspector-more', open ? 'Show fewer' : `Show all ${group.rows.length}`);
        more.type = 'button';
        more.addEventListener('click', () => {
          if (open) this.expanded.delete(group.kind);
          else this.expanded.add(group.kind);
          this.focusNext = group.kind;
          this.show(this.current);
        });
        toggles.set(group.kind, more);
        section.append(more);
      }
      body.push(section);
    }
    const explained = badgeKey(shown);
    if (explained.length > 0) {
      const key = el('details', 'inspector-key');
      key.open = this.keyOpen;
      // Opened by the reader, the key scrolls into view; a rebuild that keeps it open leaves the scroll alone.
      key.addEventListener('toggle', () => {
        if (key.open === this.keyOpen) return;
        this.keyOpen = key.open;
        if (key.open) key.scrollIntoView({ block: 'nearest' });
      });
      key.append(el('summary', undefined, 'What the badges mean'));
      const entries = el('dl');
      for (const p of explained) {
        const term = el('dt');
        term.append(badge(p));
        entries.append(term, el('dd', undefined, p.detail));
      }
      const scale = el('p', 'inspector-scale', 'Levels run from 5, measured, to 0, assumed; the ');
      const ledger = el('a', undefined, 'fidelity ledger');
      ledger.href = 'https://github.com/chrisjz/wormlight/blob/main/FIDELITY.md';
      ledger.target = '_blank';
      ledger.rel = 'noopener';
      scale.append(ledger, ' explains each.');
      key.append(entries, scale);
      body.push(key);
    }
    this.element.replaceChildren(...body);
    if (changed) this.element.scrollTop = 0;
    const target = this.focusNext;
    this.focusNext = null;
    if (target === 'heading') title.focus();
    else if (target === 'lesion') ablate.focus();
    else if (target) toggles.get(target)?.focus();
  }

  // The neuron's activity: the glow's value from 0 to 1, shown as a share of full activation, or that it is lesioned;
  // null while no worm runs. It is written in place, so the inspector isn't rebuilt at each frame.
  setActivity(value: number | 'lesioned' | null): void {
    this.activity = value;
    if (!this.activityValue) return;
    this.activityValue.textContent =
      value === 'lesioned' ? 'none, lesioned' : value === null ? '' : `${Math.round(100 * value)}% (simulated)`;
  }

  private row(row: Row, most: number): HTMLElement {
    const item = el('li');
    const line = row.neuron === null ? el('div', 'inspector-row') : el('button', 'inspector-row');
    if (row.cut) line.classList.add('row-cut');
    const name = el('span', 'row-name', row.name);
    if (row.cut) name.append(hidden(', cut by a lesion'));
    line.append(name);
    const sign = el('span', 'row-sign');
    if (row.sign !== null) {
      const { glyph, meaning } = SIGNS[row.sign];
      sign.textContent = glyph;
      sign.dataset.sign = String(row.sign);
      sign.title = meaning;
      sign.setAttribute('role', 'img');
      sign.setAttribute('aria-label', meaning);
    }
    const bar = el('span', 'row-bar');
    bar.style.width = `${Math.max(4, (100 * row.sections) / most)}%`;
    const count = el('span', 'row-count', String(row.sections));
    count.title = `${row.sections} EM section${row.sections === 1 ? '' : 's'}`;
    count.append(hidden(row.sections === 1 ? ' EM section' : ' EM sections'));
    line.append(sign, bar, count, badge(row.provenance, row.origin));
    if (line instanceof HTMLButtonElement && row.neuron !== null) {
      const neuron = row.neuron;
      line.type = 'button';
      line.addEventListener('click', () => {
        this.focusNext = 'heading';
        this.actions.select(neuron);
      });
      for (const on of ['pointerenter', 'focus'] as const) line.addEventListener(on, () => this.actions.point(neuron));
      for (const off of ['pointerleave', 'blur'] as const) line.addEventListener(off, () => this.actions.point(null));
    }
    item.append(line);
    return item;
  }
}
