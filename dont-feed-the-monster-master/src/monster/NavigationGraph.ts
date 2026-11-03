
import type { Vec2 } from '../world/CollisionTypes';
import type { CollisionWorld } from '../world/CollisionWorld';

interface Node {
  index: number;
  g: number;
  h: number;
  f: number;
}

export class NavigationGraph {
  private readonly cols: number;
  private readonly rows: number;
  private readonly minX: number;
  private readonly minZ: number;

  constructor(
    private readonly world: CollisionWorld,
    private readonly radius = 0.6,
    private readonly cell = 0.4,
  ) {
    if (cell <= 0) {
      throw new Error('NavigationGraph cell size must be greater than zero.');
    }

    const bounds = world.bounds;

    this.minX = bounds.minX;
    this.minZ = bounds.minZ;

    this.cols = Math.ceil((bounds.maxX - bounds.minX) / cell) + 1;
    this.rows = Math.ceil((bounds.maxZ - bounds.minZ) / cell) + 1;
  }

  private index(i: number, j: number): number {
    return j * this.cols + i;
  }

  private coordinates(index: number): [number, number] {
    const j = Math.floor(index / this.cols);
    return [index - j * this.cols, j];
  }

  private center(i: number, j: number): Vec2 {
    return {
      x: this.minX + i * this.cell,
      z: this.minZ + j * this.cell,
    };
  }

  private cellOf(position: Vec2): [number, number] {
    return [
      Math.round((position.x - this.minX) / this.cell),
      Math.round((position.z - this.minZ) / this.cell),
    ];
  }

  private validCell(i: number, j: number): boolean {
    return i >= 0 && j >= 0 && i < this.cols && j < this.rows;
  }

  private walkable(i: number, j: number): boolean {
    if (!this.validCell(i, j)) return false;
    return this.world.isWalkable(this.center(i, j), this.radius);
  }

  nearestWalkable(position: Vec2): Vec2 | null {
    if (this.world.isWalkable(position, this.radius)) {
      return { ...position };
    }

    return this.world.nearestWalkablePoint(position, this.radius);
  }

  findPath(from: Vec2, to: Vec2): Vec2[] | null {
    const start = this.nearestWalkable(from);
    const goal = this.nearestWalkable(to);

    if (!start || !goal) return null;

    const [si, sj] = this.cellOf(start);
    const [ti, tj] = this.cellOf(goal);

    if (!this.walkable(si, sj) || !this.walkable(ti, tj)) {
      return null;
    }

    const startIndex = this.index(si, sj);
    const goalIndex = this.index(ti, tj);

    if (startIndex === goalIndex) {
      return [{ ...from }, { ...to }];
    }

    const count = this.cols * this.rows;
    const gScore = new Float64Array(count);
    const parent = new Int32Array(count);
    const closed = new Uint8Array(count);

    gScore.fill(Infinity);
    parent.fill(-1);

    const open: Node[] = [];

    const heuristic = (i: number, j: number): number => {
      const dx = Math.abs(i - ti);
      const dz = Math.abs(j - tj);

      return dx + dz + (Math.SQRT2 - 2) * Math.min(dx, dz);
    };

    const push = (node: Node): void => {
      open.push(node);
      let i = open.length - 1;

      while (i > 0) {
        const p = Math.floor((i - 1) / 2);
        if (open[p].f <= open[i].f) break;

        [open[p], open[i]] = [open[i], open[p]];
        i = p;
      }
    };

    const pop = (): Node | undefined => {
      if (open.length === 0) return undefined;

      const result = open[0];
      const last = open.pop()!;

      if (open.length > 0) {
        open[0] = last;
        let i = 0;

        while (true) {
          const left = i * 2 + 1;
          const right = left + 1;
          let smallest = i;

          if (left < open.length && open[left].f < open[smallest].f) {
            smallest = left;
          }

          if (right < open.length && open[right].f < open[smallest].f) {
            smallest = right;
          }

          if (smallest === i) break;

          [open[i], open[smallest]] = [open[smallest], open[i]];
          i = smallest;
        }
      }

      return result;
    };

    const initialH = heuristic(si, sj);

    gScore[startIndex] = 0;

    push({
      index: startIndex,
      g: 0,
      h: initialH,
      f: initialH,
    });

    const directions = [
      [1, 0, 1],
      [-1, 0, 1],
      [0, 1, 1],
      [0, -1, 1],
      [1, 1, Math.SQRT2],
      [1, -1, Math.SQRT2],
      [-1, 1, Math.SQRT2],
      [-1, -1, Math.SQRT2],
    ] as const;

    while (open.length > 0) {
      const current = pop()!;
      const currentIndex = current.index;

      if (closed[currentIndex]) continue;

      if (currentIndex === goalIndex) {
        const path: Vec2[] = [];
        let cursor = goalIndex;

        while (cursor !== -1) {
          const [i, j] = this.coordinates(cursor);
          path.push(this.center(i, j));

          if (cursor === startIndex) break;
          cursor = parent[cursor];
        }

        path.reverse();

        if (path.length === 0) return null;

        path[0] = { ...from };
        path[path.length - 1] = { ...to };

        return this.smoothPath(path);
      }

      closed[currentIndex] = 1;

      const [ci, cj] = this.coordinates(currentIndex);

      for (const [di, dj, cost] of directions) {
        const ni = ci + di;
        const nj = cj + dj;

        if (!this.walkable(ni, nj)) continue;

        if (di !== 0 && dj !== 0) {
          if (!this.walkable(ci + di, cj)) continue;
          if (!this.walkable(ci, cj + dj)) continue;
        }

        const nextIndex = this.index(ni, nj);

        if (closed[nextIndex]) continue;

        const tentativeG = gScore[currentIndex] + cost;

        if (tentativeG >= gScore[nextIndex]) continue;

        parent[nextIndex] = currentIndex;
        gScore[nextIndex] = tentativeG;

        const h = heuristic(ni, nj);

        push({
          index: nextIndex,
          g: tentativeG,
          h,
          f: tentativeG + h,
        });
      }
    }

    return null;
  }

  private smoothPath(path: Vec2[]): Vec2[] {
    if (path.length <= 2) return path;

    const result: Vec2[] = [path[0]];
    let anchor = 0;

    while (anchor < path.length - 1) {
      let next = anchor + 1;

      for (
        let candidate = path.length - 1;
        candidate > anchor + 1;
        candidate--
      ) {
        if (this.lineWalkable(path[anchor], path[candidate])) {
          next = candidate;
          break;
        }
      }

      result.push(path[next]);
      anchor = next;
    }

    return result;
  }

  private lineWalkable(from: Vec2, to: Vec2): boolean {
    const distance = Math.hypot(to.x - from.x, to.z - from.z);
    const steps = Math.max(1, Math.ceil(distance / 0.15));

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;

      const point = {
        x: from.x + (to.x - from.x) * t,
        z: from.z + (to.z - from.z) * t,
      };

      if (!this.world.isWalkable(point, this.radius)) {
        return false;
      }
    }

    return true;
  }
}
