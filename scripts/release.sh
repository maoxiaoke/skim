#!/usr/bin/env bash
set -euo pipefail

# Usage: ./scripts/release.sh <version>
#   e.g. ./scripts/release.sh 0.2.18
#
# What it does:
#   1. Bumps version in tauri.conf.json, Cargo.toml, package.json
#   2. Commits, pushes
#   3. Tags v<version>, pushes tag → triggers CI release build

VERSION="${1:-}"

if [[ -z "$VERSION" ]]; then
  echo "Usage: $0 <version>   e.g. $0 0.2.18" >&2
  exit 1
fi

# Validate semver shape
if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Error: version must be X.Y.Z (got '$VERSION')" >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# Guard: must be on main with a clean working tree
BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [[ "$BRANCH" != "main" ]]; then
  echo "Error: must be on main (currently on '$BRANCH')" >&2
  exit 1
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Error: working tree is dirty — commit or stash changes first" >&2
  exit 1
fi

# Guard: tag must not already exist
if git rev-parse "v$VERSION" &>/dev/null; then
  echo "Error: tag v$VERSION already exists" >&2
  exit 1
fi

echo "Bumping to $VERSION …"

# tauri.conf.json
sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" src-tauri/tauri.conf.json

# Cargo.toml — first [package] version line only
sed -i '' "1,/^version = /s/^version = \"[^\"]*\"/version = \"$VERSION\"/" src-tauri/Cargo.toml

# package.json
sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" package.json

echo "Committing …"
git add src-tauri/tauri.conf.json src-tauri/Cargo.toml package.json
git commit -m "chore: release v$VERSION"

echo "Pushing …"
git push

echo "Tagging v$VERSION …"
git tag "v$VERSION"
git push origin "v$VERSION"

echo ""
echo "Done — v$VERSION pushed. CI build started."
echo "Watch: https://github.com/maoxiaoke/skim/actions"
