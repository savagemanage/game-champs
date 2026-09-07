#!/usr/bin/env python3
"""
gen_sprites.py - Original pixel-art asset generator for KINGDOM RISE.

Everything produced by this script is ORIGINAL art authored programmatically for
this project. Nothing is traced, ripped, or derived from any existing IP.
Kingdom Rise is an original-world medieval strategy/idle game: idle resource
buildings, a Town-Center-gated upgrade tree, troop training, and wave-based
combat. All designs (buildings, troops, raiders, icons) are original and
role-based.

All output PNGs are nearest-neighbour pixel art on a cohesive medieval palette
that lines up with src/config/GameConfig.ts (logical canvas 960x540).

Run:  python3 tools/gen_sprites.py
Out:  public/assets/{sprites,backgrounds,ui,fx}/*.png
"""

import math
import random
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPR = os.path.join(ROOT, "public", "assets", "sprites")
BG = os.path.join(ROOT, "public", "assets", "backgrounds")
UI = os.path.join(ROOT, "public", "assets", "ui")
FX = os.path.join(ROOT, "public", "assets", "fx")
for d in (SPR, BG, UI, FX):
    os.makedirs(d, exist_ok=True)

# ---------------------------------------------------------------------------
# Cohesive medieval palette (RGBA). Mirrors PALETTE in src/config/GameConfig.ts.
# ---------------------------------------------------------------------------
T = (0, 0, 0, 0)  # transparent

GRASS = (79, 122, 58, 255)
GRASS_DK = (56, 96, 40, 255)
DIRT = (107, 79, 48, 255)
DIRT_DK = (74, 54, 32, 255)
STONE = (138, 131, 120, 255)
STONE_DK = (92, 86, 77, 255)
STONE_LT = (180, 172, 156, 255)
WOOD = (138, 90, 52, 255)
WOOD_DK = (95, 61, 34, 255)
WOOD_LT = (176, 122, 74, 255)
ROOF = (150, 62, 52, 255)          # terracotta / thatch-red roof
ROOF_DK = (110, 44, 38, 255)
ROOF_HI = (188, 92, 78, 255)
THATCH = (176, 142, 74, 255)
THATCH_DK = (128, 100, 50, 255)
FOOD = (224, 176, 74, 255)         # wheat gold
WOOD_RES = (156, 107, 60, 255)
STONE_RES = (176, 176, 184, 255)
GOLD = (244, 207, 74, 255)
GOLD_DK = (196, 158, 40, 255)
FLAG = (92, 134, 198, 255)         # kingdom banner blue
FLAG_ENEMY = (198, 80, 60, 255)    # raider banner red
GLASS = (120, 170, 200, 255)
OUTLINE = (28, 22, 18, 255)

# Troop / character palette
SKIN = (240, 200, 160, 255)
SKIN_SH = (196, 156, 120, 255)
HAIR = (78, 56, 40, 255)
STEEL = (188, 196, 208, 255)
STEEL_HI = (226, 232, 242, 255)
STEEL_DK = (120, 128, 140, 255)
LEATHER = (110, 74, 44, 255)
TUNIC_BLUE = (76, 112, 176, 255)
TUNIC_BLUE_DK = (52, 80, 130, 255)
TUNIC_GREEN = (86, 132, 70, 255)
CLOTH_RED = (176, 74, 62, 255)
CLOTH_RED_DK = (128, 52, 44, 255)
PANTS = (86, 78, 66, 255)
BOOT = (54, 44, 38, 255)
MOUTH = (60, 36, 30, 255)


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
# BUILDINGS: each is a 2-frame sheet (tier 0 = starter, tier 1 = upgraded look
# with banners / extra detail). The upgrade tier chosen at runtime is
# level-derived; a numeric level badge is drawn by the engine over the sprite.
# ===========================================================================

def draw_ground_pad(img, ox, oy, fw, fh):
    """A little dirt pad the building sits on."""
    rect(img, ox + 4, oy + fh - 6, ox + fw - 5, oy + fh - 2, DIRT)
    rect(img, ox + 4, oy + fh - 6, ox + fw - 5, oy + fh - 6, DIRT_DK)


def banner(img, x, y, h, color):
    """A vertical banner/pennant hanging from a pole."""
    rect(img, x, y, x, y + h, WOOD_DK)          # pole
    rect(img, x + 1, y, x + 4, y + h - 2, color)
    px(img, x + 2, y + h - 1, color)


