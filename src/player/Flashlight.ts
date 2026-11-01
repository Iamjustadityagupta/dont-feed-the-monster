import * as THREE from 'three';
import type { Disposable } from '../core/Disposable';

export class Flashlight implements Disposable {
  readonly light = new THREE.SpotLight(0xd4e8ff, 35, 19, Math.PI / 7, 0.5, 1.4);
  private readonly direction = new THREE.Vector3();

  constructor(private readonly scene: THREE.Scene) {
    this.light.position.set(0, 1.5, 0);
    this.light.target.position.set(0, 1, -1);
    this.scene.add(this.light, this.light.target);
  }

  follow(camera: THREE.Camera): void {
    camera.getWorldDirection(this.direction);
    this.light.position.copy(camera.position);
    this.light.target.position.copy(camera.position).addScaledVector(this.direction, 4);
  }

  dispose(): void {
    this.scene.remove(this.light, this.light.target);
    this.light.dispose();
  }
}
