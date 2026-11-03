import type { GameServices } from '../app/GameServices';

/** The single place that puts a run back to its initial state. Add new systems here when they hold per-run state. */
export class RestartSystem {
  constructor(private readonly s: GameServices) {}

  reset(): void {
    this.s.player.reset();
    this.s.world.resetInteractables();
    this.s.monster.reset();
    this.s.flashlight.light.visible = true;
  }
}
