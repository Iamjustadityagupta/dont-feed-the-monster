import { DisposableGroup, type Disposable } from '../core/Disposable';
import { Logger } from '../core/Logger';

export interface PointerLockOptions {
  element: HTMLElement;
  onAcquired?: () => void;
  onReleased?: () => void;
  onDenied?: (reason: string) => void;
}

/**
 * Wraps the pointer-lock API. Denial is never fatal: the game stays playable
 * and the caller can fall back to a click-to-look mode.
 */
export class PointerLockManager implements Disposable {
  private readonly log = new Logger({ namespace: 'pointerlock' });
  private readonly group = new DisposableGroup();
  private readonly element: HTMLElement;
  private readonly options: PointerLockOptions;
  private _locked = false;
  private _denied = false;

  constructor(options: PointerLockOptions) {
    this.element = options.element;
    this.options = options;

    const onChange = () => {
      const locked = document.pointerLockElement === this.element;
      if (locked === this._locked) return;
      this._locked = locked;
      if (locked) this.options.onAcquired?.();
      else this.options.onReleased?.();
    };
    const onError = () => {
      this._denied = true;
      this.log.warnOnce('lock-error', 'pointer lock denied; falling back to unlocked look');
      this.options.onDenied?.('denied');
    };

    document.addEventListener('pointerlockchange', onChange);
    document.addEventListener('pointerlockerror', onError);
    this.group.addFn(() => {
      document.removeEventListener('pointerlockchange', onChange);
      document.removeEventListener('pointerlockerror', onError);
    });
  }

  get locked(): boolean {
    return this._locked;
  }

  get denied(): boolean {
    return this._denied;
  }

  /** Must be called from a user gesture. */
  request(): void {
    if (this._locked) return;
    const request = this.element.requestPointerLock?.bind(this.element);
    if (!request) {
      this._denied = true;
      this.options.onDenied?.('unsupported');
      return;
    }
    try {
      const result = request() as unknown;
      if (result instanceof Promise) {
        result.catch(() => {
          this._denied = true;
          this.options.onDenied?.('rejected');
        });
      }
    } catch {
      this._denied = true;
      this.options.onDenied?.('threw');
    }
  }

  release(): void {
    if (document.pointerLockElement === this.element) document.exitPointerLock();
  }

  dispose(): void {
    this.release();
    this.group.dispose();
  }
}