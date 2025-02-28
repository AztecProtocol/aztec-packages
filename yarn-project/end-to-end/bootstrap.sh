#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}

hash=$(../bootstrap.sh hash)

function test_cmds {
  local run_test_script="yarn-project/end-to-end/scripts/run_test.sh"
  local prefix="$hash $run_test_script"

  if [ "$CI_FULL" -eq 1 ]; then
    echo "$hash timeout -v 900s bash -c 'CPUS=16 MEM=96g $run_test_script simple e2e_prover/full real'"
  else
    echo "$hash FAKE_PROOFS=1 $run_test_script simple e2e_prover/full fake"
  fi

  # Longest-running tests first
  echo "$hash timeout -v 900s $run_test_script simple e2e_block_building"

  echo "$prefix simple e2e_2_pxes"
  echo "$prefix simple e2e_account_contracts"
  echo "$prefix simple e2e_amm"
  echo "$prefix simple e2e_authwit"
  echo "$prefix simple e2e_avm_simulator"
  echo "$prefix simple e2e_contract_updates"

  # blacklist_token_contract sub-tests
  echo "$prefix simple e2e_blacklist_token_contract/access_control"
  echo "$prefix simple e2e_blacklist_token_contract/burn"
  echo "$prefix simple e2e_blacklist_token_contract/minting"
  echo "$prefix simple e2e_blacklist_token_contract/shielding"
  echo "$prefix simple e2e_blacklist_token_contract/transfer_private"
  echo "$prefix simple e2e_blacklist_token_contract/transfer_public"
  echo "$prefix simple e2e_blacklist_token_contract/unshielding"

  echo "$prefix simple e2e_bot"
  echo "$prefix simple e2e_card_game"
  echo "$prefix simple e2e_cheat_codes"

  # cross_chain_messaging sub-tests
  echo "$prefix simple e2e_cross_chain_messaging/l1_to_l2"
  echo "$prefix simple e2e_cross_chain_messaging/l2_to_l1"
  echo "$prefix simple e2e_cross_chain_messaging/token_bridge_failure_cases"
  echo "$prefix simple e2e_cross_chain_messaging/token_bridge_private"
  echo "$prefix simple e2e_cross_chain_messaging/token_bridge_public"

  echo "$prefix simple e2e_crowdfunding_and_claim"
  echo "$prefix simple e2e_deploy_contract/contract_class_registration"
  echo "$prefix simple e2e_deploy_contract/deploy_method"
  echo "$prefix simple e2e_deploy_contract/legacy"
  echo "$prefix simple e2e_deploy_contract/private_initialization"
  echo "$prefix simple e2e_epochs/epochs_empty_blocks"
  echo "$prefix simple e2e_epochs/epochs_multi_proof"
  echo "$prefix simple e2e_epochs/epochs_proof_fails"
  echo "$prefix simple e2e_epochs/epochs_sync_after_reorg"
  echo "$prefix simple e2e_escrow_contract"
  echo "$prefix simple e2e_event_logs"

  # fees sub-tests
  echo "$prefix simple e2e_fees/account_init"
  echo "$prefix simple e2e_fees/dapp_subscription"
  echo "$prefix simple e2e_fees/failures"
  echo "$prefix simple e2e_fees/fee_juice_payments"
  echo "$prefix simple e2e_fees/fee_settings"
  echo "$prefix simple e2e_fees/gas_estimation"
  echo "$prefix simple e2e_fees/private_payments"
  echo "$prefix simple e2e_fees/public_payments"

  echo "$prefix simple e2e_keys"
  echo "$prefix simple e2e_l1_with_wall_time"
  echo "$prefix simple e2e_lending_contract"
  echo "$prefix simple e2e_max_block_number"
  echo "$prefix simple e2e_multiple_accounts_1_enc_key"

  # nested_contract sub-tests
  echo "$prefix simple e2e_nested_contract/importer"
  echo "$prefix simple e2e_nested_contract/manual_private_call"
  echo "$prefix simple e2e_nested_contract/manual_private_enqueue"
  echo "$prefix simple e2e_nested_contract/manual_public"

  echo "$prefix simple e2e_nft"
  echo "$prefix simple e2e_offchain_note_delivery"
  echo "$prefix simple e2e_note_getter"
  echo "$prefix simple e2e_ordering"
  echo "$prefix simple e2e_outbox"

  # p2p sub-tests
  echo "$prefix simple e2e_p2p/gossip_network"
  echo "$prefix simple e2e_p2p/rediscovery"
  echo "$prefix simple e2e_p2p/reqresp"
  echo "$prefix simple e2e_p2p/reex"
  echo "$prefix simple e2e_p2p/slashing"
  echo "$prefix simple e2e_p2p/upgrade_governance_proposer"

  echo "$prefix simple e2e_private_voting_contract"
  echo "$prefix simple e2e_pruned_blocks"
  echo "$prefix simple e2e_public_testnet_transfer"
  echo "$prefix simple e2e_state_vars"
  echo "$prefix simple e2e_static_calls"
  echo "$prefix simple e2e_synching"

  # token_contract sub-tests
  echo "$prefix simple e2e_token_contract/access_control"
  echo "$prefix simple e2e_token_contract/burn"
  echo "$prefix simple e2e_token_contract/minting"
  echo "$prefix simple e2e_token_contract/private_transfer_recursion"
  echo "$prefix simple e2e_token_contract/reading_constants"
  echo "$prefix simple e2e_token_contract/transfer_in_private"
  echo "$prefix simple e2e_token_contract/transfer_in_public"
  echo "$prefix simple e2e_token_contract/transfer_to_private"
  echo "$prefix simple e2e_token_contract/transfer_to_public"
  echo "$prefix simple e2e_token_contract/transfer.test"

  # compose-based tests
  echo "$prefix compose composed/docs_examples"
  echo "$prefix compose composed/e2e_pxe"
  echo "$prefix compose composed/e2e_sandbox_example"
  echo "$prefix compose composed/integration_l1_publisher"
  echo "$prefix compose sample-dapp/index"
  echo "$prefix compose sample-dapp/ci/index"
  echo "$prefix compose guides/dapp_testing"
  echo "$prefix compose guides/up_quick_start"
  echo "$prefix compose guides/writing_an_account_contract"
  echo "$prefix compose e2e_token_bridge_tutorial_test"
}

function test {
  echo_header "e2e tests"
  test_cmds | filter_test_cmds | parallelise
}

function bench {
  mkdir -p bench-out
  BENCH_OUTPUT=bench-out/yp-bench.json scripts/run_test.sh simple bench_build_block
  cache_upload yarn-project-bench-results-$COMMIT_HASH.tar.gz ./bench-out/yp-bench.json
}

case "$cmd" in
  "clean")
    git clean -fdx
    ;;
  test|test_cmds|bench)
    $cmd
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
  ;;
esac
