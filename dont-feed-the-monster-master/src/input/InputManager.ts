import { DisposableGroup, type Disposable } from '../core/Disposable';
import { Logger } from '../core/Logger';
import { resolveAction, type Action, type BindingSet, DEFAULT_BINDINGS } from './InputBindings';

export interface InputOptions {
  target?: HTMLElement | Window;
  bindings?: BindingSet;
  /** When false, key state is cleared and new presses are ignored. */
  enabled?: boolean;
}

const MOUSE_SENSITIVITY_DEFAULT = 0.0022;

export class InputManager implements Disposable {
  private readonly log = new Logger({ namespace: 'input' });
  private readonly group = new DisposableGroup();
  private readonly bindings: BindingSet;
  private readonly target: HTMLElement | Window;
  private readonly held = new Set<Action>();
  private readonly pressedThisFrame = new Set<Action>();
  private readonly releasedThisFrame = new Set<Action>();
  private _enabled: boolean;
  private _mouseDeltaX = 0;
  private _mouseDeltaY = 0;
  private _sensitivity = MOUSE_SENSITIVITY_DEFAULT;
  private _pointerLocked = false;

  constructor(options: InputOptions = {}) {
    this.bindings = options.bindings ?? DEFAULT_BINDINGS;
    this.target = options.target ?? window;
    this._enabled = options.enabled ?? true;

    const onKeyDown = (event: Event) => this.handleKeyDown(event as KeyboardEvent);
    const onKeyUp = (event: Event) => this.handleKeyUp(event as KeyboardEvent);
    const onBlur = () => this.clearAll('window-blur');
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') this.clearAll('tab-hidden');
    };
    const onMouseMove = (event: Event) => this.handleMouseMove(event as MouseEvent);

    this.target.addEventListener('keydown', onKeyDown);
    this.target.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('pointerlockchange', () => {
      this._pointerLocked = document.pointerLockElement !== null;
      if (!this._pointerLocked) this.clearAll('pointerlock-exit');
    });

    this.group.addFn(() => {
      this.target.removeEventListener('keydown', onKeyDown);
      this.target.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('mousemove', onMouseMove);
    });
  }

  get enabled(): boolean {
    return this._enabled;
  }

  setEnabled(enabled: boolean): void {
    if (this._enabled === enabled) return;
    this._enabled = enabled;
    if (!enabled) this.clearAll('disabled');
  }

  get sensitivity(): number {
    return this._sensitivity;
  }

  setSensitivity(value: number): void {
    this._sensitivity = Math.min(Math.max(value, 0.0004), 0.01);
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (!this._enabled) return;
    const action = resolveAction(event, this.bindings);
    if (!action) return;
    if (action === 'pause' || action === 'interact' || action === 'throw' || action === 'flashlight') {
      event.preventDefault();
    }
    if (this.held.has(action)) return; // ignore OS auto-repeat
    this.held.add(action);
    this.pressedThisFrame.add(action);
  }

  private handleKeyUp(event: KeyboardEvent): void {
    const action = resolveAction(event, this.bindings);
    if (!action) return;
    if (this.held.delete(action)) this.releasedThisFrame.add(action);
  }

  private handleMouseMove(event: MouseEvent): void {
    if (!this._enabled || !this._pointerLocked) return;
    this._mouseDeltaX += event.movementX;
    this._mouseDeltaY += event.movementY;
  }

  clearAll(reason: string): void {
    if (this.held.size > 0) this.log.debug('clearing held keys', { reason, count: this.held.size });
    for (const action of this.held) this.releasedThisFrame.add(action);
    this.held.clear();
    this.pressedThisFrame.clear();
    this._mouseDeltaX = 0;
    this._mouseDeltaY = 0;
  }

  isHeld(action: Action): boolean {
    return this.held.has(action);
  }

  wasPressed(action: Action): boolean {
    return this.pressedThisFrame.has(action);
  }

  wasReleased(action: Action): boolean {
    return this.releasedThisFrame.has(action);
  }

  /** Returns accumulated mouse look in radians, then resets it. */
  consumeLook(): { yaw: number; pitch: number } {
    const yaw = this._mouseDeltaX * this._sensitivity;
    const pitch = this._mouseDeltaY * this._sensitivity;
    this._mouseDeltaX = 0;
    this._mouseDeltaY = 0;
    return { yaw, pitch };
  }

  get movement(): { forward: number; strafe: number } {
    const forward = (this.isHeld('forward') ? 1 : 0) - (this.isHeld('back') ? 1 : 0);
    const strafe = (this.isHeld('right') ? 1 : 0) - (this.isHeld('left') ? 1 : 0);
    return { forward, strafe };
  }

  /** Call once per frame after all reads. */
  endFrame(): void {
    this.pressedThisFrame.clear();
    this.releasedThisFrame.clear();
  }

  dispose(): void {
    this.clearAll('dispose');
    this.group.dispose();
  }
}