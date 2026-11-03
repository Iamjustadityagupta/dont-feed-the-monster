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
import { InventoryPanel } from './InventoryPanel';

export interface GameUIHooks {
  onNewGame: () => void;
  onResume: () => void;
  onRestart: () => void;
  onMainMenu: () => void;
  onSettingsChange: (patch: Partial<SettingsValues>) => void;
  onPauseRequest: () => void;
  /** Fired when the player uses/activates an item from the InventoryPanel. */
  onInventoryUseItem?: (itemId: string) => void;
  /** Fired when the player submits a code via PasswordEntryUI. */
  onPasswordSubmit?: (code: string) => void;
  /**
   * Fired whenever the modal-overlay stack transitions between
   * empty and non-empty, so an external input/player controller can
   * suspend/resume movement and pointer-lock consistently with how
   * the pause screen already suspends gameplay.
   */
  onModalStateChange?: (locked: boolean) => void;
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

/** Severity/kind of a transient puzzle feedback message. */
export type PuzzleFeedbackKind = 'success' | 'error' | 'info';

/** Local, non-modal puzzle feedback component. */
class PuzzleFeedback implements Disposable {
  readonly root: HTMLDivElement;

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'dfm-puzzle-feedback';
    this.root.setAttribute('role', 'status');
    this.root.setAttribute('aria-live', 'polite');
    this.root.hidden = true;
  }

  show(message: string, kind: PuzzleFeedbackKind): void {
    this.root.textContent = message;
    this.root.dataset.kind = kind;
    this.root.hidden = message.length === 0;
  }

  hide(): void {
    this.root.hidden = true;
  }

  dispose(): void {
    this.root.remove();
  }
}

/**
 * Minimal contract required of any overlay that wants to participate in
 * GameUI's single-owner modal stack (suspend/resume/close semantics).
 */
interface ModalOverlay {
  readonly root: HTMLElement;
  show(): void;
  hide(): void;
}

/** Local password-entry overlay, kept in this module to avoid a missing module import. */
class PasswordEntryUI implements Disposable, ModalOverlay {
  readonly root: HTMLFormElement;
  private readonly input: HTMLInputElement;
  private readonly closeButton: HTMLButtonElement;

  constructor(hooks: { onSubmit: (code: string) => void; onClose: () => void }) {
    this.root = document.createElement('form');
    this.root.className = 'dfm-password-entry';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.hidden = true;

    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.autocomplete = 'off';
    this.input.setAttribute('aria-label', 'Password');

    const submitButton = document.createElement('button');
    submitButton.type = 'submit';
    submitButton.textContent = 'Submit';

    this.closeButton = document.createElement('button');
    this.closeButton.type = 'button';
    this.closeButton.textContent = 'Close';
    this.closeButton.addEventListener('click', hooks.onClose);
    this.root.addEventListener('submit', this.handleSubmit);
    this.root.append(this.input, submitButton, this.closeButton);
  }

  private readonly handleSubmit = (event: SubmitEvent): void => {
    event.preventDefault();
    const code = this.input.value.trim();
    if (code) this.onSubmit(code);
  };

  private onSubmit: (code: string) => void = () => undefined;

  show(): void {
    this.root.hidden = false;
    this.input.focus();
  }

  hide(): void {
    this.root.hidden = true;
  }

  dispose(): void {
    this.root.removeEventListener('submit', this.handleSubmit);
    this.root.remove();
  }
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
  readonly inventoryPanel: InventoryPanel;
  readonly passwordEntry: PasswordEntryUI;
  readonly puzzleFeedback: PuzzleFeedback;

  private hooks: GameUIHooks;
  private bindings: GameUIBindings | null = null;
  private settingsReturn: ScreenName = 'main';
  private current: ScreenName = 'main';
  private toastElement: HTMLDivElement;
  private disposed = false;

