import { DisposableGroup, type Disposable } from '../core/Disposable';
import { el } from './UiKit';
import { DEFAULT_PUZZLE_PROGRESS, type PuzzleProgress } from '../core/types';

/**
 * Actions wired by the owner (GameUI). `onUseItem` receives the canonical
 * PuzzleItemId string ('combined_object' | 'room_key' | 'keycard') for the
 * row the player activated — never a raw mesh/object reference, so this
 * panel stays decoupled from PlayerController / WorldManager.
 */
export interface InventoryPanelActions {
  onClose: () => void;
  onUseItem: (itemId: string) => void;
}

/**
 * Visual state of a single inventory row.
 *   undiscovered - nothing collected yet; shown as a dim placeholder that
 *                   never reveals where the item is found.
 *   collected    - the player is currently holding / has banked the item.
 *   combined     - the item has been consumed/merged into something else
 *                   (fragments -> completed object, keycard -> used, ...).
 */
type ItemRowState = 'undiscovered' | 'collected' | 'combined';

interface ItemRow {
  readonly id: string;
  readonly li: HTMLLIElement;
  readonly glyph: HTMLSpanElement;
  readonly name: HTMLSpanElement;
  readonly sub: HTMLSpanElement;
  readonly qty: HTMLSpanElement;
  readonly useBtn: HTMLButtonElement;
}

function createRow(id: string, glyphText: string, nameText: string, onUse: (id: string) => void): ItemRow {
  const li = el('li', 'dfm-item') as HTMLLIElement;
  li.dataset.item = id;
  li.dataset.state = 'undiscovered';

  const glyph = el('span', 'dfm-item-glyph', glyphText);
  const body = el('div', 'dfm-item-body');
  const name = el('span', 'dfm-item-name', nameText);
  const sub = el('span', 'dfm-item-sub', '???');
  body.append(name, sub);

  const qty = el('span', 'dfm-item-qty', '');

  const useBtn = el('button', 'dfm-item-use', 'Use') as HTMLButtonElement;
  useBtn.type = 'button';
  useBtn.hidden = true;
  useBtn.addEventListener('click', () => onUse(id));

  li.append(glyph, body, qty, useBtn);
  return { id, li, glyph, name, sub, qty, useBtn };
}

/**
 * Modal inventory overlay: keys, fragments, the completed (combined) object,
 * the box key and the keycard. Reads its data straight from the existing
 * PuzzleProgress shape so it never invents new fields the puzzle systems
 * don't already produce.
 */
export class InventoryPanel implements Disposable {
  readonly root: HTMLDivElement;
  private readonly group = new DisposableGroup();
  private readonly backdrop: HTMLDivElement;
  private readonly closeBtn: HTMLButtonElement;
  private readonly emptyHint: HTMLParagraphElement;
  private readonly list: HTMLUListElement;

  private readonly keysRow: ItemRow;
  private readonly fragmentsRow: ItemRow;
  private readonly completedRow: ItemRow;
  private readonly boxKeyRow: ItemRow;
  private readonly keycardRow: ItemRow;

  private progress: PuzzleProgress = DEFAULT_PUZZLE_PROGRESS;
  private visible = false;
  private disposed = false;

  constructor(private readonly actions: InventoryPanelActions) {
    this.backdrop = el('div', 'dfm-modal-backdrop') as HTMLDivElement;
    this.backdrop.hidden = true;
    this.backdrop.setAttribute('role', 'dialog');
    this.backdrop.setAttribute('aria-modal', 'true');
    this.backdrop.setAttribute('aria-label', 'Inventory');
    this.root = this.backdrop;

    const modal = el('div', 'dfm-modal');
    const head = el('div', 'dfm-modal-head');
    head.append(el('h2', 'dfm-title', 'Inventory'));
    this.closeBtn = el('button', 'dfm-modal-close', 'Close') as HTMLButtonElement;
    this.closeBtn.type = 'button';
    this.closeBtn.addEventListener('click', () => this.actions.onClose());
    head.append(this.closeBtn);

    this.list = el('ul', 'dfm-inventory-list') as HTMLUListElement;
    const onUse = (id: string) => this.actions.onUseItem(id);
    this.keysRow = createRow('drawer_keys', '\u{1F511}', 'Drawer Keys', onUse);
    this.fragmentsRow = createRow('fragments', '\u25C7', 'Fragments', onUse);
    this.completedRow = createRow('combined_object', '\u2726', 'Completed Object', onUse);
    this.boxKeyRow = createRow('room_key', '\u{1F5DD}', 'Box Key', onUse);
    this.keycardRow = createRow('keycard', '\u25A4', 'Keycard', onUse);
    this.list.append(
      this.keysRow.li,
      this.fragmentsRow.li,
      this.completedRow.li,
      this.boxKeyRow.li,
      this.keycardRow.li,
    );

    this.emptyHint = el(
      'p',
      'dfm-inventory-empty',
      'Nothing collected yet. Search the facility.',
    ) as HTMLParagraphElement;

    modal.append(head, this.list, this.emptyHint);
    this.backdrop.append(modal);

    this.group.addListener(window, 'keydown', this.onKeyDown as EventListener, true);
    this.render();
  }

