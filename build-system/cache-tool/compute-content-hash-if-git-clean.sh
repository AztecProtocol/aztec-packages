#!/usr/bin/env bash
set -euo pipefail

if ! git diff-index --quiet HEAD --; then
  echo "Warning: You have unstaged changes. Disabling aztec cache tool caching." >&2
  echo "uncommitted-changes"
  exit
fi

$(dirname $0)/compute-content-hash.sh