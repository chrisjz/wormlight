// "About the science" (spec §1.3): the fidelity ledger in the app, from the same registry as FIDELITY.md, in a dialog
// over the views. It opens with where the project stands (the status FIDELITY.md opens with), then the scale, each
// subsystem's levels with what is solid and what isn't, its components folded beneath it, the biology left out, the
// presentation's choices, what the model is tested and tuned against, the parameters, folded by group, what a link
// carries and can't promise, with the versions running, and the sources. `?about=science` opens it from a link, and
// the URL says so while it is open.

import type { WormlightData } from '../data/schema.ts';
import { CITATIONS, type Citation, type CitationId } from '../science/citations.ts';
import { countFacts, type Facts } from '../science/facts.ts';
import { COMPONENTS, OMITTED, PRESENTATION, render, SUBSYSTEMS, type SubsystemId } from '../science/fidelity.ts';
import {
  checkpoints,
  formatValue,
  ledgerStatus,
  levelsText,
  PARAM_GROUPS,
  paramNote,
  subsystemRange,
  testedByText,
  tokens,
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
import { CALIBRATION_TARGETS, REFERENCE_DATA } from '../science/validation.ts';
import { aboutUrl, type Versions } from './params.ts';

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

// A link that opens in a new tab, and says so to assistive technology, so the ledger stays open behind it.
function link(text: string, href: string): HTMLAnchorElement {
  const a = el('a', undefined, text);
  a.href = href;
  a.rel = 'noopener';
  a.target = '_blank';
  a.append(el('span', 'sr-only', ' (opens in a new tab)'));
  return a;
}

// The registry's text, in its three marks, as nodes (tokens in src/science/ledger.ts).
function marks(text: string): Node[] {
  return tokens(text).map(({ mark, text: t }) =>
    mark === 'text' ? document.createTextNode(t) : el(mark === 'em' ? 'i' : mark, undefined, t),
  );
}

const paragraph = (text: string, className?: string): HTMLParagraphElement => {
  const p = el('p', className);
  p.append(...marks(text));
  return p;
};

// A level, a range of them or a tag, as the inspector's badges show one: its face hidden from assistive technology,
// which hears what it means instead.
function levelBadge(levels: string): HTMLElement {
  const top = levels.match(/\d/)?.[0];
  const b = el('span', `badge about-level${top ? ` badge-${top}` : ''}`);
  const face = el('span', 'badge-level', levels);
  face.setAttribute('aria-hidden', 'true');
  const range = levels.split(/[–/]/).map((l) => l.trim());
  const spoken =
    levels === '—'
      ? 'Omitted:'
      : levels === '◇'
        ? 'Presentation:'
        : range.length === 1
          ? `Level ${range[0]}:`
          : levels.includes('–')
            ? `Levels ${range[0]} to ${range[1]}:`
            : `Levels ${range.join(', ')}:`;
  b.append(face, el('span', 'sr-only', spoken));
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

function folded(summary: string, ...children: Node[]): HTMLDetailsElement {
  const details = el('details');
  details.append(el('summary', undefined, summary), ...children);
  return details;
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
    const upgrade = render(s.upgrade, f);
    article.append(
      heading,
      facts([
        ["What's solid", render(s.solid, f)],
        ["What isn't", render(s.notSolid, f)],
        ['What would raise it', upgrade === '—' ? '' : upgrade],
      ]),
    );
    const parts = COMPONENTS.filter((c) => c.subsystem === id);
    if (parts.length > 0) {
      const details = folded(`Its ${parts.length === 1 ? 'component' : `${parts.length} components`}`);
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
  return section(
    'Subsystem by subsystem',
    paragraph(
      '"Tested by" lists the checks planned for each part; only checkpoints 0 and 1 and the sensitivity runs have run.',
    ),
    ...items,
  );
}

function notes(title: string, list: readonly { text: string; sources: readonly CitationId[] }[]): HTMLElement {
  const ul = el('ul', 'about-notes');
  for (const item of list) {
    const li = el('li');
    li.append(...marks(item.text));
    if (item.sources.length > 0) li.append(' (', ...sources(item.sources), ')');
    ul.append(li);
  }
  return section(title, ul);
}

// What the calibrated parameters are tuned against, and the data the checkpoints are measured against.
function testedAgainst(): HTMLElement {
  const targets = el('ul', 'about-notes');
  for (const t of CALIBRATION_TARGETS) {
    const li = el('li');
    li.append(el('strong', undefined, `${t.target}.`), ' ', ...marks(t.use), ' (', ...sources(t.sources), ')');
    targets.append(li);
  }
  const reference = el('ul', 'about-notes');
  for (const r of REFERENCE_DATA) {
    const li = el('li');
    li.append(
      el('strong', undefined, `${checkpoints(r.checkpoints)}.`),
      ' ',
      ...marks(r.use),
      ' (',
      ...sources(r.sources),
      ')',
    );
    reference.append(li);
  }
  return section(
    'What it is tuned and tested against',
    paragraph(
      'The calibrated parameters, at level 1, are tuned against the targets below and nothing else; the checkpoints ' +
        'after checkpoint 1 are held out, run with the parameters frozen.',
    ),
    folded(`The calibration's ${CALIBRATION_TARGETS.length} targets`, targets),
    folded(`The checkpoints' reference data (${REFERENCE_DATA.length})`, reference),
  );
}

function parameters(): HTMLElement {
  const free = freeParams();
  const calibrated = free.filter((id) => PARAMS[id].level === 1);
  const groups = (Object.keys(PARAM_GROUPS) as Subsystem[]).map((group) => {
    const ids = (Object.keys(PARAMS) as ParamId[]).filter((id) => PARAMS[id].subsystem === group);
    const details = folded(`${PARAM_GROUPS[group]} (${ids.length})`);
    for (const id of ids) {
      const p: Param = PARAMS[id];
      const entry = el('div', 'about-component');
      const name = el('h5');
      name.append(levelBadge(String(p.level)), ` ${p.name} `, el('code', undefined, p.symbol));
      entry.append(
        name,
        facts([
          ['Value', `${formatValue(p)}${p.unit ? ` ${p.unit}` : ''}`],
          ['Notes', paramNote(p)],
          ['What would raise it', p.upgrade],
          ['Sources', sources(p.sources)],
        ]),
      );
      details.append(entry);
    }
    return details;
  });
  return section(
    'Parameters',
    paragraph(
      `A parameter is free when we set it ourselves, at level 1 or 0. There are ${free.length} free parameters, ` +
        `${calibrated.length} calibrated and ${free.length - calibrated.length} fixed in advance, against a budget of ` +
        `${FREE_PARAMETER_BUDGET}. The rest are taken from the literature or adapted from it, at levels 2 to 5.`,
    ),
    ...groups,
  );
}

function references(): HTMLElement {
  // In the order FIDELITY.md lists them.
  const ids = [...usedCitations()].sort((a, b) =>
    CITATIONS[a].short < CITATIONS[b].short ? -1 : CITATIONS[a].short > CITATIONS[b].short ? 1 : 0,
  );
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
  return section('Sources', folded(`The ${ids.length} works the ledger cites`, ul), more);
}

// What a link to the app carries and can't promise, and the versions running (PLAN §1).
function links(versions: Versions): HTMLElement {
  return section(
    'Sharing a link',
    paragraph(
      "A link to the app sets up its experiment afresh: the food on the dish, the worm's seed, the brain and any " +
        'lesions, with the versions of the model and data it was made with. The app runs model version ' +
        `${versions.model} on data version ${versions.data}; a link from another version runs on these, and the app ` +
        'says so.',
    ),
    paragraph(
      "On another GPU the worm's path can differ, though the setup is the same: GPUs may compute the same arithmetic " +
        "differently in its last bits, and the worm's dynamics amplify the difference.",
    ),
  );
}

export class About {
  readonly dialog: HTMLDialogElement;
  private opener: HTMLElement | null = null;

  constructor(data: WormlightData, versions: Versions) {
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
    // The body takes the keyboard's place on opening, at the top of what there is to read, so Space and the arrows
    // scroll it rather than pressing Close.
    const body = el('div', 'about-body');
    body.tabIndex = -1;
    body.autofocus = true;
    body.append(
      paragraph(
        'How well biology supports each part of Wormlight, so you can tell measured fact from informed guess, and ' +
          'what new research would replace. It is kept in the code, as a registry that FIDELITY.md is also made from.',
        'about-lede',
      ),
      paragraph(ledgerStatus(), 'about-status'),
      scale(),
      subsystems(f),
      notes('Biology left out', OMITTED),
      notes('Presentation', PRESENTATION),
      testedAgainst(),
      parameters(),
      links(versions),
      references(),
    );
    this.dialog.append(head, body);
    // A press and a release both on the backdrop, outside the dialog's box, close it; a drag across its edge, as when
    // selecting text, does not.
    const outside = (e: MouseEvent): boolean => {
      const r = this.dialog.getBoundingClientRect();
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    };
    let fromBackdrop = false;
    this.dialog.addEventListener('pointerdown', (e) => {
      fromBackdrop = e.target === this.dialog && outside(e);
    });
    this.dialog.addEventListener('click', (e) => {
      if (fromBackdrop && e.target === this.dialog && outside(e)) this.dialog.close();
      fromBackdrop = false;
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

  // Open it, the keyboard's place going back to `opener` when it closes. Already open, it keeps the opener it has.
  open(opener: HTMLElement | null = null): void {
    if (this.dialog.open) return;
    this.opener = opener;
    this.dialog.showModal();
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
