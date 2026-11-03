import { DisposableGroup, type Disposable } from '../core/Disposable';
import { el } from './UiKit';

/**
 * Identifies the kind of interactable the prompt is currently describing.
 * Extend this union if new interactable categories are added to the game.
 */
export type InteractionObjectType =
  | 'drawer'
  | 'key'
  | 'fragment'
  | 'lock'
  | 'combinationBox'
  | 'keyedDoor'
  | 'paper'
  | 'passwordLocker'
  | 'keycard';

/**
 * Optional state flags that change which contextual label is shown
 * for a given object type (e.g. a drawer that is already open/empty,
 * a lock that is already unlocked, a fragment already collected).
 */
export interface InteractionObjectState {
  /** Object has already been fully consumed/used/collected. */
  collected?: boolean;
  /** Drawer-specific: already opened/searched. */
  opened?: boolean;
  /** Drawer-specific: searched and found to be empty. */
  empty?: boolean;
  /** Lock / door-specific: already unlocked. */
  unlocked?: boolean;
  /** CombinationBox-specific: has enough fragments combined/ready to combine. */
  readyToCombine?: boolean;
  /** PasswordLocker-specific: correct code already entered/solved. */
  solved?: boolean;
  /** Override label entirely (rare escape hatch, use sparingly). */
  labelOverride?: string;
  /** Override key hint (defaults to 'E'). */
  key?: string;
}

/**
 * Central place that maps (object type, state) -> prompt label.
 * Kept as a pure function so it is trivially testable and does not
 * depend on any DOM/Three.js state.
 */
function resolveContextualLabel(
  type: InteractionObjectType,
  state: InteractionObjectState = {},
): string | null {
  if (state.labelOverride) return state.labelOverride;

  switch (type) {
    case 'drawer':
      if (state.collected) return null;
      if (state.opened && state.empty) return null;
      if (state.opened) return 'SEARCH DRAWER';
      return 'SEARCH DRAWER';

    case 'key':
      if (state.collected) return null;
      return 'TAKE KEY';

    case 'fragment':
      if (state.collected) return null;
      return 'COLLECT FRAGMENT';

    case 'lock':
      if (state.unlocked) return null;
      return 'USE KEY';

    case 'combinationBox':
      if (state.collected) return null;
      if (!state.readyToCombine) return null;
      return 'COMBINE FRAGMENTS';

    case 'keyedDoor':
      if (state.unlocked) return null;
      return 'USE KEY';

    case 'paper':
      if (state.collected) return null;
      return 'READ PAPER';

    case 'passwordLocker':
      if (state.solved) return null;
      return 'ENTER PASSWORD';

    case 'keycard':
      if (state.collected) return null;
      return 'TAKE KEYCARD';

    default:
      return null;
  }
}

export class InteractionPrompt implements Disposable {
  readonly root: HTMLDivElement;
  private readonly group = new DisposableGroup();
  private readonly label: HTMLSpanElement;
  private currentKey = '';

  constructor() {
    this.root = el('div', 'dfm-prompt');
    this.root.setAttribute('role', 'status');
    this.root.setAttribute('aria-live', 'polite');
    this.label = el('span');
    const key = el('kbd', undefined, 'E');
    this.root.append(key, document.createTextNode(' '), this.label);
    this.root.hidden = true;
  }

  /**
   * Existing generic API — unchanged. Shows an arbitrary label/key.
   */
  show(label: string, key = 'E'): void {
    const signature = `${key}|${label}`;
    if (signature !== this.currentKey) {
      this.currentKey = signature;
      const kbd = this.root.querySelector('kbd');
      if (kbd) kbd.textContent = key;
      this.label.textContent = label;
    }
    this.root.hidden = false;
  }

  /**
   * Contextual helper for puzzle/story interactables.
   * Resolves the correct label (e.g. SEARCH DRAWER, TAKE KEY, COLLECT FRAGMENT,
   * USE KEY, COMBINE FRAGMENTS, ENTER PASSWORD, TAKE KEYCARD) from the object
   * type and its current state.
   *
   * Callers (the interaction/raycast controller) are still responsible for:
   *  - only invoking this when the object is actually raycast-hit and within
   *    interaction range, and
   *  - calling hide() when the player looks away or moves out of range.
   *
   * If the resolved label is null (object inactive, already collected,
   * already solved, etc.) the prompt is hidden instead of shown, so callers
   * do not need to duplicate that gating logic themselves.
   */
  showForObject(
    type: InteractionObjectType,
    state: InteractionObjectState = {},
  ): void {
    const label = resolveContextualLabel(type, state);
    if (label === null) {
      this.hide();
      return;
    }
    this.show(label, state.key ?? 'E');
  }

  hide(): void {
    if (this.root.hidden) return;
    this.currentKey = '';
    this.root.hidden = true;
  }

  dispose(): void {
    this.group.dispose();
    this.root.remove();
  }
}