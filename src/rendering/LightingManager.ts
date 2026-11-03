import * as THREE from 'three';
import { DisposableGroup, type Disposable } from '../core/Disposable';
import { createRng, type Rng } from '../core/Random';

export interface LightingOptions {
  seed?: number;
  quality?: 'low' | 'medium' | 'high';
}

export interface PracticalLightSpec {
  position: THREE.Vector3;
  color: number;
  intensity: number;
  distance: number;
  flicker?: boolean;
}

const QUALITY_SHADOWS = { low: false, medium: false, high: true } as const;

/**
 * Industrial-horror lighting with seeded, bounded flicker.
 * Readability first: every practical stays above a floor intensity.
 */
export class LightingManager implements Disposable {
  private readonly group = new DisposableGroup();
  private readonly rng: Rng;
  private readonly flickerers: { light: THREE.PointLight; base: number; phase: number }[] = [];
  private readonly ambient: THREE.AmbientLight;
  private readonly hemi: THREE.HemisphereLight;
  private elapsed = 0;

  constructor(private readonly scene: THREE.Scene, options: LightingOptions = {}) {
    this.rng = createRng(options.seed ?? 1337);
    const quality = options.quality ?? 'medium';

    this.ambient = new THREE.AmbientLight(0x223040, 0.42);
    this.hemi = new THREE.HemisphereLight(0x3a4a5c, 0x0d1116, 0.35);
    scene.add(this.ambient, this.hemi);
    this.group.addFn(() => {
      scene.remove(this.ambient, this.hemi);
    });

    this.shadowsEnabled = QUALITY_SHADOWS[quality];
  }

  private shadowsEnabled: boolean;

  setQuality(quality: 'low' | 'medium' | 'high'): void {
    this.shadowsEnabled = QUALITY_SHADOWS[quality];
    for (const { light } of this.flickerers) light.castShadow = this.shadowsEnabled;
  }

  addPractical(spec: PracticalLightSpec): THREE.PointLight {
    const light = new THREE.PointLight(spec.color, spec.intensity, spec.distance, 2);
    light.position.copy(spec.position);
    light.castShadow = this.shadowsEnabled;
    if (light.castShadow) {
      light.shadow.mapSize.set(512, 512);
      light.shadow.camera.far = spec.distance;
    }
    this.scene.add(light);
    this.group.addFn(() => {
      this.scene.remove(light);
      light.dispose();
    });
    if (spec.flicker) this.flickerers.push({ light, base: spec.intensity, phase: this.rng.range(0, 10) });
    return light;
  }

  addEmergencyRow(centre: THREE.Vector3, count = 3, spacing = 4): void {
    for (let i = 0; i < count; i += 1) {
      this.addPractical({
        position: new THREE.Vector3(centre.x + (i - (count - 1) / 2) * spacing, 2.6, centre.z),
        color: 0xff2b2b,
        intensity: 1.4,
        distance: 7,
        flicker: true,
      });
    }
  }

  update(delta: number): void {
    this.elapsed += Math.max(delta, 0);
    for (const entry of this.flickerers) {
      // Two out-of-phase sines + seeded jitter keeps it organic and bounded.
      const wave = Math.sin(this.elapsed * 7.3 + entry.phase) * Math.sin(this.elapsed * 1.7 + entry.phase * 2);
      const jitter = wave > 0.82 ? this.rng.range(0.55, 0.85) : 1;
      entry.light.intensity = entry.base * Math.max(0.35, jitter);
    }
  }

  reset(): void {
    this.elapsed = 0;
    for (const entry of this.flickerers) entry.light.intensity = entry.base;
  }

  dispose(): void {
    this.group.dispose();
    this.flickerers.length = 0;
  }
}