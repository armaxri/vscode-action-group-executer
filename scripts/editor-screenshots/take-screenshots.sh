#!/usr/bin/env bash
# Renders the action group editor webview with sample data in headless Chrome and
# writes the README screenshot to images/docs/. Run "npm run compile" first.
set -euo pipefail

root="$(cd "$(dirname "$0")/../.." && pwd)"
chrome="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
port="${PORT:-8765}"
profile="$(mktemp -d)"

python3 -m http.server "$port" --bind 127.0.0.1 --directory "$root" >/dev/null 2>&1 &
server=$!
trap 'kill $server; rm -rf "$profile"' EXIT
sleep 1

shoot() {
    local name="$1" query="$2" size="$3"
    "$chrome" --headless=new --disable-gpu --hide-scrollbars --user-data-dir="$profile" \
        --force-device-scale-factor=2 --window-size="$size" --virtual-time-budget=4000 \
        --screenshot="$root/images/docs/$name.png" \
        "http://127.0.0.1:$port/scripts/editor-screenshots/index.html?$query" >/dev/null 2>&1
    echo "images/docs/$name.png"
}

shoot editor-new "scenario=new" 1100,800
