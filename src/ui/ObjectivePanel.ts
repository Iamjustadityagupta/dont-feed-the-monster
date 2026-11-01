import { DisposableGroup, type Disposable } from '../core/Disposable';
import { el } from './UiKit';

export class ObjectivePanel implements Disposable {
  readonly root: HTMLDivElement;
  private readonly group = new DisposableGroup();
  private readonly index: HTMLSpanElement;
  private readonly text: HTMLSpanElement;

  constructor() {
    this.root = el('div', 'dfm-objective');
    this.root.setAttribute('role', 'status');
    this.root.setAttribute('aria-live', 'polite');
    this.index = el('span', 'idx', 'OBJECTIVE');
    this.text = el('span');
    this.root.append(this.index, this.text);
    this.root.hidden = true;
  }

  set(text: string, stepIndex: number, total: number): void {
    this.index.textContent = `OBJECTIVE ${stepIndex + 1}/${total}`;
    this.text.textContent = text;
    this.root.hidden = false;
  }

  clear(): void {
    this.text.textContent = '';
    this.root.hidden = true;
  }

  dispose(): void {
    this.group.dispose();
    this.root.remove();
  }
}