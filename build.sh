#!/usr/bin/env bash

set -euo pipefail

cd "$(dirname "$0")"

echo "New API Desktop - Tauri build"
echo
echo "[1/2] Installing locked dependencies..."
npm ci

echo
echo "[2/2] Packaging the Tauri application..."
case "${OSTYPE:-}" in
  darwin*) npm run build:mac ;;
  linux-gnu*) npm run build:linux ;;
  msys*|cygwin*|win32*) npm run build:win ;;
  *) npm run build ;;
esac

echo
echo "Build complete. Artifacts are in src-tauri/target/release/bundle/."
