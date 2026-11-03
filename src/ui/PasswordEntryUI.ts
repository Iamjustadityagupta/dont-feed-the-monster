import { DisposableGroup, type Disposable } from '../core/Disposable';
import { el } from './UiKit';

export interface PasswordEntryActions {
  onSubmit: (code: string) => void;
  onClose: () => void;
}

export interface PasswordEntryOptions extends PasswordEntryActions {
  /** Visual digit-slot count only; the real password is never known to this UI. Default 4. */
  maxLength?: number;
}

const KEYPAD_LAYOUT = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'submit'] as const;

/**
 * Numeric keypad overlay for the facility locker. The password itself is
 * never embedded in or known by this UI — it only collects digits and
 * hands the entered code to `onSubmit`; the caller (via GameController /
 * PasswordLocker) decides whether it is correct and calls `reject()` here
 * if not. Owns the keyboard while open so gameplay keys never leak through.
 */
export class PasswordEntryUI implements Disposable {
  readonly root: HTMLDivElement;
  private readonly group = new DisposableGroup();
  private readonly backdrop: HTMLDivElement;
  private readonly modal: HTMLDivElement;
  private readonly closeBtn: HTMLButtonElement;
  private readonly display: HTMLDivElement;
  private readonly digitSlots: HTMLSpanElement[] = [];
  private readonly errorText: HTMLParagraphElement;
  private readonly maxLength: number;

  private buffer = '';
  private visible = false;
  private disposed = false;
  private shakeTimer: number | null = null;
  private errorTimer: number | null = null;

  constructor(private readonly actions: PasswordEntryOptions) {
    this.maxLength = Math.max(1, Math.min(8, actions.maxLength ?? 4));

    this.backdrop = el('div', 'dfm-modal-backdrop') as HTMLDivElement;
    this.backdrop.hidden = true;
    this.backdrop.setAttribute('role', 'dialog');
    this.backdrop.setAttribute('aria-modal', 'true');
    this.backdrop.setAttribute('aria-label', 'Locker keypad');
    this.root = this.backdrop;

    this.modal = el('div', 'dfm-modal dfm-password') as HTMLDivElement;
    const head = el('div', 'dfm-modal-head');
    head.append(el('h2', 'dfm-title', 'Enter Code'));
    this.closeBtn = el('button', 'dfm-modal-close', 'Close') as HTMLButtonElement;
    this.closeBtn.type = 'button';
    this.closeBtn.addEventListener('click', () => this.close());
    head.append(this.closeBtn);

    this.modal.append(head, el('p', 'dfm-sub', 'Facility locker'));

    this.display = el('div', 'dfm-password-display') as HTMLDivElement;
    for (let i = 0; i < this.maxLength; i++) {
      const slot = el('span', 'dfm-password-digit', '');
      slot.dataset.filled = 'false';
      this.digitSlots.push(slot);
      this.display.append(slot);
    }
    this.modal.append(this.display);

    this.errorText = el('p', 'dfm-password-error', 'Incorrect code.') as HTMLParagraphElement;
    this.errorText.dataset.visible = 'false';
    this.errorText.setAttribute('role', 'alert');
    this.modal.append(this.errorText);

    const keypad = el('div', 'dfm-keypad') as HTMLDivElement;
    for (const key of KEYPAD_LAYOUT) {
      const btn = el('button', '', key === 'clear' ? 'Clear' : key === 'submit' ? 'Enter' : key) as HTMLButtonElement;
      btn.type = 'button';
      if (key === 'clear' || key === 'submit') btn.dataset.wide = 'true';
      btn.addEventListener('click', () => this.onKeyTap(key));
      keypad.append(btn);
    }
    this.modal.append(keypad);

    this.backdrop.append(this.modal);

    this.group.addListener(window, 'keydown', this.onKeyDown as EventListener, true);
    this.renderDisplay();
  }

  get isOpen(): boolean {
    return this.visible && !this.disposed;
  }

  show(): void {
    if (this.disposed || this.visible) return;
    this.visible = true;
    this.backdrop.hidden = false;
    document.exitPointerLock?.();
    this.closeBtn.focus({ preventScroll: true });
  }

  hide(): void {
    if (!this.visible) return;
    this.visible = false;
    this.backdrop.hidden = true;
  }

  /** Explicit aliases for the suspend/resume contract (identical to hide/show: the buffer is preserved). */
  suspend(): void {
    this.hide();
  }

  resume(): void {
    this.show();
  }

  /** Clears the entered digits without closing the overlay. */
  clear(): void {
    this.buffer = '';
    this.hideError();
    this.renderDisplay();
  }

  /** Called by the owner when the submitted code was wrong. Clears the buffer and gives visual feedback. */
  reject(message = 'Incorrect code.'): void {
    this.errorText.textContent = message;
    this.errorText.dataset.visible = 'true';
    this.buffer = '';
    this.renderDisplay();
    this.triggerShake();
    if (this.errorTimer !== null) window.clearTimeout(this.errorTimer);
    this.errorTimer = window.setTimeout(() => this.hideError(), 3200);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.visible = false;
    if (this.shakeTimer !== null) window.clearTimeout(this.shakeTimer);
    if (this.errorTimer !== null) window.clearTimeout(this.errorTimer);
    this.group.dispose();
    this.root.remove();
  }

  // -----------------------------------------------------------------------

  private close(): void {
    this.hideError();
    this.actions.onClose();
  }

  private submit(): void {
    if (this.buffer.length === 0) return;
    this.actions.onSubmit(this.buffer);
  }

  private appendDigit(digit: string): void {
    if (this.buffer.length >= this.maxLength) return;
    this.buffer += digit;
    this.renderDisplay();
  }

  private backspace(): void {
    if (this.buffer.length === 0) return;
    this.buffer = this.buffer.slice(0, -1);
    this.renderDisplay();
  }

  private onKeyTap(key: (typeof KEYPAD_LAYOUT)[number]): void {
    if (key === 'clear') this.clear();
    else if (key === 'submit') this.submit();
    else this.appendDigit(key);
  }

  private hideError(): void {
    this.errorText.dataset.visible = 'false';
    if (this.errorTimer !== null) {
      window.clearTimeout(this.errorTimer);
      this.errorTimer = null;
    }
  }

  private triggerShake(): void {
    this.modal.dataset.shake = 'true';
    if (this.shakeTimer !== null) window.clearTimeout(this.shakeTimer);
    this.shakeTimer = window.setTimeout(() => {
      this.modal.dataset.shake = 'false';
      this.shakeTimer = null;
    }, 340);
  }

  private renderDisplay(): void {
    for (let i = 0; i < this.digitSlots.length; i++) {
      const filled = i < this.buffer.length;
      this.digitSlots[i].dataset.filled = String(filled);
      this.digitSlots[i].textContent = filled ? '\u2022' : '';
    }
  }

  /** Owns the keyboard while open: digits/Backspace/Enter/Escape, everything else swallowed before gameplay. */
  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.isOpen) return;
    event.stopImmediatePropagation();

    if (event.repeat && event.key !== 'Backspace') return;

    if (/^[0-9]$/.test(event.key)) {
      event.preventDefault();
      this.appendDigit(event.key);
      return;
    }

    switch (event.key) {
      case 'Backspace':
        event.preventDefault();
        this.backspace();
        break;
      case 'Enter':
        event.preventDefault();
        this.submit();
        break;
      case 'Escape':
        event.preventDefault();
        this.close();
        break;
      default:
        break;
    }
  };
}