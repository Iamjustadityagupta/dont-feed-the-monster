
import type { Vec2 } from '../world/CollisionTypes';
import type { RawLevelLayout } from '../world/geometryFromLayout';

export interface ObjectiveStep {
  readonly id: string;
  readonly text: string;
  readonly hint?: string;
}

export interface MonsterIntroduction {
  readonly atPosition: Vec2;
  readonly triggerZone: {
    readonly x: number;
    readonly z: number;
    readonly radius: number;
  };
  readonly firstContactGrace: number;
}

export interface ChapterRegion {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export interface ChapterDefinition {
  readonly id: string;
  readonly title: string;
  readonly layout: RawLevelLayout;
  readonly playerSpawn: Vec2;
  readonly playerSpawnYaw: number;
  readonly keycardInteractableId: string;
  readonly keycardRegionId: string;
  readonly exitInteractableId: string;
  readonly objectiveSteps: readonly ObjectiveStep[];
  readonly monsterSpawn: Vec2;
  readonly monsterIntroduction: MonsterIntroduction;
  readonly targetDurationSeconds: number;
  readonly endingText: string;
}

export function validateChapter(
  chapter: ChapterDefinition,
): string[] {
  const problems: string[] = [];
  const interactables = chapter.layout.INTERACTABLES ?? [];

  const interactableIds = new Set(
    interactables.map((item) => item.id),
  );

  if (!chapter.id.trim()) {
    problems.push('chapter id must not be empty');
  }

  if (!chapter.title.trim()) {
    problems.push('chapter title must not be empty');
  }

  if (!interactableIds.has(chapter.keycardInteractableId)) {
    problems.push(
      `missing keycard interactable: ${chapter.keycardInteractableId}`,
    );
  }

  if (!interactableIds.has(chapter.exitInteractableId)) {
    problems.push(
      `missing exit interactable: ${chapter.exitInteractableId}`,
    );
  }

  if (chapter.objectiveSteps.length === 0) {
    problems.push('chapter has no objective steps');
  }

  const objectiveIds = new Set<string>();

  for (const step of chapter.objectiveSteps) {
    if (!step.id.trim()) {
      problems.push('objective id must not be empty');
    } else if (objectiveIds.has(step.id)) {
      problems.push(`duplicate objective id: ${step.id}`);
    }

    objectiveIds.add(step.id);

    if (!step.text.trim()) {
      problems.push(`objective ${step.id} has empty text`);
    }
  }

  const bounds = chapter.layout.BOUNDS;

  if (!bounds) {
    problems.push('chapter layout has no bounds');
  } else {
    const insideBounds = (point: Vec2): boolean =>
      point.x >= bounds.minX &&
      point.x <= bounds.maxX &&
      point.z >= bounds.minZ &&
      point.z <= bounds.maxZ;

    if (!insideBounds(chapter.playerSpawn)) {
      problems.push('player spawn is outside chapter bounds');
    }

    if (!insideBounds(chapter.monsterSpawn)) {
      problems.push('monster spawn is outside chapter bounds');
    }
  }

  if (chapter.targetDurationSeconds <= 0) {
    problems.push('target duration must be greater than zero');
  }

  if (chapter.monsterIntroduction.firstContactGrace < 0) {
    problems.push(
      'monster introduction grace period cannot be negative',
    );
  }

  if (chapter.monsterIntroduction.triggerZone.radius <= 0) {
    problems.push('monster trigger radius must be greater than zero');
  }

  return problems;
}
