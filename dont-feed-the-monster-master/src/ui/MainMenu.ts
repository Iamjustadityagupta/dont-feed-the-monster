
import { DisposableGroup, type Disposable } from '../core/Disposable';
import { button, el, panel, screen } from './UiKit';

export interface MainMenuActions {
  onNewGame: () => void;
  onHowToPlay: () => void;
  onSettings: () => void;
  onCredits?: () => void;
}

export class MainMenu implements Disposable {
  readonly root: HTMLDivElement;
  private readonly group = new DisposableGroup();
  private readonly newGameBtn: HTMLButtonElement;

  constructor(actions: MainMenuActions) {
    this.root = screen('Main menu');

    const box = panel();

    box.append(
      el('h1', 'dfm-title', "Don't Feed The Monster"),
      el('p', 'dfm-sub', 'v0.3 — Chapter 1'),
    );

    this.newGameBtn = button('New game', actions.onNewGame);

    box.append(
      this.newGameBtn,
      button('How to play', actions.onHowToPlay),
      button('Settings', actions.onSettings),
    );

    if (actions.onCredits) {
      box.append(button('Credits', actions.onCredits));
    }

    this.root.append(box);
  }

  show(): void {
    this.root.hidden = false;
    this.newGameBtn.focus();
  }

  hide(): void {
    this.root.hidden = true;
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  dispose(): void {
    this.group.dispose();
    this.root.remove();
  }
}
