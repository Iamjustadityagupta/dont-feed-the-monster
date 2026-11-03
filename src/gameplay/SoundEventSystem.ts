import * as THREE from 'three';
import { Logger } from '../core/Logger';
import type { SoundEvent } from '../core/types';

export interface SoundEventOptions {
  maxEvents?: number;
  lifetimeSeconds?: number;
}

/**
 * Tracks the real in-world noise events the game already emits (footsteps,
 * doors, thrown distractions — see PlayerController's `events.emit('sound', ...)`
 * calls, which is the same channel Subject09 listens to for its hearing).
 *
 * This gives HorrorAudioDirector a read-only window onto "something loud just
 * happened near the monster", so it can react with an audio cue (a startled
 * growl, a stinger) on the same tick the noise lands, rather than waiting a
 * frame or two for the monster's own state to catch up. Call `ingest()` from
 * wherever the EventBus 'sound' events are received and `prune()` once per tick.
 */
export class SoundEventSystem {
  private readonly log = new Logger({ namespace: 'sound-events' });
  private readonly events: SoundEvent[] = [];
  private readonly maxEvents: number;
  private readonly lifetime: number;

  constructor(options: SoundEventOptions = {}) {
    this.maxEvents = options.maxEvents ?? 32;
    this.lifetime = options.lifetimeSeconds ?? 2.5;
  }

  get size(): number {
    return this.events.length;
  }

  /** Records a sound event already produced elsewhere (e.g. from the game's EventBus). */
  ingest(event: SoundEvent): void {
    this.events.push(event);
    if (this.events.length > this.maxEvents) this.events.shift();
    this.log.debug('sound ingested', { kind: event.kind, loudness: event.loudness });
  }

  /** Drops events older than the configured lifetime. Call once per tick with a monotonic clock. */
  prune(nowSeconds: number): void {
    let write = 0;
    for (let read = 0; read < this.events.length; read += 1) {
      const event = this.events[read];
      if (nowSeconds - event.time <= this.lifetime) {
        this.events[write] = event;
        write += 1;
      }
    }
    this.events.length = write;
  }

  active(): readonly SoundEvent[] {
    return this.events;
  }

  /**
   * The loudest still-live event within `radius` of `point`, attenuated
   * linearly by distance. Returns null if nothing qualifies. Used by the
   * audio director to decide whether a noise near the monster deserves
   * its own reactive stinger.
   */
  loudestNear(
    point: THREE.Vector3,
    radius: number,
    nowSeconds: number
  ): { event: SoundEvent; effectiveLoudness: number } | null {
    let best: { event: SoundEvent; effectiveLoudness: number } | null = null;

    for (const event of this.events) {
      if (nowSeconds - event.time > this.lifetime) continue;

      const distance = point.distanceTo(event.position);
      if (distance > radius) continue;

      const falloff = 1 - distance / radius;
      const effectiveLoudness = event.loudness * falloff;

      if (!best || effectiveLoudness > best.effectiveLoudness) {
        best = { event, effectiveLoudness };
      }
    }

    return best;
  }

  clear(): void {
    this.events.length = 0;
  }
}
