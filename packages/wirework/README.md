# Wirework

Wirework is an original 2D pixel-art top-down ring-defense action game. As the Arc Guardian of a capacitor city, use a charge tether, momentum-preserving fling, directional dash, and arc cutter to protect 12 residents through eight waves of autonomous siege machines.

Surveyors, Skitters, Rammers, Fluxborn, Bastions, and Bombards each have a distinct mechanical silhouette and a rear cooling node. Breaching one outer-ring sector opens only the matching inner route, so every attack direction remains readable and local.

## Controls

- WASD / arrows: normalized eight-direction movement
- Shift: dash along movement or last facing
- Hold/release left mouse: tether and fling
- Q / E: reel in / out
- Right mouse: arc-cutter sweep
- P: pause; Esc: abandon confirmation
- XInput: left/right sticks, RT tether, X cutter, A dash, LB/RB reel, Menu pause

Touch gameplay is not supported; touch remains available for menus and layout inspection.

## Development

From the repository root:

```sh
npm run typecheck -w packages/wirework
npm run test -w packages/wirework -- --run
npm run build -w packages/wirework
```

The authoritative product contract is [`SPEC.md`](SPEC.md). Generated asset provenance is recorded in [`assets/CREDITS.md`](assets/CREDITS.md).
