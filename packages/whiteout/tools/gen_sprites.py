#!/usr/bin/env python3
"""
gen_sprites.py - Original pixel-art asset generator for FROSTHOLD: LAST EMBER.

Everything produced by this script is ORIGINAL art authored programmatically for
this project. Nothing is traced, ripped, or derived from any existing IP.
Frosthold: Last Ember (서리성채: 마지막 불씨) is an ORIGINAL frozen-survival
city-builder / idle game, merely INSPIRED BY the genre - it does NOT use the
"Whiteout Survival" (or any third-party) name, characters, factions, story,
logos, art, or audio. The world is locked in an endless winter and the
settlement survives around a central Furnace whose Ember must be fed with wood +
coal to hold back the cold: idle resource buildings, a Furnace-gated upgrade
tree, troop training, and wave-based combat against the Frozen Horde. All
designs (buildings, troops, enemies, icons) are original and role-based.

All output PNGs are nearest-neighbour pixel art on a cohesive frozen palette
(cold blues / whites / steel warmed by an ember-orange Furnace glow) that lines
up with PALETTE in src/config/GameConfig.ts (logical canvas 960x540).

Run:  python3 tools/gen_sprites.py
Out:  public/assets/{sprites,backgrounds,ui,fx}/*.png
"""

import math
import random
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUB = os.path.join(ROOT, "public")
SPR = os.path.join(ROOT, "public", "assets", "sprites")
BG = os.path.join(ROOT, "public", "assets", "backgrounds")
UI = os.path.join(ROOT, "public", "assets", "ui")
FX = os.path.join(ROOT, "public", "assets", "fx")
for d in (PUB, SPR, BG, UI, FX):
    os.makedirs(d, exist_ok=True)

# ---------------------------------------------------------------------------
# Cohesive frozen-survival palette (RGBA). Mirrors PALETTE in
# src/config/GameConfig.ts: cold blues / whites / steel for the frozen terrain
# and UI, warmed by an EMBER orange that radiates from the Furnace.
# ---------------------------------------------------------------------------
T = (0, 0, 0, 0)  # transparent

# Terrain / snow / ice / steel
SNOW = (188, 210, 228, 255)          # snowfield tone (GameConfig GRASS)
SNOW_DK = (143, 169, 194, 255)       # shadowed snow (GRASS_DARK)
SNOW_LT = (230, 242, 251, 255)       # bright frost highlight (FROST)
ICE = (159, 216, 236, 255)           # ICE
ICE_DK = (108, 160, 186, 255)
SLATE = (74, 85, 104, 255)           # frozen ground / slate (DIRT)
SLATE_DK = (51, 61, 77, 255)         # DIRT_DARK
STONE = (127, 138, 153, 255)         # frost-worn stone / steel (STONE)
STONE_DK = (76, 85, 99, 255)         # STONE_DARK
STONE_LT = (195, 206, 217, 255)      # STONE_LIGHT
WOOD = (106, 81, 56, 255)            # weathered timber (WOOD)
WOOD_DK = (69, 51, 32, 255)          # WOOD_DARK
WOOD_LT = (150, 116, 78, 255)

# Ember / Furnace glow (the one warm accent in the world)
EMBER = (255, 122, 60, 255)          # EMBER / ACCENT
EMBER_LT = (255, 196, 120, 255)
EMBER_DK = (198, 78, 30, 255)
EMBER_CORE = (255, 240, 200, 255)

# Resource accents (rations, timber, coal, iron)
FOOD = (143, 208, 196, 255)          # preserved rations, cold teal (FOOD)
FOOD_DK = (96, 158, 148, 255)
WOOD_RES = (156, 107, 60, 255)       # WOOD_RES
COAL = (52, 56, 64, 255)             # coal: dark charcoal (STONE_RES)
COAL_LT = (92, 98, 110, 255)
IRON = (185, 196, 207, 255)          # iron: cold steel grey (GOLD)
IRON_DK = (128, 140, 152, 255)

# Banners: settlement fights under the ember banner, the Horde in frost blue
FLAG = (255, 122, 60, 255)           # BANNER_FRIENDLY (ember)
FLAG_ENEMY = (95, 182, 214, 255)     # BANNER_ENEMY (frost blue)
GLASS = (159, 216, 236, 255)         # icy window glow
OUTLINE = (22, 28, 40, 255)          # cold-dark outline (PANEL-ish)

# Troop / character palette (cold-weather survivors + frozen creatures)
SKIN = (226, 205, 190, 255)          # cold-flushed skin
SKIN_SH = (188, 166, 150, 255)
FUR = (120, 104, 92, 255)            # fur trim / hides
FUR_DK = (86, 74, 64, 255)
FUR_LT = (170, 156, 142, 255)
STEEL = (188, 202, 214, 255)
STEEL_HI = (226, 236, 246, 255)
STEEL_DK = (110, 122, 136, 255)
PARKA_BLUE = (74, 112, 168, 255)     # trapper parka
PARKA_BLUE_DK = (50, 80, 126, 255)
PARKA_TEAL = (58, 140, 138, 255)     # marksman
PARKA_TEAL_DK = (40, 100, 100, 255)
PLATE = (150, 166, 182, 255)         # vanguard frost-plate
PLATE_DK = (96, 110, 126, 255)
PANTS = (66, 72, 84, 255)
BOOT = (44, 48, 58, 255)
MOUTH = (60, 44, 40, 255)

# Frozen Horde creature tones
WOLF = (150, 168, 186, 255)          # frost wolf pelt
WOLF_DK = (104, 122, 142, 255)
WOLF_LT = (200, 216, 230, 255)
RAVAGER = (86, 120, 140, 255)        # ice-hardened raider hide
RAVAGER_DK = (58, 86, 104, 255)
TITAN = (120, 156, 182, 255)         # frost titan ice-body
TITAN_DK = (78, 112, 140, 255)
TITAN_LT = (196, 224, 240, 255)
GLOW_RED = (255, 96, 72, 255)        # hostile eye glow


def new(w, h):
    return Image.new("RGBA", (w, h), T)


def px(img, x, y, c):
    if 0 <= x < img.width and 0 <= y < img.height:
        img.putpixel((x, y), c)


def rect(img, x0, y0, x1, y1, c):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            px(img, x, y, c)


def outline_alpha(img, oc=OUTLINE):
    """Add a 1px dark outline around opaque pixels (only onto transparent cells)."""
    w, h = img.width, img.height
    src = img.load()
    out = img.copy()
    dst = out.load()
    for y in range(h):
        for x in range(w):
            if src[x, y][3] != 0:
                continue
            near = False
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and src[nx, ny][3] > 200:
                        near = True
            if near:
                dst[x, y] = oc
    return out


def save(img, path, scale=1):
    if scale != 1:
        img = img.resize((img.width * scale, img.height * scale), Image.NEAREST)
    img.save(path)


# ===========================================================================
# BUILDINGS: each is a 2-frame sheet (tier 0 = weathered starter, tier 1 =
# upgraded look with banners / extra detail). The tier chosen at runtime is
# level-derived; a numeric level badge is drawn by the engine over the sprite.
# ===========================================================================

def draw_ground_pad(img, ox, oy, fw, fh):
    """A little packed-snow / frozen pad the building sits on."""
    rect(img, ox + 4, oy + fh - 6, ox + fw - 5, oy + fh - 2, SNOW_DK)
    rect(img, ox + 4, oy + fh - 6, ox + fw - 5, oy + fh - 6, STONE_DK)
    # a couple of snow humps at the base
    px(img, ox + 5, oy + fh - 7, SNOW_LT)
    px(img, ox + fw - 6, oy + fh - 7, SNOW_LT)


def banner(img, x, y, h, color):
    """A vertical banner/pennant hanging from a pole."""
    rect(img, x, y, x, y + h, WOOD_DK)          # pole
    rect(img, x + 1, y, x + 4, y + h - 2, color)
    px(img, x + 2, y + h - 1, color)


