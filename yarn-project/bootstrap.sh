#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}

hash=$(cache_content_hash ../noir/.rebuild_patterns* \
  ../{avm-transpiler,noir-projects,l1-contracts,yarn-project}/.rebuild_patterns \
  ../barretenberg/*/.rebuild_patterns)

function build {
  github_group "yarn-project build"

  # Generate l1-artifacts before creating lock file
  (cd l1-artifacts && ./scripts/generate-artifacts.sh)

  # Fast build does not delete everything first.
  # It regenerates all generated code, then performs an incremental tsc build.
  echo -e "${blue}${bold}Attempting fast incremental build...${reset}"
  denoise yarn install

  if ! cache_download yarn-project-$hash.tar.gz ; then
    case "${1:-}" in
      "fast")
        yarn build:fast
        ;;
      "full")
        yarn build
        ;;
      *)
        if ! yarn build:fast; then
          echo -e "${yellow}${bold}Incremental build failed for some reason, attempting full build...${reset}\n"
          yarn build
        fi
    esac

    denoise 'cd end-to-end && yarn build:web'

    # Find the directories that are not part of git, removing yarn artifacts and .tsbuildinfo
    files_to_upload=$(git ls-files --others --ignored --directory --exclude-standard | grep -v node_modules | grep -v .tsbuildinfo | grep -v \.yarn)
    cache_upload yarn-project-$hash.tar.gz $files_to_upload
    echo
    echo -e "${green}Yarn project successfully built!${reset}"
  fi
  github_endgroup
}

function test {
  if test_should_run yarn-project-unit-tests-$hash; then
    github_group "yarn-project unit test"
    denoise yarn test
    cache_upload_flag yarn-project-unit-tests-$hash
    github_endgroup
  fi

  test_e2e
}

function test_e2e {
  test_should_run yarn-project-e2e-tests-$hash || return

  github_group "yarn-project e2e tests"
  cd end-to-end

  # Pre-pull the required image for visibility.
  # TODO: We want to avoid this time burden. Slim the image? Preload it in from host?
  denoise docker pull aztecprotocol/build:2.0

  # List every test individually. Do not put folders. Ensures fair balancing of load and simplifies resource management.
  # If a test flakes out, mark it as flake in your PR so it no longer runs, and post a message in slack about it.
  # If you can, try to find whoever is responsible for the test, and have them acknowledge they'll resolve it later.
  # DO NOT just re-run your PR and leave flakey tests running to impact on other engineers.
  # If you've been tasked with resolving a flakey test, grind on it using e.g.:
  #    while ./scripts/test.sh simple e2e_2_pxes; do true; done
  TESTS=(
    "simple e2e_2_pxes"
    "simple e2e_account_contracts"
    "simple e2e_authwit"
    "simple e2e_avm_simulator"
    "simple e2e_blacklist_token_contract/access_control"
    "simple e2e_blacklist_token_contract/burn"
    "simple e2e_blacklist_token_contract/minting"
    "simple e2e_blacklist_token_contract/shielding"
    "simple e2e_blacklist_token_contract/transfer_private"
    "simple e2e_blacklist_token_contract/transfer_public"
    "simple e2e_blacklist_token_contract/unshielding"
    "flake e2e_block_building"
    "simple e2e_bot"
    "simple e2e_card_game"
    "simple e2e_cheat_codes"
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
    "simple e2e_escrow_contract"
    "simple e2e_event_logs"
    "simple e2e_fees/account_init"
    "simple e2e_fees/failures"
    "simple e2e_fees/fee_juice_payments"
    "simple e2e_fees/gas_estimation"
    "simple e2e_fees/private_payments"
    "simple e2e_keys"
    "simple e2e_l1_with_wall_time"
    "simple e2e_lending_contract"
    "simple e2e_max_block_number"
    "simple e2e_multiple_accounts_1_enc_key"
    "simple e2e_nested_contract/importer"
    "simple e2e_nested_contract/manual_private_call"
    "simple e2e_nested_contract/manual_private_enqueue"
    "simple e2e_nested_contract/manual_public"
    "simple e2e_nft"
    "simple e2e_non_contract_account"
    "simple e2e_note_getter"
    "simple e2e_ordering"
    "simple e2e_outbox"
    "simple e2e_p2p/gossip_network"
    "simple e2e_p2p/rediscovery"
    "flake e2e_p2p/reqresp"
    "flake e2e_p2p/upgrade_governance_proposer"
    "simple e2e_private_voting_contract"
    "flake e2e_prover/full FAKE_PROOFS=1"
    "simple e2e_prover_coordination"
    "simple e2e_public_testnet_transfer"
    "simple e2e_state_vars"
    "simple e2e_static_calls"
    "simple e2e_synching"
    "simple e2e_token_contract/access_control"
    "simple e2e_token_contract/burn"
    "simple e2e_token_contract/minting"
    "simple e2e_token_contract/private_transfer_recursion"
    "simple e2e_token_contract/reading_constants"
    "simple e2e_token_contract/transfer_in_private"
    "simple e2e_token_contract/transfer_in_public"
    "simple e2e_token_contract/transfer_to_private"
    "simple e2e_token_contract/transfer_to_public"
    "simple e2e_token_contract/transfer.test"
    "flake flakey_e2e_inclusion_proofs_contract"

    "compose composed/docs_examples"
    "compose composed/e2e_aztec_js_browser"
    "compose composed/e2e_pxe"
    "compose composed/e2e_sandbox_example"
    "compose composed/integration_l1_publisher"
    "compose sample-dapp/index"
    "compose sample-dapp/ci/index"
    "compose guides/dapp_testing"
    "compose guides/up_quick_start"
    "compose guides/writing_an_account_contract"
  )

  commands=()
  tests=()
  env_vars=()
  for entry in "${TESTS[@]}"; do
    cmd=$(echo "$entry" | awk '{print $1}')
    test=$(echo "$entry" | awk '{print $2}')
    env=$(echo "$entry" | cut -d' ' -f3-)
    commands+=("$cmd")
    tests+=("$test")
    env_vars+=("$env")
  done

  rm -rf results
  set +e
  parallel --timeout 15m --verbose --joblog joblog.txt --results results/{2}-{#}/ --halt now,fail=1 \
      '{3} ./scripts/test.sh {1} {2} 2>&1' ::: ${commands[@]} :::+ ${tests[@]} :::+ "${env_vars[@]}"
  code=$?
  set -e

  # Note this is highly dependent on the command structure above.
  # Skip first line (header).
  # 7th field (1-indexed) is exit value.
  # (NF-1) is the second to last field, so skips the last field "2>&1" to give the test name.
  # We can't index from the front because {3} above is a variable length set of env vars.
  # We concat the test name with its job number in $1, to allow running the same test with different env vars.
  awk 'NR > 1 && $7 != 0 {print $(NF-1) "-" $1}' joblog.txt | while read -r job; do
    stdout_file="results/${job}/stdout"
    if [ -f "$stdout_file" ]; then
      echo "=== Failed Job Output ==="
      cat "$stdout_file"
    fi
  done

  echo "=== Job Log ==="
  cat joblog.txt

  github_endgroup
  cache_upload_flag yarn-project-e2e-tests-$hash
  return $code
}

case "$cmd" in
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
    build
    ;;
  "test")
    test
    ;;
  "test-e2e")
    TEST=1 test_e2e
    ;;
  "ci")
    build
    test
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
  ;;
esac
