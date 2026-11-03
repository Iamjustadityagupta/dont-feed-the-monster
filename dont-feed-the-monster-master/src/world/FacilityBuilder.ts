import * as THREE from 'three';
import type { Disposable } from '../core/Disposable';
import { createRng, type Rng } from '../core/Random';
import {
  DOORS, PROPS, ROOMS, WALLS, WALL_T,
  type DoorSpec, type PropSpec, type RoomSpec, type WallSpec,
} from './LevelLayout';

/**
 * Builds the visual architecture of the facility (floors, walls, trim, door frames, ceilings, ceiling services and
 * furniture) from the SAME data that collision and navigation read (LevelLayout). It never creates colliders; it is
 * purely visual, so it cannot make the render drift from the physics.
 *
 * Performance model:
 *  - Large textured surfaces (floors, ceilings, walls) are individual meshes whose UVs are scaled to world size, so
 *    the texture density is constant and never stretched.
 *  - Everything small (trim, frames, props, fixtures, debris) goes through an instancing batcher: one shared unit
 *    geometry per shape, one InstancedMesh per (shape, material, 20 m chunk). Frustum culling works per chunk.
 *  - All geometry, materials and textures are owned by the builder and released in dispose().
 */

export interface FixtureSpec {
  roomId: string;
  position: THREE.Vector3;
  color: number;
}

export interface FacilityBuilderOptions {
  seed?: number;
  /** Underside height of the ceiling. Walls in LevelLayout default to 4 m. */
  ceilingHeight?: number;
}

type Shape = 'box' | 'pipeX' | 'cylY';

interface Placement {
  x: number; y: number; z: number;
  w: number; h: number; d: number;
  rx?: number; ry?: number; rz?: number;
}

const CHUNK = 20;
const FLOOR_TILE = 2;
const WALL_TILE = 3;
const CEIL_TILE = 2.4;

const TMP_POS = new THREE.Vector3();
const TMP_SCALE = new THREE.Vector3();
const TMP_QUAT = new THREE.Quaternion();
const TMP_EULER = new THREE.Euler();
const TMP_MAT = new THREE.Matrix4();

export class FacilityBuilder implements Disposable {
  readonly root = new THREE.Group();
  /** Fluorescent fixture positions, so FacilityLighting can put real lights where the geometry is. */
  readonly fixtures: FixtureSpec[] = [];

  private readonly rng: Rng;
  private readonly ceilingY: number;
  private readonly geometries = new Set<THREE.BufferGeometry>();
  private readonly materials = new Set<THREE.Material>();
  private readonly textures = new Set<THREE.Texture>();
  private readonly matCache = new Map<string, THREE.MeshStandardMaterial>();
  private readonly shapeGeo = new Map<Shape, THREE.BufferGeometry>();
  private readonly batches = new Map<string, { shape: Shape; material: THREE.Material; items: Placement[] }>();
  private readonly materialIds = new Map<THREE.Material, number>();
  private built = false;

  private tex!: { concrete: THREE.Texture; tile: THREE.Texture; ceiling: THREE.Texture; stain: THREE.Texture };

  constructor(options: FacilityBuilderOptions = {}) {
    this.rng = createRng(options.seed ?? 4242);
    this.ceilingY = options.ceilingHeight ?? 4;
    this.root.name = 'facility';
  }

  /** Builds everything once. Safe to call again: it returns the existing group. */
  build(): THREE.Group {
    if (this.built) return this.root;
    this.built = true;
    this.tex = {
      concrete: this.makeTexture('concrete'),
      tile: this.makeTexture('tile'),
      ceiling: this.makeTexture('ceiling'),
      stain: this.makeTexture('stain'),
    };
    this.buildFloorsAndCeilings();
    for (const w of WALLS) this.buildWall(w);
    for (const d of DOORS) this.buildDoorFrame(d);
    for (const r of ROOMS) this.buildCeilingServices(r);
    for (const p of PROPS) this.buildProp(p);
    this.buildFloorGrime();
    this.buildDebris();
    this.flushBatches();
    return this.root;
  }

  dispose(): void {
    this.root.removeFromParent();
    this.root.clear();
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    for (const t of this.textures) t.dispose();
    this.geometries.clear();
    this.materials.clear();
    this.textures.clear();
    this.matCache.clear();
    this.shapeGeo.clear();
    this.batches.clear();
    this.fixtures.length = 0;
    this.built = false;
  }

