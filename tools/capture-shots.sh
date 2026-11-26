#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Render ?shot= scenes with headless Chromium (SwiftShader) from the local dev server and convert
# them to JPEG screenshots under the 256 KiB cap.
#   tools/capture-shots.sh                      -> all four shots into screenshots/
#   tools/capture-shots.sh cover "&cy=0.5" out/scratch/try.png   -> one PNG, extra query args
set -euo pipefail
cd "$(dirname "$0")/.."
PORT="${PORT:-8731}"
CHROME="${CHROME:-$HOME/.cache/ms-playwright/chromium_headless_shell-1148/chrome-linux/headless_shell}"
MAX_BYTES=262144

render() { # name extra-query png
  "$CHROME" --no-sandbox --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist \
    --window-size=1280,800 --virtual-time-budget=8000 --enable-logging=stderr --v=0 \
    --screenshot="$3" "http://127.0.0.1:${PORT}/index.html?shot=$1$2" 2>&1 | grep -i "console\|uncaught\|error" | grep -v "gpu\|GL_\|dbus\|sandbox\|Fontconfig" || true
}

to_jpeg() { # png jpg
  local q=2
  while :; do
    ffmpeg -loglevel error -y -i "$1" -q:v "$q" "$2"
    local size
    size=$(stat -c %s "$2")
    if [ "$size" -le "$MAX_BYTES" ] || [ "$q" -ge 12 ]; then echo "$2 $size bytes (q=$q)"; break; fi
    q=$((q + 1))
  done
}

if [ $# -ge 1 ]; then
  render "$1" "${2:-}" "${3:-out/scratch/$1.png}"
  exit 0
fi

mkdir -p screenshots out/scratch
i=1
for name in cover approach cockpit menu; do
  render "$name" "" "out/scratch/shot-$name.png"
  to_jpeg "out/scratch/shot-$name.png" "screenshots/$i-$name.jpg"
  i=$((i + 1))
done
