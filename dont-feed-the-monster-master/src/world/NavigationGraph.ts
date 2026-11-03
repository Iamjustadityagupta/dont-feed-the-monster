import { WORLD_BOUNDS, getSolids, type Point2, type SolidSpec } from './LevelLayout';

/** Same square-vs-box rule the game uses for movement, so navigation and collision always agree. */
export function blockedAt(x: number, z: number, radius: number, solids: readonly SolidSpec[]): boolean {
  if (x < WORLD_BOUNDS.minX + radius || x > WORLD_BOUNDS.maxX - radius || z < WORLD_BOUNDS.minZ + radius || z > WORLD_BOUNDS.maxZ - radius) return true;
  for (const s of solids) {
    if (Math.abs(x - s.x) <= s.w / 2 + radius && Math.abs(z - s.z) <= s.d / 2 + radius) return true;
  }
  return false;
}

/** Segment vs axis-aligned box (slab method). Used for sight lines; only solids with blocksSight !== false count. */
export function segmentBlocked(ax: number, az: number, bx: number, bz: number, solids: readonly SolidSpec[]): boolean {
  const dx = bx - ax;
  const dz = bz - az;
  for (const s of solids) {
    if (s.blocksSight === false) continue;
    let t0 = 0;
    let t1 = 1;
    let hit = true;
    for (const axis of [0, 1] as const) {
      const origin = axis === 0 ? ax : az;
      const delta = axis === 0 ? dx : dz;
      const lo = (axis === 0 ? s.x - s.w / 2 : s.z - s.d / 2);
      const hi = (axis === 0 ? s.x + s.w / 2 : s.z + s.d / 2);
      if (Math.abs(delta) < 1e-9) {
        if (origin < lo || origin > hi) { hit = false; break; }
      } else {
        let ta = (lo - origin) / delta;
        let tb = (hi - origin) / delta;
        if (ta > tb) [ta, tb] = [tb, ta];
        t0 = Math.max(t0, ta);
        t1 = Math.min(t1, tb);
        if (t0 > t1) { hit = false; break; }
      }
    }
    if (hit) return true;
  }
  return false;
}

export interface PathResult { points: Point2[]; cost: number }

const NEIGHBOURS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

/**
 * Uniform grid of walkable cells for one body radius, searched with A*.
 * Deterministic: ties are broken by lower h-score, then lower cell index, so the same query gives the same path.
 */
export class NavigationGraph {
  readonly cols: number;
  readonly rows: number;
  private readonly walkable: Uint8Array;
  private readonly g: Float32Array;
  private readonly parent: Int32Array;
  private readonly seenStamp: Int32Array;
  private readonly closedStamp: Int32Array;
  private stamp = 0;
  private heap: number[] = [];
  private readonly fScore: Float32Array;
  private readonly hScore: Float32Array;

  constructor(
    readonly radius: number,
    readonly solids: readonly SolidSpec[] = getSolids(),
    readonly cell = 0.5,
  ) {
    this.cols = Math.ceil((WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX) / cell) + 1;
    this.rows = Math.ceil((WORLD_BOUNDS.maxZ - WORLD_BOUNDS.minZ) / cell) + 1;
    const n = this.cols * this.rows;
    this.walkable = new Uint8Array(n);
    this.g = new Float32Array(n);
    this.fScore = new Float32Array(n);
    this.hScore = new Float32Array(n);
    this.parent = new Int32Array(n);
    this.seenStamp = new Int32Array(n);
    this.closedStamp = new Int32Array(n);
    for (let j = 0; j < this.rows; j++) {
      for (let i = 0; i < this.cols; i++) {
        const c = this.center(i, j);
        this.walkable[j * this.cols + i] = blockedAt(c.x, c.z, radius, solids) ? 0 : 1;
      }
    }
  }

  center(i: number, j: number): Point2 {
    return { x: WORLD_BOUNDS.minX + i * this.cell, z: WORLD_BOUNDS.minZ + j * this.cell };
  }

  cellOf(x: number, z: number): [number, number] {
    return [Math.round((x - WORLD_BOUNDS.minX) / this.cell), Math.round((z - WORLD_BOUNDS.minZ) / this.cell)];
  }

  isWalkableCell(i: number, j: number): boolean {
    return i >= 0 && j >= 0 && i < this.cols && j < this.rows && this.walkable[j * this.cols + i] === 1;
  }

  isBlocked(x: number, z: number): boolean {
    return blockedAt(x, z, this.radius, this.solids);
  }

