
import { DisposableGroup, type Disposable } from '../core/Disposable';
import { el } from './UiKit';
import { InteractionPrompt } from './InteractionPrompt';
import { ObjectivePanel } from './ObjectivePanel';

export interface HudState {
  readonly keycard: boolean;
  readonly hidden: boolean;
  readonly gait: string;
  readonly threat: number;
}

export class HUD implements Disposable {
  readonly root: HTMLDivElement;

  private readonly group = new DisposableGroup();

  readonly objective: ObjectivePanel;
  readonly prompt: InteractionPrompt;

  private readonly status: HTMLDivElement;
  private readonly threat: HTMLDivElement;

  constructor() {
    this.root = el('div', 'dfm-hud');

    this.objective = this.group.add(new ObjectivePanel());
    this.prompt = this.group.add(new InteractionPrompt());

    this.status = el('div', 'dfm-status');
    this.threat = el('div', 'dfm-threat');

    this.threat.dataset.active = 'false';

    this.root.append(
      this.objective.root,
      this.prompt.root,
      this.status,
      this.threat,
    );

    this.root.hidden = true;
  }

  show(): void {
    this.root.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
  }

  update(state: HudState): void {
    const parts: string[] = [
      state.keycard ? 'KEYCARD' : 'NO KEYCARD',
    ];

    if (state.hidden) {
      parts.push('HIDDEN');
    }

    if (state.gait !== 'idle') {
      parts.push(state.gait.toUpperCase());
    }

    this.status.textContent = parts.join(' · ');

    const active = Number.isFinite(state.threat)
      && state.threat > 0.35;

    this.threat.dataset.active = String(active);
    this.threat.textContent = active
      ? 'SUBJECT 09 NEARBY'
      : '';
  }

  dispose(): void {
    this.group.dispose();
    this.root.remove();
  }
}
