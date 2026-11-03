import { DisposableGroup, type Disposable } from '../core/Disposable';
import { DEFAULT_BINDINGS, describeBindings, type Action } from '../input/InputBindings';
import { button, el, panel, screen } from './UiKit';

const LABELS: Record<Action, string> = {
  forward: 'Move forward',
  back: 'Move back',
  left: 'Strafe left',
  right: 'Strafe right',
  sprint: 'Sprint (loud)',
  crouch: 'Crouch (quiet, low)',
  interact: 'Interact / hide',
  throw: 'Throw distraction',
  flashlight: 'Flashlight',
  pause: 'Pause',
};

export class HowToPlay implements Disposable {
  readonly root: HTMLDivElement;
  private readonly group = new DisposableGroup();
  private readonly backBtn: HTMLButtonElement;

  constructor(onBack: () => void) {
    this.root = screen('How to play');
    const box = panel();
    box.append(el('h2', 'dfm-title', 'Controls'), el('p', 'dfm-sub', 'Keyboard'));

    // Generated from the real bindings so the screen can never drift.
    const bindings = describeBindings(DEFAULT_BINDINGS);
    for (const action of Object.keys(LABELS) as Action[]) {
      const keys = bindings[action]?.join(' / ') ?? '—';
      const row = el('div', 'dfm-row');
      row.append(el('span', undefined, LABELS[action]), el('kbd', undefined, keys));
      box.append(row);
    }

    box.append(el('p', 'dfm-sub', 'Subject 09 hunts by sound and sight. Crouch to stay quiet.'));
    this.backBtn = button('Back', onBack);
    box.append(this.backBtn);
    this.root.append(box);
  }

  show(): void {
    this.root.hidden = false;
    this.backBtn.focus();
  }

  hide(): void {
    this.root.hidden = true;
  }

  dispose(): void {
    this.group.dispose();
    this.root.remove();
  }
}