import * as THREE from 'three';

import type {
  HorrorGameHooks,
  MonsterState
} from './GameHooks';
import type { SoundEvent } from '../core/types';

/**
 * Maps existing game systems to the optional feature modules.
 *
 * Required:
 * - camera
 * - monsterObject
 * - getMonsterState
 * - collisionRoots
 * - setPlayerInputEnabled
 * - isGameplayActive
 */
export interface HookSources {
  camera: THREE.PerspectiveCamera;

  playerObject?: THREE.Object3D;

  getPlayerPosition?: () => THREE.Vector3;

  isPlayerHiding?: () => boolean;

  isPlayerSprinting?: () => boolean;

  monsterObject: THREE.Object3D;

  getMonsterState: () => MonsterState;

  collisionRoots: () => THREE.Object3D[];

  setPlayerInputEnabled: (enabled: boolean) => void;

  isGameplayActive: () => boolean;

  onDocumentCollected?: (id: string) => void;

  completeObjective?: (id: string) => void;

  getChapterIndex?: () => number;

  onCaught?: (callback: () => void) => () => void;

  onSoundEvent?: (callback: (event: SoundEvent) => void) => () => void;

  interaction?: HorrorGameHooks['interaction'];
}

export function createHooks(
  sources: HookSources
): HorrorGameHooks {

  if (sources.collisionRoots().length === 0) {
    console.warn(
      '[hooks] collisionRoots() returned 0 meshes. ' +
      'Audio occlusion and paper surface snapping may not work.'
    );
  }

  const getPlayerPosition = (): THREE.Vector3 => {

    if (sources.getPlayerPosition) {
      return sources.getPlayerPosition().clone();
    }

    if (sources.playerObject) {
      return sources.playerObject.getWorldPosition(
        new THREE.Vector3()
      );
    }

    return sources.camera.getWorldPosition(
      new THREE.Vector3()
    );
  };

  return {

    getCamera: () => sources.camera,

    getPlayerPosition,

    getMonsterObject: () => sources.monsterObject,

    getMonsterState: sources.getMonsterState,

    isPlayerHiding:
      sources.isPlayerHiding ?? (() => false),

    isPlayerSprinting:
      sources.isPlayerSprinting ?? (() => false),

    getOccluders: sources.collisionRoots,

    getChapterIndex:
      sources.getChapterIndex ?? (() => 1),

    setPlayerInputEnabled:
      sources.setPlayerInputEnabled,

    isGameplayActive:
      sources.isGameplayActive,

    onDocumentCollected:
      sources.onDocumentCollected ?? (() => {}),

    completeObjective:
      sources.completeObjective ?? (() => {}),

    onCaught: sources.onCaught,

    onSoundEvent: sources.onSoundEvent,

    interaction: sources.interaction
  };
}