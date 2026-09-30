// "About the science" (spec §1.3): the fidelity ledger in the app, from the same registry as FIDELITY.md, in a dialog
// over the views. It opens with where the project stands (the status FIDELITY.md opens with), then the scale, each
// subsystem's levels with what is solid and what isn't, its components folded beneath it, the biology left out, the
// presentation's choices, the parameters, folded by group, and the sources. `?about=science` opens it from a link,
// and the URL says so while it is open.

import type { WormlightData } from '../data/schema.ts';
import { CITATIONS, type Citation, type CitationId } from '../science/citations.ts';
import { countFacts, type Facts } from '../science/facts.ts';
import { COMPONENTS, OMITTED, PRESENTATION, render, SUBSYSTEMS, type SubsystemId } from '../science/fidelity.ts';
import {
  calibratedText,
  formatValue,
  levelsText,
  PARAM_GROUPS,
  statusText,
  subsystemRange,
  testedByText,
} from '../science/ledger.ts';
import { SCALE } from '../science/levels.ts';
import {
  FREE_PARAMETER_BUDGET,
  freeParams,
  PARAMS,
  type Param,
  type ParamId,
  type Subsystem,
} from '../science/params.ts';
import { usedCitations } from '../science/used.ts';
import { aboutUrl } from './params.ts';

const REPOSITORY = 'https://github.com/chrisjz/wormlight/blob/main';

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
  a.target = '_blank';
  return a;
}

