import * as THREE from 'three';
import type { Disposable } from '../core/Disposable';

/**
 * World-space wall signage.
 *
 * A sign is a real object that belongs to the architecture: a thin backing plate sits flush against the wall, an
 * inset printed face sits a few millimetres in front of the plate, and an emissive trim strip runs along the bottom
 * edge. All sizes are in metres and every sign of the same size shares one set of geometries.
 *
 * Mounting convention: `x`, `z` is the point on the WALL FACE where the centre of the sign sits, and `rotY` is the
 * direction the sign faces (0 = +z, PI = -z, PI/2 = +x, -PI/2 = -x). The factory pushes the sign out of the wall
 * by half the plate depth plus a tiny gap, so it never intersects the wall and never z-fights with it.
 */
export type SignTone = 'clinical' | 'restricted' | 'danger' | 'safe';
export type SignArrow = 'left' | 'right' | 'up';

export interface WallSignSpec {
  text: string;
  /** Second, smaller line (floor, wing, access level). */
  subtitle?: string;
  /** Short room code shown in a boxed badge on the left, e.g. "B2-W". */
  code?: string;
  /** Arrow drawn on the right-hand side, from the point of view of someone reading the sign. */
  arrow?: SignArrow;
  /** Centre of the sign on the wall face. */
  x: number;
  y: number;
  z: number;
  rotY: number;
  /** Text accent colour (hex). */
  color: number;
  tone?: SignTone;
  /** Sign width in metres (default 3.0). */
  width?: number;
  /** Sign height in metres (default 0.6). */
  height?: number;
}

interface ToneStyle { face: string; border: string; strip: number; stripIntensity: number }

const TONES: Record<SignTone, ToneStyle> = {
  clinical: { face: '#0d1a21', border: '#58c9de', strip: 0x58c9de, stripIntensity: 0.9 },
  safe: { face: '#0b1d1b', border: '#4fe0c0', strip: 0x4fe0c0, stripIntensity: 0.9 },
  restricted: { face: '#1b1410', border: '#e0a43a', strip: 0xe0a43a, stripIntensity: 0.8 },
  danger: { face: '#1c0e0e', border: '#d8493c', strip: 0xff3a2a, stripIntensity: 1.1 },
};

/** Backing plate depth and the small gap that keeps layers from z-fighting. */
const PLATE_DEPTH = 0.05;
const FACE_GAP = 0.004;
const WALL_GAP = 0.002;
/** Printed-texture density. 320 px per metre stays crisp at reading distance without large textures. */
const PX_PER_METRE = 320;

const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;

export class SignFactory implements Disposable {
  private readonly geometries = new Map<string, THREE.BufferGeometry>();
  private readonly textures: THREE.Texture[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly plateMaterial: THREE.MeshStandardMaterial;
  private readonly stripMaterials = new Map<SignTone, THREE.MeshStandardMaterial>();

  constructor(private readonly maxAnisotropy = 4) {
    this.plateMaterial = new THREE.MeshStandardMaterial({ color: 0x12181d, roughness: 0.55, metalness: 0.5 });
    this.materials.push(this.plateMaterial);
  }

  /** Builds one sign and returns a group ready to be added to the scene. */
  create(spec: WallSignSpec): THREE.Group {
    const width = spec.width ?? 3.0;
    const height = spec.height ?? 0.6;
    const tone = spec.tone ?? 'clinical';
    const group = new THREE.Group();
    group.name = `sign:${spec.text}`;

    const plate = new THREE.Mesh(this.box(width, height, PLATE_DEPTH), this.plateMaterial);
    group.add(plate);

    const face = new THREE.Mesh(
      this.plane(width - 0.07, height - 0.07),
      this.faceMaterial(spec, width, height, tone),
    );
    face.position.z = PLATE_DEPTH / 2 + FACE_GAP;
    group.add(face);

    const strip = new THREE.Mesh(this.box(width - 0.12, 0.018, 0.012), this.stripMaterial(tone));
    strip.position.set(0, -height / 2 + 0.035, PLATE_DEPTH / 2 + FACE_GAP + 0.004);
    group.add(strip);

    // Push the whole sign out of the wall along its facing direction.
    const offset = PLATE_DEPTH / 2 + WALL_GAP;
    group.position.set(spec.x + Math.sin(spec.rotY) * offset, spec.y, spec.z + Math.cos(spec.rotY) * offset);
    group.rotation.y = spec.rotY;
    return group;
  }

  private box(w: number, h: number, d: number): THREE.BufferGeometry {
    const key = `b:${w.toFixed(3)}:${h.toFixed(3)}:${d.toFixed(3)}`;
    let g = this.geometries.get(key);
    if (!g) {
      g = new THREE.BoxGeometry(w, h, d);
      this.geometries.set(key, g);
    }
    return g;
  }

  private plane(w: number, h: number): THREE.BufferGeometry {
    const key = `p:${w.toFixed(3)}:${h.toFixed(3)}`;
    let g = this.geometries.get(key);
    if (!g) {
      g = new THREE.PlaneGeometry(w, h);
      this.geometries.set(key, g);
    }
    return g;
  }

  private stripMaterial(tone: SignTone): THREE.MeshStandardMaterial {
    let m = this.stripMaterials.get(tone);
    if (!m) {
      const t = TONES[tone];
      m = new THREE.MeshStandardMaterial({ color: t.strip, emissive: t.strip, emissiveIntensity: t.stripIntensity });
      this.stripMaterials.set(tone, m);
      this.materials.push(m);
    }
    return m;
  }

  private faceMaterial(spec: WallSignSpec, width: number, height: number, tone: SignTone): THREE.Material {
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * PX_PER_METRE);
    canvas.height = Math.round(height * PX_PER_METRE);
    const ctx = canvas.getContext('2d');
    if (ctx) this.paint(ctx, canvas.width, canvas.height, spec, TONES[tone]);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = this.maxAnisotropy;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    this.textures.push(texture);

    // Unlit so the lettering stays readable in dark rooms; the facility lighting does not wash it out either.
    const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
    this.materials.push(material);
    return material;
  }

