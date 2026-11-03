import * as THREE from 'three';
import type { MonsterState } from '../core/types';

interface Pose {
  lean: number;      // spine pitch (negative = leaning forward)
  hipsY: number;
  jaw: number;       // jaw opening, radians
  ears: number;      // ear flare scale
  headYaw: number;
  headRoll: number;
  armReach: number;  // shoulder pitch offset (negative = arms forward)
  stride: number;    // walk-cycle amplitude 0..1
}

const POSES: Record<MonsterState, Pose> = {
  PATROL: { lean: -0.42, hipsY: 1.1, jaw: 0.12, ears: 1.0, headYaw: 0, headRoll: 0.12, armReach: 0.12, stride: 0.55 },
  INVESTIGATE: { lean: -0.5, hipsY: 1.06, jaw: 0.2, ears: 1.5, headYaw: 0, headRoll: 0.35, armReach: 0.0, stride: 0.8 },
  SEARCH: { lean: -0.75, hipsY: 0.98, jaw: 0.25, ears: 1.45, headYaw: 0, headRoll: 0.2, armReach: -0.35, stride: 0.6 },
  CHASE: { lean: -0.95, hipsY: 0.94, jaw: 0.75, ears: 0.55, headYaw: 0, headRoll: 0, armReach: -1.15, stride: 1 },
  RETURN: { lean: -0.38, hipsY: 1.1, jaw: 0.08, ears: 1.0, headYaw: 0, headRoll: 0.08, armReach: 0.15, stride: 0.5 },
};

/**
 * Subject 09, "the Listener": a tall, hunched, eyeless predator with oversized ear membranes, a split jaw,
 * knee-length arms and digitigrade legs. Built from primitive geometry with a small joint rig so it can walk,
 * cock its head toward noises, flare its ears when listening and lunge forward in a chase.
 * The silhouette (very tall, long arms, huge ears, no eyes) stays readable against the blue/red lighting.
 */
export class Subject09Model {
  readonly root = new THREE.Group();
  private readonly hips = new THREE.Group();
  private readonly spine = new THREE.Group();
  private readonly neck = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly jaw = new THREE.Group();
  private readonly earL = new THREE.Group();
  private readonly earR = new THREE.Group();
  private readonly armL = { shoulder: new THREE.Group(), elbow: new THREE.Group() };
  private readonly armR = { shoulder: new THREE.Group(), elbow: new THREE.Group() };
  private readonly legL = { hip: new THREE.Group(), knee: new THREE.Group() };
  private readonly legR = { hip: new THREE.Group(), knee: new THREE.Group() };
  private readonly mouthGlow: THREE.Mesh;
  private readonly mouthLight = new THREE.PointLight(0xff5a2a, 0.9, 4.5, 2);
  private readonly skin = new THREE.MeshStandardMaterial({ color: 0x25282a, roughness: 0.82, metalness: 0.08 });
  private readonly flesh = new THREE.MeshStandardMaterial({ color: 0x5b4a48, roughness: 0.7 });
  private readonly bone = new THREE.MeshStandardMaterial({ color: 0xcbc6b4, roughness: 0.55 });
  private readonly membrane = new THREE.MeshStandardMaterial({ color: 0x6b3f43, roughness: 0.6, emissive: 0x2a0d12, emissiveIntensity: 0.8, side: THREE.DoubleSide });
  private readonly glowMat = new THREE.MeshStandardMaterial({ color: 0xff7a3a, emissive: 0xff4a18, emissiveIntensity: 2.4 });
  private readonly pose: Pose = { ...POSES.PATROL };
  private phase = 0;
  private listenSwing = 0;

  constructor() {
    this.root.add(this.hips);
    this.hips.position.y = 1.1;
    this.build();
    this.mouthGlow = this.addMouthGlow();
  }

