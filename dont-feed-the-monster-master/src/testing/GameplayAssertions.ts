import {
  CRAWLSPACES, DOORS, EXIT_POSITION, KEYCARD_POSITION, LOCKERS, NOTES, PATROL_POINTS_XZ, PLAYER_START,
  getSolids, type Point2, type SolidSpec,
} from '../world/LevelLayout';
import { NavigationGraph, blockedAt, segmentBlocked } from '../world/NavigationGraph';

const CELL = 0.25;
export const PLAYER_RADIUS = 0.35;
export const MONSTER_RADIUS = 0.45;

export interface Check { name: string; ok: boolean; detail: string }

const key = (i: number, j: number): string => `${i},${j}`;

/** Fine (0.25 m) flood fill using the same collision rule as the game; 4-connected, so it cannot squeeze through diagonal gaps. */
export function floodFill(start: Point2, radius: number, solids: readonly SolidSpec[] = getSolids()): Set<string> {
  const si = Math.round(start.x / CELL);
  const sj = Math.round(start.z / CELL);
  const seen = new Set<string>();
  if (blockedAt(si * CELL, sj * CELL, radius, solids)) return seen;
  const queue: Array<[number, number]> = [[si, sj]];
  seen.add(key(si, sj));
  const steps: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  while (queue.length) {
    const [i, j] = queue.pop()!;
    for (const [di, dj] of steps) {
      const ni = i + di;
      const nj = j + dj;
      const k = key(ni, nj);
      if (seen.has(k) || blockedAt(ni * CELL, nj * CELL, radius, solids)) continue;
      seen.add(k);
      queue.push([ni, nj]);
    }
  }
  return seen;
}

export function distanceToReachable(point: Point2, cells: Set<string>): number {
  let best = Infinity;
  for (const k of cells) {
    const [i, j] = k.split(',').map(Number);
    const d = Math.hypot(i * CELL - point.x, j * CELL - point.z);
    if (d < best) best = d;
  }
  return best;
}

export function runReachabilityChecks(): Check[] {
  const checks: Check[] = [];
  const solids = getSolids();
  const reach = floodFill(PLAYER_START, PLAYER_RADIUS, solids);
  checks.push({ name: 'player start is walkable', ok: reach.size > 0, detail: `${reach.size} reachable cells` });

  // The game needs an interactable within 2.0 AND (looked at OR within 1.3). We assert 1.3 so it never depends on the raycast.
  const targets: Array<[string, Point2, number]> = [
    ['keycard', KEYCARD_POSITION, 1.3],
    ...NOTES.map((n): [string, Point2, number] => [`note: ${n.label}`, n, 1.3]),
    ...LOCKERS.map((l, i): [string, Point2, number] => [`locker ${i} (${l.label})`, l, 1.3]),
    ['exit door', EXIT_POSITION, 3.0],
  ];
  for (const [name, point, limit] of targets) {
    const d = distanceToReachable(point, reach);
    checks.push({ name: `${name} reachable by player`, ok: d <= limit, detail: `closest reachable cell ${d.toFixed(2)} m (limit ${limit})` });
  }

  // Crawlspaces: the player must get in, the monster must not.
  const monsterNav = new NavigationGraph(MONSTER_RADIUS, solids);
  const monsterReach = monsterNav.reachableFrom(PATROL_POINTS_XZ[0]);
  for (const c of CRAWLSPACES) {
    const cx = (c.interior.minX + c.interior.maxX) / 2;
    const cz = (c.interior.minZ + c.interior.maxZ) / 2;
    const playerD = distanceToReachable({ x: cx, z: cz }, reach);
    checks.push({ name: `crawlspace "${c.id}" enterable by player`, ok: playerD <= CELL, detail: `gap ${playerD.toFixed(2)} m` });
    const monsterIn = monsterReach.some((p) => p.x >= c.interior.minX && p.x <= c.interior.maxX && p.z >= c.interior.minZ && p.z <= c.interior.maxZ);
    checks.push({ name: `crawlspace "${c.id}" is monster-proof`, ok: !monsterIn, detail: monsterIn ? 'MONSTER CAN ENTER' : 'no monster-walkable cell inside' });
  }

  // Doorways: wide doors pass both; narrow service gaps pass only the player.
  for (const d of DOORS) {
    const label = `${d.crawl ? 'service gap' : 'doorway'} at (${d.x}, ${d.z})`;
    const playerOk = distanceToReachable({ x: d.x, z: d.z }, reach) <= CELL;
    const monsterOk = monsterReach.some((p) => Math.hypot(p.x - d.x, p.z - d.z) <= 0.5);
    if (d.crawl) checks.push({ name: `${label}: player yes / monster no`, ok: playerOk && !monsterOk, detail: `player ${playerOk}, monster ${monsterOk}` });
    else checks.push({ name: `${label}: both can pass`, ok: playerOk && monsterOk, detail: `player ${playerOk}, monster ${monsterOk}` });
  }

  // Patrol legs validated with the real navigation graph (A*), not a flood-fill approximation.
  PATROL_POINTS_XZ.forEach((from, i) => {
    const toIndex = (i + 1) % PATROL_POINTS_XZ.length;
    const path = monsterNav.findPath(from, PATROL_POINTS_XZ[toIndex]);
    checks.push({ name: `patrol leg ${i} -> ${toIndex} has an A* path`, ok: path !== null, detail: path ? `${path.points.length} waypoints, ${path.cost.toFixed(1)} m` : 'NO PATH' });
  });

  // Sight: walls must block vision; open floor must not.
  checks.push({ name: 'no vision through the ward/mess wall', ok: segmentBlocked(-14, 10, -8, 10, solids) === true && segmentBlocked(-12.5, 21, -9.5, 21, solids) === true, detail: 'segments crossing the x=-11 wall are blocked' });
  checks.push({ name: 'open mess-hall floor is visible', ok: segmentBlocked(-6, 15.5, 8, 15.5, solids) === false, detail: 'clear line between tables' });
  return checks;
}

declare const process: { argv: string[]; exit(code: number): never };

function main(): void {
  const checks = runReachabilityChecks();
  for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}  (${c.detail})`);
  const failed = checks.filter((c) => !c.ok).length;
  console.log(failed ? `\n${failed} check(s) failed` : '\nAll reachability checks passed');
  if (failed) process.exit(1);
}

// Run directly with `npm run test:reach`; TestScenarios imports runReachabilityChecks without triggering this.
if (typeof process !== 'undefined' && process.argv[1] && /GameplayAssertions/.test(process.argv[1])) main();
