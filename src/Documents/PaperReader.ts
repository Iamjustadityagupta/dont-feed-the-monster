
import * as THREE from 'three';

import { buildPaperTexture } from './PaperTextureFactory';
import {
  DOCUMENTS,
  type GameDocument
} from './DocumentRegistry';

import { HandRig } from './HandRig';

const NEAR_Z = -0.36;
const FAR_Z = -0.58;

export interface PaperReaderDeps {
  renderer: THREE.WebGLRenderer;
  setPlayerInputEnabled(enabled: boolean): void;
  onCollected(id: string): void;
  onOpenChange(open: boolean): void;
}

export class PaperReader {
  private opened = false;
  private disposed = false;

  get isOpen(): boolean {
    return this.opened;
  }

  private doc: GameDocument | null = null;
  private page = 0;
  private zoom = 0;
  private sway = 0;

  private readonly scene = new THREE.Scene();

  private readonly camera =
    new THREE.PerspectiveCamera(48, 1, 0.01, 4);

  private readonly hand = new HandRig();

  private paper: THREE.Mesh | null = null;
  private counter: HTMLDivElement | null = null;

  private readonly ambientLight =
    new THREE.AmbientLight(0xffffff, 0.55);

  private readonly keyLight =
    new THREE.PointLight(0xfff0d8, 2.2, 3, 1.4);

  private readonly rimLight =
    new THREE.PointLight(0xff5a3c, 0.9, 3, 1.6);

  private readonly onWheel = (event: WheelEvent): void => {
    if (!this.opened) return;

    event.preventDefault();

    this.setZoom(
      this.zoom + (event.deltaY > 0 ? -0.12 : 0.12)
    );
  };

  private readonly onKey = (event: KeyboardEvent): void => {
    if (!this.opened) return;

    switch (event.code) {
      case 'Escape':
      case 'KeyE':
        event.preventDefault();
        event.stopPropagation();
        this.close();
        break;

      case 'KeyA':
      case 'ArrowLeft':
        event.preventDefault();
        event.stopPropagation();
        this.flip(-1);
        break;

      case 'KeyD':
      case 'ArrowRight':
        event.preventDefault();
        event.stopPropagation();
        this.flip(1);
        break;

      case 'Equal':
      case 'ArrowUp':
        event.preventDefault();
        event.stopPropagation();
        this.setZoom(this.zoom + 0.15);
        break;

      case 'Minus':
      case 'ArrowDown':
        event.preventDefault();
        event.stopPropagation();
        this.setZoom(this.zoom - 0.15);
        break;
    }
  };

  constructor(private readonly deps: PaperReaderDeps) {
    this.scene.add(this.ambientLight);

    this.keyLight.position.set(0.35, 0.5, 0.4);
    this.scene.add(this.keyLight);

    this.rimLight.position.set(-0.6, -0.2, -0.1);
    this.scene.add(this.rimLight);

    this.hand.group.position.set(0.17, -0.30, -0.29);
    this.hand.group.rotation.set(-0.35, 0, -0.3);

    this.scene.add(this.hand.group);

    window.addEventListener('keydown', this.onKey);
  }

  open(docId: string): void {
    if (this.disposed || this.opened) return;

    const doc = DOCUMENTS.find(item => item.id === docId);

    if (!doc) {
      console.warn(`[papers] Unknown document: ${docId}`);
      return;
    }

    if (!doc.pages || doc.pages.length === 0) {
      console.warn(`[papers] Document has no pages: ${docId}`);
      return;
    }

    this.opened = true;
    this.doc = doc;
    this.page = 0;
    this.zoom = 0;
    this.sway = 0;

    try {
      this.buildPage();
      this.mountHud();

      this.deps.setPlayerInputEnabled(false);
      this.deps.onOpenChange(true);
      this.deps.onCollected(doc.id);

      window.addEventListener(
        'wheel',
        this.onWheel,
        { passive: false }
      );

      this.resize(
        window.innerWidth,
        window.innerHeight
      );
    } catch (error) {
      console.error('[papers] Failed to open document:', error);

      this.opened = false;
      this.doc = null;

      this.disposePage();
      this.unmountHud();

      this.deps.setPlayerInputEnabled(true);
      this.deps.onOpenChange(false);

      throw error;
    }
  }

  close(): void {
    if (!this.opened) return;

    this.opened = false;

    window.removeEventListener('wheel', this.onWheel);

    this.disposePage();
    this.unmountHud();

    this.doc = null;
    this.page = 0;
    this.zoom = 0;

    this.deps.setPlayerInputEnabled(true);
    this.deps.onOpenChange(false);
  }

  flip(direction: number): void {
    if (!this.opened || !this.doc) return;

    const next = THREE.MathUtils.clamp(
      this.page + Math.sign(direction),
      0,
      this.doc.pages.length - 1
    );

    if (next === this.page) return;

    this.page = next;

    this.buildPage();
    this.updateCounter();
  }