  private mesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
    const m = new THREE.Mesh(geometry, material);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  }

  /** A limb segment that hangs down from its pivot (pivot at the top). */
  private segment(parent: THREE.Object3D, length: number, top: number, bottom: number, material: THREE.Material): void {
    this.mesh(parent, new THREE.CylinderGeometry(top, bottom, length, 7), material, 0, -length / 2, 0);
  }

  private build(): void {
    // Spine and torso: emaciated chest with exposed ribs and a ridge of vertebrae.
    this.hips.add(this.spine);
    this.spine.position.set(0, 0.1, 0);
    this.mesh(this.hips, new THREE.SphereGeometry(0.27, 10, 8), this.skin, 0, 0, 0).scale.set(1, 0.8, 0.9);
    const torso = this.mesh(this.spine, new THREE.CapsuleGeometry(0.26, 0.62, 5, 10), this.skin, 0, 0.5, 0);
    torso.scale.set(1, 1, 0.78);
    for (let i = 0; i < 5; i++) {
      const rib = this.mesh(this.spine, new THREE.BoxGeometry(0.5 - i * 0.04, 0.035, 0.05), this.bone, 0, 0.28 + i * 0.12, -0.21);
      rib.rotation.x = 0.1;
      this.mesh(this.spine, new THREE.ConeGeometry(0.045, 0.16, 5), this.bone, 0, 0.2 + i * 0.16, 0.22).rotation.x = Math.PI / 2 + 0.3;
    }

    // Neck and head: long skull, no eyes, slit nostrils; huge ear membranes.
    this.spine.add(this.neck);
    this.neck.position.set(0, 1.0, -0.05);
    this.neck.rotation.x = 0.55;
    this.mesh(this.neck, new THREE.CylinderGeometry(0.1, 0.14, 0.4, 7), this.flesh, 0, 0.18, 0);
    this.neck.add(this.head);
    this.head.position.set(0, 0.4, 0);
    const skull = this.mesh(this.head, new THREE.SphereGeometry(0.24, 12, 10), this.skin, 0, 0.05, -0.08);
    skull.scale.set(0.8, 1.1, 1.35);
    this.mesh(this.head, new THREE.ConeGeometry(0.1, 0.24, 6), this.flesh, 0, -0.02, -0.4).rotation.x = -Math.PI / 2;
    for (const x of [-0.04, 0.04]) this.mesh(this.head, new THREE.BoxGeometry(0.014, 0.04, 0.03), this.skin, x, 0.03, -0.52);

    this.head.add(this.jaw);
    this.jaw.position.set(0, -0.08, -0.12);
    this.mesh(this.jaw, new THREE.BoxGeometry(0.17, 0.05, 0.4), this.flesh, 0, -0.02, -0.18);
    for (let i = 0; i < 4; i++) {
      for (const x of [-0.07, 0.07]) {
        this.mesh(this.jaw, new THREE.ConeGeometry(0.014, 0.075, 4), this.bone, x, 0.03, -0.06 - i * 0.1);
        this.mesh(this.head, new THREE.ConeGeometry(0.014, 0.075, 4), this.bone, x, -0.075, -0.24 - i * 0.07).rotation.x = Math.PI;
      }
    }

    for (const [ear, side] of [[this.earL, -1], [this.earR, 1]] as const) {
      this.head.add(ear);
      ear.position.set(side * 0.17, 0.12, 0.02);
      const fin = this.mesh(ear, new THREE.ConeGeometry(0.2, 0.62, 3), this.membrane, side * 0.2, 0.18, 0.04);
      fin.scale.set(1, 1, 0.12);
      fin.rotation.z = -side * 0.8;
      this.mesh(ear, new THREE.CylinderGeometry(0.012, 0.012, 0.55, 4), this.bone, side * 0.2, 0.18, 0.06).rotation.z = -side * 0.8;
    }

    // Arms: long, thin, knee-length, ending in three claws.
    for (const [arm, side] of [[this.armL, -1], [this.armR, 1]] as const) {
      this.spine.add(arm.shoulder);
      arm.shoulder.position.set(side * 0.36, 0.95, 0);
      this.mesh(arm.shoulder, new THREE.SphereGeometry(0.11, 8, 6), this.flesh);
      this.segment(arm.shoulder, 0.78, 0.075, 0.055, this.skin);
      arm.shoulder.add(arm.elbow);
      arm.elbow.position.set(0, -0.78, 0);
      this.segment(arm.elbow, 0.9, 0.055, 0.04, this.skin);
      for (let c = -1; c <= 1; c++) {
        const claw = this.mesh(arm.elbow, new THREE.ConeGeometry(0.022, 0.34, 4), this.bone, c * 0.05, -1.05, 0);
        claw.rotation.x = 0.15;
        claw.rotation.z = c * 0.18;
      }
      this.mesh(arm.elbow, new THREE.SphereGeometry(0.06, 6, 5), this.flesh, 0, -0.92, 0);
    }

    // Legs: digitigrade, thigh forward then shin back.
    for (const [leg, side] of [[this.legL, -1], [this.legR, 1]] as const) {
      this.hips.add(leg.hip);
      leg.hip.position.set(side * 0.2, -0.02, 0);
      this.segment(leg.hip, 0.62, 0.13, 0.085, this.skin);
      leg.hip.add(leg.knee);
      leg.knee.position.set(0, -0.62, 0);
      this.segment(leg.knee, 0.62, 0.085, 0.05, this.skin);
      this.mesh(leg.knee, new THREE.BoxGeometry(0.11, 0.05, 0.3), this.flesh, 0, -0.64, -0.1);
    }
  }

  private addMouthGlow(): THREE.Mesh {
    const glow = this.mesh(this.head, new THREE.SphereGeometry(0.045, 8, 6), this.glowMat, 0, -0.04, -0.3);
    glow.castShadow = false;
    this.mouthLight.position.set(0, -0.04, -0.34);
    this.head.add(this.mouthLight);
    return glow;
  }

  /** Advance the animation. `speed` is the real movement speed in m/s (0 when standing). */
  update(dt: number, time: number, state: MonsterState, speed: number, aliveFacingNoise: boolean): void {
    const target = POSES[state];
    const k = 1 - Math.exp(-dt * 5);
    for (const key of Object.keys(target) as Array<keyof Pose>) this.pose[key] += (target[key] - this.pose[key]) * k;

    const moving = speed > 0.05;
    if (moving) this.phase += dt * (1.8 + speed * 1.55);
    const amp = moving ? this.pose.stride : 0;
    const swing = Math.sin(this.phase);
    const swingB = Math.sin(this.phase + Math.PI);

    this.hips.position.y = this.pose.hipsY + (moving ? Math.abs(Math.sin(this.phase)) * 0.06 : Math.sin(time * 1.6) * 0.015);
    this.spine.rotation.x = this.pose.lean + (moving ? Math.sin(this.phase * 2) * 0.03 : 0);
    this.spine.rotation.y = moving ? swing * 0.1 : 0;

    this.legL.hip.rotation.x = 0.5 + swing * 0.62 * amp;
    this.legR.hip.rotation.x = 0.5 + swingB * 0.62 * amp;
    this.legL.knee.rotation.x = -0.95 - Math.max(0, -swing) * 0.55 * amp;
    this.legR.knee.rotation.x = -0.95 - Math.max(0, -swingB) * 0.55 * amp;

    const reach = this.pose.armReach;
    this.armL.shoulder.rotation.x = reach + swingB * 0.5 * amp;
    this.armR.shoulder.rotation.x = reach + swing * 0.5 * amp;
    this.armL.shoulder.rotation.z = 0.12;
    this.armR.shoulder.rotation.z = -0.12;
    this.armL.elbow.rotation.x = -0.22 + (state === 'CHASE' ? -0.35 : 0);
    this.armR.elbow.rotation.x = -0.22 + (state === 'CHASE' ? -0.35 : 0);

    // Head: cocks toward sound while listening, sweeps while searching, snaps forward in a chase.
    this.listenSwing = state === 'SEARCH' ? Math.sin(time * 1.5) * 0.9 : state === 'INVESTIGATE' ? Math.sin(time * 0.7) * 0.25 : state === 'PATROL' ? Math.sin(time * 0.5) * 0.35 : 0;
    this.neck.rotation.x = state === 'CHASE' ? 0.95 : 0.55;
    this.head.rotation.y = this.pose.headYaw + this.listenSwing;
    this.head.rotation.z = this.pose.headRoll * (aliveFacingNoise ? 1 : 0.5) * Math.sin(time * 0.9 + 1);
    this.jaw.rotation.x = this.pose.jaw + (state === 'CHASE' ? Math.sin(time * 18) * 0.1 : Math.sin(time * 2) * 0.02);
    const flare = this.pose.ears + Math.sin(time * 3.1) * 0.04;
    this.earL.scale.set(flare, flare, flare);
    this.earR.scale.set(flare, flare, flare);
    this.earL.rotation.z = (1 - this.pose.ears) * 0.5;
    this.earR.rotation.z = -(1 - this.pose.ears) * 0.5;
    const glowPulse = state === 'CHASE' ? 1.4 : 0.9 + Math.sin(time * 2.4) * 0.2;
    this.mouthLight.intensity = 0.7 * glowPulse;
    this.mouthGlow.scale.setScalar(this.pose.jaw > 0.3 ? 1.6 : 1);
  }

  dispose(): void {
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    for (const m of [this.skin, this.flesh, this.bone, this.membrane, this.glowMat]) m.dispose();
    this.mouthLight.dispose();
  }
}
