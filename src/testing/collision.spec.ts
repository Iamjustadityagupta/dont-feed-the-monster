
import { describe, expect, it } from 'vitest';

import { CollisionWorld } from '../world/CollisionWorld';
import { buildCollisionGeometry } from '../world/geometryFromLayout';

const createWorld = (): CollisionWorld =>
  new CollisionWorld(
    buildCollisionGeometry({
      BOUNDS: {
        minX: 0,
        maxX: 20,
        minZ: 0,
        maxZ: 20,
      },
      SOLIDS: [
        {
          id: 'wall',
          minX: 5,
          maxX: 6,
          minZ: 0,
          maxZ: 12,
        },
        {
          id: 'corner',
          minX: 10,
          maxX: 11,
          minZ: 5,
          maxZ: 6,
        },
      ],
    }),
  );

describe('CollisionWorld', () => {
  it('blocks a wall and slides along it', () => {
    const world = createWorld();

    const result = world.moveCircle(
      { x: 4, z: 6 },
      { x: 3, z: 0 },
      0.3,
    );

    expect(result.position.x).toBeLessThan(5);
    expect(result.blockedX).toBe(true);
  });

  it('prevents tunnelling through a wall with a large movement delta', () => {
    const world = createWorld();

    const result = world.moveCircle(
      { x: 4, z: 6 },
      { x: 4, z: 0 },
      0.3,
    );

    expect(result.position.x).toBeLessThan(5);
    expect(result.blockedX).toBe(true);
  });

  it('slides along the Z axis when X movement is blocked', () => {
    const world = createWorld();

    const result = world.moveCircle(
      { x: 4.8, z: 6 },
      { x: 1, z: 2 },
      0.3,
    );

    expect(result.position.x).toBeLessThan(5);
    expect(result.position.z).toBeGreaterThan(6);
    expect(result.blockedX).toBe(true);
  });

  it('reports no line of sight through a wall', () => {
    const world = createWorld();

    expect(
      world.hasLineOfSight(
        { x: 2, z: 6 },
        { x: 9, z: 6 },
      ),
    ).toBe(false);

    expect(
      world.hasLineOfSight(
        { x: 2, z: 3 },
        { x: 4, z: 3 },
      ),
    ).toBe(true);
  });

  it('respects actor height when checking crawlspace clearance', () => {
    const world = new CollisionWorld(
      buildCollisionGeometry({
        BOUNDS: {
          minX: 0,
          maxX: 10,
          minZ: 0,
          maxZ: 10,
        },
        CRAWLSPACES: [
          {
            id: 'crawlspace-test',
            minX: 4,
            maxX: 6,
            minZ: 4,
            maxZ: 6,
            minHeight: 1.2,
          },
        ],
      }),
    );

    expect(
      world.hasClearance(
        { x: 5, z: 5 },
        { radius: 0.3, height: 1.0 },
      ),
    ).toBe(true);

    expect(
      world.hasClearance(
        { x: 5, z: 5 },
        { radius: 0.4, height: 1.8 },
      ),
    ).toBe(false);
  });

  it('produces deterministic results for repeated movement', () => {
    const firstWorld = createWorld();
    const secondWorld = createWorld();

    const first = firstWorld.moveCircle(
      { x: 4, z: 6 },
      { x: 3, z: 1 },
      0.3,
    );

    const second = secondWorld.moveCircle(
      { x: 4, z: 6 },
      { x: 3, z: 1 },
      0.3,
    );

    expect(first).toEqual(second);
  });
});
