/**
 * Physical-key bindings via KeyboardEvent.code so AZERTY/QWERTY/Dvorak all
 * behave predictably. Fallbacks cover browsers that omit `code`.
 */
export type Action =
  | 'forward'
  | 'back'
  | 'left'
  | 'right'
  | 'sprint'
  | 'crouch'
  | 'interact'
  | 'throw'
  | 'flashlight'
  | 'pause';

export interface BindingSet {
  readonly codes: Readonly<Record<string, Action>>;
  readonly fallbackKeys: Readonly<Record<string, Action>>;
}

export const DEFAULT_BINDINGS: BindingSet = {
  codes: {
    KeyW: 'forward',
    ArrowUp: 'forward',
    KeyS: 'back',
    ArrowDown: 'back',
    KeyA: 'left',
    ArrowLeft: 'left',
    KeyD: 'right',
    ArrowRight: 'right',
    ShiftLeft: 'sprint',
    ShiftRight: 'sprint',
    KeyC: 'crouch',
    ControlLeft: 'crouch',
    KeyE: 'interact',
    KeyG: 'throw',
    KeyF: 'flashlight',
    Escape: 'pause',
  },
  fallbackKeys: {
    w: 'forward',
    s: 'back',
    a: 'left',
    d: 'right',
    Shift: 'sprint',
    c: 'crouch',
    Control: 'crouch',
    e: 'interact',
    g: 'throw',
    f: 'flashlight',
    Escape: 'pause',
  },
};

export const resolveAction = (event: KeyboardEvent, bindings: BindingSet = DEFAULT_BINDINGS): Action | null => {
  if (event.code) {
    const byCode = bindings.codes[event.code];
    if (byCode) return byCode;
  }
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  return bindings.fallbackKeys[key] ?? null;
};

/** Human-readable labels for the How-To-Play screen, derived from real bindings. */
export const describeBindings = (bindings: BindingSet = DEFAULT_BINDINGS): Record<Action, string[]> => {
  const out = {} as Record<Action, string[]>;
  const pretty = (code: string): string => {
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Arrow')) return code.slice(5);
    if (code === 'ShiftLeft' || code === 'ShiftRight') return 'Shift';
    if (code === 'ControlLeft') return 'Ctrl';
    return code;
  };
  for (const [code, action] of Object.entries(bindings.codes)) {
    const list = out[action] ?? (out[action] = []);
    const label = pretty(code);
    if (!list.includes(label)) list.push(label);
  }
  return out;
};