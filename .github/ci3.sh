#!/usr/bin/env bash
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: $0 <ci-mode>"
  exit 1
fi

exec ./ci.sh "$1"
