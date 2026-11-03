
import * as THREE from 'three';
import { publicUrl } from './threecompat';

export type SoundId =
  | 'step_monster_far'
  | 'step_monster_near'
  | 'step_monster_chase'
  | 'breath_close'
  | 'breath_heavy'
  | 'growl_low'
  | 'growl_aggressive'
  | 'roar_detect'
  | 'scratch_loop'
  | 'sniff_loop'
  | 'heartbeat'
  | 'amb_room_tone'
  | 'amb_vent'
  | 'amb_electrical'
  | 'sfx_metal_creak'
  | 'sfx_distant_impact'
  | 'sfx_door_slam'
  | 'sting_detect'
  | 'sting_lost'
  | 'sting_caught'
  | 'whisper_close';

export interface SoundDef {
  id: SoundId;
  url: string;
  loop: boolean;
  positional: boolean;
  baseVolume: number;
  cadence?: [number, number];
  refDistance?: number;
  maxDistance?: number;
  rolloff?: number;
}

const D = publicUrl('Audio/');

export const SOUND_MANIFEST: readonly SoundDef[] = [
  {
    id: 'step_monster_far',
    url: D + 'monster_step_far_01.wav',
    loop: false,
    positional: true,
    baseVolume: 0.9,
    cadence: [0.72, 1.05],
    refDistance: 3,
    maxDistance: 34,
    rolloff: 1.4
  },
  {
    id: 'step_monster_near',
    url: D + 'monster_step_near_01.wav',
    loop: false,
    positional: true,
    baseVolume: 1.0,
    cadence: [0.55, 0.75],
    refDistance: 2,
    maxDistance: 18,
    rolloff: 1.7
  },
  {
    id: 'step_monster_chase',
    url: D + 'monster_step_chase_01.wav',
    loop: false,
    positional: true,
    baseVolume: 1.0,
    cadence: [0.22, 0.32],
    refDistance: 2,
    maxDistance: 22,
    rolloff: 1.5
  },
  {
    id: 'breath_close',
    url: D + 'monster_breath_close.wav',
    loop: true,
    positional: true,
    baseVolume: 0.75,
    refDistance: 2.2,
    maxDistance: 12,
    rolloff: 1.8
  },
  {
    id: 'breath_heavy',
    url: D + 'monster_breath_heavy.wav',
    loop: true,
    positional: true,
    baseVolume: 0.95,
    refDistance: 1.6,
    maxDistance: 9,
    rolloff: 2.0
  },
  {
    id: 'growl_low',
    url: D + 'monster_growl_low.wav',
    loop: true,
    positional: true,
    baseVolume: 0.7,
    refDistance: 2.5,
    maxDistance: 14,
    rolloff: 1.6
  },
  {
    id: 'growl_aggressive',
    url: D + 'monster_growl_aggro.wav',
    loop: true,
    positional: true,
    baseVolume: 0.9,
    refDistance: 2,
    maxDistance: 20,
    rolloff: 1.3
  },
  {
    id: 'roar_detect',
    url: D + 'monster_roar_detect.wav',
    loop: false,
    positional: true,
    baseVolume: 1.0,
    refDistance: 4,
    maxDistance: 40,
    rolloff: 1.1
  },
  {
    id: 'scratch_loop',
    url: D + 'monster_scratch.wav',
    loop: true,
    positional: true,
    baseVolume: 0.85,
    refDistance: 1.5,
    maxDistance: 7,
    rolloff: 2.2
  },
  {
    id: 'sniff_loop',
    url: D + 'monster_sniff.wav',
    loop: true,
    positional: true,
    baseVolume: 0.7,
    refDistance: 1.4,
    maxDistance: 6,
    rolloff: 2.2
  },
  {
    id: 'heartbeat',
    url: D + 'player_heartbeat.wav',
    loop: true,
    positional: false,
    baseVolume: 1.0
  },
  {
    id: 'amb_room_tone',
    url: D + 'amb_room_tone.wav',
    loop: true,
    positional: false,
    baseVolume: 0.5
  },
  {
    id: 'amb_vent',
    url: D + 'amb_vent_loop.wav',
    loop: true,
    positional: true,
    baseVolume: 0.5,
    refDistance: 2,
    maxDistance: 10,
    rolloff: 1.5
  },
  {
    id: 'amb_electrical',
    url: D + 'amb_electrical_hum.wav',
    loop: true,
    positional: true,
    baseVolume: 0.4,
    refDistance: 1.5,
    maxDistance: 7,
    rolloff: 1.8
  },
  {
    id: 'sfx_metal_creak',
    url: D + 'sfx_metal_creak_01.wav',
    loop: false,
    positional: true,
    baseVolume: 0.6,
    cadence: [9, 22],
    refDistance: 4,
    maxDistance: 26,
    rolloff: 1.4
  },
  {
    id: 'sfx_distant_impact',
    url: D + 'sfx_distant_impact_01.wav',
    loop: false,
    positional: true,
    baseVolume: 0.55,
    cadence: [14, 34],
    refDistance: 6,
    maxDistance: 40,
    rolloff: 1.1
  },
  {
    id: 'sfx_door_slam',
    url: D + 'sfx_door_slam_01.wav',
    loop: false,
    positional: true,
    baseVolume: 0.8,
    refDistance: 5,
    maxDistance: 30,
    rolloff: 1.3
  },
  /*
   * Jump-scare / state-transition stingers.
   * Non-positional (attached straight to the listener) so the hit reads
   * the same everywhere on screen, the way Granny/Kamla-style "it saw you"
   * cues do. If the asset is missing, HorrorAudioDirector synthesises a
   * procedural stand-in via ProceduralHorrorSynth so this cue is never silent.
   */
  {
    id: 'sting_detect',
    url: D + 'sting_detect_01.wav',
    loop: false,
    positional: false,
    baseVolume: 1.0
  },
  {
    id: 'sting_lost',
    url: D + 'sting_lost_01.wav',
    loop: false,
    positional: false,
    baseVolume: 0.6
  },
  {
    id: 'sting_caught',
    url: D + 'sting_caught_01.wav',
    loop: false,
    positional: false,
    baseVolume: 1.0
  },
  {
    id: 'whisper_close',
    url: D + 'monster_whisper_close.wav',
    loop: true,
    positional: true,
    baseVolume: 0.55,
    refDistance: 1.2,
    maxDistance: 5,
    rolloff: 2.4
  }
];

