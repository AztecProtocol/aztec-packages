window.BENCHMARK_DATA = {
  "lastUpdate": 1727378937320,
  "repoUrl": "https://github.com/AztecProtocol/aztec-packages",
  "entries": {
    "C++ Benchmark": [
      {
        "commit": {
          "author": {
            "email": "sirasistant@gmail.com",
            "name": "Álvaro Rodríguez",
            "username": "sirasistant"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "ceda3612f0d12d43bffde9c9b992a432d1a13d75",
          "message": "feat!: Add Not instruction in brillig (#8488)\n\nThe AVM supports Not. We add it in brillig to avoid having to codegen it\r\nwith two operations.\r\n\r\n<details>\r\n\r\n<summary>Brillig opcode count changes</summary>\r\n\r\n```\r\ncontracts: Transpiling  AppSubscription::constructor with size 1969 => 1964\r\ncontracts: Transpiling  Auth::constructor with size 1557 => 1552\r\ncontracts: Transpiling  Auth::get_authorized with size 128 => 127\r\ncontracts: Transpiling  Auth::get_authorized_delay with size 175 => 174\r\ncontracts: Transpiling  Auth::get_scheduled_authorized with size 107 => 106\r\ncontracts: Transpiling  Auth::set_authorized with size 857 => 856\r\ncontracts: Transpiling  Auth::set_authorized_delay with size 826 => 825\r\ncontracts: Transpiling  AuthRegistry::_set_authorized with size 86 => 86\r\ncontracts: Transpiling  AuthRegistry::consume with size 522 => 521\r\ncontracts: Transpiling  AuthRegistry::is_consumable with size 123 => 122\r\ncontracts: Transpiling  AuthRegistry::is_reject_all with size 106 => 105\r\ncontracts: Transpiling  AuthRegistry::set_authorized with size 81 => 81\r\ncontracts: Transpiling  AuthRegistry::set_reject_all with size 64 => 64\r\ncontracts: Transpiling  AuthWitTest::consume_public with size 77 => 77\r\ncontracts: Transpiling  AvmInitializerTest::constructor with size 1553 => 1548\r\ncontracts: Transpiling  AvmInitializerTest::read_storage_immutable with size 89 => 88\r\ncontracts: Transpiling  AvmTest::add_args_return with size 17 => 17\r\ncontracts: Transpiling  AvmTest::add_storage_map with size 182 => 181\r\ncontracts: Transpiling  AvmTest::add_u128 with size 34 => 34\r\ncontracts: Transpiling  AvmTest::assert_nullifier_exists with size 18 => 18\r\ncontracts: Transpiling  AvmTest::assert_same with size 20 => 20\r\ncontracts: Transpiling  AvmTest::assert_timestamp with size 17 => 17\r\ncontracts: Transpiling  AvmTest::assertion_failure with size 16 => 16\r\ncontracts: Transpiling  AvmTest::check_selector with size 16 => 16\r\ncontracts: Transpiling  AvmTest::create_different_nullifier_in_nested_call with size 121 => 120\r\ncontracts: Transpiling  AvmTest::create_same_nullifier_in_nested_call with size 119 => 118\r\ncontracts: Transpiling  AvmTest::debug_logging with size 282 => 282\r\ncontracts: Transpiling  AvmTest::elliptic_curve_add_and_double with size 23 => 23\r\ncontracts: Transpiling  AvmTest::emit_nullifier_and_check with size 19 => 19\r\ncontracts: Transpiling  AvmTest::emit_unencrypted_log with size 524 => 520\r\ncontracts: Transpiling  AvmTest::get_address with size 15 => 15\r\ncontracts: Transpiling  AvmTest::get_args_hash with size 1046 => 1041\r\ncontracts: Transpiling  AvmTest::get_block_number with size 15 => 15\r\ncontracts: Transpiling  AvmTest::get_chain_id with size 15 => 15\r\ncontracts: Transpiling  AvmTest::get_da_gas_left with size 15 => 15\r\ncontracts: Transpiling  AvmTest::get_fee_per_da_gas with size 15 => 15\r\ncontracts: Transpiling  AvmTest::get_fee_per_l2_gas with size 15 => 15\r\ncontracts: Transpiling  AvmTest::get_function_selector with size 15 => 15\r\ncontracts: Transpiling  AvmTest::get_l2_gas_left with size 15 => 15\r\ncontracts: Transpiling  AvmTest::get_sender with size 15 => 15\r\ncontracts: Transpiling  AvmTest::get_storage_address with size 15 => 15\r\ncontracts: Transpiling  AvmTest::get_timestamp with size 15 => 15\r\ncontracts: Transpiling  AvmTest::get_transaction_fee with size 15 => 15\r\ncontracts: Transpiling  AvmTest::get_version with size 15 => 15\r\ncontracts: Transpiling  AvmTest::keccak_f1600 with size 77 => 76\r\ncontracts: Transpiling  AvmTest::keccak_hash with size 708 => 703\r\ncontracts: Transpiling  AvmTest::l1_to_l2_msg_exists with size 19 => 19\r\ncontracts: Transpiling  AvmTest::modulo2 with size 18 => 18\r\ncontracts: Transpiling  AvmTest::nested_call_to_add with size 196 => 195\r\ncontracts: Transpiling  AvmTest::nested_call_to_add_with_gas with size 204 => 203\r\ncontracts: Transpiling  AvmTest::nested_static_call_to_add with size 196 => 195\r\ncontracts: Transpiling  AvmTest::nested_static_call_to_set_storage with size 118 => 117\r\ncontracts: Transpiling  AvmTest::new_note_hash with size 13 => 13\r\ncontracts: Transpiling  AvmTest::new_nullifier with size 13 => 13\r\ncontracts: Transpiling  AvmTest::note_hash_exists with size 19 => 19\r\ncontracts: Transpiling  AvmTest::nullifier_collision with size 14 => 14\r\ncontracts: Transpiling  AvmTest::nullifier_exists with size 19 => 19\r\ncontracts: Transpiling  AvmTest::pedersen_commit with size 73 => 73\r\ncontracts: Transpiling  AvmTest::pedersen_hash with size 42 => 41\r\ncontracts: Transpiling  AvmTest::pedersen_hash_with_index with size 42 => 41\r\ncontracts: Transpiling  AvmTest::poseidon2_hash with size 306 => 304\r\ncontracts: Transpiling  AvmTest::read_storage_list with size 115 => 113\r\ncontracts: Transpiling  AvmTest::read_storage_map with size 103 => 102\r\ncontracts: Transpiling  AvmTest::read_storage_single with size 82 => 81\r\ncontracts: Transpiling  AvmTest::send_l2_to_l1_msg with size 14 => 14\r\ncontracts: Transpiling  AvmTest::set_opcode_big_field with size 15 => 15\r\ncontracts: Transpiling  AvmTest::set_opcode_really_big_field with size 15 => 15\r\ncontracts: Transpiling  AvmTest::set_opcode_small_field with size 15 => 15\r\ncontracts: Transpiling  AvmTest::set_opcode_u32 with size 15 => 15\r\ncontracts: Transpiling  AvmTest::set_opcode_u64 with size 15 => 15\r\ncontracts: Transpiling  AvmTest::set_opcode_u8 with size 15 => 15\r\ncontracts: Transpiling  AvmTest::set_read_storage_single with size 128 => 127\r\ncontracts: Transpiling  AvmTest::set_storage_list with size 47 => 47\r\ncontracts: Transpiling  AvmTest::set_storage_map with size 79 => 79\r\ncontracts: Transpiling  AvmTest::set_storage_single with size 43 => 43\r\ncontracts: Transpiling  AvmTest::sha256_hash with size 62 => 61\r\ncontracts: Transpiling  AvmTest::test_get_contract_instance with size 178 => 177\r\ncontracts: Transpiling  AvmTest::test_get_contract_instance_raw with size 69 => 69\r\ncontracts: Transpiling  AvmTest::to_radix_le with size 40 => 39\r\ncontracts: Transpiling  AvmTest::u128_addition_overflow with size 275 => 271\r\ncontracts: Transpiling  AvmTest::u128_from_integer_overflow with size 140 => 140\r\ncontracts: Transpiling  AvmTest::variable_base_msm with size 84 => 84\r\ncontracts: Transpiling  Benchmarking::broadcast with size 113 => 112\r\ncontracts: Transpiling  Benchmarking::increment_balance with size 263 => 261\r\ncontracts: Transpiling  CardGame::on_card_played with size 882 => 880\r\ncontracts: Transpiling  CardGame::on_cards_claimed with size 745 => 743\r\ncontracts: Transpiling  CardGame::on_game_joined with size 676 => 672\r\ncontracts: Transpiling  CardGame::start_game with size 1150 => 1148\r\ncontracts: Transpiling  Child::pub_get_value with size 24 => 24\r\ncontracts: Transpiling  Child::pub_inc_value with size 145 => 144\r\ncontracts: Transpiling  Child::pub_inc_value_internal with size 150 => 149\r\ncontracts: Transpiling  Child::pub_set_value with size 62 => 62\r\ncontracts: Transpiling  Child::set_value_twice_with_nested_first with size 182 => 181\r\ncontracts: Transpiling  Child::set_value_twice_with_nested_last with size 182 => 181\r\ncontracts: Transpiling  Child::set_value_with_two_nested_calls with size 129 => 129\r\ncontracts: Transpiling  Claim::constructor with size 1657 => 1652\r\ncontracts: Transpiling  Crowdfunding::_publish_donation_receipts with size 153 => 151\r\ncontracts: Transpiling  Crowdfunding::init with size 1763 => 1758\r\ncontracts: Transpiling  DelegatedOn::public_set_value with size 46 => 46\r\ncontracts: Transpiling  Delegator::public_delegate_set_value with size 94 => 93\r\ncontracts: Transpiling  DocsExample::get_shared_immutable_constrained_public with size 97 => 96\r\ncontracts: Transpiling  DocsExample::get_shared_immutable_constrained_public_indirect with size 86 => 86\r\ncontracts: Transpiling  DocsExample::get_shared_immutable_constrained_public_multiple with size 134 => 132\r\ncontracts: Transpiling  DocsExample::initialize_public_immutable with size 164 => 163\r\ncontracts: Transpiling  DocsExample::initialize_shared_immutable with size 164 => 163\r\ncontracts: Transpiling  DocsExample::spend_public_authwit with size 16 => 16\r\ncontracts: Transpiling  DocsExample::update_leader with size 54 => 54\r\ncontracts: Transpiling  EasyPrivateVoting::add_to_tally_public with size 220 => 219\r\ncontracts: Transpiling  EasyPrivateVoting::constructor with size 1614 => 1609\r\ncontracts: Transpiling  EasyPrivateVoting::end_vote with size 136 => 135\r\ncontracts: Transpiling  FeeJuice::_increase_public_balance with size 196 => 195\r\ncontracts: Transpiling  FeeJuice::balance_of_public with size 115 => 114\r\ncontracts: Transpiling  FeeJuice::check_balance with size 168 => 167\r\ncontracts: Transpiling  FeeJuice::set_portal with size 208 => 207\r\ncontracts: Transpiling  FPC::constructor with size 1553 => 1548\r\ncontracts: Transpiling  FPC::pay_refund with size 387 => 384\r\ncontracts: Transpiling  FPC::pay_refund_with_shielded_rebate with size 387 => 384\r\ncontracts: Transpiling  FPC::prepare_fee with size 291 => 290\r\ncontracts: Transpiling  ImportTest::pub_call_public_fn with size 118 => 117\r\ncontracts: Transpiling  InclusionProofs::constructor with size 1479 => 1474\r\ncontracts: Transpiling  InclusionProofs::push_nullifier_public with size 20 => 20\r\ncontracts: Transpiling  InclusionProofs::test_nullifier_inclusion_from_public with size 24 => 24\r\ncontracts: Transpiling  KeyRegistry::register_initial_keys with size 1066 => 1056\r\ncontracts: Transpiling  KeyRegistry::rotate_npk_m with size 1954 => 1941\r\ncontracts: Transpiling  Lending::_borrow with size 2276 => 2273\r\ncontracts: Transpiling  Lending::_deposit with size 221 => 220\r\ncontracts: Transpiling  Lending::_repay with size 1358 => 1356\r\ncontracts: Transpiling  Lending::_withdraw with size 2299 => 2296\r\ncontracts: Transpiling  Lending::borrow_public with size 232 => 231\r\ncontracts: Transpiling  Lending::deposit_public with size 501 => 500\r\ncontracts: Transpiling  Lending::get_asset with size 158 => 157\r\ncontracts: Transpiling  Lending::get_assets with size 179 => 177\r\ncontracts: Transpiling  Lending::get_position with size 848 => 846\r\ncontracts: Transpiling  Lending::init with size 300 => 299\r\ncontracts: Transpiling  Lending::repay_public with size 447 => 446\r\ncontracts: Transpiling  Lending::update_accumulator with size 2423 => 2419\r\ncontracts: Transpiling  Lending::withdraw_public with size 232 => 231\r\ncontracts: Transpiling  Parent::pub_entry_point with size 75 => 75\r\ncontracts: Transpiling  Parent::pub_entry_point_twice with size 127 => 127\r\ncontracts: Transpiling  Parent::public_nested_static_call with size 969 => 964\r\ncontracts: Transpiling  Parent::public_static_call with size 102 => 101\r\ncontracts: Transpiling  PriceFeed::get_price with size 112 => 111\r\ncontracts: Transpiling  PriceFeed::set_price with size 75 => 75\r\ncontracts: Transpiling  PrivateFPC::constructor with size 1556 => 1551\r\ncontracts: Transpiling  Router::_check_block_number with size 163 => 157\r\ncontracts: Transpiling  Router::_check_timestamp with size 166 => 160\r\ncontracts: Transpiling  StatefulTest::get_public_value with size 103 => 102\r\ncontracts: Transpiling  StatefulTest::increment_public_value with size 134 => 133\r\ncontracts: Transpiling  StatefulTest::increment_public_value_no_init_check with size 127 => 126\r\ncontracts: Transpiling  StatefulTest::public_constructor with size 1597 => 1592\r\ncontracts: Transpiling  StaticChild::pub_get_value with size 27 => 27\r\ncontracts: Transpiling  StaticChild::pub_illegal_inc_value with size 148 => 147\r\ncontracts: Transpiling  StaticChild::pub_inc_value with size 145 => 144\r\ncontracts: Transpiling  StaticChild::pub_set_value with size 62 => 62\r\ncontracts: Transpiling  StaticParent::public_call with size 75 => 75\r\ncontracts: Transpiling  StaticParent::public_get_value_from_child with size 142 => 141\r\ncontracts: Transpiling  StaticParent::public_nested_static_call with size 266 => 265\r\ncontracts: Transpiling  StaticParent::public_static_call with size 102 => 101\r\ncontracts: Transpiling  Test::assert_public_global_vars with size 42 => 42\r\ncontracts: Transpiling  Test::consume_message_from_arbitrary_sender_public with size 923 => 920\r\ncontracts: Transpiling  Test::consume_mint_public_message with size 1145 => 1141\r\ncontracts: Transpiling  Test::create_l2_to_l1_message_arbitrary_recipient_public with size 14 => 14\r\ncontracts: Transpiling  Test::create_l2_to_l1_message_public with size 28 => 28\r\ncontracts: Transpiling  Test::dummy_public_call with size 16 => 16\r\ncontracts: Transpiling  Test::emit_nullifier_public with size 13 => 13\r\ncontracts: Transpiling  Test::emit_unencrypted with size 255 => 252\r\ncontracts: Transpiling  Test::is_time_equal with size 20 => 20\r\ncontracts: Transpiling  TestLog::emit_unencrypted_events with size 251 => 249\r\ncontracts: Transpiling  Token::_increase_public_balance with size 187 => 186\r\ncontracts: Transpiling  Token::_reduce_total_supply with size 171 => 170\r\ncontracts: Transpiling  Token::admin with size 92 => 91\r\ncontracts: Transpiling  Token::assert_minter_and_mint with size 236 => 235\r\ncontracts: Transpiling  Token::balance_of_public with size 122 => 121\r\ncontracts: Transpiling  Token::burn_public with size 1618 => 1612\r\ncontracts: Transpiling  Token::complete_refund with size 440 => 440\r\ncontracts: Transpiling  Token::constructor with size 2016 => 2011\r\ncontracts: Transpiling  Token::is_minter with size 113 => 112\r\ncontracts: Transpiling  Token::mint_private with size 509 => 508\r\ncontracts: Transpiling  Token::mint_public with size 358 => 357\r\ncontracts: Transpiling  Token::public_get_decimals with size 95 => 94\r\ncontracts: Transpiling  Token::public_get_name with size 92 => 91\r\ncontracts: Transpiling  Token::public_get_symbol with size 92 => 91\r\ncontracts: Transpiling  Token::set_admin with size 136 => 135\r\ncontracts: Transpiling  Token::set_minter with size 156 => 155\r\ncontracts: Transpiling  Token::shield with size 1800 => 1794\r\ncontracts: Transpiling  Token::total_supply with size 104 => 103\r\ncontracts: Transpiling  Token::transfer_public with size 1633 => 1627\r\ncontracts: Transpiling  TokenBlacklist::_increase_public_balance with size 187 => 186\r\ncontracts: Transpiling  TokenBlacklist::_reduce_total_supply with size 171 => 170\r\ncontracts: Transpiling  TokenBlacklist::balance_of_public with size 122 => 121\r\ncontracts: Transpiling  TokenBlacklist::burn_public with size 1754 => 1747\r\ncontracts: Transpiling  TokenBlacklist::constructor with size 2308 => 2303\r\ncontracts: Transpiling  TokenBlacklist::get_roles with size 179 => 178\r\ncontracts: Transpiling  TokenBlacklist::mint_private with size 568 => 567\r\ncontracts: Transpiling  TokenBlacklist::mint_public with size 537 => 536\r\ncontracts: Transpiling  TokenBlacklist::shield with size 1936 => 1929\r\ncontracts: Transpiling  TokenBlacklist::total_supply with size 104 => 103\r\ncontracts: Transpiling  TokenBlacklist::transfer_public with size 1904 => 1897\r\ncontracts: Transpiling  TokenBlacklist::update_roles with size 1074 => 1073\r\ncontracts: Transpiling  TokenBridge::_assert_token_is_same with size 95 => 94\r\ncontracts: Transpiling  TokenBridge::_call_mint_on_token with size 248 => 246\r\ncontracts: Transpiling  TokenBridge::claim_public with size 1397 => 1392\r\ncontracts: Transpiling  TokenBridge::constructor with size 1583 => 1578\r\ncontracts: Transpiling  TokenBridge::exit_to_l1_public with size 810 => 807\r\ncontracts: Transpiling  TokenBridge::get_portal_address_public with size 94 => 93\r\ncontracts: Transpiling  TokenBridge::get_token with size 92 => 91\r\ncontracts: Transpiling  Uniswap::_approve_bridge_and_exit_input_asset_to_L1 with size 2612 => 2604\r\ncontracts: Transpiling  Uniswap::_assert_token_is_same with size 87 => 87\r\ncontracts: Transpiling  Uniswap::constructor with size 1553 => 1548\r\ncontracts: Transpiling  Uniswap::swap_public with size 3005 => 2998\r\ncontracts: Transpiling contracts...\r\n```\r\n\r\n</details>\r\n\r\n---------\r\n\r\nCo-authored-by: fcarreiro <facundo@aztecprotocol.com>",
          "timestamp": "2024-09-13T10:15:19+01:00",
          "tree_id": "d821c91a9511016bc0f9665968fa81df9f627a77",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ceda3612f0d12d43bffde9c9b992a432d1a13d75"
        },
        "date": 1726219683309,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 12847.47385,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9330.475976 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5091.26728599999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4633.977906 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 38314.435849,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 38314436000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14670.527130000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14670528000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3592544066,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3592544066 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 135433034,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 135433034 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2944257279,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2944257279 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 113378157,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 113378157 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "49558828+AztecBot@users.noreply.github.com",
            "name": "Aztec Bot",
            "username": "AztecBot"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "bcec12dbf79b658406dc21083f8fdeef8962085e",
          "message": "chore(master): Release 0.55.0 (#8478)\n\n:robot: I have created a release *beep* *boop*\r\n---\r\n\r\n\r\n<details><summary>aztec-package: 0.55.0</summary>\r\n\r\n##\r\n[0.55.0](https://github.com/AztecProtocol/aztec-packages/compare/aztec-package-v0.54.0...aztec-package-v0.55.0)\r\n(2024-09-13)\r\n\r\n\r\n### Bug Fixes\r\n\r\n* Load prover node config from env\r\n([#8525](https://github.com/AztecProtocol/aztec-packages/issues/8525))\r\n([7065962](https://github.com/AztecProtocol/aztec-packages/commit/7065962bb507555bcbb25cb3bbfc2a0a90687000))\r\n\r\n\r\n### Miscellaneous\r\n\r\n* Remove unneeded propose and da oracle\r\n([#8474](https://github.com/AztecProtocol/aztec-packages/issues/8474))\r\n([274a6b7](https://github.com/AztecProtocol/aztec-packages/commit/274a6b73281e5b9a7bc037aaf8888230de7b99a9))\r\n</details>\r\n\r\n<details><summary>barretenberg.js: 0.55.0</summary>\r\n\r\n##\r\n[0.55.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg.js-v0.54.0...barretenberg.js-v0.55.0)\r\n(2024-09-13)\r\n\r\n\r\n### Features\r\n\r\n* New test programs for wasm benchmarking\r\n([#8389](https://github.com/AztecProtocol/aztec-packages/issues/8389))\r\n([0b46e96](https://github.com/AztecProtocol/aztec-packages/commit/0b46e96e8e5d05876a3700b9e50d29d6f349ea6e))\r\n</details>\r\n\r\n<details><summary>aztec-packages: 0.55.0</summary>\r\n\r\n##\r\n[0.55.0](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.54.0...aztec-packages-v0.55.0)\r\n(2024-09-13)\r\n\r\n\r\n### ⚠ BREAKING CHANGES\r\n\r\n* Add Not instruction in brillig\r\n([#8488](https://github.com/AztecProtocol/aztec-packages/issues/8488))\r\n* refactor NoteGetterOptions::select API\r\n([#8504](https://github.com/AztecProtocol/aztec-packages/issues/8504))\r\n* **avm:** variants for CAST/NOT opcode\r\n([#8497](https://github.com/AztecProtocol/aztec-packages/issues/8497))\r\n* **avm:** variants for REVERT opcode\r\n([#8487](https://github.com/AztecProtocol/aztec-packages/issues/8487))\r\n\r\n### Features\r\n\r\n* (bb) remove redundant constraints on field/group elements when using\r\ngoblin plonk\r\n([#8409](https://github.com/AztecProtocol/aztec-packages/issues/8409))\r\n([12a093d](https://github.com/AztecProtocol/aztec-packages/commit/12a093d25e0c32fed5eceee424b24111ad2f14a4))\r\n* Add `Module::structs` (https://github.com/noir-lang/noir/pull/6017)\r\n([cb20e07](https://github.com/AztecProtocol/aztec-packages/commit/cb20e078dd909656110d133339b2b425e6c3ebb0))\r\n* Add `TypedExpr::get_type`\r\n(https://github.com/noir-lang/noir/pull/5992)\r\n([875cfe6](https://github.com/AztecProtocol/aztec-packages/commit/875cfe649e76d96a2b07a25c870500543566efd1))\r\n* Add assertions for ACVM `FunctionInput` `bit_size`\r\n(https://github.com/noir-lang/noir/pull/5864)\r\n([20d7576](https://github.com/AztecProtocol/aztec-packages/commit/20d75766cc533b3cb024937dd62251329c78b395))\r\n* Add Not instruction in brillig\r\n([#8488](https://github.com/AztecProtocol/aztec-packages/issues/8488))\r\n([ceda361](https://github.com/AztecProtocol/aztec-packages/commit/ceda3612f0d12d43bffde9c9b992a432d1a13d75))\r\n* Add timeouts for request / response stream connections\r\n([#8434](https://github.com/AztecProtocol/aztec-packages/issues/8434))\r\n([190c27f](https://github.com/AztecProtocol/aztec-packages/commit/190c27f20e5849eb50c4c33233e36565c21bb51a))\r\n* **avm:** Parallelize polynomial alloc and set\r\n([#8520](https://github.com/AztecProtocol/aztec-packages/issues/8520))\r\n([7e73531](https://github.com/AztecProtocol/aztec-packages/commit/7e7353195592d503a92c7222788c739006fa81fc))\r\n* **avm:** Variants for CAST/NOT opcode\r\n([#8497](https://github.com/AztecProtocol/aztec-packages/issues/8497))\r\n([bc609fa](https://github.com/AztecProtocol/aztec-packages/commit/bc609fa457b029dee0dc19818e3709a6ea9564ab))\r\n* **avm:** Variants for REVERT opcode\r\n([#8487](https://github.com/AztecProtocol/aztec-packages/issues/8487))\r\n([a0c8915](https://github.com/AztecProtocol/aztec-packages/commit/a0c8915ccf00fe1c329bf87760d28b3c42725cf1))\r\n* **bb:** Iterative constexpr_for\r\n([#8502](https://github.com/AztecProtocol/aztec-packages/issues/8502))\r\n([02c3330](https://github.com/AztecProtocol/aztec-packages/commit/02c333028bf186f0472738f4a5c39d36f4980941))\r\n* Better error message for misplaced doc comments\r\n(https://github.com/noir-lang/noir/pull/5990)\r\n([875cfe6](https://github.com/AztecProtocol/aztec-packages/commit/875cfe649e76d96a2b07a25c870500543566efd1))\r\n* Change the layout of arrays and vectors to be a single pointer\r\n([#8448](https://github.com/AztecProtocol/aztec-packages/issues/8448))\r\n([3ad624c](https://github.com/AztecProtocol/aztec-packages/commit/3ad624cc343834e8c078c3fe99f3add08f22ffe3))\r\n* Checking finalized sizes + a test of two folding verifiers\r\n([#8503](https://github.com/AztecProtocol/aztec-packages/issues/8503))\r\n([d9e3f4d](https://github.com/AztecProtocol/aztec-packages/commit/d9e3f4d42118d16b343b818a0649e6cfbc14ea31))\r\n* Extract brillig slice ops to reusable procedures\r\n(https://github.com/noir-lang/noir/pull/6002)\r\n([20d7576](https://github.com/AztecProtocol/aztec-packages/commit/20d75766cc533b3cb024937dd62251329c78b395))\r\n* Format trait impl functions\r\n(https://github.com/noir-lang/noir/pull/6016)\r\n([cb20e07](https://github.com/AztecProtocol/aztec-packages/commit/cb20e078dd909656110d133339b2b425e6c3ebb0))\r\n* Impl Hash and Eq on more comptime types\r\n(https://github.com/noir-lang/noir/pull/6022)\r\n([cb20e07](https://github.com/AztecProtocol/aztec-packages/commit/cb20e078dd909656110d133339b2b425e6c3ebb0))\r\n* Implement LSP code action \"Implement missing members\"\r\n(https://github.com/noir-lang/noir/pull/6020)\r\n([cb20e07](https://github.com/AztecProtocol/aztec-packages/commit/cb20e078dd909656110d133339b2b425e6c3ebb0))\r\n* Let `has_named_attribute` work for built-in attributes\r\n(https://github.com/noir-lang/noir/pull/6024)\r\n([cb20e07](https://github.com/AztecProtocol/aztec-packages/commit/cb20e078dd909656110d133339b2b425e6c3ebb0))\r\n* LSP completion function detail\r\n(https://github.com/noir-lang/noir/pull/5993)\r\n([875cfe6](https://github.com/AztecProtocol/aztec-packages/commit/875cfe649e76d96a2b07a25c870500543566efd1))\r\n* Native world state\r\n([#7516](https://github.com/AztecProtocol/aztec-packages/issues/7516))\r\n([c1aa6f7](https://github.com/AztecProtocol/aztec-packages/commit/c1aa6f73d13e860d5fcee07e82347a7633f8b334))\r\n* New test programs for wasm benchmarking\r\n([#8389](https://github.com/AztecProtocol/aztec-packages/issues/8389))\r\n([0b46e96](https://github.com/AztecProtocol/aztec-packages/commit/0b46e96e8e5d05876a3700b9e50d29d6f349ea6e))\r\n* Output timestamps in prover-stats raw logs\r\n([#8476](https://github.com/AztecProtocol/aztec-packages/issues/8476))\r\n([aa67a14](https://github.com/AztecProtocol/aztec-packages/commit/aa67a14c21e258bf42b9f878fbd5f876980f4d96))\r\n* Rate limit peers in request response p2p interactions\r\n([#8498](https://github.com/AztecProtocol/aztec-packages/issues/8498))\r\n([00146fa](https://github.com/AztecProtocol/aztec-packages/commit/00146fa06361a86f0c6e45c46d8b6dff4d4561bf))\r\n* Refactor NoteGetterOptions::select API\r\n([#8504](https://github.com/AztecProtocol/aztec-packages/issues/8504))\r\n([e527992](https://github.com/AztecProtocol/aztec-packages/commit/e52799256d67e2f992c141784102e9b97b114e49))\r\n* Sync from aztec-packages (https://github.com/noir-lang/noir/pull/5971)\r\n([875cfe6](https://github.com/AztecProtocol/aztec-packages/commit/875cfe649e76d96a2b07a25c870500543566efd1))\r\n* Sync from aztec-packages (https://github.com/noir-lang/noir/pull/6001)\r\n([20d7576](https://github.com/AztecProtocol/aztec-packages/commit/20d75766cc533b3cb024937dd62251329c78b395))\r\n* Use Zac's quicksort algorithm in stdlib sorting\r\n(https://github.com/noir-lang/noir/pull/5940)\r\n([20d7576](https://github.com/AztecProtocol/aztec-packages/commit/20d75766cc533b3cb024937dd62251329c78b395))\r\n* Validators ensure transactions live in their p2p pool before attesting\r\n([#8410](https://github.com/AztecProtocol/aztec-packages/issues/8410))\r\n([bce1eea](https://github.com/AztecProtocol/aztec-packages/commit/bce1eea90deb8fabf2324554681628144f4ee08d))\r\n* Verification key stuff\r\n([#8431](https://github.com/AztecProtocol/aztec-packages/issues/8431))\r\n([11dc8ff](https://github.com/AztecProtocol/aztec-packages/commit/11dc8ff185d74e6e5bc51e85d6bcd6577ac83161))\r\n\r\n\r\n### Bug Fixes\r\n\r\n* Correctly print string tokens\r\n(https://github.com/noir-lang/noir/pull/6021)\r\n([cb20e07](https://github.com/AztecProtocol/aztec-packages/commit/cb20e078dd909656110d133339b2b425e6c3ebb0))\r\n* Enable verifier when deploying the networks\r\n([#8500](https://github.com/AztecProtocol/aztec-packages/issues/8500))\r\n([f6d31f1](https://github.com/AztecProtocol/aztec-packages/commit/f6d31f10365c2d31aef15bb679a7cf97f3172654))\r\n* Error when comptime types are used in runtime code\r\n(https://github.com/noir-lang/noir/pull/5987)\r\n([875cfe6](https://github.com/AztecProtocol/aztec-packages/commit/875cfe649e76d96a2b07a25c870500543566efd1))\r\n* Error when mutating comptime variables in non-comptime code\r\n(https://github.com/noir-lang/noir/pull/6003)\r\n([20d7576](https://github.com/AztecProtocol/aztec-packages/commit/20d75766cc533b3cb024937dd62251329c78b395))\r\n* Fix some mistakes in arithmetic generics docs\r\n(https://github.com/noir-lang/noir/pull/5999)\r\n([20d7576](https://github.com/AztecProtocol/aztec-packages/commit/20d75766cc533b3cb024937dd62251329c78b395))\r\n* Fix using lazily elaborated comptime globals\r\n(https://github.com/noir-lang/noir/pull/5995)\r\n([20d7576](https://github.com/AztecProtocol/aztec-packages/commit/20d75766cc533b3cb024937dd62251329c78b395))\r\n* Help link was outdated (https://github.com/noir-lang/noir/pull/6004)\r\n([20d7576](https://github.com/AztecProtocol/aztec-packages/commit/20d75766cc533b3cb024937dd62251329c78b395))\r\n* Load prover node config from env\r\n([#8525](https://github.com/AztecProtocol/aztec-packages/issues/8525))\r\n([7065962](https://github.com/AztecProtocol/aztec-packages/commit/7065962bb507555bcbb25cb3bbfc2a0a90687000))\r\n* Remove claim_public from fee juice\r\n([#8337](https://github.com/AztecProtocol/aztec-packages/issues/8337))\r\n([dca74ae](https://github.com/AztecProtocol/aztec-packages/commit/dca74aeaa3b25290967e0591025dab8aad6e3ad1))\r\n* Try to move constant terms to one side for arithmetic generics\r\n(https://github.com/noir-lang/noir/pull/6008)\r\n([cb20e07](https://github.com/AztecProtocol/aztec-packages/commit/cb20e078dd909656110d133339b2b425e6c3ebb0))\r\n* Use module name as line after which we'll insert auto-import\r\n(https://github.com/noir-lang/noir/pull/6025)\r\n([cb20e07](https://github.com/AztecProtocol/aztec-packages/commit/cb20e078dd909656110d133339b2b425e6c3ebb0))\r\n\r\n\r\n### Miscellaneous\r\n\r\n* Add some `pub use` and remove unused imports\r\n([#8521](https://github.com/AztecProtocol/aztec-packages/issues/8521))\r\n([8bd0755](https://github.com/AztecProtocol/aztec-packages/commit/8bd0755a40357a0bc3c56ae5f60e7ff71552a69c))\r\n* **bb:** Fix mac build\r\n([#8505](https://github.com/AztecProtocol/aztec-packages/issues/8505))\r\n([32fd347](https://github.com/AztecProtocol/aztec-packages/commit/32fd347f887af57456767bcb7a38070f8c4b2b28)),\r\ncloses\r\n[#8499](https://github.com/AztecProtocol/aztec-packages/issues/8499)\r\n* **bb:** Fix mac build\r\n([#8522](https://github.com/AztecProtocol/aztec-packages/issues/8522))\r\n([986e703](https://github.com/AztecProtocol/aztec-packages/commit/986e70353d28eab48cc0028bf31a2c8d67ffb29d))\r\n* **ci:** Fix bb publishing\r\n([#8486](https://github.com/AztecProtocol/aztec-packages/issues/8486))\r\n([c210c36](https://github.com/AztecProtocol/aztec-packages/commit/c210c36c96102aaf5dcd36419b488d4c146c38a5))\r\n* Fix a load of warnings in aztec-nr\r\n([#8501](https://github.com/AztecProtocol/aztec-packages/issues/8501))\r\n([35dc1e1](https://github.com/AztecProtocol/aztec-packages/commit/35dc1e1be1b182e616f700c6ea6f387bae55db21))\r\n* Protogalaxy verifier matches prover 1\r\n([#8414](https://github.com/AztecProtocol/aztec-packages/issues/8414))\r\n([5a76ec6](https://github.com/AztecProtocol/aztec-packages/commit/5a76ec61fb9dee976cdee8bba8198854d9249bf3))\r\n* Remove RC tracking in mem2reg\r\n(https://github.com/noir-lang/noir/pull/6019)\r\n([cb20e07](https://github.com/AztecProtocol/aztec-packages/commit/cb20e078dd909656110d133339b2b425e6c3ebb0))\r\n* Remove unneeded propose and da oracle\r\n([#8474](https://github.com/AztecProtocol/aztec-packages/issues/8474))\r\n([274a6b7](https://github.com/AztecProtocol/aztec-packages/commit/274a6b73281e5b9a7bc037aaf8888230de7b99a9))\r\n* Replace relative paths to noir-protocol-circuits\r\n([b179c6b](https://github.com/AztecProtocol/aztec-packages/commit/b179c6b31e7d59d8be6e9d0bb54cd319b6a6f458))\r\n* Replace relative paths to noir-protocol-circuits\r\n([1c042be](https://github.com/AztecProtocol/aztec-packages/commit/1c042be39595b848bc4cf9021d7f725650370a59))\r\n* Replace relative paths to noir-protocol-circuits\r\n([1c8409f](https://github.com/AztecProtocol/aztec-packages/commit/1c8409f57dfa0116770bbc0a56521ee2f6d42aec))\r\n* Run mac builds on master\r\n([#8519](https://github.com/AztecProtocol/aztec-packages/issues/8519))\r\n([c458a79](https://github.com/AztecProtocol/aztec-packages/commit/c458a7929697b85d170c42f7e927c658428ec955))\r\n* Single install script for cargo-binstall\r\n(https://github.com/noir-lang/noir/pull/5998)\r\n([20d7576](https://github.com/AztecProtocol/aztec-packages/commit/20d75766cc533b3cb024937dd62251329c78b395))\r\n* Use uint32_t instead of size_t for databus data\r\n([#8479](https://github.com/AztecProtocol/aztec-packages/issues/8479))\r\n([79995c8](https://github.com/AztecProtocol/aztec-packages/commit/79995c84e0f88c1ee72876fd21c50c33830597fc))\r\n</details>\r\n\r\n<details><summary>barretenberg: 0.55.0</summary>\r\n\r\n##\r\n[0.55.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.54.0...barretenberg-v0.55.0)\r\n(2024-09-13)\r\n\r\n\r\n### ⚠ BREAKING CHANGES\r\n\r\n* Add Not instruction in brillig\r\n([#8488](https://github.com/AztecProtocol/aztec-packages/issues/8488))\r\n* **avm:** variants for CAST/NOT opcode\r\n([#8497](https://github.com/AztecProtocol/aztec-packages/issues/8497))\r\n* **avm:** variants for REVERT opcode\r\n([#8487](https://github.com/AztecProtocol/aztec-packages/issues/8487))\r\n\r\n### Features\r\n\r\n* (bb) remove redundant constraints on field/group elements when using\r\ngoblin plonk\r\n([#8409](https://github.com/AztecProtocol/aztec-packages/issues/8409))\r\n([12a093d](https://github.com/AztecProtocol/aztec-packages/commit/12a093d25e0c32fed5eceee424b24111ad2f14a4))\r\n* Add Not instruction in brillig\r\n([#8488](https://github.com/AztecProtocol/aztec-packages/issues/8488))\r\n([ceda361](https://github.com/AztecProtocol/aztec-packages/commit/ceda3612f0d12d43bffde9c9b992a432d1a13d75))\r\n* **avm:** Parallelize polynomial alloc and set\r\n([#8520](https://github.com/AztecProtocol/aztec-packages/issues/8520))\r\n([7e73531](https://github.com/AztecProtocol/aztec-packages/commit/7e7353195592d503a92c7222788c739006fa81fc))\r\n* **avm:** Variants for CAST/NOT opcode\r\n([#8497](https://github.com/AztecProtocol/aztec-packages/issues/8497))\r\n([bc609fa](https://github.com/AztecProtocol/aztec-packages/commit/bc609fa457b029dee0dc19818e3709a6ea9564ab))\r\n* **avm:** Variants for REVERT opcode\r\n([#8487](https://github.com/AztecProtocol/aztec-packages/issues/8487))\r\n([a0c8915](https://github.com/AztecProtocol/aztec-packages/commit/a0c8915ccf00fe1c329bf87760d28b3c42725cf1))\r\n* **bb:** Iterative constexpr_for\r\n([#8502](https://github.com/AztecProtocol/aztec-packages/issues/8502))\r\n([02c3330](https://github.com/AztecProtocol/aztec-packages/commit/02c333028bf186f0472738f4a5c39d36f4980941))\r\n* Checking finalized sizes + a test of two folding verifiers\r\n([#8503](https://github.com/AztecProtocol/aztec-packages/issues/8503))\r\n([d9e3f4d](https://github.com/AztecProtocol/aztec-packages/commit/d9e3f4d42118d16b343b818a0649e6cfbc14ea31))\r\n* Native world state\r\n([#7516](https://github.com/AztecProtocol/aztec-packages/issues/7516))\r\n([c1aa6f7](https://github.com/AztecProtocol/aztec-packages/commit/c1aa6f73d13e860d5fcee07e82347a7633f8b334))\r\n* New test programs for wasm benchmarking\r\n([#8389](https://github.com/AztecProtocol/aztec-packages/issues/8389))\r\n([0b46e96](https://github.com/AztecProtocol/aztec-packages/commit/0b46e96e8e5d05876a3700b9e50d29d6f349ea6e))\r\n* Verification key stuff\r\n([#8431](https://github.com/AztecProtocol/aztec-packages/issues/8431))\r\n([11dc8ff](https://github.com/AztecProtocol/aztec-packages/commit/11dc8ff185d74e6e5bc51e85d6bcd6577ac83161))\r\n\r\n\r\n### Miscellaneous\r\n\r\n* **bb:** Fix mac build\r\n([#8505](https://github.com/AztecProtocol/aztec-packages/issues/8505))\r\n([32fd347](https://github.com/AztecProtocol/aztec-packages/commit/32fd347f887af57456767bcb7a38070f8c4b2b28)),\r\ncloses\r\n[#8499](https://github.com/AztecProtocol/aztec-packages/issues/8499)\r\n* **bb:** Fix mac build\r\n([#8522](https://github.com/AztecProtocol/aztec-packages/issues/8522))\r\n([986e703](https://github.com/AztecProtocol/aztec-packages/commit/986e70353d28eab48cc0028bf31a2c8d67ffb29d))\r\n* Protogalaxy verifier matches prover 1\r\n([#8414](https://github.com/AztecProtocol/aztec-packages/issues/8414))\r\n([5a76ec6](https://github.com/AztecProtocol/aztec-packages/commit/5a76ec61fb9dee976cdee8bba8198854d9249bf3))\r\n* Use uint32_t instead of size_t for databus data\r\n([#8479](https://github.com/AztecProtocol/aztec-packages/issues/8479))\r\n([79995c8](https://github.com/AztecProtocol/aztec-packages/commit/79995c84e0f88c1ee72876fd21c50c33830597fc))\r\n</details>\r\n\r\n---\r\nThis PR was generated with [Release\r\nPlease](https://github.com/googleapis/release-please). See\r\n[documentation](https://github.com/googleapis/release-please#release-please).",
          "timestamp": "2024-09-13T11:37:51Z",
          "tree_id": "460763e95781ab2af765a52dae8d00553dd9f6ba",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/bcec12dbf79b658406dc21083f8fdeef8962085e"
        },
        "date": 1726228135987,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 12891.928535999994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9325.687269 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5079.353999000005,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4673.958886 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 38381.521504,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 38381521000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14660.073409,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14660073000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3597192727,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3597192727 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 136131616,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 136131616 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2958710689,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2958710689 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 113358571,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 113358571 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "codygunton@gmail.com",
            "name": "Cody Gunton",
            "username": "codygunton"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "58882b199081b18e33fb65f8d05cfce7fe458f1e",
          "message": "refactor: Protogalaxy verifier matches prover 2 (#8477)\n\nThis PR reorganizes the native folding verifier to better match the\r\nfolding prover. This amounts to encapsulating some logic in functions\r\nand a mild reshuffling. It's tempting to also implement the verifier as\r\na series of pure-ish round functions, but I don't do that for lack of\r\ntime.",
          "timestamp": "2024-09-13T08:58:38-04:00",
          "tree_id": "d4ded2c47bac57ee3ca88ecbf008431d14d6aa9e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/58882b199081b18e33fb65f8d05cfce7fe458f1e"
        },
        "date": 1726233071069,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 12839.47444399999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9257.314761000001 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5099.0555279999935,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4671.22544 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 38559.83670000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 38559836000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14635.617216,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14635618000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3578589660,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3578589660 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 135264683,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 135264683 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2925339164,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2925339164 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 113281775,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 113281775 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "alexghr@users.noreply.github.com",
            "name": "Alex Gherghisan",
            "username": "alexghr"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "aab87733b4381d8d64b85f5e5a6bff4e31ee1abd",
          "message": "fix: native world state test issues (#8546)\n\nThis PR fixes the flaky Jest tests that were comparing the C++\r\nWorldState against the JS implementation.\r\n\r\nThe issue stemmed from the `WorldState::get_state_reference` function\r\nreading state reference for all five trees in parallel and saving that\r\ninformation in a `std::unordered_map`. Concurrent writes to a\r\n`std::unordered_map` [are\r\ninvalid](https://devblogs.microsoft.com/oldnewthing/20231103-00/?p=108966)\r\nso I've added a lock to ensure that only one thread writes at a time.\r\nSimultaneous reads are fine though.",
          "timestamp": "2024-09-16T11:08:09+01:00",
          "tree_id": "3b663f039343f3698013f2bb4b0de35483347c81",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/aab87733b4381d8d64b85f5e5a6bff4e31ee1abd"
        },
        "date": 1726481903375,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 12908.682877000017,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9257.660694000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5109.11256,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4717.756773 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 38327.397527,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 38327397000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14658.544392,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14658545000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3613244945,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3613244945 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 137259628,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 137259628 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2962647334,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2962647334 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 113527785,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 113527785 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "lucasxia01@gmail.com",
            "name": "Lucas Xia",
            "username": "lucasxia01"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "c3ad163dbcf79067b49553f1c139c49a6aa066cb",
          "message": "chore: Moves add gate out of aux (#8541)\n\nResolves https://github.com/AztecProtocol/barretenberg/issues/913.\r\n\r\nMoves the add gate in aux to the arithmetic block instead. Adds some\r\ntests to check the partitioning of selectors into their blocks.\r\n\r\nThis used to be blocked by the recursion limit in Plonk (as in this change would've bumped us over the limit), but we don't\r\ncare about that anymore (because it's double_verify_proof already goes over 2^19).",
          "timestamp": "2024-09-16T22:01:52Z",
          "tree_id": "b7f17aa771b6009b4b178a3054d12fcb84b536b8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c3ad163dbcf79067b49553f1c139c49a6aa066cb"
        },
        "date": 1726524799888,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 12786.754499000011,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9327.253631 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5068.5812840000035,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4688.537831000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 38141.85167499999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 38141851000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14527.160270999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14527160000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3610663401,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3610663401 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 136642405,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 136642405 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2972482515,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2972482515 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 113856029,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 113856029 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "alexghr@users.noreply.github.com",
            "name": "Alex Gherghisan",
            "username": "alexghr"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "ee21583aea137eea31cb1b4e6e0643061ef0d59f",
          "message": "chore: 7791: Disable world_state test suite (#8594)\n\nCherry picking a commit from #8531\r\n\r\nCo-authored-by: jeanmon <jean@aztecprotocol.com>",
          "timestamp": "2024-09-17T13:02:27Z",
          "tree_id": "ec1453a5c2bf3c49eec35de9b2551f91eb6a2142",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ee21583aea137eea31cb1b4e6e0643061ef0d59f"
        },
        "date": 1726578952886,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 12790.927277000008,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9280.466177 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5078.173162000013,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4677.550386 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 38105.954957,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 38105955000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14531.602249000003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14531603000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3655785058,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3655785058 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 135770542,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 135770542 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2942975027,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2942975027 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 112775950,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 112775950 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "name": "AztecProtocol",
            "username": "AztecProtocol"
          },
          "committer": {
            "name": "AztecProtocol",
            "username": "AztecProtocol"
          },
          "id": "5a8f716c8ccaba8eb73420b6770d167c6337820a",
          "message": "chore(master): Release 0.55.1",
          "timestamp": "2024-09-17T14:58:32Z",
          "url": "https://github.com/AztecProtocol/aztec-packages/pull/8533/commits/5a8f716c8ccaba8eb73420b6770d167c6337820a"
        },
        "date": 1726585793605,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 13345.780553999986,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9197.849723 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5874.508230000018,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4650.927584000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 38117.038974,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 38117039000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 16944.340642,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16944341000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3605569186,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3605569186 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 135711274,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 135711274 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2954511877,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2954511877 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 112496803,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 112496803 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "49558828+AztecBot@users.noreply.github.com",
            "name": "Aztec Bot",
            "username": "AztecBot"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "25d75ffd511024332797836d94ed1229913e5ce2",
          "message": "chore(master): Release 0.55.1 (#8533)\n\n:robot: I have created a release *beep* *boop*\r\n---\r\n\r\n\r\n<details><summary>aztec-package: 0.55.1</summary>\r\n\r\n##\r\n[0.55.1](https://github.com/AztecProtocol/aztec-packages/compare/aztec-package-v0.55.0...aztec-package-v0.55.1)\r\n(2024-09-17)\r\n\r\n\r\n### Features\r\n\r\n* CI deploy on sepolia\r\n([#8514](https://github.com/AztecProtocol/aztec-packages/issues/8514))\r\n([54f0344](https://github.com/AztecProtocol/aztec-packages/commit/54f0344b0fd5eba26d0c02641533ad9f18616de1))\r\n* Tx verification & peer scoring on p2p layer. bot support for\r\nEasyPrivateToken\r\n([#8298](https://github.com/AztecProtocol/aztec-packages/issues/8298))\r\n([beb651f](https://github.com/AztecProtocol/aztec-packages/commit/beb651f241fe71776689bedc764be650dfd5ae0c))\r\n\r\n\r\n### Miscellaneous\r\n\r\n* Remove ARCHIVER_L1_START_BLOCK\r\n([#8554](https://github.com/AztecProtocol/aztec-packages/issues/8554))\r\n([bc8d461](https://github.com/AztecProtocol/aztec-packages/commit/bc8d461f6fc20c55aa94647dc671ecb59f52cad2))\r\n</details>\r\n\r\n<details><summary>barretenberg.js: 0.55.1</summary>\r\n\r\n##\r\n[0.55.1](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg.js-v0.55.0...barretenberg.js-v0.55.1)\r\n(2024-09-17)\r\n\r\n\r\n### Miscellaneous\r\n\r\n* **barretenberg.js:** Synchronize aztec-packages versions\r\n</details>\r\n\r\n<details><summary>aztec-packages: 0.55.1</summary>\r\n\r\n##\r\n[0.55.1](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.55.0...aztec-packages-v0.55.1)\r\n(2024-09-17)\r\n\r\n\r\n### Features\r\n\r\n* `TXE::store_note_in_cache` --&gt; `TXE::add_note`\r\n([#8547](https://github.com/AztecProtocol/aztec-packages/issues/8547))\r\n([5a6aaeb](https://github.com/AztecProtocol/aztec-packages/commit/5a6aaeb2cacb1e1cbcda8b93441e9d4cf4b912fa))\r\n* Add a `comptime` string type for string handling at compile-time\r\n(https://github.com/noir-lang/noir/pull/6026)\r\n([cd7983a](https://github.com/AztecProtocol/aztec-packages/commit/cd7983a0b7692629428e63c58deb4d4920353d4b))\r\n* CI deploy on sepolia\r\n([#8514](https://github.com/AztecProtocol/aztec-packages/issues/8514))\r\n([54f0344](https://github.com/AztecProtocol/aztec-packages/commit/54f0344b0fd5eba26d0c02641533ad9f18616de1))\r\n* Default to outputting witness with file named after package\r\n(https://github.com/noir-lang/noir/pull/6031)\r\n([cd7983a](https://github.com/AztecProtocol/aztec-packages/commit/cd7983a0b7692629428e63c58deb4d4920353d4b))\r\n* Let LSP suggest trait impl methods as you are typing them\r\n(https://github.com/noir-lang/noir/pull/6029)\r\n([cd7983a](https://github.com/AztecProtocol/aztec-packages/commit/cd7983a0b7692629428e63c58deb4d4920353d4b))\r\n* NFT with \"transient\" storage shield flow\r\n([#8129](https://github.com/AztecProtocol/aztec-packages/issues/8129))\r\n([578f67c](https://github.com/AztecProtocol/aztec-packages/commit/578f67ca7df6ea0c66265bf60767803f692d46f4))\r\n* Optimize allocating immediate amounts of memory\r\n([#8579](https://github.com/AztecProtocol/aztec-packages/issues/8579))\r\n([e0185e7](https://github.com/AztecProtocol/aztec-packages/commit/e0185e75e65df08b5334856f8bf63fa3aed7049a))\r\n* Spartan iac\r\n([#8455](https://github.com/AztecProtocol/aztec-packages/issues/8455))\r\n([16fba46](https://github.com/AztecProtocol/aztec-packages/commit/16fba46e722e0178f5ebfe4b9562e445d12386a8))\r\n* Sync from aztec-packages (https://github.com/noir-lang/noir/pull/6028)\r\n([cd7983a](https://github.com/AztecProtocol/aztec-packages/commit/cd7983a0b7692629428e63c58deb4d4920353d4b))\r\n* Tx verification & peer scoring on p2p layer. bot support for\r\nEasyPrivateToken\r\n([#8298](https://github.com/AztecProtocol/aztec-packages/issues/8298))\r\n([beb651f](https://github.com/AztecProtocol/aztec-packages/commit/beb651f241fe71776689bedc764be650dfd5ae0c))\r\n* Unconstraining keys in unconstrained encryption\r\n([#7912](https://github.com/AztecProtocol/aztec-packages/issues/7912))\r\n([eb9275a](https://github.com/AztecProtocol/aztec-packages/commit/eb9275a3b7eee4bb76c440dc7307caec4f9e16bd))\r\n* Update args hash to be a flat poseidon\r\n([#8571](https://github.com/AztecProtocol/aztec-packages/issues/8571))\r\n([0c54224](https://github.com/AztecProtocol/aztec-packages/commit/0c5422446de40a5824daa5af33cad1ec015589a0))\r\n* Use poseidon for fn selectors\r\n([#8239](https://github.com/AztecProtocol/aztec-packages/issues/8239))\r\n([41891db](https://github.com/AztecProtocol/aztec-packages/commit/41891dbd6c9022fd9ad2e8e66e073782a1798887))\r\n\r\n\r\n### Bug Fixes\r\n\r\n* Disable side-effects for no_predicates functions\r\n(https://github.com/noir-lang/noir/pull/6027)\r\n([cd7983a](https://github.com/AztecProtocol/aztec-packages/commit/cd7983a0b7692629428e63c58deb4d4920353d4b))\r\n* Native world state test issues\r\n([#8546](https://github.com/AztecProtocol/aztec-packages/issues/8546))\r\n([aab8773](https://github.com/AztecProtocol/aztec-packages/commit/aab87733b4381d8d64b85f5e5a6bff4e31ee1abd))\r\n* Remove special case for epoch 0\r\n([#8549](https://github.com/AztecProtocol/aztec-packages/issues/8549))\r\n([b035d01](https://github.com/AztecProtocol/aztec-packages/commit/b035d012a875772ffdf523c112aa70777300c047))\r\n* Serialize AvmVerificationKeyData\r\n([#8529](https://github.com/AztecProtocol/aztec-packages/issues/8529))\r\n([78c94a4](https://github.com/AztecProtocol/aztec-packages/commit/78c94a4f316605bf6f27c8e466d7c000a486e593))\r\n\r\n\r\n### Miscellaneous\r\n\r\n* 7791: Disable world_state test suite\r\n([#8594](https://github.com/AztecProtocol/aztec-packages/issues/8594))\r\n([ee21583](https://github.com/AztecProtocol/aztec-packages/commit/ee21583aea137eea31cb1b4e6e0643061ef0d59f))\r\n* Add jq to aztec image\r\n([#8542](https://github.com/AztecProtocol/aztec-packages/issues/8542))\r\n([a7fb791](https://github.com/AztecProtocol/aztec-packages/commit/a7fb791ffaf398b5efd5fb64090a2b0b6a7b6685))\r\n* Add sync suite\r\n([#8550](https://github.com/AztecProtocol/aztec-packages/issues/8550))\r\n([ce0a9db](https://github.com/AztecProtocol/aztec-packages/commit/ce0a9dbd87d4371a8b6dd11eb87907fb1dd48030))\r\n* **ci:** Action to redo typo PRs\r\n([#8553](https://github.com/AztecProtocol/aztec-packages/issues/8553))\r\n([3ed5879](https://github.com/AztecProtocol/aztec-packages/commit/3ed5879d486eb20bffdfe9084fed2fb9eb681d26))\r\n* **ci:** Fix master\r\n([#8534](https://github.com/AztecProtocol/aztec-packages/issues/8534))\r\n([47c368f](https://github.com/AztecProtocol/aztec-packages/commit/47c368f991116d4637f544f2cb71ef146ed201de))\r\n* **ci:** Fix redo-typo-pr.yml\r\n([abf9802](https://github.com/AztecProtocol/aztec-packages/commit/abf9802b8ace37fc6eff9034927fb4ab29feea33))\r\n* **ci:** Fix redo-typo-pr.yml\r\n([#8555](https://github.com/AztecProtocol/aztec-packages/issues/8555))\r\n([7f1673c](https://github.com/AztecProtocol/aztec-packages/commit/7f1673cb5b7a472368d1b44912fda72c8be31636))\r\n* **ci:** Hotfix\r\n([ffd31aa](https://github.com/AztecProtocol/aztec-packages/commit/ffd31aa32a02c212b14487b15b79bcff8b14293a))\r\n* **ci:** Hotfix arm ci\r\n([979f267](https://github.com/AztecProtocol/aztec-packages/commit/979f2674b639d84d2b45d1c419e41aa613bd94e9))\r\n* **ci:** Optimize disk usage in arm run\r\n([#8564](https://github.com/AztecProtocol/aztec-packages/issues/8564))\r\n([33e6aa4](https://github.com/AztecProtocol/aztec-packages/commit/33e6aa41b3d87d54eafbcf68ddcaedac6df13204))\r\n* **ci:** Use labels and if branch=master to control jobs\r\n([#8508](https://github.com/AztecProtocol/aztec-packages/issues/8508))\r\n([68a2226](https://github.com/AztecProtocol/aztec-packages/commit/68a222607ecd9584c46a0499bce568d1d7ec7ce7))\r\n* GitHub Actions Deployments to Amazon EKS\r\n([#8563](https://github.com/AztecProtocol/aztec-packages/issues/8563))\r\n([6fae8f0](https://github.com/AztecProtocol/aztec-packages/commit/6fae8f031749b1aaede2033f5de4b61fecf98b6b))\r\n* Moves add gate out of aux\r\n([#8541](https://github.com/AztecProtocol/aztec-packages/issues/8541))\r\n([c3ad163](https://github.com/AztecProtocol/aztec-packages/commit/c3ad163dbcf79067b49553f1c139c49a6aa066cb))\r\n* Protogalaxy verifier matches prover 2\r\n([#8477](https://github.com/AztecProtocol/aztec-packages/issues/8477))\r\n([58882b1](https://github.com/AztecProtocol/aztec-packages/commit/58882b199081b18e33fb65f8d05cfce7fe458f1e))\r\n* Redo typo PR by ankushgoel27\r\n([#8595](https://github.com/AztecProtocol/aztec-packages/issues/8595))\r\n([7ca6d24](https://github.com/AztecProtocol/aztec-packages/commit/7ca6d24d3fdef17e9d71a898dbca5206a166a624))\r\n* Redo typo PR by Ocheretovich\r\n([#8559](https://github.com/AztecProtocol/aztec-packages/issues/8559))\r\n([c4296ba](https://github.com/AztecProtocol/aztec-packages/commit/c4296bab075577fad0c7e1a04587e0995902b656))\r\n* Redo typo PR by Olexandr88\r\n([#8560](https://github.com/AztecProtocol/aztec-packages/issues/8560))\r\n([e35d148](https://github.com/AztecProtocol/aztec-packages/commit/e35d14864cb6fe3727f5a93f3037786add10beb4))\r\n* Redo typo PR by skaunov\r\n([#8557](https://github.com/AztecProtocol/aztec-packages/issues/8557))\r\n([8a1e7c3](https://github.com/AztecProtocol/aztec-packages/commit/8a1e7c33735d60b479fc70a32dcde18d3ce2d97a))\r\n* Release Noir(0.34.0) (https://github.com/noir-lang/noir/pull/5692)\r\n([cd7983a](https://github.com/AztecProtocol/aztec-packages/commit/cd7983a0b7692629428e63c58deb4d4920353d4b))\r\n* Remove ARCHIVER_L1_START_BLOCK\r\n([#8554](https://github.com/AztecProtocol/aztec-packages/issues/8554))\r\n([bc8d461](https://github.com/AztecProtocol/aztec-packages/commit/bc8d461f6fc20c55aa94647dc671ecb59f52cad2))\r\n* Remove redundant e2e tests and organize\r\n([#8561](https://github.com/AztecProtocol/aztec-packages/issues/8561))\r\n([de2b775](https://github.com/AztecProtocol/aztec-packages/commit/de2b775b07166a14093bbfec857403e985fcffbd))\r\n* Remove unused imports\r\n([#8556](https://github.com/AztecProtocol/aztec-packages/issues/8556))\r\n([e11242e](https://github.com/AztecProtocol/aztec-packages/commit/e11242e2ab2fd1eef0a17db2e0714cd289b2fec1))\r\n* Replace relative paths to noir-protocol-circuits\r\n([2336986](https://github.com/AztecProtocol/aztec-packages/commit/2336986463c660fe67b2e46b375d2bcf3531cdb9))\r\n* Replace relative paths to noir-protocol-circuits\r\n([9668ed5](https://github.com/AztecProtocol/aztec-packages/commit/9668ed5c548a24c69cdacfbc58d544adf47d3272))\r\n</details>\r\n\r\n<details><summary>barretenberg: 0.55.1</summary>\r\n\r\n##\r\n[0.55.1](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.55.0...barretenberg-v0.55.1)\r\n(2024-09-17)\r\n\r\n\r\n### Bug Fixes\r\n\r\n* Native world state test issues\r\n([#8546](https://github.com/AztecProtocol/aztec-packages/issues/8546))\r\n([aab8773](https://github.com/AztecProtocol/aztec-packages/commit/aab87733b4381d8d64b85f5e5a6bff4e31ee1abd))\r\n\r\n\r\n### Miscellaneous\r\n\r\n* 7791: Disable world_state test suite\r\n([#8594](https://github.com/AztecProtocol/aztec-packages/issues/8594))\r\n([ee21583](https://github.com/AztecProtocol/aztec-packages/commit/ee21583aea137eea31cb1b4e6e0643061ef0d59f))\r\n* Moves add gate out of aux\r\n([#8541](https://github.com/AztecProtocol/aztec-packages/issues/8541))\r\n([c3ad163](https://github.com/AztecProtocol/aztec-packages/commit/c3ad163dbcf79067b49553f1c139c49a6aa066cb))\r\n* Protogalaxy verifier matches prover 2\r\n([#8477](https://github.com/AztecProtocol/aztec-packages/issues/8477))\r\n([58882b1](https://github.com/AztecProtocol/aztec-packages/commit/58882b199081b18e33fb65f8d05cfce7fe458f1e))\r\n</details>\r\n\r\n---\r\nThis PR was generated with [Release\r\nPlease](https://github.com/googleapis/release-please). See\r\n[documentation](https://github.com/googleapis/release-please#release-please).",
          "timestamp": "2024-09-17T14:58:26Z",
          "tree_id": "7c1f7d6c305f48b061e50e2e54fadd5c958b1c7a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/25d75ffd511024332797836d94ed1229913e5ce2"
        },
        "date": 1726586006621,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 12792.118813000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9279.255403000001 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5120.80684099999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4729.142446000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 38140.915544,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 38140915000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14647.892044999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14647892000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3615994480,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3615994480 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 138415887,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 138415887 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2976994343,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2976994343 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 114748946,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 114748946 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "47281315+guipublic@users.noreply.github.com",
            "name": "guipublic",
            "username": "guipublic"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "e3ea298fd1f7326199e6e35b3523aadb2b12a925",
          "message": "chore: add more cases for assert_equal conversion (#8446)\n\nTransform arithmetic gate of the kind a==b into a copy constraint\r\nbetween a and b, as long as a or b is already constrained. In that case,\r\nwe mark both a and b as constrained.",
          "timestamp": "2024-09-17T17:49:53+02:00",
          "tree_id": "6ca9b61c67acbf3e0dcf2b009bbbf916af64ecd7",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e3ea298fd1f7326199e6e35b3523aadb2b12a925"
        },
        "date": 1726588979631,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 12810.924122000017,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9271.810128000001 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5117.173107,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4744.052311 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 38350.723408,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 38350724000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14579.198445,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14579199000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3619040250,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3619040250 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 135328941,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 135328941 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2978075314,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2978075314 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 113060849,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 113060849 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "98505400+ledwards2225@users.noreply.github.com",
            "name": "ledwards2225",
            "username": "ledwards2225"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "1c7b06d6621d9873f84147b2b7f1f22bf21bbacb",
          "message": "feat: use new IVC scheme (#8480)\n\nReplaces the old `ClientIvc` with `AztecIvc` (renamed to `ClientIVC`).\r\nThis was facilitated by the introduction of `auto_verify_mode` which\r\nmakes the new class behave a bit like the old one by automatically\r\n\"completing\" the kernel circuits with recursive verifiers if\r\n`auto_verify_mode == true`. (Note: a notable difference is that the old\r\nmodel appended recursion logic to _any_ circuit, not just kernels. This\r\nchange means that it does not make sense to accumulate an odd number of\r\ncircuits into the IVC).",
          "timestamp": "2024-09-17T10:07:10-07:00",
          "tree_id": "2559931c3439b30ce63d7ea3a89142e652f18121",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1c7b06d6621d9873f84147b2b7f1f22bf21bbacb"
        },
        "date": 1726593872758,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 34453.184685999986,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 31931.99281900001 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5111.101091999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4694.678341000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 100513.030599,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 100513031000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14607.624747000003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14607623000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8682744319,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8682744319 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 152341570,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 152341570 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6949782032,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6949782032 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 128306188,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 128306188 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "159419107+DanielKotov@users.noreply.github.com",
            "name": "DanielKotov",
            "username": "DanielKotov"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "f2a13309f544bbd83b593e6a6207d49d9ef48b74",
          "message": "fix: boomerang variable in sha256 hash function (#8581)\n\nStatic analyzer found boomerang variable in the function extend_witness.\r\n\r\nThe problem is that variable w_out wasn't connected with variable\r\nw_out_raw in the function extend_witness in sha256 hash function. As a\r\nresult, you can put random variable in the extend_witness.\r\n\r\nTest was created to prove this issue. You can modify a result of\r\nfunction extend_witness, and the circuit will be correct.\r\n\r\nAlso function extend_witness was patched to remove this issue.\r\n\r\n---------\r\n\r\nCo-authored-by: Rumata888 <isennovskiy@gmail.com>",
          "timestamp": "2024-09-17T18:07:53+01:00",
          "tree_id": "5cfec8ee948eaed5649f3ee042016ce5a4a94a1b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f2a13309f544bbd83b593e6a6207d49d9ef48b74"
        },
        "date": 1726593968592,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 35631.49408200002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 32574.893427000006 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5797.5111220000035,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4582.833249 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 99487.04701299999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 99487048000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 16605.353931999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16605354000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8489313581,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8489313581 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 151350760,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 151350760 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6949777854,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6949777854 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126241372,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126241372 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "72797635+Savio-Sou@users.noreply.github.com",
            "name": "Savio",
            "username": "Savio-Sou"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "cd46ddd96539f2db466d1116dabdb838d2a807e7",
          "message": "chore(bb readme): Document how to Honk Noir programs (#7638)\n\nDocument:\r\n- Basic example of how to use `bb prove_ultra_honk`, `bb\r\nwrite_vk_ultra_honk` and `bb verify_ultra_honk` with Noir\r\n- Preliminary example of how to use `bb contract_ultra_honk` as\r\n@Maddiaa0 shared (to confirm validity pending a new BB release is cut\r\nwith the functionality)\r\n- Minor note on `bb <command>_mega_honk` for people wanting to use\r\nMegaHonk\r\n\r\n~TODO: Wait for Barretenberg v0.47.1 <> Noir compatibility and complete\r\nSolidity verifier workflow~ Done\r\n\r\nTo consider in future Issue(s):\r\nRecommend `prove_keccak_ultra_honk` as default; `prove_ultra_honk`\r\n(Poseidon) as advanced proving for off-chain + recursion use cases only",
          "timestamp": "2024-09-18T02:18:47+08:00",
          "tree_id": "b462eee61c549d87699573a15e0155889e80fa78",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/cd46ddd96539f2db466d1116dabdb838d2a807e7"
        },
        "date": 1726598202772,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 35884.94334799998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 32867.373821999994 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5127.10937300001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4743.948907 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 99783.68190000003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 99783680000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14566.586744,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14566587000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8547631794,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8547631794 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 152736684,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 152736684 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6941051053,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6941051053 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126831798,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126831798 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "132435771+jeanmon@users.noreply.github.com",
            "name": "Jean M",
            "username": "jeanmon"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "dd09f057e97ac1bba7b3fbf29b50737ebe5ca76f",
          "message": "feat(avm): avm recursive TS/Noir integration (#8531)\n\nResolves #7791",
          "timestamp": "2024-09-17T19:34:35Z",
          "tree_id": "05912541ac61b0f3a86c26e5b11000d49e680181",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/dd09f057e97ac1bba7b3fbf29b50737ebe5ca76f"
        },
        "date": 1726602653841,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 35732.25560399999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 32782.650429999994 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5073.815839000005,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4681.8837490000005 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 99071.12806600002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 99071128000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14536.200923999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14536201000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8477016758,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8477016758 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 153252881,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 153252881 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6910810922,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6910810922 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 127532559,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 127532559 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "105737703+iakovenkos@users.noreply.github.com",
            "name": "iakovenkos",
            "username": "iakovenkos"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "a4f61b39c39bf01a1071b52bbf042408f29d5564",
          "message": "refactor: Protogalaxy recursive verifier matches native verifier (#8568)\n\nContinuation of PG refactoring\r\n\r\n- PG recursive verifier made similar to native PG verifier\r\n- In recursive setting: accumulator is mutated in place. \r\n- Sharing the code with prover_verifier_shared for functions that\r\ncompute powers of round challenges and update gate challenges\r\n- Renaming + Constifying a lot",
          "timestamp": "2024-09-17T16:20:19-04:00",
          "tree_id": "1df387ff8a7d7bd043de9aca225be8b871a75fee",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a4f61b39c39bf01a1071b52bbf042408f29d5564"
        },
        "date": 1726605466969,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 34307.31013900001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 31796.502915999994 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5074.393954000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4636.150490999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 100058.847086,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 100058847000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14510.670655,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14510671000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8604802654,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8604802654 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 154480379,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 154480379 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6921775776,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6921775776 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 125932802,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 125932802 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "adam.domurad@gmail.com",
            "name": "ludamad",
            "username": "ludamad"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "679752542edf1667d58e8839aca05d2b9fcc7da6",
          "message": "fix(world_state): fix race conditions in WorldState and IndexedTree (#8612)\n\nOne caused by me doing a 'mac build' fix, oops. Mac build temporarily\r\nrebroken as no one relies on world_state on mac atm\r\n- reverts bad Signal change, reverts to raw std::atomic\r\n- puts std::mutex as a mutable class member as it guards accesses\r\n- reenables the tests\r\n- minor side-effect: fixes 'the the' usages",
          "timestamp": "2024-09-18T02:13:25Z",
          "tree_id": "fa0f18af77245b95b625705536b2209a371edd7e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/679752542edf1667d58e8839aca05d2b9fcc7da6"
        },
        "date": 1726626577349,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 34628.88280199999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 31967.855224 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5153.896363000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4735.434539000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 100016.128505,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 100016129000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14662.097795,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14662098000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8672839508,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8672839508 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 152168193,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 152168193 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6973167958,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6973167958 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 127817490,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 127817490 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "fcarreiro@users.noreply.github.com",
            "name": "Facundo",
            "username": "fcarreiro"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "d5695fcde93cbfda3e45bfa03988a9e72f2dcb59",
          "message": "feat(avm)!: remove tag in NOT (#8606)\n\nCase study to see how it goes.",
          "timestamp": "2024-09-18T10:41:49+01:00",
          "tree_id": "0f528b965dc1ad57d0a3559e674b4dcfb299bf9e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d5695fcde93cbfda3e45bfa03988a9e72f2dcb59"
        },
        "date": 1726653561994,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 34503.17599899998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 31996.355271999997 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5169.986967,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4775.445253 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 99411.364821,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 99411365000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14789.694274,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14789694000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8609099582,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8609099582 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 150947481,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 150947481 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 7019058224,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 7019058224 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 125413310,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 125413310 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "mara@aztecprotocol.com",
            "name": "maramihali",
            "username": "maramihali"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "94339fbfc7c0c822dc1497c113d48f74a89f1bad",
          "message": "chore: create a Gemini prover (#8622)\n\nIn this PR:\r\n* make a `GeminiProver::prove` to not have to replicate all the stages\r\nof the protocol in tests (and soon in the Provers)\r\n* make the Gemini prover and verifier responsible for batching\r\npolynomials and commitments, respectively. While this is not per se part\r\nof the protocol, it does save us a lot of duplication and was\r\nimplemented as part of Zeromorph as well\r\n* replace the terms `gemini_*` back to `fold_*`. Originally, I thought\r\nthat having things that have a folding related naming might be confusing\r\nin the making of Protogalaxy but this data structures will not be\r\nsurfaced anywhere outside the commitment_schemes folders\r\n* attempted bits of cleanup here and there",
          "timestamp": "2024-09-18T15:51:22+01:00",
          "tree_id": "9303a03f3d8b9ee36d530dc6169a6c5dc8c6042b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/94339fbfc7c0c822dc1497c113d48f74a89f1bad"
        },
        "date": 1726672359579,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 34445.67545199999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 31354.787911000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5111.201398000006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4693.596479000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 99563.872125,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 99563872000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14604.515103000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14604514000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8554702195,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8554702195 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 151928553,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 151928553 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6980419798,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6980419798 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 125795426,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 125795426 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "47112877+dbanks12@users.noreply.github.com",
            "name": "David Banks",
            "username": "dbanks12"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "178573738731e2e74e4119a035f913da39675d85",
          "message": "feat!: add support for u1 in the avm, ToRadix's radix arg is a memory addr (#8570)",
          "timestamp": "2024-09-18T16:42:18Z",
          "tree_id": "f09ff08650f56572e5fed8eb421c3357f0e29b70",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/178573738731e2e74e4119a035f913da39675d85"
        },
        "date": 1726678592240,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 34367.03489499999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 31752.892575999995 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5091.098738,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4636.305603000002 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 100427.212132,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 100427212000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14667.392955000003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14667393000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8532292416,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8532292416 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 151704228,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 151704228 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6941589044,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6941589044 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 127877558,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 127877558 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "fcarreiro@users.noreply.github.com",
            "name": "Facundo",
            "username": "fcarreiro"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "b6bc7c3f5064255480e3d4443471c2c50007d0ca",
          "message": "feat(avm): return oracle (#8629)",
          "timestamp": "2024-09-18T18:45:20+01:00",
          "tree_id": "0a5c13d7de785d0a5ff5089b2f8967d741a8500a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/b6bc7c3f5064255480e3d4443471c2c50007d0ca"
        },
        "date": 1726682586580,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 34327.86124800001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 31423.202041999994 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5083.4778000000115,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4686.312184 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 99599.157467,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 99599158000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14572.314676999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14572315000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8511867570,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8511867570 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 152617260,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 152617260 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6994840683,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6994840683 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 128406848,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 128406848 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "fcarreiro@users.noreply.github.com",
            "name": "Facundo",
            "username": "fcarreiro"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "0d7536395f2406a22a76f15d01114730c84edc18",
          "message": "chore(avm): simplify bb-prover and other AVM tests (#8627)\n\nIdea\n* since this test is only proving TS -> BB and hints, just prove once.\n* cpp tests run only check-circuit (and will run full proving nightly)\n\nProblem: the test catches some bug, so I disable it for now. Ilyas is\nworking on a fix.",
          "timestamp": "2024-09-18T18:45:25+01:00",
          "tree_id": "5e6431cbc05cfc3ab3d0b6157c67f27c22ca2053",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0d7536395f2406a22a76f15d01114730c84edc18"
        },
        "date": 1726682688495,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 34453.855825000006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 31526.71045700001 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5209.434158999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4800.642081999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 100466.15019100001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 100466150000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14615.517485,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14615518000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8620062058,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8620062058 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 151865072,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 151865072 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 7063396375,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 7063396375 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 128268116,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 128268116 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "fcarreiro@users.noreply.github.com",
            "name": "Facundo",
            "username": "fcarreiro"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "3b78058288edbbe18a2eb8c81de5576c8a9478ab",
          "message": "feat(avm): set avm circuit subgroup size (#8537)\n\nI had to make a few changes in this PR, so bear with me.\n\nInside you there are two wolves:\n* The size of the generated trace (which I'll call the \"trace\"): e.g., you run a loop from 1 to 1000 and get a trace with size 1000 (or, if you will, ~2^18 if you add the precomputed columns)\n* The size of the polynomials used for proving: aka circuit subgroup size. We need to set this to some number, since the VK and other things depend on it.\n\nIn this PR I'm setting the latter to 2^21. Is that all? No, because this still needs to work with traces <  2^21. Can't you just resize the trace to 2^21 and call it a day? You can, but then your memory and time will suck.\n\nThis PR therefore does the following: Suppose your trace has size 1000 and you know already our subgroup size is set to 2^21. The polynomials will be initialized with a real size of 1000 rows, and a virtual size of 2^21. Then the values will be set from our generated trace.\n* This is far better in terms of memory because you only \"pay for what you use\"*.\n* This is also far better in terms of time, because resizing the trace to 2^21 takes _forever_ (like 20s+). This is because we currently use `std::vector` which forces the initialization of every field, even if you previously reserved memory (which btw is fast).\n\nExtra: I also did some cleanups, in particular I try to rely less on environment variables and have a clear flow separation between \"prod\" and tests.\n* bb avm_prove only runs check circuit if you really ask for it.\n* bb avm_prove uses full proving by default (all range checks and precomputed tables). This will in particular help with a more realistic devnet/testnet.\n* tests manually set the above options\n* check-circuit only checks rows up to the \"trace\" size; this should make it faster and still sound.\n* the 2^21 size does not (effectively) affect check-circuit\n\nResults: I'm running [this program](https://aztecprotocol.slack.com/archives/C04DL2L1UP2/p1726072481664099?thread_ts=1726066963.338779&cid=C04DL2L1UP2), which at 2^22 rows took 6 minutes and 280GB ram. Let's then suppose that for 2^21 it would've taken 3 minutes and 140GB ram.\n* After this PR, proving takes 49 seconds, and 31GB ram. (note that the time gains include as well the last few PRs)\n\n*that is, if you use 1000 rows, you allocate 1000 rows. Sparcity is not yet taken into account. We need some more changes for that.",
          "timestamp": "2024-09-18T20:58:12+01:00",
          "tree_id": "ec719e9bbdb65edf6d41c962ba985d572d5bd739",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/3b78058288edbbe18a2eb8c81de5576c8a9478ab"
        },
        "date": 1726690468439,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 34534.05058300001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 31890.514240999997 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5092.531742000006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4705.447382000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 99315.197722,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 99315198000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14625.478427999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14625479000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8608850086,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8608850086 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 152497694,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 152497694 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6986861723,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6986861723 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 125798624,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 125798624 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "adam.domurad@gmail.com",
            "name": "ludamad",
            "username": "ludamad"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "e4172318af81ac2ac8535c89d3e5afc72d33ba29",
          "message": "feat(avm): avm recursive TS/Noir integration (#8611)\n\nReverts AztecProtocol/aztec-packages#8610\r\n\r\n@jeanmon I have put an e2e-all label on this as it has broke master with\r\nmy changes, unfortunately, it seems we need to make sure we're not\r\nimporting jest mock outside of a dev setting\r\n\r\n---------\r\n\r\nCo-authored-by: jeanmon <jean@aztecprotocol.com>",
          "timestamp": "2024-09-18T21:48:03Z",
          "tree_id": "b9c64623e0ec47f2a310557506c89256c35bde11",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e4172318af81ac2ac8535c89d3e5afc72d33ba29"
        },
        "date": 1726697092297,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 34725.06695799999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 32181.748418999996 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5180.609067999995,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4795.414558 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 99708.02511599999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 99708026000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14738.087916,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14738088000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8630409294,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8630409294 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 152862691,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 152862691 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 7079316974,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 7079316974 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 125167764,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 125167764 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "132435771+jeanmon@users.noreply.github.com",
            "name": "Jean M",
            "username": "jeanmon"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "facff7fd0b6ea57e91f7d3e3863435655d8b48ea",
          "message": "feat(avm): opcode STATICCALL -  stubbed (#8601)\n\nResolves #8596",
          "timestamp": "2024-09-19T09:47:34Z",
          "tree_id": "706f72ef5966ac5386329fccfc208b9c32064959",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/facff7fd0b6ea57e91f7d3e3863435655d8b48ea"
        },
        "date": 1726740171385,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 34330.384928,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 31818.694439 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5090.04088799999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4700.081128000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 99879.39688400002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 99879397000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14557.925952000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14557925000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8656759414,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8656759414 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 161280643,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 161280643 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 7097940829,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 7097940829 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 129534753,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 129534753 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "132435771+jeanmon@users.noreply.github.com",
            "name": "Jean M",
            "username": "jeanmon"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "14ff3cfb4291c288113695a3f2245340587fc8e9",
          "message": "chore: Fixing MacOS build - static_cast from field issue (#8642)\n\nhttps://github.com/AztecProtocol/aztec-packages/actions/runs/10938557062",
          "timestamp": "2024-09-19T13:36:53+02:00",
          "tree_id": "9e9008fbdfcfc87e87cfd65a84a1d6bcdf2a19d2",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/14ff3cfb4291c288113695a3f2245340587fc8e9"
        },
        "date": 1726746806592,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 34821.605266000006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 32005.028302999996 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5163.83900000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4722.572210999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 100072.42975799998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 100072430000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14625.934406999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14625933000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8579756843,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8579756843 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 157701469,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 157701469 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 7023038812,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 7023038812 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 127818469,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 127818469 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "98505400+ledwards2225@users.noreply.github.com",
            "name": "ledwards2225",
            "username": "ledwards2225"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "09e2f447b003ed4c77b12069893785851a2c6258",
          "message": "feat: constant sized PG proofs and const sized PG rec verifier (#8605)\n\nConstant sized PG proofs and const sized PG rec verifier (similar to\r\nprevious work for Honk using `CONST_PROOF_SIZE_LOG_N = 28`). This is to\r\nfacilitate consistent/precomputable VKs for kernel circuits which\r\ncontain PG recursive verifiers. I'm using `CONST_PG_LOG_N == 20` since\r\nwe don't currently fold anything larger than that but this can easily be\r\ntweaked if necessary.\r\n\r\nCloses https://github.com/AztecProtocol/barretenberg/issues/1087 (we now\r\nsend the perturbator on the first round even though it is all zeros)",
          "timestamp": "2024-09-19T06:51:12-07:00",
          "tree_id": "465f3d4a3c9ff93f5fa97d8856540cb6f2c9b554",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/09e2f447b003ed4c77b12069893785851a2c6258"
        },
        "date": 1726754944824,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 35750.01290999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 33297.544386 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5106.889340999985,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4744.051185000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 99792.55326300002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 99792554000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14615.851922,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14615852000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8537604370,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8537604370 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 151228627,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 151228627 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6937659259,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6937659259 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126277511,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126277511 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "lucasxia01@gmail.com",
            "name": "Lucas Xia",
            "username": "lucasxia01"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "581801863529cd2b437cb51b041ada17a96949e0",
          "message": "fix: new commit_sparse bug and new tests (#8649)\n\nThis bug in commit_sparse was due to an assumption that the size of the\r\npolynomial was a power of 2. The structured polynomials work recently\r\nmade this assumption incorrect as we can set start and end indices for a\r\npolynomial. One note is that the bug only happens if the size is large\r\nenough (bigger than the number of cpus from `get_num_cpus_pow2()`)\r\nbecause we otherwise would use 1 thread (which divides any number).\r\n\r\nThe 3 new tests test commit_sparse on a polynomial that has a size !=\r\nvirtual_size, a start_idx != 0, and a larger test case where both are\r\ntrue. This larger test case fails without the fix.",
          "timestamp": "2024-09-19T16:34:31Z",
          "tree_id": "270c43f72abe1960a8a5aff7dc9b6e90fad9496c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/581801863529cd2b437cb51b041ada17a96949e0"
        },
        "date": 1726764561470,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 35655.197654999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 32488.129645999998 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5088.553306999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4698.823001000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 100479.304955,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 100479305000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14616.722498999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14616723000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8526541678,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8526541678 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 157193732,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 157193732 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 7043269759,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 7043269759 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 127775528,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 127775528 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "fcarreiro@users.noreply.github.com",
            "name": "Facundo",
            "username": "fcarreiro"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "8bfc769d7cbd6f88bfa7926c051a329ee0fd3468",
          "message": "fix(avm): fix tests under proving (#8640)\n\nThere was a bug in `commit_sparse` which broke one of the tests but\nLucas fixed it.\nSee\nhttps://aztecprotocol.slack.com/archives/C04DL2L1UP2/p1726738000560929?thread_ts=1726728397.210449&cid=C04DL2L1UP2\n\nThis PR also fixes the other tests that were failing, and re-enables the\nbb-prover test.\n\n---------\n\nCo-authored-by: Maddiaa0 <47148561+Maddiaa0@users.noreply.github.com>",
          "timestamp": "2024-09-20T09:22:50+01:00",
          "tree_id": "62032ee772f547afa88cf782cf946f05e8c78ecf",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8bfc769d7cbd6f88bfa7926c051a329ee0fd3468"
        },
        "date": 1726821511849,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 35557.231949,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 32893.423675 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5093.001473999991,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4674.004397999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 100276.62659200002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 100276627000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14531.35694,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14531357000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8511005529,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8511005529 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 152320052,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 152320052 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6976493661,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6976493661 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 128881344,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 128881344 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "fcarreiro@users.noreply.github.com",
            "name": "Facundo",
            "username": "fcarreiro"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "241897733fe0a5e2ccdf322449debd367f458086",
          "message": "chore(avm): smaller skippable test (#8664)\n\nThe elements are completely random so a few iterations should be more\nthan enough.",
          "timestamp": "2024-09-20T10:55:54+01:00",
          "tree_id": "e030c9296f0ccaabf789e88e5b081cba48961493",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/241897733fe0a5e2ccdf322449debd367f458086"
        },
        "date": 1726827089495,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 35578.78789300003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 32572.589048000005 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5094.099117999988,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4613.215919999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 100027.067257,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 100027067000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14486.760496000003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14486760000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8572286641,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8572286641 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 154320999,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 154320999 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6972285332,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6972285332 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 127364027,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 127364027 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "98505400+ledwards2225@users.noreply.github.com",
            "name": "ledwards2225",
            "username": "ledwards2225"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "020d4fd0cf4137e21f55b1c41e9e381a27191d84",
          "message": "feat: more robust recursion input generator (#8634)\n\nIntroduces the method `write_recursion_inputs_honk` in main.cpp that,\r\ngiven a program, produces the inputs (in the form of a Prover.toml) to a\r\nsecond noir program that recursively verifies a proof of the first. This\r\nis used to update/simplify the logic in\r\n`regenerate_verify_honk_proof_inputs.sh` as a proof of concept. (Also\r\nreplaces `update_verify_honk_proof_inputs.py` with similar logic in\r\n`ProofSurgeon` that deals more dynamically with the public inputs).\r\n\r\nThe reason for doing this is that similar logic will be needed to create\r\ntests for `noir::verify_proof()` for Oink/PG which will have slightly\r\ndifferent forms. A flow of this kind will also be used to generate\r\ninputs from typescript in the integration and e2e tests.",
          "timestamp": "2024-09-20T14:41:28-07:00",
          "tree_id": "f2d27495b19e3c37cbb1503e7e3610461143674f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/020d4fd0cf4137e21f55b1c41e9e381a27191d84"
        },
        "date": 1726869479251,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 35518.534988999985,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 32979.06877299999 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5071.168607999994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4669.531049 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 100133.509825,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 100133511000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14599.951304999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14599953000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8485322032,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8485322032 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 154908756,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 154908756 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6910694843,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6910694843 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126681476,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126681476 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "lucasxia01@gmail.com",
            "name": "Lucas Xia",
            "username": "lucasxia01"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "7247ddba274e691a7c5220848caf1fa9d6aa911e",
          "message": "feat: reduce max memory in translator by freeing accumulator and eccvm (#8253)\n\nWe free the accumulator as soon as the decider_prover is done, the\r\neccvm_builder as soon as the eccvm_prover is constructed, the\r\ntranslator_builder as soon as the translator_prover is constructed, and\r\nthe eccvm_prover, as soon as we pass all the necessary information to\r\nthe translator_builder. The peak memory drops by 18MB, but what's\r\nsignificant is that the translator is no longer the bottleneck of the\r\nbenchmark, mostly due to freeing the accumulator.\r\n\r\nThe peak memory during the eccvm/translator drops from 666MiB to 328MiB,\r\na drop of 338MiB, which is approximately the size of one instance and\r\nthe commitment key, which is as expected.\r\nBefore:\r\n<img width=\"1180\" alt=\"Screenshot 2024-09-20 at 1 55 13 PM\"\r\nsrc=\"https://github.com/user-attachments/assets/469fe1e0-01ac-4e4e-a794-0266d15b4a5f\">\r\n\r\nAfter:\r\n<img width=\"1193\" alt=\"Screenshot 2024-09-19 at 6 28 39 PM\"\r\nsrc=\"https://github.com/user-attachments/assets/2f5c8873-5aa4-4631-a6f1-9a01aeef633c\">",
          "timestamp": "2024-09-20T23:59:32Z",
          "tree_id": "df47871825ea1b7f0403881d1e32c4f9bd913aa5",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7247ddba274e691a7c5220848caf1fa9d6aa911e"
        },
        "date": 1726878103331,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 35508.039739,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 33102.333335 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5065.420864000003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4657.826131999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 99999.80876700001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 99999809000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14631.000183999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14631000000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8463736260,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8463736260 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 152397387,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 152397387 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6882939781,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6882939781 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126519853,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126519853 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "ilyas@aztecprotocol.com",
            "name": "Ilyas Ridhuan",
            "username": "IlyasRidhuan"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "aee4c2dde7576fad1c47e407ee0dca43dac2b1b4",
          "message": "fix: unencryptedlogs witgen (#8669)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\r\nline.",
          "timestamp": "2024-09-23T13:21:13+01:00",
          "tree_id": "ab4c8de6d51eace13988021ed356790caa3fd1d6",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/aee4c2dde7576fad1c47e407ee0dca43dac2b1b4"
        },
        "date": 1727095026987,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 35519.744156,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 33173.925431 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5094.787852999985,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4680.429264 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 100156.09508300001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 100156095000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14689.026764000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14689028000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8529613306,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8529613306 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 151630054,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 151630054 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6955644574,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6955644574 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126376435,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126376435 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "132435771+jeanmon@users.noreply.github.com",
            "name": "Jean M",
            "username": "jeanmon"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "aa85f2a781223f067291b5702f2e47baced865fd",
          "message": "feat(avm): bounded mle implementation (#8668)\n\nResolves #8651",
          "timestamp": "2024-09-23T15:24:26+02:00",
          "tree_id": "6dab82790f8968bb575fb8ad25eafc34b46e7084",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/aa85f2a781223f067291b5702f2e47baced865fd"
        },
        "date": 1727098979816,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 35427.54291899999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 32831.98329900001 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5072.556243000008,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4702.8317179999995 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 99988.542449,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 99988542000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14649.418003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14649419000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8470892311,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8470892311 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 150899513,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 150899513 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6890351996,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6890351996 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 125758766,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 125758766 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "47281315+guipublic@users.noreply.github.com",
            "name": "guipublic",
            "username": "guipublic"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "4b4a0bf17050893f913b3db10bc70a584b7aaa5e",
          "message": "feat!: remove sha256 opcode (#4571)\n\nThis PR resolves Noir issue 4330:\r\nhttps://github.com/noir-lang/noir/issues/4330\r\nby removing the sha256 opcode and replacing the sha256 function in the\r\nstdlib by the implementation using the sha256 compression opcode (also\r\nin the stdlib).\r\n\r\n---------\r\n\r\nCo-authored-by: kevaundray <kevtheappdev@gmail.com>\r\nCo-authored-by: Tom French <tom@tomfren.ch>\r\nCo-authored-by: Tom French <15848336+TomAFrench@users.noreply.github.com>\r\nCo-authored-by: dbanks12 <david@aztecprotocol.com>\r\nCo-authored-by: David Banks <47112877+dbanks12@users.noreply.github.com>\r\nCo-authored-by: fcarreiro <facundo@aztecprotocol.com>",
          "timestamp": "2024-09-23T16:34:57+01:00",
          "tree_id": "7e8b87db215b10d93002cba041a92dea672ea161",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/4b4a0bf17050893f913b3db10bc70a584b7aaa5e"
        },
        "date": 1727106686409,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 35711.99144300001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 32845.22258399999 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5108.522912999987,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4669.1272420000005 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 100183.011734,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 100183012000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14633.030694000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14633030000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8700329535,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8700329535 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 155191763,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 155191763 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 7015644480,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 7015644480 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 128100084,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 128100084 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "codygunton@gmail.com",
            "name": "Cody Gunton",
            "username": "codygunton"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "c738c47bd13875ba1649d808e7abd2908fa29e07",
          "message": "feat: Benchmark compute_row_evaluations and update analysis script (#8673)\n\nAdds a bench and updates the CIVC benchmark analysis script to use the\r\nnew name for Oink part of the Pg prover.\r\n\r\nBenchmark results:\r\n```\r\nBenchmarking lock created at ~/BENCHMARK_IN_PROGRESS.\r\nprotogalaxy_bench                                                            100% 5225KB  24.6MB/s   00:00    \r\n2024-09-20T20:16:15+00:00\r\nRunning ./protogalaxy_bench\r\nRun on (16 X 3000 MHz CPU s)\r\nCPU Caches:\r\n  L1 Data 32 KiB (x8)\r\n  L1 Instruction 32 KiB (x8)\r\n  L2 Unified 1024 KiB (x8)\r\n  L3 Unified 36608 KiB (x1)\r\nLoad Average: 0.08, 0.06, 0.34\r\n---------------------------------------------------------------------\r\nBenchmark                           Time             CPU   Iterations\r\n---------------------------------------------------------------------\r\ncompute_row_evaluations/15       6.59 ms         6.51 ms          107\r\ncompute_row_evaluations/16       13.4 ms         13.4 ms           52\r\ncompute_row_evaluations/17       27.0 ms         26.9 ms           26\r\ncompute_row_evaluations/18       54.8 ms         54.6 ms           12\r\ncompute_row_evaluations/19        112 ms          112 ms            6\r\ncompute_row_evaluations/20        233 ms          232 ms            3\r\ncompute_row_evaluations/21        462 ms          461 ms            2\r\n```",
          "timestamp": "2024-09-23T13:26:36-04:00",
          "tree_id": "a23f3284e8e81084606764c96e3c748dc2892ccd",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c738c47bd13875ba1649d808e7abd2908fa29e07"
        },
        "date": 1727113701353,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 35486.88972599999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 32665.300613 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5061.530147000013,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4632.1967319999985 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 99973.02269,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 99973023000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14593.369593,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14593368000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8509675826,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8509675826 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 152129082,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 152129082 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6923318725,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6923318725 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126820835,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126820835 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "98505400+ledwards2225@users.noreply.github.com",
            "name": "ledwards2225",
            "username": "ledwards2225"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "014bacc0b2f1d56f416a3ab939b8aa5ad90656dd",
          "message": "chore: remove creation of extra toml file in recursion inputs flow (#8700)\n\nWe used to need to create a duplicate of the verify_honk_proof noir\r\nprogram artifacts due to a quirk of gate count functionality. This issue\r\nhas been resolved on the noir side so I'm removing the related logic in\r\nmain.cpp.",
          "timestamp": "2024-09-23T13:05:04-07:00",
          "tree_id": "ccdd3b4d5d8d4d4bdafaa6de64164e7a31b42115",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/014bacc0b2f1d56f416a3ab939b8aa5ad90656dd"
        },
        "date": 1727122957661,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 35600.48311399999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 33518.295507 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5087.867708999994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4720.166942000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 100130.70440700001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 100130704000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14626.821702999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14626821000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8508666413,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8508666413 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 151917639,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 151917639 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6929389264,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6929389264 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 127027879,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 127027879 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "mara@aztecprotocol.com",
            "name": "maramihali",
            "username": "maramihali"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "74182c40e152e988ee8590f39c51d00150ef01ca",
          "message": "chore: bye bye Zeromorph in Solidity (#8678)",
          "timestamp": "2024-09-23T22:19:41+01:00",
          "tree_id": "260f310c224e11a41c39f7e89a65d5875c4b46f1",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/74182c40e152e988ee8590f39c51d00150ef01ca"
        },
        "date": 1727127653755,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 35445.246311999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 32836.629882 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5077.905118000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4681.054077000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 99774.200399,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 99774200000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14672.293384,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14672292000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8508856970,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8508856970 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 152123005,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 152123005 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6906324292,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6906324292 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126293666,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126293666 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "fcarreiro@users.noreply.github.com",
            "name": "Facundo",
            "username": "fcarreiro"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "02cff0b525d9d6b1c854219f06713a8b94a8e9f5",
          "message": "feat(avm)!: GETENVVAR + ISSTATICCALL (#8692)\n\nThe reason I'm keeping all the oracles on the Noir side, is because I\nneed to pass the enum index as an immediate and Noir doesn't allow that\nin any other way. That is, if you had an oracle `get_env_var(var_idx:\nu8)`, when you call it like `get_env_var(12)` you would get a memory\naddress with the 12 in it; and not the `12` constant.",
          "timestamp": "2024-09-23T22:22:48+01:00",
          "tree_id": "85849c2669a46e1bd2e5360dd2c0da4494958ac6",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/02cff0b525d9d6b1c854219f06713a8b94a8e9f5"
        },
        "date": 1727127753822,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 35921.812904000006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 32961.710527999996 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5168.4432219999935,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4780.557187000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 100701.421666,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 100701422000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14730.694588,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14730695000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8555063148,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8555063148 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 151466359,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 151466359 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 7012223068,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 7012223068 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 128665911,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 128665911 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "sirasistant@gmail.com",
            "name": "Álvaro Rodríguez",
            "username": "sirasistant"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "779e10499cfe668506ba8a199342cf86fae258a7",
          "message": "feat: Add initial integration of databus (#8710)\n\nStart integrating the databus in the mock circuits to uncover any\r\nintegration issues.",
          "timestamp": "2024-09-24T11:59:47+02:00",
          "tree_id": "45e94b46e1c067d6ea5252869674791c36624bb7",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/779e10499cfe668506ba8a199342cf86fae258a7"
        },
        "date": 1727172956418,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 35553.722244,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 33087.20223499999 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5169.344846999991,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4760.806305 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 100156.344996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 100156345000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14605.634111000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14605634000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8534019750,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8534019750 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 154077591,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 154077591 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6933192631,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6933192631 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 128985101,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 128985101 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "47281315+guipublic@users.noreply.github.com",
            "name": "guipublic",
            "username": "guipublic"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "aabd2d85d4f3f35d67d53421b47214aa8904c505",
          "message": "chore!: change ec_add to unsafe implementation (but much better perf) (#8374)\n\nUse `unconditional_add` for ec_add ACIR opcode.\r\nThis improves a lot the performance of the opcode, but also makes it\r\nunsafe.\r\n~~I keep the PR as draft until aztec packages are sync with Noir PR\r\nhttps://github.com/noir-lang/noir/pull/5858 which adds the checks in the\r\nstdlib function.~~\r\nThe unsafe version can then be used when we know the inputs are valid\r\n(for instance if they come from a previous add).\r\nn.b.: the real performance boost will happen when we will be able to use\r\nthe unsafe version.\r\n\r\nCo-authored-by: Tom French <15848336+TomAFrench@users.noreply.github.com>",
          "timestamp": "2024-09-24T12:13:40+01:00",
          "tree_id": "dc62adfd4a2d1e35bf56eec16f05d9572fdaefc9",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/aabd2d85d4f3f35d67d53421b47214aa8904c505"
        },
        "date": 1727177606332,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 35610.394039,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 33019.866771 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5094.009241000009,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4638.731148999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 100171.561547,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 100171562000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14652.519745000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14652520000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8508471892,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8508471892 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 152141245,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 152141245 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6909657651,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6909657651 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 128889651,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 128889651 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "adam.domurad@gmail.com",
            "name": "ludamad",
            "username": "ludamad"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "9a1b5b5fdd3194f4e7833aacbca4f48aadafbd74",
          "message": "fix(revert): \"chore!: change ec_add to unsafe implementation (but much better perf)\" (#8722)\n\nReverts AztecProtocol/aztec-packages#8374 as it broke prover tests",
          "timestamp": "2024-09-24T08:37:00-04:00",
          "tree_id": "10c8a69b787e8cfdd48946fc63b3674435e027e9",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9a1b5b5fdd3194f4e7833aacbca4f48aadafbd74"
        },
        "date": 1727182671783,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 35543.60957000003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 32833.647735 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5075.156475000029,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4671.670881000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 100104.16768400001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 100104168000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14586.569835,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14586569000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8946052540,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8946052540 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 155268581,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 155268581 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6928716998,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6928716998 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 127391888,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 127391888 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "mara@aztecprotocol.com",
            "name": "maramihali",
            "username": "maramihali"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "82b60ebbdb18400363248b80986c993df1b7e4af",
          "message": "feat: Make UltraKeccak work with Shplemini at bb-level (#8646)\n\nIn this PR:\r\n- make UltraKeccak flavor inherit from Ultra\r\n- make a Shplemini Prover\r\n- run UltraKeccak Honk with Shplemini but with variable size proof for\r\nnow in c++ tests\r\n- only send proof up to sumcheck to smart contract tests",
          "timestamp": "2024-09-24T13:37:07Z",
          "tree_id": "890eced6334948dd669128cd0fbe792671331e08",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/82b60ebbdb18400363248b80986c993df1b7e4af"
        },
        "date": 1727186565476,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 36062.58769800002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 33579.66793199999 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5350.434732000011,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4904.183241 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 109223.14233699998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 109223143000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14950.469641,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14950470000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8662511335,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8662511335 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 163672632,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 163672632 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8589236127,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8589236127 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 155233205,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 155233205 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "47112877+dbanks12@users.noreply.github.com",
            "name": "David Banks",
            "username": "dbanks12"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "d5f16cc41bc077f24947fc92af2767630e928ed8",
          "message": "chore: gas premiums for AVM side effects, DA gas in AVM (#8632)",
          "timestamp": "2024-09-24T15:14:29Z",
          "tree_id": "20a996b2debcd38ec46edf11bbd83122fcbd3448",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d5f16cc41bc077f24947fc92af2767630e928ed8"
        },
        "date": 1727192078978,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 35576.865808999995,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 33394.66969 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5074.520644999992,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4697.325694 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 109804.60372300001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 109804605000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14673.233361999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14673233000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8633977977,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8633977977 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 159119559,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 159119559 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8475880655,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8475880655 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 149702573,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 149702573 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "codygunton@gmail.com",
            "name": "Cody Gunton",
            "username": "codygunton"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "251db7be2d7541852de314a13a85205b4b3a0418",
          "message": "chore: Skip some tests in CI (#8738)\n\nIntroduce a string for filtering Barretenberg tests run by ctest and\r\napply it to biggroup, bigfield, and stdlib Plonk verifier tests. These\r\nno longer run in CI!",
          "timestamp": "2024-09-24T13:59:50-04:00",
          "tree_id": "7df6759d59cb53cc94842b949ae4c23fbe9ead4e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/251db7be2d7541852de314a13a85205b4b3a0418"
        },
        "date": 1727202066886,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 35597.270968000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 32999.882486 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5077.077724999981,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4708.875560999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 100170.500261,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 100170501000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14645.022856000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14645023000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8522271578,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8522271578 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 152270596,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 152270596 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6948645268,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6948645268 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126854021,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126854021 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "lucasxia01@gmail.com",
            "name": "Lucas Xia",
            "username": "lucasxia01"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "3fa9e83c0fac460f586572fe2866823fe7f740d2",
          "message": "feat: aggregate honk and avm recursion constraints together (#8696)\n\nCloses https://github.com/AztecProtocol/barretenberg/issues/1095.\r\n\r\nWe should aggregate the aggregation objects generated by the Honk and\r\nAVM recursion constraints. Previously, we were creating 2 separate ones\r\nand adding them to the builder, which would've triggered an assert\r\nfailure. This work should allow for circuits (like the public kernel) to\r\nhave both Honk and AVM recursion constraints.",
          "timestamp": "2024-09-24T18:47:37Z",
          "tree_id": "a8f6f36ba4d6704dae44663000f228dbc8922b0c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/3fa9e83c0fac460f586572fe2866823fe7f740d2"
        },
        "date": 1727204691403,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 35740.66671,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 32821.736080999995 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5091.436273999989,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4666.109576999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 100956.19081000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 100956190000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14706.530304,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14706531000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8599888747,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8599888747 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 151599410,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 151599410 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6983788651,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6983788651 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 128864754,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 128864754 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "codygunton@gmail.com",
            "name": "Cody Gunton",
            "username": "codygunton"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "18e2697d8791b4533e042ec04526e32922b608bc",
          "message": "chore: Reinstate skipped tests (#8743)\n\nThese are quite stable but ofc it's better not to skip them...",
          "timestamp": "2024-09-24T15:20:56-04:00",
          "tree_id": "27407237d2bd57fed3773bcc29ba0460973e8e1d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/18e2697d8791b4533e042ec04526e32922b608bc"
        },
        "date": 1727206722216,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 36047.63246600001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 33034.232616 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5098.743770000013,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4634.337874000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 100527.65451000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 100527654000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14616.245246999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14616244000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8739989012,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8739989012 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 154709847,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 154709847 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6931342943,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6931342943 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 125271446,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 125271446 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "name": "AztecProtocol",
            "username": "AztecProtocol"
          },
          "committer": {
            "name": "AztecProtocol",
            "username": "AztecProtocol"
          },
          "id": "21277fe4c29ea1fa36a1f36d0bce2c93b5734e85",
          "message": "chore(master): Release 0.56.0",
          "timestamp": "2024-09-25T15:19:57Z",
          "url": "https://github.com/AztecProtocol/aztec-packages/pull/8597/commits/21277fe4c29ea1fa36a1f36d0bce2c93b5734e85"
        },
        "date": 1727278623635,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 35567.05756899998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 32960.62841700001 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5071.335064999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4682.359494000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 99952.717225,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 99952718000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14608.651055,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14608651000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8540171919,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8540171919 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 155569260,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 155569260 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6941929160,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6941929160 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126783596,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126783596 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "49558828+AztecBot@users.noreply.github.com",
            "name": "Aztec Bot",
            "username": "AztecBot"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "8f72bc17ab95a93f42255658abe2823b27681aad",
          "message": "chore(master): Release 0.56.0 (#8597)\n\n:robot: I have created a release *beep* *boop*\r\n---\r\n\r\n\r\n<details><summary>aztec-package: 0.56.0</summary>\r\n\r\n##\r\n[0.56.0](https://github.com/AztecProtocol/aztec-packages/compare/aztec-package-v0.55.1...aztec-package-v0.56.0)\r\n(2024-09-25)\r\n\r\n\r\n### ⚠ BREAKING CHANGES\r\n\r\n* remove key registry\r\n([#8613](https://github.com/AztecProtocol/aztec-packages/issues/8613))\r\n\r\n### Features\r\n\r\n* Remove key registry\r\n([#8613](https://github.com/AztecProtocol/aztec-packages/issues/8613))\r\n([a668506](https://github.com/AztecProtocol/aztec-packages/commit/a6685067a0a5d17cbbc4cbfed4e78e364864ff51))\r\n* Update rollup storage to hold pending/proven tips\r\n([#8583](https://github.com/AztecProtocol/aztec-packages/issues/8583))\r\n([38e3051](https://github.com/AztecProtocol/aztec-packages/commit/38e3051d60f9f8a80e33fab4e0f7f3ec3cde2ee2))\r\n</details>\r\n\r\n<details><summary>barretenberg.js: 0.56.0</summary>\r\n\r\n##\r\n[0.56.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg.js-v0.55.1...barretenberg.js-v0.56.0)\r\n(2024-09-25)\r\n\r\n\r\n### Features\r\n\r\n* Use new IVC scheme\r\n([#8480](https://github.com/AztecProtocol/aztec-packages/issues/8480))\r\n([1c7b06d](https://github.com/AztecProtocol/aztec-packages/commit/1c7b06d6621d9873f84147b2b7f1f22bf21bbacb))\r\n\r\n\r\n### Bug Fixes\r\n\r\n* Skip G1 SRS download if numPoints is zero\r\n([#8717](https://github.com/AztecProtocol/aztec-packages/issues/8717))\r\n([753cdf8](https://github.com/AztecProtocol/aztec-packages/commit/753cdf8b047365b6280c0306fdc6f59f824f740b))\r\n\r\n\r\n### Miscellaneous\r\n\r\n* Migrate higher-level APIs for barretenberg to bb.js\r\n([#8677](https://github.com/AztecProtocol/aztec-packages/issues/8677))\r\n([0237a20](https://github.com/AztecProtocol/aztec-packages/commit/0237a20c989f2b37a64ee18b41c1da361363a81f))\r\n</details>\r\n\r\n<details><summary>aztec-packages: 0.56.0</summary>\r\n\r\n##\r\n[0.56.0](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.55.1...aztec-packages-v0.56.0)\r\n(2024-09-25)\r\n\r\n\r\n### ⚠ BREAKING CHANGES\r\n\r\n* make compute_nullifier_without_context unconstrained\r\n([#8742](https://github.com/AztecProtocol/aztec-packages/issues/8742))\r\n* remove PublicContextInputs\r\n([#8770](https://github.com/AztecProtocol/aztec-packages/issues/8770))\r\n* make TestEnvironment be unconstrained\r\n([#8747](https://github.com/AztecProtocol/aztec-packages/issues/8747))\r\n* change ec_add to unsafe implementation (but much better perf)\r\n([#8374](https://github.com/AztecProtocol/aztec-packages/issues/8374))\r\n* `aztec_macros` are dead, long live `aztec::macros`\r\n([#8438](https://github.com/AztecProtocol/aztec-packages/issues/8438))\r\n* **avm:** GETENVVAR + ISSTATICCALL\r\n([#8692](https://github.com/AztecProtocol/aztec-packages/issues/8692))\r\n* remove sha256 opcode\r\n([#4571](https://github.com/AztecProtocol/aztec-packages/issues/4571))\r\n* removing implicit numeric generics\r\n(https://github.com/noir-lang/noir/pull/5837)\r\n* Infer globals to be u32 when used in a type\r\n(https://github.com/noir-lang/noir/pull/6083)\r\n* add support for u1 in the avm, ToRadix's radix arg is a memory addr\r\n([#8570](https://github.com/AztecProtocol/aztec-packages/issues/8570))\r\n* remove key registry\r\n([#8613](https://github.com/AztecProtocol/aztec-packages/issues/8613))\r\n* **avm:** dont compress public bytecode\r\n([#8623](https://github.com/AztecProtocol/aztec-packages/issues/8623))\r\n* **avm:** remove tag in NOT\r\n([#8606](https://github.com/AztecProtocol/aztec-packages/issues/8606))\r\n\r\n### Features\r\n\r\n* (LSP) if in runtime code, always suggest functions that return Quoted\r\nas macro calls (https://github.com/noir-lang/noir/pull/6098)\r\n([7fb2a45](https://github.com/AztecProtocol/aztec-packages/commit/7fb2a454531db8cef757b5ec2028d97e823bef5f))\r\n* (LSP) remove unused imports\r\n(https://github.com/noir-lang/noir/pull/6129)\r\n([4522c4f](https://github.com/AztecProtocol/aztec-packages/commit/4522c4f428b288825013d7c38c5a4cbc5b8c8f58))\r\n* (LSP) show global value on hover\r\n(https://github.com/noir-lang/noir/pull/6097)\r\n([7fb2a45](https://github.com/AztecProtocol/aztec-packages/commit/7fb2a454531db8cef757b5ec2028d97e823bef5f))\r\n* (LSP) suggest $vars inside `quote { ... }`\r\n(https://github.com/noir-lang/noir/pull/6114)\r\n([7a87314](https://github.com/AztecProtocol/aztec-packages/commit/7a873147444ef03bc1df88e0fdca3cf6fc124725))\r\n* `aztec_macros` are dead, long live `aztec::macros`\r\n([#8438](https://github.com/AztecProtocol/aztec-packages/issues/8438))\r\n([7cbabd6](https://github.com/AztecProtocol/aztec-packages/commit/7cbabd6840ee8127c12a51a2342ef634f1d58954))\r\n* Add `Expr::as_constructor`\r\n(https://github.com/noir-lang/noir/pull/5980)\r\n([7ea4709](https://github.com/AztecProtocol/aztec-packages/commit/7ea4709743aaaf2768d35d92cad3fbd4a8404fb0))\r\n* Add `Expr::as_for` and `Expr::as_for_range`\r\n(https://github.com/noir-lang/noir/pull/6039)\r\n([7ea4709](https://github.com/AztecProtocol/aztec-packages/commit/7ea4709743aaaf2768d35d92cad3fbd4a8404fb0))\r\n* Add `Expr::as_lambda` (https://github.com/noir-lang/noir/pull/6048)\r\n([7ea4709](https://github.com/AztecProtocol/aztec-packages/commit/7ea4709743aaaf2768d35d92cad3fbd4a8404fb0))\r\n* Add Aztec Bot to helm testnet package\r\n([#8702](https://github.com/AztecProtocol/aztec-packages/issues/8702))\r\n([982a04e](https://github.com/AztecProtocol/aztec-packages/commit/982a04e8021ec88b178ea05fdebb7193998cde38))\r\n* Add epochs to existing orchestrator\r\n([#8675](https://github.com/AztecProtocol/aztec-packages/issues/8675))\r\n([0337fe9](https://github.com/AztecProtocol/aztec-packages/commit/0337fe9c2a7ac9f19fe8f695c7c072102dae9ec2))\r\n* Add epochs to existing orchestrator v2\r\n([#8732](https://github.com/AztecProtocol/aztec-packages/issues/8732))\r\n([cec4d3f](https://github.com/AztecProtocol/aztec-packages/commit/cec4d3fedd5483cece5e53c0c1682d7a0b26f5fd))\r\n* Add initial integration of databus\r\n([#8710](https://github.com/AztecProtocol/aztec-packages/issues/8710))\r\n([779e104](https://github.com/AztecProtocol/aztec-packages/commit/779e10499cfe668506ba8a199342cf86fae258a7))\r\n* Add peer scoring to req resp rate limits\r\n([#8633](https://github.com/AztecProtocol/aztec-packages/issues/8633))\r\n([b015a79](https://github.com/AztecProtocol/aztec-packages/commit/b015a79560133d4bf842834066eb88bffba7cb7f))\r\n* Add separate report for public function bytecode sizes\r\n([#8750](https://github.com/AztecProtocol/aztec-packages/issues/8750))\r\n([d3c102f](https://github.com/AztecProtocol/aztec-packages/commit/d3c102f3c055e29c2beeb5ed81ac7b76b7135d25))\r\n* Add support for u1 in the avm, ToRadix's radix arg is a memory addr\r\n([#8570](https://github.com/AztecProtocol/aztec-packages/issues/8570))\r\n([1785737](https://github.com/AztecProtocol/aztec-packages/commit/178573738731e2e74e4119a035f913da39675d85))\r\n* Add validation to request / response interactions + adjust scoring\r\nappropiately\r\n([#8641](https://github.com/AztecProtocol/aztec-packages/issues/8641))\r\n([8dfdebc](https://github.com/AztecProtocol/aztec-packages/commit/8dfdebc7055ca89861a3727ea2d419fde98d6cf7))\r\n* Aggregate honk and avm recursion constraints together\r\n([#8696](https://github.com/AztecProtocol/aztec-packages/issues/8696))\r\n([3fa9e83](https://github.com/AztecProtocol/aztec-packages/commit/3fa9e83c0fac460f586572fe2866823fe7f740d2))\r\n* Allow visibility modifiers in struct definitions\r\n(https://github.com/noir-lang/noir/pull/6054)\r\n([7ea4709](https://github.com/AztecProtocol/aztec-packages/commit/7ea4709743aaaf2768d35d92cad3fbd4a8404fb0))\r\n* **avm:** Avm recursive TS/Noir integration\r\n([#8531](https://github.com/AztecProtocol/aztec-packages/issues/8531))\r\n([dd09f05](https://github.com/AztecProtocol/aztec-packages/commit/dd09f057e97ac1bba7b3fbf29b50737ebe5ca76f)),\r\ncloses\r\n[#7791](https://github.com/AztecProtocol/aztec-packages/issues/7791)\r\n* **avm:** Avm recursive TS/Noir integration\r\n([#8611](https://github.com/AztecProtocol/aztec-packages/issues/8611))\r\n([e417231](https://github.com/AztecProtocol/aztec-packages/commit/e4172318af81ac2ac8535c89d3e5afc72d33ba29))\r\n* **avm:** Bounded mle implementation\r\n([#8668](https://github.com/AztecProtocol/aztec-packages/issues/8668))\r\n([aa85f2a](https://github.com/AztecProtocol/aztec-packages/commit/aa85f2a781223f067291b5702f2e47baced865fd)),\r\ncloses\r\n[#8651](https://github.com/AztecProtocol/aztec-packages/issues/8651)\r\n* **avm:** GETENVVAR + ISSTATICCALL\r\n([#8692](https://github.com/AztecProtocol/aztec-packages/issues/8692))\r\n([02cff0b](https://github.com/AztecProtocol/aztec-packages/commit/02cff0b525d9d6b1c854219f06713a8b94a8e9f5))\r\n* **avm:** Opcode STATICCALL - stubbed\r\n([#8601](https://github.com/AztecProtocol/aztec-packages/issues/8601))\r\n([facff7f](https://github.com/AztecProtocol/aztec-packages/commit/facff7fd0b6ea57e91f7d3e3863435655d8b48ea)),\r\ncloses\r\n[#8596](https://github.com/AztecProtocol/aztec-packages/issues/8596)\r\n* **avm:** Remove tag in NOT\r\n([#8606](https://github.com/AztecProtocol/aztec-packages/issues/8606))\r\n([d5695fc](https://github.com/AztecProtocol/aztec-packages/commit/d5695fcde93cbfda3e45bfa03988a9e72f2dcb59))\r\n* **avm:** Return oracle\r\n([#8629](https://github.com/AztecProtocol/aztec-packages/issues/8629))\r\n([b6bc7c3](https://github.com/AztecProtocol/aztec-packages/commit/b6bc7c3f5064255480e3d4443471c2c50007d0ca))\r\n* **avm:** Set avm circuit subgroup size\r\n([#8537](https://github.com/AztecProtocol/aztec-packages/issues/8537))\r\n([3b78058](https://github.com/AztecProtocol/aztec-packages/commit/3b78058288edbbe18a2eb8c81de5576c8a9478ab))\r\n* Benchmark compute_row_evaluations and update analysis script\r\n([#8673](https://github.com/AztecProtocol/aztec-packages/issues/8673))\r\n([c738c47](https://github.com/AztecProtocol/aztec-packages/commit/c738c47bd13875ba1649d808e7abd2908fa29e07))\r\n* Check unconstrained trait impl method matches\r\n(https://github.com/noir-lang/noir/pull/6057)\r\n([3e0067a](https://github.com/AztecProtocol/aztec-packages/commit/3e0067a11935d4f2ead9579458d3c00c2f27f1ef))\r\n* Compute args hash with comptime length\r\n([#8736](https://github.com/AztecProtocol/aztec-packages/issues/8736))\r\n([dae82d8](https://github.com/AztecProtocol/aztec-packages/commit/dae82d84f95242ad7da1bf8e0c7e5063a35b1fef))\r\n* Constant sized PG proofs and const sized PG rec verifier\r\n([#8605](https://github.com/AztecProtocol/aztec-packages/issues/8605))\r\n([09e2f44](https://github.com/AztecProtocol/aztec-packages/commit/09e2f447b003ed4c77b12069893785851a2c6258))\r\n* Do not double error on import with error\r\n(https://github.com/noir-lang/noir/pull/6131)\r\n([0d9f547](https://github.com/AztecProtocol/aztec-packages/commit/0d9f547d4e470a1e5383c1fff4c0c6125169de19))\r\n* **docs:** Getting started, portals page, some other nits\r\n([#8515](https://github.com/AztecProtocol/aztec-packages/issues/8515))\r\n([9632e0d](https://github.com/AztecProtocol/aztec-packages/commit/9632e0dcf3c5b8966be0e1d02fa7ea9a5677af97))\r\n* **docs:** Some small custom note stuff\r\n([#8518](https://github.com/AztecProtocol/aztec-packages/issues/8518))\r\n([a098d41](https://github.com/AztecProtocol/aztec-packages/commit/a098d41ef0ba91beaf8b22a353bccd8e78bae5f5))\r\n* EpochProofQuote implementation in TS\r\n([#8689](https://github.com/AztecProtocol/aztec-packages/issues/8689))\r\n([1aad110](https://github.com/AztecProtocol/aztec-packages/commit/1aad110ba582599a69216dc0491f19b0df6dafea))\r\n* Faster LSP by caching file managers\r\n(https://github.com/noir-lang/noir/pull/6047)\r\n([7ea4709](https://github.com/AztecProtocol/aztec-packages/commit/7ea4709743aaaf2768d35d92cad3fbd4a8404fb0))\r\n* Implement `to_be_radix` in the comptime interpreter\r\n(https://github.com/noir-lang/noir/pull/6043)\r\n([7ea4709](https://github.com/AztecProtocol/aztec-packages/commit/7ea4709743aaaf2768d35d92cad3fbd4a8404fb0))\r\n* Implement solver for mov_registers_to_registers\r\n(https://github.com/noir-lang/noir/pull/6089)\r\n([03b9e71](https://github.com/AztecProtocol/aztec-packages/commit/03b9e71e5ebb3d46827671b2197697b5d294d04e))\r\n* Implement type paths (https://github.com/noir-lang/noir/pull/6093)\r\n([b330e87](https://github.com/AztecProtocol/aztec-packages/commit/b330e874dc11235eb9730aca7c936299378c9ce8))\r\n* Let LSP suggest macro calls too\r\n(https://github.com/noir-lang/noir/pull/6090)\r\n([b330e87](https://github.com/AztecProtocol/aztec-packages/commit/b330e874dc11235eb9730aca7c936299378c9ce8))\r\n* Light block builder\r\n([#8662](https://github.com/AztecProtocol/aztec-packages/issues/8662))\r\n([1e922a5](https://github.com/AztecProtocol/aztec-packages/commit/1e922a5a13bf3105e1317eda6d5536aa44a84b54))\r\n* LSP autocompletion for `TypePath`\r\n(https://github.com/noir-lang/noir/pull/6117)\r\n([7a87314](https://github.com/AztecProtocol/aztec-packages/commit/7a873147444ef03bc1df88e0fdca3cf6fc124725))\r\n* Make compute_nullifier_without_context unconstrained\r\n([#8742](https://github.com/AztecProtocol/aztec-packages/issues/8742))\r\n([e30a743](https://github.com/AztecProtocol/aztec-packages/commit/e30a743d01ab190a1f7a677d2ae667f15c83d97f))\r\n* Make TestEnvironment be unconstrained\r\n([#8747](https://github.com/AztecProtocol/aztec-packages/issues/8747))\r\n([b9a1f59](https://github.com/AztecProtocol/aztec-packages/commit/b9a1f59a5343c8fa7caa957a5ebc3eb533a21c9c))\r\n* Make UltraKeccak work with Shplemini at bb-level\r\n([#8646](https://github.com/AztecProtocol/aztec-packages/issues/8646))\r\n([82b60eb](https://github.com/AztecProtocol/aztec-packages/commit/82b60ebbdb18400363248b80986c993df1b7e4af))\r\n* **metaprogramming:** Add `#[use_callers_scope]`\r\n(https://github.com/noir-lang/noir/pull/6050)\r\n([7ea4709](https://github.com/AztecProtocol/aztec-packages/commit/7ea4709743aaaf2768d35d92cad3fbd4a8404fb0))\r\n* More robust recursion input generator\r\n([#8634](https://github.com/AztecProtocol/aztec-packages/issues/8634))\r\n([020d4fd](https://github.com/AztecProtocol/aztec-packages/commit/020d4fd0cf4137e21f55b1c41e9e381a27191d84))\r\n* Only download non-pruned blocks\r\n([#8578](https://github.com/AztecProtocol/aztec-packages/issues/8578))\r\n([ae26474](https://github.com/AztecProtocol/aztec-packages/commit/ae26474709e28116a38fd2c2773de39dfb6816ad))\r\n* Optimize constraints in sha256\r\n(https://github.com/noir-lang/noir/pull/6145)\r\n([0d9f547](https://github.com/AztecProtocol/aztec-packages/commit/0d9f547d4e470a1e5383c1fff4c0c6125169de19))\r\n* Partial notes log encoding\r\n([#8538](https://github.com/AztecProtocol/aztec-packages/issues/8538))\r\n([5f5ec20](https://github.com/AztecProtocol/aztec-packages/commit/5f5ec2099782a64160c7b06ce2021d28c264e7e9))\r\n* **perf:** Allow array set last uses optimization in return block of\r\nBrillig functions (https://github.com/noir-lang/noir/pull/6119)\r\n([7a87314](https://github.com/AztecProtocol/aztec-packages/commit/7a873147444ef03bc1df88e0fdca3cf6fc124725))\r\n* **perf:** Remove unused loads in mem2reg and last stores per function\r\n(https://github.com/noir-lang/noir/pull/5925)\r\n([3e0067a](https://github.com/AztecProtocol/aztec-packages/commit/3e0067a11935d4f2ead9579458d3c00c2f27f1ef))\r\n* Pretty print Quoted token stream\r\n(https://github.com/noir-lang/noir/pull/6111)\r\n([7a87314](https://github.com/AztecProtocol/aztec-packages/commit/7a873147444ef03bc1df88e0fdca3cf6fc124725))\r\n* Prune if needed\r\n([#8617](https://github.com/AztecProtocol/aztec-packages/issues/8617))\r\n([49b17d0](https://github.com/AztecProtocol/aztec-packages/commit/49b17d0924fc3b11d0b2202cfc01d3dd4c18617a)),\r\ncloses\r\n[#8608](https://github.com/AztecProtocol/aztec-packages/issues/8608)\r\n* Public kernel handles enqueued calls\r\n([#8523](https://github.com/AztecProtocol/aztec-packages/issues/8523))\r\n([6303b4a](https://github.com/AztecProtocol/aztec-packages/commit/6303b4afbc39715e92d5ca7ae5100c60f6398686))\r\n* Reduce max memory in translator by freeing accumulator and eccvm\r\n([#8253](https://github.com/AztecProtocol/aztec-packages/issues/8253))\r\n([7247ddb](https://github.com/AztecProtocol/aztec-packages/commit/7247ddba274e691a7c5220848caf1fa9d6aa911e))\r\n* Remove aztec macros (https://github.com/noir-lang/noir/pull/6087)\r\n([0d9f547](https://github.com/AztecProtocol/aztec-packages/commit/0d9f547d4e470a1e5383c1fff4c0c6125169de19))\r\n* Remove key registry\r\n([#8613](https://github.com/AztecProtocol/aztec-packages/issues/8613))\r\n([a668506](https://github.com/AztecProtocol/aztec-packages/commit/a6685067a0a5d17cbbc4cbfed4e78e364864ff51))\r\n* Remove sha256 opcode\r\n([#4571](https://github.com/AztecProtocol/aztec-packages/issues/4571))\r\n([4b4a0bf](https://github.com/AztecProtocol/aztec-packages/commit/4b4a0bf17050893f913b3db10bc70a584b7aaa5e))\r\n* Remove unnecessary branching in keccak impl\r\n(https://github.com/noir-lang/noir/pull/6133)\r\n([0d9f547](https://github.com/AztecProtocol/aztec-packages/commit/0d9f547d4e470a1e5383c1fff4c0c6125169de19))\r\n* Represent assertions more similarly to function calls\r\n(https://github.com/noir-lang/noir/pull/6103)\r\n([7a87314](https://github.com/AztecProtocol/aztec-packages/commit/7a873147444ef03bc1df88e0fdca3cf6fc124725))\r\n* Show test output when running via LSP\r\n(https://github.com/noir-lang/noir/pull/6049)\r\n([7ea4709](https://github.com/AztecProtocol/aztec-packages/commit/7ea4709743aaaf2768d35d92cad3fbd4a8404fb0))\r\n* Swap endianness in-place in keccak implementation\r\n(https://github.com/noir-lang/noir/pull/6128)\r\n([4522c4f](https://github.com/AztecProtocol/aztec-packages/commit/4522c4f428b288825013d7c38c5a4cbc5b8c8f58))\r\n* Update rollup storage to hold pending/proven tips\r\n([#8583](https://github.com/AztecProtocol/aztec-packages/issues/8583))\r\n([38e3051](https://github.com/AztecProtocol/aztec-packages/commit/38e3051d60f9f8a80e33fab4e0f7f3ec3cde2ee2))\r\n* Use new IVC scheme\r\n([#8480](https://github.com/AztecProtocol/aztec-packages/issues/8480))\r\n([1c7b06d](https://github.com/AztecProtocol/aztec-packages/commit/1c7b06d6621d9873f84147b2b7f1f22bf21bbacb))\r\n* **vc:** Remove viem signers from validator client\r\n([#8517](https://github.com/AztecProtocol/aztec-packages/issues/8517))\r\n([8244fa2](https://github.com/AztecProtocol/aztec-packages/commit/8244fa2d496975bb8bcc032690e0eab1b8c9548f))\r\n* Visibility for traits (https://github.com/noir-lang/noir/pull/6056)\r\n([7ea4709](https://github.com/AztecProtocol/aztec-packages/commit/7ea4709743aaaf2768d35d92cad3fbd4a8404fb0))\r\n\r\n\r\n### Bug Fixes\r\n\r\n* Address a bunch of issues with generics\r\n([#8625](https://github.com/AztecProtocol/aztec-packages/issues/8625))\r\n([94718f1](https://github.com/AztecProtocol/aztec-packages/commit/94718f1fbc26b165107872b2e32ba5412ba3b7fd))\r\n* Allow macros to change types on each iteration of a comptime loop\r\n(https://github.com/noir-lang/noir/pull/6105)\r\n([03b9e71](https://github.com/AztecProtocol/aztec-packages/commit/03b9e71e5ebb3d46827671b2197697b5d294d04e))\r\n* Allow providing default implementations of unconstrained trait methods\r\n(https://github.com/noir-lang/noir/pull/6138)\r\n([0d9f547](https://github.com/AztecProtocol/aztec-packages/commit/0d9f547d4e470a1e5383c1fff4c0c6125169de19))\r\n* Always parse all tokens from quoted token streams\r\n(https://github.com/noir-lang/noir/pull/6064)\r\n([3e0067a](https://github.com/AztecProtocol/aztec-packages/commit/3e0067a11935d4f2ead9579458d3c00c2f27f1ef))\r\n* **avm:** Fix tests under proving\r\n([#8640](https://github.com/AztecProtocol/aztec-packages/issues/8640))\r\n([8bfc769](https://github.com/AztecProtocol/aztec-packages/commit/8bfc769d7cbd6f88bfa7926c051a329ee0fd3468))\r\n* Be more lenient with semicolons on interned expressions\r\n(https://github.com/noir-lang/noir/pull/6062)\r\n([3e0067a](https://github.com/AztecProtocol/aztec-packages/commit/3e0067a11935d4f2ead9579458d3c00c2f27f1ef))\r\n* Boomerang variable in sha256 hash function\r\n([#8581](https://github.com/AztecProtocol/aztec-packages/issues/8581))\r\n([f2a1330](https://github.com/AztecProtocol/aztec-packages/commit/f2a13309f544bbd83b593e6a6207d49d9ef48b74))\r\n* **ci:** Rerun.yml should not trigger if a commit has been pushed\r\n([#8735](https://github.com/AztecProtocol/aztec-packages/issues/8735))\r\n([39fbf92](https://github.com/AztecProtocol/aztec-packages/commit/39fbf92a068be5f746b7cc379910c6af85f5e064))\r\n* Consider constants as used values to keep their rc ops\r\n(https://github.com/noir-lang/noir/pull/6122)\r\n([4522c4f](https://github.com/AztecProtocol/aztec-packages/commit/4522c4f428b288825013d7c38c5a4cbc5b8c8f58))\r\n* Correct stack trace order in comptime assertion failures\r\n(https://github.com/noir-lang/noir/pull/6066)\r\n([3e0067a](https://github.com/AztecProtocol/aztec-packages/commit/3e0067a11935d4f2ead9579458d3c00c2f27f1ef))\r\n* Decode databus return values\r\n(https://github.com/noir-lang/noir/pull/6095)\r\n([7a87314](https://github.com/AztecProtocol/aztec-packages/commit/7a873147444ef03bc1df88e0fdca3cf6fc124725))\r\n* Delete database file from disk on db.delete\r\n([#8693](https://github.com/AztecProtocol/aztec-packages/issues/8693))\r\n([07d43ea](https://github.com/AztecProtocol/aztec-packages/commit/07d43ea77b57aba5d6edba56fe873b7dafd17e50))\r\n* Delete temp lmdb stores + close db connection\r\n([#8778](https://github.com/AztecProtocol/aztec-packages/issues/8778))\r\n([9321cbc](https://github.com/AztecProtocol/aztec-packages/commit/9321cbcf022994e5f8d41798d8c765490ab96824))\r\n* Disambiguate field or int static trait method call\r\n(https://github.com/noir-lang/noir/pull/6112)\r\n([7a87314](https://github.com/AztecProtocol/aztec-packages/commit/7a873147444ef03bc1df88e0fdca3cf6fc124725))\r\n* Do not prune if we are behind the assumed proven block\r\n([#8744](https://github.com/AztecProtocol/aztec-packages/issues/8744))\r\n([e85bee5](https://github.com/AztecProtocol/aztec-packages/commit/e85bee5fb32057c8315593027417853cb4dfdcd5))\r\n* **docs:** Simplify home page\r\n([#8630](https://github.com/AztecProtocol/aztec-packages/issues/8630))\r\n([87e0a17](https://github.com/AztecProtocol/aztec-packages/commit/87e0a17db6c89a3a6e23fca3369c3bc5fe84ad3d))\r\n* Don't crash on untyped global used as array length\r\n(https://github.com/noir-lang/noir/pull/6076)\r\n([3e0067a](https://github.com/AztecProtocol/aztec-packages/commit/3e0067a11935d4f2ead9579458d3c00c2f27f1ef))\r\n* Don't prune while proposing or proving.\r\n([#8739](https://github.com/AztecProtocol/aztec-packages/issues/8739))\r\n([5854879](https://github.com/AztecProtocol/aztec-packages/commit/5854879f46f0f777dd986f1ba6adf6aa24abc683))\r\n* Error on `&mut x` when `x` is not mutable\r\n(https://github.com/noir-lang/noir/pull/6037)\r\n([7ea4709](https://github.com/AztecProtocol/aztec-packages/commit/7ea4709743aaaf2768d35d92cad3fbd4a8404fb0))\r\n* Fix canonicalization bug (https://github.com/noir-lang/noir/pull/6033)\r\n([7ea4709](https://github.com/AztecProtocol/aztec-packages/commit/7ea4709743aaaf2768d35d92cad3fbd4a8404fb0))\r\n* Fix comptime type formatting\r\n(https://github.com/noir-lang/noir/pull/6079)\r\n([3e0067a](https://github.com/AztecProtocol/aztec-packages/commit/3e0067a11935d4f2ead9579458d3c00c2f27f1ef))\r\n* Fixes mapTuple typing\r\n([#8615](https://github.com/AztecProtocol/aztec-packages/issues/8615))\r\n([25d5805](https://github.com/AztecProtocol/aztec-packages/commit/25d5805db1a2ccd0f06f14ab9a11a3fa455e5b69))\r\n* Handle multi-byte utf8 characters in formatter\r\n(https://github.com/noir-lang/noir/pull/6118)\r\n([0d9f547](https://github.com/AztecProtocol/aztec-packages/commit/0d9f547d4e470a1e5383c1fff4c0c6125169de19))\r\n* Handle parenthesized expressions in array length\r\n(https://github.com/noir-lang/noir/pull/6132)\r\n([4522c4f](https://github.com/AztecProtocol/aztec-packages/commit/4522c4f428b288825013d7c38c5a4cbc5b8c8f58))\r\n* Infer globals to be u32 when used in a type\r\n(https://github.com/noir-lang/noir/pull/6083)\r\n([3e0067a](https://github.com/AztecProtocol/aztec-packages/commit/3e0067a11935d4f2ead9579458d3c00c2f27f1ef))\r\n* Initialise databus using return values\r\n(https://github.com/noir-lang/noir/pull/6074)\r\n([b330e87](https://github.com/AztecProtocol/aztec-packages/commit/b330e874dc11235eb9730aca7c936299378c9ce8))\r\n* Let LSP suggest fields and methods in LValue chains\r\n(https://github.com/noir-lang/noir/pull/6051)\r\n([7ea4709](https://github.com/AztecProtocol/aztec-packages/commit/7ea4709743aaaf2768d35d92cad3fbd4a8404fb0))\r\n* Let token pretty printer handle `+=` and similar token sequences\r\n(https://github.com/noir-lang/noir/pull/6135)\r\n([0d9f547](https://github.com/AztecProtocol/aztec-packages/commit/0d9f547d4e470a1e5383c1fff4c0c6125169de19))\r\n* **mem2reg:** Remove possibility of underflow\r\n(https://github.com/noir-lang/noir/pull/6107)\r\n([7a87314](https://github.com/AztecProtocol/aztec-packages/commit/7a873147444ef03bc1df88e0fdca3cf6fc124725))\r\n* New commit_sparse bug and new tests\r\n([#8649](https://github.com/AztecProtocol/aztec-packages/issues/8649))\r\n([5818018](https://github.com/AztecProtocol/aztec-packages/commit/581801863529cd2b437cb51b041ada17a96949e0))\r\n* Parse a statement as an expression\r\n(https://github.com/noir-lang/noir/pull/6040)\r\n([7ea4709](https://github.com/AztecProtocol/aztec-packages/commit/7ea4709743aaaf2768d35d92cad3fbd4a8404fb0))\r\n* Preserve generic kind on trait methods\r\n(https://github.com/noir-lang/noir/pull/6099)\r\n([7fb2a45](https://github.com/AztecProtocol/aztec-packages/commit/7fb2a454531db8cef757b5ec2028d97e823bef5f))\r\n* Prevent check_can_mutate crashing on undefined variable\r\n(https://github.com/noir-lang/noir/pull/6044)\r\n([7ea4709](https://github.com/AztecProtocol/aztec-packages/commit/7ea4709743aaaf2768d35d92cad3fbd4a8404fb0))\r\n* Quick TXE after public executor changes\r\n([#8661](https://github.com/AztecProtocol/aztec-packages/issues/8661))\r\n([48a715b](https://github.com/AztecProtocol/aztec-packages/commit/48a715b6a11a07af7f9adce7a1049cf5e81a933d))\r\n* **revert:** \"chore!: change ec_add to unsafe implementation (but much\r\nbetter perf)\"\r\n([#8722](https://github.com/AztecProtocol/aztec-packages/issues/8722))\r\n([9a1b5b5](https://github.com/AztecProtocol/aztec-packages/commit/9a1b5b5fdd3194f4e7833aacbca4f48aadafbd74))\r\n* **revert:** \"feat: Add epochs to existing orchestrator\"\r\n([#8727](https://github.com/AztecProtocol/aztec-packages/issues/8727))\r\n([ff8e1ed](https://github.com/AztecProtocol/aztec-packages/commit/ff8e1edc5eae5d5a18d36cb960eb3d98afa1cfa6))\r\n* Skip G1 SRS download if numPoints is zero\r\n([#8717](https://github.com/AztecProtocol/aztec-packages/issues/8717))\r\n([753cdf8](https://github.com/AztecProtocol/aztec-packages/commit/753cdf8b047365b6280c0306fdc6f59f824f740b))\r\n* **ssa:** RC correctness issue\r\n(https://github.com/noir-lang/noir/pull/6134)\r\n([0d9f547](https://github.com/AztecProtocol/aztec-packages/commit/0d9f547d4e470a1e5383c1fff4c0c6125169de19))\r\n* Unencryptedlogs witgen\r\n([#8669](https://github.com/AztecProtocol/aztec-packages/issues/8669))\r\n([aee4c2d](https://github.com/AztecProtocol/aztec-packages/commit/aee4c2dde7576fad1c47e407ee0dca43dac2b1b4))\r\n* Unify macro result type with actual type\r\n(https://github.com/noir-lang/noir/pull/6086)\r\n([b330e87](https://github.com/AztecProtocol/aztec-packages/commit/b330e874dc11235eb9730aca7c936299378c9ce8))\r\n* Update databus in flattening\r\n(https://github.com/noir-lang/noir/pull/6063)\r\n([3e0067a](https://github.com/AztecProtocol/aztec-packages/commit/3e0067a11935d4f2ead9579458d3c00c2f27f1ef))\r\n* **world_state:** Fix race conditions in WorldState and IndexedTree\r\n([#8612](https://github.com/AztecProtocol/aztec-packages/issues/8612))\r\n([6797525](https://github.com/AztecProtocol/aztec-packages/commit/679752542edf1667d58e8839aca05d2b9fcc7da6))\r\n\r\n\r\n### Miscellaneous\r\n\r\n* Add more cases for assert_equal conversion\r\n([#8446](https://github.com/AztecProtocol/aztec-packages/issues/8446))\r\n([e3ea298](https://github.com/AztecProtocol/aztec-packages/commit/e3ea298fd1f7326199e6e35b3523aadb2b12a925))\r\n* Archiver cleanup\r\n([#8599](https://github.com/AztecProtocol/aztec-packages/issues/8599))\r\n([184cc88](https://github.com/AztecProtocol/aztec-packages/commit/184cc882b3f1b90d74f149e46100474263a3665d))\r\n* **avm:** Dont compress public bytecode\r\n([#8623](https://github.com/AztecProtocol/aztec-packages/issues/8623))\r\n([353da3f](https://github.com/AztecProtocol/aztec-packages/commit/353da3f65e34783058d3ec7187dbe876f737b044))\r\n* **avm:** Simplify bb-prover and other AVM tests\r\n([#8627](https://github.com/AztecProtocol/aztec-packages/issues/8627))\r\n([0d75363](https://github.com/AztecProtocol/aztec-packages/commit/0d7536395f2406a22a76f15d01114730c84edc18))\r\n* **avm:** Smaller skippable test\r\n([#8664](https://github.com/AztecProtocol/aztec-packages/issues/8664))\r\n([2418977](https://github.com/AztecProtocol/aztec-packages/commit/241897733fe0a5e2ccdf322449debd367f458086))\r\n* **bb readme:** Document how to Honk Noir programs\r\n([#7638](https://github.com/AztecProtocol/aztec-packages/issues/7638))\r\n([cd46ddd](https://github.com/AztecProtocol/aztec-packages/commit/cd46ddd96539f2db466d1116dabdb838d2a807e7))\r\n* Bye bye Zeromorph in Solidity\r\n([#8678](https://github.com/AztecProtocol/aztec-packages/issues/8678))\r\n([74182c4](https://github.com/AztecProtocol/aztec-packages/commit/74182c40e152e988ee8590f39c51d00150ef01ca))\r\n* Change ec_add to unsafe implementation (but much better perf)\r\n([#8374](https://github.com/AztecProtocol/aztec-packages/issues/8374))\r\n([aabd2d8](https://github.com/AztecProtocol/aztec-packages/commit/aabd2d85d4f3f35d67d53421b47214aa8904c505))\r\n* **ci:** Bump noir compile tests\r\n([#8705](https://github.com/AztecProtocol/aztec-packages/issues/8705))\r\n([4121ef3](https://github.com/AztecProtocol/aztec-packages/commit/4121ef32d28ea8bf08b10f1bf1508daeef77e1a9))\r\n* **ci:** Make boxes only run on master\r\n([#8604](https://github.com/AztecProtocol/aztec-packages/issues/8604))\r\n([07e6a7e](https://github.com/AztecProtocol/aztec-packages/commit/07e6a7e36626f51f987fff1962903c86df34eb5b))\r\n* **ci:** More lenient recovery\r\n([#8462](https://github.com/AztecProtocol/aztec-packages/issues/8462))\r\n([5d9a2fe](https://github.com/AztecProtocol/aztec-packages/commit/5d9a2fee16b1229987f66070239196235dc10a83))\r\n* **ci:** Reinstate a bunch of tests in e2e list\r\n([#8737](https://github.com/AztecProtocol/aztec-packages/issues/8737))\r\n([226f311](https://github.com/AztecProtocol/aztec-packages/commit/226f31103b5e92017732bc1477733cd634dc1e9c))\r\n* **ci:** Remove deleted e2e\r\n([#8600](https://github.com/AztecProtocol/aztec-packages/issues/8600))\r\n([03127b2](https://github.com/AztecProtocol/aztec-packages/commit/03127b29c9bcad21ff35c14aecf9b2402faa20a5))\r\n* **ci:** Remove e2e-prover-full from default set\r\n([#8697](https://github.com/AztecProtocol/aztec-packages/issues/8697))\r\n([8dcc3bd](https://github.com/AztecProtocol/aztec-packages/commit/8dcc3bd3a678239b14a01da4d99f7c2e44030875))\r\n* **ci:** Run noir-projects on txe changes\r\n([#8660](https://github.com/AztecProtocol/aztec-packages/issues/8660))\r\n([22f6084](https://github.com/AztecProtocol/aztec-packages/commit/22f6084d6a5ff5693b72d2e08ac758472bb73e29))\r\n* **ci:** Scriptify local earthfile\r\n([#8709](https://github.com/AztecProtocol/aztec-packages/issues/8709))\r\n([aacd238](https://github.com/AztecProtocol/aztec-packages/commit/aacd2389d82ce8dfbd0604ecb095c95a400a1150))\r\n* **ci:** Slightly safer default e2e jobs\r\n([#8729](https://github.com/AztecProtocol/aztec-packages/issues/8729))\r\n([80acfd9](https://github.com/AztecProtocol/aztec-packages/commit/80acfd943ac3cd42b548043824f530018ac07a2d))\r\n* Consolidate aztec node configurations (helm refactor)\r\n([#8731](https://github.com/AztecProtocol/aztec-packages/issues/8731))\r\n([9d248a2](https://github.com/AztecProtocol/aztec-packages/commit/9d248a24091cfbf1c4d09b49227136883e6118f0))\r\n* Create a Gemini prover\r\n([#8622](https://github.com/AztecProtocol/aztec-packages/issues/8622))\r\n([94339fb](https://github.com/AztecProtocol/aztec-packages/commit/94339fbfc7c0c822dc1497c113d48f74a89f1bad))\r\n* Delete .gitattributes in aztec-nr\r\n([#8670](https://github.com/AztecProtocol/aztec-packages/issues/8670))\r\n([bc6d7ee](https://github.com/AztecProtocol/aztec-packages/commit/bc6d7ee9d6bc6f89100e52efd6cb6cc71664d12a))\r\n* Delete duplicated test (https://github.com/noir-lang/noir/pull/6113)\r\n([7a87314](https://github.com/AztecProtocol/aztec-packages/commit/7a873147444ef03bc1df88e0fdca3cf6fc124725))\r\n* Delete eth-log-hander\r\n([#8598](https://github.com/AztecProtocol/aztec-packages/issues/8598))\r\n([4064e90](https://github.com/AztecProtocol/aztec-packages/commit/4064e90c7455d1f06590635678f0588706bce328))\r\n* Delete poseidon2 from `bn254_blackbox_solver`\r\n([#8741](https://github.com/AztecProtocol/aztec-packages/issues/8741))\r\n([02fea6a](https://github.com/AztecProtocol/aztec-packages/commit/02fea6abe8637b9fb8f9535d1709b367d5e1da5c))\r\n* **docs:** Fix migration notes\r\n([#8713](https://github.com/AztecProtocol/aztec-packages/issues/8713))\r\n([d5fd155](https://github.com/AztecProtocol/aztec-packages/commit/d5fd155ed14e2c9f7e889f519e7be791561a0e71))\r\n* **docs:** Protocol-specs typos\r\n([#8706](https://github.com/AztecProtocol/aztec-packages/issues/8706))\r\n([48de163](https://github.com/AztecProtocol/aztec-packages/commit/48de163a55bf792acca51a0df745fee44c7decf1))\r\n* **docs:** Removing old versions\r\n(https://github.com/noir-lang/noir/pull/6075)\r\n([7a87314](https://github.com/AztecProtocol/aztec-packages/commit/7a873147444ef03bc1df88e0fdca3cf6fc124725))\r\n* Document array methods (https://github.com/noir-lang/noir/pull/6034)\r\n([7ea4709](https://github.com/AztecProtocol/aztec-packages/commit/7ea4709743aaaf2768d35d92cad3fbd4a8404fb0))\r\n* Ec addition for non-zero points\r\n(https://github.com/noir-lang/noir/pull/5858)\r\n([7a87314](https://github.com/AztecProtocol/aztec-packages/commit/7a873147444ef03bc1df88e0fdca3cf6fc124725))\r\n* Fix broken formatting on master\r\n(https://github.com/noir-lang/noir/pull/6096)\r\n([7fb2a45](https://github.com/AztecProtocol/aztec-packages/commit/7fb2a454531db8cef757b5ec2028d97e823bef5f))\r\n* Fix docs (https://github.com/noir-lang/noir/pull/6035)\r\n([7ea4709](https://github.com/AztecProtocol/aztec-packages/commit/7ea4709743aaaf2768d35d92cad3fbd4a8404fb0))\r\n* Fixing MacOS build - static_cast from field issue\r\n([#8642](https://github.com/AztecProtocol/aztec-packages/issues/8642))\r\n([14ff3cf](https://github.com/AztecProtocol/aztec-packages/commit/14ff3cfb4291c288113695a3f2245340587fc8e9))\r\n* Gas premiums for AVM side effects, DA gas in AVM\r\n([#8632](https://github.com/AztecProtocol/aztec-packages/issues/8632))\r\n([d5f16cc](https://github.com/AztecProtocol/aztec-packages/commit/d5f16cc41bc077f24947fc92af2767630e928ed8))\r\n* Make structs pub\r\n([#8760](https://github.com/AztecProtocol/aztec-packages/issues/8760))\r\n([7bb2a38](https://github.com/AztecProtocol/aztec-packages/commit/7bb2a382e83bf422f90b3b144ae5c1d4e7adf227))\r\n* Migrate higher-level APIs for barretenberg to bb.js\r\n([#8677](https://github.com/AztecProtocol/aztec-packages/issues/8677))\r\n([0237a20](https://github.com/AztecProtocol/aztec-packages/commit/0237a20c989f2b37a64ee18b41c1da361363a81f))\r\n* Misc cleanup\r\n([#8748](https://github.com/AztecProtocol/aztec-packages/issues/8748))\r\n([e92da1f](https://github.com/AztecProtocol/aztec-packages/commit/e92da1f89974f8a51d491a0facc857fe774bf2fb))\r\n* Protogalaxy recursive verifier matches native verifier\r\n([#8568](https://github.com/AztecProtocol/aztec-packages/issues/8568))\r\n([a4f61b3](https://github.com/AztecProtocol/aztec-packages/commit/a4f61b39c39bf01a1071b52bbf042408f29d5564))\r\n* Re-add blob library to CI\r\n([#8734](https://github.com/AztecProtocol/aztec-packages/issues/8734))\r\n([4615fcc](https://github.com/AztecProtocol/aztec-packages/commit/4615fcc1c8b66d4ea71e0cd9c840656b152d05eb))\r\n* Reduce redundant event fetching\r\n([#8628](https://github.com/AztecProtocol/aztec-packages/issues/8628))\r\n([6903291](https://github.com/AztecProtocol/aztec-packages/commit/690329113876129fcdde52daf9f59f3dcad6949d))\r\n* Reinstate skipped tests\r\n([#8743](https://github.com/AztecProtocol/aztec-packages/issues/8743))\r\n([18e2697](https://github.com/AztecProtocol/aztec-packages/commit/18e2697d8791b4533e042ec04526e32922b608bc))\r\n* Remove bubble_up_constrains\r\n(https://github.com/noir-lang/noir/pull/6127)\r\n([4522c4f](https://github.com/AztecProtocol/aztec-packages/commit/4522c4f428b288825013d7c38c5a4cbc5b8c8f58))\r\n* Remove creation of extra toml file in recursion inputs flow\r\n([#8700](https://github.com/AztecProtocol/aztec-packages/issues/8700))\r\n([014bacc](https://github.com/AztecProtocol/aztec-packages/commit/014bacc0b2f1d56f416a3ab939b8aa5ad90656dd))\r\n* Remove empty file\r\n([#8724](https://github.com/AztecProtocol/aztec-packages/issues/8724))\r\n([d5b91b8](https://github.com/AztecProtocol/aztec-packages/commit/d5b91b8992c4c087991e824c9b3618476f83f13c))\r\n* Remove key rotation from the key store\r\n([#8645](https://github.com/AztecProtocol/aztec-packages/issues/8645))\r\n([d8bcb9f](https://github.com/AztecProtocol/aztec-packages/commit/d8bcb9f16537d5ec9c8f7a7f48efa3e6e767fa28))\r\n* Remove multiple public dbs\r\n([#8585](https://github.com/AztecProtocol/aztec-packages/issues/8585))\r\n([75b7b60](https://github.com/AztecProtocol/aztec-packages/commit/75b7b60456ded2c18f493aaa12306b49cc64ec21))\r\n* Remove PublicContextInputs\r\n([#8770](https://github.com/AztecProtocol/aztec-packages/issues/8770))\r\n([1507762](https://github.com/AztecProtocol/aztec-packages/commit/150776269b557703552826f90915c85adb639137))\r\n* Remove special sync behaviour of `verify_honk_proof`\r\n([#8676](https://github.com/AztecProtocol/aztec-packages/issues/8676))\r\n([a9e412b](https://github.com/AztecProtocol/aztec-packages/commit/a9e412bd49a8f0071906102eef07dd3248303443))\r\n* Remove unnecessary `Prover.toml`s\r\n(https://github.com/noir-lang/noir/pull/6140)\r\n([0d9f547](https://github.com/AztecProtocol/aztec-packages/commit/0d9f547d4e470a1e5383c1fff4c0c6125169de19))\r\n* Remove unused imports\r\n([#8766](https://github.com/AztecProtocol/aztec-packages/issues/8766))\r\n([420dd64](https://github.com/AztecProtocol/aztec-packages/commit/420dd642a4860e08b33b61e6bdd28efdc453ee6f))\r\n* Remove unused TypeVariableKind::Constant\r\n(https://github.com/noir-lang/noir/pull/6053)\r\n([3e0067a](https://github.com/AztecProtocol/aztec-packages/commit/3e0067a11935d4f2ead9579458d3c00c2f27f1ef))\r\n* Removing implicit numeric generics\r\n(https://github.com/noir-lang/noir/pull/5837)\r\n([3e0067a](https://github.com/AztecProtocol/aztec-packages/commit/3e0067a11935d4f2ead9579458d3c00c2f27f1ef))\r\n* Rename CustomAtrribute to CustomAttribute\r\n(https://github.com/noir-lang/noir/pull/6038)\r\n([7ea4709](https://github.com/AztecProtocol/aztec-packages/commit/7ea4709743aaaf2768d35d92cad3fbd4a8404fb0))\r\n* Replace relative paths to noir-protocol-circuits\r\n([00b1e61](https://github.com/AztecProtocol/aztec-packages/commit/00b1e61e4bda15aa456675f09129cd502438f823))\r\n* Replace relative paths to noir-protocol-circuits\r\n([d031f8f](https://github.com/AztecProtocol/aztec-packages/commit/d031f8fec1197b7abda8cfed07ed0797bee891d7))\r\n* Replace relative paths to noir-protocol-circuits\r\n([0f5dd09](https://github.com/AztecProtocol/aztec-packages/commit/0f5dd09b80cb5c6b5e7332520a0451863bc0e28a))\r\n* Replace relative paths to noir-protocol-circuits\r\n([755f484](https://github.com/AztecProtocol/aztec-packages/commit/755f48433df9f940ef472fc923be39576d3a8cfe))\r\n* Replace relative paths to noir-protocol-circuits\r\n([3d4e79a](https://github.com/AztecProtocol/aztec-packages/commit/3d4e79a3cad83b09f55d9ab503ab6b789892a66e))\r\n* Replace relative paths to noir-protocol-circuits\r\n([1bd828f](https://github.com/AztecProtocol/aztec-packages/commit/1bd828f57fea834d8a04e9261c92b2378c5c0fd5))\r\n* Schnorr signature verification in Noir\r\n(https://github.com/noir-lang/noir/pull/5437)\r\n([03b9e71](https://github.com/AztecProtocol/aztec-packages/commit/03b9e71e5ebb3d46827671b2197697b5d294d04e))\r\n* Skip p2p integration\r\n([#8779](https://github.com/AztecProtocol/aztec-packages/issues/8779))\r\n([48de45d](https://github.com/AztecProtocol/aztec-packages/commit/48de45de03b840e8c663f65af2ea866353eabb9b))\r\n* Skip some tests in CI\r\n([#8738](https://github.com/AztecProtocol/aztec-packages/issues/8738))\r\n([251db7b](https://github.com/AztecProtocol/aztec-packages/commit/251db7be2d7541852de314a13a85205b4b3a0418))\r\n* Split `noirc_frontend/src/tests.rs` into submodules\r\n(https://github.com/noir-lang/noir/pull/6139)\r\n([0d9f547](https://github.com/AztecProtocol/aztec-packages/commit/0d9f547d4e470a1e5383c1fff4c0c6125169de19))\r\n* Use config object to make phase manager less noisy\r\n([#8586](https://github.com/AztecProtocol/aztec-packages/issues/8586))\r\n([5a5f2b2](https://github.com/AztecProtocol/aztec-packages/commit/5a5f2b25c00aadd3fa014a81f21b5d01e83e360d))\r\n* Use panic instead of assert\r\n([#8703](https://github.com/AztecProtocol/aztec-packages/issues/8703))\r\n([c96d923](https://github.com/AztecProtocol/aztec-packages/commit/c96d923cd94503fc4c408fde3366c55778e37e82))\r\n* Use random ports in p2p_client tests\r\n([#8624](https://github.com/AztecProtocol/aztec-packages/issues/8624))\r\n([650a241](https://github.com/AztecProtocol/aztec-packages/commit/650a241faee7d2c9be5d0ea071b26b275fb09b39))\r\n</details>\r\n\r\n<details><summary>barretenberg: 0.56.0</summary>\r\n\r\n##\r\n[0.56.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.55.1...barretenberg-v0.56.0)\r\n(2024-09-25)\r\n\r\n\r\n### ⚠ BREAKING CHANGES\r\n\r\n* change ec_add to unsafe implementation (but much better perf)\r\n([#8374](https://github.com/AztecProtocol/aztec-packages/issues/8374))\r\n* **avm:** GETENVVAR + ISSTATICCALL\r\n([#8692](https://github.com/AztecProtocol/aztec-packages/issues/8692))\r\n* remove sha256 opcode\r\n([#4571](https://github.com/AztecProtocol/aztec-packages/issues/4571))\r\n* add support for u1 in the avm, ToRadix's radix arg is a memory addr\r\n([#8570](https://github.com/AztecProtocol/aztec-packages/issues/8570))\r\n* **avm:** remove tag in NOT\r\n([#8606](https://github.com/AztecProtocol/aztec-packages/issues/8606))\r\n\r\n### Features\r\n\r\n* (LSP) suggest $vars inside `quote { ... }`\r\n(https://github.com/noir-lang/noir/pull/6114)\r\n([7a87314](https://github.com/AztecProtocol/aztec-packages/commit/7a873147444ef03bc1df88e0fdca3cf6fc124725))\r\n* Add initial integration of databus\r\n([#8710](https://github.com/AztecProtocol/aztec-packages/issues/8710))\r\n([779e104](https://github.com/AztecProtocol/aztec-packages/commit/779e10499cfe668506ba8a199342cf86fae258a7))\r\n* Add support for u1 in the avm, ToRadix's radix arg is a memory addr\r\n([#8570](https://github.com/AztecProtocol/aztec-packages/issues/8570))\r\n([1785737](https://github.com/AztecProtocol/aztec-packages/commit/178573738731e2e74e4119a035f913da39675d85))\r\n* Aggregate honk and avm recursion constraints together\r\n([#8696](https://github.com/AztecProtocol/aztec-packages/issues/8696))\r\n([3fa9e83](https://github.com/AztecProtocol/aztec-packages/commit/3fa9e83c0fac460f586572fe2866823fe7f740d2))\r\n* **avm:** Avm recursive TS/Noir integration\r\n([#8531](https://github.com/AztecProtocol/aztec-packages/issues/8531))\r\n([dd09f05](https://github.com/AztecProtocol/aztec-packages/commit/dd09f057e97ac1bba7b3fbf29b50737ebe5ca76f)),\r\ncloses\r\n[#7791](https://github.com/AztecProtocol/aztec-packages/issues/7791)\r\n* **avm:** Avm recursive TS/Noir integration\r\n([#8611](https://github.com/AztecProtocol/aztec-packages/issues/8611))\r\n([e417231](https://github.com/AztecProtocol/aztec-packages/commit/e4172318af81ac2ac8535c89d3e5afc72d33ba29))\r\n* **avm:** Bounded mle implementation\r\n([#8668](https://github.com/AztecProtocol/aztec-packages/issues/8668))\r\n([aa85f2a](https://github.com/AztecProtocol/aztec-packages/commit/aa85f2a781223f067291b5702f2e47baced865fd)),\r\ncloses\r\n[#8651](https://github.com/AztecProtocol/aztec-packages/issues/8651)\r\n* **avm:** GETENVVAR + ISSTATICCALL\r\n([#8692](https://github.com/AztecProtocol/aztec-packages/issues/8692))\r\n([02cff0b](https://github.com/AztecProtocol/aztec-packages/commit/02cff0b525d9d6b1c854219f06713a8b94a8e9f5))\r\n* **avm:** Opcode STATICCALL - stubbed\r\n([#8601](https://github.com/AztecProtocol/aztec-packages/issues/8601))\r\n([facff7f](https://github.com/AztecProtocol/aztec-packages/commit/facff7fd0b6ea57e91f7d3e3863435655d8b48ea)),\r\ncloses\r\n[#8596](https://github.com/AztecProtocol/aztec-packages/issues/8596)\r\n* **avm:** Remove tag in NOT\r\n([#8606](https://github.com/AztecProtocol/aztec-packages/issues/8606))\r\n([d5695fc](https://github.com/AztecProtocol/aztec-packages/commit/d5695fcde93cbfda3e45bfa03988a9e72f2dcb59))\r\n* **avm:** Set avm circuit subgroup size\r\n([#8537](https://github.com/AztecProtocol/aztec-packages/issues/8537))\r\n([3b78058](https://github.com/AztecProtocol/aztec-packages/commit/3b78058288edbbe18a2eb8c81de5576c8a9478ab))\r\n* Benchmark compute_row_evaluations and update analysis script\r\n([#8673](https://github.com/AztecProtocol/aztec-packages/issues/8673))\r\n([c738c47](https://github.com/AztecProtocol/aztec-packages/commit/c738c47bd13875ba1649d808e7abd2908fa29e07))\r\n* Constant sized PG proofs and const sized PG rec verifier\r\n([#8605](https://github.com/AztecProtocol/aztec-packages/issues/8605))\r\n([09e2f44](https://github.com/AztecProtocol/aztec-packages/commit/09e2f447b003ed4c77b12069893785851a2c6258))\r\n* LSP autocompletion for `TypePath`\r\n(https://github.com/noir-lang/noir/pull/6117)\r\n([7a87314](https://github.com/AztecProtocol/aztec-packages/commit/7a873147444ef03bc1df88e0fdca3cf6fc124725))\r\n* Make UltraKeccak work with Shplemini at bb-level\r\n([#8646](https://github.com/AztecProtocol/aztec-packages/issues/8646))\r\n([82b60eb](https://github.com/AztecProtocol/aztec-packages/commit/82b60ebbdb18400363248b80986c993df1b7e4af))\r\n* More robust recursion input generator\r\n([#8634](https://github.com/AztecProtocol/aztec-packages/issues/8634))\r\n([020d4fd](https://github.com/AztecProtocol/aztec-packages/commit/020d4fd0cf4137e21f55b1c41e9e381a27191d84))\r\n* **perf:** Allow array set last uses optimization in return block of\r\nBrillig functions (https://github.com/noir-lang/noir/pull/6119)\r\n([7a87314](https://github.com/AztecProtocol/aztec-packages/commit/7a873147444ef03bc1df88e0fdca3cf6fc124725))\r\n* Pretty print Quoted token stream\r\n(https://github.com/noir-lang/noir/pull/6111)\r\n([7a87314](https://github.com/AztecProtocol/aztec-packages/commit/7a873147444ef03bc1df88e0fdca3cf6fc124725))\r\n* Public kernel handles enqueued calls\r\n([#8523](https://github.com/AztecProtocol/aztec-packages/issues/8523))\r\n([6303b4a](https://github.com/AztecProtocol/aztec-packages/commit/6303b4afbc39715e92d5ca7ae5100c60f6398686))\r\n* Reduce max memory in translator by freeing accumulator and eccvm\r\n([#8253](https://github.com/AztecProtocol/aztec-packages/issues/8253))\r\n([7247ddb](https://github.com/AztecProtocol/aztec-packages/commit/7247ddba274e691a7c5220848caf1fa9d6aa911e))\r\n* Remove sha256 opcode\r\n([#4571](https://github.com/AztecProtocol/aztec-packages/issues/4571))\r\n([4b4a0bf](https://github.com/AztecProtocol/aztec-packages/commit/4b4a0bf17050893f913b3db10bc70a584b7aaa5e))\r\n* Represent assertions more similarly to function calls\r\n(https://github.com/noir-lang/noir/pull/6103)\r\n([7a87314](https://github.com/AztecProtocol/aztec-packages/commit/7a873147444ef03bc1df88e0fdca3cf6fc124725))\r\n* Use new IVC scheme\r\n([#8480](https://github.com/AztecProtocol/aztec-packages/issues/8480))\r\n([1c7b06d](https://github.com/AztecProtocol/aztec-packages/commit/1c7b06d6621d9873f84147b2b7f1f22bf21bbacb))\r\n\r\n\r\n### Bug Fixes\r\n\r\n* **avm:** Fix tests under proving\r\n([#8640](https://github.com/AztecProtocol/aztec-packages/issues/8640))\r\n([8bfc769](https://github.com/AztecProtocol/aztec-packages/commit/8bfc769d7cbd6f88bfa7926c051a329ee0fd3468))\r\n* Boomerang variable in sha256 hash function\r\n([#8581](https://github.com/AztecProtocol/aztec-packages/issues/8581))\r\n([f2a1330](https://github.com/AztecProtocol/aztec-packages/commit/f2a13309f544bbd83b593e6a6207d49d9ef48b74))\r\n* Decode databus return values\r\n(https://github.com/noir-lang/noir/pull/6095)\r\n([7a87314](https://github.com/AztecProtocol/aztec-packages/commit/7a873147444ef03bc1df88e0fdca3cf6fc124725))\r\n* Disambiguate field or int static trait method call\r\n(https://github.com/noir-lang/noir/pull/6112)\r\n([7a87314](https://github.com/AztecProtocol/aztec-packages/commit/7a873147444ef03bc1df88e0fdca3cf6fc124725))\r\n* **mem2reg:** Remove possibility of underflow\r\n(https://github.com/noir-lang/noir/pull/6107)\r\n([7a87314](https://github.com/AztecProtocol/aztec-packages/commit/7a873147444ef03bc1df88e0fdca3cf6fc124725))\r\n* New commit_sparse bug and new tests\r\n([#8649](https://github.com/AztecProtocol/aztec-packages/issues/8649))\r\n([5818018](https://github.com/AztecProtocol/aztec-packages/commit/581801863529cd2b437cb51b041ada17a96949e0))\r\n* **revert:** \"chore!: change ec_add to unsafe implementation (but much\r\nbetter perf)\"\r\n([#8722](https://github.com/AztecProtocol/aztec-packages/issues/8722))\r\n([9a1b5b5](https://github.com/AztecProtocol/aztec-packages/commit/9a1b5b5fdd3194f4e7833aacbca4f48aadafbd74))\r\n* Unencryptedlogs witgen\r\n([#8669](https://github.com/AztecProtocol/aztec-packages/issues/8669))\r\n([aee4c2d](https://github.com/AztecProtocol/aztec-packages/commit/aee4c2dde7576fad1c47e407ee0dca43dac2b1b4))\r\n* **world_state:** Fix race conditions in WorldState and IndexedTree\r\n([#8612](https://github.com/AztecProtocol/aztec-packages/issues/8612))\r\n([6797525](https://github.com/AztecProtocol/aztec-packages/commit/679752542edf1667d58e8839aca05d2b9fcc7da6))\r\n\r\n\r\n### Miscellaneous\r\n\r\n* Add more cases for assert_equal conversion\r\n([#8446](https://github.com/AztecProtocol/aztec-packages/issues/8446))\r\n([e3ea298](https://github.com/AztecProtocol/aztec-packages/commit/e3ea298fd1f7326199e6e35b3523aadb2b12a925))\r\n* **avm:** Simplify bb-prover and other AVM tests\r\n([#8627](https://github.com/AztecProtocol/aztec-packages/issues/8627))\r\n([0d75363](https://github.com/AztecProtocol/aztec-packages/commit/0d7536395f2406a22a76f15d01114730c84edc18))\r\n* **avm:** Smaller skippable test\r\n([#8664](https://github.com/AztecProtocol/aztec-packages/issues/8664))\r\n([2418977](https://github.com/AztecProtocol/aztec-packages/commit/241897733fe0a5e2ccdf322449debd367f458086))\r\n* **bb readme:** Document how to Honk Noir programs\r\n([#7638](https://github.com/AztecProtocol/aztec-packages/issues/7638))\r\n([cd46ddd](https://github.com/AztecProtocol/aztec-packages/commit/cd46ddd96539f2db466d1116dabdb838d2a807e7))\r\n* Bye bye Zeromorph in Solidity\r\n([#8678](https://github.com/AztecProtocol/aztec-packages/issues/8678))\r\n([74182c4](https://github.com/AztecProtocol/aztec-packages/commit/74182c40e152e988ee8590f39c51d00150ef01ca))\r\n* Change ec_add to unsafe implementation (but much better perf)\r\n([#8374](https://github.com/AztecProtocol/aztec-packages/issues/8374))\r\n([aabd2d8](https://github.com/AztecProtocol/aztec-packages/commit/aabd2d85d4f3f35d67d53421b47214aa8904c505))\r\n* Create a Gemini prover\r\n([#8622](https://github.com/AztecProtocol/aztec-packages/issues/8622))\r\n([94339fb](https://github.com/AztecProtocol/aztec-packages/commit/94339fbfc7c0c822dc1497c113d48f74a89f1bad))\r\n* Delete duplicated test (https://github.com/noir-lang/noir/pull/6113)\r\n([7a87314](https://github.com/AztecProtocol/aztec-packages/commit/7a873147444ef03bc1df88e0fdca3cf6fc124725))\r\n* **docs:** Removing old versions\r\n(https://github.com/noir-lang/noir/pull/6075)\r\n([7a87314](https://github.com/AztecProtocol/aztec-packages/commit/7a873147444ef03bc1df88e0fdca3cf6fc124725))\r\n* Ec addition for non-zero points\r\n(https://github.com/noir-lang/noir/pull/5858)\r\n([7a87314](https://github.com/AztecProtocol/aztec-packages/commit/7a873147444ef03bc1df88e0fdca3cf6fc124725))\r\n* Fixing MacOS build - static_cast from field issue\r\n([#8642](https://github.com/AztecProtocol/aztec-packages/issues/8642))\r\n([14ff3cf](https://github.com/AztecProtocol/aztec-packages/commit/14ff3cfb4291c288113695a3f2245340587fc8e9))\r\n* Gas premiums for AVM side effects, DA gas in AVM\r\n([#8632](https://github.com/AztecProtocol/aztec-packages/issues/8632))\r\n([d5f16cc](https://github.com/AztecProtocol/aztec-packages/commit/d5f16cc41bc077f24947fc92af2767630e928ed8))\r\n* Migrate higher-level APIs for barretenberg to bb.js\r\n([#8677](https://github.com/AztecProtocol/aztec-packages/issues/8677))\r\n([0237a20](https://github.com/AztecProtocol/aztec-packages/commit/0237a20c989f2b37a64ee18b41c1da361363a81f))\r\n* Protogalaxy recursive verifier matches native verifier\r\n([#8568](https://github.com/AztecProtocol/aztec-packages/issues/8568))\r\n([a4f61b3](https://github.com/AztecProtocol/aztec-packages/commit/a4f61b39c39bf01a1071b52bbf042408f29d5564))\r\n* Reinstate skipped tests\r\n([#8743](https://github.com/AztecProtocol/aztec-packages/issues/8743))\r\n([18e2697](https://github.com/AztecProtocol/aztec-packages/commit/18e2697d8791b4533e042ec04526e32922b608bc))\r\n* Remove creation of extra toml file in recursion inputs flow\r\n([#8700](https://github.com/AztecProtocol/aztec-packages/issues/8700))\r\n([014bacc](https://github.com/AztecProtocol/aztec-packages/commit/014bacc0b2f1d56f416a3ab939b8aa5ad90656dd))\r\n* Skip some tests in CI\r\n([#8738](https://github.com/AztecProtocol/aztec-packages/issues/8738))\r\n([251db7b](https://github.com/AztecProtocol/aztec-packages/commit/251db7be2d7541852de314a13a85205b4b3a0418))\r\n</details>\r\n\r\n---\r\nThis PR was generated with [Release\r\nPlease](https://github.com/googleapis/release-please). See\r\n[documentation](https://github.com/googleapis/release-please#release-please).",
          "timestamp": "2024-09-25T15:19:52Z",
          "tree_id": "cb6d3f0297f051e1d60e3b222ca64acb376b1998",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8f72bc17ab95a93f42255658abe2823b27681aad"
        },
        "date": 1727279052621,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 35919.30272799999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 33121.84034 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5142.553958000008,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4661.995045000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 100198.73401999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 100198734000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14671.383478000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14671384000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8638956193,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8638956193 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 152612408,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 152612408 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 7029780621,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 7029780621 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 128493472,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 128493472 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "105737703+iakovenkos@users.noreply.github.com",
            "name": "iakovenkos",
            "username": "iakovenkos"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "5e4cfa7b0159f66e59365f14c02fe8bbf4a73935",
          "message": "chore: removing hack commitment from eccvm (#8825)\n\n* removed hack commitment from eccvm",
          "timestamp": "2024-09-26T16:35:42Z",
          "tree_id": "158d893ab12cef4060ec5c03f11b8eef79e64393",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5e4cfa7b0159f66e59365f14c02fe8bbf4a73935"
        },
        "date": 1727369650358,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 35445.53959999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 32776.589634 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5067.9524929999925,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4607.685734000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 99689.706864,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 99689706000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14570.950128000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14570950000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8499629290,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8499629290 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 151259793,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 151259793 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6918585715,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6918585715 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 128861311,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 128861311 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "mara@aztecprotocol.com",
            "name": "maramihali",
            "username": "maramihali"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "c8cbc3388c2bbe9a0ba8a95717e1b71c602d58e3",
          "message": "feat: make shplemini proof constant (#8826)\n\nMake Shplemini proofs constant using the same approach as in other\r\nplaces, add relevant github issues for handling the dummy rounds\r\nproperly, make the shplemini recursion test do full verification and\r\nensure recursive shplemini verifiers actually stay constant.",
          "timestamp": "2024-09-26T16:57:42Z",
          "tree_id": "a3df21904c8e5c17ed0b60a2f55eeea9bb0987c6",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c8cbc3388c2bbe9a0ba8a95717e1b71c602d58e3"
        },
        "date": 1727371323146,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 35536.94134400001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 33244.83370999999 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5060.799519,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4656.218495 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 100064.39638500001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 100064396000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14638.624699000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14638625000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8529050715,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8529050715 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 152994515,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 152994515 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6939897215,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6939897215 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126063488,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126063488 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "adam.domurad@gmail.com",
            "name": "ludamad",
            "username": "ludamad"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "68ba5d443a79c06d972019abe39faaf851bb3247",
          "message": "chore(bb.js): strip wasm-threads again (#8833)\n\nper community request, closes #941",
          "timestamp": "2024-09-26T14:59:29-04:00",
          "tree_id": "52510dbcb108b5e0cb59e2207755051fdb8c9f06",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/68ba5d443a79c06d972019abe39faaf851bb3247"
        },
        "date": 1727378930010,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 35545.45031699999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 32994.146046 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5067.817661999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4642.186872000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 99927.02935000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 99927030000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14595.011742,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14595012000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8534346218,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8534346218 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 154415404,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 154415404 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6933373917,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6933373917 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 125647041,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 125647041 ns\nthreads: 1"
          }
        ]
      }
    ]
  }
}