#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}

hash=$(../bootstrap.sh hash)

function test_cmds {
  local run_test="$hash yarn-project/end-to-end/scripts/test.sh"
  echo "$run_test simple e2e_2_pxes"
  echo "$run_test simple e2e_account_contracts"
  echo "$run_test simple e2e_authwit"
  echo "$run_test simple e2e_avm_simulator"
  echo "$run_test simple e2e_blacklist_token_contract/access_control"
  echo "$run_test simple e2e_blacklist_token_contract/burn"
  echo "$run_test simple e2e_blacklist_token_contract/minting"
  echo "$run_test simple e2e_blacklist_token_contract/shielding"
  echo "$run_test simple e2e_blacklist_token_contract/transfer_private"
  echo "$run_test simple e2e_blacklist_token_contract/transfer_public"
  echo "$run_test simple e2e_blacklist_token_contract/unshielding"
  # echo "$run_test simple-flake e2e_block_building"
  echo "$run_test simple e2e_bot"
  echo "$run_test simple e2e_card_game"
  echo "$run_test simple e2e_cheat_codes"
  echo "$run_test simple e2e_cross_chain_messaging/l1_to_l2"
  echo "$run_test simple e2e_cross_chain_messaging/l2_to_l1"
  echo "$run_test simple e2e_cross_chain_messaging/token_bridge_failure_cases"
  echo "$run_test simple e2e_cross_chain_messaging/token_bridge_private"
  echo "$run_test simple e2e_cross_chain_messaging/token_bridge_public"
  echo "$run_test simple e2e_crowdfunding_and_claim"
  echo "$run_test simple e2e_deploy_contract/contract_class_registration"
  echo "$run_test simple e2e_deploy_contract/deploy_method"
  echo "$run_test simple e2e_deploy_contract/legacy"
  echo "$run_test simple e2e_deploy_contract/private_initialization"
  echo "$run_test simple e2e_escrow_contract"
  echo "$run_test simple e2e_event_logs"
  echo "$run_test simple e2e_fees/account_init"
  echo "$run_test simple e2e_fees/failures"
  echo "$run_test simple e2e_fees/fee_juice_payments"
  echo "$run_test simple e2e_fees/gas_estimation"
  # echo "$run_test simple e2e_fees/private_payments"
  echo "$run_test simple e2e_keys"
  echo "$run_test simple e2e_l1_with_wall_time"
  echo "$run_test simple e2e_lending_contract"
  echo "$run_test simple e2e_max_block_number"
  echo "$run_test simple e2e_multiple_accounts_1_enc_key"
  echo "$run_test simple e2e_nested_contract/importer"
  echo "$run_test simple e2e_nested_contract/manual_private_call"
  echo "$run_test simple e2e_nested_contract/manual_private_enqueue"
  echo "$run_test simple e2e_nested_contract/manual_public"
  echo "$run_test simple e2e_nft"
  echo "$run_test simple e2e_non_contract_account"
  echo "$run_test simple e2e_note_getter"
  echo "$run_test simple e2e_ordering"
  echo "$run_test simple e2e_outbox"
  # echo "$run_test simple e2e_p2p/gossip_network"
  # echo "$run_test simple e2e_p2p/rediscovery"
  # echo "$run_test simple-flake e2e_p2p/reqresp"
  # echo "$run_test simple-flake e2e_p2p/upgrade_governance_proposer"
  echo "$run_test simple e2e_private_voting_contract"
  # echo "FAKE_PROOFS=1 $run_test simple-flake e2e_prover/full"
  echo "$run_test simple e2e_prover_coordination"
  echo "$run_test simple e2e_public_testnet_transfer"
  echo "$run_test simple e2e_state_vars"
  echo "$run_test simple e2e_static_calls"
  echo "$run_test simple e2e_synching"
  echo "$run_test simple e2e_token_contract/access_control"
  echo "$run_test simple e2e_token_contract/burn"
  echo "$run_test simple e2e_token_contract/minting"
  echo "$run_test simple e2e_token_contract/private_transfer_recursion"
  echo "$run_test simple e2e_token_contract/reading_constants"
  echo "$run_test simple e2e_token_contract/transfer_in_private"
  echo "$run_test simple e2e_token_contract/transfer_in_public"
  echo "$run_test simple e2e_token_contract/transfer_to_private"
  echo "$run_test simple e2e_token_contract/transfer_to_public"
  echo "$run_test simple e2e_token_contract/transfer.test"
  # echo "$run_test simple-flake flakey_e2e_inclusion_proofs_contract"

  echo "$run_test compose composed/docs_examples"
  echo "$run_test compose composed/e2e_aztec_js_browser"
  echo "$run_test compose composed/e2e_pxe"
  echo "$run_test compose composed/e2e_sandbox_example"
  echo "$run_test compose composed/integration_l1_publisher"
  echo "$run_test compose sample-dapp/index"
  echo "$run_test compose sample-dapp/ci/index"
  echo "$run_test compose guides/dapp_testing"
  echo "$run_test compose guides/up_quick_start"
  echo "$run_test compose guides/writing_an_account_contract"
}

case "$cmd" in
  "clean")
    git clean -fdx
    ;;
  "test-cmds")
    test_cmds
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
  ;;
esac
