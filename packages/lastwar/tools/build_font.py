#!/usr/bin/env python3
"""Instantiate Noto Sans KR at wght=400 and subset it to a UI-appropriate
glyph set for LAST SQUAD's Korean-first UI.

Subset = full modern precomposed Hangul syllables (AC00-D7A3) + Hangul
compatibility jamo (3130-318F) + Latin/digits/punctuation (ASCII + Latin-1
supplement) + common symbols the UI uses (star, middot, arrows, ellipsis,
multiplication sign). This guarantees every Korean string in
src/i18n/strings.ts renders (coverage is asserted below) while keeping the
woff2 small. Run from the repo root:

    python3 tools/build_font.py <src-variable-ttf> <out-woff2>
"""
import sys, re
from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

SRC = sys.argv[1]
OUT_WOFF2 = sys.argv[2]
STRINGS = "src/i18n/strings.ts"
OUT_TTF = OUT_WOFF2 + ".instance.ttf"

# 1) Collect every character used in the string-table literal values.
with open(STRINGS, encoding="utf-8") as fh:
    text = fh.read()
vals = re.findall(r"(?:en|ko):\s*'((?:[^'\\]|\\.)*)'", text)
vals += re.findall(r'(?:en|ko):\s*"((?:[^"\\]|\\.)*)"', text)
ui_chars = set()
for v in vals:
    ui_chars.update(v)
# Defensive: sweep the whole file for any Hangul jamo/syllable, in case a
# multi-line entry used a quoting style the regex above missed.
for ch in text:
    o = ord(ch)
    if 0xAC00 <= o <= 0xD7A3 or 0x3130 <= o <= 0x318F or 0x1100 <= o <= 0x11FF:
        ui_chars.add(ch)

hangul_used = sorted(c for c in ui_chars if 0xAC00 <= ord(c) <= 0xD7A3)
jamo_used = sorted(c for c in ui_chars if 0x3130 <= ord(c) <= 0x318F)
other_used = sorted(
    c for c in ui_chars
    if ord(c) > 0x7F
    and not (0xAC00 <= ord(c) <= 0xD7A3)
    and not (0x3130 <= ord(c) <= 0x318F)
)
print(f"UI hangul syllables used: {len(hangul_used)}")
print(f"UI compat jamo used: {len(jamo_used)} -> {''.join(jamo_used)}")
print(f"UI other non-ASCII used: {len(other_used)} -> {''.join(other_used)}")

# 2) Planned subset unicode set.
unicodes = set()
unicodes.update(range(0x20, 0x7F))       # ASCII printable
unicodes.update(range(0xA0, 0x100))      # Latin-1 supplement
unicodes.update(range(0xAC00, 0xD7A4))   # full modern Hangul syllables
unicodes.update(range(0x3130, 0x3190))   # Hangul compatibility jamo
unicodes.update([
    0x2018, 0x2019, 0x201C, 0x201D,      # curly quotes
    0x2013, 0x2014,                      # en/em dash
    0x2026,                              # ellipsis
    0x00B7, 0x2022,                      # middot, bullet
    0x2605, 0x2606,                      # black/white star
    0x2190, 0x2191, 0x2192, 0x2193,      # arrows
    0x00D7,                              # multiplication sign
])

missing_from_plan = [c for c in ui_chars if ord(c) not in unicodes]
if missing_from_plan:
    print("Adding used chars not in planned set:", [hex(ord(c)) for c in missing_from_plan])
    unicodes.update(ord(c) for c in missing_from_plan)

# 3) Instantiate the variable font at Regular (wght=400).
font = TTFont(SRC)
if "fvar" in font:
    instantiateVariableFont(font, {"wght": 400}, inplace=True)
font.save(OUT_TTF)

cmap = font.getBestCmap()
uncovered = [c for c in ui_chars if ord(c) not in cmap]
if uncovered:
    print("FATAL: source font missing glyphs for:", [hex(ord(c)) for c in uncovered])
    sys.exit(1)
print("Source instance covers all UI chars: OK")

# 4) Subset to woff2.
font2 = TTFont(OUT_TTF)
ss = subset.Subsetter(options=subset.Options(layout_features="*", name_IDs="*", recalc_bounds=True))
ss.populate(unicodes=sorted(unicodes))
ss.subset(font2)
font2.flavor = "woff2"
font2.save(OUT_WOFF2)

sub_cmap = font2.getBestCmap()
still_missing = [c for c in ui_chars if ord(c) not in sub_cmap]
if still_missing:
    print("FATAL: subset missing:", [hex(ord(c)) for c in still_missing])
    sys.exit(1)
print(f"Subset covers all {len(ui_chars)} distinct UI chars: OK")
print("Subset cmap entries:", len(sub_cmap))
