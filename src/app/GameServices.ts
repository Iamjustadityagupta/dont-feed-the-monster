import type { EventBus } from '../core/EventBus';
import type { GameStateMachine } from '../core/GameStateMachine';
import type { DisposableStore } from '../core/Disposable';
import type { RendererManager } from '../rendering/RendererManager';
import type { WorldManager } from '../world/WorldManager';
import type { PlayerController } from '../player/PlayerController';
import type { Flashlight } from '../player/Flashlight';
import type { Subject09 } from '../monster/Monster';
import type { GameUI } from '../ui/GameUI';
import type { GameLoop } from './GameLoop';
import type { GameConfig } from './GameConfig';

/** Typed container: every shared system has exactly one owner and is created once in GameBootstrap. */
export interface GameServices {
  readonly config: GameConfig;
  readonly events: EventBus;
  readonly state: GameStateMachine;
  readonly renderer: RendererManager;
  readonly world: WorldManager;
  readonly player: PlayerController;
  readonly flashlight: Flashlight;
  readonly monster: Subject09;
  readonly ui: GameUI;
  readonly loop: GameLoop;
  /** Owns disposal of everything above, in reverse creation order. */
  readonly disposables: DisposableStore;
}
