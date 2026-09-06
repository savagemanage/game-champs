#!/usr/bin/env python3
"""gen_fonts.py - build the subset UI web fonts for Frosthold: Last Ember.

The UI is KOREAN-FIRST. Phaser rasterizes canvas text with whatever font the
browser resolves from the CSS font stack, so if no Korean-capable face is
available the Hangul renders as tofu (missing-glyph boxes). To make rendering
deterministic across every browser/OS (and headless Chromium, which ships no
CJK fonts), we bundle a Korean-capable web font instead of relying on system
fonts.

Font: Nanum Gothic Coding (SIL Open Font License 1.1) - a MONOSPACE Hangul
face, so it preserves the intended crisp monospace grid of UiText.ts while
covering every Korean glyph the game uses.

To keep the bundle small, the font is SUBSET to only the characters that appear
in the runtime string table (src/i18n/strings.ts) plus a safety set of ASCII,
digits, punctuation and common symbols. Re-run this script whenever strings.ts
gains new characters:

    pip install fonttools brotli
    python tools/gen_fonts.py \
        --regular /path/to/NanumGothicCoding-Regular.ttf \
        --bold /path/to/NanumGothicCoding-Bold.ttf

Source TTFs (OFL) come from the Google Fonts repository:
    https://github.com/google/fonts/tree/main/ofl/nanumgothiccoding

Output: public/assets/fonts/NanumGothicCoding-{Regular,Bold}.subset.woff2
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

try:
    from fontTools import subset
except ImportError:  # pragma: no cover - tooling guard
    sys.exit("fonttools is required: pip install fonttools brotli")

ROOT = Path(__file__).resolve().parent.parent
STRINGS_TS = ROOT / "src" / "i18n" / "strings.ts"
OUT_DIR = ROOT / "public" / "assets" / "fonts"

# String literals in strings.ts are single-quoted; pull the text out of every
# `en:` / `ko:` value so the subset covers exactly what the game can display.
VALUE_RE = re.compile(r"(?:en|ko)\s*:\s*'((?:[^'\\]|\\.)*)'")

# Always keep a baseline set so numbers, punctuation and interpolated values
# (percentages, counts, resource amounts) render even if a glyph is not present
# in the static table.
BASELINE = (
    "0123456789"
    "abcdefghijklmnopqrstuvwxyz"
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    " .,:;!?'\"()[]{}<>/\\|-_+=*%#@&^~`"
    "×÷…·—–°"
)


def collect_characters() -> set[str]:
    text = STRINGS_TS.read_text(encoding="utf-8")
    chars: set[str] = set(BASELINE)
    for match in VALUE_RE.finditer(text):
        raw = match.group(1)
        # Unescape the handful of escapes that can appear in the table.
        raw = raw.replace("\\'", "'").replace('\\"', '"').replace("\\\\", "\\")
        chars.update(raw)
    # Drop control characters that make no sense in a glyph set.
    return {c for c in chars if ord(c) >= 0x20}


def subset_font(src: Path, dst: Path, text: str) -> None:
    args = [
        str(src),
        f"--text={text}",
        "--flavor=woff2",
        f"--output-file={dst}",
        "--layout-features=*",
        "--no-hinting",
        "--desubroutinize",
        "--drop-tables+=DSIG",
    ]
    subset.main(args)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--regular", required=True, help="path to NanumGothicCoding-Regular.ttf")
    parser.add_argument("--bold", required=True, help="path to NanumGothicCoding-Bold.ttf")
    ns = parser.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    chars = collect_characters()
    text = "".join(sorted(chars))
    print(f"Subsetting {len(chars)} unique glyphs from strings.ts + baseline.")

    subset_font(Path(ns.regular), OUT_DIR / "NanumGothicCoding-Regular.subset.woff2", text)
    subset_font(Path(ns.bold), OUT_DIR / "NanumGothicCoding-Bold.subset.woff2", text)

    for f in sorted(OUT_DIR.glob("*.woff2")):
        print(f"  wrote {f.relative_to(ROOT)} ({f.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
