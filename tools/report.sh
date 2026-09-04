#!/bin/sh
# report.sh - STUB report dumper (spec 0). For now it only writes the CSV
# HEADER (interface fixed for spec 3 evolution-core, which fills the body).
#
#   ./tools/report.sh --seed=42 --generations=200 --out=reports/evo.csv
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BIN="$ROOT_DIR/.godot-bin/godot"

# Defaults; overridable via args (which are also forwarded to the .gd script).
SEED=42
GENERATIONS=200
OUT="reports/evo.csv"
for arg in "$@"; do
	case "$arg" in
		--seed=*)        SEED="${arg#*=}" ;;
		--generations=*) GENERATIONS="${arg#*=}" ;;
		--out=*)         OUT="${arg#*=}" ;;
	esac
done

"$SCRIPT_DIR/setup-godot.sh"

cd "$ROOT_DIR"
"$BIN" --headless --import . >/dev/null 2>&1 || true

echo "[report] writing CSV header to $OUT (seed=$SEED generations=$GENERATIONS) ..."
"$BIN" --headless -s res://tests/report.gd -- \
	--seed="$SEED" --generations="$GENERATIONS" --out="$OUT"
