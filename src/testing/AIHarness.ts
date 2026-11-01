import { MonsterNavigation } from '../monster/MonsterNavigation';
import { NavigationGraph } from '../world/NavigationGraph';
import { CRAWLSPACES, PATROL_POINTS_XZ, type Point2 } from '../world/LevelLayout';
import { Random } from '../core/Random';

export const MONSTER_NAV_RADIUS = 0.45;

export interface SimReport {
  seconds: number;
  /** Longest time the body stood still while it had a reachable goal and was not in a deliberate pause. */
  longestStationary: number;
  distanceTravelled: number;
  patrolLegsCompleted: number;
  investigations: number;
  unreachableRejected: number;
  stuckRecoveries: number;
}

/**
 * Headless Subject 09 movement: patrol legs, periodic investigate events at random reachable points, and strict
 * rejection of unreachable targets (crawlspace interiors). Uses the real graph and follower the game uses.
 */
export function simulatePatrol(seconds: number, seed = 9, dt = 1 / 30): SimReport {
  const graph = new NavigationGraph(MONSTER_NAV_RADIUS);
  const nav = new MonsterNavigation(graph, PATROL_POINTS_XZ[0]);
  const rng = new Random(seed);
  const reachable = graph.reachableFrom(PATROL_POINTS_XZ[0]);
  const report: SimReport = { seconds, longestStationary: 0, distanceTravelled: 0, patrolLegsCompleted: 0, investigations: 0, unreachableRejected: 0, stuckRecoveries: 0 };

  let patrolIndex = 1;
  let pause = 0;
  let nextEvent = 25;
  let investigating = false;
  let stationary = 0;
  nav.setGoal(PATROL_POINTS_XZ[patrolIndex]);

  for (let t = 0; t < seconds; t += dt) {
    if (pause > 0) {
      pause -= dt;
      stationary = 0;
      continue;
    }
    if (t >= nextEvent) {
      nextEvent += 20 + rng.range(0, 15);
      // Every other event targets a crawlspace interior, which must be rejected clearly.
      if (report.investigations % 2 === 1) {
        const c = CRAWLSPACES[Math.floor(rng.range(0, CRAWLSPACES.length))];
        const inside: Point2 = { x: (c.interior.minX + c.interior.maxX) / 2, z: (c.interior.minZ + c.interior.maxZ) / 2 };
        const res = nav.setGoal(inside, false);
        if (!res.ok) report.unreachableRejected++;
      } else {
        const spot = reachable[Math.floor(rng.range(0, reachable.length))];
        if (nav.setGoal(spot, false).ok) investigating = true;
      }
      report.investigations++;
    }
    const before = { x: nav.x, z: nav.z };
    const moved = nav.update(dt, investigating ? 2.4 : 1.4);
    report.distanceTravelled += moved;
    if (nav.recoveries > 0) report.stuckRecoveries = Math.max(report.stuckRecoveries, nav.recoveries);
    if (moved < 1e-4 && nav.hasGoal && !nav.arrived) stationary += dt; else stationary = 0;
    report.longestStationary = Math.max(report.longestStationary, stationary);
    void before;
    if (nav.arrived) {
      pause = investigating ? 2 : 1.2;
      if (!investigating) report.patrolLegsCompleted++;
      investigating = false;
      patrolIndex = (patrolIndex + 1) % PATROL_POINTS_XZ.length;
      const res = nav.setGoal(PATROL_POINTS_XZ[patrolIndex]);
      if (!res.ok) throw new Error(`patrol goal ${patrolIndex} rejected: ${res.reason}`);
    }
  }
  return report;
}
