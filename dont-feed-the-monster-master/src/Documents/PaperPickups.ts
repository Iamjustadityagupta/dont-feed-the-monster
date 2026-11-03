import * as THREE from 'three';
import { DOCUMENTS } from './DocumentRegistry';
import type { HorrorGameHooks } from '../integration/GameHooks';

export interface PaperPlacement {
  docId: string;
  x: number;
  z: number;
  rotationY: number;
  surfaceY?: number;
  /** Optional explicit instance ID when placing multiple physical sheets. */
  pickupId?: string;
}

interface PaperItem {
  readonly pickupId: string;
  readonly docId: string;
  readonly mesh: THREE.Mesh;
  readonly hitPad: THREE.Mesh;
  readonly pos: THREE.Vector3;
}

/**
 * Muted, natural aged-paper palette (parchment, manila, recycled memo stock).
 * Strictly matte, low-shine, and zero-emissive so papers blend naturally into horror lighting.
 */
const PAPER_STOCK_COLORS: readonly number[] = [
  0xa8997e,
  0x9e8d70,
  0xb2a58c,
  0x96886e,
  0xa39780,
  0xad9f84
];

const MAX_RAYCAST_REACH = 2.25;
const MAX_PROXIMITY_XZ = 1.75;
const MAX_PROXIMITY_VERTICAL = 1.65;
const MIN_LOOK_DOT = 0.42;
const MAX_VALID_SURFACE_Y = 2.05;
const CENTER_NDC = new THREE.Vector2(0, 0);
const DOWN_AXIS = new THREE.Vector3(0, -1, 0);

export class PaperPickups {
  private readonly items: PaperItem[] = [];

  private readonly hitTargets: THREE.Object3D[] = [];

  private readonly sheetGeometry = new THREE.PlaneGeometry(0.48, 0.66);

  /**
   * Slightly wider invisible hit plane co-planar with the sheet so aiming near the edge
   * of a paper on top of a drawer/desk reliably captures `[E]` before the solid prop below.
   */
  private readonly hitPadGeometry = new THREE.PlaneGeometry(0.62, 0.80);

