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


BUILDINGS = [
    ("town_center", 64, 64, draw_town_center),
    ("farm", 48, 48, draw_farm),
    ("lumber_mill", 48, 48, draw_lumber_mill),
    ("quarry", 48, 48, draw_quarry),
    ("mine", 48, 48, draw_mine),
    ("barracks", 48, 48, draw_barracks),
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
    build_ram()


# ===========================================================================
# BACKGROUNDS: 480x270 layers (sky gradient, town field, battlefield).
# ===========================================================================
def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(len(a)))


def build_backgrounds():
    W, H = 480, 270

    # --- sky (vertical dusk gradient + a few clouds) ---
    sky = new(W, H)
    top = (42, 59, 82, 255)
    bot = (108, 92, 100, 255)
    for y in range(H):
        rect(sky, 0, y, W - 1, y, lerp(top, bot, y / H))
    for (cxp, cyp, r) in [(90, 60, 14), (300, 40, 18), (400, 90, 12)]:
        for dy in range(-r, r):
            for dx in range(-r * 2, r * 2):
                if (dx * dx) / (r * 2 * r * 2) + (dy * dy) / (r * r) < 1:
                    px(sky, cxp + dx, cyp + dy, (200, 176, 168, 150))
    save(sky, os.path.join(BG, "sky.png"))

    # --- town field: grassy ground with a soft horizon + dirt plots ---
    town = new(W, H)
    horizon = int(H * 0.42)
    for y in range(horizon, H):
        t = (y - horizon) / (H - horizon)
        rect(town, 0, y, W - 1, y, lerp(GRASS, GRASS_DK, t))
    # scattered plot squares (build slots hint)
    for gy in range(horizon + 20, H - 20, 46):
        for gx in range(30, W - 30, 70):
            rect(town, gx, gy, gx + 40, gy + 26, DIRT)
            rect(town, gx, gy, gx + 40, gy, DIRT_DK)
    # a winding path
    for x in range(W):
        y = horizon + 10 + int(30 * math.sin(x / 60.0))
        rect(town, x, y, x, y + 6, (150, 128, 92, 255))
    save(town, os.path.join(BG, "town.png"))

    # --- battlefield: trampled ground + a defended gate on the right ---
    battle = new(W, H)
    horizon = int(H * 0.5)
    for y in range(horizon, H):
        t = (y - horizon) / (H - horizon)
        rect(battle, 0, y, W - 1, y, lerp((120, 104, 74, 255), DIRT_DK, t))
    # sky
    for y in range(horizon):
        rect(battle, 0, y, W - 1, y, lerp((60, 66, 84, 255), (110, 98, 96, 255), y / horizon))
    # the defended gate/wall on the right
    wx = W - 70
    rect(battle, wx, horizon - 60, W - 1, H - 1, STONE)
    for y in range(horizon - 60, H, 14):
        rect(battle, wx, y, W - 1, y, STONE_DK)
    for x in range(wx, W, 22):
        rect(battle, x, horizon - 60, x, H - 1, STONE_DK)
    rect(battle, wx, horizon - 60, wx, H - 1, STONE_LT)
    for x in range(wx, W, 22):        # crenellations
        rect(battle, x, horizon - 64, x + 10, horizon - 60, STONE)
    # gate
    rect(battle, W - 34, horizon - 6, W - 12, H - 1, WOOD_DK)
    rect(battle, W - 34, horizon - 6, W - 12, horizon - 4, WOOD)
    save(battle, os.path.join(BG, "battle.png"))
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
    build_backgrounds()
    build_fx()
    build_ui()
    print("\nAll original pixel-art assets generated.")
