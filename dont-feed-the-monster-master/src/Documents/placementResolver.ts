import * as THREE from 'three';

import { DOCUMENTS } from './DocumentRegistry';

import type { PaperPlacement } from './PaperPickups';

export type PlacementSource = 'marker' | 'fallback';

export interface ResolvedPlacement extends PaperPlacement {
  source: PlacementSource;
  hostName: string;
}

const SURFACE =
  /desk|table|shelf|bench|counter|console|worktop|rack/i;

const MARKER = 'paperSpot';

/** Minimum horizontal clearance (metres) so two papers never stack on the same spot. */
const MIN_PAPER_SEPARATION_SQ = 0.35 * 0.35;

/** Valid surface height window for automatic named furniture (keeps 2.4 m shelf roofs out of reach). */
const MIN_SURFACE_Y = 0.02;
const MAX_AUTO_SURFACE_Y = 1.65;
const MIN_SURFACE_SPAN = 0.22;
const MAX_SURFACE_SPAN = 16.0;

interface ValidatedHost {
  readonly object: THREE.Object3D;
  readonly isExplicitMarker: boolean;
  readonly hostName: string;
  readonly centerX: number;
  readonly centerZ: number;
  readonly surfaceY: number;
  readonly spanX: number;
  readonly spanZ: number;
}

function isFiniteNumber(value: number): boolean {
  return Number.isFinite(value) && !Number.isNaN(value);
}

function isPositiveFiniteNumber(value: number): boolean {
  return isFiniteNumber(value) && value >= 0;
}

