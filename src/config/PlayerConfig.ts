import { PLAYER } from './GameConfig';

/**
 * PlayerConfig - centralized tuning for the hero and the ODM (omni-directional
 * mobility) traversal systems in the TOP-DOWN arena: planar 8-direction
 * movement, the mouse-aimed grapple wire (a fling/pull toward an anchor now
 * that there is no gravity), the omnidirectional dash burst, and the gas /
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

/**
 * Core body / planar-movement tuning. Top-down: movement is 8-directional and
 * planar (no gravity, no jump). Input drives a target velocity toward
 * MOVE_SPEED along whichever of the eight directions are held, with an
 * acceleration ramp and friction when input is released.
 */
export const MOVEMENT = {
  /** Player max health (mirrors legacy PLAYER.MAX_HP). */
  MAX_HP: 100,
  /** Planar run speed, px/s (applies on every axis for 8-dir movement). */
  MOVE_SPEED: 200,
  /** Acceleration toward the target move velocity, px/s^2. */
  MOVE_ACCEL: 2600,
  /** Deceleration (friction) when no input is held, px/s^2. */
  MOVE_FRICTION: 2400,
  /** Physics body size (logical px) and offset within the 32x32 hero frame. */
  BODY_WIDTH: 12,
  BODY_HEIGHT: 22,
  BODY_OFFSET_X: 10,
  BODY_OFFSET_Y: 9,
  /** Hard cap on speed the player can carry on each axis (fling, dash), px/s. */
  MAX_H_SPEED: 640,
  MAX_V_SPEED: 640,
} as const;

/**
 * Hero survivability tuning. The hero can be hurt by giant melee attacks that
 * reach them and by direct DebrisProjectile hits; each hit opens a brief
 * invulnerability window so a single overlap can't chew through the whole bar
 * in one frame. Hitting zero HP is an additional lose condition.
 */
export const HERO_COMBAT = {
  /** Invulnerability window after taking a hit, ms (i-frames). */
  INVULN_MS: 800,
  /** Knockback speed applied away from the damage source on a hit, px/s. */
  HIT_KNOCKBACK: 240,
} as const;

/**
 * Blade slash VISUAL tuning. This controls only how the slash arc FX is drawn;
 * the hit math (reach, arc half-height, damage, nape-crit) lives in
 * CombatSystem and is unchanged. It exists because the raw slash FX texture
 * (assets/fx/slash.png) is a small 24px arc that, drawn at native size, reads
 * as a stubby poke roughly a third of the blade's true reach - so the attack
 * LOOKED like it could not touch a giant even though the hitbox already did.
 *
 * We derive the drawn length from the actual reach so the telegraph stays in
 * sync if PLAYER.BLADE_RANGE is ever retuned: the FX is scaled to span from
 * near the hero out to where a slash truly connects.
 */
export const BLADE_FX = {
  /**
   * Half-height of the slash arc hitbox, world px. CombatSystem reads this so
   * the drawn FX length below is derived from the SAME reach the hit test uses.
   */
  ARC_HALF_H: 22,
  /**
   * Native width of one frame of the slash FX texture, px (must match the
   * fx_slash SHEET frame in AssetKeys). The visible arc fills ~this width, so
   * scaling by TARGET_LENGTH / this makes the drawn arc span TARGET_LENGTH.
   */
  TEXTURE_SIZE: 24,
  /**
   * How far along the aim the drawn arc should reach from the hero centre, px.
   * Matches the real maximum slash connection distance
   * (BLADE_RANGE + ARC_HALF_H) so the visual telegraphs exactly where hits land.
   */
  TARGET_LENGTH: PLAYER.BLADE_RANGE + 22,
  /**
   * Perpendicular (cross-swing) scale for the arc so a lengthened slash still
   * reads as a sweeping crescent rather than a thin line. Kept modest so the
   * arc grows mostly along the aim.
   */
  CROSS_SCALE: 1.4,
} as const;

/**
 * Steering tuning for momentum-carrying states (fling / swing). Applies while
 * the hero is carrying built-up velocity from a grapple fling and lets input
 * nudge that trajectory without fully overriding the momentum.
 */
export const AIR = {
  /** Steering acceleration from input while carrying fling momentum, px/s^2. */
  ACCEL: 900,
  /** Max speed reachable from input steering alone, px/s. */
  MAX_INPUT_SPEED: 220,
  /** Passive drag applied to uncontrolled fling drift (per second fraction). */
  DRAG: 0.5,
  /** Extra steering force applied to nudge an attached swing direction, px/s^2. */
  SWING_STEER_ACCEL: 520,
} as const;

/**
 * Grapple / ODM wire tuning for the TOP-DOWN plane. With zero gravity the wire
 * is a fling/pull line rather than a pendulum: firing pulls the hero toward the
 * anchor (PULL_ACCEL), the rope length constrains how far out the hero can
 * drift, and releasing keeps the built-up velocity for a satisfying fling.
 */
