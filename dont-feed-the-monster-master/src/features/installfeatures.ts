
import * as THREE from 'three';

import { AudioBuses } from '../audio/AudioBuses';
import { SoundBank } from '../audio/SoundManifest';
import { HorrorAudioDirector } from '../audio/HorrorAudioDirector';
import { AmbienceEmitter } from '../audio/AmbienceEmitter';
import { AudioSettingsPanel } from '../audio/AudioSettingPanel';
import { SoundEventSystem } from '../gameplay/SoundEventSystem';

import { PaperReader } from '../Documents/PaperReader';
import {
  PaperPickups,
  type PaperPlacement
} from '../Documents/PaperPickups';

import { resolvePlacements } from '../Documents/placementResolver';

import { ObjectiveTracker } from '../progress/ObjectiveTracker';
import { ChapterDirector } from '../progress/ChapterDirector';

import { IntroSequence } from '../ui/IntroSequence';
import type { PaperSheet } from '../ui/PaperSheet';
import { DOCUMENTS } from '../Documents/DocumentRegistry';
import { JournalUI } from '../ui/JournalUI';

import type {
  FeatureHandle,
  HorrorGameHooks
} from '../integration/GameHooks';

export interface FeatureDeps {
  hooks: HorrorGameHooks;
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  listener: THREE.AudioListener;
  fallbackPlacements: readonly PaperPlacement[];
  ventPoints?: THREE.Vector3[];
  electricalPoints?: THREE.Vector3[];
  playIntro?: boolean;
  /** A4 paper UI that every document pickup is shown on. */
  paper: PaperSheet;
  onChapterCleared?: (chapterIndex: number) => void;
}

export interface FeatureSet extends FeatureHandle {
  journal: JournalUI;
  reader: PaperReader;
  pickups: PaperPickups;
  audio: AudioBuses;
  tracker: ObjectiveTracker;
  chapterDirector: ChapterDirector;
  missingAudio: string[];
  /** Resumes the WebAudio context. Call again on a real user gesture (e.g. entering 'playing'); safe to call repeatedly. */
  unlockAudio(): void;
}

export async function installFeatures(
  deps: FeatureDeps
): Promise<FeatureSet> {
  const { hooks } = deps;

  let uiOpen = false;
  let disposed = false;

  const bus = new AudioBuses(deps.listener);
  const bank = new SoundBank(deps.listener);

  try {
    await bank.load();

    if (disposed) {
      bus.dispose();

      throw new Error(
        'Feature installation was cancelled.'
      );
    }

    // Bridges the game's real noise events (footsteps, doors, thrown
    // distractions — the same ones Subject 09's own hearing uses) into the
    // audio director, so it can react to a loud noise near the monster.
    const soundEvents = new SoundEventSystem();

    const unsubscribeSoundEvents = hooks.onSoundEvent?.((event) => {
      // Re-stamp with wall time: the game's own sim clock and the door/throw
      // events' performance.now() clock aren't guaranteed to agree, and this
      // system only cares about "how long ago, relative to now".
      soundEvents.ingest({ ...event, time: performance.now() / 1000 });
    }) ?? null;

    const horror = new HorrorAudioDirector(
      deps.listener,
      bus,
      bank,
      hooks,
      soundEvents
    );

    const ambience = new AmbienceEmitter(
      deps.listener,
      bus,
      bank
    );

    deps.ventPoints?.forEach((position) => {
      ambience.addVent(position);
    });

    deps.electricalPoints?.forEach((position) => {
      ambience.addElectrical(position);
    });

    const tracker = new ObjectiveTracker();

    const chapterDirector = new ChapterDirector(
      tracker,
      {
        completeObjective: (id: string) => {
          hooks.completeObjective(id);
        },

        onChapterCleared: deps.onChapterCleared
      }
    );

    const reader = new PaperReader({
      renderer: deps.renderer,

      setPlayerInputEnabled: (enabled: boolean) => {
        hooks.setPlayerInputEnabled(enabled);
      },

      onCollected: (id: string) => {
        chapterDirector.onDocumentCollected(id);
        hooks.onDocumentCollected(id);
      },

      onOpenChange: (open: boolean) => {
        uiOpen = open;
      }
    });

    // PAPER pickups: the sheet has already vanished from the world when this runs. Record the collection
    // (journal / chapter progress), then put the document's text on the A4 paper UI.
    const readDocument = (id: string): void => {
      const doc = DOCUMENTS.find((item) => item.id === id);

      if (!doc || doc.pages.length === 0) {
        console.warn(`[papers] Cannot read document: ${id}`);
        return;
      }

      chapterDirector.onDocumentCollected(id);
      hooks.onDocumentCollected(id);
      deps.paper.show(doc.pages);
    };

    const pickups = new PaperPickups(
      deps.scene,
      hooks,
      () => reader.isOpen || uiOpen || deps.paper.isOpen,
      readDocument
    );

    const resolvedPlacements = resolvePlacements(
      deps.scene,
      deps.fallbackPlacements
    );

    pickups.place(resolvedPlacements);

    const journal = new JournalUI(
      tracker,

      () => (
        hooks.isGameplayActive() &&
        !reader.isOpen &&
        !deps.paper.isOpen &&
        !uiOpen
      ),

      (open: boolean) => {
        uiOpen = open;
      }
    );

    const settings = new AudioSettingsPanel(
      bus,
      (open: boolean) => {
        uiOpen = open;
      }
    );

    const onSettingsKey = (
      event: KeyboardEvent
    ): void => {
      if (event.code !== 'KeyM') return;
      if (event.repeat) return;
      if (reader.isOpen || journal.isOpen) return;
      if (settings.isOpen) return;
      if (!hooks.isGameplayActive()) return;

      event.preventDefault();
      settings.toggle();
    };

    window.addEventListener(
      'keydown',
      onSettingsKey
    );

    const intro = new IntroSequence();

    if (deps.playIntro !== false) {
      intro.play(
        () => {
          hooks.setPlayerInputEnabled(false);
        },

        () => {
          if (disposed) return;

          hooks.setPlayerInputEnabled(true);
          ambience.start();
          horror.unlock();
        }
      );
    } else {
      ambience.start();
      horror.unlock();
    }

    const featureSet: FeatureSet = {
      journal,
      reader,
      pickups,
      audio: bus,
      tracker,
      chapterDirector,
      missingAudio: [...bank.missing],

      unlockAudio(): void {
        horror.unlock();
      },

      update(deltaTime: number): void {
        if (disposed) return;

        horror.setMonsterState(
          hooks.getMonsterState()
        );

        horror.update(deltaTime);
        soundEvents.prune(performance.now() / 1000);
        ambience.setTension(horror.getDanger());
        ambience.update(deltaTime);
        reader.update(deltaTime);
        pickups.update();
      },

      render(): void {
        if (disposed) return;

        reader.render();
      },

      resize(width: number, height: number): void {
        if (disposed) return;

        reader.resize(width, height);
      },

      dispose(): void {
        if (disposed) return;

        disposed = true;

        window.removeEventListener(
          'keydown',
          onSettingsKey
        );

        unsubscribeSoundEvents?.();
        intro.dispose();
        horror.dispose();
        ambience.dispose();
        reader.dispose();
        pickups.dispose();
        journal.dispose();
        settings.dispose();
        bus.dispose();
      }
    };

    return featureSet;

  } catch (error) {
    bus.dispose();
    throw error;
  }
}
