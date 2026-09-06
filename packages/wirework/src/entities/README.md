# Entities

Typed game-object classes live here: `Player`, the role-based enemy classes
(Wanderer, Sprinter, Breaker, Aberrant, Armored, Thrower), `Citizen`, and
`Wall`.

Each entity owns its sprite, physics body, and per-entity state. Balance
numbers come from `src/config/GameConfig.ts` rather than being hard-coded here.
