#!/usr/bin/env python3
"""
gen_sprites.py - Original pixel-art asset generator for WIREWORK.

Everything produced by this script is ORIGINAL art authored programmatically for
this project. Nothing is traced, ripped, or derived from any existing IP. The
game is an original-world "wall-defense ODM action inspired by the genre"; the
six enemy giants are role-based original designs (Wanderer, Sprinter, Breaker,
Aberrant, Armored, Thrower), each with a distinct silhouette/color and a visible
NAPE weak-point marker (the only reliably lethal target).

All output PNGs are nearest-neighbour pixel art on a cohesive palette that lines
up with src/config/GameConfig.ts (logical canvas 480x270).

Run:  python3 tools/gen_sprites.py
Out:  public/assets/{sprites,backgrounds,ui,fx}/*.png
"""

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
# Cohesive palette (RGBA). Mirrors PALETTE in src/config/GameConfig.ts.
# ---------------------------------------------------------------------------
T = (0, 0, 0, 0)  # transparent

# Skin / flesh tones for the giants (varied per role for distinct silhouettes)
FLESH = {
    "wanderer": (198, 150, 130, 255),
    "wanderer_sh": (150, 108, 92, 255),
    "sprinter": (176, 128, 150, 255),
    "sprinter_sh": (128, 88, 108, 255),
    "breaker": (170, 128, 96, 255),
    "breaker_sh": (120, 88, 64, 255),
    "aberrant": (150, 176, 150, 255),
    "aberrant_sh": (100, 128, 100, 255),
    "armored": (140, 140, 132, 255),
    "armored_sh": (96, 96, 90, 255),
    "thrower": (170, 158, 130, 255),
    "thrower_sh": (120, 110, 88, 255),
}
MUSCLE = (196, 106, 90, 255)       # exposed muscle striations
MUSCLE_DK = (150, 74, 62, 255)
PLATE = (92, 96, 104, 255)         # armored plating
PLATE_HI = (128, 132, 140, 255)
PLATE_DK = (58, 60, 66, 255)
NAPE = (255, 90, 77, 255)          # weak-point marker (PALETTE.ENEMY_WEAKPOINT)
NAPE_GLOW = (255, 160, 120, 255)
EYE = (255, 226, 120, 255)
MOUTH = (60, 30, 26, 255)
OUTLINE = (24, 18, 22, 255)

# Hero palette
HERO_SKIN = (240, 200, 160, 255)
HERO_SKIN_SH = (196, 156, 120, 255)
HERO_HAIR = (74, 54, 40, 255)
HERO_JACKET = (94, 108, 92, 255)      # green field jacket
HERO_JACKET_SH = (64, 76, 62, 255)
HERO_STRAP = (70, 58, 44, 255)        # leather ODM harness straps
HERO_PANTS = (86, 84, 96, 255)
HERO_BOOT = (48, 42, 40, 255)
HERO_BLADE = (200, 214, 228, 255)
HERO_BLADE_HI = (240, 248, 255, 255)
HERO_GEAR = (120, 120, 128, 255)      # ODM gear metal
WIRE = (210, 220, 210, 255)

# Citizen palette
CIT_SKIN = (255, 217, 160, 255)
CIT_HAIR = (90, 66, 48, 255)


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
# HERO: 32x32 frames, ODM soldier with grapple poses.
# Frames: 0 idle, 1 run-a, 2 run-b, 3 grapple-fire (arm up), 4 swing, 5 slash, 6 hurt
# ===========================================================================
FRAME = 32
HERO_FRAMES = 7


