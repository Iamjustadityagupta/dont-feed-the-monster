import { DisposableGroup, type Disposable } from '../core/Disposable';
import { el } from './UiKit';

/**
 * State of a single objective stage in a multi-step puzzle/chapter sequence.
 */
export type ObjectiveStageState = 'completed' | 'active' | 'locked';

/**
 * A single stage entry. `text` is the concise objective description for
 * this stage (e.g. "Find the rusted key", "Combine the fragments").
 *
 * IMPORTANT: for stages passed with state === 'locked', `text` is NOT
 * rendered by this panel — a generic placeholder is shown instead, so
 * locked stage text (which may contain key locations / password clues)
 * is never revealed in the DOM before the player reaches that stage.
 * Callers may still pass the real text for locked stages (e.g. for
 * internal bookkeeping / future reveal) without risk of it leaking.
 */
export interface ObjectiveStage {
  text: string;
  state: ObjectiveStageState;
}

const LOCKED_PLACEHOLDER = '???';

export class ObjectivePanel implements Disposable {
  readonly root: HTMLDivElement;
  private readonly group = new DisposableGroup();
  private readonly index: HTMLSpanElement;
  private readonly text: HTMLSpanElement;
  private readonly stageList: HTMLUListElement;

  constructor() {
    this.root = el('div', 'dfm-objective');
    this.root.setAttribute('role', 'status');
    this.root.setAttribute('aria-live', 'polite');
    this.index = el('span', 'idx', 'OBJECTIVE');
    this.text = el('span');
    this.root.append(this.index, this.text);

    this.stageList = el('ul', 'dfm-objective-stages') as HTMLUListElement;
    this.stageList.hidden = true;
    this.root.append(this.stageList);

    this.root.hidden = true;
  }

  /**
   * Existing generic API — unchanged. Shows a single current objective
   * line with a simple "N/total" counter.
   */
  set(text: string, stepIndex: number, total: number): void {
    this.index.textContent = `OBJECTIVE ${stepIndex + 1}/${total}`;
    this.text.textContent = text;
    this.root.hidden = false;
  }

  /**
   * Renders a full staged progression list (completed / active / locked)
   * below the existing header. Does not alter the existing header's
   * behaviour or styling; callers can use set() and setStages() together
   * (e.g. set() for the short current-objective summary, setStages() for
   * the detailed breakdown) or setStages() alone.
   *
   * Progress counts shown in the header (if `updateHeader` is true, the
   * default) are derived accurately from the stage array itself, so the
   * displayed "N/total" always matches the actual completed count rather
   * than a caller-supplied index that could drift out of sync.
   */
  setStages(stages: readonly ObjectiveStage[], updateHeader = true): void {
    this.stageList.textContent = '';

    const completedCount = stages.filter((s) => s.state === 'completed').length;
    const activeStage = stages.find((s) => s.state === 'active');

    for (const stage of stages) {
      const item = el('li', `dfm-objective-stage dfm-objective-stage--${stage.state}`) as HTMLLIElement;

      const marker = el('span', 'dfm-objective-stage-marker');
      marker.textContent =
        stage.state === 'completed' ? '✓' : stage.state === 'active' ? '➤' : '●';

      const label = el('span', 'dfm-objective-stage-label');
      label.textContent = stage.state === 'locked' ? LOCKED_PLACEHOLDER : stage.text;

      item.append(marker, label);
      this.stageList.append(item);
    }

    this.stageList.hidden = stages.length === 0;

    if (updateHeader) {
      this.index.textContent = `OBJECTIVE ${Math.min(completedCount + 1, stages.length)}/${stages.length}`;
      this.text.textContent = activeStage
        ? activeStage.text
        : completedCount >= stages.length && stages.length > 0
          ? 'All objectives complete'
          : '';
    }

    this.root.hidden = false;
  }

  /**
   * Clears only the staged list, leaving the simple header (set()/clear())
   * behaviour untouched.
   */
  clearStages(): void {
    this.stageList.textContent = '';
    this.stageList.hidden = true;
  }

  clear(): void {
    this.text.textContent = '';
    this.clearStages();
    this.root.hidden = true;
  }

  dispose(): void {
    this.group.dispose();
    this.root.remove();
  }
}