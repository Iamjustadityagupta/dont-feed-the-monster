import * as THREE from 'three';
import { DOCUMENTS } from './DocumentRegistry';
import type { HorrorGameHooks } from '../integration/GameHooks';

export interface PaperPlacement {
  docId: string;
  x: number;
  z: number;
  rotationY: number;
  surfaceY?: number;
}

interface PaperItem {
  mesh: THREE.Mesh;
  docId: string;
  pos: THREE.Vector3;
}

export class PaperPickups {
  private readonly items: PaperItem[] = [];
  private readonly geometry = new THREE.PlaneGeometry(0.48, 0.66);
  private readonly raycaster = new THREE.Raycaster();

  private nearest: PaperItem | null = null;
  private promptElement: HTMLDivElement | null = null;
  private disposed = false;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly hooks: HorrorGameHooks,
    private readonly isBlocked: () => boolean,
    private readonly onRead: (docId: string) => void
  ) {}

  place(placements: readonly PaperPlacement[]): void {
    if (this.disposed) return;

    for (const placement of placements) {
      if (!DOCUMENTS.some(doc => doc.id === placement.docId)) {
        console.warn(`[papers] Unknown docId: ${placement.docId}`);
        continue;
      }

      const resolvedY =
        placement.surfaceY ??
        this.resolveY(placement.x, placement.z);

      if (resolvedY === null) {
        console.warn(
          `[papers] No surface under ${placement.docId}; using y=0`
        );
      }

      const material = new THREE.MeshStandardMaterial({
        color: 0x9e8d70,
        roughness: 1.0,
        side: THREE.DoubleSide
      });

      const mesh = new THREE.Mesh(this.geometry, material);

      mesh.position.set(
        placement.x,
        (resolvedY ?? 0) + 0.012,
        placement.z
      );

      mesh.rotation.set(
        -Math.PI / 2 + 0.03,
        placement.rotationY,
        0
      );

      mesh.userData.docId = placement.docId;
      mesh.userData.isDocumentPickup = true;

      this.scene.add(mesh);

      this.items.push({
        mesh,
        docId: placement.docId,
        pos: mesh.position.clone()
      });
    }

    this.mountPrompt();
  }

  update(): void {
    if (this.disposed) return;

    if (this.isBlocked()) {
      this.nearest = null;
      this.setPromptVisible(false);
      return;
    }

    const playerPosition = this.hooks.getPlayerPosition();

    let best: PaperItem | null = null;
    let bestDistance = 1.7;

    for (const item of this.items) {
      const distance = playerPosition.distanceTo(item.pos);

      if (distance < bestDistance) {
        bestDistance = distance;
        best = item;
      }
    }

    this.nearest = best;
    this.setPromptVisible(best !== null);
  }

  /**
   * Called by GameController when the player presses E.
   * Returns true when a paper pickup consumed the interaction.
   */
  interact(): boolean {
    if (this.disposed || this.isBlocked() || !this.nearest) {
      return false;
    }

    const item = this.nearest;
    this.nearest = null;

    this.removeItem(item);
    this.setPromptVisible(false);

    this.onRead(item.docId);
    return true;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    for (const item of [...this.items]) {
      this.removeItem(item);
    }

    this.geometry.dispose();
    this.promptElement?.remove();
    this.promptElement = null;
    this.nearest = null;
  }

  private removeItem(item: PaperItem): void {
    const index = this.items.indexOf(item);
    if (index < 0) return;

    this.items.splice(index, 1);
    this.scene.remove(item.mesh);

    const material = item.mesh.material;
    if (Array.isArray(material)) {
      material.forEach(entry => entry.dispose());
    } else {
      material.dispose();
    }

    if (this.nearest === item) {
      this.nearest = null;
    }
  }

  private resolveY(x: number, z: number): number | null {
    this.raycaster.set(
      new THREE.Vector3(x, 40, z),
      new THREE.Vector3(0, -1, 0)
    );

    this.raycaster.far = 80;

    const hits = this.raycaster.intersectObjects(
      this.hooks.getOccluders(),
      true
    );

    return hits.length > 0 ? hits[0].point.y : null;
  }

  private setPromptVisible(visible: boolean): void {
    if (this.promptElement) {
      this.promptElement.style.opacity = visible ? '1' : '0';
    }
  }

  private mountPrompt(): void {
    if (this.promptElement) return;

    const element = document.createElement('div');

    element.className = 'dfm-paper-prompt';
    element.textContent = '[E] READ';

    element.style.cssText = `
      position:fixed;
      left:50%;
      bottom:22%;
      transform:translateX(-50%);
      opacity:0;
      transition:opacity .18s;
      pointer-events:none;
      letter-spacing:.18em;
      font:600 13px/1 ui-monospace,monospace;
      color:#e8dcc0;
      text-shadow:0 0 12px #000;
      z-index:30;
    `;

    document.body.appendChild(element);
    this.promptElement = element;
  }
}