  get isOpen(): boolean {
    return this.visible && !this.disposed;
  }

  /** Refreshes every row from the authoritative puzzle progress snapshot. */
  update(progress: PuzzleProgress): void {
    this.progress = progress;
    this.render();
  }

  show(): void {
    if (this.disposed || this.visible) return;
    this.visible = true;
    this.backdrop.hidden = false;
    document.exitPointerLock?.();
    this.render();
    this.closeBtn.focus({ preventScroll: true });
  }

  hide(): void {
    if (!this.visible) return;
    this.visible = false;
    this.backdrop.hidden = true;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.visible = false;
    this.group.dispose();
    this.root.remove();
  }

  // -----------------------------------------------------------------------

  private setRow(
    row: ItemRow,
    state: ItemRowState,
    subText: string,
    qtyText: string,
    useEnabled: boolean,
  ): void {
    row.li.dataset.state = state;
    row.sub.textContent = state === 'undiscovered' ? '???' : subText;
    row.qty.textContent = qtyText;
    row.useBtn.hidden = !useEnabled;
  }

  private render(): void {
    const p = this.progress;

    const keysFound = p.drawerKeysCollected > 0;
    this.setRow(
      this.keysRow,
      keysFound ? 'collected' : 'undiscovered',
      'Opens the numbered locks.',
      `${p.drawerKeysCollected}/${p.requiredDrawerKeys}`,
      false,
    );

    if (p.fragmentsCombined) {
      this.setRow(this.fragmentsRow, 'combined', 'Assembled into one piece.', 'Combined', false);
    } else {
      const fragmentsFound = p.fragmentsCollected > 0;
      this.setRow(
        this.fragmentsRow,
        fragmentsFound ? 'collected' : 'undiscovered',
        'Shards of something larger.',
        `${p.fragmentsCollected}/${p.requiredFragments}`,
        false,
      );
    }

    if (p.fragmentsCombined && !p.boxOpened) {
      this.setRow(this.completedRow, 'collected', 'Looks like it fits something.', '1', true);
    } else if (p.boxOpened) {
      this.setRow(this.completedRow, 'combined', 'Already used.', '\u2713', false);
    } else {
      this.setRow(this.completedRow, 'undiscovered', '', '', false);
    }

    if (p.roomKeyTaken) {
      this.setRow(this.boxKeyRow, 'collected', 'A small brass key.', '1', true);
    } else {
      this.setRow(this.boxKeyRow, 'undiscovered', '', '', false);
    }

    if (p.keycardState === 'used') {
      this.setRow(this.keycardRow, 'combined', 'Already swiped.', '\u2713', false);
    } else if (p.keycardState === 'collected') {
      this.setRow(this.keycardRow, 'collected', 'Grants access through secure doors.', '1', true);
    } else {
      this.setRow(this.keycardRow, 'undiscovered', '', '', false);
    }

    const anyFound =
      keysFound ||
      p.fragmentsCollected > 0 ||
      p.fragmentsCombined ||
      p.roomKeyTaken ||
      p.keycardState !== 'in_locker';
    this.emptyHint.hidden = anyFound;
    this.list.hidden = !anyFound;
  }

  /** Owns the keyboard while open: Escape closes it, everything else is swallowed before gameplay sees it. */
  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.isOpen) return;
    event.stopImmediatePropagation();
    if (event.code === 'Escape' && !event.repeat) {
      event.preventDefault();
      this.actions.onClose();
    }
  };
}