#!/usr/bin/env bash
[ -n "${BUILD_SYSTEM_DEBUG:-}" ] && set -x # conditionally trace
set -eu

# Check node version.
node_version=$(node -v | tr -d 'v')
major=${node_version%%.*}
rest=${node_version#*.}
minor=${rest%%.*}

YELLOW="\033[93m"
BOLD="\033[1m"
RESET="\033[0m"

if ((major < 18 || (major == 18 && minor < 19))); then
  echo "Node.js version is less than 18.19. Exiting."
  exit 1
fi

cd "$(dirname "$0")"

CMD=${1:-}

if [ -n "$CMD" ]; then
  if [ "$CMD" = "clean" ]; then
    git clean -fdx
    exit 0
  else
    echo "Unknown command: $CMD"
    exit 1
  fi
fi

# Fast build does not delete everything first.
# It regenerates all generated code, then performs an incremental tsc build.
echo -e "${YELLOW}${BOLD}Performing fast incremental build. If this has any issues, run 'yarn build'.${RESET}"
echo
yarn install --immutable
yarn build:fast

echo
echo "Yarn project successfully built."