def draw_hero(img, ox, oy, pose):
    """Draw one 32x32 hero frame at offset (ox, oy)."""
    cx = ox + 16
    # --- head ---
    rect(img, cx - 3, oy + 4, cx + 2, oy + 9, HERO_SKIN)
    rect(img, cx - 3, oy + 3, cx + 2, oy + 4, HERO_HAIR)     # hair top
    rect(img, cx - 4, oy + 4, cx - 4, oy + 6, HERO_HAIR)     # side hair
    px(img, cx + 2, oy + 6, HERO_SKIN_SH)
    px(img, cx + 1, oy + 7, MOUTH)                            # eye hint
    # --- torso / jacket ---
    rect(img, cx - 4, oy + 10, cx + 3, oy + 19, HERO_JACKET)
    rect(img, cx + 2, oy + 10, cx + 3, oy + 19, HERO_JACKET_SH)
    # ODM harness straps (X across chest)
    for i in range(10):
        px(img, cx - 4 + i * 0, oy + 10 + i, HERO_STRAP)
    for i in range(8):
        px(img, cx - 3 + i, oy + 11 + i, HERO_STRAP)
        px(img, cx + 3 - i, oy + 11 + i, HERO_STRAP)
    # gear boxes on hips
    rect(img, cx - 5, oy + 17, cx - 4, oy + 20, HERO_GEAR)
    rect(img, cx + 3, oy + 17, cx + 4, oy + 20, HERO_GEAR)
    # --- legs ---
    if pose in (1,):      # run A
        rect(img, cx - 3, oy + 20, cx - 1, oy + 26, HERO_PANTS)
        rect(img, cx + 1, oy + 20, cx + 3, oy + 24, HERO_PANTS)
        rect(img, cx - 4, oy + 26, cx - 1, oy + 28, HERO_BOOT)
        rect(img, cx + 2, oy + 24, cx + 5, oy + 26, HERO_BOOT)
    elif pose in (2,):    # run B
        rect(img, cx - 3, oy + 20, cx - 1, oy + 24, HERO_PANTS)
        rect(img, cx + 1, oy + 20, cx + 3, oy + 26, HERO_PANTS)
        rect(img, cx - 5, oy + 24, cx - 2, oy + 26, HERO_BOOT)
        rect(img, cx + 1, oy + 26, cx + 4, oy + 28, HERO_BOOT)
    else:                 # neutral stance
        rect(img, cx - 3, oy + 20, cx - 1, oy + 27, HERO_PANTS)
        rect(img, cx + 1, oy + 20, cx + 3, oy + 27, HERO_PANTS)
        rect(img, cx - 4, oy + 27, cx - 1, oy + 29, HERO_BOOT)
        rect(img, cx + 1, oy + 27, cx + 4, oy + 29, HERO_BOOT)
    # --- arms + blades depending on pose ---
    if pose == 0:         # idle: blades lowered (longer blade)
        rect(img, cx - 6, oy + 12, cx - 5, oy + 18, HERO_JACKET)
        rect(img, cx + 4, oy + 12, cx + 5, oy + 18, HERO_JACKET)
        rect(img, cx - 7, oy + 18, cx - 6, oy + 28, HERO_BLADE)      # blade down
        px(img, cx - 7, oy + 18, HERO_BLADE_HI)
    elif pose in (1, 2):  # running: one arm forward
        rect(img, cx - 7, oy + 11, cx - 5, oy + 13, HERO_JACKET)
        rect(img, cx + 4, oy + 13, cx + 6, oy + 15, HERO_JACKET)
        rect(img, cx + 6, oy + 15, cx + 9, oy + 16, HERO_BLADE)
        px(img, cx + 9, oy + 15, HERO_BLADE_HI)
    elif pose == 3:       # grapple fire: arm raised up-right (trigger)
        rect(img, cx + 3, oy + 6, cx + 5, oy + 12, HERO_JACKET)
        rect(img, cx + 5, oy + 3, cx + 7, oy + 6, HERO_GEAR)         # launcher
        px(img, cx + 7, oy + 3, HERO_BLADE_HI)
        rect(img, cx - 6, oy + 12, cx - 5, oy + 18, HERO_JACKET)
    elif pose == 4:       # swing: leaning, both arms trailing
        rect(img, cx - 8, oy + 8, cx - 5, oy + 10, HERO_JACKET)
        rect(img, cx + 4, oy + 14, cx + 7, oy + 16, HERO_JACKET)
        rect(img, cx - 10, oy + 6, cx - 8, oy + 8, HERO_GEAR)
        rect(img, cx + 7, oy + 16, cx + 11, oy + 17, HERO_BLADE)
        px(img, cx + 11, oy + 16, HERO_BLADE_HI)
    elif pose == 5:       # slash: both blades out to the right (LONG reach)
        # Blades extended to the frame edge so the weapon reads as a long,
        # far-reaching slash that visibly connects with a giant (matches the
        # extended CombatSystem reach + scaled slash FX). 32px frame: cx=+16, so
        # cx+15 is the last in-bounds column.
        rect(img, cx + 4, oy + 10, cx + 6, oy + 12, HERO_JACKET)
        rect(img, cx + 6, oy + 8, cx + 15, oy + 9, HERO_BLADE)
        rect(img, cx + 6, oy + 13, cx + 15, oy + 14, HERO_BLADE)
        px(img, cx + 15, oy + 8, HERO_BLADE_HI)
        px(img, cx + 15, oy + 13, HERO_BLADE_HI)
    elif pose == 6:       # hurt: recoil, arms up
        rect(img, cx - 7, oy + 9, cx - 5, oy + 11, HERO_JACKET)
        rect(img, cx + 4, oy + 9, cx + 6, oy + 11, HERO_JACKET)


