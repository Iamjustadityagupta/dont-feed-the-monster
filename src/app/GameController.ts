import * as THREE from 'three';
import type { GameServices } from './GameServices';
import type {
  GameMode,
  MonsterState as CoreMonsterState,
  SoundEvent as CoreSoundEvent,
  InventoryItem,
  DrawerKeyId,
} from '../core/types';
import { PAPER_PASSWORD_ID } from '../core/types';
import { DisposableStore, getLiveDomListeners, type Disposable } from '../core/Disposable';
import { createRng } from '../core/Random';
import { RestartSystem } from '../gameplay/RestartSystem';
import { getInteractionPrompt, getObjective } from '../gameplay/ObjectiveSystem';
import { crawlspaceAt } from '../world/LevelLayout';
import { SaveManager, createNewSave, type SaveData } from '../save/SaveManager';
import { CHAPTER_01_CAMPAIGN } from '../chapters/Chapter01_Containment';
import { getNextChapter } from '../chapters/CampaignIndex';

import { installFeatures, type FeatureSet } from '../features/installfeatures';
import { createHooks } from '../integration/CreateHooks';
import { PaperSheet } from '../ui/PaperSheet';
import type { MonsterState as FeatureMonsterState } from '../integration/GameHooks';
import { PAPER_PLACEMENTS } from '../Documents/PaperPlacements';
import { getDocumentById } from '../Documents/DocumentRegistry';

import {
  PuzzleInventory,
  PUZZLE_INVENTORY_SNAPSHOT_VERSION,
  type CollectibleItemId,
  type PuzzleInventoryItemId,
} from '../gameplay/PuzzleInventory';
import { DrawerSystem, type DrawerInventorySink } from '../gameplay/DrawerSystem';
import { FacilityPuzzleSystem, PasswordLocker, type IPuzzleInventory } from '../gameplay/FacilityPuzzleSystem';

export interface Diagnostics {
  mode: GameMode;
  canvases: number;
  overlays: number;
  huds: number;
  domListeners: number;
  busListeners: number;
  stateListeners: number;
  sceneObjects: number;
}

/** Maps the monster's own state names onto the simplified vocabulary the audio/paper feature set expects. */
function mapMonsterState(state: CoreMonsterState): FeatureMonsterState {
  switch (state) {
    case 'PATROL': return 'patrol';
    case 'INVESTIGATE': return 'searching';
    case 'SEARCH': return 'searching';
    case 'CHASE': return 'chasing';
    case 'RETURN': return 'lost';
    default: return 'idle';
  }
}

/**
 * Adapts the id-based `PuzzleInventory` (which only knows item ids, not full
 * `InventoryItem` objects — it builds those internally from its own
 * ITEM_DEFINITIONS table) onto the two item-object-based surfaces that
 * `DrawerSystem` (`DrawerInventorySink`) and `FacilityPuzzleSystem`
 * (`IPuzzleInventory`) expect. This is the single place that bridges the two
 * shapes, so neither gameplay class needs to know about the other's API.
 */
class PuzzleInventoryBridge implements IPuzzleInventory, DrawerInventorySink {
  constructor(private readonly inv: PuzzleInventory) {}

  private grantOne(item: InventoryItem): void {
    // `combined_object` is never added directly — PuzzleInventory only ever
    // creates it via combineFragments() once all 3 fragments are present.
    if (item.id === 'combined_object') {
      this.inv.combineFragments();
      return;
    }
    this.inv.add(item.id as CollectibleItemId);
  }

  grant(item: InventoryItem): void {
    this.grantOne(item);
  }

  addItem(item: InventoryItem): void {
    this.grantOne(item);
  }

  hasItem(id: DrawerKeyId): boolean {
    return this.inv.has(id);
  }

  has(itemId: InventoryItem['id']): boolean {
    return this.inv.has(itemId as PuzzleInventoryItemId);
  }

  items(): readonly InventoryItem[] {
    return this.inv.list();
  }

  serialize(): InventoryItem[] {
    return [...this.inv.list()];
  }

  restore(items: readonly InventoryItem[]): void {
    this.inv.restore({
      version: PUZZLE_INVENTORY_SNAPSHOT_VERSION,
      items: items.map((i) => i.id) as PuzzleInventoryItemId[],
    });
  }

  reset(): void {
    this.inv.clear();
  }
}

/** Game flow: mode changes, input routing (temporary until the Stage D InputManager), per-frame update and HUD. */
export class GameController implements Disposable {
  private readonly disposables = new DisposableStore();
  private readonly restart: RestartSystem;
  private toastTimer = 0;
  private crawlHinted = false;
  private objective = getObjective(false);
  private readonly saves = new SaveManager();
  private save: SaveData | null = null;