  private paint(ctx: CanvasRenderingContext2D, w: number, h: number, spec: WallSignSpec, tone: ToneStyle): void {
    const margin = Math.round(h * 0.14);
    ctx.fillStyle = tone.face;
    ctx.fillRect(0, 0, w, h);

    // Subtle vertical gradient so the face does not read as a flat colour block.
    const shade = ctx.createLinearGradient(0, 0, 0, h);
    shade.addColorStop(0, 'rgba(255,255,255,0.06)');
    shade.addColorStop(1, 'rgba(0,0,0,0.18)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, w, h);

    // Inset border with consistent margins.
    const bw = Math.max(3, Math.round(h * 0.035));
    ctx.strokeStyle = tone.border;
    ctx.lineWidth = bw;
    ctx.strokeRect(bw / 2 + 2, bw / 2 + 2, w - bw - 4, h - bw - 4);

    // Reserve horizontal space for the optional code badge and arrow, then centre the text in what remains.
    let left = margin + bw;
    let right = w - margin - bw;
    const accent = hex(spec.color);

    if (spec.code) {
      const badgeW = Math.round(h * 1.25);
      const badgeH = Math.round(h * 0.56);
      const bx = left;
      const by = Math.round((h - badgeH) / 2);
      ctx.fillStyle = tone.border;
      ctx.fillRect(bx, by, badgeW, badgeH);
      ctx.fillStyle = tone.face;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      this.fitText(ctx, spec.code, badgeW - 16, Math.round(badgeH * 0.62), 700);
      ctx.fillText(spec.code, bx + badgeW / 2, by + badgeH / 2 + 2);
      left = bx + badgeW + margin;
    }

    if (spec.arrow) {
      const size = Math.round(h * 0.5);
      const cx = right - size / 2;
      this.drawArrow(ctx, spec.arrow, cx, h / 2, size, tone.border);
      right = cx - size / 2 - margin;
    }

    const centreX = (left + right) / 2;
    const maxW = right - left;
    const hasSub = Boolean(spec.subtitle);
    const mainY = hasSub ? h * 0.42 : h * 0.5;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = accent;
    const mainSize = this.fitText(ctx, spec.text, maxW, Math.round(h * (hasSub ? 0.42 : 0.5)), 700);
    ctx.fillText(spec.text, centreX, mainY + mainSize * 0.04);

    if (spec.subtitle) {
      ctx.fillStyle = 'rgba(220,232,238,0.78)';
      const subSize = this.fitText(ctx, spec.subtitle, maxW, Math.round(h * 0.2), 500);
      ctx.fillText(spec.subtitle, centreX, h * 0.74 + subSize * 0.02);
    }
  }

  /** Shrinks the font until the text fits `maxWidth`; returns the final pixel size. */
  private fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, startSize: number, weight: number): number {
    let size = startSize;
    const set = (): void => {
      ctx.font = `${weight} ${size}px "Segoe UI", "Helvetica Neue", Arial, sans-serif`;
    };
    set();
    while (ctx.measureText(text).width > maxWidth && size > 12) {
      size -= 2;
      set();
    }
    return size;
  }

  private drawArrow(ctx: CanvasRenderingContext2D, dir: SignArrow, cx: number, cy: number, size: number, color: string): void {
    const r = size / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(dir === 'left' ? Math.PI : dir === 'up' ? -Math.PI / 2 : 0);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.lineTo(0, -r * 0.8);
    ctx.lineTo(0, -r * 0.32);
    ctx.lineTo(-r, -r * 0.32);
    ctx.lineTo(-r, r * 0.32);
    ctx.lineTo(0, r * 0.32);
    ctx.lineTo(0, r * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  dispose(): void {
    for (const g of this.geometries.values()) g.dispose();
    this.geometries.clear();
    for (const t of this.textures) t.dispose();
    this.textures.length = 0;
    for (const m of this.materials) m.dispose();
    this.materials.length = 0;
    this.stripMaterials.clear();
  }
}