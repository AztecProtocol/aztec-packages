#!/usr/bin/env bash
set -euo pipefail

cd $(git rev-parse --show-toplevel)

if ! git -C noir/noir-repo describe --tags --exact-match HEAD &>/dev/null; then
  echo >&2 "noir/noir-repo submodule should be pointing at an official release tag."
  exit 1
fi

# Check if the noir-repo submodule hash is being modified in the staged changes
if git diff --cached --submodule=short noir/noir-repo | grep -q "^-Subproject commit\|^+Subproject commit"; then
  echo ""
  echo "⚠️  WARNING: You are about to change the noir/noir-repo submodule hash"
  echo ""

  if [ -t 0 ]; then
    # Ask for confirmation
    read -p "Do you really want to commit this submodule change? (y/N): " -n 1 -r
    echo ""

    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
      echo "Commit aborted."
      echo ""
      echo "Maybe you want to re-pull submodules with:"
      echo "  git submodule update --init --recursive"
      echo ""
      exit 1
    fi
  else
    echo "You can git commit --no-verify if you're sure."
    exit 1
  fi
fi
