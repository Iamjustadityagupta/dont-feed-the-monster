import { DisposableStore, getLiveDomListeners } from '../core/Disposable';
import { EventBus } from '../core/EventBus';
import { GameStateMachine } from '../core/GameStateMachine';
import { runReachabilityChecks } from './GameplayAssertions';
import { simulatePatrol } from './AIHarness';
import { MonsterMemory, MEMORY } from '../monster/MonsterMemory';
import { MonsterNavigation } from '../monster/MonsterNavigation';
import { NavigationGraph, segmentBlocked } from '../world/NavigationGraph';
import { Random } from '../core/Random';
import { CRAWLSPACES, PATROL_POINTS_XZ, getSolids } from '../world/LevelLayout';

declare const process: { exit(code: number): never };

interface Result { name: string; ok: boolean; detail?: string }
const results: Result[] = [];
function test(name: string, fn: () => void): void {
  try {
    fn();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({ name, ok: false, detail: error instanceof Error ? error.message : String(error) });
  }
}
function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

for (const c of runReachabilityChecks()) results.push({ name: `reachability: ${c.name}`, ok: c.ok, detail: c.detail });

test('EventBus: on/emit/unsubscribe', () => {
  const bus = new EventBus();
  let hits = 0;
  const off = bus.on('message', () => hits++);
  bus.emit('message', 'a');
  off();
  bus.emit('message', 'b');
  assert(hits === 1, `expected 1 hit, got ${hits}`);
  assert(bus.listenerCount() === 0, 'listener leaked after unsubscribe');
});

test('EventBus: a throwing listener does not block others', () => {
  const bus = new EventBus();
  const original = console.error;
  console.error = () => undefined;
  let reached = false;
  bus.on('message', () => { throw new Error('boom'); });
  bus.on('message', () => { reached = true; });
  bus.emit('message', 'x');
  console.error = original;
  assert(reached, 'second listener never ran');
});

test('GameStateMachine: legal and illegal transitions', () => {
  const sm = new GameStateMachine('menu');
  assert(!sm.transition('paused'), 'menu -> paused should be rejected');
  assert(sm.transition('playing'), 'menu -> playing should work');
  assert(sm.transition('paused') && sm.transition('playing'), 'pause/resume should work');
  assert(sm.transition('caught') && sm.transition('playing'), 'caught -> retry should work');
  assert(!sm.transition('howto'), 'playing -> howto should be rejected');
});

test('DisposableStore: listeners are removed and counted', () => {
  const target = new EventTarget();
  const store = new DisposableStore();
  const before = getLiveDomListeners();
  let calls = 0;
  store.addListener(target, 'ping', () => calls++);
  target.dispatchEvent(new Event('ping'));
  assert(getLiveDomListeners() === before + 1, 'listener not counted');
  store.dispose();
  target.dispatchEvent(new Event('ping'));
  assert(calls === 1, 'listener still fired after dispose');
  assert(getLiveDomListeners() === before, 'listener counter did not return to baseline');
  store.dispose(); // idempotent
});

test('DisposableStore: cleanup runs in reverse order', () => {
  const order: number[] = [];
  const store = new DisposableStore();
  store.add(() => order.push(1));
  store.add(() => order.push(2));
  store.dispose();
  assert(order.join() === '2,1', `got ${order.join()}`);
});

test('Navigation: unreachable target fails clearly and keeps the old goal', () => {
  const graph = new NavigationGraph(0.45);
  const nav = new MonsterNavigation(graph, PATROL_POINTS_XZ[0]);
  assert(nav.setGoal(PATROL_POINTS_XZ[3]).ok, 'patrol goal should be accepted');
  const c = CRAWLSPACES[0];
  const res = nav.setGoal({ x: (c.interior.minX + c.interior.maxX) / 2, z: (c.interior.minZ + c.interior.maxZ) / 2 });
  assert(!res.ok && res.reason !== undefined, 'crawlspace interior must be rejected with a reason');
  assert(nav.hasGoal, 'previous goal must survive a rejected request');
  const approx = nav.setGoal({ x: (c.interior.minX + c.interior.maxX) / 2, z: (c.interior.minZ + c.interior.maxZ) / 2 }, true);
  assert(approx.ok && approx.approximate, 'approximate mode should walk to the nearest reachable cell');
});

