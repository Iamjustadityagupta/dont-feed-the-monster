import { DisposableGroup, type Disposable } from '../core/Disposable';
import { el } from './UiKit';
import { InteractionPrompt } from './InteractionPrompt';
import { ObjectivePanel } from './ObjectivePanel';

export interface HudPuzzleProgress {
  readonly keysFound?: number;
  readonly keysTotal?: number;
  readonly fragmentsFound?: number;
  readonly fragmentsTotal?: number;
  readonly locksOpened?: number;
  readonly locksTotal?: number;
  readonly hasRoomKey?: boolean;
}

export interface HudState {
  readonly keycard: boolean;
  readonly hidden: boolean;
  readonly gait: string;
  readonly threat: number;
  /** Optional direct distance in metres to Subject 09 (when supplied by UI caller). */
  readonly monsterDistance?: number;
  /** Optional explicit movement flags if caller provides them alongside `gait`. */
  readonly sprinting?: boolean;
  readonly crouching?: boolean;
  /** Optional puzzle progress snapshot; safe defaults render cleanly before puzzle wiring. */
  readonly keysFound?: number;
  readonly keysTotal?: number;
  readonly fragmentsFound?: number;
  readonly fragmentsTotal?: number;
  readonly locksOpened?: number;
  readonly locksTotal?: number;
  readonly hasRoomKey?: boolean;
  readonly puzzle?: HudPuzzleProgress;
}

interface MetricNodes {
  readonly item: HTMLDivElement;
  readonly label: HTMLSpanElement;
  readonly value: HTMLSpanElement;
  lastText: string;
  lastDone: string;
}

const DEFAULT_KEYS_TOTAL = 3;
const DEFAULT_FRAGMENTS_TOTAL = 3;
const DEFAULT_LOCKS_TOTAL = 3;

const HUD_PUZZLE_STYLE_ATTR = 'data-dfm-hud-puzzle-styles';
let activeHudStyleUsers = 0;
let sharedHudStyleElement: HTMLStyleElement | null = null;

const HUD_PUZZLE_CSS = `
.dfm-puzzle-strip {
  position: fixed;
  left: clamp(14px, 2.2vw, 28px);
  bottom: clamp(46px, 6.4vh, 66px);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
  padding: 5px 9px;
  border-left: 2px solid rgba(158, 141, 112, 0.38);
  background: linear-gradient(90deg, rgba(10, 13, 15, 0.68) 0%, rgba(10, 13, 15, 0.18) 100%);
  backdrop-filter: blur(2px);
  pointer-events: none;
  user-select: none;
  z-index: 20;
  font: 500 11px/1.25 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  letter-spacing: 0.11em;
  color: rgba(210, 202, 184, 0.78);
  text-shadow: 0 1px 6px rgba(0, 0, 0, 0.92);
  transition: opacity 0.2s ease;
}

.dfm-puzzle-metric {
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
  white-space: nowrap;
}

.dfm-puzzle-metric + .dfm-puzzle-metric::before {
  content: '·';
  margin-right: 5px;
  color: rgba(158, 141, 112, 0.36);
}

.dfm-puzzle-label {
  font-size: 10px;
  color: rgba(168, 162, 148, 0.68);
}

.dfm-puzzle-value {
  font-weight: 600;
  color: rgba(226, 216, 195, 0.9);
  font-variant-numeric: tabular-nums;
}

.dfm-puzzle-metric[data-done="true"] .dfm-puzzle-label {
  color: rgba(143, 190, 166, 0.8);
}

.dfm-puzzle-metric[data-done="true"] .dfm-puzzle-value {
  color: #a9d6be;
}

.dfm-puzzle-metric[data-alert="true"] .dfm-puzzle-value {
  color: #d6b98c;
}

@media (max-width: 640px) {
  .dfm-puzzle-strip {
    left: 12px;
    right: 12px;
    bottom: 42px;
    gap: 4px 8px;
    padding: 4px 7px;
    font-size: 10px;
    letter-spacing: 0.08em;
  }
  .dfm-puzzle-label {
    font-size: 9px;
  }
}
`;

