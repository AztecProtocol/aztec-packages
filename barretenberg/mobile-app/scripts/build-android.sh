#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../android"

if ! command -v gradle >/dev/null 2>&1; then
  echo "gradle is required. CI installs it with gradle/actions/setup-gradle." >&2
  exit 127
fi

gradle --no-daemon :app:assembleDebug