  /**
   * Stack of currently open single-keyboard-owner overlays.
   * Only the top of the stack is "active" (shown); everything below it
   * is suspended (hidden but not torn down). Closing the top resumes
   * whatever is beneath it, mirroring paper-reader-style suspend/resume.
   */
  private readonly modalStack: ModalOverlay[] = [];

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

    this.inventoryPanel = this.group.add(
      new InventoryPanel({
        onClose: () => this.closeModal(this.inventoryPanel),
        onUseItem: (itemId: string) => this.hooks.onInventoryUseItem?.(itemId),
      }),
    );

    this.passwordEntry = this.group.add(
      new PasswordEntryUI({
        onSubmit: (code: string) => this.hooks.onPasswordSubmit?.(code),
        onClose: () => this.closeModal(this.passwordEntry),
      }),
    );

    this.puzzleFeedback = this.group.add(new PuzzleFeedback());

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
      this.inventoryPanel.root,
      this.passwordEntry.root,
      this.puzzleFeedback.root,
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
    // Switching the primary screen always drops any open modal overlays
    // so a stale inventory/password panel can never persist underneath
    // main menu, pause, caught or chapter-complete screens.
    this.closeAllModals();

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

  // ---------------------------------------------------------------------
  // Modal overlay stack (InventoryPanel / PasswordEntryUI)
  //
  // Only the top of `modalStack` is ever shown, so only one overlay can
  // own keyboard input at a time. Opening a second modal suspends
  // (hides, without disposing) whatever was on top; closing the top
  // modal resumes the one beneath it — the same suspend/resume contract
  // expected of the existing paper-reading UI.
  // ---------------------------------------------------------------------

  /** True while any keyboard-owning modal overlay is open. */
  get hasActiveModal(): boolean {
    return this.modalStack.length > 0;
  }

  private notifyModalState(): void {
    this.hooks.onModalStateChange?.(this.modalStack.length > 0);
  }

  private openModal(modal: ModalOverlay): void {
    const top = this.modalStack[this.modalStack.length - 1];
    if (top === modal) {
      // Already the active overlay — just ensure it's visible.
      modal.show();
      return;
    }
    if (top) {
      top.hide(); // suspend whatever currently owns input
    }
    this.modalStack.push(modal);
    modal.show();
    this.notifyModalState();
  }

  /** Closes a specific modal (wherever it sits in the stack) and resumes the new top, if any. */
  private closeModal(modal: ModalOverlay): void {
    const index = this.modalStack.indexOf(modal);
    if (index === -1) return;

    const wasTop = index === this.modalStack.length - 1;
    modal.hide();
    this.modalStack.splice(index, 1);

    if (wasTop) {
      const resumed = this.modalStack[this.modalStack.length - 1];
      resumed?.show();
    }
    this.notifyModalState();
  }

  /** Closes the topmost (currently keyboard-owning) modal, resuming whatever is beneath it. */
  closeActiveModal(): void {
    const top = this.modalStack[this.modalStack.length - 1];
    if (top) this.closeModal(top);
  }

  /** Hides and clears every open modal without resuming intermediate ones (used on screen switches / dispose). */
  closeAllModals(): void {
    if (this.modalStack.length === 0) return;
    while (this.modalStack.length > 0) {
      const modal = this.modalStack.pop();
      modal?.hide();
    }
    this.notifyModalState();
  }

  openInventory(): void {
    this.openModal(this.inventoryPanel);
  }

  closeInventory(): void {
    this.closeModal(this.inventoryPanel);
  }

  openPasswordEntry(): void {
    this.openModal(this.passwordEntry);
  }

  closePasswordEntry(): void {
    this.closeModal(this.passwordEntry);
  }

  /** Shows a transient, non-modal puzzle feedback message (does not affect keyboard ownership). */
  showPuzzleFeedback(message: string, kind: PuzzleFeedbackKind = 'info'): void {
    this.puzzleFeedback.show(message, kind);
  }

  hidePuzzleFeedback(): void {
    this.puzzleFeedback.hide();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.closeAllModals();
    this.group.dispose();
  }
}

export type { HudState, QualityLevel };