
import type { GameMode } from './types';

const TRANSITIONS: Record<GameMode, readonly GameMode[]> = {
  menu: ['howto', 'playing'],
  howto: ['menu', 'playing'],
  playing: ['paused', 'caught', 'complete', 'menu'],
  paused: ['playing', 'menu'],
  caught: ['playing', 'menu'],
  complete: ['playing', 'menu'],
};

export type ModeListener = (to: GameMode, from: GameMode) => void;

export class GameStateMachine {
  private current: GameMode;
  private readonly listeners = new Set<ModeListener>();

  constructor(initial: GameMode = 'menu') {
    this.current = initial;
  }

  get mode(): GameMode {
    return this.current;
  }

  is(...modes: GameMode[]): boolean {
    return modes.includes(this.current);
  }

  canTransition(to: GameMode): boolean {
    return TRANSITIONS[this.current].includes(to);
  }

  transition(to: GameMode): boolean {
    if (!this.canTransition(to)) {
      return false;
    }

    const from = this.current;
    this.current = to;

    for (const listener of [...this.listeners]) {
      try {
        listener(to, from);
      } catch (error) {
        console.error('GameStateMachine listener failed:', error);
      }
    }

    return true;
  }

  onChange(listener: ModeListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  listenerCount(): number {
    return this.listeners.size;
  }
}
