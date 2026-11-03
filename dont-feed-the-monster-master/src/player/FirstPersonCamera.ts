import * as THREE from 'three';

const PITCH_LIMIT = Math.PI / 2 - 0.05;

export interface CameraConfig {
  fov: number;
  near: number;
  far: number;
  heightSmoothing: number;
}

export const DEFAULT_CAMERA: CameraConfig = {
  fov: 72,
  near: 0.05,
  far: 90,
  heightSmoothing: 14,
};

/** Owns yaw/pitch and eye placement. Never touches collision. */
export class FirstPersonCamera {
  readonly camera: THREE.PerspectiveCamera;
  private yaw = 0;
  private pitch = 0;
  private eyeY = 1.65;
  private readonly config: CameraConfig;

  constructor(aspect: number, config: CameraConfig = DEFAULT_CAMERA) {
    this.config = config;
    this.camera = new THREE.PerspectiveCamera(config.fov, aspect, config.near, config.far);
    this.camera.rotation.order = 'YXZ';
  }

  get yawAngle(): number {
    return this.yaw;
  }

  get pitchAngle(): number {
    return this.pitch;
  }

  setYaw(yaw: number): void {
    this.yaw = yaw;
  }

  look(deltaYaw: number, deltaPitch: number): void {
    this.yaw -= deltaYaw;
    this.pitch = Math.min(Math.max(this.pitch - deltaPitch, -PITCH_LIMIT), PITCH_LIMIT);
  }

  setEyeHeight(height: number): void {
    this.eyeY = height;
  }

  update(delta: number, position: THREE.Vector3, targetEyeHeight: number): void {
    const blend = Math.min(1, this.config.heightSmoothing * Math.max(delta, 0));
    this.eyeY += (targetEyeHeight - this.eyeY) * blend;
    this.camera.position.set(position.x, position.y + this.eyeY, position.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.camera.removeFromParent();
  }
}