def draw_town_center(img, ox, oy, fw, fh, tier):
    """Fortified keep with a central tower. 64x64 frame."""
    draw_ground_pad(img, ox, oy, fw, fh)
    cx = ox + fw // 2
    base_top = oy + fh - 30
    # main stone hall
    rect(img, ox + 10, base_top, ox + fw - 11, oy + fh - 6, STONE)
    rect(img, ox + 10, base_top, ox + 10, oy + fh - 6, STONE_LT)
    rect(img, ox + fw - 11, base_top, ox + fw - 11, oy + fh - 6, STONE_DK)
    for y in range(base_top + 4, oy + fh - 6, 5):
        rect(img, ox + 11, y, ox + fw - 12, y, STONE_DK)
    # door
    rect(img, cx - 3, oy + fh - 14, cx + 2, oy + fh - 6, WOOD_DK)
    rect(img, cx - 3, oy + fh - 14, cx + 2, oy + fh - 13, WOOD)
    # central tower
    tw = 12
    ttop = oy + 8 if tier == 0 else oy + 4
    rect(img, cx - tw // 2, ttop, cx + tw // 2, base_top, STONE)
    rect(img, cx - tw // 2, ttop, cx - tw // 2, base_top, STONE_LT)
    rect(img, cx + tw // 2, ttop, cx + tw // 2, base_top, STONE_DK)
    # crenellations on tower
    for x in range(cx - tw // 2, cx + tw // 2, 4):
        rect(img, x, ttop - 3, x + 1, ttop - 1, STONE)
    # tower window
    rect(img, cx - 1, ttop + 4, cx, ttop + 7, GLASS)
    # roofs on side wings
    rect(img, ox + 8, base_top - 5, ox + 22, base_top, ROOF)
    rect(img, ox + fw - 23, base_top - 5, ox + fw - 9, base_top, ROOF)
    rect(img, ox + 8, base_top - 5, ox + 22, base_top - 5, ROOF_HI)
    if tier == 1:
        # flags on the tower + gold trim
        banner(img, cx - tw // 2 - 2, ttop, 8, FLAG)
        banner(img, cx + tw // 2 + 1, ttop, 8, FLAG)
        rect(img, cx - tw // 2, base_top - 1, cx + tw // 2, base_top - 1, GOLD)


def draw_house_shell(img, ox, oy, fw, fh, wall, wall_dk, roof, roof_dk, roof_hi):
    """Generic cottage: walls + gabled roof. Used by resource buildings."""
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
    rect(img, ox + 8, wall_top, ox + fw - 9, wall_top, roof_hi)
    # door
    cxc = ox + fw // 2
    rect(img, cxc - 2, oy + fh - 12, cxc + 1, oy + fh - 6, WOOD_DK)


def draw_farm(img, ox, oy, fw, fh, tier):
    draw_house_shell(img, ox, oy, fw, fh, THATCH, THATCH_DK, ROOF, ROOF_DK, ROOF_HI)
    # wheat rows in front
    base = oy + fh - 7
    for i, x in enumerate(range(ox + 6, ox + fw - 6, 4)):
        h = 4 if tier == 0 else 6
        rect(img, x, base - h, x, base, GRASS_DK)
        rect(img, x, base - h, x, base - h + 1, FOOD)
    if tier == 1:
        # a second wheat patch + fuller crop
        for x in range(ox + 6, ox + fw - 6, 4):
            px(img, x, base - 7, FOOD)


def draw_lumber_mill(img, ox, oy, fw, fh, tier):
    draw_house_shell(img, ox, oy, fw, fh, WOOD, WOOD_DK, ROOF, ROOF_DK, ROOF_HI)
    # log pile
    base = oy + fh - 7
    for i, y in enumerate((base, base - 3)):
        for x in range(ox + 6, ox + 14, 3):
            rect(img, x, y - 2, x + 2, y, WOOD_LT)
            px(img, x, y - 2, WOOD_DK)
    if tier == 1:
        # a saw blade emblem
        cxc = ox + fw - 12
        cy = oy + fh - 14
        for a in range(0, 360, 45):
            x = int(cxc + 4 * math.cos(math.radians(a)))
            y = int(cy + 4 * math.sin(math.radians(a)))
            px(img, x, y, STEEL)
        rect(img, cxc - 2, cy - 2, cxc + 2, cy + 2, STEEL_HI)


def draw_quarry(img, ox, oy, fw, fh, tier):
    draw_house_shell(img, ox, oy, fw, fh, STONE, STONE_DK, STONE_DK, DIRT_DK, STONE_LT)
    # cut stone blocks in front
    base = oy + fh - 6
    for x in range(ox + 6, ox + fw - 8, 6):
        rect(img, x, base - 4, x + 4, base, STONE_LT)
        rect(img, x, base - 4, x + 4, base - 4, STONE)
        px(img, x + 4, base, STONE_DK)
    if tier == 1:
        # pickaxe leaning on the wall
        px(img, ox + fw - 10, oy + fh - 16, WOOD)
        rect(img, ox + fw - 11, oy + fh - 17, ox + fw - 8, oy + fh - 17, STEEL)


def draw_mine(img, ox, oy, fw, fh, tier):
    draw_ground_pad(img, ox, oy, fw, fh)
    # mine entrance in a rock face
    rect(img, ox + 8, oy + 14, ox + fw - 9, oy + fh - 6, STONE_DK)
    rect(img, ox + 8, oy + 14, ox + 8, oy + fh - 6, STONE)
    # arched black entrance
    cxc = ox + fw // 2
    rect(img, cxc - 5, oy + fh - 20, cxc + 4, oy + fh - 6, (18, 16, 14, 255))
    rect(img, cxc - 6, oy + fh - 22, cxc + 5, oy + fh - 20, WOOD_DK)  # timber frame
    rect(img, cxc - 6, oy + fh - 20, cxc - 5, oy + fh - 6, WOOD_DK)
    rect(img, cxc + 4, oy + fh - 20, cxc + 5, oy + fh - 6, WOOD_DK)
    # gold veins / cart
    px(img, ox + 12, oy + 20, GOLD)
    px(img, ox + fw - 12, oy + 24, GOLD)
    if tier == 1:
        # a minecart of gold at the entrance
        rect(img, cxc - 3, oy + fh - 9, cxc + 2, oy + fh - 6, WOOD)
        rect(img, cxc - 2, oy + fh - 10, cxc + 1, oy + fh - 9, GOLD)
        px(img, cxc - 3, oy + fh - 5, (18, 16, 14, 255))
        px(img, cxc + 2, oy + fh - 5, (18, 16, 14, 255))


def draw_barracks(img, ox, oy, fw, fh, tier):
    draw_house_shell(img, ox, oy, fw, fh, STONE, STONE_DK, ROOF, ROOF_DK, ROOF_HI)
    # weapon rack / shield on the wall
    cxc = ox + fw // 2
    # crossed swords
    for i in range(6):
        px(img, cxc - 3 + i, oy + fh - 16 + i, STEEL)
        px(img, cxc + 3 - i, oy + fh - 16 + i, STEEL)
    # shield
    rect(img, cxc - 2, oy + fh - 12, cxc + 1, oy + fh - 8, FLAG)
    if tier == 1:
        banner(img, ox + 9, oy + fh // 2 - 8, 8, FLAG)
        banner(img, ox + fw - 11, oy + fh // 2 - 8, 8, FLAG)


def draw_research(img, ox, oy, fw, fh, tier):
    """Scholars' Hall: a stone study-tower topped with a small observatory dome
    and marked with an open-book emblem. 48x48."""
    draw_house_shell(img, ox, oy, fw, fh, STONE, STONE_DK, ROOF, ROOF_DK, ROOF_HI)
    cxc = ox + fw // 2
    # a slim study tower rising on the left
    tw = 8
    tx = ox + 9
    ttop = oy + 8 if tier == 0 else oy + 5
    tbot = oy + fh - 8
    rect(img, tx, ttop, tx + tw, tbot, STONE)
    rect(img, tx, ttop, tx, tbot, STONE_LT)
    rect(img, tx + tw, ttop, tx + tw, tbot, STONE_DK)
    # arched tower window glowing with lamplight
    rect(img, tx + 3, ttop + 5, tx + 5, ttop + 9, GOLD)
    # observatory dome cap on the tower
    rect(img, tx - 1, ttop - 3, tx + tw + 1, ttop - 1, STONE_LT)
    rect(img, tx + 1, ttop - 5, tx + tw - 1, ttop - 3, GLASS)
    # open-book emblem on the main wall
    bx, by = cxc + 2, oy + fh - 15
    rect(img, bx - 6, by, bx + 5, by + 5, STONE_LT)     # pages
    rect(img, bx - 1, by, bx, by + 5, WOOD_DK)          # spine
    for i in range(4):                                   # text lines
        px(img, bx - 5 + i, by + 2, STONE_DK)
        px(img, bx + 1 + i, by + 2, STONE_DK)
        px(img, bx - 5 + i, by + 4, STONE_DK)
        px(img, bx + 1 + i, by + 4, STONE_DK)
    if tier == 1:
        # a scholar's blue pennant + gold trim on the tower
        banner(img, tx - 2, ttop - 1, 8, FLAG)
        rect(img, tx, tbot - 1, tx + tw, tbot - 1, GOLD)


def draw_wall(img, ox, oy, fw, fh, tier):
    """The Ramparts: a crenellated stone curtain wall with a timber gate. 48x48.
    Tier 1 raises the wall, adds a banner and gold trim along the battlement."""
    draw_ground_pad(img, ox, oy, fw, fh)
    wall_top = oy + 18 if tier == 0 else oy + 12
    wbot = oy + fh - 6
    # main curtain wall
    rect(img, ox + 6, wall_top, ox + fw - 7, wbot, STONE)
    rect(img, ox + 6, wall_top, ox + 6, wbot, STONE_LT)
    rect(img, ox + fw - 7, wall_top, ox + fw - 7, wbot, STONE_DK)
    # stone courses (horizontal joins)
    for y in range(wall_top + 4, wbot, 5):
        rect(img, ox + 7, y, ox + fw - 8, y, STONE_DK)
    # staggered vertical joins for a brick look
    for i, y in enumerate(range(wall_top + 2, wbot, 5)):
        offset = 0 if i % 2 == 0 else 4
        for x in range(ox + 8 + offset, ox + fw - 8, 8):
            rect(img, x, y, x, min(y + 4, wbot), STONE_DK)
    # crenellations along the top
    for x in range(ox + 6, ox + fw - 7, 8):
        rect(img, x, wall_top - 4, x + 4, wall_top - 1, STONE)
        rect(img, x, wall_top - 4, x, wall_top - 1, STONE_LT)
    # timber gate in the centre
    cxc = ox + fw // 2
    rect(img, cxc - 5, wbot - 12, cxc + 4, wbot, WOOD_DK)
    rect(img, cxc - 5, wbot - 12, cxc + 4, wbot - 11, WOOD)
    rect(img, cxc - 1, wbot - 12, cxc, wbot, WOOD)  # gate plank seam
    # iron studs on the gate
    for gy in range(wbot - 10, wbot, 4):
        px(img, cxc - 3, gy, STEEL_DK)
        px(img, cxc + 2, gy, STEEL_DK)
    if tier == 1:
        # a banner over the gate + gold trim along the battlement
        banner(img, cxc - 1, wall_top - 3, 7, FLAG)
        rect(img, ox + 6, wall_top - 1, ox + fw - 7, wall_top - 1, GOLD)


def draw_watchtower(img, ox, oy, fw, fh, tier):
    """The Watchtower: a tall stone tower with an archer's platform and a
    conical roof. 48x48. Tier 1 adds a taller roof, a pennant and a lit window."""
    draw_ground_pad(img, ox, oy, fw, fh)
    cxc = ox + fw // 2
    tw = 16
    tx0 = cxc - tw // 2
    tx1 = cxc + tw // 2
    ttop = oy + 16 if tier == 0 else oy + 12
    tbot = oy + fh - 6
    # tower shaft
    rect(img, tx0, ttop, tx1, tbot, STONE)
    rect(img, tx0, ttop, tx0, tbot, STONE_LT)
    rect(img, tx1, ttop, tx1, tbot, STONE_DK)
    for y in range(ttop + 5, tbot, 6):
        rect(img, tx0 + 1, y, tx1 - 1, y, STONE_DK)
    # archer's platform (overhang) near the top
    rect(img, tx0 - 2, ttop, tx1 + 2, ttop + 3, STONE)
    rect(img, tx0 - 2, ttop, tx1 + 2, ttop, STONE_LT)
    # crenellations on the platform
    for x in range(tx0 - 2, tx1 + 2, 5):
        rect(img, x, ttop - 3, x + 2, ttop - 1, STONE)
    # arrow-slit window
    rect(img, cxc - 1, ttop + 8, cxc, ttop + 13, GLASS if tier == 0 else GOLD)
    # door at the base
    rect(img, cxc - 2, tbot - 8, cxc + 1, tbot, WOOD_DK)
    rect(img, cxc - 2, tbot - 8, cxc + 1, tbot - 7, WOOD)
    # conical roof over the platform
    roof_base = ttop - 3
    rh = 6 if tier == 0 else 9
    for i in range(rh + 1):
        y = roof_base - i
        spread = int((tw + 2) * (1 - i / max(1, rh)) / 2)
        rect(img, cxc - spread, y, cxc + spread, y, ROOF)
        px(img, cxc - spread, y, ROOF_DK)
        px(img, cxc + spread, y, ROOF_DK)
    rect(img, tx0 - 2, roof_base, tx1 + 2, roof_base, ROOF_HI)
    if tier == 1:
        # a lookout's pennant on the roof peak
        banner(img, cxc, roof_base - rh - 1, 6, FLAG)


BUILDINGS = [
    ("town_center", 64, 64, draw_town_center),
    ("farm", 48, 48, draw_farm),
    ("lumber_mill", 48, 48, draw_lumber_mill),
    ("quarry", 48, 48, draw_quarry),
    ("mine", 48, 48, draw_mine),
    ("barracks", 48, 48, draw_barracks),
    ("research", 48, 48, draw_research),
    ("wall", 48, 48, draw_wall),
    ("watchtower", 48, 48, draw_watchtower),
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
# CHARACTERS: troops (player) and raiders (enemy). 2-frame walk sheets.
# Small chibi soldiers so many fit on the battle lane.
# ===========================================================================

def draw_soldier(img, ox, oy, fw, fh, step, palette):
    """Generic soldier. palette: dict with body/helm/weapon colors + kind."""
    cx = ox + fw // 2
    ground = oy + fh - 1
    skin = palette.get("skin", SKIN)
    tunic = palette["tunic"]
    tunic_dk = palette["tunic_dk"]
    kind = palette["kind"]
    swing = 1 if step == 1 else -1

    # legs
    rect(img, cx - 3, oy + fh - 8, cx - 1, ground - 1, PANTS)
    rect(img, cx + 1, oy + fh - 8, cx + 3, ground - 1, PANTS)
    rect(img, cx - 4 + swing, ground - 1, cx - 1 + swing, ground, BOOT)
    rect(img, cx + 1 - swing, ground - 1, cx + 4 - swing, ground, BOOT)
    # torso / tunic
    rect(img, cx - 4, oy + fh - 16, cx + 3, oy + fh - 8, tunic)
    rect(img, cx + 2, oy + fh - 16, cx + 3, oy + fh - 8, tunic_dk)
    # head
    rect(img, cx - 3, oy + fh - 22, cx + 2, oy + fh - 16, skin)
    px(img, cx + 1, oy + fh - 19, MOUTH)

    if kind == "spearman":
        # helm cap + spear
        rect(img, cx - 3, oy + fh - 23, cx + 2, oy + fh - 22, STEEL_DK)
        rect(img, cx + 4, oy + fh - 26, cx + 5, oy + fh - 8, WOOD)   # shaft
        rect(img, cx + 3, oy + fh - 28, cx + 6, oy + fh - 26, STEEL_HI)  # tip
        rect(img, cx - 6, oy + fh - 14, cx - 4, oy + fh - 8, tunic_dk)   # shield arm
    elif kind == "archer":
        # hood + bow
        rect(img, cx - 3, oy + fh - 24, cx + 2, oy + fh - 22, TUNIC_GREEN)
        for i in range(9):
            y = oy + fh - 20 + i
            xx = cx + 5 - abs(4 - i) // 2
            px(img, xx, y, WOOD_LT)
        rect(img, cx + 6, oy + fh - 20, cx + 6, oy + fh - 12, STEEL)  # string
    elif kind == "knight":
        # full helm + sword + shield, taller plume
        rect(img, cx - 3, oy + fh - 24, cx + 2, oy + fh - 21, STEEL)
        px(img, cx, oy + fh - 25, CLOTH_RED)                          # plume
        rect(img, cx - 3, oy + fh - 20, cx + 2, oy + fh - 19, STEEL_DK)  # visor
        rect(img, cx + 4, oy + fh - 20, cx + 5, oy + fh - 8, STEEL)   # sword
        px(img, cx + 4, oy + fh - 21, STEEL_HI)
        rect(img, cx - 7, oy + fh - 16, cx - 5, oy + fh - 8, FLAG)    # shield
    elif kind == "raider":
        # bandana + crude axe
        rect(img, cx - 3, oy + fh - 23, cx + 2, oy + fh - 22, CLOTH_RED)
        rect(img, cx + 4, oy + fh - 18, cx + 5, oy + fh - 9, WOOD_DK)  # haft
        rect(img, cx + 5, oy + fh - 18, cx + 7, oy + fh - 15, STEEL_DK)  # axe head
    elif kind == "brute":
        # horned helm + big club (drawer sizes are larger)
        rect(img, cx - 4, oy + fh - 27, cx + 3, oy + fh - 24, STEEL_DK)
        px(img, cx - 5, oy + fh - 28, STEEL_DK)
        px(img, cx + 4, oy + fh - 28, STEEL_DK)
        rect(img, cx + 5, oy + fh - 22, cx + 8, oy + fh - 8, WOOD_DK)  # club
        rect(img, cx + 5, oy + fh - 24, cx + 9, oy + fh - 20, WOOD)


def build_character(name, fw, fh, palette):
    sheet = new(fw * 2, fh)
    for step in (0, 1):
        draw_soldier(sheet, step * fw, 0, fw, fh, step, palette)
    sheet = outline_alpha(sheet)
    save(sheet, os.path.join(SPR, f"{name}.png"))
    print(f"{name}.png", sheet.size)


def draw_horse_rider(img, ox, oy, fw, fh, step, palette):
    """A mounted rider: a small horse with a soldier on its back. 32x32.

    palette: dict with tunic/tunic_dk (rider), horse/horse_dk colors, and a
    weapon 'kind' ('lance' for player cavalry, 'saber' for enemy rider).
    """
    ground = oy + fh - 1
    horse = palette.get("horse", (120, 84, 54, 255))
    horse_dk = palette.get("horse_dk", (86, 58, 36, 255))
    tunic = palette["tunic"]
    tunic_dk = palette["tunic_dk"]
    skin = palette.get("skin", SKIN)
    kind = palette["kind"]
    gait = 1 if step == 1 else -1
    cx = ox + fw // 2

    # horse body
    body_top = oy + fh - 16
    rect(img, ox + 6, body_top, ox + fw - 7, oy + fh - 10, horse)
    rect(img, ox + 6, oy + fh - 10, ox + fw - 7, oy + fh - 10, horse_dk)
    # neck + head (facing right)
    rect(img, ox + fw - 10, body_top - 6, ox + fw - 7, body_top + 1, horse)
    rect(img, ox + fw - 8, body_top - 8, ox + fw - 5, body_top - 5, horse)
    px(img, ox + fw - 5, body_top - 7, horse_dk)  # muzzle
    # mane + tail
    rect(img, ox + fw - 12, body_top - 5, ox + fw - 11, body_top + 1, horse_dk)
    rect(img, ox + 5, body_top - 2, ox + 6, body_top + 3, horse_dk)  # tail
    # legs (animate with gait)
    for i, lx in enumerate((ox + 8, ox + 12, ox + fw - 13, ox + fw - 9)):
        swing = gait if i % 2 == 0 else -gait
        rect(img, lx + swing, oy + fh - 10, lx + 1 + swing, ground, horse_dk)
    # rider torso + head sitting on the back
    rx = cx - 1
    rect(img, rx - 3, body_top - 7, rx + 2, body_top - 1, tunic)
    rect(img, rx + 1, body_top - 7, rx + 2, body_top - 1, tunic_dk)
    rect(img, rx - 2, body_top - 12, rx + 2, body_top - 7, skin)  # head
    if kind == "lance":
        rect(img, rx - 3, body_top - 13, rx + 2, body_top - 12, STEEL)  # helm
        # couched lance angled forward-right
        for i in range(10):
            px(img, rx + 3 + i, body_top - 9 + i // 2, WOOD)
        rect(img, rx + 12, body_top - 5, rx + 13, body_top - 3, STEEL_HI)  # tip
    else:  # saber
        rect(img, rx - 3, body_top - 12, rx + 2, body_top - 11, CLOTH_RED)  # bandana
        for i in range(6):  # curved saber raised
            px(img, rx + 3 + i, body_top - 9 - i, STEEL)
        px(img, rx + 9, body_top - 15, STEEL_HI)


def build_rider(name, palette):
    fw, fh = 32, 32
    sheet = new(fw * 2, fh)
    for step in (0, 1):
        draw_horse_rider(sheet, step * fw, 0, fw, fh, step, palette)
    sheet = outline_alpha(sheet)
    save(sheet, os.path.join(SPR, f"{name}.png"))
    print(f"{name}.png", sheet.size)


def draw_siege_engine(img, ox, oy, fw, fh, step):
    """A wheeled catapult/ballista: a heavy timber frame with a throwing arm on
    wheels. 40x32. The arm cocks/releases between the two frames."""
    ground = oy + fh - 1
    # wheels
    for wx in (ox + 5, ox + fw - 11):
        rect(img, wx, ground - 6, wx + 5, ground, WOOD_DK)
        rect(img, wx + 1, ground - 5, wx + 4, ground - 1, WOOD)
        px(img, wx + 2, ground - 3, WOOD_DK)
    # chassis / base beam
    rect(img, ox + 4, oy + fh - 12, ox + fw - 5, oy + fh - 8, WOOD)
    rect(img, ox + 4, oy + fh - 12, ox + fw - 5, oy + fh - 12, WOOD_LT)
    # A-frame uprights
    rect(img, ox + 12, oy + 10, ox + 14, oy + fh - 12, WOOD_DK)
    rect(img, ox + fw - 15, oy + 10, ox + fw - 13, oy + fh - 12, WOOD_DK)
    rect(img, ox + 12, oy + 9, ox + fw - 13, oy + 11, WOOD)  # crossbeam
    # throwing arm: cocked (step 0) vs released (step 1)
    pivot_x, pivot_y = ox + 13, oy + 10
    if step == 0:
        rect(img, pivot_x - 8, pivot_y + 2, pivot_x + 1, pivot_y + 4, WOOD_LT)  # arm back
        rect(img, pivot_x - 9, pivot_y + 1, pivot_x - 7, pivot_y + 4, STEEL_DK)  # bucket
    else:
        for i in range(8):  # arm swung up-forward
            px(img, pivot_x + 2 + i, pivot_y - 1 - i, WOOD_LT)
        rect(img, pivot_x + 9, pivot_y - 9, pivot_x + 11, pivot_y - 7, STEEL_DK)  # payload
    # iron reinforcement plate
    rect(img, ox + fw - 12, oy + fh - 18, ox + fw - 7, oy + fh - 13, STEEL_DK)
    px(img, ox + fw - 11, oy + fh - 17, STEEL_HI)


def build_siege():
    fw, fh = 40, 32
    sheet = new(fw * 2, fh)
    for step in (0, 1):
        draw_siege_engine(sheet, step * fw, 0, fw, fh, step)
    sheet = outline_alpha(sheet)
    save(sheet, os.path.join(SPR, "troop_siege.png"))
    print("troop_siege.png", sheet.size)


def draw_ram(img, ox, oy, fw, fh, step):
    """Battering ram on wheels: a log in a wooden frame. 40x32."""
    ground = oy + fh - 1
    # wheels
    for wx in (ox + 6, ox + fw - 9):
        rect(img, wx, ground - 5, wx + 4, ground, WOOD_DK)
        rect(img, wx + 1, ground - 4, wx + 3, ground - 1, WOOD)
    # frame
    rect(img, ox + 4, oy + 10, ox + fw - 5, oy + 12, WOOD)
    rect(img, ox + 6, oy + 6, ox + 8, oy + 20, WOOD_DK)
    rect(img, ox + fw - 9, oy + 6, ox + fw - 7, oy + 20, WOOD_DK)
    # the ram log (slides with step)
    off = 2 if step == 1 else 0
    rect(img, ox + 6 + off, oy + 14, ox + fw - 6 + off, oy + 19, WOOD_LT)
    rect(img, ox + 6 + off, oy + 14, ox + fw - 6 + off, oy + 14, WOOD)
    # iron cap
    rect(img, ox + 2 + off, oy + 13, ox + 6 + off, oy + 20, STEEL_DK)
    px(img, ox + 2 + off, oy + 16, STEEL_HI)


def build_ram():
    fw, fh = 40, 32
    sheet = new(fw * 2, fh)
    for step in (0, 1):
        draw_ram(sheet, step * fw, 0, fw, fh, step)
    sheet = outline_alpha(sheet)
    save(sheet, os.path.join(SPR, "enemy_ram.png"))
    print("enemy_ram.png", sheet.size)


def build_all_characters():
    build_character("troop_spearman", 24, 28, dict(kind="spearman", tunic=TUNIC_BLUE, tunic_dk=TUNIC_BLUE_DK))
    build_character("troop_archer", 24, 28, dict(kind="archer", tunic=TUNIC_GREEN, tunic_dk=(58, 92, 48, 255)))
    build_character("troop_knight", 24, 28, dict(kind="knight", tunic=STEEL_DK, tunic_dk=(90, 96, 108, 255)))
    build_character("enemy_raider", 24, 28, dict(kind="raider", tunic=CLOTH_RED, tunic_dk=CLOTH_RED_DK, skin=(196, 160, 130, 255)))
    build_character("enemy_brute", 32, 36, dict(kind="brute", tunic=(96, 70, 60, 255), tunic_dk=(70, 50, 44, 255), skin=(170, 140, 116, 255)))
    # Player cavalry: a kingdom-blue lancer on a chestnut horse.
    build_rider("troop_cavalry", dict(kind="lance", tunic=TUNIC_BLUE, tunic_dk=TUNIC_BLUE_DK, horse=(120, 84, 54, 255), horse_dk=(86, 58, 36, 255)))
    # Enemy raider-cavalry: a red-bandana saber rider on a dark horse.
    build_rider("enemy_rider", dict(kind="saber", tunic=CLOTH_RED, tunic_dk=CLOTH_RED_DK, skin=(196, 160, 130, 255), horse=(92, 70, 58, 255), horse_dk=(64, 48, 40, 255)))
    build_siege()
    build_ram()


# ===========================================================================
# HEROES: single-frame 40x40 portrait busts (head + shoulders) for the roster.
# Each hero is an ORIGINAL design distinguished by helm/hair + cloak colors so
# war and economy leaders read at a glance. No IP-derived likenesses.
# ===========================================================================

def draw_hero_portrait(img, ox, oy, fw, fh, palette):
    """A head-and-shoulders bust framed by a rounded plaque background.

    palette: dict with cloak/cloak_dk (shoulders), hair, skin, and a `crest`
    color drawn as a small emblem (helm plume for war, coin/wheat for economy)
    keyed by `kind` in {'knight','rider','coin','wheat'}.
    """
    cx = ox + fw // 2
    skin = palette.get("skin", SKIN)
    cloak = palette["cloak"]
    cloak_dk = palette["cloak_dk"]
    hair = palette.get("hair", HAIR)
    crest = palette.get("crest", GOLD)
    kind = palette["kind"]

    # plaque backdrop (rounded stone tile)
    rect(img, ox + 3, oy + 3, ox + fw - 4, oy + fh - 2, STONE_DK)
    rect(img, ox + 5, oy + 5, ox + fw - 6, oy + fh - 3, STONE)
    rect(img, ox + 5, oy + 5, ox + fw - 6, oy + 6, STONE_LT)

    # shoulders / cloak
    rect(img, cx - 12, oy + fh - 11, cx + 11, oy + fh - 3, cloak)
    rect(img, cx - 12, oy + fh - 11, cx - 9, oy + fh - 3, cloak_dk)
    rect(img, cx + 8, oy + fh - 11, cx + 11, oy + fh - 3, cloak_dk)
    # collar trim
    rect(img, cx - 3, oy + fh - 11, cx + 2, oy + fh - 9, crest)

    # neck + head
    rect(img, cx - 2, oy + fh - 14, cx + 1, oy + fh - 11, palette.get("skin_sh", SKIN_SH))
    rect(img, cx - 5, oy + fh - 25, cx + 4, oy + fh - 14, skin)
    # eyes + mouth
    px(img, cx - 3, oy + fh - 21, OUTLINE)
    px(img, cx + 2, oy + fh - 21, OUTLINE)
    px(img, cx, oy + fh - 17, MOUTH)

    if kind == "knight":
        # full steel helm with a colored plume
        rect(img, cx - 5, oy + fh - 27, cx + 4, oy + fh - 22, STEEL)
        rect(img, cx - 5, oy + fh - 27, cx - 5, oy + fh - 22, STEEL_DK)
        rect(img, cx + 4, oy + fh - 27, cx + 4, oy + fh - 22, STEEL_DK)
        rect(img, cx - 5, oy + fh - 22, cx + 4, oy + fh - 21, STEEL_DK)  # visor slit
        rect(img, cx - 1, oy + fh - 30, cx, oy + fh - 27, crest)         # plume
    elif kind == "rider":
        # windswept hair + a light open helm band
        rect(img, cx - 6, oy + fh - 27, cx + 5, oy + fh - 23, hair)
        rect(img, cx + 4, oy + fh - 26, cx + 7, oy + fh - 22, hair)      # swept tail
        rect(img, cx - 5, oy + fh - 24, cx + 4, oy + fh - 23, crest)     # circlet
    elif kind == "coin":
        # merchant's hood + a gold coin emblem on the collar
        rect(img, cx - 6, oy + fh - 27, cx + 5, oy + fh - 23, hair)
        rect(img, cx - 6, oy + fh - 27, cx + 5, oy + fh - 26, cloak_dk)  # hood brim
        rect(img, cx - 1, oy + fh - 8, cx + 1, oy + fh - 6, crest)       # coin
        px(img, cx, oy + fh - 7, GOLD_DK)
    elif kind == "wheat":
        # straw hat brim + a wheat sprig
        rect(img, cx - 7, oy + fh - 24, cx + 6, oy + fh - 23, THATCH)
        rect(img, cx - 5, oy + fh - 27, cx + 4, oy + fh - 24, THATCH)
        rect(img, cx - 5, oy + fh - 27, cx + 4, oy + fh - 26, THATCH_DK)
        rect(img, cx + 6, oy + fh - 12, cx + 6, oy + fh - 7, GRASS_DK)   # stalk
        px(img, cx + 6, oy + fh - 12, FOOD)
        px(img, cx + 7, oy + fh - 11, FOOD)


HEROES = [
    ("hero_ser_alden", dict(kind="knight", cloak=FLAG, cloak_dk=(52, 80, 130, 255), crest=CLOTH_RED)),
    ("hero_kara_stormblade", dict(kind="rider", cloak=(120, 70, 150, 255), cloak_dk=(84, 48, 108, 255), hair=(60, 42, 30, 255), crest=STEEL_HI)),
    ("hero_mira_goldhand", dict(kind="coin", cloak=(150, 118, 60, 255), cloak_dk=(110, 84, 40, 255), hair=(70, 50, 36, 255), crest=GOLD)),
    ("hero_old_bram", dict(kind="wheat", cloak=(96, 132, 70, 255), cloak_dk=(64, 96, 48, 255), hair=(210, 208, 200, 255), crest=THATCH_DK)),
]


def build_heroes():
    fw = fh = 40
    for name, palette in HEROES:
        img = new(fw, fh)
        draw_hero_portrait(img, 0, 0, fw, fh, palette)
        img = outline_alpha(img)
        save(img, os.path.join(SPR, f"{name}.png"))
        print(f"{name}.png", img.size)


# ===========================================================================
# BACKGROUNDS: 480x270 layers (sky gradient, town field, battlefield).
# ===========================================================================
def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(len(a)))


def blend(img, x, y, c):
    """Alpha-composite a single pixel instead of overwriting it.

    `px` replaces the pixel outright, which is right for solid pixel art but
    wrong for the translucent passes below (haze, glow, foliage speckle) where
    the point is to tint what is already there.
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
    w = img.size[0]
    span = max(1, y1 - y0)
    for y in range(y0, y1 + 1):
        rect(img, 0, y, w - 1, y, lerp(top, bot, (y - y0) / span))


def wrapped_sin(x, w, cycles, phase=0.0):
    """A sine completing a whole number of cycles across the width.

    Backgrounds are drawn at the canvas size but may still be tiled or scrolled,
    so every horizontal wave has to close on itself; an arbitrary period leaves a
    hard seam at the wrap point.
    """
    return math.sin((x / w) * cycles * 2 * math.pi + phase)


def dusk_sky(img, horizon, seed=5):
    """Warm medieval dusk: banded gradient, sun glow, layered cloud decks."""
    w = img.size[0]
    vgrad(img, 0, int(horizon * 0.55), (34, 44, 74, 255), (92, 84, 116, 255))
    vgrad(img, int(horizon * 0.55) + 1, horizon, (92, 84, 116, 255), (206, 142, 104, 255))
    # Low sun sitting just above the horizon, with a wide falloff.
    sun_x, sun_y = int(w * 0.72), int(horizon * 0.86)
    # Fill the glow by scanning the bounding box, not by stepping an angle:
    # a polar sweep leaves unvisited pixels between successive rays and the
    # halo comes out with visible spokes.
    R, SQUASH = 150, 0.6
    for dy in range(-int(R * SQUASH), int(R * SQUASH) + 1):
        for dx in range(-R, R + 1):
            d = math.hypot(dx, dy / SQUASH)
            if d > R:
                continue
            a = int(46 * (1 - d / R) ** 2.2)
            if a >= 1:
                blend(img, sun_x + dx, sun_y + dy, (255, 196, 128, a))
    for dy in range(-17, 18):
        for dx in range(-17, 18):
            d = math.hypot(dx, dy)
            if d <= 15:
                blend(img, sun_x + dx, sun_y + dy, (255, 236, 198, 235))
            elif d <= 17:
                blend(img, sun_x + dx, sun_y + dy, (255, 220, 170, 120))
    # Cloud decks: stretched ellipses, lit underneath by the low sun.
    rnd = random.Random(seed)
    for _ in range(16):
        cx = rnd.randrange(w)
        cy = rnd.randint(int(horizon * 0.12), int(horizon * 0.78))
        rx = rnd.randint(40, 130)
        ry = rnd.randint(5, 13)
        lit = 1.0 - abs(cx - sun_x) / w
        for dy in range(-ry, ry + 1):
            for dx in range(-rx, rx + 1):
                if (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) > 1:
                    continue
                warm = dy > 0
                col = (238, 186, 150) if warm else (176, 168, 190)
                a = int((66 if warm else 52) * (0.5 + 0.5 * lit))
                blend(img, cx + dx, cy + dy, (*col, a))


def hills(img, base_y, height, cycles, phase, colour, seed=1, trees=None):
    """One parallax hill band, filled to the bottom of the frame."""
    w, h = img.size
    rnd = random.Random(seed)
    for x in range(w):
        crest = base_y - int(height * (0.5 + 0.5 * wrapped_sin(x, w, cycles, phase)))
        rect(img, x, crest, x, h - 1, colour)
        blend(img, x, crest, (255, 220, 180, 40))  # sun-caught rim
        if trees is not None and rnd.random() < 0.045:
            th = rnd.randint(5, 11)
            for k in range(th):
                half = max(0, (th - k) // 3)
                rect(img, x - half, crest - th + k, x + half, crest - th + k, trees)


def build_backgrounds():
    # Drawn at the CANVAS size (GameConfig CANVAS 960x540), not half of it. The
    # old 480x270 sheets were tiled twice across the canvas and left a visible
    # seam down the middle of the frame.
    W, H = 960, 540

    # ---------------------------------------------------------------- sky ----
    sky = new(W, H)
    horizon = int(H * 0.66)
    dusk_sky(sky, horizon)
    vgrad(sky, horizon + 1, H - 1, (74, 96, 62, 255), (48, 72, 44, 255))
    hills(sky, horizon + 8, 54, 1.0, 0.7, (58, 70, 78, 255), seed=2)
    hills(sky, horizon + 20, 34, 2.0, 2.6, (62, 88, 62, 255), seed=4, trees=(38, 62, 42, 255))
    save(sky, os.path.join(BG, "sky.png"))

    # --------------------------------------------------------------- town ----
    # The settlement backdrop. Build plots are NOT drawn here: the engine places
    # real building sprites at its own coordinates, and the old blind 3x6 grid of
    # flat dirt rectangles showed through underneath them as stray brown boxes.
    town = new(W, H)
    horizon = int(H * 0.44)
    dusk_sky(town, horizon, seed=9)
    hills(town, horizon + 4, 58, 1.0, 1.4, (54, 66, 76, 255), seed=6)
    hills(town, horizon + 14, 36, 2.0, 3.1, (58, 84, 58, 255), seed=8, trees=(36, 58, 40, 255))

    # A distant walled town on the ridge: curtain wall, roofs, a keep, banners.
    rnd = random.Random(17)
    wall_y = horizon - 6
    rect(town, 0, wall_y, W - 1, horizon, (78, 74, 66, 255))
    for x in range(0, W, 26):
        rect(town, x, wall_y - 5, x + 12, wall_y, (86, 82, 73, 255))
    x = -8
    while x < W:
        bw = rnd.randint(20, 40)
        bh = rnd.randint(14, 34)
        top = wall_y - bh
        rect(town, x, top, x + bw, wall_y, (64, 58, 52, 255))
        pitch = rnd.uniform(0.5, 0.8)
        half = bw / 2.0
        for i in range(bw + 1):
            rise = int((half - abs(i - half)) * pitch)
            if rise > 0:
                rect(town, x + i, top - rise, x + i, top, ROOF_DK)
        for _ in range(rnd.randint(0, 2)):
            wx = x + rnd.randint(3, max(4, bw - 5))
            wy = rnd.randint(top + 3, wall_y - 3)
            for dx in (0, 1):
                for dy in (0, 1):
                    blend(town, wx + dx, wy + dy, (*GOLD[:3], 200))
        x += bw + rnd.randint(3, 10)
    # The keep, taller than the town, with a banner on the tower.
    kx, kw = int(W * 0.46), 66
    ktop = wall_y - 78
    rect(town, kx, ktop, kx + kw, wall_y, (70, 64, 58, 255))
    for tx in (kx - 8, kx + kw - 4):
        rect(town, tx, ktop - 16, tx + 12, wall_y, (78, 72, 64, 255))
        for i in range(6):
            rise = int((6 - i) * 1.4)
            rect(town, tx + i, ktop - 16 - rise, tx + 11 - i, ktop - 16 - rise, ROOF_DK)
    rect(town, kx + kw // 2, ktop - 34, kx + kw // 2 + 1, ktop - 16, (60, 54, 48, 255))
    rect(town, kx + kw // 2 + 2, ktop - 34, kx + kw // 2 + 16, ktop - 27, ROOF)

    # ---- foreground: cultivated fields running back to the town gate ----
    vgrad(town, horizon, H - 1, GRASS, GRASS_DK)
    rnd = random.Random(23)
    # Field strips, alternating crop tone, narrowing with distance.
    y = horizon + 4
    band = 5
    while y < H:
        tone = rnd.choice([(88, 132, 62), (72, 112, 52), (104, 140, 70)])
        for x in range(W):
            wob = int(2 * wrapped_sin(x, W, 2, y * 0.05))
            for dy in range(band):
                blend(town, x, y + dy + wob, (*tone, 130))
        # hedge line between strips
        for x in range(W):
            wob = int(2 * wrapped_sin(x, W, 2, y * 0.05))
            blend(town, x, y + band + wob, (40, 66, 38, 150))
        y += band + 2
        band = int(band * 1.28) + 1
    # Grass speckle, denser in the foreground.
    for _ in range(2600):
        x = rnd.randrange(W)
        gy = rnd.randint(horizon, H - 1)
        near = (gy - horizon) / max(1, H - horizon)
        if rnd.random() > near * 0.9 + 0.1:
            continue
        blend(town, x, gy, (*(rnd.choice([(120, 158, 84), (52, 84, 44)])), rnd.randint(40, 110)))
    # The road up to the gate, per scanline so it narrows into the distance.
    gate_x = kx + kw // 2
    for gy in range(horizon + 2, H):
        t = (gy - horizon) / (H - horizon)
        cx = gate_x + (W * 0.06) * math.sin(t * 1.2) * t
        half = 2 + int(44 * t * t)
        for dx in range(-half, half + 1):
            edge = 1.0 - abs(dx) / max(1, half)
            blend(town, int(cx + dx), gy, (*DIRT[:3], int(225 * (0.45 + 0.55 * edge))))
        blend(town, int(cx - half), gy, (*DIRT_DK[:3], 140))
        blend(town, int(cx + half), gy, (*DIRT_DK[:3], 140))
    save(town, os.path.join(BG, "town.png"))

    # ------------------------------------------------------------- battle ---
    battle = new(W, H)
    horizon = int(H * 0.52)
    dusk_sky(battle, horizon, seed=29)
    hills(battle, horizon + 10, 46, 1.0, 2.2, (52, 64, 74, 255), seed=12)
    vgrad(battle, horizon, H - 1, (122, 106, 76, 255), DIRT_DK)
    rnd = random.Random(37)
    # Churned earth where the lines have met.
    for _ in range(90):
        sx = rnd.randrange(W)
        sy = rnd.randint(horizon + 8, H - 1)
        sw = rnd.randint(12, 54)
        th = rnd.randint(1, 3)
        for k in range(sw):
            for dy in range(th + 1):
                blend(battle, sx + k, sy + dy, (*DIRT_DK[:3], 130))
    for _ in range(700):
        x = rnd.randrange(W)
        gy = rnd.randint(horizon, H - 1)
        blend(battle, x, gy, (*(rnd.choice([(148, 128, 92), (86, 66, 42)])), rnd.randint(40, 110)))

    # The defended wall, standing fully inside the frame with its own shadowed
    # right face so it reads as a structure rather than a sprite cut off at the
    # canvas edge.
    wx, wex = W - 170, W - 18
    wtop = horizon - 122
    rect(battle, wx, wtop, wex, H - 1, STONE)
    for y in range(wtop, H, 26):
        rect(battle, wx, y, wex, y, STONE_DK)
    for bx in range(wx, wex, 42):
        rect(battle, bx, wtop, bx, H - 1, STONE_DK)
    rect(battle, wx, wtop, wx + 1, H - 1, STONE_LT)
    rect(battle, wex - 1, wtop, wex, H - 1, STONE_DK)
    for bx in range(wx, wex - 18, 42):
        rect(battle, bx, wtop - 10, bx + 20, wtop, STONE)
        rect(battle, bx, wtop - 10, bx + 20, wtop - 7, STONE_LT)
    # Banner over the gate.
    gcx = (wx + wex) // 2
    rect(battle, gcx - 26, horizon - 16, gcx + 26, H - 1, WOOD_DK)
    rect(battle, gcx - 26, horizon - 16, gcx + 26, horizon - 10, WOOD)
    for i in range(6):
        rect(battle, gcx - 22 + i * 8, horizon - 10, gcx - 18 + i * 8, H - 1, WOOD)
    rect(battle, gcx - 9, wtop - 4, gcx + 9, wtop + 26, ROOF)
    rect(battle, gcx - 9, wtop + 20, gcx + 9, wtop + 26, ROOF_DK)
    save(battle, os.path.join(BG, "battle.png"))
    for name in ("sky.png", "town.png", "battle.png"):
        path = os.path.join(BG, name)
        img = Image.open(path).convert("RGBA")
        if min(img.getchannel("A").getextrema()) != 255:
            raise SystemExit(f"{name} has translucent pixels; backgrounds must be opaque")
    print("backgrounds: sky.png town.png battle.png", (W, H))


# ===========================================================================
# FX: spark burst + dust puff. 4-frame anims (16x16).
# ===========================================================================
def build_fx():
    fw, frames = 16, 4

    # spark / coin burst (used for resource gain + hits)
    sheet = new(fw * frames, fw)
    for f in range(frames):
        ox = f * fw
        cx, cy = ox + 8, 8
        r = 1 + f * 2
        for a in range(0, 360, 30):
            x = int(cx + r * math.cos(math.radians(a)))
            y = int(cy + r * math.sin(math.radians(a)))
            c = GOLD if f < 2 else FOOD
            px(sheet, x, y, c)
            px(sheet, x, y + 1, GOLD_DK)
    save(sheet, os.path.join(FX, "spark.png"))
    print("fx/spark.png", sheet.size)

    # dust puff
    sheet = new(fw * frames, fw)
    for f in range(frames):
        ox = f * fw
        cx, cy = ox + 8, 11
        r = 2 + f * 2
        for a in range(0, 360, 24):
            x = int(cx + r * math.cos(math.radians(a)))
            y = int(cy + (r // 2) * math.sin(math.radians(a)))
            px(sheet, x, y, (176, 162, 138, 200))
    save(sheet, os.path.join(FX, "dust.png"))
    print("fx/dust.png", sheet.size)


# ===========================================================================
# UI KIT: 9-slice panel, button, bar frame, HUD icon set, resource icon sheet.
# ===========================================================================
def build_ui():
    # panel 9-slice: 24x24 parchment-on-timber
    p = new(24, 24)
    fill = (42, 36, 24, 240)
    border = WOOD
    borderhi = WOOD_LT
    rect(p, 0, 0, 23, 23, fill)
    rect(p, 0, 0, 23, 1, borderhi)
    rect(p, 0, 0, 1, 23, borderhi)
    rect(p, 0, 22, 23, 23, WOOD_DK)
    rect(p, 22, 0, 23, 23, border)
    save(p, os.path.join(UI, "panel.png"))

    # button 9-slice: 24x16
    b = new(24, 16)
    rect(b, 0, 0, 23, 15, WOOD)
    rect(b, 0, 0, 23, 0, WOOD_LT)
    rect(b, 0, 15, 23, 15, WOOD_DK)
    rect(b, 0, 0, 0, 15, WOOD_LT)
    rect(b, 23, 0, 23, 15, WOOD_DK)
    save(b, os.path.join(UI, "button.png"))

    # bar frame: 64x10 (empty), engine draws the fill
    bar = new(64, 10)
    rect(bar, 0, 0, 63, 9, (30, 26, 20, 255))
    rect(bar, 0, 0, 63, 0, WOOD_LT)
    rect(bar, 0, 9, 63, 9, (16, 14, 10, 255))
    save(bar, os.path.join(UI, "bar_frame.png"))

    # HUD icon set: 16x16 x 4 (crown, hourglass, sword, shield)
    ts = 16
    icons = new(ts * 4, ts)
    # crown
    rect(icons, 3, 9, 12, 12, GOLD)
    for x, h in [(3, 4), (7, 6), (11, 4)]:
        rect(icons, x, 9 - h, x + 1, 9, GOLD)
    px(icons, 4, 5, GOLD_DK)
    # hourglass
    ox = ts
    rect(icons, ox + 4, 3, ox + 11, 4, WOOD)
    rect(icons, ox + 4, 12, ox + 11, 13, WOOD)
    for i in range(4):
        px(icons, ox + 5 + i, 5 + i, FOOD)
        px(icons, ox + 5 + i, 11 - i, FOOD)
    # sword
    ox = 2 * ts
    for i in range(9):
        px(icons, ox + 3 + i, 12 - i, STEEL)
        px(icons, ox + 4 + i, 12 - i, STEEL_HI)
    rect(icons, ox + 2, 12, ox + 4, 13, LEATHER)
    # shield
    ox = 3 * ts
    rect(icons, ox + 4, 3, ox + 11, 10, FLAG)
    rect(icons, ox + 5, 10, ox + 10, 12, FLAG)
    px(icons, ox + 7, 13, FLAG)
    rect(icons, ox + 4, 3, ox + 11, 3, STEEL_HI)
    save(icons, os.path.join(UI, "icons.png"))

    # resource icon sheet: 16x16 x 4 (food, wood, stone, gold)
    res = new(ts * 4, ts)
    # food (wheat sheaf)
    for i, x in enumerate((5, 7, 9)):
        rect(res, x, 4, x, 12, GRASS_DK)
        rect(res, x, 3, x, 5, FOOD)
    rect(res, 4, 12, 11, 13, LEATHER)
    # wood (log)
    ox = ts
    rect(res, ox + 3, 6, ox + 12, 10, WOOD)
    rect(res, ox + 3, 6, ox + 12, 6, WOOD_LT)
    rect(res, ox + 3, 10, ox + 12, 10, WOOD_DK)
    px(res, ox + 5, 8, WOOD_DK)
    # stone (block)
    ox = 2 * ts
    rect(res, ox + 4, 5, ox + 12, 12, STONE)
    rect(res, ox + 4, 5, ox + 12, 5, STONE_LT)
    rect(res, ox + 4, 12, ox + 12, 12, STONE_DK)
    rect(res, ox + 8, 5, ox + 8, 12, STONE_DK)
    # gold (coins)
    ox = 3 * ts
    for (cxp, cyp) in [(6, 9), (10, 7), (9, 11)]:
        rect(res, ox + cxp - 2, cyp - 2, ox + cxp + 2, cyp + 2, GOLD)
        px(res, ox + cxp - 2, cyp - 2, GOLD_DK)
        px(res, ox + cxp, cyp, GOLD_DK)
    save(res, os.path.join(UI, "resource_icons.png"))
    print("ui: panel.png button.png bar_frame.png icons.png resource_icons.png")


if __name__ == "__main__":
    build_buildings()
    build_all_characters()
    build_heroes()
    build_backgrounds()
    build_fx()
    build_ui()
    print("\nAll original pixel-art assets generated.")
