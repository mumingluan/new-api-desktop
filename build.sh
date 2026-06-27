#!/usr/bin/env bash

set -euo pipefail

echo "Building New API Desktop Shell..."

if [[ ! -d "web/default/dist" || ! -d "web/classic/dist" ]]; then
  echo "Missing frontend build artifacts."
  echo "Please prepare:"
  echo "  web/default/dist"
  echo "  web/classic/dist"
  exit 1
fi

npm install

case "${OSTYPE:-}" in
  darwin*)
    npm run build:mac
    ;;
  linux-gnu*)
    npm run build:linux
    ;;
  msys*|cygwin*|win32*)
    npm run build:win
    ;;
  *)
    npm run build
    ;;
esac

echo "Build complete. Check dist/ for output."
