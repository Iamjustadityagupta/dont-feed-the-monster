
import type { Disposable } from './Disposable';
import { Logger } from './Logger';

export type Listener<T> = (payload: T) => void;

const log = new Logger({ namespace: 'eventbus' });

export class EventBus<
  M extends object = Record<string, any>,
> implements Disposable {
  private readonly map = new Map<
    keyof M,
    Set<Listener<any>>
  >();

  private _disposed = false;

  get disposed(): boolean {
    return this._disposed;
  }

  on<K extends keyof M>(
    type: K,
    listener: Listener<M[K]>,
  ): () => void {
    if (this._disposed) {
      return () => undefined;
    }

    let listeners = this.map.get(type);

    if (!listeners) {
      listeners = new Set<Listener<any>>();
      this.map.set(type, listeners);
    }

    listeners.add(listener);

    return () => this.off(type, listener);
  }

  once<K extends keyof M>(
    type: K,
    listener: Listener<M[K]>,
  ): () => void {
    let unsubscribe: (() => void) | undefined;

    const wrapped: Listener<M[K]> = (payload) => {
      unsubscribe?.();
      listener(payload);
    };

    unsubscribe = this.on(type, wrapped);
    return unsubscribe;
  }

  off<K extends keyof M>(
    type: K,
    listener: Listener<M[K]>,
  ): void {
    const listeners = this.map.get(type);
    if (!listeners) return;

    listeners.delete(listener);

    if (listeners.size === 0) {
      this.map.delete(type);
    }
  }

  emit<K extends keyof M>(
    type: K,
    payload: M[K],
  ): void {
    if (this._disposed) return;

    const listeners = this.map.get(type);
    if (!listeners) return;

    for (const listener of Array.from(listeners)) {
      try {
        listener(payload);
      } catch (error: unknown) {
        log.error('listener threw', {
          type: String(type),
          error,
        });
      }
    }
  }

  listenerCount(type?: keyof M): number {
    if (type !== undefined) {
      return this.map.get(type)?.size ?? 0;
    }

    let total = 0;

    for (const listeners of this.map.values()) {
      total += listeners.size;
    }

    return total;
  }

  clear(): void {
    this.map.clear();
  }

  dispose(): void {
    if (this._disposed) return;

    this._disposed = true;
    this.map.clear();
  }
}
