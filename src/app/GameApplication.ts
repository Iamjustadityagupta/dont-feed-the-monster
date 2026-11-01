import type { GameServices } from './GameServices';
import { createServices } from './GameBootstrap';
import { GameController, type Diagnostics } from './GameController';

/** Lifecycle only: create, start, dispose. Gameplay lives in GameController and the services it drives. */
export class GameApplication {
  private services: GameServices | null = null;
  private controller: GameController | null = null;
  private readonly container: HTMLElement;

  constructor(container: HTMLElement | null = document.querySelector<HTMLElement>('#app')) {
    if (!container) throw new Error('GameApplication: #app container not found');
    this.container = container;
    try {
      this.services = createServices(container);
    } catch (error) {
      console.error('[GameApplication] startup failed', error);
      container.textContent = 'Could not start the game: WebGL is unavailable or failed to initialise. Try a current desktop browser with hardware acceleration enabled.';
      return;
    }
    this.controller = new GameController(this.services);
    this.services.loop.start();
  }

  get running(): boolean {
    return this.controller !== null;
  }

  getDiagnostics(): Diagnostics | null {
    return this.controller?.getDiagnostics() ?? null;
  }

  runLifecycleStress(cycles = 20): ReturnType<GameController['runLifecycleStress']> | null {
    return this.controller?.runLifecycleStress(cycles) ?? null;
  }

  dispose(): void {
    this.controller?.dispose();
    this.services?.disposables.dispose();
    this.controller = null;
    this.services = null;
    if (!this.running) this.container.replaceChildren();
  }
}
