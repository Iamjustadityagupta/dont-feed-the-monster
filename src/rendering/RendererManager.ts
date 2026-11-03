import * as THREE from 'three';
import { DisposableStore, type Disposable } from '../core/Disposable';
import { CONFIG } from '../app/GameConfig';

export class RendererManager implements Disposable {
  readonly renderer: THREE.WebGLRenderer;
  readonly canvas: HTMLCanvasElement;

  onContextLost: (() => void) | null = null;
  onContextRestored: (() => void) | null = null;

  private camera: THREE.PerspectiveCamera | null = null;
  private contextLost = false;
  private readonly disposables = new DisposableStore();

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance'
    });

    this.canvas = this.renderer.domElement;

    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, CONFIG.renderer.maxPixelRatio)
    );

    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = CONFIG.renderer.toneMappingExposure;

    container.appendChild(this.canvas);

    this.disposables.addListener(window, 'resize', this.handleResize);

    this.disposables.addListener(
      this.canvas,
      'webglcontextlost',
      ((event: Event) => {
        event.preventDefault();
        this.contextLost = true;
        this.onContextLost?.();
      }) as EventListener
    );

    this.disposables.addListener(
      this.canvas,
      'webglcontextrestored',
      (() => {
        this.contextLost = false;
        this.onContextRestored?.();
      }) as EventListener
    );
  }

  attachCamera(camera: THREE.PerspectiveCamera): void {
    this.camera = camera;
    this.handleResize();
  }

  private handleResize = (): void => {
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    if (this.camera) {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
    }
  };

  render(
    scene: THREE.Scene,
    renderOverlay?: () => void
  ): void {
    if (this.contextLost || !this.camera) return;

    const previousAutoClear = this.renderer.autoClear;

    try {
      this.renderer.autoClear = false;

      this.renderer.clear(true, true, true);
      this.renderer.render(scene, this.camera);

      renderOverlay?.();
    } finally {
      this.renderer.autoClear = previousAutoClear;
    }
  }

  dispose(): void {
    this.disposables.dispose();

    this.renderer.dispose();
    this.renderer.forceContextLoss();

    this.canvas.remove();
  }
}