// The registry's text, whose only marks are **strong**, _emphasis_ and `code`, as nodes.
export function marks(text: string): Node[] {
  const out: Node[] = [];
  const pattern = /\*\*(.+?)\*\*|(?<![\w])_(.+?)_(?![\w])|`(.+?)`/g;
  let at = 0;
  for (const m of text.matchAll(pattern)) {
    if (m.index > at) out.push(document.createTextNode(text.slice(at, m.index)));
    const [tag, inner] =
      m[1] !== undefined
        ? (['strong', m[1]] as const)
        : m[2] !== undefined
          ? (['i', m[2]] as const)
          : (['code', m[3]] as const);
    out.push(el(tag, undefined, inner));
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push(document.createTextNode(text.slice(at)));
  return out;
}

const paragraph = (text: string, className?: string): HTMLParagraphElement => {
  const p = el('p', className);
  p.append(...marks(text));
  return p;
};

// A level, or a range of them, as the inspector's badges show one.
function levelBadge(levels: string): HTMLElement {
  const top = levels.match(/\d/)?.[0];
  const b = el('span', `badge about-level${top ? ` badge-${top}` : ''}`);
  b.append(el('span', 'badge-level', levels));
  return b;
}

function sources(ids: readonly CitationId[]): Node[] {
  const out: Node[] = [];
  ids.forEach((id, k) => {
    if (k > 0) out.push(document.createTextNode('; '));
    const c: Citation = CITATIONS[id];
    out.push(
      c.doi
        ? link(c.short, `https://doi.org/${c.doi}`)
        : c.url
          ? link(c.short, c.url)
          : document.createTextNode(c.short),
    );
  });
  return out;
}

// A definition list of the rows that have something to say.
function facts(rows: readonly [string, Node[] | string][]): HTMLDListElement {
  const dl = el('dl', 'about-facts');
  for (const [term, value] of rows) {
    if (typeof value === 'string' ? value === '' : value.length === 0) continue;
    const dd = el('dd');
    if (typeof value === 'string') dd.append(...marks(value));
    else dd.append(...value);
    dl.append(el('dt', undefined, term), dd);
  }
  return dl;
}

function section(title: string, ...children: Node[]): HTMLElement {
  const s = el('section', 'about-section');
  s.append(el('h3', undefined, title), ...children);
  return s;
}

function scale(): HTMLElement {
  const list = el('dl', 'about-scale');
  for (const step of SCALE) {
    const dt = el('dt');
    dt.append(levelBadge(step.symbol), ` ${step.name}`);
    const dd = el('dd');
    dd.append(...marks(`${step.meaning} For example: ${step.example}`));
    list.append(dt, dd);
  }
  return section(
    'The scale',
    paragraph(
      "A level describes the kind of evidence behind a part, not how much it matters, and not certainty. A subsystem's " +
        "levels are the range of its components'.",
    ),
    list,
  );
}

function subsystems(f: Facts): HTMLElement {
  const items = (Object.keys(SUBSYSTEMS) as SubsystemId[]).map((id) => {
    const s = SUBSYSTEMS[id];
    const article = el('article', 'about-subsystem');
    const heading = el('h4');
    heading.append(levelBadge(subsystemRange(id)), ` ${s.name}`);
    article.append(
      heading,
      facts([
        ["What's solid", render(s.solid, f)],
        ["What isn't", render(s.notSolid, f)],
        ['What would raise it', render(s.upgrade, f) === '—' ? '' : render(s.upgrade, f)],
      ]),
    );
    const parts = COMPONENTS.filter((c) => c.subsystem === id);
    if (parts.length > 0) {
      const details = el('details', 'about-components');
      details.append(
        el('summary', undefined, `Its ${parts.length === 1 ? 'component' : `${parts.length} components`}`),
      );
      for (const c of parts) {
        const part = el('div', 'about-component');
        const name = el('h5');
        name.append(levelBadge(levelsText(c.levels)), ` ${render(c.name, f)}`);
        part.append(
          name,
          facts([
            ['Basis', render(c.basis, f)],
            ['Caveats', render(c.caveats, f)],
            ['What would raise it', render(c.upgrade, f)],
            ['Tested by', testedByText(c.testedBy)],
            ['Sources', sources(c.sources)],
          ]),
        );
        details.append(part);
      }
      article.append(details);
    }
    return article;
  });
  return section('Subsystem by subsystem', ...items);
}

function notes(title: string, list: readonly { text: string; sources: readonly CitationId[] }[]): HTMLElement {
  const ul = el('ul', 'about-notes');
  for (const item of list) {
    const li = el('li');
    li.append(...marks(item.text));
    ul.append(li);
  }
  return section(title, ul);
}

function parameters(): HTMLElement {
  const free = freeParams();
  const calibrated = free.filter((id) => PARAMS[id].level === 1);
  const groups = (Object.keys(PARAM_GROUPS) as Subsystem[]).map((group) => {
    const details = el('details', 'about-params');
    const ids = (Object.keys(PARAMS) as ParamId[]).filter((id) => PARAMS[id].subsystem === group);
    details.append(el('summary', undefined, `${PARAM_GROUPS[group]} (${ids.length})`));
    const table = el('table');
    const head = el('tr');
    for (const h of ['Parameter', 'Value', 'Unit', 'Level']) head.append(el('th', undefined, h));
    table.append(el('thead'), el('tbody'));
    table.tHead?.append(head);
    for (const id of ids) {
      const p: Param = PARAMS[id];
      const row = el('tr');
      const name = el('td');
      name.append(p.name, ' ', el('code', undefined, p.symbol));
      row.append(
        name,
        el('td', undefined, formatValue(p)),
        el('td', undefined, p.unit),
        el('td', undefined, String(p.level)),
      );
      table.tBodies[0].append(row);
    }
    details.append(table);
    return details;
  });
  return section(
    'Parameters',
    paragraph(
      `A parameter is free when we set it ourselves, at level 1 or 0. There are ${free.length} free parameters, ` +
        `${calibrated.length} calibrated and ${free.length - calibrated.length} fixed in advance, against a budget of ` +
        `${FREE_PARAMETER_BUDGET}. The rest come from the literature.`,
    ),
    ...groups,
  );
}

function references(): HTMLElement {
  const details = el('details', 'about-sources');
  const ids = [...usedCitations()].sort((a, b) => CITATIONS[a].short.localeCompare(CITATIONS[b].short));
  details.append(el('summary', undefined, `The ${ids.length} works the ledger cites`));
  const ul = el('ul', 'about-notes');
  for (const id of ids) {
    const c: Citation = CITATIONS[id];
    const li = el('li');
    const authors = c.authors.endsWith('.') ? c.authors : `${c.authors}.`;
    li.append(el('strong', undefined, `${c.short}.`), ` ${authors} ${c.title}. ${c.venue} (${c.year}). `);
    if (c.doi) li.append(link(`doi:${c.doi}`, `https://doi.org/${c.doi}`));
    else if (c.url) li.append(link(c.url, c.url));
    ul.append(li);
  }
  details.append(ul);
  const more = el('p');
  more.append(
    'The same registry generates ',
    link('FIDELITY.md', `${REPOSITORY}/FIDELITY.md`),
    '. The results are in ',
    link('VALIDATION.md', `${REPOSITORY}/VALIDATION.md`),
    ', and every choice, with its reasons, in ',
    link('DECISIONS.md', `${REPOSITORY}/DECISIONS.md`),
    ' and ',
    link('PLAN.md', `${REPOSITORY}/PLAN.md`),
    '.',
  );
  return section('Sources', details, more);
}

export class About {
  readonly dialog: HTMLDialogElement;
  private opener: HTMLElement | null = null;

  constructor(data: WormlightData) {
    const f = countFacts(data);
    this.dialog = el('dialog', 'about');
    this.dialog.setAttribute('aria-labelledby', 'about-title');
    const head = el('header', 'about-head');
    const title = el('h2', undefined, 'About the science');
    title.id = 'about-title';
    const close = el('button', 'about-close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close About the science');
    close.addEventListener('click', () => this.dialog.close());
    head.append(title, close);
    const body = el('div', 'about-body');
    const values = calibratedText(
      freeParams()
        .filter((id) => PARAMS[id].level === 1)
        .map((id): Param => PARAMS[id]),
    );
    body.append(
      paragraph(
        'How well biology supports each part of Wormlight, so you can tell measured fact from informed guess, and ' +
          'what new research would replace. It is kept in the code, as a registry that FIDELITY.md is also made from.',
        'about-lede',
      ),
      paragraph(statusText(values), 'about-status'),
      scale(),
      subsystems(f),
      notes('Biology left out', OMITTED),
      notes('Presentation', PRESENTATION),
      parameters(),
      references(),
    );
    this.dialog.append(head, body);
    // A press on the backdrop, outside the dialog's box, closes it too.
    this.dialog.addEventListener('click', (e) => {
      if (e.target === this.dialog) this.dialog.close();
    });
    this.dialog.addEventListener('close', () => {
      history.replaceState(history.state, '', aboutUrl(location.href, false));
      // Back to what opened it; opened from a link, nothing did, so the keyboard's place goes back to the page.
      if (this.opener) this.opener.focus();
      else if (this.dialog.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
      this.opener = null;
    });
    document.body.append(this.dialog);
  }

  // Open it, the keyboard's place going back to `opener` when it closes.
  open(opener: HTMLElement | null = null): void {
    this.opener = opener;
    if (!this.dialog.open) this.dialog.showModal();
    history.replaceState(history.state, '', aboutUrl(location.href, true));
  }

  // A link-like button that opens it, for a view's header.
  button(): HTMLButtonElement {
    const b = el('button', 'about-open', 'About the science');
    b.type = 'button';
    b.setAttribute('aria-haspopup', 'dialog');
    b.addEventListener('click', () => this.open(b));
    return b;
  }

  remove(): void {
    if (this.dialog.open) this.dialog.close();
    this.dialog.remove();
  }
}
