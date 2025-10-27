#!/usr/bin/env bash
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: $0 <ci-mode>"
  exit 1
fi

: "${AWS_ACCESS_KEY_ID:?required}"
: "${AWS_SECRET_ACCESS_KEY:?required}"
: "${GITHUB_TOKEN:?required}"

exec ./ci.sh "$1"
