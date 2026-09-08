# Arena Champions

Arena Champions is an original browser-based three-lane arena battler. Choose an original champion, lead a five-member team against local AI, gain levels and gold, build items, contest neutral objectives, and break the opposing core in a compact 10–15 minute match.

The game is built with React, TypeScript, Phaser 3, procedural SVG art, and procedural Web Audio. It supports Korean and English, desktop and mobile layouts, keyboard/mouse and touch input, reduced motion, versioned local progression, and GitHub Pages deployment.

## Play

Live site: <https://savagemanage.github.io/open-games/champs/>

### Modes

- **Three-Lane Conquest** — a full 5v5 battle across top, middle, and bottom lanes with structures, minion waves, jungle terrain markers, Ember Dragon, Stone Warden, and Void Tyrant objectives.
- **Midline Skirmish** — a faster single-lane 5v5 fight with a randomized roster and no neutral objective pits.
- **Learning Match** — the same Easy local match rules, tracked separately so first-time players can learn without currency pressure.
- **Practice** — a low-pressure local match for learning champions and builds.

All opponents and allied teammates are AI-controlled. The current static deployment does **not** claim internet multiplayer. The online foundation under `src/online/` provides versioned commands/events, validation, local authority, snapshots, checksums, reconnect contracts, and local-only matchmaking descriptors (`network: 'none'`) for a future authenticated backend.

### Controls

| Input | Action |
| --- | --- |
| Left or right click / touch | Move or target |
| `Q` `W` `E` `R` | Cast the corresponding ability toward the cursor |
| `A`, then click / touch | Attack-move toward the chosen point |
| `S` | Stop and clear the current target |
| `B` | Open the shop while in base |
| HUD ability buttons | Cast on touch devices |

## Match loop

- Five champions per team with role-aware contextual AI.
- Mode-specific wave cadence, structures, respawn tuning, and hard-cap resolution.
- Champion death, respawn, brief invulnerability, level progression, passive income, and bot purchases.
- Delayed ranged impacts, persistent targets, explicit attack-move/stop commands, hit pause, recoil, damage text, screen shake, and kill emphasis.
- Contestable neutral monsters and team rewards in Three-Lane Conquest.
- Recipe-aware item recommendations and component-adjusted remaining costs.
- Sudden death at 12 minutes and deterministic score resolution at 15 minutes when neither core has fallen.

## Progression and privacy

A versioned local profile (`champs:profile`) stores currency, account XP, unlocks, mastery, Learning Match/practice completion, last setup, and a bounded idempotency window of applied match IDs.

Diagnostics are privacy-first:

- disabled until explicit consent;
- blocked by Global Privacy Control or Do Not Track;
- strict coarse-field allowlist with bounded, expiring in-memory queues;
- no remote endpoint and no automatic upload;
- coarse crash and performance categories only;
- manual local JSON export and clear controls in Settings.

## Champion roster

Ten original champions provide at least two choices per archetype and lane role. Team composition selects one champion per role on each side and keeps the two teams disjoint, including when the player and opponent request the same champion.

| Champion | Title | Role | Lane |
| --- | --- | --- | --- |
| **Ashborne** | the Ember Archer | Marksman | Bot |
| **Duskarrow** | the Twilight Ranger | Marksman | Bot |
| **Nightveil** | the Silent Blade | Assassin | Mid |
| **Grimtrail** | the Feral Stalker | Assassin | Jungle |
| **Ironhold** | the Bulwark | Bruiser | Top |
| **Thornwarden** | the Bramble Sentinel | Bruiser | Top |
| **Embermage** | the Cinderweaver | Mage | Jungle |
| **Frostquill** | the Rime Scribe | Mage | Mid |
| **Dawnsong** | the Radiant Muse | Enchanter | Support |
| **Wardlight** | the Lantern Keeper | Enchanter | Support |

## Architecture

Phaser owns authoritative combat simulation; React owns navigation, dialogs, and the HUD. React does not duplicate combat rules.

Key modules:

- `src/config/matchRules.ts` — mode-aware waves, objectives, structures, respawns, sudden death, and hard-cap weights.
- `src/game/scenes/BattleScene.ts` — authoritative match orchestration and rendering integration.
- `src/game/combat.ts`, `ai.ts`, `championLifeState.ts`, `matchResolution.ts` — Phaser-free tested rules.
- `src/game/rift/` — pure map, lane, minion, structure, economy, objective, loadout, and projection modules.
- `src/game/render/` — procedural SVG entity art, finite champion poses, cached textures, and VFX.
- `src/game/audio.ts` — procedural music, ambience, champion cues, and bounded audio voices.
- `src/profile/` — versioned local save migration and rewards.
- `src/game/tutorial/` — match kinds and difficulty cadence configuration.
- `src/online/` — truthful local authority/protocol/snapshot groundwork for a future server.
- `src/telemetry/` — consent, redaction, bounded queueing, local export, crash capture, and coarse performance sampling.

### Rendering and performance

The world uses a pure dimetric projection and a fixed 900×640 logical stage with aspect-preserving `Scale.FIT`; portrait screens letterbox rather than distort the arena. SVG strings are rasterized once into cached Phaser textures. Runtime budgets cap HUD publication, transient VFX, damage text, minions, audio voices, and frame delta. Reduced-motion settings suppress camera shake, flashes, slow motion, and positional cosmetic tweens.

All champion, item, world, visual, and audio content is original. Fonts are locally hosted under `public/fonts/` with their license files. No external game art, audio, CDN, or runtime asset fetch is used.

## Development

Requires Node 22 and npm. From the repository root:

```bash
npm install
npm run typecheck
npm run test
npm run build
npm run docs:check
```

Package-only commands:

```bash
npm run typecheck --workspace game-champs
npm run test --workspace game-champs
npm run build --workspace game-champs
```

The production Vite base is `/open-games/champs/`. The repository deployment workflow publishes all game workspaces to GitHub Pages after changes merge to `main`.

## License

Apache License 2.0; see the repository-root [LICENSE](../../LICENSE).
