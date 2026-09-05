# Wirework

An original-world 2D pixel-art **wall-defense ODM action** game. You pilot an
omni-directional mobility (ODM) grapple rig, swinging above a besieged city to
cut down waves of giant humanoids ("Ravagers") before they breach the wall and
reach the citizens sheltered behind it.

> Wirework is an **original** work inspired by the wall-defense / grapple-action
> genre. All names, lore, enemy archetypes, and art are original. It does not
> use any third-party intellectual property.

Built with [Phaser 3](https://phaser.io/), TypeScript, and [Vite](https://vitejs.dev/).

## Getting started

Requires **Node 20**.

```bash
npm install      # install dependencies
npm run dev      # start the Vite dev server
npm run build    # type-check + production build into dist/
npm run preview  # preview the production build locally
npm run typecheck # type-check only (tsc --noEmit)
```

## Controls

| Input            | Action                          |
| ---------------- | ------------------------------- |
| SPACE / Click    | Deploy (start) from the Title   |
| S (Title)        | Open Settings                   |
| ESC              | Back / end the current run      |

Full ODM movement and combat controls arrive with the gameplay features.

## Project structure

```
src/
  main.ts          Phaser.Game bootstrap + scene list
  config/          Centralized, config-driven tuning (GameConfig.ts)
  scenes/          Boot, Title, Settings, Game, GameOver
  entities/        Player, enemy roles, Citizen, Wall (per-feature)
  systems/         ODM grapple physics, wave spawner, combat (per-feature)
  ui/              HUD and menus (per-feature)
  types/           Shared cross-cutting types
```

## Deployment

Pushes to `main` trigger `.github/workflows/deploy.yml`, which builds the site
and publishes `dist/` to GitHub Pages at
<https://savagemanage.github.io/wirework/>. The production build sets the Vite
`base` to `/wirework/` so assets resolve under the project-pages path.

## Credits

Third-party asset credits and licenses are recorded in `assets/CREDITS.md`.

## License

Apache-2.0. See [LICENSE](LICENSE).