def draw_furnace(img, ox, oy, fw, fh, tier):
    """The central Furnace: a stone hearth-tower with a glowing ember core and a
    warm chimney glow. This is the heart of the settlement. 64x64 frame."""
    draw_ground_pad(img, ox, oy, fw, fh)
    cx = ox + fw // 2
    base_top = oy + fh - 32
    # stone hearth body
    rect(img, ox + 12, base_top, ox + fw - 13, oy + fh - 6, STONE)
    rect(img, ox + 12, base_top, ox + 12, oy + fh - 6, STONE_LT)
    rect(img, ox + fw - 13, base_top, ox + fw - 13, oy + fh - 6, STONE_DK)
    for y in range(base_top + 4, oy + fh - 6, 5):
        rect(img, ox + 13, y, ox + fw - 14, y, STONE_DK)
    # snow cap on the ledges
    rect(img, ox + 12, base_top, ox + fw - 13, base_top, SNOW_LT)
    # glowing furnace mouth (ember core)
    mw = 8
    rect(img, cx - mw // 2, oy + fh - 18, cx + mw // 2, oy + fh - 7, EMBER_DK)
    rect(img, cx - mw // 2 + 1, oy + fh - 16, cx + mw // 2 - 1, oy + fh - 8, EMBER)
    rect(img, cx - 1, oy + fh - 14, cx + 1, oy + fh - 9, EMBER_LT)
    px(img, cx, oy + fh - 11, EMBER_CORE)
    # chimney / stack
    tw = 14 if tier == 1 else 12
    ttop = oy + 6 if tier == 1 else oy + 10
    rect(img, cx - tw // 2, ttop, cx + tw // 2, base_top, STONE)
    rect(img, cx - tw // 2, ttop, cx - tw // 2, base_top, STONE_LT)
    rect(img, cx + tw // 2, ttop, cx + tw // 2, base_top, STONE_DK)
    rect(img, cx - tw // 2, ttop, cx + tw // 2, ttop, SNOW_LT)  # snow on the rim
    # ember glow rising from the stack
    glow_top = ttop - (10 if tier == 1 else 6)
    for i, y in enumerate(range(glow_top, ttop)):
        w = 1 + (ttop - y) // 3
        c = EMBER_LT if (i % 2 == 0) else EMBER
        rect(img, cx - w, y, cx + w, y, c)
    px(img, cx, glow_top, EMBER_CORE)
    # side buttresses
    rect(img, ox + 9, base_top + 6, ox + 12, oy + fh - 6, STONE_DK)
    rect(img, ox + fw - 13, base_top + 6, ox + fw - 10, oy + fh - 6, STONE_DK)
    if tier == 1:
        # ember banners flank the stack + a warm trim line
        banner(img, cx - tw // 2 - 2, ttop + 2, 8, FLAG)
        banner(img, cx + tw // 2 + 1, ttop + 2, 8, FLAG)
        rect(img, ox + 12, base_top + 2, ox + fw - 13, base_top + 2, EMBER)
        # small side vents also glowing
        px(img, ox + 15, oy + fh - 12, EMBER)
        px(img, ox + fw - 16, oy + fh - 12, EMBER)


def draw_house_shell(img, ox, oy, fw, fh, wall, wall_dk, roof, roof_dk, roof_hi):
    """Generic snow-topped cabin: walls + gabled roof under a coat of snow.
    Used by the resource buildings."""
    draw_ground_pad(img, ox, oy, fw, fh)
    wall_top = oy + fh // 2
    rect(img, ox + 8, wall_top, ox + fw - 9, oy + fh - 6, wall)
    rect(img, ox + 8, wall_top, ox + 8, oy + fh - 6, wall_dk)
    rect(img, ox + fw - 9, wall_top, ox + fw - 9, oy + fh - 6, wall_dk)
    # gable roof
    rh = wall_top - (oy + 8)
    for i in range(rh + 1):
        y = wall_top - i
        spread = int((fw - 12) * (1 - i / max(1, rh)) / 2)
        cxc = ox + fw // 2
        rect(img, cxc - spread, y, cxc + spread, y, roof)
        px(img, cxc - spread, y, roof_dk)
        px(img, cxc + spread, y, roof_dk)
        # snow settled on the roof (upper edge)
        if i >= rh - 2:
            rect(img, cxc - spread, y, cxc + spread, y, SNOW_LT)
    rect(img, ox + 8, wall_top, ox + fw - 9, wall_top, roof_hi)
    # icicles along the eaves
    for x in range(ox + 9, ox + fw - 9, 4):
        px(img, x, wall_top + 1, ICE)
    # door with a warm glow inside
    cxc = ox + fw // 2
    rect(img, cxc - 2, oy + fh - 12, cxc + 1, oy + fh - 6, WOOD_DK)
    px(img, cxc, oy + fh - 9, EMBER)


def draw_hunters_hut(img, ox, oy, fw, fh, tier):
    """Hunters' Hut - produces food (rations). Cabin with drying racks + a small
    catch."""
    draw_house_shell(img, ox, oy, fw, fh, WOOD, WOOD_DK, FUR_DK, WOOD_DK, FUR)
    base = oy + fh - 7
    # drying rack posts with hides / fish
    rack_top = oy + fh - 16
    rect(img, ox + 6, rack_top, ox + 6, base, WOOD_DK)
    rect(img, ox + 13, rack_top, ox + 13, base, WOOD_DK)
    rect(img, ox + 6, rack_top, ox + 13, rack_top, WOOD)
    for i, x in enumerate(range(ox + 7, ox + 13, 2)):
        rect(img, x, rack_top + 1, x, rack_top + 4, FOOD if i % 2 == 0 else FUR_LT)
    if tier == 1:
        # a second rack + fuller catch
        rect(img, ox + fw - 14, rack_top, ox + fw - 14, base, WOOD_DK)
        rect(img, ox + fw - 7, rack_top, ox + fw - 7, base, WOOD_DK)
        rect(img, ox + fw - 14, rack_top, ox + fw - 7, rack_top, WOOD)
        for x in range(ox + fw - 13, ox + fw - 7, 2):
            rect(img, x, rack_top + 1, x, rack_top + 4, FOOD)
        banner(img, ox + fw // 2, oy + fh // 2 - 7, 6, FLAG)


def draw_sawmill(img, ox, oy, fw, fh, tier):
    """Sawmill - produces wood (timber / fuel). Cabin with a log pile + blade."""
    draw_house_shell(img, ox, oy, fw, fh, WOOD, WOOD_DK, STONE_DK, WOOD_DK, STONE)
    base = oy + fh - 7
    # log pile
    for y in (base, base - 3):
        for x in range(ox + 6, ox + 14, 3):
            rect(img, x, y - 2, x + 2, y, WOOD_LT)
            px(img, x, y - 2, WOOD_DK)
            px(img, x + 1, y - 1, SNOW_LT)  # snow dusting
    if tier == 1:
        # a saw blade emblem
        cxc = ox + fw - 12
        cy = oy + fh - 14
        for a in range(0, 360, 45):
            x = int(cxc + 4 * math.cos(math.radians(a)))
            y = int(cy + 4 * math.sin(math.radians(a)))
            px(img, x, y, STEEL)
        rect(img, cxc - 2, cy - 2, cxc + 2, cy + 2, STEEL_HI)


def draw_coal_pit(img, ox, oy, fw, fh, tier):
    """Coal Pit - produces coal (the Furnace's key fuel). A dark dig with coal
    heaps + a timbered mouth."""
    draw_ground_pad(img, ox, oy, fw, fh)
    # snowy rock face
    rect(img, ox + 8, oy + 14, ox + fw - 9, oy + fh - 6, STONE_DK)
    rect(img, ox + 8, oy + 14, ox + 8, oy + fh - 6, STONE)
    rect(img, ox + 8, oy + 14, ox + fw - 9, oy + 14, SNOW_LT)
    # arched black pit entrance
    cxc = ox + fw // 2
    rect(img, cxc - 5, oy + fh - 20, cxc + 4, oy + fh - 6, (14, 14, 18, 255))
    rect(img, cxc - 6, oy + fh - 22, cxc + 5, oy + fh - 20, WOOD_DK)   # timber frame
    rect(img, cxc - 6, oy + fh - 20, cxc - 5, oy + fh - 6, WOOD_DK)
    rect(img, cxc + 4, oy + fh - 20, cxc + 5, oy + fh - 6, WOOD_DK)
    # coal heaps out front
    base = oy + fh - 6
    for x in range(ox + 7, ox + fw - 8, 6):
        rect(img, x, base - 3, x + 4, base, COAL)
        px(img, x + 1, base - 3, COAL_LT)
        px(img, x + 3, base - 2, COAL_LT)
    if tier == 1:
        # a coal cart at the mouth + brazier glow
        rect(img, cxc - 3, base - 3, cxc + 2, base, WOOD)
        rect(img, cxc - 2, base - 4, cxc + 1, base - 3, COAL)
        px(img, cxc, base - 4, EMBER)
        px(img, cxc - 3, base + 1, (14, 14, 18, 255))
        px(img, cxc + 2, base + 1, (14, 14, 18, 255))


def draw_iron_mine(img, ox, oy, fw, fh, tier):
    """Iron Mine - produces iron (cold steel). Rock face with iron ore veins."""
    draw_ground_pad(img, ox, oy, fw, fh)
    rect(img, ox + 8, oy + 14, ox + fw - 9, oy + fh - 6, STONE)
    rect(img, ox + 8, oy + 14, ox + 8, oy + fh - 6, STONE_LT)
    rect(img, ox + 8, oy + 14, ox + fw - 9, oy + 14, SNOW_LT)
    for y in range(oy + 18, oy + fh - 8, 5):
        rect(img, ox + 9, y, ox + fw - 10, y, STONE_DK)
    # arched entrance
    cxc = ox + fw // 2
    rect(img, cxc - 5, oy + fh - 20, cxc + 4, oy + fh - 6, (26, 30, 38, 255))
    rect(img, cxc - 6, oy + fh - 22, cxc + 5, oy + fh - 20, STEEL_DK)  # steel frame
    rect(img, cxc - 6, oy + fh - 20, cxc - 5, oy + fh - 6, STEEL_DK)
    rect(img, cxc + 4, oy + fh - 20, cxc + 5, oy + fh - 6, STEEL_DK)
    # iron ore veins glinting steel
    px(img, ox + 12, oy + 20, IRON)
    px(img, ox + 13, oy + 21, IRON_DK)
    px(img, ox + fw - 13, oy + 24, IRON)
    px(img, ox + fw - 12, oy + 25, IRON_DK)
    if tier == 1:
        # a cart of iron ingots + a lantern glow
        base = oy + fh - 6
        rect(img, cxc - 3, base - 3, cxc + 2, base, STEEL_DK)
        rect(img, cxc - 2, base - 4, cxc + 1, base - 3, IRON)
        px(img, cxc - 1, base - 4, STEEL_HI)
        px(img, ox + fw - 11, oy + fh - 17, EMBER)  # lantern


def draw_war_camp(img, ox, oy, fw, fh, tier):
    """War Camp - trains the settlement's troops. A fortified cabin with a
    weapon rack + ember banner."""
    draw_house_shell(img, ox, oy, fw, fh, STONE, STONE_DK, STONE_DK, SLATE_DK, STONE_LT)
    cxc = ox + fw // 2
    # crossed spears on the wall
    for i in range(6):
        px(img, cxc - 3 + i, oy + fh - 16 + i, STEEL)
        px(img, cxc + 3 - i, oy + fh - 16 + i, STEEL)
    # a shield with the ember mark
    rect(img, cxc - 2, oy + fh - 12, cxc + 1, oy + fh - 8, FLAG)
    px(img, cxc, oy + fh - 10, EMBER_CORE)
    if tier == 1:
        banner(img, ox + 9, oy + fh // 2 - 8, 8, FLAG)
        banner(img, ox + fw - 11, oy + fh // 2 - 8, 8, FLAG)
        # a lit brazier out front
        base = oy + fh - 7
        rect(img, ox + fw // 2 - 1, base - 2, ox + fw // 2 + 1, base, STEEL_DK)
        px(img, ox + fw // 2, base - 3, EMBER)


def draw_shelter_row(img, ox, oy, fw, fh, tier):
    """Shelter Row - survivor housing. A row of small snow-topped cabins with
    warm windows glowing against the cold (more windows lit at tier 1)."""
    draw_ground_pad(img, ox, oy, fw, fh)
    base = oy + fh - 6
    roof = oy + fh - 20
    # three joined cabins
    for i, gx in enumerate(range(ox + 6, ox + fw - 10, 12)):
        rect(img, gx, roof, gx + 10, base, WOOD)
        rect(img, gx, roof, gx, base, WOOD_DK)
        # snow-capped gable
        for k in range(5):
            rect(img, gx + k, roof - k, gx + 10 - k, roof - k, FUR_DK)
        rect(img, gx, roof - 4, gx + 10, roof - 4, SNOW_LT)
        # a warm window (lit on tier 1 or the middle cabin)
        lit = tier == 1 or i == 1
        px(img, gx + 4, base - 5, EMBER if lit else GLASS)
        px(img, gx + 5, base - 5, EMBER_LT if lit else GLASS)
    if tier == 1:
        banner(img, ox + fw // 2 - 1, roof - 3, 6, FLAG)
        # tidy chimney smoke-glow
        px(img, ox + 9, roof - 6, EMBER)
        px(img, ox + fw - 12, roof - 6, EMBER)


def draw_frost_vault(img, ox, oy, fw, fh, tier):
    """Frost Vault - fortified storehouse. A squat stone strongbox with a heavy
    banded steel door and an ice-sheen; a padlock/seal marks it secure."""
    draw_ground_pad(img, ox, oy, fw, fh)
    top = oy + fh - 30
    rect(img, ox + 8, top, ox + fw - 9, oy + fh - 6, STONE)
    rect(img, ox + 8, top, ox + 8, oy + fh - 6, STONE_LT)
    rect(img, ox + fw - 9, top, ox + fw - 9, oy + fh - 6, STONE_DK)
    rect(img, ox + 8, top, ox + fw - 9, top, SNOW_LT)
    # steel banding
    for y in range(top + 4, oy + fh - 6, 6):
        rect(img, ox + 8, y, ox + fw - 9, y, STEEL_DK)
    # heavy vault door
    cxc = ox + fw // 2
    rect(img, cxc - 6, oy + fh - 22, cxc + 5, oy + fh - 6, STEEL)
    rect(img, cxc - 6, oy + fh - 22, cxc + 5, oy + fh - 22, STEEL_HI)
    rect(img, cxc - 6, oy + fh - 22, cxc - 6, oy + fh - 6, STEEL_DK)
    # round lock boss with an ice glint
    rect(img, cxc - 2, oy + fh - 15, cxc + 1, oy + fh - 12, STEEL_DK)
    px(img, cxc - 1, oy + fh - 14, ICE)
    if tier == 1:
        # reinforced corner studs + a small ember seal above the door
        for (sx, sy) in [(ox + 10, top + 3), (ox + fw - 11, top + 3)]:
            px(img, sx, sy, STEEL_HI)
        px(img, cxc, oy + fh - 24, EMBER)
        px(img, cxc + 1, oy + fh - 24, EMBER_LT)


def draw_forge_hall(img, ox, oy, fw, fh, tier):
    """Forge Hall - steelworks refinery. A stone workshop with a tall smelter
    stack venting ember-glow and a glowing crucible mouth (steel being poured)."""
    draw_house_shell(img, ox, oy, fw, fh, STONE, STONE_DK, SLATE_DK, (30, 34, 42, 255), STONE_LT)
    cxc = ox + fw // 2
    base = oy + fh - 7
    # smelter stack on the right venting glow
    sx = ox + fw - 13
    rect(img, sx, oy + 6, sx + 3, oy + fh // 2, STONE_DK)
    rect(img, sx, oy + 6, sx + 3, oy + 6, SNOW_LT)
    for i, y in enumerate(range(oy + 2, oy + 7)):
        c = EMBER_LT if i % 2 == 0 else EMBER
        rect(img, sx, y, sx + 3, y, c)
    # glowing crucible / pour spout at the base
    rect(img, cxc - 4, base - 5, cxc + 3, base, STEEL_DK)
    rect(img, cxc - 3, base - 4, cxc + 2, base - 1, EMBER)
    px(img, cxc - 1, base - 3, EMBER_CORE)
    px(img, cxc, base - 3, STEEL_HI)  # a bright bead of molten steel
    if tier == 1:
        # a second glow vent + steel ingot stack out front
        rect(img, ox + 7, base - 3, ox + 11, base, STEEL)
        rect(img, ox + 8, base - 5, ox + 10, base - 3, IRON)
        px(img, ox + 9, base - 5, STEEL_HI)
        banner(img, ox + 8, oy + fh // 2 - 8, 7, FLAG)


def draw_envoy_hall(img, ox, oy, fw, fh, tier):
    """Envoy Hall - diplomacy hub. A tall hall with an arched doorway, twin
    ember banners, and a raised pennant to signal other holds."""
    draw_house_shell(img, ox, oy, fw, fh, STONE_LT, STONE, WOOD_DK, (40, 30, 20, 255), STONE_LT)
    cxc = ox + fw // 2
    base = oy + fh - 6
    # arched double doors
    rect(img, cxc - 4, oy + fh - 16, cxc + 3, base, WOOD)
    rect(img, cxc - 4, oy + fh - 17, cxc + 3, oy + fh - 17, WOOD_LT)
    px(img, cxc - 1, oy + fh - 11, EMBER)  # warm light within
    # tall signal pennant from the roof peak
    peak = oy + 6
    rect(img, cxc, peak, cxc, oy + fh // 2, WOOD_DK)
    rect(img, cxc + 1, peak, cxc + 4, peak + 4, FLAG)
    px(img, cxc + 4, peak + 2, EMBER_LT)
    if tier == 1:
        banner(img, ox + 9, oy + fh // 2 - 7, 8, FLAG)
        banner(img, ox + fw - 11, oy + fh // 2 - 7, 8, FLAG)
        # a second, higher pennant (an important embassy)
        rect(img, cxc - 4, peak + 1, cxc - 1, peak + 4, FLAG_ENEMY)


def draw_warming_ward(img, ox, oy, fw, fh, tier):
    """Warming Ward - infirmary. A cabin with a green-cross-free ORIGINAL relief
    mark (an ember-in-a-ring 'mend' sigil) and cots glowing warm within."""
    draw_house_shell(img, ox, oy, fw, fh, STONE_LT, STONE, FOOD_DK, (40, 60, 58, 255), SNOW_LT)
    cxc = ox + fw // 2
    base = oy + fh - 6
    # an ORIGINAL 'mend' sigil: an open ring cradling an ember (NOT a red cross)
    ring_y = oy + fh - 15
    for a in range(0, 360, 40):
        x = int(cxc + 4 * math.cos(math.radians(a)))
        y = int(ring_y + 4 * math.sin(math.radians(a)))
        px(img, x, y, FOOD)
    px(img, cxc, ring_y, EMBER)
    px(img, cxc, ring_y - 1, EMBER_LT)
    # a warm cot window
    rect(img, cxc - 6, base - 5, cxc - 3, base - 2, EMBER_DK)
    px(img, cxc - 5, base - 4, EMBER)
    if tier == 1:
        rect(img, cxc + 3, base - 5, cxc + 6, base - 2, EMBER_DK)
        px(img, cxc + 4, base - 4, EMBER)
        banner(img, ox + fw // 2, oy + fh // 2 - 7, 6, FOOD)


def draw_ember_archive(img, ox, oy, fw, fh, tier):
    """Ember Archive - research academy. A study hall with a tall arched window,
    shelves of scrolls, and a glowing lectern flame (knowledge kept warm)."""
    draw_house_shell(img, ox, oy, fw, fh, STONE, STONE_DK, PARKA_TEAL_DK, (24, 60, 60, 255), STONE_LT)
    cxc = ox + fw // 2
    base = oy + fh - 6
    # tall arched study window
    rect(img, cxc - 3, oy + fh - 18, cxc + 2, base - 2, GLASS)
    rect(img, cxc - 3, oy + fh - 18, cxc - 3, base - 2, STONE_DK)
    rect(img, cxc + 2, oy + fh - 18, cxc + 2, base - 2, STONE_DK)
    px(img, cxc - 1, oy + fh - 14, ICE)
    # scroll shelves flanking
    for gx in (ox + 8, ox + fw - 11):
        for k in range(3):
            rect(img, gx, base - 3 - k * 3, gx + 2, base - 2 - k * 3, WOOD_LT if k % 2 else FOOD)
    # a lectern ember below the window (the archive's light)
    px(img, cxc, base - 1, EMBER)
    if tier == 1:
        # an open book emblem on the gable + a brighter window
        rect(img, cxc - 2, oy + fh // 2 - 6, cxc - 1, oy + fh // 2 - 3, SNOW_LT)
        rect(img, cxc + 1, oy + fh // 2 - 6, cxc + 2, oy + fh // 2 - 3, SNOW_LT)
        px(img, cxc, oy + fh // 2 - 5, EMBER)
        rect(img, cxc - 3, oy + fh - 18, cxc + 2, oy + fh - 17, EMBER)


def draw_yard(img, ox, oy, fw, fh, tier, weapon):
    """Shared drill-yard shell for the three class training buildings. A palisade
    yard with a training dummy + a class weapon on a rack; `weapon` selects the
    silhouette (sword=infantry, spear=lancer, bow=marksman)."""
    draw_house_shell(img, ox, oy, fw, fh, WOOD, WOOD_DK, STONE_DK, SLATE_DK, STONE)
    cxc = ox + fw // 2
    base = oy + fh - 7
    # a straw/hide training dummy on a post
    rect(img, ox + 9, base - 10, ox + 10, base, WOOD_DK)     # post
    rect(img, ox + 7, base - 12, ox + 12, base - 7, FUR)      # body
    px(img, ox + 9, base - 13, FUR_DK)                        # head knot
    # a weapon rack on the right showing the class arm
    rx = ox + fw - 12
    rect(img, rx, base - 12, rx, base, WOOD_DK)
    if weapon == "sword":
        rect(img, rx + 3, base - 12, rx + 4, base - 2, STEEL)   # blade
        rect(img, rx + 2, base - 4, rx + 5, base - 3, FUR)      # hilt
        px(img, rx + 3, base - 13, STEEL_HI)
    elif weapon == "spear":
        rect(img, rx + 3, base - 14, rx + 3, base - 1, WOOD_LT)  # shaft
        rect(img, rx + 2, base - 15, rx + 4, base - 13, STEEL_HI)  # head
        px(img, rx + 4, base - 14, ICE)
    elif weapon == "bow":
        for i in range(6):
            px(img, rx + 3 + (i % 2), base - 13 + i, STEEL)     # bow arc
        rect(img, rx + 3, base - 13, rx + 3, base - 2, WOOD_LT)  # string line
        px(img, rx + 5, base - 8, ICE)                          # nocked bolt
    # a class banner over the gate
    banner(img, cxc, oy + fh // 2 - 8, 7, FLAG)
    if tier == 1:
        banner(img, ox + 8, oy + fh // 2 - 6, 6, FLAG)
        px(img, cxc, base - 1, EMBER)  # a lit brazier in the yard


def draw_infantry_yard(img, ox, oy, fw, fh, tier):
    """Infantry Yard - trains front-line infantry (sword on the rack)."""
    draw_yard(img, ox, oy, fw, fh, tier, "sword")


def draw_lancer_yard(img, ox, oy, fw, fh, tier):
    """Lancer Yard - trains charging lancers (spear on the rack)."""
    draw_yard(img, ox, oy, fw, fh, tier, "spear")


def draw_marksman_range(img, ox, oy, fw, fh, tier):
    """Marksman Range - trains ranged marksmen (bow on the rack + a target)."""
    draw_yard(img, ox, oy, fw, fh, tier, "bow")
    # a round target butt on the left of the yard
    cx = ox + 10
    cy = oy + fh - 12
    px(img, cx, cy, SNOW_LT)
    px(img, cx, cy - 1, EMBER)  # bullseye


BUILDINGS = [
    ("furnace", 64, 64, draw_furnace),
    ("hunters_hut", 48, 48, draw_hunters_hut),
    ("sawmill", 48, 48, draw_sawmill),
    ("coal_pit", 48, 48, draw_coal_pit),
    ("iron_mine", 48, 48, draw_iron_mine),
    ("war_camp", 48, 48, draw_war_camp),
    # FEAT-006: the expanded FEAT-002 city, all original role-based art.
    ("shelter_row", 48, 48, draw_shelter_row),
    ("frost_vault", 48, 48, draw_frost_vault),
    ("forge_hall", 48, 48, draw_forge_hall),
    ("envoy_hall", 48, 48, draw_envoy_hall),
    ("warming_ward", 48, 48, draw_warming_ward),
    ("ember_archive", 48, 48, draw_ember_archive),
    ("infantry_yard", 48, 48, draw_infantry_yard),
    ("lancer_yard", 48, 48, draw_lancer_yard),
    ("marksman_range", 48, 48, draw_marksman_range),
]


def build_buildings():
    for name, fw, fh, drawer in BUILDINGS:
        sheet = new(fw * 2, fh)
        for tier in (0, 1):
            drawer(sheet, tier * fw, 0, fw, fh, tier)
        sheet = outline_alpha(sheet)
        save(sheet, os.path.join(SPR, f"{name}.png"))
        print(f"{name}.png", sheet.size)


# ===========================================================================
# TROOPS: the settlement's cold-weather defenders. 2-frame walk sheets (24x28).
# Small chibi survivors so many fit on the battle lane.
# ===========================================================================

def draw_survivor(img, ox, oy, fw, fh, step, palette):
    """Generic parka-clad survivor. palette: dict with body/weapon colors + kind."""
    cx = ox + fw // 2
    ground = oy + fh - 1
    skin = palette.get("skin", SKIN)
    parka = palette["parka"]
    parka_dk = palette["parka_dk"]
    kind = palette["kind"]
    swing = 1 if step == 1 else -1

    # legs
    rect(img, cx - 3, oy + fh - 8, cx - 1, ground - 1, PANTS)
    rect(img, cx + 1, oy + fh - 8, cx + 3, ground - 1, PANTS)
    rect(img, cx - 4 + swing, ground - 1, cx - 1 + swing, ground, BOOT)
    rect(img, cx + 1 - swing, ground - 1, cx + 4 - swing, ground, BOOT)
    # torso / parka
    rect(img, cx - 4, oy + fh - 16, cx + 3, oy + fh - 8, parka)
    rect(img, cx + 2, oy + fh - 16, cx + 3, oy + fh - 8, parka_dk)
    # fur-trimmed hood collar
    rect(img, cx - 4, oy + fh - 16, cx + 3, oy + fh - 15, FUR_LT)
    # head (hooded)
    rect(img, cx - 3, oy + fh - 22, cx + 2, oy + fh - 16, skin)
    px(img, cx + 1, oy + fh - 19, MOUTH)

    if kind == "trapper":
        # fur hood + a beast-trap / harpoon-spear (anti-beast front line)
        rect(img, cx - 4, oy + fh - 23, cx + 3, oy + fh - 22, FUR)
        px(img, cx - 4, oy + fh - 22, FUR_DK)
        px(img, cx + 3, oy + fh - 22, FUR_DK)
        rect(img, cx + 4, oy + fh - 26, cx + 5, oy + fh - 8, WOOD)   # shaft
        rect(img, cx + 3, oy + fh - 28, cx + 6, oy + fh - 26, STEEL_HI)  # barbed tip
        px(img, cx + 6, oy + fh - 27, ICE)
        rect(img, cx - 6, oy + fh - 14, cx - 4, oy + fh - 8, parka_dk)   # off arm
    elif kind == "marksman":
        # hood + crossbow (ranged)
        rect(img, cx - 3, oy + fh - 24, cx + 2, oy + fh - 22, PARKA_TEAL_DK)
        rect(img, cx + 3, oy + fh - 15, cx + 6, oy + fh - 14, WOOD)  # stock
        rect(img, cx + 5, oy + fh - 18, cx + 5, oy + fh - 11, STEEL)  # bow arms
        px(img, cx + 6, oy + fh - 15, ICE)                          # bolt tip
    elif kind == "vanguard":
        # frost-plate helm + longsword + shield, a tuft of ember plume
        rect(img, cx - 3, oy + fh - 24, cx + 2, oy + fh - 21, PLATE)
        px(img, cx, oy + fh - 25, EMBER)                             # ember plume
        rect(img, cx - 3, oy + fh - 20, cx + 2, oy + fh - 19, PLATE_DK)  # visor
        rect(img, cx + 4, oy + fh - 20, cx + 5, oy + fh - 8, STEEL)   # sword
        px(img, cx + 4, oy + fh - 21, STEEL_HI)
        rect(img, cx - 7, oy + fh - 16, cx - 5, oy + fh - 8, FLAG)    # ember shield
    elif kind == "wolf":
        # (handled by draw_wolf) - fallback body (unused)
        pass


def build_survivor(name, fw, fh, palette):
    sheet = new(fw * 2, fh)
    for step in (0, 1):
        draw_survivor(sheet, step * fw, 0, fw, fh, step, palette)
    sheet = outline_alpha(sheet)
    save(sheet, os.path.join(SPR, f"{name}.png"))
    print(f"{name}.png", sheet.size)


# ===========================================================================
# FROZEN HORDE: the enemies. Original frozen creatures / raiders.
# ===========================================================================

def draw_frost_wolf(img, ox, oy, fw, fh, step):
    """A lean, frost-furred wolf. 24x28 frame, 2-frame trot."""
    ground = oy + fh - 1
    cx = ox + fw // 2
    swing = 1 if step == 1 else -1
    body_top = oy + fh - 15
    # body
    rect(img, cx - 6, body_top, cx + 6, oy + fh - 8, WOLF)
    rect(img, cx - 6, oy + fh - 9, cx + 6, oy + fh - 8, WOLF_DK)
    rect(img, cx - 6, body_top, cx + 6, body_top, WOLF_LT)
    # haunch highlight
    rect(img, cx + 2, body_top + 1, cx + 5, oy + fh - 10, WOLF_LT)
    # legs (trotting)
    rect(img, cx - 5 + swing, oy + fh - 8, cx - 4 + swing, ground, WOLF_DK)
    rect(img, cx + 4 - swing, oy + fh - 8, cx + 5 - swing, ground, WOLF_DK)
    rect(img, cx - 2 - swing, oy + fh - 8, cx - 1 - swing, ground, WOLF)
    rect(img, cx + 1 + swing, oy + fh - 8, cx + 2 + swing, ground, WOLF)
    # head (facing left, toward the hold)
    rect(img, cx - 9, body_top - 3, cx - 5, oy + fh - 9, WOLF)
    rect(img, cx - 9, body_top - 3, cx - 9, oy + fh - 9, WOLF_LT)
    # snout
    rect(img, cx - 11, body_top, cx - 9, body_top + 2, WOLF_DK)
    # ears
    px(img, cx - 8, body_top - 4, WOLF_DK)
    px(img, cx - 6, body_top - 4, WOLF_DK)
    # cold glowing eye
    px(img, cx - 8, body_top - 1, GLOW_RED)
    # frost-tipped tail
    rect(img, cx + 6, body_top - 1, cx + 9, body_top + 1, WOLF)
    px(img, cx + 9, body_top - 1, WOLF_LT)


def draw_ravager(img, ox, oy, fw, fh, step):
    """A hulking ice-hardened raider swinging a jagged club. 32x36 frame."""
    ground = oy + fh - 1
    cx = ox + fw // 2
    swing = 1 if step == 1 else -1
    # legs
    rect(img, cx - 5, oy + fh - 11, cx - 2, ground - 1, PANTS)
    rect(img, cx + 2, oy + fh - 11, cx + 5, ground - 1, PANTS)
    rect(img, cx - 6 + swing, ground - 1, cx - 2 + swing, ground, BOOT)
    rect(img, cx + 2 - swing, ground - 1, cx + 6 - swing, ground, BOOT)
    # broad hide torso
    rect(img, cx - 7, oy + fh - 23, cx + 6, oy + fh - 11, RAVAGER)
    rect(img, cx + 4, oy + fh - 23, cx + 6, oy + fh - 11, RAVAGER_DK)
    rect(img, cx - 7, oy + fh - 23, cx + 6, oy + fh - 22, FUR)  # fur shoulders
    # head + frost mask
    rect(img, cx - 4, oy + fh - 30, cx + 3, oy + fh - 23, SKIN_SH)
    rect(img, cx - 4, oy + fh - 30, cx + 3, oy + fh - 28, STEEL_DK)  # helm/mask
    px(img, cx - 2, oy + fh - 26, GLOW_RED)
    px(img, cx + 1, oy + fh - 26, GLOW_RED)
    # horns of ice
    px(img, cx - 5, oy + fh - 31, TITAN_LT)
    px(img, cx + 4, oy + fh - 31, TITAN_LT)
    # big jagged ice club
    off = 1 if step == 1 else 0
    rect(img, cx + 6, oy + fh - 26 + off, cx + 8, oy + fh - 10 + off, WOOD_DK)  # haft
    rect(img, cx + 5, oy + fh - 30 + off, cx + 10, oy + fh - 25 + off, ICE_DK)  # head
    px(img, cx + 6, oy + fh - 29 + off, TITAN_LT)
    px(img, cx + 9, oy + fh - 27 + off, TITAN_LT)


def draw_frost_titan(img, ox, oy, fw, fh, step):
    """A massive, low, four-limbed ice titan crawling toward the hold. 40x32."""
    ground = oy + fh - 1
    cx = ox + fw // 2
    swing = 1 if step == 1 else -1
    body_top = oy + fh - 20
    # bulky ice body
    rect(img, cx - 12, body_top, cx + 12, oy + fh - 8, TITAN)
    rect(img, cx - 12, oy + fh - 9, cx + 12, oy + fh - 8, TITAN_DK)
    rect(img, cx - 12, body_top, cx + 12, body_top, TITAN_LT)
    # cracked-ice highlights
    for (dx, dy) in [(-6, 4), (2, 6), (7, 3), (-2, 9)]:
        px(img, cx + dx, body_top + dy, TITAN_LT)
    # frost spikes on the back
    for sx in range(cx - 9, cx + 10, 5):
        rect(img, sx, body_top - 3, sx + 1, body_top, TITAN_LT)
    # four stubby legs
    rect(img, cx - 10 + swing, oy + fh - 8, cx - 7 + swing, ground, TITAN_DK)
    rect(img, cx + 7 - swing, oy + fh - 8, cx + 10 - swing, ground, TITAN_DK)
    rect(img, cx - 3 - swing, oy + fh - 8, cx, ground, TITAN)
    rect(img, cx + 1 + swing, oy + fh - 8, cx + 4 + swing, ground, TITAN)
    # head lowered at the front (left)
    rect(img, cx - 17, body_top + 2, cx - 12, oy + fh - 9, TITAN)
    rect(img, cx - 17, body_top + 2, cx - 17, oy + fh - 9, TITAN_LT)
    # glowing eyes
    px(img, cx - 15, body_top + 5, GLOW_RED)
    px(img, cx - 13, body_top + 5, GLOW_RED)
    # jaw of ice teeth
    for tx in range(cx - 17, cx - 12, 2):
        px(img, tx, oy + fh - 9, TITAN_LT)


def draw_rime_alpha(img, ox, oy, fw, fh, step):
    """Rimefang Alpha - a hulking pack-alpha wolf, bigger and frostier than a
    common frost wolf, with a spined ruff and twin glowing eyes. 40x36 frame."""
    ground = oy + fh - 1
    cx = ox + fw // 2
    swing = 1 if step == 1 else -1
    body_top = oy + fh - 20
    # heavy body
    rect(img, cx - 10, body_top, cx + 10, oy + fh - 10, WOLF)
    rect(img, cx - 10, oy + fh - 11, cx + 10, oy + fh - 10, WOLF_DK)
    rect(img, cx - 10, body_top, cx + 10, body_top, WOLF_LT)
    rect(img, cx + 3, body_top + 1, cx + 8, oy + fh - 12, WOLF_LT)  # haunch
    # frost spines along the ruff/back
    for sx in range(cx - 9, cx + 8, 4):
        rect(img, sx, body_top - 3, sx + 1, body_top, TITAN_LT)
    # four heavy legs
    rect(img, cx - 9 + swing, oy + fh - 10, cx - 6 + swing, ground, WOLF_DK)
    rect(img, cx + 6 - swing, oy + fh - 10, cx + 9 - swing, ground, WOLF_DK)
    rect(img, cx - 3 - swing, oy + fh - 10, cx - 1, ground, WOLF)
    rect(img, cx + 1 + swing, oy + fh - 10, cx + 3 + swing, ground, WOLF)
    # big head lowered at the left
    rect(img, cx - 15, body_top - 2, cx - 9, oy + fh - 11, WOLF)
    rect(img, cx - 15, body_top - 2, cx - 15, oy + fh - 11, WOLF_LT)
    rect(img, cx - 18, body_top + 1, cx - 15, body_top + 4, WOLF_DK)  # snout
    # ears
    px(img, cx - 13, body_top - 3, WOLF_DK)
    px(img, cx - 10, body_top - 3, WOLF_DK)
    # twin cold-fire eyes + bared fang
    px(img, cx - 13, body_top + 1, GLOW_RED)
    px(img, cx - 11, body_top + 1, GLOW_RED)
    px(img, cx - 17, body_top + 4, SNOW_LT)  # frost fang
    # frost-tipped tail
    rect(img, cx + 10, body_top - 2, cx + 14, body_top + 1, WOLF)
    px(img, cx + 14, body_top - 2, TITAN_LT)


def draw_glacier_behemoth(img, ox, oy, fw, fh, step):
    """Glacier Behemoth - a mountainous four-limbed ice colossus, far larger and
    craggier than a frost titan, crowned with a jagged glacier ridge. 56x44."""
    ground = oy + fh - 1
    cx = ox + fw // 2
    swing = 1 if step == 1 else -1
    body_top = oy + fh - 28
    # massive ice torso
    rect(img, cx - 18, body_top, cx + 18, oy + fh - 10, TITAN)
    rect(img, cx - 18, oy + fh - 11, cx + 18, oy + fh - 10, TITAN_DK)
    rect(img, cx - 18, body_top, cx + 18, body_top, TITAN_LT)
    # a glacier ridge/crown of tall ice shards
    for i, sx in enumerate(range(cx - 15, cx + 16, 5)):
        h = 6 if i % 2 == 0 else 4
        rect(img, sx, body_top - h, sx + 1, body_top, TITAN_LT)
        px(img, sx, body_top - h, SNOW_LT)
    # cracked-ice highlights across the body
    for (dx, dy) in [(-10, 6), (-2, 10), (6, 4), (12, 8), (0, 16), (-6, 14)]:
        px(img, cx + dx, body_top + dy, TITAN_LT)
    # four massive legs
    rect(img, cx - 16 + swing, oy + fh - 10, cx - 11 + swing, ground, TITAN_DK)
    rect(img, cx + 11 - swing, oy + fh - 10, cx + 16 - swing, ground, TITAN_DK)
    rect(img, cx - 5 - swing, oy + fh - 10, cx - 1, ground, TITAN)
    rect(img, cx + 1 + swing, oy + fh - 10, cx + 5 + swing, ground, TITAN)
    # low head at the front-left
    rect(img, cx - 24, body_top + 4, cx - 18, oy + fh - 11, TITAN)
    rect(img, cx - 24, body_top + 4, cx - 24, oy + fh - 11, TITAN_LT)
    # three cold eyes glaring
    px(img, cx - 22, body_top + 7, GLOW_RED)
    px(img, cx - 20, body_top + 7, GLOW_RED)
    px(img, cx - 21, body_top + 9, GLOW_RED)
    # a slab jaw of ice teeth
    for tx in range(cx - 24, cx - 17, 2):
        px(img, tx, oy + fh - 11, TITAN_LT)


def draw_hoarfrost_wyrm(img, ox, oy, fw, fh, step):
    """Hoarfrost Wyrm - a long serpentine ice-drake with a horned head, coiled
    body segments, and tattered frost wings. The apex boss. 56x44 frame."""
    ground = oy + fh - 1
    cx = ox + fw // 2
    swing = 1 if step == 1 else -1
    mid = oy + fh - 22
    # sinuous body: a chain of segments rising left-to-right
    seg = [(-22, 8), (-15, 4), (-7, 2), (1, 3), (9, 6), (16, 9)]
    for (dx, dy) in seg:
        x = cx + dx
        y = mid + dy
        rect(img, x - 3, y - 3, x + 3, y + 3, RAVAGER)
        rect(img, x - 3, y - 3, x + 3, y - 3, TITAN_LT)  # frost sheen on top
        px(img, x, y, RAVAGER_DK)
    # tattered frost wing rising from the mid-back
    wx, wy = cx - 2, mid - 2
    for i in range(8):
        rect(img, wx + i, wy - i, wx + i + 1, wy - i + 3, ICE if i % 2 == 0 else ICE_DK)
    px(img, wx + 7, wy - 7, SNOW_LT)
    # horned head at the far left, low and lunging
    hx = cx - 22
    rect(img, hx - 6, mid + 4, hx, mid + 11, RAVAGER)
    rect(img, hx - 6, mid + 4, hx - 6, mid + 11, TITAN_LT)
    # two swept ice horns
    px(img, hx - 5, mid + 2, TITAN_LT)
    px(img, hx - 4, mid + 1, SNOW_LT)
    px(img, hx - 2, mid + 2, TITAN_LT)
    # a cold-glowing eye + a breath of frost
    px(img, hx - 4, mid + 6, GLOW_RED)
    swing_off = 1 if step == 1 else 0
    for i in range(3):
        px(img, hx - 7 - i, mid + 8 + swing_off, ICE)
    # a whip-tail curling off the right
    tx = cx + 19
    rect(img, tx, mid + 9, tx + 4, mid + 10, RAVAGER_DK)
    px(img, tx + 4, mid + 8, TITAN_LT)
    # legs are vestigial: two small claws grounding the body
    rect(img, cx - 6 + swing, oy + fh - 10, cx - 4 + swing, ground, RAVAGER_DK)
    rect(img, cx + 6 - swing, oy + fh - 10, cx + 8 - swing, ground, RAVAGER_DK)


def build_enemy(name, fw, fh, drawer):
    sheet = new(fw * 2, fh)
    for step in (0, 1):
        drawer(sheet, step * fw, 0, fw, fh, step)
    sheet = outline_alpha(sheet)
    save(sheet, os.path.join(SPR, f"{name}.png"))
    print(f"{name}.png", sheet.size)


# ===========================================================================
# HERO PORTRAITS: a 32x32 framed bust per roster hero, packed into one sheet in
# HERO_IDS order (see src/types HERO_IDS). Each portrait is class-flavoured
# (infantry helm / lancer hood + spear / marksman hood + arrow) with a rarity
# accent ring, all original. The engine picks a frame by the hero's index.
# ===========================================================================

# Rarity accent colours (frame ring). Common->steel, Rare->ice, Epic->ember,
# Legendary->bright ember-gold, matching the frozen palette.
RARITY_ACCENT = {
    "common": STONE_LT,
    "rare": ICE,
    "epic": EMBER,
    "legendary": EMBER_LT,
}

# Per-class armour palette for the portrait bust.
CLASS_ARMOR = {
    "infantry": (PLATE, PLATE_DK),
    "lancer": (PARKA_BLUE, PARKA_BLUE_DK),
    "marksman": (PARKA_TEAL, PARKA_TEAL_DK),
}

# The roster in HERO_IDS order with (class, rarity). Mirrors HeroConfig; kept
# here so the generator stays standalone (no TS import). Original heroes only.
HERO_PORTRAITS = [
    ("ember_warden", "infantry", "common"),
    ("snow_picket", "marksman", "common"),
    ("drift_runner", "lancer", "common"),
    ("iron_bulwark", "infantry", "rare"),
    ("glacier_lance", "lancer", "rare"),
    ("frost_archer", "marksman", "rare"),
    ("aurora_sentinel", "infantry", "epic"),
    ("stormpike_rider", "lancer", "epic"),
    ("winters_eye", "marksman", "epic"),
    ("the_kindled_queen", "infantry", "legendary"),
    ("wyrmspear_valdis", "lancer", "legendary"),
    ("the_pale_marksman", "marksman", "legendary"),
]


def draw_hero_portrait(img, ox, oy, size, hero_class, rarity):
    """One 32x32 hero bust: a rarity-ringed panel, a class-tinted shoulders +
    hooded/helmed head, and a small class emblem. Deterministic + original."""
    accent = RARITY_ACCENT[rarity]
    armor, armor_dk = CLASS_ARMOR[hero_class]
    x0, y0, x1, y1 = ox, oy, ox + size - 1, oy + size - 1
    cx = ox + size // 2

    # cold panel background with a subtle vertical gradient
    for y in range(y0, y1 + 1):
        t = (y - y0) / max(1, size - 1)
        rect(img, x0, y, x1, y, lerp((26, 34, 48, 255), (18, 24, 34, 255), t))
    # rarity accent frame (2px)
    rect(img, x0, y0, x1, y0 + 1, accent)
    rect(img, x0, y1 - 1, x1, y1, accent)
    rect(img, x0, y0, x0 + 1, y1, accent)
    rect(img, x1 - 1, y0, x1, y1, accent)

    # shoulders / bust
    rect(img, ox + 7, oy + size - 9, ox + size - 8, oy + size - 3, armor)
    rect(img, ox + 7, oy + size - 9, ox + 8, oy + size - 3, armor_dk)
    rect(img, ox + size - 9, oy + size - 9, ox + size - 8, oy + size - 3, armor_dk)
    rect(img, ox + 7, oy + size - 9, ox + size - 8, oy + size - 9, FUR_LT)  # fur collar

    # head (cold-flushed skin)
    rect(img, cx - 3, oy + 10, cx + 2, oy + size - 9, SKIN)
    px(img, cx + 1, oy + size - 12, MOUTH)
    # eyes catch the accent
    px(img, cx - 2, oy + 14, accent)
    px(img, cx + 1, oy + 14, accent)

    if hero_class == "infantry":
        # frost-plate helm with a visor slit + ember plume
        rect(img, cx - 4, oy + 8, cx + 3, oy + 12, PLATE)
        rect(img, cx - 4, oy + 8, cx + 3, oy + 8, STEEL_HI)
        rect(img, cx - 3, oy + 13, cx + 2, oy + 13, PLATE_DK)  # visor
        rect(img, cx - 1, oy + 5, cx, oy + 8, EMBER)           # plume
    elif hero_class == "lancer":
        # fur hood + a spear tip crossing the corner
        rect(img, cx - 4, oy + 8, cx + 3, oy + 10, FUR)
        px(img, cx - 4, oy + 10, FUR_DK)
        px(img, cx + 3, oy + 10, FUR_DK)
        rect(img, ox + size - 8, oy + 5, ox + size - 7, oy + 16, WOOD_LT)  # shaft
        rect(img, ox + size - 9, oy + 4, ox + size - 6, oy + 6, STEEL_HI)  # head
    elif hero_class == "marksman":
        # hood + a fletched arrow across the corner
        rect(img, cx - 4, oy + 8, cx + 3, oy + 10, PARKA_TEAL_DK)
        px(img, cx - 4, oy + 10, armor_dk)
        px(img, cx + 3, oy + 10, armor_dk)
        for i in range(5):
            px(img, ox + size - 6 - i, oy + 6 + i, WOOD_LT)  # shaft
        px(img, ox + size - 6, oy + 6, STEEL_HI)             # tip
        px(img, ox + size - 11, oy + 11, FOOD)               # fletch


def build_hero_portraits():
    size = 32
    sheet = new(size * len(HERO_PORTRAITS), size)
    for i, (_id, hero_class, rarity) in enumerate(HERO_PORTRAITS):
        draw_hero_portrait(sheet, i * size, 0, size, hero_class, rarity)
    save(sheet, os.path.join(SPR, "hero_portraits.png"))
    print("hero_portraits.png", sheet.size, f"({len(HERO_PORTRAITS)} frames)")


def build_all_characters():
    build_survivor("troop_trapper", 24, 28, dict(kind="trapper", parka=PARKA_BLUE, parka_dk=PARKA_BLUE_DK))
    build_survivor("troop_marksman", 24, 28, dict(kind="marksman", parka=PARKA_TEAL, parka_dk=PARKA_TEAL_DK))
    build_survivor("troop_vanguard", 24, 28, dict(kind="vanguard", parka=PLATE_DK, parka_dk=(74, 86, 100, 255)))
    build_enemy("enemy_frost_wolf", 24, 28, draw_frost_wolf)
    build_enemy("enemy_ravager", 32, 36, draw_ravager)
    build_enemy("enemy_frost_titan", 40, 32, draw_frost_titan)
    # FEAT-006: world-boss / Frostbeast art (FEAT-005 kinds). Larger frames.
    build_enemy("enemy_rime_alpha", 40, 36, draw_rime_alpha)
    build_enemy("enemy_glacier_behemoth", 56, 44, draw_glacier_behemoth)
    build_enemy("enemy_hoarfrost_wyrm", 56, 44, draw_hoarfrost_wyrm)
    build_hero_portraits()


# ===========================================================================
# BACKGROUNDS: 480x270 layers (aurora/blizzard sky, snowfield town, frozen
# battlefield with the hold's wall).
# ===========================================================================
def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(len(a)))


def blend(img, x, y, c):
    """Alpha-composite a single pixel instead of overwriting it.

    `px` replaces the pixel outright, which is right for solid pixel art but
    wrong for the translucent passes below (aurora, glows, snow haze) where the
    whole point is to tint what is already there.
    """
    w, h = img.size
    if not (0 <= x < w and 0 <= y < h):
        return
    a = c[3] / 255.0
    if a <= 0:
        return
    dr, dg, db, da = img.getpixel((x, y))
    img.putpixel((x, y), (
        int(dr + (c[0] - dr) * a),
        int(dg + (c[1] - dg) * a),
        int(db + (c[2] - db) * a),
        max(da, c[3]),
    ))


def vgrad(img, y0, y1, top, bot):
    """Vertical gradient band, inclusive of both rows."""
    w = img.size[0]
    span = max(1, y1 - y0)
    for y in range(y0, y1 + 1):
        rect(img, 0, y, w - 1, y, lerp(top, bot, (y - y0) / span))


def wrapped_sin(x, w, cycles, phase=0.0):
    """A sine that completes a whole number of cycles across the width.

    Backgrounds are drawn at the canvas size and may still be tiled or scrolled
    horizontally, so every horizontal wave has to close on itself: an arbitrary
    period leaves a hard seam at the wrap point (the old 480px sky tiled twice
    across the 960px canvas and showed exactly that).
    """
    return math.sin((x / w) * cycles * 2 * math.pi + phase)


def starfield(img, horizon, seed=7):
    """Cold stars, denser and brighter high in the sky."""
    rnd = random.Random(seed)
    w = img.size[0]
    for _ in range(260):
        x = rnd.randrange(w)
        y = int(rnd.random() ** 1.7 * horizon)
        depth = 1.0 - y / max(1, horizon)
        roll = rnd.random()
        if roll > 0.94:
            blend(img, x, y, (*SNOW_LT[:3], int(230 * depth)))
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                blend(img, x + dx, y + dy, (*SNOW_LT[:3], int(70 * depth)))
        elif roll > 0.7:
            blend(img, x, y, (*SNOW_LT[:3], int(170 * depth)))
        else:
            blend(img, x, y, (*ICE[:3], int(90 * depth)))


def aurora(img, horizon, seed=3):
    """Layered aurora ribbons.

    Each ribbon is a wrapped sine spine with a soft vertical falloff, so the
    band fades out top and bottom instead of ending on a hard edge, and several
    ribbons at different frequencies overlap into something that reads as
    curtains rather than as stripes.
    """
    w = img.size[0]
    ribbons = [
        # (centre y, amplitude, thickness, cycles, phase, colour, peak alpha)
        (0.30, 26, 34, 1.5, 0.0, (104, 214, 192), 86),
        (0.40, 34, 46, 1.0, 1.3, (132, 224, 158), 66),
        (0.24, 18, 26, 2.5, 2.4, (150, 176, 240), 58),
        (0.50, 22, 30, 2.0, 4.1, (96, 186, 214), 44),
    ]
    for cy, amp, thick, cycles, phase, col, peak in ribbons:
        base = horizon * cy
        for x in range(w):
            spine = base + amp * wrapped_sin(x, w, cycles, phase)
            # A second, slower wave makes the curtain breathe in brightness.
            gain = 0.55 + 0.45 * (0.5 + 0.5 * wrapped_sin(x, w, 1, phase * 1.7))
            for dy in range(-thick, thick + 1):
                fall = 1.0 - abs(dy) / thick
                a = int(peak * fall * fall * gain)
                if a > 1:
                    blend(img, x, int(spine + dy), (*col, a))


def ridge(img, base_y, height, cycles, phase, colour, cap=None, seed=1):
    """One parallax mountain ridge, filled down to the bottom of the frame."""
    w, h = img.size
    rnd = random.Random(seed)
    jitter = [rnd.randint(-2, 2) for _ in range(w)]
    for x in range(w):
        peak = base_y - int(
            height * (0.55 + 0.45 * wrapped_sin(x, w, cycles, phase))
        ) + jitter[x]
        rect(img, x, peak, x, h - 1, colour)
        if cap is not None:
            # Snow only settles on the upper slopes, and thicker near a summit.
            depth = 3 + int(5 * max(0.0, wrapped_sin(x, w, cycles, phase)))
            rect(img, x, peak, x, peak + depth, cap)


def snowfall(img, count=170, seed=11):
    """Drifting flakes at three depths, so the air has volume."""
    rnd = random.Random(seed)
    w, h = img.size
    for _ in range(count):
        x, y = rnd.randrange(w), rnd.randrange(h)
        roll = rnd.random()
        if roll > 0.9:
            for dx in (0, 1):
                for dy in (0, 1):
                    blend(img, x + dx, y + dy, (*SNOW_LT[:3], 210))
        elif roll > 0.55:
            blend(img, x, y, (*SNOW_LT[:3], 150))
        else:
            blend(img, x, y, (*SNOW_LT[:3], 80))


def snowfield(img, horizon, seed=5):
    """Wind-sculpted snow ground: banded tone, drifts, and sastrugi ripples."""
    w, h = img.size
    vgrad(img, horizon, h - 1, SNOW, SNOW_DK)
    rnd = random.Random(seed)
    # Wind drifts. Drawn as SEGMENTS with a soft rim, never as a stroke spanning
    # the frame: a full-width line reads as a drawn rule across the snow rather
    # than as a bank of it.
    for i in range(14):
        cy = horizon + int((h - horizon) * (i + 0.6) / 14)
        amp = rnd.randint(2, 7)
        cycles = rnd.choice([2, 3, 4])
        phase = rnd.random() * 6.28
        x = rnd.randrange(w)
        remaining = rnd.randint(2, 4)
        while remaining > 0:
            run = rnd.randint(70, 190)
            near = (cy - horizon) / max(1, h - horizon)
            thick = 1 + int(3 * near)
            for k in range(run):
                xx = (x + k) % w
                # Taper the ends so a drift fades in and out of the surface.
                edge = min(k, run - k) / max(1.0, run * 0.35)
                fade = min(1.0, edge)
                y = cy + int(amp * wrapped_sin(xx, w, cycles, phase))
                # blend(), not rect(): rect OVERWRITES the pixel with the given
                # RGBA, so a "translucent" highlight became a semi-transparent
                # hole in the snow and read as a hard white rule.
                for dy in range(thick + 1):
                    blend(img, xx, y + dy, (*SNOW_LT[:3], int(46 * fade)))
                blend(img, xx, y + thick + 1, (*SNOW_DK[:3], int(52 * fade)))
            x = (x + run + rnd.randint(60, 200)) % w
            remaining -= 1
    # Fine sastrugi flecks catching the light, denser in the foreground.
    for _ in range(900):
        x = rnd.randrange(w)
        y = rnd.randint(horizon, h - 1)
        near = (y - horizon) / max(1, h - horizon)
        if rnd.random() > near * 0.85 + 0.15:
            continue
        blend(img, x, y, (*SNOW_LT[:3], rnd.randint(30, 95)))


def build_backgrounds():
    # Drawn at the CANVAS size (GameConfig CANVAS 960x540), not half of it.
    # The old 480x270 sheets were stretched or tiled to fill the canvas: the sky
    # tiled exactly twice and left a visible seam down the middle of the frame.
    W, H = 960, 540

    # ---------------------------------------------------------------- sky ----
    sky = new(W, H)
    horizon = int(H * 0.62)
    vgrad(sky, 0, horizon, (16, 22, 38, 255), (58, 74, 108, 255))
    vgrad(sky, horizon + 1, H - 1, (58, 74, 108, 255), (86, 104, 138, 255))
    starfield(sky, horizon)
    aurora(sky, horizon)
    # Far range: low contrast, hazed into the sky.
    ridge(sky, horizon + 6, 58, 1.0, 0.4, (48, 62, 92, 255), seed=2)
    ridge(sky, horizon + 16, 40, 2.0, 2.2, (40, 53, 80, 255), cap=(62, 78, 108, 255), seed=4)
    snowfall(sky, 150)
    save(sky, os.path.join(BG, "sky.png"))

    # --------------------------------------------------------------- town ----
    # The settlement backdrop. Build plots are NOT drawn here: the engine places
    # real building sprites at its own coordinates, and the old blind 3x6 grid of
    # flat slate rectangles showed through underneath them as stray grey boxes.
    town = new(W, H)
    horizon = int(H * 0.46)
    vgrad(town, 0, horizon, (20, 28, 46, 255), (74, 92, 126, 255))
    starfield(town, horizon, seed=9)
    aurora(town, horizon, seed=6)
    ridge(town, horizon + 4, 66, 1.0, 1.1, (44, 58, 86, 255), seed=8)
    ridge(town, horizon + 12, 44, 2.0, 3.4, (56, 72, 100, 255), cap=(96, 116, 146, 255), seed=3)

    # A distant frozen settlement on the skyline: roofs, chimneys, lit windows.
    rnd = random.Random(21)
    x = -10
    while x < W:
        bw = rnd.randint(22, 46)
        bh = rnd.randint(16, 40)
        top = horizon - bh
        rect(town, x, top, x + bw, horizon, (38, 46, 66, 255))
        rect(town, x, top, x + bw, top + 2, (58, 70, 94, 255))       # snow-lit ridge
        # Pitched gable: one filled column per x, height falling away from the
        # ridge line. (Drawing a horizontal bar per step instead produced a
        # stepped brim that read as a hat, not a roof.)
        pitch = rnd.uniform(0.45, 0.7)
        half = bw / 2.0
        for i in range(bw + 1):
            rise = int((half - abs(i - half)) * pitch)
            if rise > 0:
                rect(town, x + i, top - rise, x + i, top, (30, 38, 56, 255))
        rect(town, x, top - 1, x + bw, top, (52, 64, 88, 255))  # snow-lit eaves
        # warm windows, sparse
        for _ in range(rnd.randint(0, 3)):
            wx = x + rnd.randint(3, max(4, bw - 6))
            wy = rnd.randint(top + 5, horizon - 4)
            for dx in (0, 1):
                for dy in (0, 1):
                    blend(town, wx + dx, wy + dy, (*EMBER_LT[:3], 190))
        # chimney + a thin smoke column drifting with the wind
        if rnd.random() > 0.45:
            cx0 = x + rnd.randint(4, max(5, bw - 6))
            rect(town, cx0, top - 8, cx0 + 2, top, (32, 40, 58, 255))
            for k in range(rnd.randint(8, 22)):
                blend(town, cx0 + 1 + k // 3, top - 9 - k, (210, 220, 235, max(8, 60 - k * 3)))
        x += bw + rnd.randint(4, 14)

    for x in range(W):
        bank = int(4 + 5 * (0.5 + 0.5 * wrapped_sin(x, W, 3, 1.9)))
        rect(town, x, horizon - bank, x, horizon, (*SNOW_DK[:3], 255))
    snowfield(town, horizon)
    for x in range(W):
        bank = int(4 + 5 * (0.5 + 0.5 * wrapped_sin(x, W, 3, 1.9)))
        for dy in range(bank):
            blend(town, x, horizon - bank + dy, (*SNOW_LT[:3], 90 - dy * 8))
    # A trodden path running from the foreground up to the settlement gate.
    # Drawn per SCANLINE with a perspective width so it narrows into the
    # distance; the earlier version swept a fixed-width ribbon horizontally
    # across the frame, which read as a wire lying on the snow.
    gate_x = W * 0.54
    for y in range(horizon + 2, H):
        t = (y - horizon) / (H - horizon)
        cx = gate_x + (W * 0.055) * math.sin(t * 1.15) * t
        half = 2 + int(46 * t * t)
        for dx in range(-half, half + 1):
            edge = 1.0 - abs(dx) / max(1, half)
            blend(town, int(cx + dx), y, (*SLATE[:3], int(120 * (0.35 + 0.65 * edge))))
        blend(town, int(cx - half), y, (*SNOW_LT[:3], 110))
        blend(town, int(cx + half), y, (*SNOW_LT[:3], 110))
    snowfall(town, 120)
    save(town, os.path.join(BG, "town.png"))

    # ----------------------------------------------------------- battle -----
    battle = new(W, H)
    horizon = int(H * 0.52)
    vgrad(battle, 0, horizon, (22, 30, 48, 255), (72, 92, 126, 255))
    starfield(battle, horizon, seed=13)
    aurora(battle, horizon, seed=17)
    ridge(battle, horizon + 8, 50, 1.0, 2.7, (46, 60, 88, 255), seed=6)
    snowfield(battle, horizon, seed=23)
    # Trampled ground: churned snow and exposed ice where the lines have met.
    rnd = random.Random(31)
    for _ in range(70):
        sx = rnd.randrange(W)
        sy = rnd.randint(horizon + 10, H - 1)
        sw = rnd.randint(10, 46)
        th = rnd.randint(1, 3)
        for k in range(sw):
            for dy in range(th + 1):
                blend(battle, sx + k, sy + dy, (*ICE_DK[:3], 120))

    # The hold's wall stands fully inside the frame with its own shadowed right
    # face, so it reads as a structure in the scene rather than a sprite sliced
    # off at the canvas edge.
    wx, wex = W - 168, W - 18
    wtop = horizon - 118
    rect(battle, wx, wtop, wex, H - 1, STONE)
    for y in range(wtop, H, 26):
        rect(battle, wx, y, wex, y, STONE_DK)
    for bx in range(wx, wex, 42):
        rect(battle, bx, wtop, bx, H - 1, STONE_DK)
    rect(battle, wx, wtop, wx + 1, H - 1, STONE_LT)
    rect(battle, wex - 1, wtop, wex, H - 1, STONE_DK)
    for bx in range(wx, wex - 18, 42):
        rect(battle, bx, wtop - 9, bx + 20, wtop, STONE)
        rect(battle, bx, wtop - 9, bx + 20, wtop - 6, SNOW_LT)
    for bx in range(wx, wex, 11):
        rect(battle, bx, wtop + 1, bx, wtop + rnd.randint(2, 6), ICE)
    # Timber gate, centred, glowing warm from inside the hold.
    gcx = (wx + wex) // 2
    rect(battle, gcx - 24, horizon - 14, gcx + 24, H - 1, WOOD_DK)
    rect(battle, gcx - 24, horizon - 14, gcx + 24, horizon - 9, WOOD)
    for r in range(26, 0, -1):
        a = int(70 * (1 - r / 26))
        for dx in range(-r, r + 1):
            for dy in range(-r, r + 1):
                if dx * dx + dy * dy <= r * r:
                    blend(battle, gcx + dx, horizon + 22 + dy, (*EMBER[:3], a))
    rect(battle, gcx - 7, horizon + 8, gcx + 7, horizon + 34, EMBER_DK)
    rect(battle, gcx - 3, horizon + 14, gcx + 3, horizon + 30, EMBER)
    snowfall(battle, 130)
    save(battle, os.path.join(BG, "battle.png"))
    for name in ("sky.png", "town.png", "battle.png"):
        path = os.path.join(BG, name)
        img = Image.open(path).convert("RGBA")
        if min(img.getchannel("A").getextrema()) != 255:
            raise SystemExit(f"{name} has translucent pixels; backgrounds must be opaque")
    print("backgrounds: sky.png town.png battle.png", (W, H))


# ===========================================================================
# FX: ember/frost spark burst + snow puff. 4-frame anims (16x16).
# ===========================================================================
def build_fx():
    fw, frames = 16, 4

    # spark: an ember/frost burst (used for resource gain + hits). Warm ember
    # core that cools to icy blue as it disperses.
    sheet = new(fw * frames, fw)
    for f in range(frames):
        ox = f * fw
        cx, cy = ox + 8, 8
        r = 1 + f * 2
        for a in range(0, 360, 30):
            x = int(cx + r * math.cos(math.radians(a)))
            y = int(cy + r * math.sin(math.radians(a)))
            c = EMBER_LT if f == 0 else (EMBER if f == 1 else ICE)
            px(sheet, x, y, c)
            px(sheet, x, y + 1, EMBER_DK if f < 2 else ICE_DK)
        if f == 0:
            px(sheet, cx, cy, EMBER_CORE)
    save(sheet, os.path.join(FX, "spark.png"))
    print("fx/spark.png", sheet.size)

    # dust: a soft snow puff kicked up by movement / impacts
    sheet = new(fw * frames, fw)
    for f in range(frames):
        ox = f * fw
        cx, cy = ox + 8, 11
        r = 2 + f * 2
        alpha = max(60, 210 - f * 45)
        for a in range(0, 360, 24):
            x = int(cx + r * math.cos(math.radians(a)))
            y = int(cy + (r // 2) * math.sin(math.radians(a)))
            px(sheet, x, y, (230, 242, 251, alpha))
        px(sheet, cx, cy, (200, 220, 236, alpha))
    save(sheet, os.path.join(FX, "dust.png"))
    print("fx/dust.png", sheet.size)


# ===========================================================================
# UI KIT: 9-slice panel, button, bar frame, HUD icon set, resource icon sheet.
# Icy steel-and-frost styling warmed by ember accents.
# ===========================================================================
def build_ui():
    # panel 9-slice: 24x24 dark frost-steel panel with an icy highlight edge
    p = new(24, 24)
    fill = (24, 32, 46, 240)          # PANEL
    rect(p, 0, 0, 23, 23, fill)
    rect(p, 0, 0, 23, 1, ICE)         # top highlight
    rect(p, 0, 0, 1, 23, ICE)         # left highlight
    rect(p, 0, 22, 23, 23, STONE_DK)  # bottom shadow
    rect(p, 22, 0, 23, 23, STONE_DK)  # right shadow
    save(p, os.path.join(UI, "panel.png"))

    # button 9-slice: 24x16 steel button with a frost top and ember-ready base
    b = new(24, 16)
    rect(b, 0, 0, 23, 15, STONE)
    rect(b, 0, 0, 23, 0, STONE_LT)
    rect(b, 0, 15, 23, 15, STONE_DK)
    rect(b, 0, 0, 0, 15, STONE_LT)
    rect(b, 23, 0, 23, 15, STONE_DK)
    save(b, os.path.join(UI, "button.png"))

    # bar frame: 64x10 (empty), engine draws the fill
    bar = new(64, 10)
    rect(bar, 0, 0, 63, 9, (18, 24, 34, 255))
    rect(bar, 0, 0, 63, 0, ICE)
    rect(bar, 0, 9, 63, 9, (10, 14, 20, 255))
    save(bar, os.path.join(UI, "bar_frame.png"))

    # HUD icon set: 16x16 x 4 (furnace/ember, hourglass, sword, shield)
    ts = 16
    icons = new(ts * 4, ts)
    # furnace / ember flame (the warmth indicator)
    rect(icons, 5, 10, 10, 13, STONE)
    rect(icons, 6, 5, 9, 11, EMBER)
    rect(icons, 7, 3, 8, 8, EMBER_LT)
    px(icons, 7, 9, EMBER_CORE)
    px(icons, 8, 7, EMBER_CORE)
    # hourglass (timer)
    ox = ts
    rect(icons, ox + 4, 3, ox + 11, 4, STEEL)
    rect(icons, ox + 4, 12, ox + 11, 13, STEEL)
    for i in range(4):
        px(icons, ox + 5 + i, 5 + i, ICE)
        px(icons, ox + 5 + i, 11 - i, ICE)
    # sword
    ox = 2 * ts
    for i in range(9):
        px(icons, ox + 3 + i, 12 - i, STEEL)
        px(icons, ox + 4 + i, 12 - i, STEEL_HI)
    rect(icons, ox + 2, 12, ox + 4, 13, FUR)
    # shield with an ember mark
    ox = 3 * ts
    rect(icons, ox + 4, 3, ox + 11, 10, STEEL_DK)
    rect(icons, ox + 5, 10, ox + 10, 12, STEEL_DK)
    px(icons, ox + 7, 13, STEEL_DK)
    rect(icons, ox + 4, 3, ox + 11, 3, STEEL_HI)
    px(icons, ox + 7, 7, EMBER)
    save(icons, os.path.join(UI, "icons.png"))

    # resource icon sheet: 16x16 x 6, frame order food, wood, COAL, IRON, STEEL,
    # SPARK (must match RESOURCE_ICON_FRAME food:0 wood:1 coal:2 iron:3 steel:4
    # and the Ember Sparks premium icon at frame 5).
    res = new(ts * 6, ts)
    # food (preserved rations: a wrapped bundle / haunch on a hook)
    rect(res, 4, 6, 11, 12, FOOD)
    rect(res, 4, 6, 11, 6, FOOD_DK)
    rect(res, 4, 12, 11, 12, FOOD_DK)
    rect(res, 7, 6, 8, 12, FOOD_DK)   # binding cord
    px(res, 7, 4, FUR_LT)             # hook
    px(res, 8, 5, FUR_LT)
    # wood (log)
    ox = ts
    rect(res, ox + 3, 6, ox + 12, 10, WOOD_RES)
    rect(res, ox + 3, 6, ox + 12, 6, WOOD_LT)
    rect(res, ox + 3, 10, ox + 12, 10, WOOD_DK)
    px(res, ox + 5, 8, WOOD_DK)
    px(res, ox + 9, 8, WOOD_LT)
    # coal (dark lumps, faint ember glow)
    ox = 2 * ts
    for (cxp, cyp) in [(6, 9), (10, 8), (8, 11)]:
        rect(res, ox + cxp - 2, cyp - 2, ox + cxp + 2, cyp + 2, COAL)
        px(res, ox + cxp - 1, cyp - 1, COAL_LT)
    px(res, ox + 8, 9, EMBER)         # a single hot ember
    # iron (steel ingot)
    ox = 3 * ts
    rect(res, ox + 3, 8, ox + 12, 12, IRON)
    rect(res, ox + 3, 8, ox + 12, 8, STEEL_HI)
    rect(res, ox + 3, 12, ox + 12, 12, IRON_DK)
    rect(res, ox + 5, 6, ox + 10, 8, IRON)     # stacked top ingot
    rect(res, ox + 5, 6, ox + 10, 6, STEEL_HI)
    # steel (refined blued alloy ingot with a bright sheen — distinct from iron)
    ox = 4 * ts
    STEEL_RES = (143, 166, 201, 255)     # PALETTE.STEEL_RES (blued alloy)
    STEEL_RES_HI = (198, 214, 240, 255)
    STEEL_RES_DK = (96, 116, 150, 255)
    rect(res, ox + 3, 8, ox + 12, 12, STEEL_RES)
    rect(res, ox + 3, 8, ox + 12, 8, STEEL_RES_HI)
    rect(res, ox + 3, 12, ox + 12, 12, STEEL_RES_DK)
    rect(res, ox + 5, 5, ox + 10, 8, STEEL_RES)   # stacked top ingot
    rect(res, ox + 5, 5, ox + 10, 5, STEEL_RES_HI)
    px(res, ox + 7, 6, (255, 255, 255, 255))      # bright specular glint
    # spark (Ember Sparks premium: a warm four-point gleam / gem)
    ox = 5 * ts
    SPARK = (255, 210, 122, 255)         # PALETTE.SPARK
    rect(res, ox + 7, 3, ox + 8, 12, SPARK)       # vertical ray
    rect(res, ox + 3, 7, ox + 12, 8, SPARK)       # horizontal ray
    px(res, ox + 6, 6, EMBER_LT)                  # diagonal glimmers
    px(res, ox + 9, 6, EMBER_LT)
    px(res, ox + 6, 9, EMBER_LT)
    px(res, ox + 9, 9, EMBER_LT)
    rect(res, ox + 7, 7, ox + 8, 8, EMBER_CORE)   # hot core
    save(res, os.path.join(UI, "resource_icons.png"))

    # menu icon sheet: 16x16 x 8 for the new hub screens, frame order
    # hero, summon, campaign, research, gear, alliance, arena, quest.
    # (matches MENU_ICON_FRAME in AssetKeys.ts). Simple, legible glyphs.
    menu = new(ts * 8, ts)
    # 0 hero: a helmed bust
    rect(menu, 5, 9, 10, 13, PLATE)
    rect(menu, 6, 4, 9, 9, PLATE)
    rect(menu, 6, 4, 9, 4, STEEL_HI)
    px(menu, 7, 3, EMBER)                # plume
    px(menu, 6, 6, ICE); px(menu, 9, 6, ICE)
    # 1 summon: a four-point star burst
    ox = ts
    rect(menu, ox + 7, 3, ox + 8, 13, EMBER_LT)
    rect(menu, ox + 3, 7, ox + 13, 8, EMBER_LT)
    px(menu, ox + 7, 7, EMBER_CORE); px(menu, ox + 8, 8, EMBER_CORE)
    px(menu, ox + 5, 5, EMBER); px(menu, ox + 10, 10, EMBER)
    # 2 campaign: a map flag on a hill
    ox = 2 * ts
    for i in range(5):
        rect(menu, ox + 3, 12 - i, ox + 12 - i, 12 - i, SNOW_LT if i == 0 else SNOW_DK)
    rect(menu, ox + 9, 3, ox + 9, 9, WOOD_DK)     # pole
    rect(menu, ox + 6, 3, ox + 9, 6, FLAG)        # pennant
    # 3 research: an open book
    ox = 3 * ts
    rect(menu, ox + 3, 5, ox + 7, 12, SNOW_LT)
    rect(menu, ox + 9, 5, ox + 13, 12, SNOW_LT)
    rect(menu, ox + 7, 4, ox + 9, 12, WOOD)       # spine
    for k in (7, 9, 11):
        rect(menu, ox + 3, k, ox + 6, k, ICE_DK)
        rect(menu, ox + 10, k, ox + 13, k, ICE_DK)
    # 4 gear: a chestplate/coat
    ox = 4 * ts
    rect(menu, ox + 5, 4, ox + 10, 13, STEEL)
    rect(menu, ox + 5, 4, ox + 10, 4, STEEL_HI)
    rect(menu, ox + 3, 5, ox + 5, 8, STEEL_DK)    # shoulder
    rect(menu, ox + 10, 5, ox + 12, 8, STEEL_DK)
    px(menu, ox + 7, 8, EMBER)                    # emblem
    # 5 alliance: a shield-and-handshake (two clasped bars)
    ox = 5 * ts
    rect(menu, ox + 4, 4, ox + 11, 9, FLAG)
    rect(menu, ox + 5, 9, ox + 10, 11, FLAG)
    px(menu, ox + 7, 12, FLAG)
    rect(menu, ox + 6, 6, ox + 9, 7, EMBER_CORE)  # clasp
    # 6 arena: two crossed swords
    ox = 6 * ts
    for i in range(9):
        px(menu, ox + 3 + i, 12 - i, STEEL)
        px(menu, ox + 12 - i, 12 - i, STEEL)
    px(menu, ox + 4, 12, FUR); px(menu, ox + 11, 12, FUR)
    # 7 quest: a checklist / scroll with a tick
    ox = 7 * ts
    rect(menu, ox + 4, 3, ox + 12, 13, SNOW_LT)
    rect(menu, ox + 4, 3, ox + 12, 3, ICE_DK)
    for k in (6, 9):
        rect(menu, ox + 6, k, ox + 11, k, STONE_DK)
    TICK = (122, 208, 160, 255)          # PALETTE.SUCCESS (a green tick)
    px(menu, ox + 6, 12, TICK)
    px(menu, ox + 7, 13, TICK)
    px(menu, ox + 8, 12, TICK)
    px(menu, ox + 9, 11, TICK)
    save(menu, os.path.join(UI, "menu_icons.png"))
    print("ui: panel.png button.png bar_frame.png icons.png resource_icons.png menu_icons.png")


# ===========================================================================
# FAVICON: a tiny app mark for the browser tab. An ORIGINAL "ember-in-the-cold"
# motif that matches the game: a warm Furnace ember flame glowing against a
# cold, frost-dark rounded tile. Drawn as crisp 16x16 pixel art and exported
# upscaled to 32x32 (NEAREST) so it reads on the tab while staying byte-stable.
# Output: public/favicon.png (Vite copies public/ to the site root of the build
# base, so it ships at /game-whiteout/favicon.png in production).
# ===========================================================================

def build_favicon():
    """A 16x16 ember-flame-in-the-cold mark, saved 2x (32x32) to public/."""
    s = 16
    img = new(s, s)

    # Cold frost-dark rounded tile background (PALETTE.PANEL over BG_SKY tones),
    # corners trimmed for a soft rounded-square silhouette.
    PANEL_BG = (24, 32, 46, 255)         # PALETTE.PANEL
    FROST_EDGE = (58, 74, 96, 255)       # cool steel rim
    rect(img, 0, 0, s - 1, s - 1, PANEL_BG)
    for (cx, cy) in ((0, 0), (s - 1, 0), (0, s - 1), (s - 1, s - 1)):
        px(img, cx, cy, T)
    # A 1px cool rim so the tile reads against a light or dark tab bar.
    for x in range(1, s - 1):
        px(img, x, 0, FROST_EDGE)
        px(img, x, s - 1, FROST_EDGE)
    for y in range(1, s - 1):
        px(img, 0, y, FROST_EDGE)
        px(img, s - 1, y, FROST_EDGE)

    # A couple of cold frost specks in the corners (the "cold" the ember fights).
    px(img, 3, 3, ICE)
    px(img, 12, 4, ICE_DK)
    px(img, 4, 12, ICE_DK)

    # The ember flame, centred and rising: a warm teardrop from a hot core up to
    # a bright tip, ringed by ember-orange, with a dark base ember bed.
    # Base bed / hearth line.
    rect(img, 6, 13, 9, 13, EMBER_DK)
    # Outer flame body (ember orange).
    rect(img, 6, 9, 9, 12, EMBER)
    rect(img, 7, 6, 8, 12, EMBER)
    px(img, 6, 8, EMBER)
    px(img, 9, 8, EMBER)
    px(img, 7, 5, EMBER)
    px(img, 8, 5, EMBER)
    # Warm inner glow.
    rect(img, 7, 9, 8, 12, EMBER_LT)
    px(img, 7, 8, EMBER_LT)
    px(img, 8, 8, EMBER_LT)
    px(img, 7, 7, EMBER_LT)
    # Hot white-gold core + rising tip.
    rect(img, 7, 10, 8, 11, EMBER_CORE)
    px(img, 8, 6, EMBER_CORE)

    save(img, os.path.join(PUB, "favicon.png"), scale=2)
    print("favicon: favicon.png (32x32)")


if __name__ == "__main__":
    build_buildings()
    build_all_characters()
    build_backgrounds()
    build_fx()
    build_ui()
    build_favicon()
    print("\nAll original pixel-art assets generated.")