  // ---- Materials ---------------------------------------------------------------------------------------------

  private mat(key: string, color: number, roughness: number, metalness: number, map?: THREE.Texture): THREE.MeshStandardMaterial {
    const id = `${key}:${color}:${roughness}:${metalness}:${map ? map.uuid : ''}`;
    const cached = this.matCache.get(id);
    if (cached) return cached;
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness, map: map ?? null });
    this.matCache.set(id, m);
    this.materials.add(m);
    return m;
  }

  private paint(color: number): THREE.MeshStandardMaterial { return this.mat('paint', color, 0.9, 0.05); }
  private metal(color: number): THREE.MeshStandardMaterial { return this.mat('metal', color, 0.45, 0.65); }
  private rubber(color = 0x14181b): THREE.MeshStandardMaterial { return this.mat('rubber', color, 0.95, 0.0); }
  private ceramic(color = 0xc9d2d4): THREE.MeshStandardMaterial { return this.mat('ceramic', color, 0.3, 0.05); }

  private glow(color: number, intensity = 1.2): THREE.MeshStandardMaterial {
    const id = `glow:${color}:${intensity}`;
    const cached = this.matCache.get(id);
    if (cached) return cached;
    const m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.6, metalness: 0 });
    this.matCache.set(id, m);
    this.materials.add(m);
    return m;
  }

  private glass(): THREE.MeshStandardMaterial {
    const id = 'glass';
    const cached = this.matCache.get(id);
    if (cached) return cached;
    const m = new THREE.MeshStandardMaterial({
      color: 0x9fc4d0, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.22, depthWrite: false,
    });
    this.matCache.set(id, m);
    this.materials.add(m);
    return m;
  }

  private makeTexture(kind: 'concrete' | 'tile' | 'ceiling' | 'stain'): THREE.Texture {
    const size = kind === 'stain' ? 128 : 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const rng = this.rng.fork(`tex-${kind}`);
    if (ctx) {
      if (kind === 'stain') {
        const g = ctx.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2);
        g.addColorStop(0, 'rgba(8,10,10,0.55)');
        g.addColorStop(0.6, 'rgba(8,10,10,0.22)');
        g.addColorStop(1, 'rgba(8,10,10,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, size, size);
      } else {
        ctx.fillStyle = kind === 'tile' ? '#c7ccce' : '#d4d8d8';
        ctx.fillRect(0, 0, size, size);
        // Fine grain so flat colour never looks like plastic.
        for (let i = 0; i < 2600; i += 1) {
          const v = rng.int(150, 230);
          ctx.fillStyle = `rgba(${v},${v},${v},${rng.range(0.05, 0.22)})`;
          ctx.fillRect(rng.range(0, size), rng.range(0, size), rng.range(1, 3), rng.range(1, 3));
        }
        // Soft grime blotches.
        for (let i = 0; i < 14; i += 1) {
          ctx.fillStyle = `rgba(30,34,30,${rng.range(0.03, 0.09)})`;
          ctx.beginPath();
          ctx.arc(rng.range(0, size), rng.range(0, size), rng.range(8, 40), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.strokeStyle = 'rgba(40,44,46,0.55)';
        if (kind === 'tile') {
          ctx.lineWidth = 3;
          ctx.strokeRect(0, 0, size, size);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(size / 2, 0); ctx.lineTo(size / 2, size);
          ctx.moveTo(0, size / 2); ctx.lineTo(size, size / 2);
          ctx.stroke();
        } else if (kind === 'ceiling') {
          ctx.lineWidth = 4;
          ctx.strokeRect(0, 0, size, size);
        } else {
          // Concrete: faint panel seams and a few scratches.
          ctx.lineWidth = 2;
          ctx.strokeRect(0, 0, size, size);
          ctx.lineWidth = 1;
          for (let i = 0; i < 6; i += 1) {
            ctx.beginPath();
            const x = rng.range(0, size);
            const y = rng.range(0, size);
            ctx.moveTo(x, y);
            ctx.lineTo(x + rng.range(-30, 30), y + rng.range(-30, 30));
            ctx.stroke();
          }
        }
      }
    }
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    this.textures.add(t);
    return t;
  }

  // ---- Instancing batcher ------------------------------------------------------------------------------------

  private shape(shape: Shape): THREE.BufferGeometry {
    const cached = this.shapeGeo.get(shape);
    if (cached) return cached;
    let g: THREE.BufferGeometry;
    if (shape === 'box') g = new THREE.BoxGeometry(1, 1, 1);
    else if (shape === 'cylY') g = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
    else g = new THREE.CylinderGeometry(0.5, 0.5, 1, 10).rotateZ(Math.PI / 2);
    this.shapeGeo.set(shape, g);
    this.geometries.add(g);
    return g;
  }

  private matId(m: THREE.Material): number {
    let id = this.materialIds.get(m);
    if (id === undefined) {
      id = this.materialIds.size;
      this.materialIds.set(m, id);
    }
    return id;
  }

  /** Queue a centred box. (x, y, z) is the centre; sizes are full extents. */
  private b(material: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number, rot?: { x?: number; y?: number; z?: number }): void {
    this.queue('box', material, { x, y, z, w, h, d, rx: rot?.x, ry: rot?.y, rz: rot?.z });
  }
  /** Horizontal pipe along X (scale w = length, h and d = diameter). */
  private pipe(material: THREE.Material, x: number, y: number, z: number, length: number, dia: number, rotY = 0): void {
    this.queue('pipeX', material, { x, y, z, w: length, h: dia, d: dia, ry: rotY });
  }
  /** Vertical cylinder. */
  private cyl(material: THREE.Material, x: number, y: number, z: number, dia: number, h: number): void {
    this.queue('cylY', material, { x, y, z, w: dia, h, d: dia });
  }

  private queue(shape: Shape, material: THREE.Material, p: Placement): void {
    const key = `${shape}|${this.matId(material)}|${Math.floor((p.x + 100) / CHUNK)}|${Math.floor((p.z + 100) / CHUNK)}`;
    let batch = this.batches.get(key);
    if (!batch) {
      batch = { shape, material, items: [] };
      this.batches.set(key, batch);
    }
    batch.items.push(p);
  }

  private flushBatches(): void {
    for (const batch of this.batches.values()) {
      const mesh = new THREE.InstancedMesh(this.shape(batch.shape), batch.material, batch.items.length);
      batch.items.forEach((p, i) => {
        TMP_POS.set(p.x, p.y, p.z);
        TMP_EULER.set(p.rx ?? 0, p.ry ?? 0, p.rz ?? 0);
        TMP_QUAT.setFromEuler(TMP_EULER);
        TMP_SCALE.set(p.w, p.h, p.d);
        TMP_MAT.compose(TMP_POS, TMP_QUAT, TMP_SCALE);
        mesh.setMatrixAt(i, TMP_MAT);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      this.root.add(mesh);
    }
    this.batches.clear();
  }

  // ---- Textured slabs (UVs scaled to world size) -------------------------------------------------------------

  private texturedBox(w: number, h: number, d: number, tile: number): THREE.BoxGeometry {
    const g = new THREE.BoxGeometry(w, h, d);
    const uv = g.getAttribute('uv') as THREE.BufferAttribute;
    // BoxGeometry face order: +x, -x, +y, -y, +z, -z; four vertices per face.
    const dims: Array<[number, number]> = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let face = 0; face < 6; face += 1) {
      const [su, sv] = dims[face];
      for (let v = 0; v < 4; v += 1) {
        const i = face * 4 + v;
        uv.setXY(i, uv.getX(i) * (su / tile), uv.getY(i) * (sv / tile));
      }
    }
    uv.needsUpdate = true;
    this.geometries.add(g);
    return g;
  }

  private slab(x: number, y: number, z: number, w: number, h: number, d: number, tile: number, material: THREE.Material): THREE.Mesh {
    const mesh = new THREE.Mesh(this.texturedBox(w, h, d, tile), material);
    mesh.position.set(x, y, z);
    this.root.add(mesh);
    return mesh;
  }

  // ---- Floors and ceilings -----------------------------------------------------------------------------------

  private buildFloorsAndCeilings(): void {
    // Dark sub-floor and roof deck under everything, so there are never see-through gaps beneath walls.
    this.slab(0, -0.5, 0, 62, 0.8, 50, 8, this.paint(0x161c21));
    this.slab(0, this.ceilingY + 0.45, 0, 62, 0.5, 50, 8, this.paint(0x10161a));

    for (const r of ROOMS) {
      const w = r.maxX - r.minX - WALL_T;
      const d = r.maxZ - r.minZ - WALL_T;
      const cx = (r.minX + r.maxX) / 2;
      const cz = (r.minZ + r.maxZ) / 2;
      this.slab(cx, -0.03, cz, w, 0.06, d, FLOOR_TILE, this.mat('floor', r.floor, 0.55, 0.08, this.tex.tile));
      this.slab(cx, this.ceilingY + 0.1, cz, w, 0.2, d, CEIL_TILE, this.mat('ceil', 0x9aa4a8, 0.95, 0.0, this.tex.ceiling));
    }
  }

  // ---- Walls -------------------------------------------------------------------------------------------------

  private buildWall(w: WallSpec): void {
    const h = w.h ?? this.ceilingY;
    const colour = w.color ?? 0x39444c;
    this.slab(w.x, h / 2, w.z, w.w, h, w.d, WALL_TILE, this.mat('wall', colour, 0.88, 0.05, this.tex.concrete));

    const alongX = w.w >= w.d;
    const length = alongX ? w.w : w.d;
    const thick = alongX ? w.d : w.w;
    if (length < 0.7) return;

    const skirt = this.rubber(0x0f1417);
    const rail = this.metal(0x5d6b73);
    const cornice = this.paint(0x1d262c);
    for (const side of [-1, 1]) {
      const off = side * (thick / 2 + 0.025);
      const place = (y: number, height: number, depth: number, m: THREE.Material): void => {
        if (alongX) this.b(m, w.x, y, w.z + off, length, height, depth);
        else this.b(m, w.x + off, y, w.z, depth, height, length);
      };
      place(0.09, 0.18, 0.05, skirt);                 // skirting board
      place(1.05, 0.07, 0.07, rail);                  // handrail / chair rail
      place(h - 0.07, 0.14, 0.09, cornice);           // cornice where wall meets ceiling
    }
    // Structural pilasters on long walls every ~6 m break up flat surfaces.
    if (length >= 8 && h >= 3.8) {
      const count = Math.floor(length / 6);
      for (let i = 0; i < count; i += 1) {
        const o = -length / 2 + (i + 0.5) * (length / count);
        for (const side of [-1, 1]) {
          const off = side * (thick / 2 + 0.05);
          if (alongX) this.b(cornice, w.x + o, h / 2, w.z + off, 0.32, h, 0.1);
          else this.b(cornice, w.x + off, h / 2, w.z + o, 0.1, h, 0.32);
        }
      }
    }
  }

  // ---- Doorways ----------------------------------------------------------------------------------------------

  private buildDoorFrame(d: DoorSpec): void {
    const alongZ = d.axis === 'z'; // wall runs along Z, opening spans Z
    const wallT = WALL_T;
    const at = (along: number, y: number, lenAlong: number, h: number, depth: number, m: THREE.Material): void => {
      if (alongZ) this.b(m, d.x, y, d.z + along, depth, h, lenAlong);
      else this.b(m, d.x + along, y, d.z, lenAlong, h, depth);
    };

    if (d.crawl) {
      // Low hazard header plus teal posts: reads as "player-sized gap only".
      at(0, 3.1, d.width + 0.3, 1.8, wallT + 0.06, this.mat('hazard', 0xc99a1c, 0.6, 0.3));
      for (const side of [-1, 1]) at(side * (d.width / 2 + 0.05), 1.1, 0.08, 2.2, wallT + 0.08, this.glow(0x4fe0c0, 0.9));
      return;
    }

    const frame = this.metal(0x2a343b);
    const jamb = 0.16;
    for (const side of [-1, 1]) {
      at(side * (d.width / 2 + jamb / 2), 1.7, jamb, 3.4, wallT + 0.12, frame);      // jambs proud of the wall
      at(side * (d.width / 2 + jamb / 2), 1.7, jamb + 0.04, 3.4, wallT - 0.1, this.paint(0x0c1115)); // recess shadow line
    }
    at(0, 3.7, d.width + jamb * 2, 0.6, wallT + 0.12, frame);                          // header
    at(0, 3.38, d.width, 0.05, wallT + 0.14, this.glow(0x4a8fa5, 0.8));                // header light strip
    at(0, 0.012, d.width, 0.024, wallT + 0.5, this.metal(0x7b878d));                   // floor transition strip
    // Status lamp above the frame: green = open route.
    at(0, 3.92, 0.3, 0.1, wallT + 0.14, this.glow(0x4fe0a0, 1.4));
  }

  // ---- Ceiling services --------------------------------------------------------------------------------------

  private buildCeilingServices(r: RoomSpec): void {
    const w = r.maxX - r.minX;
    const d = r.maxZ - r.minZ;
    const underside = this.ceilingY;
    const lampColor = new THREE.Color(r.lamp.color).lerp(new THREE.Color(0xffffff), 0.55).getHex();
    const fixtureOn = this.glow(lampColor, 1.5);
    const housing = this.metal(0x1b2328);

    // Fluorescent fixtures on a regular grid (about every 8 m).
    const nx = Math.max(1, Math.round(w / 8));
    const nz = Math.max(1, Math.round(d / 8));
    for (let i = 0; i < nx; i += 1) {
      for (let j = 0; j < nz; j += 1) {
        const x = r.minX + (i + 0.5) * (w / nx);
        const z = r.minZ + (j + 0.5) * (d / nz);
        this.b(housing, x, underside - 0.03, z, 1.5, 0.06, 0.42);
        this.b(fixtureOn, x, underside - 0.07, z, 1.3, 0.03, 0.26);
        this.fixtures.push({ roomId: r.id, position: new THREE.Vector3(x, underside - 0.12, z), color: lampColor });
      }
    }

    // Pipe run and cable tray along opposite long edges, hung just below the ceiling.
    const pipeMat = this.metal(0x6c7a80);
    const pipeAlt = this.mat('pipe', 0x8a3a30, 0.6, 0.4);
    const inset = WALL_T / 2 + 0.35;
    this.pipe(pipeMat, (r.minX + r.maxX) / 2, underside - 0.3, r.minZ + inset, w - 1.6, 0.16);
    this.pipe(pipeAlt, (r.minX + r.maxX) / 2, underside - 0.5, r.minZ + inset + 0.05, w - 1.6, 0.1);
    const trayZ = r.maxZ - inset;
    const trayMat = this.metal(0x394349);
    this.b(trayMat, (r.minX + r.maxX) / 2, underside - 0.22, trayZ, w - 1.6, 0.05, 0.5);
    for (let x = r.minX + 1.2; x < r.maxX - 1; x += 1.4) this.b(trayMat, x, underside - 0.16, trayZ, 0.04, 0.14, 0.5);
    for (const side of [-1, 1]) this.b(trayMat, (r.minX + r.maxX) / 2, underside - 0.15, trayZ + side * 0.25, w - 1.6, 0.14, 0.03);
    this.b(this.rubber(0x0a0d0f), (r.minX + r.maxX) / 2, underside - 0.19, trayZ, w - 2, 0.04, 0.2); // cable bundle

    // Vents (two per room): grille plate with dark slats.
    const ventMat = this.metal(0x4a565c);
    const slat = this.rubber(0x05080a);
    for (const f of [0.28, 0.72]) {
      const vx = r.minX + w * f;
      const vz = r.minZ + d * (f > 0.5 ? 0.3 : 0.7);
      this.b(ventMat, vx, underside - 0.02, vz, 1.0, 0.04, 0.6);
      for (let s = 0; s < 4; s += 1) this.b(slat, vx, underside - 0.045, vz - 0.2 + s * 0.13, 0.84, 0.01, 0.05);
    }

    // Maintenance panel on the ceiling near one corner.
    this.b(this.paint(0x2a343a), r.minX + 3, underside - 0.015, r.minZ + 3, 0.9, 0.03, 0.9);
  }

  // ---- Props -------------------------------------------------------------------------------------------------

  private buildProp(p: PropSpec): void {
    const body = this.paint(p.color);
    const steel = this.metal(0x9ab0b8);
    const dark = this.rubber();
    const long = p.w >= p.d;
    const top = p.h;

    switch (p.kind) {
      case 'bed': {
        const frame = this.metal(0x6d7b82);
        const sheet = this.paint(0xb8c4c0);
        const legH = 0.28;
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
          this.b(frame, p.x + sx * (p.w / 2 - 0.05), legH / 2, p.z + sz * (p.d / 2 - 0.05), 0.06, legH, 0.06);
        }
        this.b(frame, p.x, legH + 0.03, p.z, p.w, 0.06, p.d);
        this.b(this.paint(0x8c9a9a), p.x, legH + 0.13, p.z + 0.1, p.w * 0.92, 0.14, p.d * 0.82);   // mattress
        this.b(sheet, p.x, legH + 0.21, p.z + 0.2, p.w * 0.9, 0.03, p.d * 0.6);                      // sheet
        this.b(this.paint(0xd7dedb), p.x, legH + 0.26, p.z - p.d * 0.38, p.w * 0.7, 0.1, 0.4);       // pillow
        this.b(frame, p.x, legH + 0.32, p.z - p.d / 2 + 0.02, p.w, 0.6, 0.04);                       // headboard
        for (const sx of [-1, 1]) this.b(frame, p.x + sx * (p.w / 2 - 0.02), legH + 0.3, p.z + 0.2, 0.03, 0.04, p.d * 0.55); // side rails
        break;
      }
      case 'shelf': {
        const upright = this.metal(0x4b5961);
        const stockA = this.paint(0x6a5a40);
        const stockB = this.paint(0x4d6a74);
        const stockC = this.paint(0x8a8f86);
        const length = long ? p.w : p.d;
        const posts = Math.max(2, Math.round(length / 1.5) + 1);
        for (let i = 0; i < posts; i += 1) {
          const o = -length / 2 + (i * length) / (posts - 1);
          for (const side of [-1, 1]) {
            if (long) this.b(upright, p.x + o, top / 2, p.z + side * (p.d / 2 - 0.03), 0.06, top, 0.06);
            else this.b(upright, p.x + side * (p.w / 2 - 0.03), top / 2, p.z + o, 0.06, top, 0.06);
          }
        }
        const levels = [0.15, 0.7, 1.25, 1.8].filter((y) => y < top - 0.15);
        const stock = [stockA, stockB, stockC];
        for (const y of levels) {
          this.b(steel, p.x, y, p.z, p.w + 0.02, 0.05, p.d + 0.02);
          const n = Math.floor(length / 0.8);
          for (let i = 0; i < n; i += 1) {
            if (this.rng.chance(0.2)) continue; // a few gaps tell a story of looted shelves
            const o = -length / 2 + 0.4 + i * 0.8;
            const sh = this.rng.range(0.22, 0.45);
            const m = stock[this.rng.int(0, stock.length)];
            if (long) this.b(m, p.x + o, y + 0.025 + sh / 2, p.z, 0.6, sh, p.d * 0.78);
            else this.b(m, p.x, y + 0.025 + sh / 2, p.z + o, p.w * 0.78, sh, 0.6);
          }
        }
        break;
      }
      case 'crate': {
        const batten = this.paint(0x4a3f2d);
        this.b(body, p.x, top / 2, p.z, p.w, top, p.d);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
          this.b(batten, p.x + sx * (p.w / 2), top / 2, p.z + sz * (p.d / 2), 0.1, top + 0.02, 0.1);
        }
        this.b(batten, p.x, top * 0.5, p.z, p.w + 0.03, 0.08, p.d + 0.03);
        this.b(steel, p.x, top + 0.02, p.z, p.w + 0.04, 0.04, p.d + 0.04);
        break;
      }
      case 'pillar': {
        const base = this.paint(0x1e262c);
        this.b(body, p.x, top / 2, p.z, p.w, top, p.d);
        this.b(base, p.x, 0.25, p.z, p.w + 0.3, 0.5, p.d + 0.3);
        this.b(base, p.x, top - 0.15, p.z, p.w + 0.2, 0.3, p.d + 0.2);
        this.b(this.glow(0xa23b32, 0.6), p.x, 0.9, p.z, p.w + 0.04, 0.2, p.d + 0.04);
        this.b(this.mat('hazard', 0xc99a1c, 0.6, 0.3), p.x, 1.25, p.z, p.w + 0.03, 0.06, p.d + 0.03);
        break;
      }
      case 'planter': {
        this.b(body, p.x, top / 2, p.z, p.w, top, p.d);
        this.b(this.paint(0x1a1410), p.x, top + 0.01, p.z, p.w - 0.3, 0.03, p.d - 0.3); // soil
        this.b(steel, p.x, top - 0.02, p.z, p.w + 0.06, 0.05, p.d + 0.06);
        const leaf = this.mat('leaf', 0x2f6a4f, 0.9, 0.0);
        for (let i = 0; i < 7; i += 1) {
          const lx = p.x + this.rng.range(-p.w / 2 + 0.5, p.w / 2 - 0.5);
          const lz = p.z + this.rng.range(-p.d / 2 + 0.5, p.d / 2 - 0.5);
          this.cyl(leaf, lx, top + 0.3, lz, this.rng.range(0.25, 0.5), this.rng.range(0.4, 0.7));
        }
        break;
      }
      case 'hood': {
        const frontZ = p.z < 0 ? 1 : -1; // face toward the room interior
        this.b(body, p.x, top / 2, p.z, p.w, top, p.d);
        this.b(steel, p.x, 0.95, p.z + frontZ * (p.d / 2 + 0.03), p.w * 0.9, 0.06, 0.1);        // work surface lip
        this.b(this.glass(), p.x, 1.75, p.z + frontZ * (p.d / 2 + 0.02), p.w * 0.85, 1.3, 0.03); // sash glass
        this.b(steel, p.x, 1.1, p.z + frontZ * (p.d / 2 + 0.03), p.w * 0.88, 0.04, 0.04);
        this.b(this.glow(0x6fb5cf, 0.45), p.x, top - 0.2, p.z + frontZ * (p.d / 2 + 0.03), p.w * 0.7, 0.05, 0.03);
        break;
      }
      case 'table': {
        const leg = this.metal(0x3b454a);
        this.b(body, p.x, top - 0.03, p.z, p.w, 0.06, p.d);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
          this.b(leg, p.x + sx * (p.w / 2 - 0.1), (top - 0.06) / 2, p.z + sz * (p.d / 2 - 0.1), 0.06, top - 0.06, 0.06);
        }
        // Two stools per table: low, so they stay decor rather than collision.
        for (const sx of [-1, 1]) {
          this.cyl(dark, p.x + sx * (p.w / 4), 0.22, p.z + 0.85, 0.36, 0.1);
          this.cyl(leg, p.x + sx * (p.w / 4), 0.11, p.z + 0.85, 0.06, 0.22);
        }
        break;
      }
      case 'bench': {
        const leg = this.metal(0x3b454a);
        this.b(this.metal(0x56626a), p.x, top - 0.03, p.z, p.w, 0.06, p.d);
        this.b(dark, p.x, top, p.z, p.w - 0.1, 0.012, p.d - 0.1); // epoxy-black work surface
        const legs = Math.max(2, Math.round(p.w / 2) + 1);
        for (let i = 0; i < legs; i += 1) {
          const o = -p.w / 2 + 0.1 + (i * (p.w - 0.2)) / (legs - 1);
          for (const sz of [-1, 1]) this.b(leg, p.x + o, (top - 0.06) / 2, p.z + sz * (p.d / 2 - 0.08), 0.06, top - 0.06, 0.06);
        }
        this.b(leg, p.x, 0.25, p.z, p.w - 0.2, 0.04, p.d - 0.2);
        // Lab clutter: flasks and a small instrument.
        const flask = this.glass();
        for (let i = 0; i < 4; i += 1) {
          const o = -p.w / 2 + 0.8 + i * (p.w - 1.6) / 3;
          this.cyl(flask, p.x + o, top + 0.12, p.z + this.rng.range(-0.2, 0.2), 0.14, 0.24);
        }
        this.b(this.paint(0xc9d2d4), p.x + p.w * 0.3, top + 0.15, p.z, 0.4, 0.3, 0.3);
        this.b(this.glow(0x3fa6c4, 0.6), p.x + p.w * 0.3, top + 0.2, p.z + (p.z < 0 ? 0.16 : -0.16), 0.2, 0.1, 0.02);
        break;
      }
      case 'counter': {
        this.b(body, p.x, top / 2, p.z, p.w, top, p.d);
        this.b(dark, p.x, 0.07, p.z, p.w + 0.02, 0.14, p.d + 0.02);                    // kick plate
        this.b(this.ceramic(0xb7c0c2), p.x, top + 0.03, p.z, p.w + 0.1, 0.06, p.d + 0.1); // worktop
        const drawers = Math.max(1, Math.round((long ? p.w : p.d) / 1.2));
        const len = long ? p.w : p.d;
        for (let i = 0; i < drawers; i += 1) {
          const o = -len / 2 + (i + 0.5) * (len / drawers);
          if (long) this.b(steel, p.x + o, top * 0.62, p.z + p.d / 2 + 0.015, 0.3, 0.03, 0.03);
          else this.b(steel, p.x + p.w / 2 + 0.015, top * 0.62, p.z + o, 0.03, 0.03, 0.3);
        }
        break;
      }
      case 'console': {
        this.b(body, p.x, top / 2, p.z, p.w, top, p.d);
        const faceSign = p.x > 0 ? -1 : 1;
        const faceOff = long ? 0 : faceSign * (p.w * 0.1);
        this.b(this.glow(0x3fa6c4, 0.8), p.x + faceOff, top + 0.2, p.z, long ? p.w * 0.6 : 0.05, 0.32, long ? 0.05 : p.d * 0.6, { x: long ? -0.4 : 0, z: long ? 0 : 0.4 * faceSign });
        this.b(dark, p.x, top + 0.02, p.z, p.w * 0.9, 0.04, p.d * 0.9);
        this.b(this.glow(0xe0b040, 1.0), p.x + (long ? p.w * 0.35 : 0), top + 0.06, p.z + (long ? 0 : p.d * 0.35), 0.06, 0.03, 0.06);
        break;
      }
    }
  }

  // ---- Environmental storytelling ----------------------------------------------------------------------------

  private buildFloorGrime(): void {
    // A few translucent stains per room, each at its own tiny height so they never z-fight with each other.
    const stainMat = new THREE.MeshBasicMaterial({
      map: this.tex.stain, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    this.materials.add(stainMat);
    const stainGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.geometries.add(stainGeo);
    let layer = 0;
    for (const r of ROOMS) {
      const rng = this.rng.fork(`grime-${r.id}`);
      const count = r.id === 'hall' || r.id === 'exit' ? 5 : 3;
      for (let i = 0; i < count; i += 1) {
        const s = rng.range(1.4, 3.6);
        const mesh = new THREE.Mesh(stainGeo, stainMat);
        mesh.position.set(rng.range(r.minX + 2.5, r.maxX - 2.5), 0.004 + layer * 0.0004, rng.range(r.minZ + 2.5, r.maxZ - 2.5));
        mesh.scale.set(s, 1, s * rng.range(0.6, 1.2));
        mesh.rotation.y = rng.range(0, Math.PI);
        mesh.renderOrder = 1;
        this.root.add(mesh);
        layer += 1;
      }
    }
  }

  private buildDebris(): void {
    // Loose papers and a few dropped tools. All flat (< 4 cm), so they are decor and never snag the player.
    const paper = this.paint(0xd8d4c2);
    const tool = this.metal(0x8a8f92);
    const rng = this.rng.fork('debris');
    const rooms: Array<[string, number]> = [['records', 9], ['security', 5], ['lab', 5], ['hall', 4], ['storage', 3], ['ward', 4]];
    for (const [id, n] of rooms) {
      const r = ROOMS.find((x) => x.id === id);
      if (!r) continue;
      for (let i = 0; i < n; i += 1) {
        const x = rng.range(r.minX + 2, r.maxX - 2);
        const z = rng.range(r.minZ + 2, r.maxZ - 2);
        if (PROPS.some((p) => Math.abs(x - p.x) < p.w / 2 + 0.3 && Math.abs(z - p.z) < p.d / 2 + 0.3)) continue;
        this.b(paper, x, 0.012 + i * 0.001, z, rng.range(0.22, 0.32), 0.006, rng.range(0.3, 0.4), { y: rng.range(0, Math.PI) });
        if (i % 4 === 0) this.b(tool, x + 0.5, 0.025, z + 0.3, 0.3, 0.03, 0.05, { y: rng.range(0, Math.PI) });
      }
    }
  }
}