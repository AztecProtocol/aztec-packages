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

if [ "${CI:-0}" -eq 1 ]; then
  yarn test

  cd end-to-end
  PR_TESTS=(
    e2e_2_pxes
    e2e_authwit
    e2e_avm_simulator
    e2e_block_building
    # e2e_cheat_codes
    e2e_cross_chain_messaging
    e2e_crowdfunding_and_claim
    e2e_deploy_contract
    e2e_fees/failures
    e2e_fees/gas_estimation
    e2e_fees/private_payments
    e2e_lending_contract
    e2e_max_block_number
    e2e_nested_contract
    e2e_ordering
    e2e_prover_coordination
    e2e_static_calls
  )
  MASTER_TESTS=$PR_TESTS
  MASTER_TESTS+=() # TODO: add additional tests for master.

  rm -rf results/[a-z0-9]*
  set +e
  parallel --verbose --joblog joblog.txt --results results/{}/ --halt now,fail=1 yarn test {} ::: ${PR_TESTS[@]}
  set -e

  awk 'NR > 1 && $7 != 0 {print $11}' joblog.txt | while read -r job; do
    stdout_file="results/${job}/stdout"
    stderr_file="results/${job}/stderr"
    if [ -f "$stdout_file" ]; then
      echo "=== Failed Job Output: $stdout_file ==="
      cat "$stdout_file"
    fi
    if [ -f "$stderr_file" ]; then
      echo "=== Failed Job Output: $stderr_file ==="
      cat "$stderr_file"
    fi
  done
fi