function hasMatchedSurfaceAncestor(
  object: THREE.Object3D,
  matchedSet: ReadonlySet<THREE.Object3D>
): boolean {
  let current: THREE.Object3D | null = object.parent;
  while (current !== null) {
    if (matchedSet.has(current)) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function isTooCloseXZ(
  x: number,
  z: number,
  existing: readonly ResolvedPlacement[]
): boolean {
  for (const item of existing) {
    const dx = item.x - x;
    const dz = item.z - z;
    if (dx * dx + dz * dz < MIN_PAPER_SEPARATION_SQ) {
      return true;
    }
  }
  return false;
}

function quantize(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function compareHostsDeterministically(
  a: ValidatedHost,
  b: ValidatedHost
): number {
  // Explicit paperSpot markers always take priority over heuristic named furniture.
  if (a.isExplicitMarker !== b.isExplicitMarker) {
    return a.isExplicitMarker ? -1 : 1;
  }

  const az = quantize(a.centerZ);
  const bz = quantize(b.centerZ);
  if (az !== bz) return az - bz;

  const ax = quantize(a.centerX);
  const bx = quantize(b.centerX);
  if (ax !== bx) return ax - bx;

  const ay = quantize(a.surfaceY);
  const by = quantize(b.surfaceY);
  if (ay !== by) return ay - by;

  return a.hostName.localeCompare(b.hostName);
}

export function resolvePlacements(
  scene: THREE.Scene,
  fallback: readonly PaperPlacement[]
): ResolvedPlacement[] {
  // Ensure world transforms are up-to-date before computing Box3 bounds.
  scene.updateMatrixWorld(true);

  // 1. Validate registered document IDs and report any registry-level duplicates clearly.
  const wanted: string[] = [];
  const wantedSet = new Set<string>();
  const duplicateRegistryIds: string[] = [];

  for (const document of DOCUMENTS) {
    if (wantedSet.has(document.id)) {
      duplicateRegistryIds.push(document.id);
      continue;
    }
    wantedSet.add(document.id);
    wanted.push(document.id);
  }

  if (duplicateRegistryIds.length > 0) {
    console.warn(
      `[papers] Duplicate document IDs in DocumentRegistry ignored: ${duplicateRegistryIds.join(', ')}`
    );
  }

  // 2. Collect candidate markers and named surfaces while preventing nested child duplicates.
  const rawCandidates: THREE.Object3D[] = [];
  const namedSurfaceNodes = new Set<THREE.Object3D>();

  scene.traverse((object: THREE.Object3D) => {
    if (!object.visible) {
      return;
    }

    // Never treat an already-spawned paper pickup mesh as a host surface.
    if (object.userData['isDocumentPickup'] === true) {
      return;
    }

    const isMarker = object.userData[MARKER] === true;
    const isNamedSurface =
      Boolean(object.name) && SURFACE.test(object.name);

    if (isMarker) {
      rawCandidates.push(object);
      namedSurfaceNodes.add(object);
      return;
    }

    if (isNamedSurface) {
      namedSurfaceNodes.add(object);
      rawCandidates.push(object);
    }
  });

  // Filter out nested child meshes whose ancestor is already a matched surface/marker,
  // unless the child itself is an explicit `userData.paperSpot === true` marker.
  const filteredObjects = rawCandidates.filter((object) => {
    const isExplicitMarker = object.userData[MARKER] === true;
    if (isExplicitMarker) {
      let ancestor = object.parent;
      while (ancestor !== null) {
        if (ancestor.userData[MARKER] === true) {
          return false;
        }
        ancestor = ancestor.parent;
      }
      return true;
    }
    return !hasMatchedSurfaceAncestor(object, namedSurfaceNodes);
  });

  // 3. Validate bounding boxes and dimensions before assigning any document IDs.
  const bounds = new THREE.Box3();
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  const worldPos = new THREE.Vector3();
  const validHosts: ValidatedHost[] = [];

  for (const host of filteredObjects) {
    const isExplicitMarker = host.userData[MARKER] === true;
    bounds.setFromObject(host);

    if (bounds.isEmpty()) {
      // Pure empty Object3D marker with no geometry: use its world position directly.
      if (isExplicitMarker) {
        host.getWorldPosition(worldPos);
        if (
          isFiniteNumber(worldPos.x) &&
          isFiniteNumber(worldPos.y) &&
          isFiniteNumber(worldPos.z) &&
          worldPos.y >= 0
        ) {
          validHosts.push({
            object: host,
            isExplicitMarker: true,
            hostName: host.name || '(paperSpot marker)',
            centerX: worldPos.x,
            centerZ: worldPos.z,
            surfaceY: worldPos.y,
            spanX: 0,
            spanZ: 0
          });
        }
      }
      continue;
    }

    bounds.getCenter(center);
    bounds.getSize(size);

    if (
      !isFiniteNumber(center.x) ||
      !isFiniteNumber(center.z) ||
      !isFiniteNumber(bounds.max.y) ||
      !isPositiveFiniteNumber(size.x) ||
      !isPositiveFiniteNumber(size.y) ||
      !isPositiveFiniteNumber(size.z)
    ) {
      continue;
    }

    // For heuristic named surfaces, reject degenerate slivers, giant room-sized groups,
    // floor-clipped geometry, or tall 2.2m–2.4m shelf roofs out of player reach.
    if (!isExplicitMarker) {
      if (
        bounds.max.y < MIN_SURFACE_Y ||
        bounds.max.y > MAX_AUTO_SURFACE_Y ||
        size.x < MIN_SURFACE_SPAN ||
        size.z < MIN_SURFACE_SPAN ||
        size.x > MAX_SURFACE_SPAN ||
        size.z > MAX_SURFACE_SPAN
      ) {
        continue;
      }
    } else if (bounds.max.y < 0) {
      continue;
    }

    validHosts.push({
      object: host,
      isExplicitMarker,
      hostName:
        host.name ||
        (isExplicitMarker ? '(paperSpot marker)' : '(unnamed surface)'),
      centerX: center.x,
      centerZ: center.z,
      surfaceY: bounds.max.y,
      spanX: size.x,
      spanZ: size.z
    });
  }

  // Deterministic ordering across runs, reloads, and save restores.
  validHosts.sort(compareHostsDeterministically);

  // Build quick lookup of fallback definitions and validate fallback list integrity.
  const fallbackByDocId = new Map<string, PaperPlacement>();
  const duplicateFallbackIds: string[] = [];
  const unknownFallbackIds: string[] = [];

  for (const entry of fallback) {
    if (!wantedSet.has(entry.docId)) {
      unknownFallbackIds.push(entry.docId);
      continue;
    }
    if (fallbackByDocId.has(entry.docId)) {
      duplicateFallbackIds.push(entry.docId);
      continue;
    }
    if (
      !isFiniteNumber(entry.x) ||
      !isFiniteNumber(entry.z) ||
      !isFiniteNumber(entry.rotationY) ||
      (entry.surfaceY !== undefined && !isFiniteNumber(entry.surfaceY))
    ) {
      console.warn(
        `[papers] Invalid coordinates in fallback placement for "${entry.docId}"; skipping fallback entry.`
      );
      continue;
    }
    fallbackByDocId.set(entry.docId, entry);
  }

  if (duplicateFallbackIds.length > 0) {
    console.warn(
      `[papers] Duplicate docIds in fallback table ignored: ${duplicateFallbackIds.join(', ')}`
    );
  }

  if (unknownFallbackIds.length > 0) {
    console.warn(
      `[papers] Unknown docIds in fallback table ignored: ${unknownFallbackIds.join(', ')}`
    );
  }

  const output: ResolvedPlacement[] = [];
  const placed = new Set<string>();

  /*
   * 4. Assign at most one paper to each usable, non-overlapping scene surface/marker.
   * Uses an independent cursor (`nextDocIndex`) so skipped hosts never skip a document ID.
   */
  let nextDocIndex = 0;
  let placementSalt = 0;

  for (const host of validHosts) {
    while (
      nextDocIndex < wanted.length &&
      placed.has(wanted[nextDocIndex] ?? '')
    ) {
      nextDocIndex += 1;
    }

    const docId = wanted[nextDocIndex];
    if (!docId) {
      break;
    }

    placementSalt += 1;

    // Clamp jitter so narrow shelves/consoles never push the paper over the edge.
    const maxJitterX = host.isExplicitMarker && host.spanX === 0
      ? 0
      : Math.min(0.12, Math.max(0, host.spanX * 0.5 - 0.26));
    const maxJitterZ = host.isExplicitMarker && host.spanZ === 0
      ? 0
      : Math.min(0.12, Math.max(0, host.spanZ * 0.5 - 0.26));

    const offsetX = Math.sin(placementSalt * 12.9898) * maxJitterX;
    const offsetZ = Math.cos(placementSalt * 7.233) * maxJitterZ;

    const targetX = host.centerX + offsetX;
    const targetZ = host.centerZ + offsetZ;

    // Skip nested/adjacent sub-surfaces whose world XZ collides with an already-placed paper.
    if (isTooCloseXZ(targetX, targetZ, output)) {
      continue;
    }

    output.push({
      docId,
      x: targetX,
      z: targetZ,
      rotationY: (((placementSalt - 1) * 37) % 180) * (Math.PI / 180),
      surfaceY: host.surfaceY,
      source: 'marker',
      hostName: host.hostName
    });

    placed.add(docId);
    nextDocIndex += 1;
  }

  /*
   * 5. Place all remaining registered papers at their fallback coordinates in deterministic registry order.
   */
  for (const docId of wanted) {
    if (placed.has(docId)) {
      continue;
    }

    const fallbackEntry = fallbackByDocId.get(docId);
    if (!fallbackEntry) {
      continue;
    }

    output.push({
      docId: fallbackEntry.docId,
      x: fallbackEntry.x,
      z: fallbackEntry.z,
      rotationY: fallbackEntry.rotationY,
      ...(fallbackEntry.surfaceY !== undefined
        ? { surfaceY: fallbackEntry.surfaceY }
        : {}),
      source: 'fallback',
      hostName: '(coordinate table)'
    });

    placed.add(docId);
  }

  /*
   * 6. Final integrity check: verify every registered document has been placed once and only once.
   */
  const finalSeen = new Set<string>();
  const duplicateResolvedIds: string[] = [];

  for (const item of output) {
    if (finalSeen.has(item.docId)) {
      duplicateResolvedIds.push(item.docId);
    }
    finalSeen.add(item.docId);
  }

  if (duplicateResolvedIds.length > 0) {
    console.warn(
      `[papers] Duplicate resolved placements detected for: ${duplicateResolvedIds.join(', ')}`
    );
  }

  const missing = wanted.filter((id) => !placed.has(id));

  if (missing.length > 0) {
    console.warn(
      `[papers] No placement found for (${missing.length}): ${missing.join(', ')}`
    );
  }

  let markerCount = 0;
  let fallbackCount = 0;
  for (const item of output) {
    if (item.source === 'marker') {
      markerCount += 1;
    } else {
      fallbackCount += 1;
    }
  }

  console.info(
    `[papers] Total: ${output.length}/${wanted.length} | ` +
      `Marker placements: ${markerCount} | ` +
      `Fallback placements: ${fallbackCount}`
  );

  if (output.length !== wanted.length) {
    console.warn(
      `[papers] Expected ${wanted.length} unique papers, got ${output.length}`
    );
  }

  return output;
}