def build_hero():
    sheet = new(FRAME * HERO_FRAMES, FRAME)
    for f in range(HERO_FRAMES):
        draw_hero(sheet, f * FRAME, 0, f)
    sheet = outline_alpha(sheet)
    save(sheet, os.path.join(SPR, "hero.png"))
    print("hero.png", sheet.size)


# ===========================================================================
# ENEMY GIANTS: 6 role-based originals. Each is a spritesheet of walk frames.
# Frame size scales with the role's height (aligned to GameConfig heights).
# Every giant has a NAPE marker (red) at the back of the neck.
# ===========================================================================

def giant_base(img, ox, oy, fw, fh, flesh, shade, step, opts):
    """
    Generic bipedal humanoid giant. opts tweaks silhouette per role.
      opts: dict(head_r, torso_w, arm_len, leg_spread, hunch, muscle, quad)
    Returns nape pixel (x,y) in image space.
    """
    cx = ox + fw // 2
    ground = oy + fh - 1
    head_r = opts["head_r"]
    torso_w = opts["torso_w"]
    hunch = opts.get("hunch", 0)
    quad = opts.get("quad", False)

    # proportion anchors
    head_cy = oy + head_r + 2 + hunch
    neck_y = head_cy + head_r
    torso_top = neck_y
    torso_bot = oy + int(fh * (0.55 if not quad else 0.62))
    hip_y = torso_bot
    leg_len = ground - hip_y

    # --- legs ---
    spread = opts.get("leg_spread", torso_w // 2)
    lw = max(2, torso_w // 3)
    swing = 2 if step == 1 else -2
    if quad:
        # quadruped: front + back legs
        rect(img, cx - spread - lw, hip_y, cx - spread, ground, flesh)
        rect(img, cx + spread, hip_y, cx + spread + lw, ground - abs(swing), flesh)
        rect(img, ox + 2, hip_y + 2, ox + 2 + lw, ground, flesh)          # front leg
        rect(img, ox + fw - 3 - lw, hip_y + 2, ox + fw - 3, ground - 1, flesh)
    else:
        rect(img, cx - spread - lw + swing, hip_y, cx - spread + swing, ground, flesh)
        rect(img, cx + spread - swing, hip_y, cx + spread + lw - swing, ground, flesh)
        rect(img, cx - spread - lw + swing, ground - 2, cx - spread + swing, ground, shade)
        rect(img, cx + spread - swing, ground - 2, cx + spread + lw - swing, ground, shade)

    # --- torso ---
    for y in range(torso_top, torso_bot + 1):
        t = (y - torso_top) / max(1, (torso_bot - torso_top))
        halfw = int(torso_w * (0.75 + 0.25 * (1 - t)))
        rect(img, cx - halfw, y, cx + halfw, y, flesh)
        rect(img, cx + halfw - 1, y, cx + halfw, y, shade)   # right-side shade
    # muscle striations if role has exposed flesh
    if opts.get("muscle"):
        for y in range(torso_top + 2, torso_bot - 1, 3):
            rect(img, cx - torso_w + 1, y, cx - 1, y, MUSCLE_DK)
            rect(img, cx - torso_w + 1, y + 1, cx - 1, y + 1, MUSCLE)

    # --- head ---
    rect(img, cx - head_r, head_cy - head_r, cx + head_r, head_cy + head_r, flesh)
    rect(img, cx + head_r - 1, head_cy - head_r, cx + head_r, head_cy + head_r, shade)
    # eyes + mouth
    px(img, cx - head_r + 1, head_cy - 1, EYE)
    px(img, cx + 1, head_cy - 1, EYE)
    rect(img, cx - head_r + 1, head_cy + head_r - 1, cx + head_r - 1, head_cy + head_r, MOUTH)

    # --- arms ---
    arm_len = opts["arm_len"]
    ay = torso_top + 2
    # left arm reaching forward (toward the wall, i.e. screen-left)
    rect(img, cx - torso_w - 3, ay, cx - torso_w, ay + arm_len, flesh)
    rect(img, cx - torso_w - 4, ay + arm_len, cx - torso_w, ay + arm_len + 2, flesh)
    # right arm trailing
    rect(img, cx + torso_w, ay + 1, cx + torso_w + 3, ay + arm_len - 1, flesh)

    # --- NAPE weak-point marker: back of neck (screen-right side of neck) ---
    nx = cx + head_r - 1
    ny = neck_y
    rect(img, nx - 1, ny - 1, nx + 1, ny + 1, NAPE)
    px(img, nx, ny, NAPE_GLOW)
    return (nx, ny)


def build_giant(name, fw, fh, frames, flesh, shade, opts, scale=1, extra=None):
    sheet = new(fw * frames, fh)
    napes = []
    for f in range(frames):
        n = giant_base(sheet, f * fw, 0, fw, fh, flesh, shade, f % 2, opts)
        if extra:
            extra(sheet, f * fw, 0, fw, fh, f % 2, opts)
        napes.append(n)
    sheet = outline_alpha(sheet)
    save(sheet, os.path.join(SPR, f"giant_{name}.png"), scale)
    print(f"giant_{name}.png", (sheet.width * scale, sheet.height * scale), "nape@", napes[0])


def extra_armored(img, ox, oy, fw, fh, step, opts):
    """Armored: bony plate over face + chest, exposed weak points on limbs."""
    cx = ox + fw // 2
    # face/chest plate
    rect(img, cx - opts["head_r"], oy + 2, cx + 1, oy + opts["head_r"] * 2 + 2, PLATE)
    rect(img, cx - opts["head_r"], oy + 2, cx - opts["head_r"], oy + opts["head_r"] * 2, PLATE_HI)
    rect(img, cx - opts["torso_w"], oy + opts["head_r"] * 2 + 4, cx + 1,
         oy + int(fh * 0.5), PLATE)
    rect(img, cx - opts["torso_w"], oy + opts["head_r"] * 2 + 4, cx - opts["torso_w"] + 1,
         oy + int(fh * 0.5), PLATE_DK)
    # exposed weak-point behind knee (secondary), marked with muscle tone
    rect(img, cx + opts["torso_w"], oy + int(fh * 0.6), cx + opts["torso_w"] + 2,
         oy + int(fh * 0.66), MUSCLE)


def extra_thrower(img, ox, oy, fw, fh, step, opts):
    """Thrower: holds a chunk of debris in the trailing hand."""
    cx = ox + fw // 2
    hx = cx + opts["torso_w"] + 3
    hy = oy + opts["head_r"] * 2 + 4 + opts["arm_len"] - 2
    rect(img, hx, hy, hx + 4, hy + 4, PLATE)
    rect(img, hx, hy, hx + 1, hy + 1, PLATE_HI)
    px(img, hx + 3, hy + 3, PLATE_DK)


def build_all_giants():
    # 1) Wanderer - standard size/speed, basic humanoid (height ~40)
    build_giant("wanderer", 40, 48, 2,
                FLESH["wanderer"], FLESH["wanderer_sh"],
                dict(head_r=5, torso_w=8, arm_len=14, leg_spread=4, muscle=False))
    # 2) Sprinter - small, fast, quadrupedal charge (height ~24)
    build_giant("sprinter", 40, 32, 2,
                FLESH["sprinter"], FLESH["sprinter_sh"],
                dict(head_r=3, torso_w=6, arm_len=10, leg_spread=6, hunch=4,
                     muscle=True, quad=True))
    # 3) Breaker - huge, slow, high HP wall-smasher (height ~64)
    build_giant("breaker", 56, 72, 2,
                FLESH["breaker"], FLESH["breaker_sh"],
                dict(head_r=6, torso_w=13, arm_len=22, leg_spread=6, muscle=True))
    # 4) Aberrant - erratic, lean and twisted (height ~36)
    build_giant("aberrant", 40, 44, 2,
                FLESH["aberrant"], FLESH["aberrant_sh"],
                dict(head_r=4, torso_w=6, arm_len=18, leg_spread=3, hunch=2, muscle=True))
    # 5) Armored - armored front + exposed weak points (height ~44)
    build_giant("armored", 44, 52, 2,
                FLESH["armored"], FLESH["armored_sh"],
                dict(head_r=5, torso_w=10, arm_len=15, leg_spread=5, muscle=False),
                extra=extra_armored)
    # 6) Thrower - ranged, lobs debris (height ~46)
    build_giant("thrower", 46, 54, 2,
                FLESH["thrower"], FLESH["thrower_sh"],
                dict(head_r=5, torso_w=9, arm_len=16, leg_spread=4, muscle=True),
                extra=extra_thrower)


# ===========================================================================
# CITIZEN NPCs: 16x20 frames, small townsfolk to protect. 3 palette variants.
# ===========================================================================
def build_citizens():
    fw, fh = 16, 20
    variants = [
        ((196, 96, 84, 255), (150, 70, 60, 255)),   # red coat
        ((84, 120, 150, 255), (60, 90, 116, 255)),  # blue coat
        ((150, 130, 90, 255), (116, 98, 66, 255)),  # tan coat
    ]
    sheet = new(fw * len(variants), fh)
    for i, (coat, coat_sh) in enumerate(variants):
        ox = i * fw
        cx = ox + 8
        # head
        rect(sheet, cx - 2, 3, cx + 1, 6, CIT_SKIN)
        rect(sheet, cx - 2, 2, cx + 1, 3, CIT_HAIR)
        px(sheet, cx, 5, MOUTH)
        # body/coat
        rect(sheet, cx - 3, 7, cx + 2, 14, coat)
        rect(sheet, cx + 1, 7, cx + 2, 14, coat_sh)
        # arms
        rect(sheet, cx - 4, 8, cx - 3, 12, coat)
        rect(sheet, cx + 2, 8, cx + 3, 12, coat)
        # legs
        rect(sheet, cx - 2, 15, cx - 1, 18, HERO_PANTS)
        rect(sheet, cx + 1, 15, cx + 2, 18, HERO_PANTS)
        rect(sheet, cx - 3, 18, cx - 1, 19, HERO_BOOT)
        rect(sheet, cx + 1, 18, cx + 3, 19, HERO_BOOT)
    sheet = outline_alpha(sheet)
    save(sheet, os.path.join(SPR, "citizen.png"))
    print("citizen.png", sheet.size)


# ===========================================================================
# WALL / SETTLEMENT TILES: 16x16 tileset (wall block, top crenellation, gate).
# ===========================================================================
def build_tiles():
    ts = 16
    tiles = 4
    sheet = new(ts * tiles, ts)
    # tile 0: wall block
    rect(sheet, 0, 0, ts - 1, ts - 1, PLATE)
    for y in range(0, ts, 4):
        rect(sheet, 0, y, ts - 1, y, PLATE_DK)
    for x in range(0, ts, 8):
        rect(sheet, x, 0, x, ts - 1, PLATE_DK)
    rect(sheet, 0, 0, ts - 1, 0, PLATE_HI)
    # tile 1: crenellation top
    rect(sheet, 0, 6, ts - 1, ts - 1, PLATE)
    rect(sheet, 0, 0, 5, 5, PLATE)
    rect(sheet, 10, 0, ts - 1, 5, PLATE)
    rect(sheet, 0, 6, ts - 1, 6, PLATE_HI)
    # tile 2: gate/wood
    ox = 2 * ts
    rect(sheet, ox, 0, ox + ts - 1, ts - 1, (96, 66, 44, 255))
    for x in range(ox, ox + ts, 4):
        rect(sheet, x, 0, x, ts - 1, (70, 48, 32, 255))
    rect(sheet, ox, 7, ox + ts - 1, 8, (60, 42, 28, 255))
    # tile 3: ground/dirt
    ox = 3 * ts
    rect(sheet, ox, 0, ox + ts - 1, ts - 1, (66, 52, 38, 255))
    rect(sheet, ox, 0, ox + ts - 1, 1, (86, 68, 48, 255))
    for x in range(ox + 1, ox + ts, 5):
        px(sheet, x, 5, (50, 40, 30, 255))
        px(sheet, x + 2, 10, (50, 40, 30, 255))
    save(sheet, os.path.join(SPR, "tiles.png"))
    print("tiles.png", sheet.size)


# ===========================================================================
# PARALLAX BACKGROUNDS: 480x270 layers (sky gradient, far hills, near wall).
# ===========================================================================
def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(len(a)))


def build_backgrounds():
    W, H = 480, 270
    # --- sky (vertical gradient + a few clouds) ---
    sky = new(W, H)
    top = (18, 32, 54, 255)
    bot = (58, 74, 98, 255)
    for y in range(H):
        c = lerp(top, bot, y / H)
        rect(sky, 0, y, W - 1, y, c)
    # simple clouds
    for (cxp, cyp, r) in [(90, 60, 14), (300, 40, 18), (400, 90, 12)]:
        for dy in range(-r, r):
            for dx in range(-r * 2, r * 2):
                if (dx * dx) / (r * 2 * r * 2) + (dy * dy) / (r * r) < 1:
                    px(sky, cxp + dx, cyp + dy, (90, 104, 128, 200))
    save(sky, os.path.join(BG, "sky.png"))

    # --- far hills silhouette (tileable horizontally) ---
    hills = new(W, H)
    base = H - 90
    hillc = (40, 58, 74, 255)
    import math
    for x in range(W):
        yv = base + int(18 * math.sin(x / 46.0) + 10 * math.sin(x / 17.0))
        rect(hills, x, yv, x, H - 1, hillc)
    save(hills, os.path.join(BG, "hills.png"))

    # --- near wall interior (big stone rampart on the right) ---
    wall = new(W, H)
    wx = W - 96
    rect(wall, wx, 0, W - 1, H - 1, PLATE)
    for y in range(0, H, 16):
        rect(wall, wx, y, W - 1, y, PLATE_DK)
    for x in range(wx, W, 24):
        rect(wall, x, 0, x, H - 1, PLATE_DK)
    rect(wall, wx, 0, wx, H - 1, PLATE_HI)   # lit edge
    # crenellations along the top
    for x in range(wx, W, 24):
        rect(wall, x, 0, x + 11, 8, PLATE)
    save(wall, os.path.join(BG, "wall.png"))
    print("backgrounds: sky.png hills.png wall.png", (W, H))


# ===========================================================================
# FX: slash arc, spark/blood burst, dust puff, steam (giant death). 5-frame anims.
# ===========================================================================
def build_fx():
    # slash arc: 24x24, 4 frames sweeping
    fw = 24
    frames = 4
    sheet = new(fw * frames, fw)
    for f in range(frames):
        ox = f * fw
        cx, cy = ox + 12, 12
        import math
        a0 = -0.9 + f * 0.5
        for t in range(0, 40):
            ang = a0 + t / 40.0 * 1.6
            r = 10
            x = int(cx + r * math.cos(ang))
            y = int(cy + r * math.sin(ang))
            px(sheet, x, y, HERO_BLADE_HI)
            px(sheet, x, y + 1, HERO_BLADE)
    save(sheet, os.path.join(FX, "slash.png"))
    print("fx/slash.png", sheet.size)

    # spark/blood: 16x16, 4 frames expanding
    fw = 16
    sheet = new(fw * frames, fw)
    import math
    for f in range(frames):
        ox = f * fw
        cx, cy = ox + 8, 8
        r = 1 + f * 2
        for a in range(0, 360, 30):
            x = int(cx + r * math.cos(math.radians(a)))
            y = int(cy + r * math.sin(math.radians(a)))
            c = MUSCLE if f < 2 else NAPE
            px(sheet, x, y, c)
            px(sheet, x, y + 1, MUSCLE_DK)
    save(sheet, os.path.join(FX, "spark.png"))
    print("fx/spark.png", sheet.size)

    # dust puff: 16x16, 4 frames
    sheet = new(fw * frames, fw)
    for f in range(frames):
        ox = f * fw
        cx, cy = ox + 8, 11
        r = 2 + f * 2
        for a in range(0, 360, 24):
            x = int(cx + r * math.cos(math.radians(a)))
            y = int(cy + (r // 2) * math.sin(math.radians(a)))
            px(sheet, x, y, (150, 140, 120, 200))
    save(sheet, os.path.join(FX, "dust.png"))
    print("fx/dust.png", sheet.size)

    # steam (giant vanishing): 24x24, 4 frames rising
    fw = 24
    sheet = new(fw * frames, fw)
    for f in range(frames):
        ox = f * fw
        for i in range(24):
            x = ox + 6 + (i * 7) % 12
            y = 22 - ((i + f * 4) % 22)
            px(sheet, x, y, (210, 210, 214, 160))
            px(sheet, x + 1, y, (180, 180, 186, 140))
    save(sheet, os.path.join(FX, "steam.png"))
    print("fx/steam.png", sheet.size)


# ===========================================================================
# UI KIT: 9-slice panel, button, health/wall bar frame, icons.
# ===========================================================================
def build_ui():
    # panel 9-slice source: 24x24 with 8px corners
    p = new(24, 24)
    fill = (34, 40, 52, 235)
    border = (120, 132, 150, 255)
    borderhi = (168, 180, 198, 255)
    rect(p, 0, 0, 23, 23, fill)
    rect(p, 0, 0, 23, 0, borderhi)
    rect(p, 0, 0, 0, 23, borderhi)
    rect(p, 0, 23, 23, 23, border)
    rect(p, 23, 0, 23, 23, border)
    save(p, os.path.join(UI, "panel.png"))

    # button 9-slice: 24x16
    b = new(24, 16)
    bfill = (58, 86, 70, 255)
    bhi = (96, 132, 104, 255)
    rect(b, 0, 0, 23, 15, bfill)
    rect(b, 0, 0, 23, 0, bhi)
    rect(b, 0, 15, 23, 15, (36, 54, 44, 255))
    rect(b, 0, 0, 0, 15, bhi)
    rect(b, 23, 0, 23, 15, (36, 54, 44, 255))
    save(b, os.path.join(UI, "button.png"))

    # bar frame: 64x10 (empty), plus fill drawn by engine; include a red fill strip
    bar = new(64, 10)
    rect(bar, 0, 0, 63, 9, (24, 28, 36, 255))
    rect(bar, 0, 0, 63, 0, (90, 100, 116, 255))
    rect(bar, 0, 9, 63, 9, (14, 16, 22, 255))
    save(bar, os.path.join(UI, "bar_frame.png"))

    # icon set: 16x16 x 4 (heart, citizen, wall, blade)
    ts = 16
    icons = new(ts * 4, ts)
    # heart
    for (dx, dy) in [(4,4),(5,3),(6,4),(9,4),(10,3),(11,4)]:
        rect(icons, dx, dy, dx+1, dy+1, NAPE)
    for y in range(5, 9):
        rect(icons, 4 + (y-5), y, 11 - (y-5), y, NAPE)
    rect(icons, 6, 9, 9, 10, NAPE)
    px(icons, 7, 11, NAPE)
    # citizen head
    ox = ts
    rect(icons, ox+6, 3, ox+9, 6, CIT_SKIN)
    rect(icons, ox+5, 7, ox+10, 12, (196, 96, 84, 255))
    # wall
    ox = 2*ts
    rect(icons, ox+3, 4, ox+12, 12, PLATE)
    for yy in range(4, 13, 3):
        rect(icons, ox+3, yy, ox+12, yy, PLATE_DK)
    # blade
    ox = 3*ts
    for i in range(10):
        px(icons, ox+3+i, 12-i, HERO_BLADE)
        px(icons, ox+4+i, 12-i, HERO_BLADE_HI)
    rect(icons, ox+2, 12, ox+4, 13, HERO_STRAP)
    save(icons, os.path.join(UI, "icons.png"))
    print("ui: panel.png button.png bar_frame.png icons.png")


# ===========================================================================
# GRAPPLE ANCHOR / HOOK: 8x8 single sprite (the ODM hook that bites terrain).
# ===========================================================================
def build_hook():
    h = new(8, 8)
    rect(h, 2, 0, 5, 3, HERO_GEAR)
    px(h, 1, 3, HERO_GEAR)
    px(h, 6, 3, HERO_GEAR)
    px(h, 0, 4, HERO_GEAR)
    px(h, 7, 4, HERO_GEAR)
    rect(h, 3, 3, 4, 6, (150, 150, 158, 255))
    h = outline_alpha(h)
    save(h, os.path.join(SPR, "hook.png"))
    print("hook.png", h.size)


if __name__ == "__main__":
    build_hero()
    build_all_giants()
    build_citizens()
    build_tiles()
    build_backgrounds()
    build_fx()
    build_ui()
    build_hook()
    print("\nAll original pixel-art assets generated.")
