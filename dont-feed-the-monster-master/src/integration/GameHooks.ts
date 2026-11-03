import * as THREE from 'three';
import type { SoundEvent } from '../core/types';

export type MonsterState =
  | 'idle'
  | 'patrol'
  | 'searching'
  | 'chasing'
  | 'lost';

export interface HorrorGameHooks {
  getMonsterState(): MonsterState;

  getMonsterObject(): THREE.Object3D;

  getCamera(): THREE.PerspectiveCamera;

  getPlayerPosition(): THREE.Vector3;

  isPlayerHiding(): boolean;

  isPlayerSprinting(): boolean;

  getOccluders(): THREE.Object3D[];

  getChapterIndex(): number;

  setPlayerInputEnabled(enabled: boolean): void;

  isGameplayActive(): boolean;

  onDocumentCollected(id: string): void;

  completeObjective(id: string): void;

  /**
   * Optional: subscribe to the moment the player is caught, so audio can
   * react (scream + duck) the instant it happens rather than waiting for
   * the next monster-state read. Returns an unsubscribe function.
   */
  onCaught?(callback: () => void): () => void;

  /**
   * Optional: subscribe to the game's raw noise events (footsteps, doors,
   * thrown objects — the same ones the monster's own hearing uses) so audio
   * can react to a loud noise landing near the monster. Returns an
   * unsubscribe function.
   */
  onSoundEvent?(callback: (event: SoundEvent) => void): () => void;

  interaction?: {
    register(
      mesh: THREE.Object3D,
      config: {
        prompt: string;
        radius: number;
        onInteract: () => void;
      }
    ): () => void;
  };
}

export interface FeatureHandle {
  update(deltaTime: number): void;

  render(): void;

  resize(width: number, height: number): void;

  dispose(): void;
}