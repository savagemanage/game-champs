# Wirework — Asset Credits

Wirework is an original tech-fantasy ring-defense game. Its Arc Guardian, capacitor city, six autonomous siege-machine roles, rear cooling nodes, symbols, visual effects, and audio are original to this project and are not derived from third-party characters, settings, logos, or assets.

## Provenance and license

Every file under `public/assets/` is generated from the committed source below and released under the repository's Apache-2.0 license.

- Pixel art: [`tools/gen_sprites.py`](../tools/gen_sprites.py), Python + Pillow
- Audio: [`tools/gen_audio.py`](../tools/gen_audio.py), Python standard-library synthesis; no samples
- Author/source: Wirework project, this repository

## Generated files

### Sprites

| File | Original subject |
| --- | --- |
| `sprites/arc_guardian.png` | Arc Guardian, seven movement/combat frames |
| `sprites/machine_surveyor.png` | Surveyor siege machine |
| `sprites/machine_skitter.png` | Skitter low-profile assault machine |
| `sprites/machine_rammer.png` | Rammer heavy siege engine |
| `sprites/machine_fluxborn.png` | Fluxborn unstable approach machine |
| `sprites/machine_bastion.png` | Bastion frontal-plated machine |
| `sprites/machine_bombard.png` | Bombard ranged siege machine |
| `sprites/citizen.png` | Three resident variants |
| `sprites/tiles.png` | Ring-wall and city-surface tiles |
| `sprites/tether_probe.png` | Charge-tether probe |

Each machine uses an angular non-human chassis and a rear cyan cooling-node diamond. No enemy has a human face or biological anatomy.

### Background, UI, and effects

`backgrounds/sky.png`, `backgrounds/ground.png`, `backgrounds/hills.png`, and `backgrounds/wall.png`; `ui/panel.png`, `ui/button.png`, `ui/bar_frame.png`, and `ui/icons.png`; `fx/arc_cut.png`, `fx/spark.png`, `fx/dust.png`, and `fx/coolant.png`. Combat effects are stylized sparks and coolant only; there is no blood or gore.

### Audio

`tether_fire.wav`, `wire_attach.wav`, `swing_whoosh.wav`, `arc_cut.wav`, `machine_hit.wav`, `machine_shutdown.wav`, `attack_surveyor.wav`, `attack_skitter.wav`, `attack_rammer.wav`, `attack_fluxborn.wav`, `attack_bastion.wav`, `attack_bombard.wav`, `citizen_alarm.wav`, `ui_click.wav`, and `music_loop.wav` are deterministic procedural synthesis outputs.

## Regeneration

```sh
python3 tools/gen_sprites.py
python3 tools/gen_audio.py
```

The generators seed procedural variation, so a fixed toolchain produces reproducible output. Generated PNG/WAV files must not be edited directly.