  /** Interactive-paper / journal / horror-audio feature set. Installed asynchronously; null until ready. */
  private features: FeatureSet | null = null;
  private featuresDisposed = false;
  private readonly audioListener = new THREE.AudioListener();
  /** True while a feature (paper reader, journal, ...) has asked us to suspend player input. */
  private inputLocked = false;
  /** A4 handwritten paper overlay. Used by every 'paper' interactable (world notes and document pickups). */
  private readonly paper = new PaperSheet();
  /** Full puzzle progression. Created once; reseeded per run. */
  private puzzle: FacilityPuzzleSystem | null = null;

  constructor(private readonly s: GameServices) {
    this.restart = new RestartSystem(s);
    s.ui.bind({
      newGame: () => this.startGame(),
      showHowTo: () => this.s.state.transition('howto'),
      showMenu: () => this.returnToMenu(),
      resume: () => this.s.state.transition('playing'),
      restart: () => this.startGame(),
    });
    this.disposables.add(s.state.onChange((to, from) => this.enter(to, from)));
    this.disposables.add(s.events.on('message', (m) => this.toast(m)));
    // PAPER interactions: the world object has already vanished; show its text on the A4 sheet.
    this.disposables.add(s.events.on('paper', (p: { text: string }) => this.displayPaper(p.text)));
    this.disposables.add(s.events.on('caught', () => s.state.transition('caught')));
    this.disposables.add(s.events.on('complete', () => {
      if (this.save) {
        const next = getNextChapter(CHAPTER_01_CAMPAIGN.id);
        this.save = this.saves.markChapterCompleted(this.save, CHAPTER_01_CAMPAIGN.id, next?.id ?? null);
        this.saves.save(this.save);
      }
      s.state.transition('complete');
    }));
    this.disposables.add(s.events.on('puzzle:stage', (payload: { to: string }) => {
      this.toast(payload.to);
      this.persistPuzzle();
    }));
    this.disposables.addListener(window, 'keydown', this.onKeyDown as EventListener);
    this.disposables.addListener(window, 'resize', this.onResize as EventListener);
    this.disposables.addListener(document, 'visibilitychange', () => {
      if (document.hidden && s.state.is('playing')) s.state.transition('paused');
    });
    s.renderer.onContextLost = () => {
      if (s.state.is('playing')) s.state.transition('paused');
    };
    s.loop.onStep = this.step;
    s.loop.onRender = this.frame;

    // Audio listener must ride on the same camera the renderer uses, so positional/occlusion audio lines up.
    s.player.camera.add(this.audioListener);

    this.setupPuzzle(0);
    void this.setupFeatures();

    s.ui.showMenu();
  }

  /**
   * Constructs the puzzle stack in dependency order: inventory -> drawers -> locker -> orchestrator.
   * `FacilityPuzzleSystem` builds its own internal `FragmentCombinationSystem`
   * (it needs a range-check callback that closes over the orchestrator itself,
   * so that system is never pre-built here). The orchestrator is handed to the
   * player as its PuzzleHost; the player never owns puzzle state.
   */
  private setupPuzzle(seed: number): void {
    const { s } = this;
    const inventory = new PuzzleInventory();
    const inventoryBridge = new PuzzleInventoryBridge(inventory);
    const rng = createRng(seed);
    const drawers = new DrawerSystem(s.world, rng, inventoryBridge, s.events);
    const locker = new PasswordLocker(s.world, s.events);

    this.puzzle = new FacilityPuzzleSystem({
      world: s.world,
      player: s.player,
      inventory: inventoryBridge,
      drawers: drawers as unknown as ConstructorParameters<typeof FacilityPuzzleSystem>[0]['drawers'],
      locker,
      events: s.events,
      seed,
    });
    s.player.setPuzzleHost(
      this.puzzle as unknown as Parameters<typeof s.player.setPuzzleHost>[0],
    );
  }

