# ui/

Shared pixel-UI helpers and in-scene components, built on the medieval palette
and the 9-slice art in `public/assets/ui/`.

- `UiText.ts` — crisp high-DPI text style (`textStyle`) + shared font stack, so
  small HUD/menu glyphs stay sharp under the pixel-art `Scale.FIT` upscale.
- `Menu.ts` — shared helpers: `title`, `label`, `panel`, `button` (hover +
  UI-click SFX + enable/disable), `progressBar`, and `fadeIn` / `fadeTo`
  transitions. Every scene composes its UI from these for one cohesive look.
- `TrainingPanel.ts` — the Barracks troop-training overlay: per-troop cost/time
  rows with a +/- batch selector and a Train button that enqueues through the
  shared `GameState` `TrainingQueue`, plus a live queue readout and standing
  army counts.

All user-facing text is routed through `tr()` from `src/i18n`.
