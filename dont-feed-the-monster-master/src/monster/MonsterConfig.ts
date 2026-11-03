export interface MonsterConfig {
  readonly patrolSpeed: number;
  readonly investigateSpeed: number;
  readonly chaseSpeed: number;
  readonly returnSpeed: number;

  readonly sightRange: number;
  readonly sightFovDegrees: number;
  readonly crouchSightMultiplier: number;
  readonly hiddenSightMultiplier: number;

  readonly hearingRange: number;
  readonly hearingThreshold: number;

  readonly investigateDuration: number;
  readonly searchDuration: number;
  readonly searchLostDuration: number;
  readonly stunDuration: number;

  readonly arrivalRadius: number;
  readonly loseSightGrace: number;
  readonly memoryDecayPerSecond: number;
  readonly maxMemoryConfidence: number;

  readonly stuckDistance: number;
  readonly stuckWindow: number;
  readonly repathInterval: number;

  readonly lockerAdaptationStep: number;
  readonly distractionAdaptationStep: number;
  readonly adaptationFloor: number;
  readonly adaptationDecayPerSecond: number;

  readonly firstContactGrace: number;
}

export const DEFAULT_MONSTER_CONFIG: MonsterConfig = {
  patrolSpeed: 1.15,
  investigateSpeed: 2.0,
  chaseSpeed: 3.55,
  returnSpeed: 1.35,

  sightRange: 15,
  sightFovDegrees: 105,
  crouchSightMultiplier: 0.7,
  hiddenSightMultiplier: 0.12,

  hearingRange: 16,
  hearingThreshold: 0.18,

  investigateDuration: 5,
  searchDuration: 4.5,
  searchLostDuration: 6,
  stunDuration: 1.2,

  arrivalRadius: 0.7,
  loseSightGrace: 1.1,
  memoryDecayPerSecond: 0.09,
  maxMemoryConfidence: 1,

  stuckDistance: 0.12,
  stuckWindow: 1.4,
  repathInterval: 0.35,

  lockerAdaptationStep: 0.18,
  distractionAdaptationStep: 0.14,
  adaptationFloor: 0.35,
  adaptationDecayPerSecond: 0.012,

  firstContactGrace: 2.5,
};

/** Chapter 1 tuning: slower, more forgiving, telegraphed. */
export const CHAPTER_ONE_MONSTER_CONFIG: MonsterConfig = {
  ...DEFAULT_MONSTER_CONFIG,
  patrolSpeed: 0.95,
  chaseSpeed: 3.05,
  sightRange: 12,
  sightFovDegrees: 92,
  hearingRange: 13,
  firstContactGrace: 3.5,
  searchLostDuration: 5,
};

export const fovRadians = (config: MonsterConfig): number => (config.sightFovDegrees * Math.PI) / 180;