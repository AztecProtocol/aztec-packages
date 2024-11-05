#!/usr/bin/env bash
[ -n "${BUILD_SYSTEM_DEBUG:-}" ] && set -x # conditionally trace
set -eu

YELLOW="\033[93m"
BLUE="\033[34m"
GREEN="\033[32m"
BOLD="\033[1m"
RESET="\033[0m"

cd "$(dirname "$0")"

CMD=${1:-}

if [ "$CMD" = "clean" ]; then
  git clean -fdx
  exit 0
fi

# Generate l1-artifacts before creating lock file
(cd l1-artifacts && bash ./scripts/generate-artifacts.sh)

if [ "$CMD" = "full" ]; then
  yarn install --immutable
  yarn build
  exit 0
elif [ "$CMD" = "fast-only" ]; then
  # Unlike fast build below, we don't fall back to a normal build.
  # This is used when we want to ensure that fast build works.
  yarn install --immutable
  yarn build:fast
  exit 0
elif [[ -n "$CMD" && "$CMD" != "fast" ]]; then
  echo "Unknown command: $CMD"
  exit 1
fi

# Fast build does not delete everything first.
# It regenerates all generated code, then performs an incremental tsc build.
echo -e "${BLUE}${BOLD}Attempting fast incremental build...${RESET}"
echo
yarn install --immutable

if ! yarn build:fast; then
  echo -e "${YELLOW}${BOLD}Incremental build failed for some reason, attempting full build...${RESET}"
  echo
  yarn build
fi

echo
echo -e "${GREEN}Yarn project successfully built!${RESET}"
