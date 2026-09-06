# entities/

Phaser-facing game objects (buildings, troops, raiders, projectiles) live here.
They wrap the pure-logic state from `src/systems/` with sprites and animations.

- `Battler.ts` - one animated combatant sprite (a trained troop or an enemy
  raider) for the BattleScene, with a floating HP bar and march / attack / death
  (spark + dust FX + hit SFX) behaviour. It is purely a visualization: the
  battle OUTCOME is owned by `systems/CombatSystem` and surfaced to the scene as
  a `systems/CasualtyTimeline`, so the on-screen counts always end on the
  deterministic resolution.
