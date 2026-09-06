#!/usr/bin/env python3
"""
gen_sprites.py - Original pixel-art asset generator for LAST SQUAD (라스트 스쿼드).

Everything produced by this script is ORIGINAL art authored programmatically for
this project. Nothing is traced, ripped, or derived from any existing IP,
trademark, character, or artwork. LAST SQUAD is an original modern
military-survival lane gate-runner: a small squad of soldiers auto-runs forward
down two lanes, passes through math "gates" that grow/shrink the crowd, auto-
shoots periodic enemy clusters (zombie/survivor style), and faces a boss at the
end of the run. All designs (soldier, enemies, boss, gate panel, road, skyline,
UI kit, FX, icons) are original and role-based.

All output PNGs are nearest-neighbour pixel art on the cohesive modern/military
palette that mirrors PALETTE in src/config/GameConfig.ts (logical portrait
canvas 540x960). Output is deterministic (no RNG / stable ordering).

Compatible with Python 3.9 (no 3.10+ syntax). Uses Pillow only.

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
# Cohesive modern/military-survival palette (RGBA). Mirrors PALETTE in
# src/config/GameConfig.ts: cool steel + asphalt, hazard-amber accent, squad
# teal, enemy red, boss purple, coin gold.
# ---------------------------------------------------------------------------
T = (0, 0, 0, 0)  # transparent


def hexc(v, a=255):
    return ((v >> 16) & 0xFF, (v >> 8) & 0xFF, v & 0xFF, a)


# From PALETTE (GameConfig.ts).
BG_SKY = hexc(0x11151C)
BG_HORIZON = hexc(0x1C2733)
ROAD = hexc(0x2B323C)
ROAD_DARK = hexc(0x1E242C)
LANE_LINE = hexc(0x4A5666)
SQUAD = hexc(0x3FD6C2)
SQUAD_DARK = hexc(0x1F9B8C)
MUZZLE = hexc(0xFFE08A)
ENEMY = hexc(0xD8564B)
ENEMY_DARK = hexc(0x8F322B)
BOSS = hexc(0xB148D8)
BOSS_DARK = hexc(0x7A2F94)
GATE_GOOD = hexc(0x5FD36A)
GATE_BAD = hexc(0xD85466)
PANEL = hexc(0x161B23)
ACCENT = hexc(0xFFB347)
TEXT = hexc(0xF2F5F8)
COIN = hexc(0xFFCF4A)
COIN_DK = hexc(0xC79A2A)

# Derived character shades.
SKIN = (226, 194, 160, 255)
SKIN_SH = (188, 156, 124, 255)
GEAR = (58, 70, 82, 255)          # squad tactical gear (dark steel-blue)
GEAR_LT = (86, 104, 120, 255)
STEEL = (188, 196, 208, 255)
STEEL_HI = (226, 232, 242, 255)
STEEL_DK = (120, 128, 140, 255)
ZOMBIE = (122, 158, 108, 255)     # sickly survivor/zombie green
ZOMBIE_DK = (84, 116, 74, 255)
RAG = (92, 84, 76, 255)           # torn ragged clothing
RAG_DK = (64, 58, 52, 255)
OUTLINE = (14, 17, 22, 255)       # near-BG_SKY dark outline
DARK = (18, 20, 26, 255)


# Ordered id tuples mirrored from GameConfig.ts (kept in sync by hand). The
# generator emits sheet frames in exactly these orders so AssetKeys.ts frame
# indices line up with the pure-logic config.
BUILDING_ORDER = ("hq", "tech_center", "parade_ground", "hospital", "barracks", "drone_center")
RESOURCE_ORDER = ("rations", "steel", "fuel", "circuitry")
HERO_TYPES = ("tank", "missile", "aircraft")
HERO_ROLES = ("dealer", "tank", "support")
HERO_GRADES = ("UR", "SSR", "SR")


def new(w, h):
    return Image.new("RGBA", (w, h), T)


def px(img, x, y, c):
    if 0 <= x < img.width and 0 <= y < img.height:
        img.putpixel((int(x), int(y)), c)


def rect(img, x0, y0, x1, y1, c):
    if x1 < x0:
        x0, x1 = x1, x0
    if y1 < y0:
        y0, y1 = y1, y0
    for y in range(int(y0), int(y1) + 1):
        for x in range(int(x0), int(x1) + 1):
            px(img, x, y, c)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(len(a)))


def blend(img, x, y, c):
    """Alpha-composite color c over existing pixel."""
    x, y = int(x), int(y)
    if not (0 <= x < img.width and 0 <= y < img.height):
        return
    base = img.getpixel((x, y))
    ca = c[3] / 255.0
    if ca >= 1.0:
        img.putpixel((x, y), c)
        return
    ba = base[3] / 255.0
    out_a = ca + ba * (1 - ca)
    if out_a <= 0:
        img.putpixel((x, y), T)
        return
    out = tuple(
        int((c[i] * ca + base[i] * ba * (1 - ca)) / out_a) for i in range(3)
    )
    img.putpixel((x, y), (out[0], out[1], out[2], int(out_a * 255)))


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
# SQUAD SOLDIER: a small chibi trooper facing "up" (running forward, away from
# camera) so many fit in a marching crowd. 2-frame run cycle. 16x20 frame.
# ===========================================================================
def draw_soldier(img, ox, oy, fw, fh, step):
    cx = ox + fw // 2
    ground = oy + fh - 1
    swing = 1 if step == 1 else -1

    # boots / legs (seen from behind, slight stride)
    rect(img, cx - 3, oy + fh - 6, cx - 1, ground, GEAR)
    rect(img, cx + 1, oy + fh - 6, cx + 3, ground, GEAR)
    px(img, cx - 3, ground + max(0, -swing) - 1, DARK)
    rect(img, cx - 3, ground - 1 + (1 if swing > 0 else 0), cx - 1, ground, DARK)
    rect(img, cx + 1, ground - 1 + (1 if swing < 0 else 0), cx + 3, ground, DARK)

    # torso / tactical vest (teal squad accent stripe)
    rect(img, cx - 4, oy + fh - 13, cx + 3, oy + fh - 6, GEAR)
    rect(img, cx - 4, oy + fh - 13, cx - 4, oy + fh - 6, GEAR_LT)
    rect(img, cx - 3, oy + fh - 11, cx + 2, oy + fh - 10, SQUAD)     # squad stripe
    px(img, cx + 3, oy + fh - 12, SQUAD_DARK)

    # backpack
    rect(img, cx - 2, oy + fh - 12, cx + 1, oy + fh - 8, GEAR_LT)
    px(img, cx, oy + fh - 11, SQUAD)

    # arms holding a rifle forward
    rect(img, cx - 5, oy + fh - 12, cx - 4, oy + fh - 9, GEAR)
    rect(img, cx + 4, oy + fh - 12, cx + 5, oy + fh - 9, GEAR)
    # rifle pointing forward (up)
    rect(img, cx + 4, oy + fh - 18, cx + 5, oy + fh - 11, STEEL_DK)
    px(img, cx + 4, oy + fh - 19, STEEL)

    # head + helmet (teal-banded combat helmet)
    rect(img, cx - 3, oy + fh - 19, cx + 2, oy + fh - 14, SKIN_SH)  # neck/back of head
    rect(img, cx - 4, oy + fh - 20, cx + 3, oy + fh - 17, GEAR_LT)  # helmet
    rect(img, cx - 4, oy + fh - 20, cx + 3, oy + fh - 20, STEEL_DK)
    rect(img, cx - 4, oy + fh - 17, cx + 3, oy + fh - 17, SQUAD)    # helmet band


def build_soldier():
    fw, fh = 16, 20
    sheet = new(fw * 2, fh)
    for step in (0, 1):
        draw_soldier(sheet, step * fw, 0, fw, fh, step)
    sheet = outline_alpha(sheet)
    save(sheet, os.path.join(SPR, "soldier.png"))
    print("soldier.png", sheet.size)


# ===========================================================================
# ENEMIES: zombie/survivor units shambling toward the camera (facing "down").
# walker = slow bulky; runner = lean fast. 2-frame sheets, 16x20 frame.
# ===========================================================================
def draw_enemy(img, ox, oy, fw, fh, step, lean):
    cx = ox + fw // 2
    ground = oy + fh - 1
    swing = 1 if step == 1 else -1
    body = ENEMY if lean else ZOMBIE
    body_dk = ENEMY_DARK if lean else ZOMBIE_DK
    width = 3 if lean else 4

    # legs / stagger
    rect(img, cx - width, oy + fh - 6, cx - 1, ground, RAG)
    rect(img, cx + 1, oy + fh - 6, cx + width, ground, RAG)
    rect(img, cx - width + swing, ground - 1, cx - 1 + swing, ground, RAG_DK)
    rect(img, cx + 1 - swing, ground - 1, cx + width - swing, ground, RAG_DK)

    # torso: ragged survivor
    rect(img, cx - width - 1, oy + fh - 13, cx + width, oy + fh - 6, RAG)
    rect(img, cx - width - 1, oy + fh - 13, cx - width - 1, oy + fh - 6, RAG_DK)
    # exposed sickly skin patch
    rect(img, cx - 1, oy + fh - 12, cx + 1, oy + fh - 9, body)
    px(img, cx, oy + fh - 10, body_dk)

    # outstretched arms (reaching forward)
    ar = oy + fh - 12 + (1 if step == 1 else 0)
    rect(img, cx - width - 2, ar, cx - width - 1, ar + 3, body)
    rect(img, cx + width + 1, ar, cx + width + 2, ar + 3, body)

    # head (sickly, glowing eyes)
    rect(img, cx - 2, oy + fh - 19, cx + 2, oy + fh - 13, body)
    rect(img, cx - 2, oy + fh - 19, cx + 2, oy + fh - 19, body_dk)
    px(img, cx - 1, oy + fh - 16, ACCENT if not lean else MUZZLE)  # eyes
    px(img, cx + 1, oy + fh - 16, ACCENT if not lean else MUZZLE)
    if lean:
        px(img, cx, oy + fh - 20, body_dk)  # spiky hair tuft


def build_enemy(name, lean):
    fw, fh = 16, 20
    sheet = new(fw * 2, fh)
    for step in (0, 1):
        draw_enemy(sheet, step * fw, 0, fw, fh, step, lean)
    sheet = outline_alpha(sheet)
    save(sheet, os.path.join(SPR, name + ".png"))
    print(name + ".png", sheet.size)


# ===========================================================================
# BOSS: a hulking armored survivor-brute. Large, 2-frame idle/attack. 64x72.
# ===========================================================================
def draw_boss(img, ox, oy, fw, fh, step):
    cx = ox + fw // 2
    ground = oy + fh - 2
    lift = 1 if step == 1 else 0

    # heavy legs
    rect(img, cx - 16, oy + fh - 22, cx - 4, ground, BOSS_DARK)
    rect(img, cx + 4, oy + fh - 22, cx + 16, ground, BOSS_DARK)
    rect(img, cx - 18, ground - 3, cx - 3, ground, DARK)  # boots
    rect(img, cx + 3, ground - 3, cx + 18, ground, DARK)

    # massive torso / plated armor
    rect(img, cx - 22, oy + 24 - lift, cx + 22, oy + fh - 20, BOSS)
    rect(img, cx - 22, oy + 24 - lift, cx - 22, oy + fh - 20, BOSS_DARK)
    rect(img, cx + 22, oy + 24 - lift, cx + 22, oy + fh - 20, BOSS_DARK)
    # armor plating lines
    for y in range(oy + 30, oy + fh - 22, 8):
        rect(img, cx - 20, y, cx + 20, y, BOSS_DARK)
    # chest hazard emblem (amber)
    rect(img, cx - 6, oy + 34, cx + 6, oy + 46, ACCENT)
    rect(img, cx - 3, oy + 34, cx + 3, oy + 46, BOSS_DARK)
    rect(img, cx - 6, oy + 39, cx + 6, oy + 41, BOSS_DARK)

    # shoulder pauldrons (huge)
    rect(img, cx - 30, oy + 22 - lift, cx - 20, oy + 34 - lift, STEEL_DK)
    rect(img, cx + 20, oy + 22 - lift, cx + 30, oy + 34 - lift, STEEL_DK)
    rect(img, cx - 30, oy + 22 - lift, cx - 20, oy + 24 - lift, STEEL)
    rect(img, cx + 20, oy + 22 - lift, cx + 30, oy + 24 - lift, STEEL)

    # arms + heavy fists
    rect(img, cx - 30, oy + 34 - lift, cx - 24, oy + fh - 26, BOSS)
    rect(img, cx + 24, oy + 34 - lift, cx + 30, oy + fh - 26, BOSS)
    rect(img, cx - 32, oy + fh - 28, cx - 22, oy + fh - 20, STEEL_DK)  # fist
    rect(img, cx + 22, oy + fh - 28, cx + 32, oy + fh - 20, STEEL_DK)

    # head + menacing helm
    rect(img, cx - 10, oy + 6 - lift, cx + 10, oy + 24 - lift, BOSS)
    rect(img, cx - 10, oy + 6 - lift, cx + 10, oy + 8 - lift, BOSS_DARK)
    rect(img, cx - 12, oy + 4 - lift, cx - 8, oy + 10 - lift, STEEL_DK)  # horn
    rect(img, cx + 8, oy + 4 - lift, cx + 12, oy + 10 - lift, STEEL_DK)  # horn
    # glowing eye visor
    rect(img, cx - 7, oy + 14 - lift, cx + 7, oy + 17 - lift, DARK)
    rect(img, cx - 6, oy + 15 - lift, cx - 2, oy + 16 - lift, ENEMY)
    rect(img, cx + 2, oy + 15 - lift, cx + 6, oy + 16 - lift, ENEMY)


def build_boss():
    fw, fh = 64, 72
    sheet = new(fw * 2, fh)
    for step in (0, 1):
        draw_boss(sheet, step * fw, 0, fw, fh, step)
    sheet = outline_alpha(sheet)
    save(sheet, os.path.join(SPR, "boss.png"))
    print("boss.png", sheet.size)


# ===========================================================================
# GATE PANEL: a neutral holographic gate frame the scene tints (good/bad) and
# labels ("x2", "+10", ...). Single image, 96x120. Glassy translucent slab with
# a bright top/bottom bar and corner brackets.
# ===========================================================================
def build_gate():
    w, h = 96, 120
    img = new(w, h)
    # translucent glass fill
    for y in range(h):
        t = y / h
        c = lerp((236, 240, 245), (200, 214, 224), t)
        rect(img, 2, y, w - 3, y, (c[0], c[1], c[2], 70))
    # inner faint vertical scanlines
    for x in range(6, w - 6, 6):
        rect(img, x, 6, x, h - 7, (255, 255, 255, 26))
    # bright frame edges (top + bottom emphasis bars)
    rect(img, 0, 0, w - 1, 5, (255, 255, 255, 230))
    rect(img, 0, h - 6, w - 1, h - 1, (255, 255, 255, 230))
    rect(img, 0, 0, 2, h - 1, (255, 255, 255, 150))
    rect(img, w - 3, 0, w - 1, h - 1, (255, 255, 255, 150))
    # corner brackets (crisp, opaque)
    L = 16
    for (bx, by, dx, dy) in [(0, 0, 1, 1), (w - 1, 0, -1, 1),
                             (0, h - 1, 1, -1), (w - 1, h - 1, -1, -1)]:
        for i in range(L):
            px(img, bx + dx * i, by, (255, 255, 255, 255))
            px(img, bx, by + dy * i, (255, 255, 255, 255))
            px(img, bx + dx * i, by + dy, (255, 255, 255, 200))
            px(img, bx + dx, by + dy * i, (255, 255, 255, 200))
    img.save(os.path.join(SPR, "gate.png"))
    print("gate.png", img.size)


# ===========================================================================
# BACKGROUNDS
#   skyline.png  : distant night skyline (static, drawn behind the road) 540x480
#   road.png     : seamless vertically-tiling 2-lane asphalt strip 540x270
# ===========================================================================
def build_backgrounds():
    # --- distant skyline (dusk/night, teal-lit ruined city) ---
    W, H = 540, 480
    sky = new(W, H)
    for y in range(H):
        rect(sky, 0, y, W - 1, y, lerp(BG_SKY, BG_HORIZON, (y / H) ** 0.7))
    # a few stars
    for i in range(60):
        x = (i * 97 + 13) % W
        y = (i * 53 + 7) % (H // 2)
        px(sky, x, y, (200, 210, 230, 160))
    # distant building silhouettes across the horizon band
    horizon = int(H * 0.62)
    seed = 12345
    x = 0
    idx = 0
    while x < W:
        seed = (seed * 1103515245 + 12345) & 0x7FFFFFFF
        bw = 24 + (seed >> 5) % 46
        seed = (seed * 1103515245 + 12345) & 0x7FFFFFFF
        bh = 60 + (seed >> 5) % 180
        top = horizon - bh
        shade = lerp(BG_SKY, BG_HORIZON, 0.35 + 0.4 * ((idx % 3) / 2.0))
        rect(sky, x, top, min(W - 1, x + bw - 1), horizon, shade)
        # lit windows (teal / amber)
        for wy in range(top + 4, horizon - 3, 8):
            for wx in range(x + 3, x + bw - 3, 7):
                seed = (seed * 1103515245 + 12345) & 0x7FFFFFFF
                if (seed >> 6) % 5 == 0:
                    col = SQUAD if (seed >> 3) % 2 == 0 else ACCENT
                    px(sky, wx, wy, (col[0], col[1], col[2], 200))
        x += bw + 2
        idx += 1
    # ground haze at the base
    for y in range(horizon, H):
        t = (y - horizon) / (H - horizon)
        rect(sky, 0, y, W - 1, y, lerp(BG_HORIZON, ROAD_DARK, t))
    sky.save(os.path.join(BG, "skyline.png"))
    print("backgrounds/skyline.png", sky.size)

    # --- road tile: seamless vertical tile, full canvas width, 2 lanes ---
    RW, RH = 540, 270
    road = new(RW, RH)
    rect(road, 0, 0, RW - 1, RH - 1, ROAD)
    # subtle asphalt speckle (deterministic hash, seamless: no top/bottom edge fx)
    for y in range(RH):
        for x in range(0, RW, 2):
            hsh = (x * 374761393 + y * 668265263) & 0xFFFFFFFF
            hsh = (hsh ^ (hsh >> 13)) & 0xFF
            if hsh < 40:
                shade = lerp(ROAD, ROAD_DARK, 0.5)
                px(road, x, y, shade)
            elif hsh > 232:
                shade = lerp(ROAD, LANE_LINE, 0.25)
                px(road, x, y, shade)
    # road shoulders (darker gutters)
    rect(road, 0, 0, 10, RH - 1, ROAD_DARK)
    rect(road, RW - 11, 0, RW - 1, RH - 1, ROAD_DARK)
    rect(road, 11, 0, 12, RH - 1, LANE_LINE)
    rect(road, RW - 13, 0, RW - 12, RH - 1, LANE_LINE)
    # centre lane divider: dashed line (seamless: dash period divides RH)
    cx = RW // 2
    dash = 30  # RH(270) / 30 = 9 dashes -> seamless
    for y in range(0, RH):
        if (y % dash) < dash // 2:
            rect(road, cx - 2, y, cx + 1, y, LANE_LINE)
    # faint per-lane guide lines
    for frac in (0.3, 0.7):
        lx = int(RW * frac)
        for y in range(0, RH, dash):
            rect(road, lx, y + 6, lx, y + 12, lerp(ROAD, LANE_LINE, 0.4))
    road.save(os.path.join(BG, "road.png"))
    print("backgrounds/road.png", road.size)


# ===========================================================================
# FX: 4-frame anim sheets, 16x16 frames.
#   muzzle.png  : muzzle-flash spark (auto-fire)
#   hit.png     : impact puff (enemy struck)
#   sparkle.png : level-up / squad-grows sparkle
# ===========================================================================
def build_fx():
    fw, frames = 16, 4

    # muzzle flash: bright star that flares then fades
    sheet = new(fw * frames, fw)
    for f in range(frames):
        ox = f * fw
        cx, cy = ox + 8, 8
        r = 2 + f
        a = int(255 * (1 - f / frames))
        for ang in range(0, 360, 24):
            x = cx + r * math.cos(math.radians(ang))
            y = cy + r * math.sin(math.radians(ang))
            blend(sheet, x, y, (MUZZLE[0], MUZZLE[1], MUZZLE[2], a))
        rect(sheet, cx - 1, cy - 1, cx + 1, cy + 1, (255, 255, 255, a))
        # vertical flash streak
        rect(sheet, cx, cy - r - 1, cx, cy - 1, (MUZZLE[0], MUZZLE[1], MUZZLE[2], a))
    save(sheet, os.path.join(FX, "muzzle.png"))
    print("fx/muzzle.png", sheet.size)

    # hit puff: expanding red-tinged smoke ring
    sheet = new(fw * frames, fw)
    for f in range(frames):
        ox = f * fw
        cx, cy = ox + 8, 8
        r = 2 + f * 2
        a = int(220 * (1 - f / frames))
        for ang in range(0, 360, 18):
            x = cx + r * math.cos(math.radians(ang))
            y = cy + (r * 0.8) * math.sin(math.radians(ang))
            col = ENEMY if f < 2 else (150, 140, 132, 255)
            blend(sheet, x, y, (col[0], col[1], col[2], a))
    save(sheet, os.path.join(FX, "hit.png"))
    print("fx/hit.png", sheet.size)

    # level-up sparkle: teal/gold rising twinkle
    sheet = new(fw * frames, fw)
    for f in range(frames):
        ox = f * fw
        cx = ox + 8
        cy = 12 - f * 2  # rises
        a = int(255 * (1 - (f / frames) * 0.6))
        col = SQUAD if f % 2 == 0 else COIN
        # four-point twinkle
        rect(sheet, cx, cy - 3, cx, cy + 3, (col[0], col[1], col[2], a))
        rect(sheet, cx - 3, cy, cx + 3, cy, (col[0], col[1], col[2], a))
        px(sheet, cx, cy, (255, 255, 255, a))
        # small satellite sparkles
        blend(sheet, cx - 4 - f, cy - 2, (COIN[0], COIN[1], COIN[2], a))
        blend(sheet, cx + 4 + f, cy + 2, (SQUAD[0], SQUAD[1], SQUAD[2], a))
    save(sheet, os.path.join(FX, "sparkle.png"))
    print("fx/sparkle.png", sheet.size)


# ===========================================================================
# UI KIT
#   panel.png     : 9-slice dark HUD panel, 24x24
#   button.png    : 9-slice button, 24x16
#   bar_frame.png : empty progress-bar frame, 64x12
#   icons.png     : 16x16 x 4 HUD icon sheet (coin, distance, squad, boss)
# ===========================================================================
def build_ui():
    # panel 9-slice: dark tactical glass with amber corner accents
    p = new(24, 24)
    rect(p, 0, 0, 23, 23, (PANEL[0], PANEL[1], PANEL[2], 236))
    rect(p, 0, 0, 23, 0, GEAR_LT)          # top highlight
    rect(p, 0, 0, 0, 23, GEAR_LT)
    rect(p, 0, 23, 23, 23, DARK)           # bottom shadow
    rect(p, 23, 0, 23, 23, DARK)
    # amber corner brackets
    for (bx, by, dx, dy) in [(0, 0, 1, 1), (23, 0, -1, 1), (0, 23, 1, -1), (23, 23, -1, -1)]:
        for i in range(4):
            px(p, bx + dx * i, by, ACCENT)
            px(p, bx, by + dy * i, ACCENT)
    save(p, os.path.join(UI, "panel.png"))

    # button 9-slice: teal squad accent
    b = new(24, 16)
    rect(b, 0, 0, 23, 15, SQUAD_DARK)
    rect(b, 1, 1, 22, 7, SQUAD)            # top gradient
    rect(b, 0, 0, 23, 0, SQUAD)
    rect(b, 0, 15, 23, 15, DARK)
    rect(b, 0, 0, 0, 15, SQUAD)
    rect(b, 23, 0, 23, 15, SQUAD_DARK)
    save(b, os.path.join(UI, "button.png"))

    # bar frame: 64x12 empty (engine draws the fill)
    bar = new(64, 12)
    rect(bar, 0, 0, 63, 11, (DARK[0], DARK[1], DARK[2], 255))
    rect(bar, 1, 1, 62, 10, (PANEL[0], PANEL[1], PANEL[2], 255))
    rect(bar, 0, 0, 63, 0, GEAR_LT)
    rect(bar, 0, 11, 63, 11, DARK)
    save(bar, os.path.join(UI, "bar_frame.png"))

    # HUD icon sheet: 16x16 x 4 -> coin, distance(flag), squad(people), boss(skull)
    ts = 16
    icons = new(ts * 4, ts)

    # 0: coin
    ox = 0
    for dy in range(-4, 5):
        for dx in range(-4, 5):
            if dx * dx + dy * dy <= 16:
                icons.putpixel((ox + 8 + dx, 8 + dy), COIN)
    for dy in range(-4, 5):
        for dx in range(-4, 5):
            if dx * dx + dy * dy > 12 and dx * dx + dy * dy <= 16:
                icons.putpixel((ox + 8 + dx, 8 + dy), COIN_DK)
    rect(icons, ox + 7, 5, ox + 8, 11, COIN_DK)   # engraved "1"-ish mark
    px(icons, ox + 6, 6, COIN_DK)

    # 1: distance (checkered finish flag on a pole)
    ox = ts
    rect(icons, ox + 4, 2, ox + 4, 14, STEEL_DK)  # pole
    for yy in range(3, 9):
        for xx in range(5, 12):
            on = ((xx - 5) // 2 + (yy - 3) // 2) % 2 == 0
            icons.putpixel((ox + xx, yy), TEXT if on else DARK)

    # 2: squad (three little heads = crowd)
    ox = 2 * ts
    for (hx, hy) in [(5, 6), (10, 6), (7, 10)]:
        rect(icons, ox + hx - 1, hy - 2, ox + hx + 1, hy, SQUAD)      # head
        rect(icons, ox + hx - 2, hy + 1, ox + hx + 2, hy + 3, SQUAD_DARK)  # body

    # 3: boss (skull warning)
    ox = 3 * ts
    rect(icons, ox + 4, 4, ox + 11, 10, BOSS)
    rect(icons, ox + 5, 10, ox + 10, 12, BOSS)
    rect(icons, ox + 6, 6, ox + 7, 8, DARK)   # eye
    rect(icons, ox + 9, 6, ox + 10, 8, DARK)  # eye
    rect(icons, ox + 6, 11, ox + 6, 12, BOSS_DARK)  # teeth
    rect(icons, ox + 8, 11, ox + 8, 12, BOSS_DARK)
    rect(icons, ox + 10, 11, ox + 10, 12, BOSS_DARK)
    save(icons, os.path.join(UI, "icons.png"))
    print("ui: panel.png button.png bar_frame.png icons.png")


# ===========================================================================
# BASE / META ART (FEAT-005): building icons, resource icons, hero portraits
# by type x role with grade frames, type/role badges, a battle stage backdrop,
# and the bottom-nav / tab UI kit (tab bar, star, medal). All ORIGINAL and
# role-based; deterministic (no RNG). Frame sizes are documented in
# src/config/AssetKeys.ts and MUST match the sizes emitted here.
# ===========================================================================

# Resource accent colours (original, cohesive with PALETTE). Ordered to match
# RESOURCE_ORDER in GameConfig.ts: rations, steel, fuel, circuitry.
RATIONS = (198, 156, 92, 255)      # ration-tin bronze/khaki
RATIONS_DK = (150, 112, 60, 255)
STEEL_RES = (170, 182, 196, 255)   # steel ingot grey
STEEL_RES_DK = (112, 124, 138, 255)
FUEL = (214, 150, 70, 255)         # fuel amber
FUEL_DK = (150, 96, 40, 255)
CIRCUIT = (96, 196, 168, 255)      # circuitry teal-green
CIRCUIT_DK = (52, 132, 112, 255)

# Grade frame colours (UR gold, SSR purple, SR steel-blue).
GRADE_UR = (255, 207, 74, 255)
GRADE_UR_DK = (199, 154, 42, 255)
GRADE_SSR = (177, 72, 216, 255)
GRADE_SSR_DK = (122, 47, 148, 255)
GRADE_SR = (110, 150, 200, 255)
GRADE_SR_DK = (66, 96, 140, 255)


# ---------------------------------------------------------------------------
# BUILDING ICONS: a 24x24-per-frame sheet, one frame per building in
# BUILDING_ORDER: hq, tech_center, parade_ground, hospital, barracks,
# drone_center. Each is an original flat/isometric-lite structure silhouette on
# a rounded tile, distinguished by shape + an accent motif.
# ---------------------------------------------------------------------------
def _tile(img, ox, oy, s, base, edge):
    """Rounded dark plot tile the building sits on."""
    rect(img, ox + 2, oy + 2, ox + s - 3, oy + s - 3, base)
    rect(img, ox + 2, oy + 2, ox + s - 3, oy + 2, edge)          # top hi
    rect(img, ox + 2, oy + s - 3, ox + s - 3, oy + s - 3, DARK)  # bottom sh
    # clip the four corners for a rounded look
    for (cx0, cy0) in [(ox + 2, oy + 2), (ox + s - 3, oy + 2),
                       (ox + 2, oy + s - 3), (ox + s - 3, oy + s - 3)]:
        px(img, cx0, cy0, T)


def draw_building(img, ox, oy, s, kind):
    base = PANEL
    edge = GEAR_LT
    _tile(img, ox, oy, s, base, edge)
    cx = ox + s // 2

    if kind == "hq":
        # central command tower with a squad-teal beacon + flag
        rect(img, cx - 5, oy + 8, cx + 4, oy + 20, GEAR)
        rect(img, cx - 5, oy + 8, cx - 5, oy + 20, GEAR_LT)
        rect(img, cx + 4, oy + 8, cx + 4, oy + 20, DARK)
        for wy in range(oy + 11, oy + 19, 3):
            rect(img, cx - 3, wy, cx + 2, wy, SQUAD_DARK)
        rect(img, cx - 1, oy + 4, cx, oy + 8, STEEL_DK)      # mast
        rect(img, cx, oy + 4, cx + 4, oy + 6, SQUAD)         # flag
        px(img, cx - 1, oy + 3, ACCENT)                      # beacon

    elif kind == "tech_center":
        # domed research lab with a circuitry dish
        rect(img, cx - 5, oy + 12, cx + 4, oy + 20, GEAR)
        for yy in range(oy + 8, oy + 12):
            w = (yy - (oy + 8)) + 2
            rect(img, cx - w, yy, cx - 1 + w, yy, GEAR_LT)   # dome
        rect(img, cx - 2, oy + 9, cx + 1, oy + 11, CIRCUIT)  # window glow
        rect(img, cx + 3, oy + 5, cx + 5, oy + 9, STEEL_DK)  # dish arm
        rect(img, cx + 4, oy + 4, cx + 6, oy + 6, CIRCUIT)   # dish

    elif kind == "parade_ground":
        # open training yard: fenced field with marching lane markers
        rect(img, cx - 6, oy + 9, cx + 5, oy + 20, ROAD)
        rect(img, cx - 6, oy + 9, cx + 5, oy + 9, GATE_GOOD)  # top rail
        rect(img, cx - 6, oy + 20, cx + 5, oy + 20, DARK)
        for lx in range(cx - 4, cx + 5, 3):
            for ly in range(oy + 11, oy + 20, 2):
                px(img, lx, ly, LANE_LINE)
        rect(img, cx - 1, oy + 6, cx, oy + 9, STEEL_DK)      # flagpole
        rect(img, cx, oy + 6, cx + 3, oy + 8, SQUAD)         # banner

    elif kind == "hospital":
        # aid station with a white/green cross
        rect(img, cx - 5, oy + 8, cx + 4, oy + 20, STEEL_RES)
        rect(img, cx - 5, oy + 8, cx - 5, oy + 20, STEEL_HI)
        rect(img, cx + 4, oy + 8, cx + 4, oy + 20, STEEL_RES_DK)
        rect(img, cx - 1, oy + 10, cx, oy + 18, GATE_GOOD)   # cross V
        rect(img, cx - 4, oy + 13, cx + 3, oy + 14, GATE_GOOD)  # cross H

    elif kind == "barracks":
        # long quonset hut with a door + steel roof ridges
        for yy in range(oy + 9, oy + 13):
            w = 7 - (yy - (oy + 9))
            rect(img, cx - w, yy, cx - 1 + w, yy, STEEL_DK)  # arched roof
        rect(img, cx - 6, oy + 13, cx + 5, oy + 20, GEAR)
        rect(img, cx - 1, oy + 15, cx, oy + 20, GEAR_LT)     # door
        rect(img, cx - 5, oy + 15, cx - 3, oy + 17, STEEL_RES)  # window
        rect(img, cx + 2, oy + 15, cx + 4, oy + 17, STEEL_RES)

    elif kind == "drone_center":
        # landing pad with a rising quad-drone
        rect(img, cx - 6, oy + 16, cx + 5, oy + 20, ROAD_DARK)
        rect(img, cx - 3, oy + 17, cx + 2, oy + 19, ACCENT)  # pad "H"
        rect(img, cx - 1, oy + 17, cx, oy + 19, ROAD_DARK)
        rect(img, cx - 4, oy + 10, cx + 3, oy + 11, STEEL_DK)  # drone arms
        rect(img, cx - 1, oy + 9, cx, oy + 12, GEAR_LT)      # body
        px(img, cx, oy + 10, FUEL)                            # rotor lights
        for rx in (cx - 5, cx + 4):
            px(img, rx, oy + 9, SQUAD)


def build_buildings():
    s, n = 24, len(BUILDING_ORDER)
    sheet = new(s * n, s)
    for i, kind in enumerate(BUILDING_ORDER):
        draw_building(sheet, i * s, 0, s, kind)
    save(sheet, os.path.join(UI, "buildings.png"))
    print("ui/buildings.png", sheet.size, list(BUILDING_ORDER))


# ---------------------------------------------------------------------------
# RESOURCE ICONS: 16x16-per-frame sheet, one frame per resource in
# RESOURCE_ORDER: rations, steel, fuel, circuitry.
# ---------------------------------------------------------------------------
def draw_resource(img, ox, oy, kind):
    cx, cy = ox + 8, 8
    if kind == "rations":
        # ration tin / crate
        rect(img, ox + 3, oy + 5, ox + 12, oy + 13, RATIONS)
        rect(img, ox + 3, oy + 5, ox + 12, oy + 5, (238, 206, 150, 255))
        rect(img, ox + 3, oy + 13, ox + 12, oy + 13, RATIONS_DK)
        rect(img, ox + 3, oy + 8, ox + 12, oy + 9, RATIONS_DK)   # label band
        px(img, ox + 7, oy + 8, ACCENT)
        px(img, ox + 8, oy + 9, ACCENT)
    elif kind == "steel":
        # stacked steel ingots
        rect(img, ox + 3, oy + 9, ox + 12, oy + 12, STEEL_RES)
        rect(img, ox + 3, oy + 9, ox + 12, oy + 9, STEEL_HI)
        rect(img, ox + 3, oy + 12, ox + 12, oy + 12, STEEL_RES_DK)
        rect(img, ox + 5, oy + 5, ox + 10, oy + 8, STEEL_RES)
        rect(img, ox + 5, oy + 5, ox + 10, oy + 5, STEEL_HI)
        rect(img, ox + 5, oy + 8, ox + 10, oy + 8, STEEL_RES_DK)
    elif kind == "fuel":
        # fuel canister with a spout + flame accent
        rect(img, ox + 4, oy + 5, ox + 11, oy + 13, FUEL)
        rect(img, ox + 4, oy + 5, ox + 4, oy + 13, (238, 182, 104, 255))
        rect(img, ox + 11, oy + 5, ox + 11, oy + 13, FUEL_DK)
        rect(img, ox + 5, oy + 3, ox + 7, oy + 5, FUEL_DK)       # spout
        rect(img, ox + 7, oy + 7, ox + 8, oy + 11, FUEL_DK)      # seam
        px(img, ox + 9, oy + 8, MUZZLE)
    elif kind == "circuitry":
        # circuit chip with legs + trace
        rect(img, ox + 4, oy + 5, ox + 11, oy + 12, CIRCUIT_DK)
        rect(img, ox + 5, oy + 6, ox + 10, oy + 11, CIRCUIT)
        for lx in range(ox + 5, ox + 11, 2):
            px(img, lx, oy + 4, STEEL_DK)                        # top legs
            px(img, lx, oy + 13, STEEL_DK)                       # bottom legs
        rect(img, ox + 6, oy + 8, ox + 9, oy + 8, CIRCUIT_DK)    # trace
        px(img, ox + 8, oy + 7, TEXT)


def build_resources():
    s, n = 16, len(RESOURCE_ORDER)
    sheet = new(s * n, s)
    for i, kind in enumerate(RESOURCE_ORDER):
        draw_resource(sheet, i * s, 0, kind)
    sheet = outline_alpha(sheet)
    save(sheet, os.path.join(UI, "resources.png"))
    print("ui/resources.png", sheet.size, list(RESOURCE_ORDER))


# ---------------------------------------------------------------------------
# HERO PORTRAITS: a 32x32-per-frame sheet of 9 frames = 3 TYPES x 3 ROLES, laid
# out row-major in HERO_TYPES x HERO_ROLES order (tank/missile/aircraft x
# dealer/tank/support). Each portrait is an ORIGINAL helmeted trooper bust whose
# TYPE sets the palette + a type emblem, and whose ROLE sets the silhouette
# (dealer = visor + shoulder cannon, tank = heavy pauldrons + faceplate,
# support = headset + medic satchel). No third-party likeness.
# ---------------------------------------------------------------------------
HERO_TYPE_COLORS = {
    "tank": (108, 132, 156, 255),      # steel-blue armour
    "missile": (196, 96, 84, 255),     # warm rust-red
    "aircraft": (96, 168, 176, 255),   # sky teal
}
HERO_TYPE_COLORS_DK = {
    "tank": (66, 84, 104, 255),
    "missile": (132, 58, 50, 255),
    "aircraft": (56, 108, 116, 255),
}


def draw_hero_portrait(img, ox, oy, s, htype, role):
    body = HERO_TYPE_COLORS[htype]
    body_dk = HERO_TYPE_COLORS_DK[htype]
    cx = ox + s // 2
    # backdrop vignette (dark, type-tinted)
    for y in range(s):
        t = y / s
        c = lerp(PANEL, body_dk, 0.25 + 0.25 * t)
        rect(img, ox + 2, oy + y, ox + s - 3, oy + y, (c[0], c[1], c[2], 255))

    # shoulders / chest armour
    rect(img, cx - 9, oy + 24, cx + 8, oy + s - 3, body)
    rect(img, cx - 9, oy + 24, cx - 9, oy + s - 3, body_dk)
    rect(img, cx + 8, oy + 24, cx + 8, oy + s - 3, body_dk)
    rect(img, cx - 4, oy + 26, cx + 3, oy + 28, SQUAD)          # collar accent

    # head + helmet
    rect(img, cx - 5, oy + 9, cx + 4, oy + 22, SKIN)
    rect(img, cx - 5, oy + 9, cx + 4, oy + 13, body)            # helmet
    rect(img, cx - 5, oy + 9, cx + 4, oy + 9, body_dk)
    rect(img, cx - 5, oy + 13, cx + 4, oy + 13, body_dk)        # brim
    # eyes
    px(img, cx - 3, oy + 16, DARK)
    px(img, cx + 2, oy + 16, DARK)

    # ROLE silhouette overlays.
    if role == "dealer":
        # combat visor + shoulder-mounted cannon (offense)
        rect(img, cx - 5, oy + 15, cx + 4, oy + 16, ENEMY)     # glowing visor
        rect(img, cx + 6, oy + 20, cx + 10, oy + 22, STEEL_DK) # cannon barrel
        rect(img, cx + 8, oy + 19, cx + 10, oy + 23, GEAR)     # mount
    elif role == "tank":
        # heavy pauldrons + faceplate (defense)
        rect(img, cx - 12, oy + 24, cx - 8, oy + 30, STEEL_DK)  # L pauldron
        rect(img, cx + 8, oy + 24, cx + 12, oy + 30, STEEL_DK)  # R pauldron
        rect(img, cx - 12, oy + 24, cx - 8, oy + 25, STEEL)
        rect(img, cx + 8, oy + 24, cx + 12, oy + 25, STEEL)
        rect(img, cx - 4, oy + 17, cx + 3, oy + 19, STEEL_DK)   # faceplate
    else:  # support
        # headset + medic satchel with a green cross (utility)
        rect(img, cx - 6, oy + 12, cx - 5, oy + 18, ACCENT)     # headset band
        rect(img, cx - 7, oy + 16, cx - 5, oy + 18, ACCENT)     # earcup
        rect(img, cx + 4, oy + 12, cx + 5, oy + 15, STEEL_DK)   # mic boom
        rect(img, cx + 6, oy + 26, cx + 10, oy + s - 4, STEEL_RES)  # satchel
        rect(img, cx + 7, oy + 28, cx + 8, oy + 31, GATE_GOOD)  # cross V
        rect(img, cx + 6, oy + 29, cx + 9, oy + 30, GATE_GOOD)  # cross H

    # TYPE emblem chip (top-left corner badge motif).
    ex, ey = ox + 4, oy + 4
    if htype == "tank":
        rect(img, ex, ey, ex + 5, ey + 4, STEEL_DK)            # hull
        rect(img, ex + 1, ey - 1, ex + 4, ey - 1, STEEL)       # turret
        rect(img, ex + 4, ey - 1, ex + 7, ey, STEEL_DK)        # barrel
    elif htype == "missile":
        rect(img, ex + 2, ey, ex + 3, ey + 5, ENEMY)           # missile body
        px(img, ex + 2, ey - 1, ENEMY_DARK)                    # nose
        px(img, ex + 3, ey - 1, ENEMY_DARK)
        rect(img, ex + 1, ey + 4, ex + 4, ey + 5, MUZZLE)      # exhaust
    else:  # aircraft
        rect(img, ex, ey + 2, ex + 6, ey + 3, body)            # wings
        rect(img, ex + 2, ey, ex + 3, ey + 5, body_dk)         # fuselage

    # thin frame edge
    rect(img, ox + 2, oy + 2, ox + s - 3, oy + 2, (c[0], c[1], c[2], 255))


def build_hero_portraits():
    s = 32
    frames = len(HERO_TYPES) * len(HERO_ROLES)
    sheet = new(s * frames, s)
    fi = 0
    for htype in HERO_TYPES:
        for role in HERO_ROLES:
            draw_hero_portrait(sheet, fi * s, 0, s, htype, role)
            fi += 1
    save(sheet, os.path.join(SPR, "hero_portraits.png"))
    print("sprites/hero_portraits.png", sheet.size,
          [t + "/" + r for t in HERO_TYPES for r in HERO_ROLES])


# ---------------------------------------------------------------------------
# GRADE FRAMES: 32x32-per-frame sheet of 3 transparent frames (UR/SSR/SR) to
# overlay on a 32x32 hero portrait. Corner brackets + a coloured border in the
# grade colour, drawn onto transparency so the portrait shows through.
# ---------------------------------------------------------------------------
GRADE_FRAME_COLORS = {
    "UR": (GRADE_UR, GRADE_UR_DK),
    "SSR": (GRADE_SSR, GRADE_SSR_DK),
    "SR": (GRADE_SR, GRADE_SR_DK),
}


def draw_grade_frame(img, ox, oy, s, grade):
    col, dk = GRADE_FRAME_COLORS[grade]
    # 1px border
    rect(img, ox + 1, oy + 1, ox + s - 2, oy + 1, col)
    rect(img, ox + 1, oy + s - 2, ox + s - 2, oy + s - 2, dk)
    rect(img, ox + 1, oy + 1, ox + 1, oy + s - 2, col)
    rect(img, ox + s - 2, oy + 1, ox + s - 2, oy + s - 2, dk)
    # bold corner brackets (grade emphasis)
    L = 7
    for (bx, by, dx, dy) in [(ox + 1, oy + 1, 1, 1), (ox + s - 2, oy + 1, -1, 1),
                             (ox + 1, oy + s - 2, 1, -1), (ox + s - 2, oy + s - 2, -1, -1)]:
        for i in range(L):
            px(img, bx + dx * i, by, col)
            px(img, bx, by + dy * i, col)
            px(img, bx + dx * i, by + dy, dk)
            px(img, bx + dx, by + dy * i, dk)


def build_grade_frames():
    s, n = 32, len(HERO_GRADES)
    sheet = new(s * n, s)
    for i, grade in enumerate(HERO_GRADES):
        draw_grade_frame(sheet, i * s, 0, s, grade)
    save(sheet, os.path.join(UI, "grade_frames.png"))
    print("ui/grade_frames.png", sheet.size, list(HERO_GRADES))


# ---------------------------------------------------------------------------
# TYPE BADGES: 16x16-per-frame sheet in HERO_TYPES order (tank/missile/aircraft)
# ---------------------------------------------------------------------------
def draw_type_badge(img, ox, oy, htype):
    col = HERO_TYPE_COLORS[htype]
    dk = HERO_TYPE_COLORS_DK[htype]
    cx, cy = ox + 8, oy + 8
    # coin backdrop
    for dy in range(-6, 7):
        for dx in range(-6, 7):
            d = dx * dx + dy * dy
            if d <= 36:
                px(img, cx + dx, cy + dy, dk if d > 25 else col)
    if htype == "tank":
        rect(img, cx - 4, cy, cx + 3, cy + 3, STEEL_DK)
        rect(img, cx - 3, cy - 2, cx + 1, cy - 1, STEEL)
        rect(img, cx + 1, cy - 2, cx + 5, cy - 1, STEEL_DK)   # barrel
    elif htype == "missile":
        rect(img, cx - 1, cy - 4, cx, cy + 3, TEXT)
        px(img, cx - 1, cy - 5, STEEL_HI)
        px(img, cx, cy - 5, STEEL_HI)
        rect(img, cx - 2, cy + 3, cx + 1, cy + 4, MUZZLE)     # exhaust
    else:  # aircraft
        rect(img, cx - 5, cy, cx + 4, cy + 1, TEXT)           # wings
        rect(img, cx - 1, cy - 3, cx, cy + 4, STEEL_HI)       # fuselage


def build_type_badges():
    s, n = 16, len(HERO_TYPES)
    sheet = new(s * n, s)
    for i, htype in enumerate(HERO_TYPES):
        draw_type_badge(sheet, i * s, 0, htype)
    sheet = outline_alpha(sheet)
    save(sheet, os.path.join(UI, "type_badges.png"))
    print("ui/type_badges.png", sheet.size, list(HERO_TYPES))


# ---------------------------------------------------------------------------
# ROLE BADGES: 16x16-per-frame sheet in HERO_ROLES order (dealer/tank/support)
# ---------------------------------------------------------------------------
ROLE_BADGE_COLORS = {
    "dealer": (ENEMY, ENEMY_DARK),      # offense red
    "tank": (STEEL_RES, STEEL_RES_DK),  # defense steel
    "support": (GATE_GOOD, (46, 150, 74, 255)),  # utility green
}


def draw_role_badge(img, ox, oy, role):
    col, dk = ROLE_BADGE_COLORS[role]
    cx, cy = ox + 8, oy + 8
    for dy in range(-6, 7):
        for dx in range(-6, 7):
            d = dx * dx + dy * dy
            if d <= 36:
                px(img, cx + dx, cy + dy, dk if d > 25 else col)
    if role == "dealer":
        # crosshair
        rect(img, cx - 4, cy, cx + 4, cy, DARK)
        rect(img, cx, cy - 4, cx, cy + 4, DARK)
        px(img, cx, cy, TEXT)
    elif role == "tank":
        # shield
        rect(img, cx - 3, cy - 4, cx + 3, cy - 4, DARK)
        rect(img, cx - 3, cy - 4, cx - 3, cy + 1, DARK)
        rect(img, cx + 3, cy - 4, cx + 3, cy + 1, DARK)
        rect(img, cx - 2, cy + 2, cx + 2, cy + 3, DARK)
        px(img, cx, cy + 4, DARK)
    else:  # support
        # medical cross
        rect(img, cx - 1, cy - 4, cx, cy + 4, DARK)
        rect(img, cx - 4, cy - 1, cx + 4, cy, DARK)


def build_role_badges():
    s, n = 16, len(HERO_ROLES)
    sheet = new(s * n, s)
    for i, role in enumerate(HERO_ROLES):
        draw_role_badge(sheet, i * s, 0, role)
    sheet = outline_alpha(sheet)
    save(sheet, os.path.join(UI, "role_badges.png"))
    print("ui/role_badges.png", sheet.size, list(HERO_ROLES))


# ---------------------------------------------------------------------------
# NAV ICONS: 20x20-per-frame sheet for the bottom-nav tabs, in a fixed order:
# base, heroes, campaign, missions, season, falcon (mini-game). Simple, legible
# monochrome-ish glyphs tinted at runtime.
# ---------------------------------------------------------------------------
NAV_ICON_ORDER = ["base", "heroes", "campaign", "missions", "season", "falcon"]


def draw_nav_icon(img, ox, oy, s, kind):
    cx, cy = ox + s // 2, oy + s // 2
    c = TEXT
    if kind == "base":
        # little factory/base with a chimney
        rect(img, ox + 4, oy + 10, ox + 15, oy + 16, c)
        rect(img, ox + 6, oy + 6, ox + 8, oy + 10, c)         # chimney
        rect(img, ox + 6, oy + 12, ox + 8, oy + 14, PANEL)    # window
        rect(img, ox + 11, oy + 12, ox + 13, oy + 14, PANEL)
    elif kind == "heroes":
        # helmeted head + shoulders bust
        rect(img, ox + 7, oy + 4, ox + 12, oy + 9, c)         # head
        rect(img, ox + 7, oy + 4, ox + 12, oy + 5, c)         # helmet top
        rect(img, ox + 5, oy + 11, ox + 14, oy + 16, c)       # shoulders
        rect(img, ox + 9, oy + 6, ox + 10, oy + 7, PANEL)     # visor slit
    elif kind == "campaign":
        # crossed-swords / battle chevrons
        rect(img, ox + 4, oy + 14, ox + 15, oy + 15, c)
        for i in range(5):
            px(img, ox + 6 + i, oy + 12 - i, c)
            px(img, ox + 13 - i, oy + 12 - i, c)
        px(img, ox + 9, oy + 5, c)
        px(img, ox + 10, oy + 5, c)
    elif kind == "missions":
        # checklist / clipboard
        rect(img, ox + 5, oy + 4, ox + 14, oy + 16, c)
        rect(img, ox + 6, oy + 5, ox + 13, oy + 15, PANEL)
        for ly in (oy + 7, oy + 10, oy + 13):
            rect(img, ox + 7, ly, ox + 8, ly, c)              # check
            rect(img, ox + 10, ly, ox + 12, ly, c)            # line
    elif kind == "season":
        # laurel / battle-pass star crest
        rect(img, ox + 9, oy + 4, ox + 10, oy + 15, c)
        rect(img, ox + 4, oy + 9, ox + 15, oy + 10, c)
        px(img, ox + 6, oy + 6, c)
        px(img, ox + 13, oy + 6, c)
        px(img, ox + 6, oy + 13, c)
        px(img, ox + 13, oy + 13, c)
    else:  # falcon (mini-game): a swooping bird chevron
        rect(img, ox + 3, oy + 9, ox + 9, oy + 10, c)         # L wing
        rect(img, ox + 10, oy + 9, ox + 16, oy + 10, c)       # R wing
        rect(img, ox + 8, oy + 8, ox + 11, oy + 13, c)        # body
        px(img, ox + 9, oy + 6, c)                            # head
        px(img, ox + 10, oy + 6, c)


def build_nav_icons():
    s, n = 20, len(NAV_ICON_ORDER)
    sheet = new(s * n, s)
    for i, kind in enumerate(NAV_ICON_ORDER):
        draw_nav_icon(sheet, i * s, 0, s, kind)
    save(sheet, os.path.join(UI, "nav_icons.png"))
    print("ui/nav_icons.png", sheet.size, list(NAV_ICON_ORDER))


# ---------------------------------------------------------------------------
# STAR + MEDAL: two small standalone 16x16 icons for hero star-tiers and
# season/league medals.
# ---------------------------------------------------------------------------
def build_star():
    s = 16
    img = new(s, s)
    cx, cy = 8, 8
    # 5-point star via a radial spike function (deterministic pixel shape)
    for dy in range(-6, 7):
        for dx in range(-6, 7):
            ang = math.atan2(dy, dx)
            r = math.hypot(dx, dy)
            spike = 5.5 + 1.5 * math.cos(5 * ang - math.pi / 2)
            if r <= spike * 0.72:
                col = COIN if r < spike * 0.5 else COIN_DK
                px(img, cx + dx, cy + dy, col)
    px(img, cx, cy - 3, (255, 255, 255, 255))
    img = outline_alpha(img)
    save(img, os.path.join(UI, "star.png"))
    print("ui/star.png", img.size)


def build_medal():
    s = 16
    img = new(s, s)
    cx = 8
    # ribbon
    rect(img, cx - 3, 1, cx - 1, 6, ENEMY)
    rect(img, cx + 1, 1, cx + 3, 6, SQUAD)
    # medallion
    for dy in range(-5, 6):
        for dx in range(-5, 6):
            d = dx * dx + dy * dy
            if d <= 25:
                px(img, cx + dx, 10 + dy, COIN_DK if d > 16 else COIN)
    # engraved star
    px(img, cx, 8, TEXT)
    px(img, cx, 12, TEXT)
    px(img, cx - 2, 10, TEXT)
    px(img, cx + 2, 10, TEXT)
    px(img, cx, 10, ACCENT)
    img = outline_alpha(img)
    save(img, os.path.join(UI, "medal.png"))
    print("ui/medal.png", img.size)


# ---------------------------------------------------------------------------
# TAB BAR: a 24x24 9-slice frame for the persistent bottom-nav bar background,
# darker + flatter than the panel so nav sits visually below content.
# ---------------------------------------------------------------------------
def build_tab_bar():
    p = new(24, 24)
    rect(p, 0, 0, 23, 23, (ROAD_DARK[0], ROAD_DARK[1], ROAD_DARK[2], 245))
    rect(p, 0, 0, 23, 1, GEAR_LT)          # top rail highlight
    rect(p, 0, 2, 23, 2, SQUAD_DARK)       # thin accent line under the rail
    rect(p, 0, 23, 23, 23, DARK)
    rect(p, 0, 0, 0, 23, GEAR)
    rect(p, 23, 0, 23, 23, DARK)
    save(p, os.path.join(UI, "tab_bar.png"))
    print("ui/tab_bar.png", p.size)


# ---------------------------------------------------------------------------
# BATTLE / STAGE BACKGROUND: a 540x720 static backdrop for the campaign / league
# battle view - a war-torn horizon with a raised platform the two teams face off
# on. Distinct from the runner road so battle scenes read differently.
# ---------------------------------------------------------------------------
def build_battle_bg():
    W, H = 540, 720
    img = new(W, H)
    smoke_low = (58, 44, 52, 255)
    ground_far = (46, 40, 36, 255)
    # sky gradient (smoky dusk)
    for y in range(H):
        t = y / H
        img_col = lerp(BG_SKY, smoke_low, min(1.0, t * 1.3))
        rect(img, 0, y, W - 1, y, img_col)
    # distant smoke plumes (deterministic)
    for i in range(6):
        bx = 40 + i * 88
        top = 120 + (i * 53 % 90)
        for y in range(top, int(H * 0.5)):
            wob = int(10 * math.sin((y + i * 40) / 26.0))
            a = int(60 * (1 - (y - top) / (H * 0.5 - top)))
            rect(img, bx + wob - 6, y, bx + wob + 6, y, (40, 40, 46, max(0, a)))
    # horizon ridge line of ruined structures
    horizon = int(H * 0.52)
    x = 0
    idx = 0
    seed = 987654321
    while x < W:
        seed = (seed * 1103515245 + 12345) & 0x7FFFFFFF
        bw = 30 + (seed >> 6) % 40
        seed = (seed * 1103515245 + 12345) & 0x7FFFFFFF
        bh = 40 + (seed >> 6) % 90
        shade = lerp(BG_HORIZON, ROAD_DARK, 0.3 + 0.3 * ((idx % 3) / 2.0))
        rect(img, x, horizon - bh, min(W - 1, x + bw - 1), horizon, shade)
        x += bw + 3
        idx += 1
    # ground: cracked battlefield earth
    for y in range(horizon, H):
        t = (y - horizon) / (H - horizon)
        rect(img, 0, y, W - 1, y, lerp(ROAD_DARK, ground_far, t))
    # a raised centre platform where the squads stand
    py0 = int(H * 0.66)
    rect(img, 40, py0, W - 41, H - 40, ROAD)
    rect(img, 40, py0, W - 41, py0 + 3, LANE_LINE)
    rect(img, 40, H - 42, W - 41, H - 40, DARK)
    # platform seams
    for sx in range(80, W - 40, 90):
        rect(img, sx, py0 + 6, sx, H - 44, lerp(ROAD, ROAD_DARK, 0.5))
    # centre divider line separating attacker / defender halves
    rect(img, W // 2 - 1, py0 + 4, W // 2, H - 46, lerp(ROAD, ACCENT, 0.3))
    img.save(os.path.join(BG, "battle.png"))
    print("backgrounds/battle.png", img.size)


if __name__ == "__main__":
    build_soldier()
    build_enemy("enemy_walker", lean=False)
    build_enemy("enemy_runner", lean=True)
    build_boss()
    build_gate()
    build_backgrounds()
    build_fx()
    build_ui()
    # FEAT-005: base/meta art + nav UI kit.
    build_buildings()
    build_resources()
    build_hero_portraits()
    build_grade_frames()
    build_type_badges()
    build_role_badges()
    build_nav_icons()
    build_star()
    build_medal()
    build_tab_bar()
    build_battle_bg()
    print("\nAll original LAST SQUAD pixel-art assets generated.")
