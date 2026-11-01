const INTRO = `You wake up inside an abandoned underground research facility. Emergency lights flicker across damaged corridors, security doors are locked, and something is moving in the darkness.

You soon discover that a containment failure has released Subject 09, an experimental organism that reacts to sound and movement.

Your only goal seems simple: survive and find a way out. But scattered documents, damaged recordings and classified research files reveal that the disaster may not have been an accident.

Explore the facility, collect evidence, solve environmental puzzles and avoid attracting the creature. Every sound can reveal your position, and every hiding place may not remain safe forever.

The deeper you explore, the more you discover about the people who created this facility—and what they were hiding.

Remember: it hears everything. It remembers everything.`;

export class IntroSequence {
  private element: HTMLDivElement | null = null;

  private timer = 0;
  private done = false;

  private onDone: () => void = () => {};

  play(
    onStart: () => void,
    onFinish: () => void
  ): void {
    if (this.element) return;

    this.done = false;
    onStart();

    const element = document.createElement('div');

    element.style.cssText = `
      position:fixed;
      inset:0;
      z-index:80;
      background:radial-gradient(
        ellipse at center,
        #0b0d0f 0%,
        #040506 72%
      );
      display:flex;
      align-items:center;
      justify-content:center;
      padding:8vh 12vw;
      opacity:0;
      transition:opacity 1.1s
    `;

    const paragraph = document.createElement('p');

    paragraph.style.cssText = `
      max-width:62ch;
      margin:0;
      font:400 clamp(15px,1.55vw,19px)/1.85 Georgia,serif;
      color:#cdc3ad;
      letter-spacing:.012em;
      white-space:pre-wrap;
      text-shadow:0 0 28px #000
    `;

    element.appendChild(paragraph);

    const skip = document.createElement('div');

    skip.textContent = 'ESC — SKIP';

    skip.style.cssText = `
      position:absolute;
      bottom:5vh;
      right:6vw;
      font:600 11px/1 ui-monospace,monospace;
      letter-spacing:.22em;
      color:#5d5648
    `;

    element.appendChild(skip);

    document.body.appendChild(element);

    this.element = element;
    this.onDone = onFinish;

    requestAnimationFrame(() => {
      element.style.opacity = '1';
    });

    window.addEventListener('keydown', this.onKey);

    let index = 0;

    this.timer = window.setInterval(() => {
      index++;

      paragraph.textContent = INTRO.slice(0, index);

      if (index >= INTRO.length) {
        window.clearInterval(this.timer);

        this.timer = window.setTimeout(
          () => this.finish(),
          2600
        );
      }
    }, 16);
  }

  private readonly onKey = (
    event: KeyboardEvent
  ): void => {
    if (
      event.code === 'Escape' ||
      event.code === 'Enter' ||
      event.code === 'Space'
    ) {
      event.preventDefault();
      this.finish();
    }
  };

  private finish(): void {
    if (this.done) return;

    this.done = true;

    window.clearInterval(this.timer);
    window.clearTimeout(this.timer);

    window.removeEventListener('keydown', this.onKey);

    if (this.element) {
      this.element.style.opacity = '0';

      const element = this.element;
      this.element = null;

      window.setTimeout(
        () => element.remove(),
        900
      );
    }

    this.onDone();
  }

  dispose(): void {
    if (this.element) {
      this.finish();
    }

    window.removeEventListener('keydown', this.onKey);
  }
}