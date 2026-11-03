import { DisposableGroup, type Disposable } from '../core/Disposable';
import { button, el, panel, screen } from './UiKit';

/** Honest end card: states the monitor beat without claiming a live feed. */
export class ChapterCompleteScreen implements Disposable {
  readonly root: HTMLDivElement;
  private readonly group = new DisposableGroup();
  private readonly againBtn: HTMLButtonElement;

  constructor(endingText: string, onReplay: () => void, onMainMenu: () => void) {
    this.root = screen('Chapter complete');
    const box = panel();
    box.append(
      el('h2', 'dfm-title', 'Chapter 1 complete'),
      el('p', 'dfm-sub', 'Containment'),
      el('p', undefined, endingText),
    );
    this.againBtn = button('Replay chapter', onReplay);
    box.append(this.againBtn, button('Main menu', onMainMenu));
    this.root.append(box);
  }

  show(): void {
    this.root.hidden = false;
    this.againBtn.focus();
  }

  hide(): void {
    this.root.hidden = true;
  }

  dispose(): void {
    this.group.dispose();
    this.root.remove();
  }
}