export class SoundBank {
  readonly missing: SoundId[] = [];

  private readonly buffers = new Map<SoundId, AudioBuffer>();
  private loaded = false;

  constructor(
    _listener: THREE.AudioListener
  ) {}

  async load(
    onProgress?: (done: number, total: number) => void
  ): Promise<void> {
    if (this.loaded) return;

    const loader = new THREE.AudioLoader();
    let done = 0;

    await Promise.all(
      SOUND_MANIFEST.map(async (def) => {
        try {
          const buffer = await loader.loadAsync(def.url);
          this.buffers.set(def.id, buffer);
        } catch {
          this.missing.push(def.id);

          console.warn(
            `[audio] MISSING ASSET (voice stays silent): ${def.url}`
          );
        } finally {
          done++;
          onProgress?.(done, SOUND_MANIFEST.length);
        }
      })
    );

    this.loaded = true;
  }

  get(id: SoundId): AudioBuffer | undefined {
    return this.buffers.get(id);
  }

  has(id: SoundId): boolean {
    return this.buffers.has(id);
  }

  def(id: SoundId): SoundDef {
    const definition = SOUND_MANIFEST.find(
      (item) => item.id === id
    );

    if (!definition) {
      throw new Error(`Unknown sound ID: ${id}`);
    }

    return definition;
  }
}

