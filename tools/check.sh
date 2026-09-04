#!/bin/sh
# check.sh - parse/import gate (see handoff.md "How to run the harness").
# Imports the project (which
# registers class_name across the codebase) then does a headless quit, and
# fails if any SCRIPT ERROR / Parse Error / Failed to load appears.
#
# Godot emits RID/ObjectDB "leaked" logs on a NORMAL headless exit; those are
# NOT failures and must not be grepped for.
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BIN="$ROOT_DIR/.godot-bin/godot"

# 1. Ensure the engine is installed (propagates its exit code on failure).
"$SCRIPT_DIR/setup-godot.sh"

cd "$ROOT_DIR"

# Capture combined stdout+stderr of both passes.
LOG="$(mktemp)"
trap 'rm -f "$LOG"' EXIT INT TERM

echo "[check] importing project (registers class_name) ..."
# --import must NOT be skipped. It may exit non-zero on some setups even when
# import succeeded, so we rely on the log grep below for the real verdict.
"$BIN" --headless --import . >>"$LOG" 2>&1 || true

echo "[check] headless quit ..."
"$BIN" --headless --quit >>"$LOG" 2>&1 || true

echo "----- godot output -----"
cat "$LOG"
echo "------------------------"

if grep -Eq 'SCRIPT ERROR|Parse Error|Failed to load' "$LOG"; then
	echo "[check] FAIL: parse/load errors detected:" >&2
	grep -E 'SCRIPT ERROR|Parse Error|Failed to load' "$LOG" >&2
	exit 1
fi

echo "[check] OK: no parse/load errors."
exit 0
