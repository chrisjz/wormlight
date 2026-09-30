// What a link held and the app couldn't give (PLAN §1): food it couldn't read, a brain or neurons it lacks, another
// version. One line in the plate's header, or the graph's when it is alone, which can be dismissed; Copy link says
// there, for a few seconds, what a link can't promise. Its text sits in a status region that is in the page from the
// start, so that screen readers announce it when it appears.

export class LinkNote {
  readonly element: HTMLDivElement;
  private readonly text: HTMLParagraphElement;
  private readonly close: HTMLButtonElement;
  // Where the keyboard's place goes when the note is dismissed from its button, or goes while it has it.
  private after: HTMLElement | null = null;
  // When a note shown for a while goes.
  private expiry = 0;

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'link-note';
    this.text = document.createElement('p');
    this.text.className = 'link-note-text';
    this.text.setAttribute('role', 'status');
    this.close = document.createElement('button');
    this.close.type = 'button';
    this.close.className = 'link-note-close';
    this.close.textContent = '×';
    this.close.setAttribute('aria-label', 'Dismiss this note');
    this.close.hidden = true;
    this.close.addEventListener('click', () => this.dismiss());
    this.element.append(this.text, this.close);
  }

  // Put it in a view's header, before `before` or at its end, the keyboard's place going to `after` when it is
  // dismissed.
  mount(parent: HTMLElement, after: HTMLElement | null, before: Node | null = null): void {
    parent.insertBefore(this.element, before);
    this.after = after;
  }

  // Show this text, until dismissed, or for `seconds` if given; the same text again is cleared first, or a screen
  // reader may not announce it twice.
  show(text: string, seconds?: number): void {
    clearTimeout(this.expiry);
    if (seconds !== undefined) this.expiry = window.setTimeout(() => this.dismiss(), seconds * 1000);
    this.close.hidden = false;
    if (this.text.textContent !== text) {
      this.text.textContent = text;
      return;
    }
    this.text.textContent = '';
    setTimeout(() => {
      if (!this.close.hidden) this.text.textContent = text;
    }, 50);
  }

  dismiss(): void {
    clearTimeout(this.expiry);
    const focused = this.close === document.activeElement;
    this.text.textContent = '';
    this.close.hidden = true;
    if (focused && this.after?.isConnected) this.after.focus();
  }
}
