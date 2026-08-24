#!/usr/bin/env bash
# Install a Chromium that playwright-core can drive, on Termux or Debian proot.
# playwright's own download does not ship ARM64 Linux builds, so we use the
# system package and point CHROMIUM_PATH at it.
set -e

echo "== lexusagent browser setup =="

find_chromium() {
  for c in chromium chromium-browser google-chrome chrome; do
    if command -v "$c" >/dev/null 2>&1; then
      command -v "$c"
      return 0
    fi
  done
  for p in /usr/bin/chromium /usr/bin/chromium-browser /data/data/com.termux/files/usr/bin/chromium; do
    [ -x "$p" ] && echo "$p" && return 0
  done
  return 1
}

BIN=$(find_chromium || true)

if [ -z "$BIN" ]; then
  echo "Installing chromium..."
  if command -v pkg >/dev/null 2>&1; then
    pkg install -y chromium
  else
    apt-get update
    apt-get install -y chromium || apt-get install -y chromium-browser
  fi
  BIN=$(find_chromium || true)
fi

if [ -z "$BIN" ]; then
  echo "❌ Could not install chromium automatically."
  echo "   Install it manually, then set CHROMIUM_PATH=/path/to/chromium in .env"
  exit 1
fi

echo "✅ chromium: $BIN"
"$BIN" --version || true

if grep -q '^CHROMIUM_PATH=' .env 2>/dev/null; then
  sed -i "s|^CHROMIUM_PATH=.*|CHROMIUM_PATH=$BIN|" .env
else
  echo "CHROMIUM_PATH=$BIN" >> .env
fi

echo "✅ CHROMIUM_PATH written to .env"
echo "Run: npm start"
