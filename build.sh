#!/usr/bin/env bash

set -euo pipefail

cd "$(dirname "$0")"

echo "New-API-Desktop build"
echo
echo "Before continuing, build the latest frontend in the new-api repository:"
echo "  cd /path/to/new-api/web"
echo "  bun install --frozen-lockfile"
echo "  bun run build"
echo
echo "Then replace this directory with the new build output:"
echo "  web/default/dist  <-  /path/to/new-api/web/dist"
echo
read -r -p "Has the latest frontend been copied? [y/N] " confirmed
case "${confirmed}" in
  y|Y|yes|YES) ;;
  *)
    echo "Build cancelled."
    exit 0
    ;;
esac

if [[ ! -f "web/default/dist/index.html" ]]; then
  echo "Error: web/default/dist/index.html was not found."
  echo "Build and copy the latest new-api frontend first."
  exit 1
fi

echo
echo "[1/3] Installing desktop dependencies..."
npm ci

echo
echo "[2/3] Building the Classic frontend..."
npm run build:classic

if [[ ! -f "web/classic/dist/index.html" ]]; then
  echo "Error: Classic frontend build output was not created."
  exit 1
fi

echo
echo "[3/3] Packaging New-API-Desktop..."
case "${OSTYPE:-}" in
  darwin*) npm run build:mac ;;
  linux-gnu*) npm run build:linux ;;
  msys*|cygwin*|win32*) npm run build:win ;;
  *) npm run build ;;
esac

echo
echo "Build complete. Artifacts are in dist/."
