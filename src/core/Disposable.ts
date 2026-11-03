
export interface Disposable {
  dispose(): void;
}

export type DisposeFunction = () => void;

let liveDomListeners = 0;

export function getLiveDomListeners(): number {
  return liveDomListeners;
}

export const toDisposable = (
  fn: DisposeFunction,
): Disposable => {
  let disposed = false;

  return {
    dispose(): void {
      if (disposed) return;
      disposed = true;

      try {
        fn();
      } catch {
        // Cleanup is best-effort.
      }
    },
  };
};

/**
 * Tracks disposable resources and DOM event listeners.
 * Resources are disposed in last-in-first-out order.
 */
export class DisposableGroup implements Disposable {
  private readonly items: Disposable[] = [];
  private _disposed = false;

  get isDisposed(): boolean {
    return this._disposed;
  }

  get disposed(): boolean {
    return this._disposed;
  }

  get size(): number {
    return this.items.length;
  }

  add<T extends Disposable>(item: T): T;
  add(fn: DisposeFunction): Disposable;
  add<T extends Disposable>(
    itemOrFn: T | DisposeFunction,
  ): T | Disposable {
    const item: Disposable =
      typeof itemOrFn === 'function'
        ? toDisposable(itemOrFn)
        : itemOrFn;

    if (this._disposed) {
      item.dispose();
      return itemOrFn as T;
    }

    this.items.push(item);
    return itemOrFn as T;
  }

  addFn(fn: DisposeFunction): Disposable {
    return this.add(fn);
  }

  addListener(
    target: EventTarget,
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): Disposable {
    let active = false;

    const removeOptions =
      typeof options === 'boolean'
        ? options
        : options?.capture ?? false;

    const cleanup = (): void => {
      if (!active) return;
      active = false;

      target.removeEventListener(type, listener, removeOptions);
      liveDomListeners = Math.max(0, liveDomListeners - 1);
    };

    if (this._disposed) {
      return toDisposable(() => undefined);
    }

    target.addEventListener(type, listener, options);
    active = true;
    liveDomListeners += 1;

    return this.add(toDisposable(cleanup));
  }

  dispose(): void {
    if (this._disposed) return;

    this._disposed = true;

    for (let i = this.items.length - 1; i >= 0; i -= 1) {
      try {
        this.items[i].dispose();
      } catch {
        // Continue disposing remaining resources.
      }
    }

    this.items.length = 0;
  }
}

/** Compatibility alias for existing project imports. */
export { DisposableGroup as DisposableStore };
