
import { DisposableGroup, type Disposable } from '../core/Disposable';
import type { QualityLevel } from '../core/GameEvents';
import type { HudState, HUD } from './HUD';
import { mountUiRoot } from './UiKit';
import { MainMenu } from './MainMenu';
import { HowToPlay } from './HowToPlay';
import { SettingsMenu, type SettingsValues } from './SettingsMenu';
import { PauseMenu } from './PauseMenu';
import { CaughtScreen } from './CaughtScreen';
import { ChapterCompleteScreen } from './ChapterCompleteScreen';
import { HUD as HudImpl } from './HUD';

export interface GameUIHooks {
  onNewGame: () => void;
  onResume: () => void;
  onRestart: () => void;
  onMainMenu: () => void;
  onSettingsChange: (patch: Partial<SettingsValues>) => void;
  onPauseRequest: () => void;
}

export interface GameUIBindings {
  newGame: () => void;
  showHowTo: () => void;
  showMenu: () => void;
  resume: () => void;
  restart: () => void;
}

type ScreenName =
  | 'main'
  | 'howToPlay'
  | 'settings'
  | 'pause'
  | 'caught'
  | 'complete'
  | 'hud';

interface LegacyHudState {
  objective: unknown;
  hasKeycard: boolean;
  monsterDistance: number;
  hidden: boolean;
  sprinting: boolean;
  crouching: boolean;
  prompt: string | null;
}

const DEFAULT_SETTINGS: SettingsValues = {
  mouseSensitivity: 0.0022,
  masterVolume: 0.8,
  sfxVolume: 0.8,
  ambienceVolume: 0.6,
  quality: 'high',
  reducedMotion: false,
};

const DEFAULT_HOOKS: GameUIHooks = {
  onNewGame: () => undefined,
  onResume: () => undefined,
  onRestart: () => undefined,
  onMainMenu: () => undefined,
  onSettingsChange: () => undefined,
  onPauseRequest: () => undefined,
};

export class GameUI implements Disposable {
  private readonly group = new DisposableGroup();
  private readonly root: HTMLDivElement;

  private readonly mainMenu: MainMenu;
  private readonly howToPlay: HowToPlay;
  private readonly settings: SettingsMenu;
  private readonly pause: PauseMenu;
  private readonly caught: CaughtScreen;
  private readonly complete: ChapterCompleteScreen;

  readonly hud: HUD;

  private hooks: GameUIHooks;
  private bindings: GameUIBindings | null = null;
  private settingsReturn: ScreenName = 'main';
  private current: ScreenName = 'main';
  private toastElement: HTMLDivElement;
  private disposed = false;

  constructor(
    hooksOrContainer: GameUIHooks | HTMLElement = DEFAULT_HOOKS,
    settings: SettingsValues = DEFAULT_SETTINGS,
    endingText = 'Chapter 1 complete.',
  ) {
    // The renderer container is not needed by the UI root.
    this.hooks =
      hooksOrContainer instanceof HTMLElement
        ? DEFAULT_HOOKS
        : hooksOrContainer;

    this.root = mountUiRoot();
    this.group.addFn(() => this.root.remove());

    this.mainMenu = this.group.add(
      new MainMenu({
        onNewGame: () => {
          if (this.bindings) this.bindings.newGame();
          else this.hooks.onNewGame();
        },
        onHowToPlay: () => {
          if (this.bindings) this.bindings.showHowTo();
          else this.show('howToPlay');
        },
        onSettings: () => {
          this.settingsReturn = 'main';
          this.show('settings');
        },
      }),
    );

    this.howToPlay = this.group.add(
      new HowToPlay(() => this.show('main')),
    );

    this.settings = this.group.add(
      new SettingsMenu(settings, {
        onChange: (patch) => this.hooks.onSettingsChange(patch),
        onBack: () => this.show(this.settingsReturn),
      }),
    );

    this.pause = this.group.add(
      new PauseMenu({
        onResume: () => {
          if (this.bindings) this.bindings.resume();
          else this.hooks.onResume();
        },
        onRestart: () => {
          if (this.bindings) this.bindings.restart();
          else this.hooks.onRestart();
        },
        onSettings: () => {
          this.settingsReturn = 'pause';
          this.show('settings');
        },
        onMainMenu: () => {
          if (this.bindings) this.bindings.showMenu();
          else this.hooks.onMainMenu();
        },
      }),
    );

    this.caught = this.group.add(
      new CaughtScreen(
        () => this.hooks.onRestart(),
        () => this.hooks.onMainMenu(),
      ),
    );

    this.complete = this.group.add(
      new ChapterCompleteScreen(
        endingText,
        () => this.hooks.onRestart(),
        () => this.hooks.onMainMenu(),
      ),
    );

    this.hud = this.group.add(new HudImpl());

    this.toastElement = document.createElement('div');
    this.toastElement.className = 'dfm-toast';
    this.toastElement.setAttribute('role', 'status');
    this.toastElement.setAttribute('aria-live', 'polite');
    this.toastElement.hidden = true;
    this.root.appendChild(this.toastElement);

    this.root.append(
      this.mainMenu.root,
      this.howToPlay.root,
      this.settings.root,
      this.pause.root,
      this.caught.root,
      this.complete.root,
      this.hud.root,
    );
  }

  bind(bindings: GameUIBindings): void {
    this.bindings = bindings;
  }

  private hideAll(): void {
    this.mainMenu.hide();
    this.howToPlay.hide();
    this.settings.hide();
    this.pause.hide();
    this.caught.hide();
    this.complete.hide();
    this.hud.hide();
  }

  show(screen: ScreenName): void {
    this.current = screen;
    this.hideAll();

    switch (screen) {
      case 'main':
        this.mainMenu.show();
        break;
      case 'howToPlay':
        this.howToPlay.show();
        break;
      case 'settings':
        this.settings.show();
        break;
      case 'pause':
        this.pause.show();
        break;
      case 'caught':
        this.caught.show();
        break;
      case 'complete':
        this.complete.show();
        break;
      case 'hud':
        this.hud.show();
        break;
    }
  }

  showMenu(): void {
    this.show('main');
  }

  showHowTo(): void {
    this.show('howToPlay');
  }

  showHud(): void {
    this.show('hud');
  }

  showPause(): void {
    this.show('pause');
  }

  showCaught(): void {
    this.show('caught');
  }

  showComplete(): void {
    this.show('complete');
  }

  get activeScreen(): ScreenName {
    return this.current;
  }

  setObjective(text: string, index: number, total: number): void {
    this.hud.objective.set(text, index, total);
  }

  setPrompt(label: string | null): void {
    if (label === null) {
      this.hud.prompt.hide();
    } else {
      this.hud.prompt.show(label);
    }
  }

  updateHud(state: HudState | LegacyHudState): void {
    if ('keycard' in state) {
      this.hud.update(state);
      return;
    }

    const gait = state.crouching
      ? 'crouching'
      : state.sprinting
        ? 'sprinting'
        : 'walking';

    const threat =
      Number.isFinite(state.monsterDistance) && state.monsterDistance >= 0
        ? Math.max(0, Math.min(1, 1 - state.monsterDistance / 12))
        : 0;

    this.hud.update({
      keycard: state.hasKeycard,
      hidden: state.hidden,
      gait,
      threat,
    });

    this.setPrompt(state.prompt);
  }

  toast(text: string): void {
    this.toastElement.textContent = text;
    this.toastElement.hidden = text.length === 0;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.group.dispose();
  }
}

export type { HudState, QualityLevel };