function acquireHudStyles(): () => void {
  activeHudStyleUsers += 1;

  if (!sharedHudStyleElement && typeof document !== 'undefined') {
    const existing = document.head.querySelector<HTMLStyleElement>(
      `style[${HUD_PUZZLE_STYLE_ATTR}]`,
    );
    if (existing) {
      sharedHudStyleElement = existing;
    } else {
      const style = document.createElement('style');
      style.setAttribute(HUD_PUZZLE_STYLE_ATTR, 'true');
      style.textContent = HUD_PUZZLE_CSS;
      document.head.appendChild(style);
      sharedHudStyleElement = style;
    }
  }

  let released = false;
  return (): void => {
    if (released) return;
    released = true;
    activeHudStyleUsers = Math.max(0, activeHudStyleUsers - 1);
    if (activeHudStyleUsers === 0 && sharedHudStyleElement) {
      sharedHudStyleElement.remove();
      sharedHudStyleElement = null;
    }
  };
}

function clampCount(value: number | undefined, max: number): number {
  if (value === undefined || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(max, Math.floor(value)));
}

function resolveTotal(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.floor(value);
}

export class HUD implements Disposable {
  readonly root: HTMLDivElement;

  private readonly group = new DisposableGroup();

  readonly objective: ObjectivePanel;
  readonly prompt: InteractionPrompt;

  private readonly puzzleStrip: HTMLDivElement;
  private readonly keysMetric: MetricNodes;
  private readonly locksMetric: MetricNodes;
  private readonly fragmentsMetric: MetricNodes;
  private readonly keycardMetric: MetricNodes;

  private readonly status: HTMLDivElement;
  private readonly threat: HTMLDivElement;

  private lastStatusText = '';
  private lastThreatActive = 'false';
  private lastThreatText = '';

  constructor() {
    this.group.addFn(acquireHudStyles());

    this.root = el('div', 'dfm-hud');

    this.objective = this.group.add(new ObjectivePanel());
    this.prompt = this.group.add(new InteractionPrompt());

    this.puzzleStrip = el('div', 'dfm-puzzle-strip');
    this.puzzleStrip.setAttribute('aria-label', 'Facility security progress');

    this.keysMetric = this.createMetric('KEYS', `0/${DEFAULT_KEYS_TOTAL}`);
    this.locksMetric = this.createMetric('LOCKS', `0/${DEFAULT_LOCKS_TOTAL}`);
    this.fragmentsMetric = this.createMetric('SHARDS', `0/${DEFAULT_FRAGMENTS_TOTAL}`);
    this.keycardMetric = this.createMetric('CARD', 'LOCKED');

    this.puzzleStrip.append(
      this.keysMetric.item,
      this.locksMetric.item,
      this.fragmentsMetric.item,
      this.keycardMetric.item,
    );

    this.status = el('div', 'dfm-status');
    this.threat = el('div', 'dfm-threat');

    this.threat.dataset.active = 'false';

    this.root.append(
      this.objective.root,
      this.prompt.root,
      this.puzzleStrip,
      this.status,
      this.threat,
    );

    this.root.hidden = true;
  }

  show(): void {
    this.root.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
  }

  update(state: HudState): void {
    this.updateStatusLine(state);
    this.updateThreatIndicator(state);
    this.updatePuzzleIndicators(state);
  }

  dispose(): void {
    this.group.dispose();
    this.root.remove();
  }

  private createMetric(labelText: string, initialValue: string): MetricNodes {
    const item = el('div', 'dfm-puzzle-metric');
    item.dataset.done = 'false';

    const label = el('span', 'dfm-puzzle-label', labelText);
    const value = el('span', 'dfm-puzzle-value', initialValue);

    item.append(label, value);

    return {
      item,
      label,
      value,
      lastText: initialValue,
      lastDone: 'false',
    };
  }

  private setMetric(
    metric: MetricNodes,
    valueText: string,
    done: boolean,
    alert = false,
  ): void {
    if (metric.lastText !== valueText) {
      metric.value.textContent = valueText;
      metric.lastText = valueText;
    }

    const doneStr = String(done);
    if (metric.lastDone !== doneStr) {
      metric.item.dataset.done = doneStr;
      metric.lastDone = doneStr;
    }

    if (alert && !done) {
      metric.item.dataset.alert = 'true';
    } else if (metric.item.dataset.alert !== undefined) {
      delete metric.item.dataset.alert;
    }
  }

