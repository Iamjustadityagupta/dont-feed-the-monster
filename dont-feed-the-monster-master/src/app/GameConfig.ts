/** Every gameplay tunable in one place. Values match the milestone 1-4 prototype. */
export const CONFIG = {
  loop: {
    /** Largest simulation step. A longer frame is split into equal sub-steps no bigger than this. */
    maxStep: 1 / 60,
    /** A frame longer than this (tab switch, breakpoint) is clamped so the simulation never jumps. */
    maxFrameTime: 0.1,
  },
  renderer: {
    maxPixelRatio: 1.7,
    toneMappingExposure: 1.15,
  },
  player: {
    fov: 74,
    near: 0.08,
    far: 90,
    radius: 0.35,
    walkSpeed: 3.15,
    sprintSpeed: 5.6,
    crouchSpeed: 1.55,
    eyeHeight: 1.65,
    crouchEyeHeight: 1.08,
    hidingEyeHeight: 1.35,
    bobAmplitude: 0.025,
    bobSpeedWalk: 9,
    bobSpeedSprint: 14,
    lookSensitivityYaw: 0.0022,
    lookSensitivityPitch: 0.002,
    pitchLimit: 1.35,
    footstepInterval: { walk: 0.52, sprint: 0.28, crouch: 0.78 },
    noise: { walk: 5.2, sprint: 12, crouch: 2.2 },
    interact: { rayRange: 2.6, nearbyRange: 2.0, closeRange: 1.3, exitRange: 3 },
    throwDistraction: {
      distance: 5,
      loudness: 19,
      orbLifetimeMs: 7000,
      clampMargin: 1.2,
    },
  },
  monster: {
    /** Body radius used by both the game and the navigation graph. Must stay > 0.44 so 0.88 m crawl gaps stay monster-proof. */
    collisionRadius: 0.45,
    speeds: { patrol: 1.4, investigate: 2.4, search: 1.8, chase: 4.2, return: 1.9 },
    cautiousSpeedFactor: 0.7,
    lungeRange: 3.2,
    lungeSpeedFactor: 1.2,
    sightRange: 11,
    sightFacingMin: 0.2,
    closeDetectRange: 2.2,
    /** Heard distance is multiplied by this when a wall is between the sound and the monster. */
    muffleFactor: 1.8,
    soundRangeMultiplier: 1.1,
    catchDistance: 1.15,
    chaseLostSightSeconds: 3,
    chaseBlockedSeconds: 5,
    patrolPauseSeconds: 1.2,
    investigateTimeout: 18,
    searchPointWaitSeconds: 1.6,
    searchTimeout: 28,
    searchRadius: 3,
    searchRadiusAfterHiding: 4.5,
    lockerSearchRange: 11,
    lockerReachDistance: 1.9,
    lockerInspectSeconds: 1.4,
    returnTimeout: 20,
    turnRate: 7,
    seed: 0x09,
  },
  ui: {
    toastSeconds: 4.2,
  },
} as const;

export type GameConfig = typeof CONFIG;
