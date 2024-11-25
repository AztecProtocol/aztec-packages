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

function build {
  # Generate l1-artifacts before creating lock file
  (cd l1-artifacts && bash ./scripts/generate-artifacts.sh)

  # Fast build does not delete everything first.
  # It regenerates all generated code, then performs an incremental tsc build.
  echo -e "${BLUE}${BOLD}Attempting fast incremental build...${RESET}"
  echo
  yarn install --immutable

  case "${1:-}" in
    "fast") yarn build::fast;;
    "full") yarn build;;
    *)
      if ! yarn build:fast; then
        echo -e "${YELLOW}${BOLD}Incremental build failed for some reason, attempting full build...${RESET}\n"
        yarn build
      fi
  esac

  echo
  echo -e "${GREEN}Yarn project successfully built!${RESET}"
}

function run_e2e_tests {
  cd end-to-end

  # Pre-pull the required image for visibility.
  # TODO: We want to avoid this time burden. Slim the image? Preload it in from host?
  docker pull aztecprotocol/build:1.0

  # List every test individually. Do not put folders.
  # If a test flakes out, mark it as flake in your PR so it no longer runs, and post a message in slack about it.
  # If you can, try to find whoever is responsible for the test, and have them acknowledge they'll resolve it later.
  # DO NOT just re-run your PR and leave flakey tests running to impact on other engineers.
  # If you've been tasked with resolving a flakey test, use e.g. 'while my_test_cmd; do sleep 0; done' to grind it.
  PR_TESTS=(
    "simple e2e_2_pxes"
    "simple e2e_authwit"
    "simple e2e_avm_simulator"
    "simple e2e_cross_chain_messaging/l1_to_l2"
    "simple e2e_cross_chain_messaging/l2_to_l1"
    "simple e2e_cross_chain_messaging/token_bridge_failure_cases"
    "simple e2e_cross_chain_messaging/token_bridge_private"
    "simple e2e_cross_chain_messaging/token_bridge_public"
    "simple e2e_crowdfunding_and_claim"
    "simple e2e_deploy_contract/contract_class_registration"
    "simple e2e_deploy_contract/deploy_method"
    "simple e2e_deploy_contract/legacy"
    "simple e2e_deploy_contract/private_initialization"
    "simple e2e_fees/failures"
    "simple e2e_fees/gas_estimation"
    "simple e2e_fees/private_payments"
    "simple e2e_lending_contract"
    "simple e2e_max_block_number"
    "simple e2e_nested_contract/importer"
    "simple e2e_nested_contract/manual_private_call"
    "simple e2e_nested_contract/manual_private_enqueue"
    "simple e2e_nested_contract/manual_public"
    "simple e2e_ordering"
    "simple e2e_prover_coordination"
    "simple e2e_static_calls"
    "flake e2e_block_building"

    "simple e2e_p2p/gossip_network"
    "simple e2e_p2p/rediscovery"
    "simple e2e_p2p/reqresp"
    "flake e2e_p2p/upgrade_governance_proposer"

    "compose guides/dapp_testing"
    "compose guides/up_quick_start"
    "compose guides/writing_an_account_contract"
  )

  commands=()
  tests=()
  for pair in "${PR_TESTS[@]}"; do
      read -r cmd test <<< "$pair"
      commands+=("$cmd")
      tests+=("$test")
  done

  rm -rf results
  set +e
  parallel --timeout 15m --verbose --joblog joblog.txt --results results/{2}/ --halt now,fail=1 \
      ./scripts/test.sh {1} {2} ::: ${commands[@]} :::+ ${tests[@]}
  code=$?
  set -e

  awk 'NR > 1 && $7 != 0 {print $NF}' joblog.txt | while read -r job; do
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

  echo "=== Job Log ==="
  cat joblog.txt

  exit $code
}

case "$CMD" in
  "clean")
    git clean -fdx
  ;;
  "full")
    build full
  ;;
  "fast-only")
    build fast
  ;;
  ""|"fast")
    case "${CI:-0}" in
      0)
        build
      ;;
      1)
        build
        yarn test
        run_e2e_tests
      ;;
      2)
        run_e2e_tests
      ;;
    esac
  ;;
  *)
    echo "Unknown command: $CMD"
    exit 1
  ;;
esac
