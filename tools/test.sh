#!/bin/sh
# test.sh - headless test runner (see handoff.md "How to run the harness").
# Runs the from-scratch
# SceneTree test runner (tests/cli.gd) over res://tests/cases/*.gd.
#
# Extra args pass through to the runner, e.g.:
#   ./tools/test.sh --filter=near
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BIN="$ROOT_DIR/.godot-bin/godot"

# 1. Ensure the engine is installed (propagates its exit code on failure).
"$SCRIPT_DIR/setup-godot.sh"

cd "$ROOT_DIR"

# 2. Import so class_name (TestCase) is registered before the runner loads.
echo "[test] importing project ..."
"$BIN" --headless --import . >/dev/null 2>&1 || true

# 3. Run the runner. Args after `--` reach OS.get_cmdline_user_args().
echo "[test] running tests/cli.gd (seed=42) ..."
"$BIN" --headless -s res://tests/cli.gd -- --seed=42 "$@"
