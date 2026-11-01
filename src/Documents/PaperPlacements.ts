import type {
  PaperPlacement
} from './PaperPickups';

/**
 * Temporary fallback coordinates.
 *
 * These coordinates must be checked against your actual level.
 * Prefer scene objects tagged with userData.paperSpot = true.
 */
export const PAPER_PLACEMENTS: readonly PaperPlacement[] = [
  // Recovery Ward (player start room, see LevelLayout.PLAYER_START = (-20, 18)): open floor a few
  // steps from spawn, clear of the bed row (x=-28.4) and the console prop (x=-22.5, z=9.4).
  { docId: 'doc_containment_warning', x: -21, z: 14, rotationY: 0.4 },
  { docId: 'doc_hiding_protocol', x: 18.9, z: -11.6, rotationY: -0.9 },
  { docId: 'doc_maintenance_log', x: 24.1, z: -18.0, rotationY: 1.2 },
  { docId: 'doc_power_component', x: 31.7, z: -22.5, rotationY: -0.2 },
  { docId: 'doc_observation_transcript', x: 39.0, z: -30.4, rotationY: 0.8 },
  { docId: 'doc_behavioural_note', x: 44.3, z: -33.1, rotationY: -1.1 },
  { docId: 'doc_final_credentials', x: 52.8, z: -41.0, rotationY: 0.1 },
  { docId: 'doc_classified_summary', x: 57.2, z: -44.6, rotationY: 0.6 },
  { docId: 'doc_feeding_log', x: 61.5, z: -52.2, rotationY: -0.5 },
  { docId: 'doc_containment_incident', x: 66.0, z: -55.8, rotationY: 1.4 }
];