#!/usr/bin/env bash
# Build Canv installers.
#
#   ./build.sh              # current host platform
#   ./build.sh linux        # AppImage + .deb + .rpm
#   ./build.sh mac          # .dmg + .zip   (requires macOS)
#   ./build.sh win          # .exe          (requires Windows or wine)
#   ./build.sh all          # all three
#
# Output: ./release/

set -euo pipefail
cd "$(dirname "$0")"

target="${1:-host}"

if [[ "$target" == "host" ]]; then
  case "$(uname -s)" in
    Darwin) target=mac ;;
    Linux)  target=linux ;;
    MINGW*|MSYS*|CYGWIN*) target=win ;;
    *) echo "Unknown host OS — pass linux|mac|win|all explicitly." >&2; exit 1 ;;
  esac
fi

case "$target" in
  linux) npm run electron:build:linux ;;
  mac)   npm run electron:build:mac ;;
  win)   npm run electron:build:win ;;
  all)
    npm run electron:build:linux
    npm run electron:build:mac
    npm run electron:build:win
    ;;
  *)
    echo "Usage: $0 [linux|mac|win|all]" >&2
    exit 1
    ;;
esac

echo
echo "Built artefacts in ./release/:"
ls -1 release/ | grep -E '\.(AppImage|deb|rpm|dmg|zip|exe)$' || true