test('Navigation: path never passes through a wall', () => {
  const graph = new NavigationGraph(0.45);
  for (let i = 0; i < PATROL_POINTS_XZ.length; i++) {
    const path = graph.findPath(PATROL_POINTS_XZ[i], PATROL_POINTS_XZ[(i + 1) % PATROL_POINTS_XZ.length]);
    assert(path !== null, `leg ${i} has no path`);
    for (let k = 1; k < path!.points.length; k++) {
      const a = path!.points[k - 1];
      const b = path!.points[k];
      assert(graph.lineWalkable(a.x, a.z, b.x, b.z), `leg ${i} segment ${k} cuts through geometry`);
    }
  }
});

test('Navigation: same query gives the same path (predictable tie-breaking)', () => {
  const graph = new NavigationGraph(0.45);
  const a = graph.findPath(PATROL_POINTS_XZ[0], PATROL_POINTS_XZ[9]);
  const b = graph.findPath(PATROL_POINTS_XZ[0], PATROL_POINTS_XZ[9]);
  assert(JSON.stringify(a) === JSON.stringify(b), 'paths differ between identical queries');
});

test('AI simulation: 5 minutes, never stationary > 3 s with a reachable goal', () => {
  const r = simulatePatrol(300);
  console.log(`      sim: ${r.distanceTravelled.toFixed(0)} m, ${r.patrolLegsCompleted} patrol legs, ${r.investigations} sound events (${r.unreachableRejected} rejected as unreachable), longest stationary ${r.longestStationary.toFixed(2)} s, max stuck recoveries ${r.stuckRecoveries}`);
  assert(r.longestStationary <= 3, `stationary for ${r.longestStationary.toFixed(2)} s`);
  assert(r.patrolLegsCompleted >= 10, `only ${r.patrolLegsCompleted} patrol legs completed`);
  assert(r.unreachableRejected >= 1, 'crawlspace targets were never rejected');
});

test('Seeded AI: same seed => identical simulation', () => {
  const a = simulatePatrol(120, 4);
  const b = simulatePatrol(120, 4);
  assert(JSON.stringify(a) === JSON.stringify(b), 'two runs with one seed diverged');
  const r1 = new Random(77);
  const r2 = new Random(77);
  for (let i = 0; i < 50; i++) assert(r1.next() === r2.next(), 'PRNG sequences differ');
});

test('Perception: walls block sight, hidden-in-crawlspace player is out of sight', () => {
  const solids = getSolids();
  assert(segmentBlocked(-14, 10, -8, 10, solids), 'sight passes through the ward/mess wall');
  assert(segmentBlocked(-28, -2, -29.2, -5, solids), 'sight reaches the crawlspace corner past the wall');
  assert(!segmentBlocked(-6, 15.5, 8, 15.5, solids), 'open floor wrongly blocked');
});

test('Memory: repeated throws get less effective but never useless', () => {
  const m = new MonsterMemory();
  const first = m.throwEffectiveness();
  for (let i = 0; i < 10; i++) m.recordThrow();
  const later = m.throwEffectiveness();
  assert(later < first, 'repeating throws did not reduce effectiveness');
  assert(later >= MEMORY.throwEffectivenessFloor, 'effectiveness fell below the floor');
  assert(m.throws <= MEMORY.maxScore, 'throw score exceeded its cap');
});

test('Memory: locker use raises inspection odds without guaranteeing discovery; scores decay', () => {
  const m = new MonsterMemory();
  assert(m.lockersToCheck() === 0, 'it should not inspect lockers with no evidence');
  const base = m.lockerDiscoveryChance();
  for (let i = 0; i < 20; i++) m.recordLockerUse();
  assert(m.lockersToCheck() > 0, 'repeated locker use did not trigger inspections');
  assert(m.lockerDiscoveryChance() > base, 'discovery chance did not rise');
  assert(m.lockerDiscoveryChance() < 1 && m.lockerDiscoveryChance() <= MEMORY.lockerChanceCap, 'discovery became certain');
  m.decay(600);
  assert(m.lockerUses === 0 && m.throws === 0, 'scores did not decay back to zero');
});

let failed = 0;
for (const r of results) {
  if (!r.ok) failed++;
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  (${r.detail})` : ''}`);
}
console.log(failed ? `\n${failed} of ${results.length} failed` : `\nAll ${results.length} tests passed`);
if (failed) process.exit(1);