  /**
   * Builds the paper-reading, journal and horror-audio feature set and wires it to the existing game systems
   * via HorrorGameHooks. Installation is asynchronous (it loads the sound bank), so `this.features` stays null
   * until it resolves; every call site below tolerates that.
   */
  private async setupFeatures(): Promise<void> {
    const { s } = this;

    const hooks = createHooks({
      camera: s.player.camera,
      getPlayerPosition: () => s.player.position,
      isPlayerHiding: () => s.player.hidden,
      isPlayerSprinting: () => s.player.sprinting,
      monsterObject: s.monster.root,
      getMonsterState: () => mapMonsterState(s.monster.state),
      collisionRoots: () => [s.world.scene],
      setPlayerInputEnabled: (enabled: boolean) => {
        this.inputLocked = !enabled;
        if (!enabled) document.exitPointerLock?.();
      },
      isGameplayActive: () => s.state.is('playing'),
      onDocumentCollected: (id: string) => {
        const doc = getDocumentById(id);
        this.toast(doc ? `Document added to journal: ${doc.title}` : 'Document added to journal.');
        // The single password paper teaches the locker code; tell the puzzle system when it is read.
        if (id === PAPER_PASSWORD_ID) {
          this.puzzle?.notePasswordDiscovered();
          this.persistPuzzle();
        }
      },
      onCaught: (callback: () => void) => s.events.on('caught', callback),
      onSoundEvent: (callback: (event: CoreSoundEvent) => void) =>
        s.events.on('sound', (event: CoreSoundEvent) => callback(event)),
    });

    try {
      const features = await installFeatures({
        hooks,
        scene: s.world.scene,
        renderer: s.renderer.renderer,
        listener: this.audioListener,
        fallbackPlacements: PAPER_PLACEMENTS,
        // Show the cinematic briefing and controls before the player begins exploring.
        playIntro: true,
        paper: this.paper,
      });

      if (this.featuresDisposed) {
        features.dispose();
        return;
      }

      this.features = features;
    } catch (error) {
      // Missing/failed audio assets or WebGL quirks should not take down the rest of the game.
      console.error('[GameController] feature installation failed (papers/journal/audio disabled):', error);
    }
  }

  /**
   * Puts `text` on the A4 paper UI. It stays up until the player presses E / Esc to put it down,
   * and the player cannot move or act in the meantime.
   */
  displayPaper(text: string): void {
    this.paper.show(text, {
      onClose: (reason) => {
        // Closing with E is a real key press, so the browser allows re-capturing the mouse straight away.
        if (reason === 'interact') this.recaptureMouse();
      },
    });
  }

  private recaptureMouse(): void {
    if (!this.s.state.is('playing')) return;
    try {
      const result = this.s.renderer.renderer.domElement.requestPointerLock() as unknown;
      if (result instanceof Promise) result.catch(() => undefined);
    } catch {
      /* The player can still click the view to capture the mouse. */
    }
  }

  private enter(to: GameMode, from: GameMode): void {
    document.exitPointerLock?.();
    // A paper that is being read hides behind the pause menu and returns on resume; any other mode change drops it.
    if (to === 'paused') this.paper.suspend();
    else if (to === 'playing' && from === 'paused') this.paper.resume();
    else this.paper.close('forced');
    this.s.loop.paused = to !== 'playing';
    // Puzzle interactables are inert outside active gameplay, so prompts and raycast hits cannot leak.
    this.s.world.setPuzzleActive(to === 'playing');
    this.s.events.emit('modechange', { from, to });
    if (to === 'playing') this.features?.unlockAudio();
    switch (to) {
      case 'menu': this.s.ui.showMenu(); break;
      case 'howto': this.s.ui.showHowTo(); break;
      case 'playing': this.s.ui.showHud(); this.toast(''); break;
      case 'paused': this.s.ui.showPause(); break;
      case 'caught': this.s.ui.showCaught(); break;
      case 'complete': this.s.ui.showComplete(); break;
    }
  }

  /** Starts a brand-new run: fresh seed, keycard relocated, puzzle layout rebuilt from that seed. */
  startGame(): void {
    const seed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
    this.save = createNewSave(CHAPTER_01_CAMPAIGN.id, seed);
    this.beginChapter(seed);
    this.persistPuzzle();
  }

  /** Continues the last save: same seed, so the keycard and every drawer stay exactly where they were. */
  continueGame(): void {
    const loaded = this.saves.load();
    if (!loaded) { this.startGame(); return; }
    this.save = loaded;
    this.beginChapter(loaded.runSeed);
    if (loaded.puzzle) this.puzzle?.restore(loaded.puzzle);
  }

  private beginChapter(seed: number): void {
    this.paper.close('forced');
    this.restart.reset();
    this.s.world.placeKeycardForSeed(seed);
    this.puzzle?.reset(seed);
    this.objective = getObjective(false);
    this.crawlHinted = false;
    if (!this.s.state.transition('playing')) this.enter('playing', 'playing');
    this.toast('CONTAINMENT BREACH: Find a way out. Search the facility and stay quiet.');
  }

