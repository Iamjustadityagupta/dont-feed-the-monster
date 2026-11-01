import * as THREE from 'three';

type FilterableAudio = {
  setFilter?: (node: AudioNode) => unknown;
};

/**
 * Applies a low-pass filter when supported by the installed Three.js version.
 * Supports both THREE.Audio and THREE.PositionalAudio.
 */
export function applyLowpass(
  audio: THREE.Audio | THREE.PositionalAudio,
  filter: BiquadFilterNode,
): boolean {
  const target = audio as unknown as FilterableAudio;

  if (typeof target.setFilter !== 'function') {
    return false;
  }

  target.setFilter(filter);
  return true;
}

type SpacedCtx = CanvasRenderingContext2D & {
  letterSpacing?: string;
};

export function setLetterSpacing(
  ctx: CanvasRenderingContext2D,
  value: string,
): void {
  const target = ctx as SpacedCtx;

  if (typeof target.letterSpacing === 'string') {
    target.letterSpacing = value;
  }
}

/**
 * Returns a Vite base-aware public asset URL.
 */
export function publicUrl(path: string): string {
  const env = (
    import.meta as ImportMeta & {
      env?: {
        BASE_URL?: string;
      };
    }
  ).env;

  const base = env?.BASE_URL ?? '/';

  return `${base}${path.replace(/^\/+/, '')}`;
}