  setZoom(value: number): void {
    if (!this.opened) return;

    this.zoom = THREE.MathUtils.clamp(value, 0, 1);
  }

  update(deltaTime: number): void {
    if (!this.opened || !this.paper) return;

    this.sway += deltaTime;

    const targetZ = THREE.MathUtils.lerp(
      FAR_Z,
      NEAR_Z,
      this.zoom
    );

    this.paper.position.z = THREE.MathUtils.damp(
      this.paper.position.z,
      targetZ,
      8,
      deltaTime
    );

    this.paper.position.y =
      -0.02 + Math.sin(this.sway * 1.3) * 0.003;

    this.paper.rotation.z =
      Math.sin(this.sway * 0.6) * 0.006;

    this.paper.scale.setScalar(
      THREE.MathUtils.lerp(1, 1.18, this.zoom)
    );

    this.hand.group.position.y =
      -0.30 + Math.sin(this.sway * 0.75) * 0.0025;
  }

  /**
   * Draws the document after the main game scene.
   * RendererManager must call this as its overlay callback.
   */
  render(): void {
    if (!this.opened || this.disposed) return;

    this.deps.renderer.clearDepth();
    this.deps.renderer.render(this.scene, this.camera);
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    if (this.disposed) return;

    if (this.opened) {
      this.close();
    }

    this.disposed = true;

    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('wheel', this.onWheel);

    this.disposePage();
    this.unmountHud();

    this.hand.dispose();

    this.scene.remove(this.ambientLight);
    this.scene.remove(this.keyLight);
    this.scene.remove(this.rimLight);
  }

  private buildPage(): void {
    this.disposePage();

    if (!this.doc) return;

    const pageText = this.doc.pages[this.page] ?? '';

    const textures = buildPaperTexture(
      pageText,
      this.page + 1,
      this.doc.pages.length
    );

    const geometry = new THREE.PlaneGeometry(
      0.52,
      0.735,
      28,
      28
    );

    const positions =
      geometry.attributes.position as THREE.BufferAttribute;

    for (let i = 0; i < positions.count; i++) {
      const u = (positions.getX(i) + 0.26) / 0.52;
      const v = (positions.getY(i) + 0.3675) / 0.735;

      positions.setZ(
        i,
        Math.sin(u * Math.PI) * 0.012 +
        Math.sin(v * Math.PI) * 0.006
      );
    }

    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
      map: textures.map,
      bumpMap: textures.bump,
      bumpScale: 0.02,
      roughness: 0.94,
      metalness: 0,
      side: THREE.DoubleSide,
      transparent: true,
      depthTest: false,
      depthWrite: false
    });

    const mesh = new THREE.Mesh(geometry, material);

    mesh.position.set(0, -0.02, FAR_Z);
    mesh.rotation.x = -0.06;
    mesh.renderOrder = 10;

    this.scene.add(mesh);
    this.paper = mesh;

    this.updateCounter();
  }

  private disposePage(): void {
    if (!this.paper) return;

    const material = this.paper.material;

    if (Array.isArray(material)) {
      for (const entry of material) {
        (entry as THREE.MeshStandardMaterial).map?.dispose();
        (entry as THREE.MeshStandardMaterial).bumpMap?.dispose();
        entry.dispose();
      }
    } else {
      const standardMaterial =
        material as THREE.MeshStandardMaterial;

      standardMaterial.map?.dispose();
      standardMaterial.bumpMap?.dispose();
      standardMaterial.dispose();
    }

    this.paper.geometry.dispose();
    this.scene.remove(this.paper);

    this.paper = null;
  }

  private mountHud(): void {
    if (this.counter) return;

    const element = document.createElement('div');

    element.className = 'dfm-paper-reader-controls';

    element.style.cssText = `
      position:fixed;
      left:50%;
      bottom:4.5vh;
      transform:translateX(-50%);
      z-index:40;
      display:flex;
      gap:22px;
      align-items:center;
      font:600 11px/1 ui-monospace,monospace;
      letter-spacing:.15em;
      color:#d4c5a7;
      text-shadow:0 0 10px #000;
      pointer-events:none;
      white-space:nowrap;
    `;

    element.innerHTML = `
      <span>A / D - FLIP</span>
      <span>WHEEL - ZOOM</span>
      <span id="paper-counter">1 / 1</span>
      <span>E - CLOSE</span>
    `;

    document.body.appendChild(element);

    this.counter = element;
    this.updateCounter();
  }

  private unmountHud(): void {
    this.counter?.remove();
    this.counter = null;
  }

  private updateCounter(): void {
    const counter =
      this.counter?.querySelector('#paper-counter');

    if (counter && this.doc) {
      counter.textContent =
        `${this.page + 1} / ${this.doc.pages.length}`;
    }
  }
}