  private updateStatusLine(state: HudState): void {
    const parts: string[] = [
      state.keycard ? 'KEYCARD' : 'NO KEYCARD',
    ];

    if (state.hidden) {
      parts.push('HIDDEN');
    }

    const resolvedGait = this.resolveGaitLabel(state);
    if (resolvedGait !== null) {
      parts.push(resolvedGait);
    }

    if (
      state.monsterDistance !== undefined &&
      Number.isFinite(state.monsterDistance) &&
      state.monsterDistance <= 18
    ) {
      parts.push(`${Math.max(1, Math.round(state.monsterDistance))}M`);
    }

    const nextStatus = parts.join(' · ');
    if (this.lastStatusText !== nextStatus) {
      this.status.textContent = nextStatus;
      this.lastStatusText = nextStatus;
    }
  }

  private resolveGaitLabel(state: HudState): string | null {
    if (state.gait && state.gait !== 'idle') {
      return state.gait.toUpperCase();
    }
    if (state.sprinting) {
      return 'SPRINT';
    }
    if (state.crouching) {
      return 'CROUCH';
    }
    return null;
  }

  private updateThreatIndicator(state: HudState): void {
    const active = Number.isFinite(state.threat) && state.threat > 0.35;
    const activeStr = String(active);

    if (this.lastThreatActive !== activeStr) {
      this.threat.dataset.active = activeStr;
      this.lastThreatActive = activeStr;
    }

    let nextThreatText = '';
    if (active) {
      if (
        state.monsterDistance !== undefined &&
        Number.isFinite(state.monsterDistance) &&
        state.monsterDistance < 9
      ) {
        nextThreatText = 'SUBJECT 09 CLOSE';
      } else {
        nextThreatText = 'SUBJECT 09 NEARBY';
      }
    }

    if (this.lastThreatText !== nextThreatText) {
      this.threat.textContent = nextThreatText;
      this.lastThreatText = nextThreatText;
    }
  }

  private updatePuzzleIndicators(state: HudState): void {
    const p = state.puzzle;

    const keysTotal = resolveTotal(
      p?.keysTotal ?? state.keysTotal,
      DEFAULT_KEYS_TOTAL,
    );
    const keysFound = clampCount(
      p?.keysFound ?? state.keysFound,
      keysTotal,
    );

    const locksTotal = resolveTotal(
      p?.locksTotal ?? state.locksTotal,
      DEFAULT_LOCKS_TOTAL,
    );
    const locksOpened = clampCount(
      p?.locksOpened ?? state.locksOpened,
      locksTotal,
    );

    const fragmentsTotal = resolveTotal(
      p?.fragmentsTotal ?? state.fragmentsTotal,
      DEFAULT_FRAGMENTS_TOTAL,
    );
    const fragmentsFound = clampCount(
      p?.fragmentsFound ?? state.fragmentsFound,
      fragmentsTotal,
    );

    const hasRoomKey = Boolean(p?.hasRoomKey ?? state.hasRoomKey);

    this.setMetric(
      this.keysMetric,
      `${keysFound}/${keysTotal}`,
      keysFound >= keysTotal,
      keysFound > 0 && keysFound < keysTotal,
    );

    this.setMetric(
      this.locksMetric,
      `${locksOpened}/${locksTotal}`,
      locksOpened >= locksTotal,
      locksOpened > 0 && locksOpened < locksTotal,
    );

    const fragmentsLabel = hasRoomKey
      ? 'KEY READY'
      : `${fragmentsFound}/${fragmentsTotal}`;
    this.setMetric(
      this.fragmentsMetric,
      fragmentsLabel,
      hasRoomKey || fragmentsFound >= fragmentsTotal,
      fragmentsFound > 0 && fragmentsFound < fragmentsTotal,
    );

    this.setMetric(
      this.keycardMetric,
      state.keycard ? 'ACQUIRED' : 'MISSING',
      state.keycard,
    );
  }
}