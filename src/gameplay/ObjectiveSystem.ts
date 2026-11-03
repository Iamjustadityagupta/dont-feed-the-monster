import type { PlayerController } from '../player/PlayerController';
import type { WorldManager } from '../world/WorldManager';
import type { PuzzleProgress } from '../core/types';
import { PAPER_COUNT } from '../core/types';
import { CONFIG } from '../app/GameConfig';

/** Initial objective for the original game. */
export const STARTING_OBJECTIVE =
  'Search the facility for a security keycard.';

/** Default controls prompt. */
const DEFAULT_PROMPT =
  'CLICK TO CAPTURE MOUSE · G THROW DISTRACTION · F FLASHLIGHT · Q COMBINE';

/** "2/3" style counter, clamped so a transient over-count can never read 4/3. */
function counter(current: number, required: number): string {
  return `${Math.min(current, required)}/${required}`;
}

/**
 * Returns the current mission objective.
 *
 * The second parameter is optional so existing calls such as
 * getObjective(player.hasKeycard) continue working.
 *
 * With `progress` supplied the objective is derived purely from live puzzle state;
 * no guessed player action is involved.
 */
export function getObjective(
  hasKeycard: boolean,
  progress?: PuzzleProgress
): string {
  if (!progress) {
    return hasKeycard
      ? 'Return to the exit and use the security keycard.'
      : STARTING_OBJECTIVE;
  }

  if (progress.escaped || progress.stage === 'complete') {
    return 'You escaped the facility.';
  }

  switch (progress.stage) {
    case 'explore':
      return 'Explore the facility. Start opening drawers — quietly.';

    case 'find_keys':
      return `Search the drawers for the keys. (${counter(progress.drawersSearched, progress.requiredDrawers)} searched · ${counter(progress.drawerKeysCollected, progress.requiredDrawerKeys)} keys)`;

    case 'unlock_access_door':
      return `Unlock the three locks on the restricted door. (${counter(progress.locksUnlocked, progress.requiredLocks)})`;

    case 'collect_fragments':
      return `Collect the three fragments inside the restricted room. (${counter(progress.fragmentsCollected, progress.requiredFragments)})`;

    case 'combine_and_open_box':
      return progress.fragmentsCombined
        ? 'The pieces fit together. Open the box.'
        : 'Combine the three fragments (Q), then open the box.';

    case 'take_room_key':
      return 'Take the room key from the box.';

    case 'search_papers':
      return `Search the archive papers for the locker password. (${progress.papersRead}/${PAPER_COUNT} read)`;

    case 'unlock_locker':
      return 'Enter the password on the archive locker.';

    case 'escape':
      return hasKeycard || progress.hasKeycard
        ? 'Get to the exit and unlock it with the keycard.'
        : 'Take the keycard and get out.';

    default:
      break;
  }

  // Stage is missing or unexpected: fall back to whatever the raw counts say.
  if (progress.drawerKeysCollected < progress.requiredDrawerKeys) {
    const remaining = progress.requiredDrawerKeys - progress.drawerKeysCollected;
    return `Search the drawers for ${remaining} more key${remaining === 1 ? '' : 's'}. (${counter(progress.drawersSearched, progress.requiredDrawers)} searched)`;
  }

  if (progress.locksUnlocked < progress.requiredLocks) {
    const remaining = progress.requiredLocks - progress.locksUnlocked;
    return `Unlock the ${remaining} remaining door lock${remaining === 1 ? '' : 's'}.`;
  }

  if (progress.fragmentsCollected < progress.requiredFragments) {
    const remaining = progress.requiredFragments - progress.fragmentsCollected;
    return `Collect ${remaining} more fragment${remaining === 1 ? '' : 's'}.`;
  }

  if (!progress.fragmentsCombined) {
    return 'Combine the fragments (Q).';
  }

  if (!progress.boxOpened) {
    return 'Open the box.';
  }

  if (!progress.roomKeyTaken) {
    return 'Take the room key.';
  }

  if (!progress.passwordFound) {
    return 'Find the password written on one of the scattered papers.';
  }

  if (!progress.lockerUnlocked) {
    return 'Use the password to unlock the archive locker.';
  }

  if (!progress.hasKeycard) {
    return 'Take the keycard from the locker.';
  }

  return 'Use your security keycard to escape the facility.';
}

/** Returns the closest active interaction prompt. */
export function getInteractionPrompt(
  player: PlayerController,
  world: WorldManager
): string {
  if (player.hidden) {
    return 'E  /  LEAVE HIDING PLACE';
  }

  if (
    player.position.distanceTo(world.exitPosition) <
    CONFIG.player.interact.exitRange
  ) {
    return player.hasKeycard
      ? 'E  /  UNLOCK EXIT'
      : 'EXIT LOCKED · SECURITY KEYCARD REQUIRED';
  }

  const nearest = world.interactables
    .filter(
      (item) =>
        item.active &&
        item.position.distanceTo(player.position) < 2.2
    )
    .sort(
      (a, b) =>
        a.position.distanceTo(player.position) -
        b.position.distanceTo(player.position)
    )[0];

  if (!nearest) {
    return DEFAULT_PROMPT;
  }

  switch (nearest.kind) {
    case 'keycard':
      return 'E  /  PICK UP KEYCARD';

    case 'hiding':
      return `E  /  HIDE IN ${nearest.label.toUpperCase()}`;

    case 'note':
      return nearest.category === 'paper'
        ? 'E  /  READ'
        : `E  /  ${nearest.label.toUpperCase()}`;

    case 'door':
      return `E  /  ${nearest.label.toUpperCase()}`;

    case 'drawer':
      return `E  /  SEARCH ${nearest.label.toUpperCase()}`;

    case 'fragment':
      return 'E  /  TAKE FRAGMENT';

    case 'key':
      return `E  /  USE KEY ON ${nearest.label.toUpperCase()}`;

    case 'box':
      return 'E  /  OPEN BOX';

    case 'keyed_door':
      return 'E  /  UNLOCK WITH ROOM KEY';

    case 'password_locker':
      return 'E  /  ENTER PASSWORD';

    default:
      return `E  /  ${nearest.label.toUpperCase()}`;
  }
}