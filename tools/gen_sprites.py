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


if __name__ == "__main__":
    build_soldier()
    build_enemy("enemy_walker", lean=False)
    build_enemy("enemy_runner", lean=True)
    build_boss()
    build_gate()
    build_backgrounds()
    build_fx()
    build_ui()
    print("\nAll original LAST SQUAD pixel-art assets generated.")
