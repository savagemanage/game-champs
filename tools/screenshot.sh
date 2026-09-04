#!/bin/sh
# screenshot.sh - OPTIONAL, failure-tolerant (spec 0). Renders one frame via a
# virtual framebuffer and saves a PNG. Its absence must NOT block other
# verification, so a missing xvfb-run exits 0 with a hint.
#
# Spec 4 (evolution-screen) attaches the real evolution screen here.
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BIN="$ROOT_DIR/.godot-bin/godot"

if ! command -v xvfb-run >/dev/null 2>&1; then
	echo "[screenshot] xvfb-run not found; skipping screenshot (this is OK)."
	echo "[screenshot]   Debian/Ubuntu: apt-get install xvfb"
	echo "[screenshot]   Fedora:        dnf install xorg-x11-server-Xvfb"
	exit 0
fi

"$SCRIPT_DIR/setup-godot.sh"

cd "$ROOT_DIR"
"$BIN" --headless --import . >/dev/null 2>&1 || true

echo "[screenshot] rendering one frame (opengl3, virtual framebuffer) ..."
xvfb-run -s "-screen 0 1280x720x24" \
	"$BIN" --rendering-driver opengl3 -s res://tests/shot.gd
