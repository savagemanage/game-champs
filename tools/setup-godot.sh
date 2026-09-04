#!/bin/sh
# setup-godot.sh - idempotent auto-download of Godot 4.7.2-stable STANDARD
# (NON-mono) linux x86_64 into .godot-bin/godot.
#
# Steering section 8 (spec 0 harness): the project must be able to validate
# itself headlessly in a cloud session or locally. Godot 4 has no separate
# "server" build; the standard binary supports --headless.
#
#   GODOT_VERSION   override the version (default 4.7.2-stable)
#
# No sudo. Never commits the binary (.godot-bin/ is gitignored).
set -eu

# ---------------------------------------------------------------------
# TUNING CONSTANTS
# ---------------------------------------------------------------------
GODOT_VERSION="${GODOT_VERSION:-4.7.2-stable}"
REPO="godotengine/godot-builds"
# Directory of this script -> repo root is its parent.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BIN_DIR="$ROOT_DIR/.godot-bin"
BIN="$BIN_DIR/godot"
# Standard (non-mono) linux x86_64 asset naming convention.
ASSET_NAME="Godot_v${GODOT_VERSION}_linux.x86_64.zip"
API_URL="https://api.github.com/repos/${REPO}/releases/tags/${GODOT_VERSION}"
FALLBACK_URL="https://github.com/${REPO}/releases/download/${GODOT_VERSION}/${ASSET_NAME}"

ALLOWLIST="github.com api.github.com codeload.github.com release-assets.githubusercontent.com"

# ---------------------------------------------------------------------
# Idempotent: exit immediately if the binary already exists.
# ---------------------------------------------------------------------
if [ -x "$BIN" ]; then
	echo "[setup-godot] $BIN already present:"
	"$BIN" --version
	exit 0
fi

# ---------------------------------------------------------------------
# Required tools.
# ---------------------------------------------------------------------
if ! command -v curl >/dev/null 2>&1; then
	echo "[setup-godot] ERROR: 'curl' is required but not installed." >&2
	echo "[setup-godot]   Debian/Ubuntu: apt-get install curl" >&2
	echo "[setup-godot]   Fedora:        dnf install curl" >&2
	echo "[setup-godot]   Alpine:        apk add curl" >&2
	exit 1
fi
if ! command -v unzip >/dev/null 2>&1; then
	echo "[setup-godot] ERROR: 'unzip' is required but not installed." >&2
	echo "[setup-godot]   Debian/Ubuntu: apt-get install unzip" >&2
	echo "[setup-godot]   Fedora:        dnf install unzip" >&2
	echo "[setup-godot]   Alpine:        apk add unzip" >&2
	exit 1
fi

net_fail() {
	echo "[setup-godot] ERROR: could not download Godot ${GODOT_VERSION} (network blocked)." >&2
	echo "[setup-godot] The proxy allowlist must permit these hosts:" >&2
	for host in $ALLOWLIST; do
		echo "[setup-godot]   - $host" >&2
	done
	exit 2
}

mkdir -p "$BIN_DIR"
TMP_DIR="$(mktemp -d)"
# Best-effort cleanup of the temp dir.
trap 'rm -rf "$TMP_DIR"' EXIT INT TERM
ZIP="$TMP_DIR/godot.zip"

echo "[setup-godot] installing Godot ${GODOT_VERSION} (standard linux.x86_64) ..."

# ---------------------------------------------------------------------
# Resolve the real asset download URL via the GitHub Releases API. Pick the
# asset whose name contains 'linux.x86_64' and does NOT contain 'mono'. Do not
# hardcode the filename as the only path.
# ---------------------------------------------------------------------
DOWNLOAD_URL=""
API_JSON="$TMP_DIR/release.json"
if curl -fsSL "$API_URL" -o "$API_JSON" 2>/dev/null; then
	# Extract browser_download_url values, keep the standard linux x86_64 zip.
	DOWNLOAD_URL="$(
		grep -o '"browser_download_url"[[:space:]]*:[[:space:]]*"[^"]*"' "$API_JSON" \
			| sed 's/.*"browser_download_url"[[:space:]]*:[[:space:]]*"//; s/"$//' \
			| grep 'linux\.x86_64\.zip$' \
			| grep -v -i 'mono' \
			| head -n 1
	)"
fi

if [ -z "$DOWNLOAD_URL" ]; then
	echo "[setup-godot] API lookup unavailable; falling back to convention URL." >&2
	DOWNLOAD_URL="$FALLBACK_URL"
fi

echo "[setup-godot] downloading: $DOWNLOAD_URL"
if ! curl -fsSL "$DOWNLOAD_URL" -o "$ZIP"; then
	net_fail
fi

# ---------------------------------------------------------------------
# Unzip and normalise the binary name to .godot-bin/godot.
# ---------------------------------------------------------------------
if ! unzip -o -q "$ZIP" -d "$TMP_DIR"; then
	echo "[setup-godot] ERROR: unzip failed (corrupt/partial download)." >&2
	exit 1
fi

EXTRACTED="$(find "$TMP_DIR" -type f -name 'Godot_v*_linux.x86_64' | head -n 1)"
if [ -z "$EXTRACTED" ]; then
	# Some archives may expose a differently-suffixed executable; fall back to
	# any file with the Godot_v prefix that is not the zip.
	EXTRACTED="$(find "$TMP_DIR" -type f -name 'Godot_v*' ! -name '*.zip' | head -n 1)"
fi
if [ -z "$EXTRACTED" ]; then
	echo "[setup-godot] ERROR: no Godot binary found inside the archive." >&2
	exit 1
fi

mv "$EXTRACTED" "$BIN"
chmod +x "$BIN"

echo "[setup-godot] installed. verifying:"
"$BIN" --version
echo "[setup-godot] done -> $BIN"