export const GRAPPLE = {
  /**
   * Effectively-infinite reach constant, px. The ODM grapple's range is meant
   * to be unlimited ("사거리는 무한"): the aim ray can anchor to a wall or giant
   * at ANY distance and the wire never auto-detaches for being "too long". This
   * is set comfortably larger than the arena diagonal (ARENA 1280x1280 -> ~1810
   * px) so RANGE / MAX_LENGTH never limit reach in practice while remaining a
   * finite, config-driven number (no special-casing of Infinity in the physics).
   */
  INFINITE_REACH: 4000,
  /**
   * Maximum distance a grapple can reach from the player to a surface, px.
   * Set to INFINITE_REACH so the aim ray finds an anchor at any in-arena range.
   */
  RANGE: 4000,
  /**
   * Maximum rope length once attached (rope cannot stretch beyond this), px.
   * Set to INFINITE_REACH so the wire never clamps reel-out and a moving giant
   * can never drag the anchor "out of reach" and auto-detach in practice.
   */
  MAX_LENGTH: 4000,
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
  /**
   * Small radial boost added AWAY from the anchor on release, px/s. Replaces
   * the old vertical up-boost (meaningless top-down): it kicks the hero
   * outward along the wire so a fling off a ring reads as a launch.
   */
  RELEASE_RADIAL_BOOST: 70,
  /** Wire render thickness in logical px. */
  WIRE_THICKNESS: 1,
  /** Wire render color (0xRRGGBB). */
  WIRE_COLOR: 0xdfe6ef,
  /** Anchor marker radius, px. */
  ANCHOR_RADIUS: 2,
  /** How long the anchor stays "hooked" before auto-detach if unused, ms (0 = never). */
  AUTO_DETACH_MS: 0,

  // --- weak-point (nape) hook fling (FEAT-003) ---
  // Hooking a giant's WEAK POINT (nape) flings the hero straight at it with a
  // stronger, clearly-readable pull, tying traversal to the weak point and
  // setting up the finishing nape slash on arrival. These only apply when the
  // aim ray strikes a giant within NAPE_ANCHOR_SNAP_DIST of its live nape;
  // ordinary body grapples and wall grapples use the values above unchanged.
  /**
   * How close (px) the grapple ray's hit point must be to the giant's live nape
   * for the shot to count as a WEAK-POINT hook. Roughly a nape-radius-and-a-bit
   * so aiming at the neck reliably latches the weak point, while a hit on the
   * torso / limbs stays an ordinary body grapple.
   */
  NAPE_ANCHOR_SNAP_DIST: 34,
  /**
   * Boosted pull acceleration along the wire while hooked to the nape, px/s^2.
   * Stronger than PULL_ACCEL so the hero is visibly FLUNG toward the weak point
   * rather than lazily reeled, reading as a committed lunge into blade reach.
   */
  NAPE_PULL_ACCEL: 1150,
  /**
   * Auto-reel target rope length while hooked to the nape, px. The rope shrinks
   * toward this each frame so the hero is drawn in CLOSE to the weak point and
   * arrives inside CombatSystem.napeStrikeRange for the finishing slash. Slightly
   * larger than MIN_LENGTH so the hero settles beside the nape, not on top of it.
   */
  NAPE_MIN_LENGTH: 40,
  /** How fast the rope auto-reels toward NAPE_MIN_LENGTH while nape-hooked, px/s. */
  NAPE_REEL_SPEED: 320,
  /**
   * Velocity retained when releasing a nape hook (fraction of current). Kept at
   * or near 1 so the hero keeps their speed heading INTO the nape for the slash
   * instead of stalling out on release.
   */
  NAPE_RELEASE_KEEP: 1,
} as const;

/**
 * Dash: a short OMNIDIRECTIONAL burst impulse toward the aim/movement
 * direction. Top-down, so there is no air-dash concept - it is simply gated by
 * a cooldown and gas.
 */
export const DASH = {
  /** Impulse speed applied instantly in the dash direction, px/s. */
  IMPULSE: 480,
  /** Duration the dash "locks in" its burst velocity before control resumes, ms. */
  DURATION_MS: 150,
  /** Cooldown before another dash can fire, ms. */
  COOLDOWN_MS: 420,
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
  /**
   * Regen per second while "settled" (not flinging on a wire) and not spending
   * gas. Top-down has no ground, so this is the baseline standing regen.
   */
  REGEN_GROUNDED_PER_SEC: 55,
  /** Regen per second while carrying fling momentum but not spending gas. */
  REGEN_AIRBORNE_PER_SEC: 26,
  /** Delay after spending gas before regen resumes, ms. */
  REGEN_DELAY_MS: 350,
} as const;

/** Camera-follow tuning for the top-down arena. */
export const CAMERA = {
  /** Lerp factor for smooth follow [0..1] per axis. */
  LERP_X: 0.12,
  LERP_Y: 0.12,
  /** Deadzone rectangle (logical px) centered on the viewport. */
  DEADZONE_W: 140,
  DEADZONE_H: 100,
} as const;

/**
 * ARENA bounds for the TOP-DOWN siege. A large square whose CENTER holds the
 * citizen core; the concentric double ring (see GameConfig WALL) is laid out
 * around this center. The camera and physics world are bounded to this square.
 */
export const ARENA = {
  WIDTH: 1280,
  HEIGHT: 1280,
  /** Arena center (rings + citizen core are concentric about this point). */
  CENTER_X: 640,
  CENTER_Y: 640,
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

/**
 * Animation keys registered on the hero texture. Top-down uses no jump/fall
 * states; DASH reuses the dynamic SWING pose for the burst.
 */
export const HERO_ANIMS = {
  IDLE: 'hero_idle',
  RUN: 'hero_run',
  DASH: 'hero_dash',
  SWING: 'hero_swing',
  SLASH: 'hero_slash',
  HURT: 'hero_hurt',
} as const;
