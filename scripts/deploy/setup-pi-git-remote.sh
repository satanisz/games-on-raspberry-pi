#!/usr/bin/env bash
set -Eeuo pipefail

# Run this script on Raspberry Pi from the project root.

REPO_DIR="${REPO_DIR:-/home/satanisz/repos/malinka.git}"
APP_DIR="${APP_DIR:-/home/satanisz/projects/queens}"
HOOK_SOURCE="${HOOK_SOURCE:-scripts/deploy/post-receive}"

mkdir -p "$(dirname "$REPO_DIR")" "$APP_DIR"

if [[ ! -d "$REPO_DIR" ]]; then
  git init --bare "$REPO_DIR"
fi

if [[ ! -f "$HOOK_SOURCE" ]]; then
  echo "Hook source not found: $HOOK_SOURCE"
  echo "Run from project root or set HOOK_SOURCE=/path/to/post-receive"
  exit 1
fi

cp "$HOOK_SOURCE" "$REPO_DIR/hooks/post-receive"
chmod +x "$REPO_DIR/hooks/post-receive"

echo "Bare repository ready: $REPO_DIR"
echo "Deploy target ready: $APP_DIR"
echo "Add this remote locally:"
echo "  git remote add pi $(whoami)@$(hostname -I | awk '{print $1}'):$REPO_DIR"
