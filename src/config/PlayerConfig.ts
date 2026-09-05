/**
 * PlayerConfig - centralized tuning for the hero and the ODM (omni-directional
 * mobility) traversal systems: ground movement, air control, the mouse-aimed
 * grapple wire with pendulum swing physics, the dash burst, and the gas /
 * stamina meter.
 *
 * ALL traversal "feel" numbers live here so balance can be tweaked in one
 * place. Nothing in Player.ts / GrappleSystem.ts / GasSystem.ts should contain
 * a magic movement/physics number - it should read from this file.
 *
 * The legacy PLAYER block in GameConfig.ts is kept for backward-compat imports,
 * but traversal logic reads PLAYER_CONFIG here. Values below are derived from
 * (and extend) those legacy constants.
 */

/** Core body / ground-movement tuning. */
export const MOVEMENT = {
  /** Player max health (mirrors legacy PLAYER.MAX_HP). */
  MAX_HP: 100,
  /** Horizontal run speed on the ground, px/s. */
  MOVE_SPEED: 190,
  /** Upward jump velocity (positive = magnitude; applied as negative Y), px/s. */
  JUMP_VELOCITY: 430,
  /** Extra gravity multiplier while falling for a snappier arc (1 = normal). */
  FALL_GRAVITY_MULT: 1.35,
  /** Gravity multiplier while ascending and holding jump, for variable-height jumps. */
  LOW_JUMP_GRAVITY_MULT: 1.9,
  /** Coyote time after leaving a ledge during which a jump still fires, ms. */
  COYOTE_MS: 90,
  /** Jump input buffer window so an early press still registers on landing, ms. */
  JUMP_BUFFER_MS: 110,
  /** Ground acceleration toward target run speed, px/s^2. */
  GROUND_ACCEL: 2600,
  /** Ground deceleration when no input, px/s^2. */
  GROUND_FRICTION: 2200,
  /** Physics body size (logical px) and offset within the 32x32 hero frame. */
  BODY_WIDTH: 12,
  BODY_HEIGHT: 22,
  BODY_OFFSET_X: 10,
  BODY_OFFSET_Y: 9,
  /** Hard cap on horizontal speed the player can carry (fling, swing), px/s. */
  MAX_H_SPEED: 620,
  /** Hard cap on vertical speed, px/s. */
  MAX_V_SPEED: 900,
} as const;

/** Air-control tuning (applies while airborne, whether jumping or swinging). */
export const AIR = {
  /** Horizontal acceleration from input while airborne, px/s^2. */
  ACCEL: 900,
  /** Max horizontal speed reachable from air input alone, px/s. */
  MAX_INPUT_SPEED: 200,
  /** Passive horizontal drag applied while airborne (per second fraction). */
  DRAG: 0.6,
  /** Extra steering force applied to nudge swing direction, px/s^2. */
  SWING_STEER_ACCEL: 520,
} as const;

/**
 * Grapple / ODM wire tuning. The wire behaves as a taut rope: while attached
 * the player is constrained to a maximum distance from the anchor and swings
 * as a pendulum, conserving tangential momentum. Reeling shortens the rope.
 */
export const GRAPPLE = {
  /** Maximum distance a grapple can reach from the player to a surface, px. */
  RANGE: 300,
  /** Maximum rope length once attached (rope cannot stretch beyond this), px. */
  MAX_LENGTH: 340,
  /** Minimum rope length when reeling all the way in, px. */
  MIN_LENGTH: 24,
  /** Speed the hook projectile travels from muzzle to anchor, px/s. */
  HOOK_TRAVEL_SPEED: 1400,
  /** Reel-in speed (rope shortens), px/s. */
  REEL_IN_SPEED: 190,
  /** Reel-out speed (rope lengthens), px/s. */
  REEL_OUT_SPEED: 160,
  /**
   * Positional constraint stiffness [0..1]: how strongly the player is pulled
   * back onto the rope circle each frame when overshooting the rope length.
   * 1 = perfectly rigid rope, lower = springier.
   */
  CONSTRAINT_STIFFNESS: 1,
  /**
   * Tangential damping per second [0..1] applied to swing velocity so a swing
   * eventually settles instead of oscillating forever. Small = lively.
   */
  SWING_DAMPING: 0.12,
  /**
   * Auto pendulum-pull: constant acceleration along the rope toward the anchor
   * that gives swings extra "pump" energy and lets the player climb, px/s^2.
   */
  PULL_ACCEL: 520,
  /** Velocity retained when releasing the wire (fling), fraction of current. */
  RELEASE_VELOCITY_KEEP: 1,
  /** Small upward boost added on release for a satisfying launch, px/s. */
  RELEASE_UP_BOOST: 60,
  /** Wire render thickness in logical px. */
  WIRE_THICKNESS: 1,
  /** Wire render color (0xRRGGBB). */
  WIRE_COLOR: 0xdfe6ef,
  /** Anchor marker radius, px. */
  ANCHOR_RADIUS: 2,
  /** How long the anchor stays "hooked" before auto-detach if unused, ms (0 = never). */
  AUTO_DETACH_MS: 0,
} as const;

