import { DisposableStore, type Disposable } from '../core/Disposable';
import { CONFIG } from './GameConfig';

export interface LoopTuning { maxStep: number; maxFrameTime: number }

/**
 * One requestAnimationFrame loop for the whole game.
 * - A frame longer than maxFrameTime is clamped (no huge jump after a tab switch).
 * - The frame is split into equal sub-steps of at most maxStep, so collision and AI never see a big dt.
 * - Any refresh rate (60/144 Hz) gets smooth movement because the last sub-step uses the real remainder.
 * - While `paused`, nothing is simulated but rendering continues.
 */
export class GameLoop implements Disposable {
  paused = true;
  onStep: (dt: number, time: number) => void = () => undefined;
  onRender: () => void = () => undefined;
  private running = false;
  private raf = 0;
  private last = 0;
  private time = 0;
  private readonly disposables = new DisposableStore();

  constructor(private readonly tuning: LoopTuning = CONFIG.loop) {
    this.disposables.addListener(document, 'visibilitychange', () => {
      this.last = performance.now();
    });
  }

  get simulationTime(): number {
    return this.time;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private frame = (now: number): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.frame);
    const frameDt = Math.min(Math.max((now - this.last) / 1000, 0), this.tuning.maxFrameTime);
    this.last = now;
    if (!this.paused && frameDt > 0) {
      const steps = Math.max(1, Math.ceil(frameDt / this.tuning.maxStep));
      const dt = frameDt / steps;
      for (let i = 0; i < steps && !this.paused; i++) {
        this.time += dt;
        this.onStep(dt, this.time);
      }
    }
    this.onRender();
  };

  dispose(): void {
    this.stop();
    this.disposables.dispose();
  }
}
