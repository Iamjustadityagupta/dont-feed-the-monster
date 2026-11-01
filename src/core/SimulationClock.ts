/**
 * Simulation time that freezes on pause. All gameplay timers use this so
 * pause/restart and deterministic tests behave.
 */
export class SimulationClock {
  private _time = 0;
  private _paused = false;
  private _maxStep: number;

  constructor(maxStepSeconds = 0.1) {
    this._maxStep = maxStepSeconds;
  }

  get time(): number {
    return this._time;
  }

  get paused(): boolean {
    return this._paused;
  }

  get maxStep(): number {
    return this._maxStep;
  }

  pause(): void {
    this._paused = true;
  }

  resume(): void {
    this._paused = false;
  }

  reset(): void {
    this._time = 0;
    this._paused = false;
  }

  /** Returns the clamped delta actually applied (0 while paused). */
  advance(rawDelta: number): number {
    if (this._paused) return 0;
    const dt = Math.min(Math.max(rawDelta, 0), this._maxStep);
    this._time += dt;
    return dt;
  }
}