import Phaser from 'phaser';
import { PALETTE, WALL } from '../config/GameConfig';
import { LEVEL } from '../config/PlayerConfig';

/**
 * Wall - the defendable settlement rampart. It has an integrity pool that
 * attacking giants (especially Breakers) chip away with each hit. When
 * integrity reaches zero the wall is BREACHED: it visually collapses and giants
 * can path past it to reach the citizens behind. A breach is also a game-over
 * trigger (the settlement is considered fallen) handled by the scene.
 *
 * The wall renders as a solid rampart column; a damage overlay + shake give hit
 * feedback. It exposes a static physics body so the player still collides with
 * it for traversal.
 */
export class Wall {
  private readonly scene: Phaser.Scene;
  private readonly maxIntegrity: number;
  private integrity: number;
  private breached = false;

  /** The visible rampart rectangle (also the static collider). */
  public readonly body: Phaser.GameObjects.Rectangle;
  /** A red damage overlay whose height grows as integrity drops. */
  private readonly damageOverlay: Phaser.GameObjects.Rectangle;

  /** World x of the wall's attackable face (giants stop here). */
  public readonly faceX: number;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.maxIntegrity = WALL.MAX_INTEGRITY;
    this.integrity = this.maxIntegrity;

    const wallH = LEVEL.GROUND_Y - LEVEL.WALL_TOP_Y;
    const wallW = 60;
    const cx = LEVEL.WALL_X;
    const cy = LEVEL.WALL_TOP_Y + wallH / 2;
    this.faceX = LEVEL.WALL_X - wallW / 2;

    this.body = scene.add.rectangle(cx, cy, wallW, wallH, PALETTE.WALL).setDepth(1);
    this.body.setStrokeStyle(2, PALETTE.WALL_DARK);
    scene.physics.add.existing(this.body, true);

    this.damageOverlay = scene.add
      .rectangle(cx, LEVEL.GROUND_Y, wallW, 0, PALETTE.ENEMY_WEAKPOINT)
      .setOrigin(0.5, 1)
      .setDepth(2)
      .setAlpha(0.35);
  }

  /** Current integrity ratio [0..1]. */
  get ratio(): number {
    return this.maxIntegrity > 0 ? this.integrity / this.maxIntegrity : 0;
  }

  /** Whether the wall has been breached (integrity depleted). */
  get isBreached(): boolean {
    return this.breached;
  }

  /**
   * Apply damage from an attacker. Returns true if this hit caused the breach.
   * Once breached the wall takes no further integrity changes.
   */
  damage(amount: number): boolean {
    if (this.breached) return false;
    this.integrity = Math.max(0, this.integrity - amount);
    this.refreshOverlay();

    // Shake feedback proportional to the hit.
    this.scene.cameras.main.shake(120, Math.min(0.01, amount * 0.0004));

    if (this.integrity <= 0) {
      this.breached = true;
      this.collapse();
      return true;
    }
    return false;
  }

  private refreshOverlay(): void {
    const wallH = LEVEL.GROUND_Y - LEVEL.WALL_TOP_Y;
    this.damageOverlay.height = wallH * (1 - this.ratio);
    // Fade the rampart toward its dark tone as it weakens.
    const t = 1 - this.ratio;
    this.body.fillColor = Phaser.Display.Color.Interpolate.ColorWithColor(
      Phaser.Display.Color.IntegerToColor(PALETTE.WALL),
      Phaser.Display.Color.IntegerToColor(PALETTE.WALL_DARK),
      100,
      Math.floor(t * 100),
    ).color;
  }

  /** Visual collapse: drop and disable the collider so giants can pass. */
  private collapse(): void {
    const staticBody = this.body.body as Phaser.Physics.Arcade.StaticBody | null;
    if (staticBody) staticBody.enable = false;
    this.scene.cameras.main.shake(400, 0.02);
    this.scene.tweens.add({
      targets: [this.body, this.damageOverlay],
      alpha: 0.25,
      scaleY: 0.35,
      y: LEVEL.GROUND_Y,
      duration: 500,
      ease: 'Bounce.easeOut',
    });
  }
}
