import type * as THREE from 'three';

export type SoundCategory =
  | 'footstep'
  | 'sprint'
  | 'crouch'
  | 'landing'
  | 'interact'
  | 'door'
  | 'console'
  | 'throw'
  | 'impact'
  | 'voice';

export interface SoundEvent {
  readonly id: string;
  readonly position: THREE.Vector3;
  /** 0..1 nominal loudness before attenuation. */
  readonly loudness: number;
  readonly category: SoundCategory;
  /** Simulation timestamp (seconds). */
  readonly time: number;
  readonly sourceId?: string;
}

export type MonsterStateName =
  | 'patrol'
  | 'investigate'
  | 'searchLastKnown'
  | 'chase'
  | 'searchLost'
  | 'returnToPatrol'
  | 'stunned';

export type Gait = 'idle' | 'crouch' | 'walk' | 'sprint';

export type QualityLevel = 'low' | 'medium' | 'high';

export interface GameEventMap {
  'sound/emit': SoundEvent;
  'monster/state': { readonly from: MonsterStateName; readonly to: MonsterStateName; readonly reason: string };
  'monster/threat': { readonly distance: number; readonly state: MonsterStateName };
  'player/gait': { readonly gait: Gait };
  'player/hidden': { readonly hidden: boolean; readonly lockerId?: string };
  'player/caught': { readonly reason: string };
  'chapter/objective': { readonly stepId: string; readonly text: string; readonly index: number; readonly total: number };
  'chapter/complete': { readonly chapterId: string };
  'game/pause': { readonly reason: string };
  'game/resume': Record<string, never>;
  'settings/changed': {
    readonly mouseSensitivity?: number;
    readonly masterVolume?: number;
    readonly sfxVolume?: number;
    readonly ambienceVolume?: number;
    readonly quality?: QualityLevel;
    readonly reducedMotion?: boolean;
  };
  'audio/blocked': { readonly reason: string };
}