  /** Persists the live puzzle snapshot into the current save. Called on stage and item changes. */
  private persistPuzzle(): void {
    if (!this.save || !this.puzzle) return;
    const updated: SaveData = {
      ...this.save,
      puzzle: this.puzzle.snapshot() as unknown as SaveData['puzzle'],
    };
    this.save = updated;
    this.saves.save(updated);
  }

  returnToMenu(): void {
    this.s.state.transition('menu');
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    // While a paper is on screen it owns the keyboard (E / Esc put it down); nothing else may fire underneath.
    if (this.paper.isOpen) return;
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    const { state, player, flashlight } = this.s;
    if (k === 'escape') {
      if (state.is('playing')) state.transition('paused');
      else if (state.is('paused')) state.transition('playing');
      return;
    }
    if (!state.is('playing')) return;
    // While the paper reader or journal overlay is open, they own keyboard input (E/Escape/A/D/arrows for the
    // reader, J/Tab/Escape for the journal) via their own listeners — don't let gameplay actions fire underneath.
    if (this.features && (this.features.reader.isOpen || this.features.journal.isOpen)) return;
    if (k === 'e') {
      const readPaper = this.features?.pickups.interact() ?? false;
      if (!readPaper) {
        player.interact();
        this.persistPuzzle();
      }
      return;
    }
    // Q combines fragments. F stays bound to the flashlight below.
    if (k === 'q') {
      this.puzzle?.combineFragments();
      this.persistPuzzle();
    }
    if (k === 'g') player.throwDistraction();
    if (k === 'f') player.toggleFlashlight(flashlight.light);
  };

  private readonly onResize = (): void => {
    this.features?.resize(window.innerWidth, window.innerHeight);
  };

  private toast(text: string): void {
    this.s.ui.toast(text);
    this.toastTimer = text ? this.s.config.ui.toastSeconds : 0;
  };

  private step = (dt: number, time: number): void => {
    if (!this.s.state.is('playing')) return;
    const { player, monster, flashlight } = this.s;
    player.update(dt, time, this.inputLocked || this.paper.isOpen);
    flashlight.follow(player.camera);
    if (!this.crawlHinted && crawlspaceAt(player.position.x, player.position.z)) {
      this.crawlHinted = true;
      this.toast('SAFE CLOSET: Subject 09 is too big to follow you in here. Stand in a corner, out of its line of sight.');
    }
    monster.update(dt, time);
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toast('');
    }
    // Puzzle animations and timers only advance while playing; pausing freezes them.
    if (!this.inputLocked && !this.paper.isOpen) this.puzzle?.update(dt);
    this.objective = getObjective(player.hasKeycard);
    this.features?.update(dt);
  };

  private frame = (): void => {
    const { state, ui, player, monster, world, renderer } = this.s;
    if (state.is('playing')) {
      ui.updateHud({
        objective: this.objective,
        hasKeycard: player.hasKeycard,
        monsterDistance: player.position.distanceTo(monster.root.position),
        hidden: player.hidden,
        sprinting: player.sprinting,
        crouching: player.crouching,
        prompt: getInteractionPrompt(player, world),
      });
    }
    renderer.render(world.scene, () => this.features?.render());
  };

  getDiagnostics(): Diagnostics {
    return {
      mode: this.s.state.mode,
      canvases: document.querySelectorAll('canvas').length,
      overlays: document.querySelectorAll('#overlay').length,
      huds: document.querySelectorAll('#hud').length,
      domListeners: getLiveDomListeners(),
      busListeners: this.s.events.listenerCount(),
      stateListeners: this.s.state.listenerCount(),
      sceneObjects: this.s.world.scene.children.length,
    };
  }

  /** Browser-only lifecycle check: start -> menu -> start, repeated. Counts must not grow. */
  runLifecycleStress(cycles = 20): { before: Diagnostics; after: Diagnostics; stable: boolean } {
    this.returnToMenu();
    const before = this.getDiagnostics();
    for (let i = 0; i < cycles; i++) {
      this.startGame();
      this.s.state.transition('paused');
      this.startGame();
      this.returnToMenu();
    }
    const after = this.getDiagnostics();
    const stable = (Object.keys(before) as Array<keyof Diagnostics>).every((k) => before[k] === after[k]);
    return { before, after, stable };
  }

  dispose(): void {
    this.s.loop.onStep = () => undefined;
    this.s.loop.onRender = () => undefined;
    this.s.renderer.onContextLost = null;
    this.featuresDisposed = true;
    this.paper.dispose();
    this.features?.dispose();
    this.features = null;
    this.s.player.setPuzzleHost(null);
    this.puzzle?.dispose();
    this.puzzle = null;
    this.s.player.camera.remove(this.audioListener);
    this.disposables.dispose();
  }
}