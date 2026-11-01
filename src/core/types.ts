import type { Group, Object3D, Vector3 } from 'three';

export type GameMode = 'menu' | 'intro' | 'playing' | 'paused' | 'caught' | 'complete' | 'howto';
export type MonsterState = 'PATROL' | 'INVESTIGATE' | 'SEARCH' | 'CHASE' | 'RETURN';
export type SoundKind = 'footstep' | 'throw' | 'door' | 'scripted';

export interface SoundEvent {
  position: Vector3;
  loudness: number;
  kind: SoundKind;
  time: number;
}

export interface HidingSpot {
  mesh: Group;
  position: Vector3;
  occupied: boolean;
  label: string;
}

export type InteractionCategory = 'paper' | 'solid';

export type InteractableKind =
  | 'artifact'
  | 'room_key'
  | 'locked_door'
  | 'keypad_locker'
  | 'keycard'
  | 'escape_part'
  | 'door'
  | 'hiding'
  | 'note';

export interface Interactable {
  id?: string;
  position: Vector3;
  kind: InteractableKind;
  label: string;
  active: boolean;
  mesh: Object3D;
  category: InteractionCategory;
  text?: string;
  clueText?: string;
  clueId?: string;
}