/** Dash: a short directional burst impulse toward aim/movement direction. */
export const DASH = {
  /** Impulse speed applied instantly in the dash direction, px/s. */
  IMPULSE: 460,
  /** Duration the dash "locks in" reduced gravity for a flat burst, ms. */
  DURATION_MS: 160,
  /** Gravity multiplier during the dash window (0 = weightless burst). */
  GRAVITY_MULT: 0.15,
  /** Cooldown before another dash can fire, ms. */
  COOLDOWN_MS: 420,
  /** Number of air dashes allowed before touching ground/grapple resets them. */
  AIR_DASHES: 1,
} as const;

/**
 * Gas / stamina meter. Consumed by firing the grapple, reeling, and dashing;
 * regenerates when grounded/idle. Actions are blocked when there is not enough
 * gas to pay their cost.
 */
export const GAS = {
  /** Maximum gas capacity (arbitrary units, also drives the HUD scale). */
  MAX: 100,
  /** Starting gas at spawn. */
  START: 100,
  /** One-off cost to fire the grapple hook. */
  COST_GRAPPLE_FIRE: 8,
  /** Per-second cost while actively reeling in/out. */
  COST_REEL_PER_SEC: 14,
  /** Per-second cost while a wire is attached and swinging (idle tension). */
  COST_SWING_PER_SEC: 4,
  /** One-off cost to dash. */
  COST_DASH: 18,
  /** Regen per second while grounded and not spending gas. */
  REGEN_GROUNDED_PER_SEC: 55,
  /** Regen per second while airborne but not spending gas (slower). */
  REGEN_AIRBORNE_PER_SEC: 18,
  /** Delay after spending gas before regen resumes, ms. */
  REGEN_DELAY_MS: 350,
} as const;

/** Camera-follow tuning for the side-scrolling level. */
export const CAMERA = {
  /** Lerp factor for smooth follow [0..1] per axis. */
  LERP_X: 0.12,
  LERP_Y: 0.1,
  /** Deadzone rectangle (logical px) centered on the viewport. */
  DEADZONE_W: 120,
  DEADZONE_H: 80,
  /** Lookahead in the direction of horizontal motion, px. */
  LOOKAHEAD_X: 60,
} as const;

/**
 * Level bounds for the side-scrolling arena. Wider than the canvas with a tall
 * wall section on the right that provides verticality for grapple traversal.
 */
export const LEVEL = {
  WIDTH: 1920,
  HEIGHT: 720,
  /** Ground surface Y within the level (world coords). */
  GROUND_Y: 640,
  /** The tall defensive wall: x position and how far up it rises. */
  WALL_X: 1680,
  WALL_TOP_Y: 40,
} as const;

/** Hero animation frame indices in the hero spritesheet (32x32, 7 frames). */
export const HERO_FRAMES = {
  IDLE: 0,
  RUN_A: 1,
  RUN_B: 2,
  GRAPPLE_FIRE: 3,
  SWING: 4,
  SLASH: 5,
  HURT: 6,
} as const;

/** Animation keys registered on the hero texture. */
export const HERO_ANIMS = {
  IDLE: 'hero_idle',
  RUN: 'hero_run',
  JUMP: 'hero_jump',
  FALL: 'hero_fall',
  SWING: 'hero_swing',
  SLASH: 'hero_slash',
  HURT: 'hero_hurt',
} as const;
