// What a link held and the app couldn't give (PLAN §1): food it couldn't read, a brain or neurons it lacks, another
// version. One line in the plate's header, or the graph's when it is alone, whose Details unfold the whole of it,
// and which can be dismissed. The line sits in a status region that is in the page from the start, so that screen
// readers announce it when it appears.

// The note's line, from what the link held: a part the app couldn't read, and another version it names. Its short
// form, for a short pane, names the version first, as what may change how the worm behaves.
export interface Summary {
  long: string;
  short: string;
}

export function linkSummary(unreadable: boolean, other: boolean): Summary | null {
  if (unreadable && other)
    return {
      long: "This link was made with another version, and part of it couldn't be read.",
      short: 'Link from another version.',
    };
  if (unreadable) return { long: "Part of this link couldn't be read.", short: 'Link partly unreadable.' };
  if (other) return { long: 'This link was made with another version.', short: 'Link from another version.' };
  return null;
}

let made = 0;

export class LinkNote {
  readonly element: HTMLDivElement;
  private readonly summary: HTMLParagraphElement;
  private readonly toggle: HTMLButtonElement;
  private readonly close: HTMLButtonElement;
  private readonly details: HTMLParagraphElement;
  // Where the keyboard's place goes when the note is dismissed.
  private after: HTMLElement | null = null;

  constructor() {
    const button = (className: string, text: string): HTMLButtonElement => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = className;
      b.textContent = text;
      return b;
    };
    this.element = document.createElement('div');
    this.element.className = 'link-note';
    const line = document.createElement('div');
    line.className = 'link-note-line';
    this.summary = document.createElement('p');
    this.summary.className = 'link-note-text';
    this.summary.setAttribute('role', 'status');
    this.toggle = button('link-note-more', 'Details');
    this.toggle.setAttribute('aria-expanded', 'false');
    this.close = button('link-note-close', '×');
    this.close.setAttribute('aria-label', 'Dismiss this note');
    this.details = document.createElement('p');
    this.details.className = 'link-note-details';
    this.details.id = `link-note-details-${++made}`;
    this.details.hidden = true;
    this.toggle.setAttribute('aria-controls', this.details.id);
    this.toggle.addEventListener('click', () => {
      const open = this.details.hidden;
      this.details.hidden = !open;
      this.toggle.setAttribute('aria-expanded', String(open));
    });
    this.close.addEventListener('click', () => {
      this.dismiss();
      if (this.after?.isConnected) this.after.focus();
    });
    this.toggle.hidden = true;
    this.close.hidden = true;
    line.append(this.summary, this.toggle, this.close);
    this.element.append(line, this.details);
  }

  // Put it in a view's header, before `before` or at its end, the keyboard's place going to `after` when it is
  // dismissed.
  mount(parent: HTMLElement, after: HTMLElement | null, before: Node | null = null): void {
    parent.insertBefore(this.element, before);
    this.after = after;
  }

  // Show a line, in a long form and a short one, as the plate's other text is, and the whole of it folded beneath.
  show(summary: Summary, details: string): void {
    this.element.classList.add('link-note-shown');
    const form = (className: string, text: string): HTMLSpanElement => {
      const span = document.createElement('span');
      span.className = className;
      span.textContent = text;
      return span;
    };
    this.summary.replaceChildren(form('form-long', summary.long), form('form-short', summary.short));
    this.details.textContent = details;
    this.toggle.hidden = false;
    this.close.hidden = false;
  }

  dismiss(): void {
    this.element.classList.remove('link-note-shown');
    this.summary.textContent = '';
    this.details.textContent = '';
    this.details.hidden = true;
    this.toggle.setAttribute('aria-expanded', 'false');
    this.toggle.hidden = true;
    this.close.hidden = true;
  }
}
