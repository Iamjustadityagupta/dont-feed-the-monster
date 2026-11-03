import * as THREE from 'three';

export class HandRig {
  readonly group = new THREE.Group();

  private readonly material =
    new THREE.MeshStandardMaterial({
      color: 0xa8815f,
      roughness: 0.86,
      metalness: 0
    });

  private external: THREE.Object3D | null = null;

  constructor() {
    const palm = new THREE.Mesh(
      new THREE.BoxGeometry(0.105, 0.115, 0.032),
      this.material
    );

    palm.position.set(0, 0, 0);
    this.group.add(palm);

    const fingerLengths = [0.062, 0.072, 0.066, 0.052];

    fingerLengths.forEach((length, index) => {
      const finger = new THREE.Mesh(
        new THREE.CapsuleGeometry(
          0.0135,
          length,
          4,
          8
        ),
        this.material
      );

      finger.position.set(
        -0.036 + index * 0.024,
        0.058 + length * 0.42,
        0.004
      );

      finger.rotation.x = -0.42 - index * 0.03;
      finger.rotation.z = (index - 1.5) * 0.05;

      this.group.add(finger);
    });

    const thumb = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.016, 0.058, 4, 8),
      this.material
    );

    thumb.position.set(0.062, 0.012, 0.012);
    thumb.rotation.set(-0.3, 0, -0.95);

    this.group.add(thumb);
  }

  attach(model: THREE.Object3D): void {
    this.external = model;
    model.scale.setScalar(1);
    this.group.add(model);
  }

  setGrip(amount: number): void {
    const grip = THREE.MathUtils.clamp(amount, 0, 1);

    this.group.children.forEach((child, index) => {
      if (index === 0 || child === this.external) return;

      child.rotation.x = -0.42 - grip * 0.55;
    });
  }

  dispose(): void {
    this.group.traverse(object => {
      const mesh = object as THREE.Mesh;

      if (mesh.geometry) {
        mesh.geometry.dispose();
      }
    });

    this.material.dispose();
  }
}