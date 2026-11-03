
import { CONFIG } from './GameConfig';
import type { GameServices } from './GameServices';
import { EventBus } from '../core/EventBus';
import { GameStateMachine } from '../core/GameStateMachine';
import { DisposableStore } from '../core/Disposable';
import { RendererManager } from '../rendering/RendererManager';
import { WorldManager } from '../world/WorldManager';
import { PlayerController } from '../player/PlayerController';
import { Flashlight } from '../player/Flashlight';
import { Subject09 } from '../monster/Monster';
import { GameUI } from '../ui/GameUI';
import type { SettingsValues } from '../ui/SettingsMenu';
import { GameLoop } from './GameLoop';
import { CHAPTER_01_AI } from '../chapters/ChapterAIProfile';

const DEFAULT_SETTINGS: SettingsValues = {
  mouseSensitivity: 0.0022,
  masterVolume: 0.8,
  sfxVolume: 0.8,
  ambienceVolume: 0.6,
  quality: 'high',
  reducedMotion: false,
};

/** Builds services in dependency order and disposes partial initialization on failure. */
export function createServices(container: HTMLElement): GameServices {
  const disposables = new DisposableStore();

  try {
    const events = new EventBus();
    disposables.add(() => events.clear());

    const state = new GameStateMachine('menu');

    const renderer = disposables.add(
      new RendererManager(container),
    );

    const world = disposables.add(new WorldManager());

    const player = disposables.add(
      new PlayerController(world, events, renderer.canvas),
    );

    renderer.attachCamera(player.camera);

    const flashlight = disposables.add(
      new Flashlight(world.scene),
    );

    const monster = disposables.add(
      new Subject09(world, player, events),
    );
    monster.setChapterProfile(CHAPTER_01_AI);

    const ui = disposables.add(
      new GameUI(
        {
          onNewGame: () => state.transition('playing'),
          onResume: () => state.transition('playing'),
          onRestart: () => state.transition('playing'),
          onMainMenu: () => state.transition('menu'),
          onSettingsChange: () => undefined,
          onPauseRequest: () => state.transition('paused'),
        },
        DEFAULT_SETTINGS,
        'Chapter 1 complete.',
      ),
    );

    const loop = disposables.add(new GameLoop(CONFIG.loop));

    return {
      config: CONFIG,
      events,
      state,
      renderer,
      world,
      player,
      flashlight,
      monster,
      ui,
      loop,
      disposables,
    };
  } catch (error) {
    disposables.dispose();
    throw error;
  }
}
