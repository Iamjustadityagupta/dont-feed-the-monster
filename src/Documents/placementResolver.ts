import * as THREE from 'three';

import { DOCUMENTS } from './DocumentRegistry';

import type {
  PaperPlacement
} from './PaperPickups';

export type PlacementSource = 'marker' | 'fallback';

export interface ResolvedPlacement extends PaperPlacement {
  source: PlacementSource;
  hostName: string;
}

const SURFACE =
  /desk|table|shelf|bench|counter|console|worktop|rack/i;

const MARKER = 'paperSpot';

export function resolvePlacements(
  scene: THREE.Scene,
  fallback: readonly PaperPlacement[]
): ResolvedPlacement[] {
  const hosts: THREE.Object3D[] = [];

  scene.traverse(object => {
    const isMarker = object.userData[MARKER] === true;

    const isNamedSurface =
      Boolean(object.name) &&
      SURFACE.test(object.name);

    if (isMarker || isNamedSurface) {
      hosts.push(object);
    }
  });

  const wanted = [...DOCUMENTS]
    .sort((a, b) => a.chapter - b.chapter)
    .map(document => document.id);

  const output: ResolvedPlacement[] = [];

  const bounds = new THREE.Box3();

  hosts.forEach((host, index) => {
    const docId = wanted[index];

    if (!docId) return;

    bounds.setFromObject(host);

    if (bounds.isEmpty()) return;

    const center = bounds.getCenter(
      new THREE.Vector3()
    );

    output.push({
      docId,
      x: center.x + (Math.random() - 0.5) * 0.35,
      z: center.z + (Math.random() - 0.5) * 0.35,
      rotationY: Math.random() * Math.PI,
      surfaceY: bounds.max.y,
      source: 'marker',
      hostName: host.name || '(unnamed)'
    });
  });

  const placed = new Set(
    output.map(item => item.docId)
  );

  for (const placement of fallback) {
    if (placed.has(placement.docId)) continue;

    output.push({
      ...placement,
      source: 'fallback',
      hostName: '(coordinate table)'
    });
  }

  const missing = wanted.filter(
    id => !output.some(item => item.docId === id)
  );

  if (missing.length > 0) {
    console.warn(
      `[papers] No placement found for: ${missing.join(', ')}`
    );
  }

  const markerCount = output.filter(
    item => item.source === 'marker'
  ).length;

  const fallbackCount = output.filter(
    item => item.source === 'fallback'
  ).length;

  console.info(
    `[papers] ${markerCount} marker placements, ` +
    `${fallbackCount} fallback placements`
  );

  return output;
}