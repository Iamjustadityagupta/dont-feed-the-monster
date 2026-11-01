import { DisposableGroup, type Disposable } from '../core/Disposable';
import { el } from './UiKit';

export class InteractionPrompt implements Disposable {
  readonly root: HTMLDivElement;
  private readonly group = new DisposableGroup();
  private readonly label: HTMLSpanElement;
  private currentKey = '';

  constructor() {
    this.root = el('div', 'dfm-prompt');
    this.root.setAttribute('role', 'status');
    this.root.setAttribute('aria-live', 'polite');
    this.label = el('span');
    const key = el('kbd', undefined, 'E');
    this.root.append(key, document.createTextNode(' '), this.label);
    this.root.hidden = true;
  }

  show(label: string, key = 'E'): void {
    const signature = `${key}|${label}`;
    if (signature !== this.currentKey) {
      this.currentKey = signature;
      const kbd = this.root.querySelector('kbd');
      if (kbd) kbd.textContent = key;
      this.label.textContent = label;
    }
    this.root.hidden = false;
  }

  hide(): void {
    if (this.root.hidden) return;
    this.currentKey = '';
    this.root.hidden = true;
  }

  dispose(): void {
    this.group.dispose();
    this.root.remove();
  }
}