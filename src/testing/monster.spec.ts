
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

import { CollisionWorld } from '../world/CollisionWorld';
import { buildCollisionGeometry } from '../world/geometryFromLayout';
import { NavigationGraph } from '../monster/NavigationGraph';
import { MonsterPerception } from '../monster/MonsterPerception';
import { MonsterStateMachine } from '../monster/MonsterStateMachine';
import { DEFAULT_MONSTER_CONFIG } from '../monster/MonsterConfig';

const makeWorld = (walls = true): CollisionWorld => {
  return new CollisionWorld(
    buildCollisionGeometry({
      BOUNDS: {
        minX: 0,
        maxX: 24,
        minZ: 0,
        maxZ: 10,
      },
      WALLS: walls
        ? [
            {
              id: 'divider',
              x1: 11.5,
              z1: 0,
              x2: 11.5,
              z2: 10,
              thickness: 0.3,
            },
          ]
        : [],
      DOORS: [],
      CRAWLSPACES: [],
      LOCKERS: [],
      INTERACTABLES: [],
    }),
  );
};

const makeBrain = (world: CollisionWorld): MonsterStateMachine => {
  const config = {
    ...DEFAULT_MONSTER_CONFIG,
    arrivalRadius: 0.4,
  };

  const nav = new NavigationGraph(world, 0.6, 0.4);
  const perception = new MonsterPerception(world, config);

  return new MonsterStateMachine(
    {
      world,
      nav,
      config,
      perception,
      seed: 7,
      onStateChange: () => undefined,
    },
    { x: 2, z: 5 },
  );
};

const player = (x: number, z: number) => ({
  position: { x, z },
  crouched: false,
  hidden: false,
  noiseMultiplier: 1,
});

describe('monster perception', () => {
  it('sees through open space but not through walls', () => {
    const world = makeWorld();
    const perception = new MonsterPerception(
      world,
      DEFAULT_MONSTER_CONFIG,
    );

    expect(
      perception.canSee(
        { x: 2, z: 5 },
        Math.PI / 2,
        player(6, 5),
      ),
    ).toBe(true);

    expect(
      perception.canSee(
        { x: 2, z: 5 },
        Math.PI / 2,
        player(16, 5),
      ),
    ).toBe(false);
  });

  it('cannot see a hidden player', () => {
    const world = makeWorld();
    const perception = new MonsterPerception(
      world,
      DEFAULT_MONSTER_CONFIG,
    );

    expect(
      perception.canSee(
        { x: 2, z: 5 },
        0,
        { ...player(3, 5), hidden: true },
      ),
    ).toBe(false);
  });

  it('muffles sound through walls', () => {
    const world = makeWorld();
    const perception = new MonsterPerception(
      world,
      DEFAULT_MONSTER_CONFIG,
    );

    const event = {
      id: 's1',
      position: new THREE.Vector3(16, 0, 5),
      loudness: 1,
      category: 'impact' as const,
      time: 0,
    };

    const heard = perception.loudestAudible(
      { x: 2, z: 5 },
      [event],
    );

    expect(heard?.effectiveLoudness ?? 0).toBeLessThan(0.6);
  });
});

describe('monster state machine', () => {
  it('starts in patrol and respects the first-contact grace window', () => {
    const brain = makeBrain(makeWorld());

    expect(brain.state).toBe('patrol');
    expect(brain.inGrace).toBe(true);
  });

  it('transitions to chase when it sees the player', () => {
    const brain = makeBrain(makeWorld(false));

    brain.update(0.05, player(4, 5), []);

    expect(brain.state).toBe('chase');
  });

  it('investigates a heard sound', () => {
    const brain = makeBrain(makeWorld(false));

    brain.hearSound(
      {
        id: 's',
        position: new THREE.Vector3(3, 0, 5),
        loudness: 0.9,
        category: 'impact',
        time: 0,
      },
      0.9,
    );

    expect(brain.state).toBe('investigate');
  });

  it('never moves farther than speed times delta', () => {
    const brain = makeBrain(makeWorld(false));
    const before = { ...brain.currentPosition };

    brain.update(0.1, player(20, 5), []);

    const moved = Math.hypot(
      brain.currentPosition.x - before.x,
      brain.currentPosition.z - before.z,
    );

    expect(moved).toBeLessThanOrEqual(
      DEFAULT_MONSTER_CONFIG.chaseSpeed * 0.1 + 0.001,
    );
  });

  it('keeps locker effectiveness above its configured floor', () => {
    const brain = makeBrain(makeWorld());

    for (let i = 0; i < 20; i += 1) {
      brain.registerLockerUse();
    }

    expect(brain.lockerEffectiveness).toBeGreaterThanOrEqual(
      DEFAULT_MONSTER_CONFIG.adaptationFloor - 0.00001,
    );
  });

  it('ignores illegal transitions without corrupting state', () => {
    const brain = makeBrain(makeWorld());
    const spy = vi.fn();

    brain.transition('searchLost', 'jump');

    expect(brain.state).toBe('patrol');
    expect(spy).not.toHaveBeenCalled();
  });
});