  private readonly hitPadMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
    colorWrite: false,
    side: THREE.DoubleSide
  });

  private readonly raycaster = new THREE.Raycaster();

  private readonly tempRayOrigin = new THREE.Vector3();

  private readonly tempCameraPos = new THREE.Vector3();

  private readonly tempCameraDir = new THREE.Vector3();

  private readonly tempToPaper = new THREE.Vector3();

  private nearest: PaperItem | null = null;

  private promptElement: HTMLDivElement | null = null;

  private disposed = false;

  /** Tracks active + already-spawned pickup identities in the current run. */
  private readonly placedPickupIds = new Set<string>();

  /** Ensures each registered document ID is placed at most once unless given a distinct pickupId. */
  private readonly placedDocumentIds = new Set<string>();

  /** Tracks collected pickup instances so a physical sheet can never be picked up twice. */
  private readonly collectedPickupIds = new Set<string>();

  /** Guarantees each document ID is reported to PaperReader / Journal at most once per run. */
  private readonly collectedDocumentIds = new Set<string>();

  /** Cached initial placement table so `reset()` can cleanly rebuild world papers on New Game. */
  private initialPlacements: readonly PaperPlacement[] = [];

  private pickupSequence = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly hooks: HorrorGameHooks,
    private readonly isBlocked: () => boolean,
    private readonly onRead: (docId: string) => void
  ) {}

  /** Places registered readable documents in the facility. */
  place(placements: readonly PaperPlacement[]): void {
    if (this.disposed) return;

    if (this.initialPlacements.length === 0 && placements.length > 0) {
      this.initialPlacements = placements.map((entry) => ({ ...entry }));
    }

    const registeredDocIds = new Set<string>(DOCUMENTS.map((doc) => doc.id));

    for (const placement of placements) {
      if (!registeredDocIds.has(placement.docId)) {
        console.warn(`[papers] Unknown docId: ${placement.docId}`);
        continue;
      }

      const pickupId = this.resolvePickupId(placement);

      if (
        this.placedPickupIds.has(pickupId) ||
        this.collectedPickupIds.has(pickupId)
      ) {
        console.warn(`[papers] Duplicate pickupId ignored: ${pickupId}`);
        continue;
      }

      if (
        placement.pickupId === undefined &&
        (this.placedDocumentIds.has(placement.docId) ||
          this.collectedDocumentIds.has(placement.docId))
      ) {
        console.warn(
          `[papers] Duplicate placement ignored for docId: ${placement.docId}`
        );
        continue;
      }

      const resolvedY =
        placement.surfaceY ?? this.resolveY(placement.x, placement.z);

      if (resolvedY === null) {
        console.warn(
          `[papers] No surface under ${placement.docId} (${pickupId}); using y=0`
        );
      }

      const stockColor = this.pickNaturalPaperColor(pickupId);

      const material = new THREE.MeshStandardMaterial({
        color: stockColor,
        roughness: 0.96,
        metalness: 0.0,
        emissive: 0x000000,
        emissiveIntensity: 0.0,
        envMapIntensity: 0.12,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1
      });

      const mesh = new THREE.Mesh(this.sheetGeometry, material);
      const paperY = (resolvedY ?? 0) + 0.012;

      mesh.position.set(placement.x, paperY, placement.z);

      const tiltVariance = this.computeSubtleTilt(pickupId);
      mesh.rotation.set(
        -Math.PI / 2 + tiltVariance,
        placement.rotationY,
        0
      );

      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.name = `PaperPickup_${pickupId}`;
      mesh.userData = {
        pickupId,
        docId: placement.docId,
        isDocumentPickup: true,
        category: 'paper',
        raycastTarget: false
      };

      const hitPad = new THREE.Mesh(this.hitPadGeometry, this.hitPadMaterial);
      hitPad.position.set(0, 0, 0.004);
      hitPad.name = `PaperHitPad_${pickupId}`;
      hitPad.userData = {
        pickupId,
        docId: placement.docId,
        isDocumentPickup: true,
        category: 'paper',
        raycastTarget: false
      };
      mesh.add(hitPad);

      this.scene.add(mesh);

      const item: PaperItem = {
        pickupId,
        docId: placement.docId,
        mesh,
        hitPad,
        pos: mesh.position.clone()
      };

      this.items.push(item);
      this.hitTargets.push(mesh, hitPad);
      this.placedPickupIds.add(pickupId);
      this.placedDocumentIds.add(placement.docId);
    }

    this.mountPrompt();
  }

  /** Updates the nearest readable paper and HUD interaction prompt. */
  update(): void {
    if (this.disposed) return;

    if (!this.canInteractNow()) {
      this.nearest = null;
      this.setPromptVisible(false);
      return;
    }

    const target = this.findBestCandidate();
    this.nearest = target;
    this.setPromptVisible(target !== null);
  }

  /**
   * Called by GameController when E is pressed.
   * Re-evaluates target selection synchronously so aiming at a paper on top of a drawer,
   * desk, or crate always consumes the interaction and blocks solid-object triggers below it.
   */
  interact(): boolean {
    if (this.disposed || !this.canInteractNow()) {
      this.nearest = null;
      this.setPromptVisible(false);
      return false;
    }

    const item = this.findBestCandidate() ?? this.nearest;
    if (!item) {
      return false;
    }

    this.nearest = null;
    this.setPromptVisible(false);

    // Guard against double-pickup in the same frame.
    if (this.collectedPickupIds.has(item.pickupId)) {
      this.removeItem(item);
      return true;
    }

    this.collectedPickupIds.add(item.pickupId);
    this.removeItem(item);

    // Add to journal / open PaperReader at most once per unique document ID.
    if (!this.collectedDocumentIds.has(item.docId)) {
      this.collectedDocumentIds.add(item.docId);
      this.onRead(item.docId);
    }

    return true;
  }

  /**
   * Marks specific document IDs as already collected (e.g., when restoring a saved run)
   * and removes their physical sheets from the scene without firing `onRead` again.
   */
  markCollected(docIds: Iterable<string>): void {
    if (this.disposed) return;

    const targetIds = new Set<string>(docIds);
    for (const id of targetIds) {
      this.collectedDocumentIds.add(id);
    }

    for (const item of [...this.items]) {
      if (targetIds.has(item.docId)) {
        this.collectedPickupIds.add(item.pickupId);
        this.removeItem(item);
      }
    }

    if (this.nearest && targetIds.has(this.nearest.docId)) {
      this.nearest = null;
      this.setPromptVisible(false);
    }
  }

  /**
   * Resets all world papers for a fresh run without leaking geometries, materials, or DOM nodes.
   */
  reset(placements?: readonly PaperPlacement[]): void {
    if (this.disposed) return;

    for (const item of [...this.items]) {
      this.removeItem(item);
    }

    this.nearest = null;
    this.setPromptVisible(false);
    this.placedPickupIds.clear();
    this.placedDocumentIds.clear();
    this.collectedPickupIds.clear();
    this.collectedDocumentIds.clear();
    this.pickupSequence = 0;

    const source = placements ?? this.initialPlacements;
    if (placements && placements.length > 0) {
      this.initialPlacements = placements.map((entry) => ({ ...entry }));
    }
    if (source.length > 0) {
      this.place(source);
    }
  }

  getCollectedDocumentIds(): readonly string[] {
    return Array.from(this.collectedDocumentIds);
  }

  getRemainingCount(): number {
    return this.items.length;
  }

  /** Removes all paper pickups and releases resources. */
  dispose(): void {
    if (this.disposed) return;

    this.disposed = true;

    for (const item of [...this.items]) {
      this.removeItem(item);
    }

    this.sheetGeometry.dispose();
    this.hitPadGeometry.dispose();
    this.hitPadMaterial.dispose();

    this.promptElement?.remove();
    this.promptElement = null;

    this.nearest = null;
    this.hitTargets.length = 0;
    this.placedPickupIds.clear();
    this.placedDocumentIds.clear();
    this.collectedPickupIds.clear();
    this.collectedDocumentIds.clear();
  }

  private canInteractNow(): boolean {
    if (this.isBlocked()) return false;
    if (!this.hooks.isGameplayActive()) return false;
    if (this.hooks.isPlayerHiding()) return false;
    return this.items.length > 0;
  }

  /**
   * Selects the paper the player is aiming at (crosshair raycast priority) or standing
   * directly beside within view, ensuring papers resting on interactive drawers/furniture
   * cleanly win priority over the solid prop underneath without reading through walls.
   */
  private findBestCandidate(): PaperItem | null {
    if (this.items.length === 0) return null;

    const camera = this.hooks.getCamera();
    camera.getWorldPosition(this.tempCameraPos);
    camera.getWorldDirection(this.tempCameraDir);

    // 1. Direct crosshair raycast against paper sheets + co-planar hit pads.
    this.raycaster.setFromCamera(CENTER_NDC, camera);
    this.raycaster.near = 0.05;
    this.raycaster.far = MAX_RAYCAST_REACH;

    const rayHits = this.raycaster.intersectObjects(this.hitTargets, false);
    for (const hit of rayHits) {
      const pickupId = hit.object.userData['pickupId'] as string | undefined;
      if (!pickupId) continue;

      const matched = this.items.find((entry) => entry.pickupId === pickupId);
      if (!matched) continue;

      if (!this.isOccludedByWorld(this.tempCameraPos, hit.point, hit.distance)) {
        return matched;
      }
    }

    // 2. Proximity + view-cone fallback (handles looking slightly off-center at a desk/bed sheet).
    const playerPos = this.hooks.getPlayerPosition();
    let best: PaperItem | null = null;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const item of this.items) {
      const dx = playerPos.x - item.pos.x;
      const dz = playerPos.z - item.pos.z;
      const horizontalDist = Math.hypot(dx, dz);

      if (horizontalDist > MAX_PROXIMITY_XZ) {
        continue;
      }

      const verticalDelta = Math.abs(this.tempCameraPos.y - item.pos.y);
      if (verticalDelta > MAX_PROXIMITY_VERTICAL) {
        continue;
      }

      this.tempToPaper.subVectors(item.pos, this.tempCameraPos);
      const eyeDistance = this.tempToPaper.length();
      if (eyeDistance > MAX_RAYCAST_REACH || eyeDistance < 0.001) {
        continue;
      }

      const lookDot =
        this.tempToPaper.dot(this.tempCameraDir) / eyeDistance;

      // Require the player to generally face the paper unless standing right on top of it.
      if (lookDot < MIN_LOOK_DOT && horizontalDist > 0.75) {
        continue;
      }

      if (this.isOccludedByWorld(this.tempCameraPos, item.pos, eyeDistance)) {
        continue;
      }

      // Weight centered gaze more strongly than raw distance so adjacent papers feel crisp.
      const score = eyeDistance - Math.max(0, lookDot) * 0.65;
      if (score < bestScore) {
        bestScore = score;
        best = item;
      }
    }

    return best;
  }

  /**
   * Checks whether a solid wall or tall prop blocks line of sight between the camera
   * and the paper surface (with a 6 cm surface tolerance so the host desk itself never blocks).
   */
  private isOccludedByWorld(
    origin: THREE.Vector3,
    target: THREE.Vector3,
    targetDistance: number
  ): boolean {
    const maxCheckDist = targetDistance - 0.06;
    if (maxCheckDist <= 0.08) {
      return false;
    }

    this.tempToPaper.subVectors(target, origin).normalize();
    this.raycaster.set(origin, this.tempToPaper);
    this.raycaster.near = 0.05;
    this.raycaster.far = maxCheckDist;

    const monsterRoot = this.hooks.getMonsterObject();
    const hits = this.raycaster.intersectObjects(
      this.hooks.getOccluders(),
      true
    );

    for (const hit of hits) {
      if (hit.distance >= maxCheckDist) {
        break;
      }
      if (this.isIgnoredOccluder(hit.object, monsterRoot)) {
        continue;
      }
      return true;
    }

    return false;
  }

  private isIgnoredOccluder(
    object: THREE.Object3D,
    monsterRoot: THREE.Object3D
  ): boolean {
    let current: THREE.Object3D | null = object;
    while (current !== null) {
      if (!current.visible) return true;
      if (current === monsterRoot) return true;
      if (current.userData['isDocumentPickup'] === true) return true;
      current = current.parent;
    }
    return false;
  }

  private removeItem(item: PaperItem): void {
    const index = this.items.indexOf(item);
    if (index < 0) return;

    this.items.splice(index, 1);

    const meshHitIdx = this.hitTargets.indexOf(item.mesh);
    if (meshHitIdx >= 0) this.hitTargets.splice(meshHitIdx, 1);

    const padHitIdx = this.hitTargets.indexOf(item.hitPad);
    if (padHitIdx >= 0) this.hitTargets.splice(padHitIdx, 1);

    item.mesh.remove(item.hitPad);
    this.scene.remove(item.mesh);

    const material = item.mesh.material;
    if (Array.isArray(material)) {
      material.forEach((entry) => entry.dispose());
    } else {
      material.dispose();
    }

    if (this.nearest === item) {
      this.nearest = null;
    }
  }

  /**
   * Finds the valid furniture/floor surface height below `(x, z)` when `surfaceY` is omitted,
   * ignoring ceiling geometry (`y > 2.05`), monster meshes, and other paper pickups.
   */
  private resolveY(x: number, z: number): number | null {
    this.tempRayOrigin.set(x, MAX_VALID_SURFACE_Y, z);
    this.raycaster.set(this.tempRayOrigin, DOWN_AXIS);
    this.raycaster.near = 0;
    this.raycaster.far = MAX_VALID_SURFACE_Y + 1.0;

    const monsterRoot = this.hooks.getMonsterObject();
    const hits = this.raycaster.intersectObjects(
      this.hooks.getOccluders(),
      true
    );

    for (const hit of hits) {
      if (this.isIgnoredOccluder(hit.object, monsterRoot)) {
        continue;
      }
      if (hit.point.y <= MAX_VALID_SURFACE_Y && hit.point.y >= -0.05) {
        return hit.point.y;
      }
    }

    return null;
  }

  private resolvePickupId(placement: PaperPlacement): string {
    if (placement.pickupId && placement.pickupId.trim().length > 0) {
      return placement.pickupId.trim();
    }
    this.pickupSequence += 1;
    const seq = String(this.pickupSequence).padStart(3, '0');
    const coordTag = `${Math.round(placement.x * 10)}_${Math.round(placement.z * 10)}`;
    return `paper_${seq}_${placement.docId}_${coordTag}`;
  }

  private hashString(value: string): number {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  private pickNaturalPaperColor(pickupId: string): number {
    const idx = this.hashString(pickupId) % PAPER_STOCK_COLORS.length;
    return PAPER_STOCK_COLORS[idx] ?? 0x9e8d70;
  }

  private computeSubtleTilt(pickupId: string): number {
    const normalized = (this.hashString(`${pickupId}:tilt`) % 1000) / 1000;
    return 0.012 + normalized * 0.024;
  }

  private setPromptVisible(visible: boolean): void {
    if (!this.promptElement) return;

    this.promptElement.style.opacity = visible ? '1' : '0';
  }

  private mountPrompt(): void {
    if (this.promptElement) return;

    const element = document.createElement('div');

    element.className = 'dfm-paper-prompt';
    element.textContent = '[E] READ';

    element.style.cssText = `
      position: fixed;
      left: 50%;
      bottom: 22%;
      transform: translateX(-50%);
      opacity: 0;
      transition: opacity .18s;
      pointer-events: none;
      letter-spacing: .18em;
      font: 600 13px/1 ui-monospace, monospace;
      color: #e8dcc0;
      text-shadow: 0 0 12px #000;
      z-index: 30;
    `;

    document.body.appendChild(element);

    this.promptElement = element;
  }
}