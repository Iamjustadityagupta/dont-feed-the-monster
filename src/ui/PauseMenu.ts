import { DisposableGroup, type Disposable } from '../core/Disposable';
import { button, el, panel, screen } from './UiKit';

export interface PauseMenuActions {
  onResume: () => void;
  onRestart: () => void;
  onSettings: () => void;
  onMainMenu: () => void;
}

export class PauseMenu implements Disposable {
  readonly root: HTMLDivElement;
  private readonly group = new DisposableGroup();
  private readonly resumeBtn: HTMLButtonElement;

  constructor(actions: PauseMenuActions) {
    this.root = screen('Paused');
    const box = panel();
    box.append(el('h2', 'dfm-title', 'Paused'));
    this.resumeBtn = button('Resume', actions.onResume);
    box.append(
      this.resumeBtn,
      button('Restart chapter', actions.onRestart),
      button('Settings', actions.onSettings),
      button('Main menu', actions.onMainMenu),
    );
    this.root.append(box);
  }

  show(): void {
    this.root.hidden = false;
    this.resumeBtn.focus();
  }

  hide(): void {
    this.root.hidden = true;
  }

  dispose(): void {
    this.group.dispose();
    this.root.remove();
  }
}