  /** Nearest walkable cell centre to a point (ring search), or null if none within maxRadius. */
  nearestWalkable(x: number, z: number, maxRadius = 4): Point2 | null {
    const [ci, cj] = this.cellOf(x, z);
    const maxR = Math.ceil(maxRadius / this.cell);
    let best: Point2 | null = null;
    let bestD = Infinity;
    for (let r = 0; r <= maxR; r++) {
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          if (!this.isWalkableCell(ci + di, cj + dj)) continue;
          const c = this.center(ci + di, cj + dj);
          const d = Math.hypot(c.x - x, c.z - z);
          if (d < bestD - 1e-9) { bestD = d; best = c; }
        }
      }
      if (best && bestD <= r * this.cell) break;
    }
    return best;
  }

  /** True if walking the straight segment keeps the body clear of every solid (sampled every 0.2 m). */
  lineWalkable(ax: number, az: number, bx: number, bz: number): boolean {
    const dist = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(1, Math.ceil(dist / 0.2));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      if (this.isBlocked(ax + (bx - ax) * t, az + (bz - az) * t)) return false;
    }
    return true;
  }

  /** All cell centres reachable from a start point (used by tests and for picking random reachable points). */
  reachableFrom(start: Point2): Point2[] {
    const s = this.nearestWalkable(start.x, start.z, 1);
    if (!s) return [];
    const [si, sj] = this.cellOf(s.x, s.z);
    const seen = new Uint8Array(this.cols * this.rows);
    const stack: Array<[number, number]> = [[si, sj]];
    seen[sj * this.cols + si] = 1;
    const out: Point2[] = [];
    while (stack.length) {
      const [i, j] = stack.pop()!;
      out.push(this.center(i, j));
      for (const [di, dj] of NEIGHBOURS) {
        const ni = i + di;
        const nj = j + dj;
        if (!this.isWalkableCell(ni, nj) || seen[nj * this.cols + ni]) continue;
        if (di !== 0 && dj !== 0 && !(this.isWalkableCell(i + di, j) && this.isWalkableCell(i, j + dj))) continue;
        seen[nj * this.cols + ni] = 1;
        stack.push([ni, nj]);
      }
    }
    return out;
  }

  /** A* between two points. Returns null when either end is not walkable or no route exists. */
  findPath(from: Point2, to: Point2): PathResult | null {
    const [si, sj] = this.cellOf(from.x, from.z);
    const [ti, tj] = this.cellOf(to.x, to.z);
    if (!this.isWalkableCell(si, sj) || !this.isWalkableCell(ti, tj)) return null;
    const cols = this.cols;
    const start = sj * cols + si;
    const goal = tj * cols + ti;
    this.stamp++;
    const stamp = this.stamp;
    this.heap.length = 0;
    this.g[start] = 0;
    this.parent[start] = -1;
    this.seenStamp[start] = stamp;
    this.hScore[start] = this.heuristic(si, sj, ti, tj);
    this.fScore[start] = this.hScore[start];
    this.push(start);
    while (this.heap.length) {
      const cur = this.pop();
      if (this.closedStamp[cur] === stamp) continue;
      this.closedStamp[cur] = stamp;
      if (cur === goal) return this.build(start, goal, from, to);
      const ci = cur % cols;
      const cj = (cur - ci) / cols;
      for (const [di, dj, cost] of NEIGHBOURS) {
        const ni = ci + di;
        const nj = cj + dj;
        if (!this.isWalkableCell(ni, nj)) continue;
        if (di !== 0 && dj !== 0 && !(this.isWalkableCell(ci + di, cj) && this.isWalkableCell(ci, cj + dj))) continue;
        const n = nj * cols + ni;
        if (this.closedStamp[n] === stamp) continue;
        const ng = this.g[cur] + cost;
        if (this.seenStamp[n] !== stamp || ng < this.g[n] - 1e-9) {
          this.seenStamp[n] = stamp;
          this.g[n] = ng;
          this.parent[n] = cur;
          this.hScore[n] = this.heuristic(ni, nj, ti, tj);
          this.fScore[n] = ng + this.hScore[n];
          this.push(n);
        }
      }
    }
    return null;
  }

  private heuristic(i: number, j: number, ti: number, tj: number): number {
    const dx = Math.abs(i - ti);
    const dy = Math.abs(j - tj);
    return (dx + dy) + (Math.SQRT2 - 2) * Math.min(dx, dy);
  }

  private build(start: number, goal: number, from: Point2, to: Point2): PathResult {
    const cells: Point2[] = [];
    for (let c = goal; c !== -1; c = this.parent[c]) {
      const i = c % this.cols;
      cells.push(this.center(i, (c - i) / this.cols));
      if (c === start) break;
    }
    cells.reverse();
    // Use the true endpoints, then string-pull: skip waypoints whenever a straight walk is clear.
    const raw: Point2[] = [{ x: from.x, z: from.z }, ...cells.slice(1, -1), { x: to.x, z: to.z }];
    const smooth: Point2[] = [raw[0]];
    let anchor = 0;
    while (anchor < raw.length - 1) {
      let next = anchor + 1;
      for (let k = raw.length - 1; k > anchor + 1; k--) {
        if (this.lineWalkable(raw[anchor].x, raw[anchor].z, raw[k].x, raw[k].z)) { next = k; break; }
      }
      smooth.push(raw[next]);
      anchor = next;
    }
    let cost = 0;
    for (let k = 1; k < smooth.length; k++) cost += Math.hypot(smooth[k].x - smooth[k - 1].x, smooth[k].z - smooth[k - 1].z);
    return { points: smooth, cost };
  }

  // Binary min-heap ordered by (f, h, index) for predictable tie-breaking.
  private less(a: number, b: number): boolean {
    if (this.fScore[a] !== this.fScore[b]) return this.fScore[a] < this.fScore[b];
    if (this.hScore[a] !== this.hScore[b]) return this.hScore[a] < this.hScore[b];
    return a < b;
  }

  private push(n: number): void {
    const h = this.heap;
    h.push(n);
    let i = h.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(h[i], h[p])) break;
      [h[i], h[p]] = [h[p], h[i]];
      i = p;
    }
  }

  private pop(): number {
    const h = this.heap;
    const top = h[0];
    const last = h.pop()!;
    if (h.length) {
      h[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < h.length && this.less(h[l], h[m])) m = l;
        if (r < h.length && this.less(h[r], h[m])) m = r;
        if (m === i) break;
        [h[i], h[m]] = [h[m], h[i]];
        i = m;
      }
    }
    return top;
  }
}
