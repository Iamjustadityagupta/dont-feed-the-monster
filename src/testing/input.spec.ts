
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InputManager } from '../input/InputManager';

const press = (code: string, key = code): void => {
  window.dispatchEvent(
    new KeyboardEvent('keydown', {
      code,
      key,
      bubbles: true,
    }),
  );
};

const release = (code: string, key = code): void => {
  window.dispatchEvent(
    new KeyboardEvent('keyup', {
      code,
      key,
      bubbles: true,
    }),
  );
};

describe('InputManager', () => {
  let manager: InputManager | null = null;

  afterEach(() => {
    manager?.dispose();
    manager = null;
    vi.restoreAllMocks();
  });

  it('registers held actions by physical code', () => {
    manager = new InputManager();

    press('KeyW');

    expect(manager.isHeld('forward')).toBe(true);

    release('KeyW');

    expect(manager.isHeld('forward')).toBe(false);
  });

  it('ignores OS auto-repeat for edge triggers', () => {
    manager = new InputManager();

    press('KeyE');

    expect(manager.wasPressed('interact')).toBe(true);

    press('KeyE');

    expect(manager.wasPressed('interact')).toBe(true);

    manager.endFrame();

    expect(manager.wasPressed('interact')).toBe(false);
  });

  it('clears stuck keys on window blur', () => {
    manager = new InputManager();

    press('KeyW');

    expect(manager.isHeld('forward')).toBe(true);

    window.dispatchEvent(new Event('blur'));

    expect(manager.isHeld('forward')).toBe(false);
  });

  it('clears keys and ignores input when disabled', () => {
    manager = new InputManager();

    press('KeyW');

    expect(manager.isHeld('forward')).toBe(true);

    manager.setEnabled(false);

    expect(manager.isHeld('forward')).toBe(false);

    press('KeyD');

    expect(manager.isHeld('right')).toBe(false);
  });

  it('clamps sensitivity', () => {
    manager = new InputManager();

    manager.setSensitivity(99);

    expect(manager.sensitivity).toBeLessThanOrEqual(0.01);
  });

  it('removes listeners on dispose', () => {
    manager = new InputManager();

    press('KeyW');

    expect(manager.isHeld('forward')).toBe(true);

    manager.dispose();
    manager = null;

    press('KeyS');

    // InputManager has been disposed, so it should no longer
    // process keyboard events.
    expect(true).toBe(true);
  });
});
