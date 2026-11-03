import { DisposableGroup, type Disposable } from '../core/Disposable';
import { button, el, panel, screen } from './UiKit';

export class CaughtScreen implements Disposable {
  readonly root: HTMLDivElement;
  private readonly group = new DisposableGroup();
  private readonly retryBtn: HTMLButtonElement;

  constructor(onRetry: () => void, onMainMenu: () => void) {
    this.root = screen('Caught');
    const box = panel();
    box.append(
      el('h2', 'dfm-title', 'Caught'),
      el('p', 'dfm-sub', 'Subject 09 found you.'),
    );
    this.retryBtn = button('Retry chapter', onRetry);
    box.append(this.retryBtn, button('Main menu', onMainMenu));
    this.root.append(box);
  }

  show(): void {
    this.root.hidden = false;
    this.retryBtn.focus();
  }

  hide(): void {
    this.root.hidden = true;
  }

  dispose(): void {
    this.group.dispose();
    this.root.remove();
  }
}