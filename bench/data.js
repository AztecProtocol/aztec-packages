window.BENCHMARK_DATA = {
  "lastUpdate": 1747927754014,
  "repoUrl": "https://github.com/AztecProtocol/aztec-packages",
  "entries": {
    "Aztec Benchmarks": [
      {
        "commit": {
          "author": {
            "name": "Charlie",
            "username": "charlielye",
            "email": "5764343+charlielye@users.noreply.github.com"
          },
          "committer": {
            "name": "GitHub",
            "username": "web-flow",
            "email": "noreply@github.com"
          },
          "id": "44304b63743c5898e1f7dcf3495d8c3ed0df9d3c",
          "message": "chore: Protocol breaking changes must now go to next branch. (#14423)\n\n* Set new TARGET_BRANCH env var.\n* Add @LHerskind scream and shout test to `test_cmds` if target branch\nis master.\n* We trigger the release please workflow on a merge to the `next` branch\nas well as `master`.\n* We update the release please config to tell it what to do on `next`.\n* `master` will no longer be pre-release\n* `next` will be pre-release\n* benchmarks can be found in `bench/master` and `bench/next`.",
          "timestamp": "2025-05-22T14:01:22Z",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/44304b63743c5898e1f7dcf3495d8c3ed0df9d3c"
        },
        "date": 1747923994023,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "barretenberg/cpp/bb-micro-bench/wasm/ultra_honk",
            "value": 8307.638104,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/bb-micro-bench/wasm/client_ivc",
            "value": 59236.66695300001,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/bb-micro-bench/native/ultra_honk",
            "value": 3455.143899999939,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/bb-micro-bench/native/client_ivc",
            "value": 22629.304860000047,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/bb-micro-bench/native/client_ivc_17_in_20",
            "value": 18206.25261699979,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+sponsored_fpc/wasm/seconds",
            "value": 44297,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+sponsored_fpc/wasm/memory",
            "value": 1053,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+sponsored_fpc/native/seconds",
            "value": 16621,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+sponsored_fpc/native/memory",
            "value": 1026,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/schnorr+deploy_tokenContract_no_registration+sponsored_fpc/wasm/seconds",
            "value": 40866,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/schnorr+deploy_tokenContract_no_registration+sponsored_fpc/wasm/memory",
            "value": 1009,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/schnorr+deploy_tokenContract_no_registration+sponsored_fpc/native/seconds",
            "value": 15518,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/schnorr+deploy_tokenContract_no_registration+sponsored_fpc/native/memory",
            "value": 1028,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+sponsored_fpc/wasm/seconds",
            "value": 38934,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+sponsored_fpc/wasm/memory",
            "value": 1066,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+sponsored_fpc/native/seconds",
            "value": 14439,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+sponsored_fpc/native/memory",
            "value": 979,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+token_bridge_claim_private+sponsored_fpc/wasm/seconds",
            "value": 45666,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+token_bridge_claim_private+sponsored_fpc/wasm/memory",
            "value": 1025,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+token_bridge_claim_private+sponsored_fpc/native/seconds",
            "value": 16895,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+token_bridge_claim_private+sponsored_fpc/native/memory",
            "value": 1085,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+private_fpc/wasm/seconds",
            "value": 68882,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+private_fpc/wasm/memory",
            "value": 1298,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+private_fpc/native/seconds",
            "value": 25625,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+private_fpc/native/memory",
            "value": 1235,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc/wasm/seconds",
            "value": 91256,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc/wasm/memory",
            "value": 1747,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc/native/seconds",
            "value": 31820,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc/native/memory",
            "value": 1269,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc/wasm/seconds",
            "value": 71118,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc/wasm/memory",
            "value": 2765,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc/native/seconds",
            "value": 24554,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc/native/memory",
            "value": 2027,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+private_fpc/wasm/seconds",
            "value": 59883,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+private_fpc/wasm/memory",
            "value": 1072,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+private_fpc/native/seconds",
            "value": 22275,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+private_fpc/native/memory",
            "value": 1145,
            "unit": "MB"
          },
          {
            "name": "barretenberg/acir_tests/ultra_honk_rec_wasm_memory",
            "value": 2.19,
            "unit": "MiB"
          },
          {
            "name": "yarn-project/end-to-end/Sequencer/aztec.sequencer.block.build_duration",
            "value": 6899,
            "unit": "ms"
          },
          {
            "name": "yarn-project/end-to-end/Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.19750663671676028,
            "unit": "us/mana"
          },
          {
            "name": "yarn-project/end-to-end/Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 99747,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/constructor/0/totalInstructionsExecuted",
            "value": 17011,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/constructor/0/totalDurationMs",
            "value": 204.4183619999999,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/constructor/0/manaUsed",
            "value": 381879,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/constructor/0/txHashMs",
            "value": 24.531638000000385,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/constructor/0/nonRevertiblePrivateInsertionsUs",
            "value": 4794.2579999999,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/constructor/0/revertiblePrivateInsertionsUs",
            "value": 2132.5980000001437,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/mint_to_public/1/totalInstructionsExecuted",
            "value": 1461,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/mint_to_public/1/totalDurationMs",
            "value": 71.321504,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/mint_to_public/1/manaUsed",
            "value": 42698,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/mint_to_public/1/txHashMs",
            "value": 22.140480000000025,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/mint_to_public/1/nonRevertiblePrivateInsertionsUs",
            "value": 3764.8800000001756,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/mint_to_public/1/revertiblePrivateInsertionsUs",
            "value": 906.1369999999442,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/2/totalInstructionsExecuted",
            "value": 612,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/2/totalDurationMs",
            "value": 48.09405400000014,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/2/manaUsed",
            "value": 12384,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/2/txHashMs",
            "value": 21.38263300000017,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/2/nonRevertiblePrivateInsertionsUs",
            "value": 2350.6850000003396,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/2/revertiblePrivateInsertionsUs",
            "value": 908.6280000001352,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/transfer_in_public/3/totalInstructionsExecuted",
            "value": 1907,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/transfer_in_public/3/totalDurationMs",
            "value": 58.33407699999998,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/transfer_in_public/3/manaUsed",
            "value": 48632,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/transfer_in_public/3/txHashMs",
            "value": 21.193898999999874,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/transfer_in_public/3/nonRevertiblePrivateInsertionsUs",
            "value": 2146.5699999998833,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/transfer_in_public/3/revertiblePrivateInsertionsUs",
            "value": 1837.7669999999853,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/4/totalInstructionsExecuted",
            "value": 612,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/4/totalDurationMs",
            "value": 48.46933199999967,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/4/manaUsed",
            "value": 12384,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/4/txHashMs",
            "value": 21.251314000000093,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/4/nonRevertiblePrivateInsertionsUs",
            "value": 2269.759000000249,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/4/revertiblePrivateInsertionsUs",
            "value": 935.3900000000976,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/5/totalInstructionsExecuted",
            "value": 612,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/5/totalDurationMs",
            "value": 52.757460999999694,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/5/manaUsed",
            "value": 12384,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/5/txHashMs",
            "value": 21.16116600000032,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/5/nonRevertiblePrivateInsertionsUs",
            "value": 2214.574999999968,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/5/revertiblePrivateInsertionsUs",
            "value": 756.7070000000058,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/6/totalInstructionsExecuted",
            "value": 612,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/6/totalDurationMs",
            "value": 46.525326999999834,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/6/manaUsed",
            "value": 12384,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/6/txHashMs",
            "value": 21.109573000000182,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/6/nonRevertiblePrivateInsertionsUs",
            "value": 2111.4470000002257,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/6/revertiblePrivateInsertionsUs",
            "value": 859.1240000000653,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/burn_public/7/totalInstructionsExecuted",
            "value": 1133,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/burn_public/7/totalDurationMs",
            "value": 54.24325200000021,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/burn_public/7/manaUsed",
            "value": 35852,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/burn_public/7/txHashMs",
            "value": 21.31557900000007,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/burn_public/7/nonRevertiblePrivateInsertionsUs",
            "value": 2511.117000000013,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/burn_public/7/revertiblePrivateInsertionsUs",
            "value": 808.5299999997915,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/8/totalInstructionsExecuted",
            "value": 612,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/8/totalDurationMs",
            "value": 47.23781999999983,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/8/manaUsed",
            "value": 12384,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/8/txHashMs",
            "value": 21.477139999999963,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/8/nonRevertiblePrivateInsertionsUs",
            "value": 2268.669999999929,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/8/revertiblePrivateInsertionsUs",
            "value": 825.101999999788,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/0/totalInstructionsExecuted",
            "value": 17011,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/0/totalDurationMs",
            "value": 163.04333899999983,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/0/manaUsed",
            "value": 381879,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/0/txHashMs",
            "value": 21.330719000000045,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/0/nonRevertiblePrivateInsertionsUs",
            "value": 2501.676999999745,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/0/revertiblePrivateInsertionsUs",
            "value": 924.148999999943,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/1/totalInstructionsExecuted",
            "value": 17011,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/1/totalDurationMs",
            "value": 143.6752150000002,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/1/manaUsed",
            "value": 381879,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/1/txHashMs",
            "value": 21.144576000000143,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/1/nonRevertiblePrivateInsertionsUs",
            "value": 2440.111999999772,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/1/revertiblePrivateInsertionsUs",
            "value": 925.4889999997431,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/2/totalInstructionsExecuted",
            "value": 17011,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/2/totalDurationMs",
            "value": 144.5251290000001,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/2/manaUsed",
            "value": 381879,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/2/txHashMs",
            "value": 21.302976999999828,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/2/nonRevertiblePrivateInsertionsUs",
            "value": 2190.3030000003127,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/2/revertiblePrivateInsertionsUs",
            "value": 779.1179999999258,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/constructor/3/totalInstructionsExecuted",
            "value": 1735,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/constructor/3/totalDurationMs",
            "value": 85.45664799999986,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/constructor/3/manaUsed",
            "value": 72855,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/constructor/3/txHashMs",
            "value": 21.06229899999971,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/constructor/3/nonRevertiblePrivateInsertionsUs",
            "value": 2131.9189999999253,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/constructor/3/revertiblePrivateInsertionsUs",
            "value": 778.1669999999394,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/set_minter/4/totalInstructionsExecuted",
            "value": 635,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/set_minter/4/totalDurationMs",
            "value": 49.482648000000154,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/set_minter/4/manaUsed",
            "value": 19579,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/set_minter/4/txHashMs",
            "value": 21.17673799999966,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/set_minter/4/nonRevertiblePrivateInsertionsUs",
            "value": 2339.7540000000845,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/set_minter/4/revertiblePrivateInsertionsUs",
            "value": 916.2089999999807,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/add_liquidity/5/totalInstructionsExecuted",
            "value": 9272,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/add_liquidity/5/totalDurationMs",
            "value": 159.51370600000018,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/add_liquidity/5/manaUsed",
            "value": 252462,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/add_liquidity/5/txHashMs",
            "value": 21.205269999999928,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/add_liquidity/5/nonRevertiblePrivateInsertionsUs",
            "value": 2899.844999999914,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/add_liquidity/5/revertiblePrivateInsertionsUs",
            "value": 717.5240000001395,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/swap_exact_tokens_for_tokens/6/totalInstructionsExecuted",
            "value": 5752,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/swap_exact_tokens_for_tokens/6/totalDurationMs",
            "value": 106.63724600000023,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/swap_exact_tokens_for_tokens/6/manaUsed",
            "value": 141831,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/swap_exact_tokens_for_tokens/6/txHashMs",
            "value": 21.151745999999548,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/swap_exact_tokens_for_tokens/6/nonRevertiblePrivateInsertionsUs",
            "value": 2212.5050000004194,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/swap_exact_tokens_for_tokens/6/revertiblePrivateInsertionsUs",
            "value": 691.4120000001276,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/remove_liquidity/7/totalInstructionsExecuted",
            "value": 10059,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/remove_liquidity/7/totalDurationMs",
            "value": 152.70050899999933,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/remove_liquidity/7/manaUsed",
            "value": 264452,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/remove_liquidity/7/txHashMs",
            "value": 21.29657600000064,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/remove_liquidity/7/nonRevertiblePrivateInsertionsUs",
            "value": 2354.494999999588,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/remove_liquidity/7/revertiblePrivateInsertionsUs",
            "value": 656.1090000004697,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmTest contract tests/AvmTest/bulk_testing/0/totalInstructionsExecuted",
            "value": 27133,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmTest contract tests/AvmTest/bulk_testing/0/totalDurationMs",
            "value": 251.34372900000017,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmTest contract tests/AvmTest/bulk_testing/0/manaUsed",
            "value": 557410,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmTest contract tests/AvmTest/bulk_testing/0/txHashMs",
            "value": 21.22602200000074,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmTest contract tests/AvmTest/bulk_testing/0/nonRevertiblePrivateInsertionsUs",
            "value": 2205.1339999998163,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmTest contract tests/AvmTest/bulk_testing/0/revertiblePrivateInsertionsUs",
            "value": 706.3630000002377,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_10/0/totalInstructionsExecuted",
            "value": 5195,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_10/0/totalDurationMs",
            "value": 103.64153299999998,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_10/0/manaUsed",
            "value": 90720,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_10/0/txHashMs",
            "value": 21.25172300000031,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_10/0/nonRevertiblePrivateInsertionsUs",
            "value": 2108.146999999917,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_10/0/revertiblePrivateInsertionsUs",
            "value": 623.0459999997038,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_20/1/totalInstructionsExecuted",
            "value": 6318,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_20/1/totalDurationMs",
            "value": 59.27915800000028,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_20/1/manaUsed",
            "value": 111162,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_20/1/txHashMs",
            "value": 21.204640000000836,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_20/1/nonRevertiblePrivateInsertionsUs",
            "value": 2065.864000000147,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_20/1/revertiblePrivateInsertionsUs",
            "value": 607.6849999999467,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_30/2/totalInstructionsExecuted",
            "value": 7669,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_30/2/totalDurationMs",
            "value": 62.95926099999997,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_30/2/manaUsed",
            "value": 135084,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_30/2/txHashMs",
            "value": 21.217461000000185,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_30/2/nonRevertiblePrivateInsertionsUs",
            "value": 2172.3220000003494,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_30/2/revertiblePrivateInsertionsUs",
            "value": 650.5880000004254,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_40/3/totalInstructionsExecuted",
            "value": 8874,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_40/3/totalDurationMs",
            "value": 66.0421809999998,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_40/3/manaUsed",
            "value": 156435,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_40/3/txHashMs",
            "value": 21.086911000000327,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_40/3/nonRevertiblePrivateInsertionsUs",
            "value": 2123.537999999826,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_40/3/revertiblePrivateInsertionsUs",
            "value": 657.4289999998655,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_50/4/totalInstructionsExecuted",
            "value": 10226,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_50/4/totalDurationMs",
            "value": 66.90518499999962,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_50/4/manaUsed",
            "value": 180366,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_50/4/txHashMs",
            "value": 21.163047000000006,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_50/4/nonRevertiblePrivateInsertionsUs",
            "value": 2085.7850000002145,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_50/4/revertiblePrivateInsertionsUs",
            "value": 638.7979999999516,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_60/5/totalInstructionsExecuted",
            "value": 11744,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_60/5/totalDurationMs",
            "value": 74.39756399999987,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_60/5/manaUsed",
            "value": 206913,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_60/5/txHashMs",
            "value": 21.303267000000233,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_60/5/nonRevertiblePrivateInsertionsUs",
            "value": 3095.1610000001892,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_60/5/revertiblePrivateInsertionsUs",
            "value": 874.6660000006159,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_70/6/totalInstructionsExecuted",
            "value": 13560,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_70/6/totalDurationMs",
            "value": 75.00714900000003,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_70/6/manaUsed",
            "value": 239988,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_70/6/txHashMs",
            "value": 21.126774000000296,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_70/6/nonRevertiblePrivateInsertionsUs",
            "value": 2370.636999999988,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_70/6/revertiblePrivateInsertionsUs",
            "value": 669.5799999997689,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_80/7/totalInstructionsExecuted",
            "value": 14790,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_80/7/totalDurationMs",
            "value": 80.45025499999974,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_80/7/manaUsed",
            "value": 261915,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_80/7/txHashMs",
            "value": 21.192908999999418,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_80/7/nonRevertiblePrivateInsertionsUs",
            "value": 2527.919000000111,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_80/7/revertiblePrivateInsertionsUs",
            "value": 692.56200000018,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_90/8/totalInstructionsExecuted",
            "value": 16173,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_90/8/totalDurationMs",
            "value": 82.2731900000008,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_90/8/manaUsed",
            "value": 286554,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_90/8/txHashMs",
            "value": 21.413024999999834,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_90/8/nonRevertiblePrivateInsertionsUs",
            "value": 2193.5139999995954,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_90/8/revertiblePrivateInsertionsUs",
            "value": 636.0369999993054,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_100/9/totalInstructionsExecuted",
            "value": 17403,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_100/9/totalDurationMs",
            "value": 83.70380699999987,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_100/9/manaUsed",
            "value": 308481,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_100/9/txHashMs",
            "value": 21.49753200000032,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_100/9/nonRevertiblePrivateInsertionsUs",
            "value": 2168.7709999996514,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_100/9/revertiblePrivateInsertionsUs",
            "value": 714.8230000002513,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_255/10/totalInstructionsExecuted",
            "value": 39046,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_255/10/totalDurationMs",
            "value": 135.54060000000027,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_255/10/manaUsed",
            "value": 693108,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_255/10/txHashMs",
            "value": 21.55299600000035,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_255/10/nonRevertiblePrivateInsertionsUs",
            "value": 2267.6790000004985,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_255/10/revertiblePrivateInsertionsUs",
            "value": 691.4010000000417,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_256/11/totalInstructionsExecuted",
            "value": 39204,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_256/11/totalDurationMs",
            "value": 135.88607599999978,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_256/11/manaUsed",
            "value": 696708,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_256/11/txHashMs",
            "value": 21.142425000000003,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_256/11/nonRevertiblePrivateInsertionsUs",
            "value": 2104.906000000483,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_256/11/revertiblePrivateInsertionsUs",
            "value": 650.4290000002584,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_511/12/totalInstructionsExecuted",
            "value": 74641,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_511/12/totalDurationMs",
            "value": 218.49457099999927,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_511/12/manaUsed",
            "value": 1326093,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_511/12/txHashMs",
            "value": 21.233172000000195,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_511/12/nonRevertiblePrivateInsertionsUs",
            "value": 2570.1219999991736,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_511/12/revertiblePrivateInsertionsUs",
            "value": 758.2559999991645,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_512/13/totalInstructionsExecuted",
            "value": 74700,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_512/13/totalDurationMs",
            "value": 215.9645729999993,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_512/13/manaUsed",
            "value": 1328580,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_512/13/txHashMs",
            "value": 21.12240500000007,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_512/13/nonRevertiblePrivateInsertionsUs",
            "value": 2144.990000000689,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_512/13/revertiblePrivateInsertionsUs",
            "value": 655.8690000001661,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_2048/14/totalInstructionsExecuted",
            "value": 287680,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_2048/14/totalDurationMs",
            "value": 713.4993949999989,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_2048/14/manaUsed",
            "value": 5120364,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_2048/14/txHashMs",
            "value": 21.072690000000875,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_2048/14/nonRevertiblePrivateInsertionsUs",
            "value": 2062.9040000003442,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_2048/14/revertiblePrivateInsertionsUs",
            "value": 611.0960000005434,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_hash/15/totalInstructionsExecuted",
            "value": 9533,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_hash/15/totalDurationMs",
            "value": 65.60346799999934,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_hash/15/manaUsed",
            "value": 175263,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_hash/15/txHashMs",
            "value": 21.18536900000072,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_hash/15/nonRevertiblePrivateInsertionsUs",
            "value": 2075.795000000653,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_hash/15/revertiblePrivateInsertionsUs",
            "value": 730.3750000010041,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_f1600/16/totalInstructionsExecuted",
            "value": 3054,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_f1600/16/totalDurationMs",
            "value": 49.446154000001115,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_f1600/16/manaUsed",
            "value": 53874,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_f1600/16/txHashMs",
            "value": 21.49612100000013,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_f1600/16/nonRevertiblePrivateInsertionsUs",
            "value": 2217.8950000015902,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_f1600/16/revertiblePrivateInsertionsUs",
            "value": 699.4720000002417,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/poseidon2_hash/17/totalInstructionsExecuted",
            "value": 2092,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/poseidon2_hash/17/totalDurationMs",
            "value": 49.823881999998775,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/poseidon2_hash/17/manaUsed",
            "value": 35940,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/poseidon2_hash/17/txHashMs",
            "value": 21.09359200000108,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/poseidon2_hash/17/nonRevertiblePrivateInsertionsUs",
            "value": 2298.171000000366,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/poseidon2_hash/17/revertiblePrivateInsertionsUs",
            "value": 646.6579999996611,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash/18/totalInstructionsExecuted",
            "value": 22785,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash/18/totalDurationMs",
            "value": 363.97451100000035,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash/18/manaUsed",
            "value": 600786,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash/18/txHashMs",
            "value": 21.149355999999898,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash/18/nonRevertiblePrivateInsertionsUs",
            "value": 2037.822000000233,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash/18/revertiblePrivateInsertionsUs",
            "value": 610.5960000004416,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash_with_index/19/totalInstructionsExecuted",
            "value": 22767,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash_with_index/19/totalDurationMs",
            "value": 323.96479999999974,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash_with_index/19/manaUsed",
            "value": 599316,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash_with_index/19/txHashMs",
            "value": 21.014836000000287,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash_with_index/19/nonRevertiblePrivateInsertionsUs",
            "value": 2021.9010000000708,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash_with_index/19/revertiblePrivateInsertionsUs",
            "value": 625.4969999990863,
            "unit": "us"
          },
          {
            "name": "l1-contracts/forward (100_validators)",
            "value": 639988,
            "unit": "gas"
          },
          {
            "name": "l1-contracts/forward (100_validators) per l2 tx",
            "value": 1777.74,
            "unit": "gas"
          },
          {
            "name": "l1-contracts/forward (no_validators)",
            "value": 311841,
            "unit": "gas"
          },
          {
            "name": "l1-contracts/forward (no_validators) per l2 tx",
            "value": 866.23,
            "unit": "gas"
          },
          {
            "name": "l1-contracts/forward (overhead)",
            "value": 328147,
            "unit": "gas"
          },
          {
            "name": "l1-contracts/forward (overhead) per l2 tx",
            "value": 911.52,
            "unit": "gas"
          },
          {
            "name": "l1-contracts/setupEpoch (100_validators)",
            "value": 1581908,
            "unit": "gas"
          },
          {
            "name": "l1-contracts/setupEpoch (100_validators) per l2 tx",
            "value": 137.32,
            "unit": "gas"
          },
          {
            "name": "l1-contracts/setupEpoch (no_validators)",
            "value": 70804,
            "unit": "gas"
          },
          {
            "name": "l1-contracts/setupEpoch (no_validators) per l2 tx",
            "value": 6.15,
            "unit": "gas"
          },
          {
            "name": "l1-contracts/setupEpoch (overhead)",
            "value": 1511104,
            "unit": "gas"
          },
          {
            "name": "l1-contracts/setupEpoch (overhead) per l2 tx",
            "value": 131.17,
            "unit": "gas"
          },
          {
            "name": "l1-contracts/submitEpochRootProof (100_validators)",
            "value": 904626,
            "unit": "gas"
          },
          {
            "name": "l1-contracts/submitEpochRootProof (100_validators) per l2 tx",
            "value": 78.53,
            "unit": "gas"
          },
          {
            "name": "l1-contracts/submitEpochRootProof (no_validators)",
            "value": 921726,
            "unit": "gas"
          },
          {
            "name": "l1-contracts/submitEpochRootProof (no_validators) per l2 tx",
            "value": 80.01,
            "unit": "gas"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_64_64_4_opcodes",
            "value": 40310,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_64_64_4_gates",
            "value": 211923,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_tail_to_public_opcodes",
            "value": 16628,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_tail_to_public_gates",
            "value": 49235,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_4_64_32_opcodes",
            "value": 37021,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_4_64_32_gates",
            "value": 156801,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_4_4_4_4_4_4_4_4_4_opcodes",
            "value": 27176,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_4_4_4_4_4_4_4_4_4_gates",
            "value": 101131,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_base_public_opcodes",
            "value": 209838,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_base_public_gates",
            "value": 1363518,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_64_64_4_opcodes",
            "value": 37207,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_64_64_4_gates",
            "value": 170090,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_64_4_4_opcodes",
            "value": 32050,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_64_4_4_gates",
            "value": 119796,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_64_4_32_opcodes",
            "value": 41042,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_64_4_32_gates",
            "value": 210432,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_64_4_4_opcodes",
            "value": 38513,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_64_4_4_gates",
            "value": 205612,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_4_64_32_opcodes",
            "value": 40381,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_4_64_32_gates",
            "value": 200784,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_4_4_4_opcodes",
            "value": 32695,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_4_4_4_gates",
            "value": 145670,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_block_merge_opcodes",
            "value": 8684,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_block_merge_gates",
            "value": 1543358,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_4_4_32_opcodes",
            "value": 35224,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_4_4_32_gates",
            "value": 150491,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_root_opcodes",
            "value": 8670,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_root_gates",
            "value": 26799515,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_4_64_4_opcodes",
            "value": 34492,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_4_64_4_gates",
            "value": 151981,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_block_root_empty_opcodes",
            "value": 6404,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_block_root_empty_gates",
            "value": 708327,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_4_64_4_opcodes",
            "value": 34749,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_4_64_4_gates",
            "value": 154131,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_block_root_single_tx_opcodes",
            "value": 876816,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_block_root_single_tx_gates",
            "value": 3893725,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_32_32_32_32_32_32_32_32_opcodes",
            "value": 52340,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_32_32_32_32_32_32_32_32_gates",
            "value": 348149,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_4_4_4_opcodes",
            "value": 36055,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_4_4_4_gates",
            "value": 189653,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_4_64_32_opcodes",
            "value": 37278,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_4_64_32_gates",
            "value": 158951,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_0_0_64_0_0_0_0_0_0_opcodes",
            "value": 12563,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_0_0_64_0_0_0_0_0_0_gates",
            "value": 42086,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_64_0_0_0_0_0_0_0_0_opcodes",
            "value": 12563,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_64_0_0_0_0_0_0_0_0_gates",
            "value": 42086,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_init_opcodes",
            "value": 14838,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_init_gates",
            "value": 41309,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_4_4_4_opcodes",
            "value": 32952,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_4_4_4_gates",
            "value": 147820,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_16_16_16_16_16_16_16_16_16_opcodes",
            "value": 37971,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_16_16_16_16_16_16_16_16_16_gates",
            "value": 207005,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_4_4_32_opcodes",
            "value": 32121,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_4_4_32_gates",
            "value": 108658,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_4_4_4_opcodes",
            "value": 29592,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_4_4_4_gates",
            "value": 103837,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_64_64_4_opcodes",
            "value": 33847,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_64_64_4_gates",
            "value": 126107,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/parity_base_opcodes",
            "value": 3509,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/parity_base_gates",
            "value": 30646,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_base_private_opcodes",
            "value": 271548,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_base_private_gates",
            "value": 1895604,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_0_0_0_0_0_64_0_0_0_opcodes",
            "value": 20822,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_0_0_0_0_0_64_0_0_0_gates",
            "value": 56710,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_4_64_32_opcodes",
            "value": 33918,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_4_64_32_gates",
            "value": 114968,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_64_4_32_opcodes",
            "value": 34579,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_64_4_32_gates",
            "value": 124616,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_4_64_4_opcodes",
            "value": 37852,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_4_64_4_gates",
            "value": 195964,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_4_4_32_opcodes",
            "value": 38584,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_4_4_32_gates",
            "value": 194474,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_0_64_0_0_0_0_0_0_0_opcodes",
            "value": 27091,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_0_64_0_0_0_0_0_0_0_gates",
            "value": 263396,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_64_64_32_opcodes",
            "value": 36376,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_64_64_32_gates",
            "value": 130927,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_opcodes",
            "value": 78051,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_gates",
            "value": 625446,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_block_root_opcodes",
            "value": 878261,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_block_root_gates",
            "value": 4690089,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_64_4_4_opcodes",
            "value": 35410,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_64_4_4_gates",
            "value": 163779,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_64_64_4_opcodes",
            "value": 36950,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_64_64_4_gates",
            "value": 167940,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_64_64_32_opcodes",
            "value": 39736,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_64_64_32_gates",
            "value": 174910,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_64_4_32_opcodes",
            "value": 37682,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_64_4_32_gates",
            "value": 166449,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_4_64_4_opcodes",
            "value": 31389,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_4_64_4_gates",
            "value": 110148,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_4_4_32_opcodes",
            "value": 35481,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_4_4_32_gates",
            "value": 152641,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_tail_opcodes",
            "value": 5105,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_tail_gates",
            "value": 33621,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_0_0_0_64_0_0_0_0_0_opcodes",
            "value": 28437,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_0_0_0_64_0_0_0_0_0_gates",
            "value": 274966,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_merge_opcodes",
            "value": 1727,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_merge_gates",
            "value": 1463558,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_64_4_32_opcodes",
            "value": 37939,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_64_4_32_gates",
            "value": 168599,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_0_0_0_0_64_0_0_0_0_opcodes",
            "value": 13896,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_0_0_0_0_64_0_0_0_0_gates",
            "value": 101560,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/parity_root_opcodes",
            "value": 4158,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/parity_root_gates",
            "value": 2874960,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_inner_opcodes",
            "value": 31612,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_inner_gates",
            "value": 92632,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_64_4_4_opcodes",
            "value": 35153,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_64_4_4_gates",
            "value": 161629,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_64_64_32_opcodes",
            "value": 39479,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_64_64_32_gates",
            "value": 172760,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_64_64_32_opcodes",
            "value": 42839,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_64_64_32_gates",
            "value": 216743,
            "unit": "gates"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "name": "David Banks",
            "username": "dbanks12",
            "email": "47112877+dbanks12@users.noreply.github.com"
          },
          "committer": {
            "name": "GitHub",
            "username": "web-flow",
            "email": "noreply@github.com"
          },
          "id": "051fe88ccfca07107351fa37c3bc7372b6905565",
          "message": "feat!: arrange array lengths vertically instead of horizontally in avm public input col (#14424)\n\nCo-authored-by: AztecBot <tech@aztecprotocol.com>",
          "timestamp": "2025-05-22T14:44:05Z",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/051fe88ccfca07107351fa37c3bc7372b6905565"
        },
        "date": 1747927744088,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "barretenberg/cpp/bb-micro-bench/wasm/ultra_honk",
            "value": 8260.554113,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/bb-micro-bench/wasm/client_ivc",
            "value": 58516.403181,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/bb-micro-bench/native/ultra_honk",
            "value": 3478.2173979999698,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/bb-micro-bench/native/client_ivc",
            "value": 22543.46928300015,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/bb-micro-bench/native/client_ivc_17_in_20",
            "value": 18254.60629700001,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+sponsored_fpc/wasm/seconds",
            "value": 44676,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+sponsored_fpc/wasm/memory",
            "value": 1072,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+sponsored_fpc/native/seconds",
            "value": 16655,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+sponsored_fpc/native/memory",
            "value": 995,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/schnorr+deploy_tokenContract_no_registration+sponsored_fpc/wasm/seconds",
            "value": 40511,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/schnorr+deploy_tokenContract_no_registration+sponsored_fpc/wasm/memory",
            "value": 1081,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/schnorr+deploy_tokenContract_no_registration+sponsored_fpc/native/seconds",
            "value": 15594,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/schnorr+deploy_tokenContract_no_registration+sponsored_fpc/native/memory",
            "value": 1027,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+sponsored_fpc/wasm/seconds",
            "value": 39324,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+sponsored_fpc/wasm/memory",
            "value": 1036,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+sponsored_fpc/native/seconds",
            "value": 14917,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+sponsored_fpc/native/memory",
            "value": 1026,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+token_bridge_claim_private+sponsored_fpc/wasm/seconds",
            "value": 45451,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+token_bridge_claim_private+sponsored_fpc/wasm/memory",
            "value": 1059,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+token_bridge_claim_private+sponsored_fpc/native/seconds",
            "value": 17229,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+token_bridge_claim_private+sponsored_fpc/native/memory",
            "value": 1040,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+private_fpc/wasm/seconds",
            "value": 69469,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+private_fpc/wasm/memory",
            "value": 1297,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+private_fpc/native/seconds",
            "value": 25942,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+private_fpc/native/memory",
            "value": 1235,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc/wasm/seconds",
            "value": 92401,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc/wasm/memory",
            "value": 1885,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc/native/seconds",
            "value": 32277,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc/native/memory",
            "value": 1277,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc/wasm/seconds",
            "value": 71423,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc/wasm/memory",
            "value": 2812,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc/native/seconds",
            "value": 24573,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc/native/memory",
            "value": 2060,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+private_fpc/wasm/seconds",
            "value": 59676,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+private_fpc/wasm/memory",
            "value": 1063,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+private_fpc/native/seconds",
            "value": 22644,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+private_fpc/native/memory",
            "value": 1140,
            "unit": "MB"
          },
          {
            "name": "barretenberg/acir_tests/ultra_honk_rec_wasm_memory",
            "value": 2.19,
            "unit": "MiB"
          },
          {
            "name": "yarn-project/end-to-end/Sequencer/aztec.sequencer.block.build_duration",
            "value": 6732,
            "unit": "ms"
          },
          {
            "name": "yarn-project/end-to-end/Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.19272761613284328,
            "unit": "us/mana"
          },
          {
            "name": "yarn-project/end-to-end/Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 99967,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/constructor/0/totalInstructionsExecuted",
            "value": 17011,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/constructor/0/totalDurationMs",
            "value": 207.26969000000008,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/constructor/0/manaUsed",
            "value": 381879,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/constructor/0/txHashMs",
            "value": 26.47258899999997,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/constructor/0/nonRevertiblePrivateInsertionsUs",
            "value": 5073.5930000000735,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/constructor/0/revertiblePrivateInsertionsUs",
            "value": 2301.2480000002142,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/mint_to_public/1/totalInstructionsExecuted",
            "value": 1461,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/mint_to_public/1/totalDurationMs",
            "value": 68.86360400000012,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/mint_to_public/1/manaUsed",
            "value": 42698,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/mint_to_public/1/txHashMs",
            "value": 22.134084000000257,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/mint_to_public/1/nonRevertiblePrivateInsertionsUs",
            "value": 3172.7599999999256,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/mint_to_public/1/revertiblePrivateInsertionsUs",
            "value": 896.4909999999691,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/2/totalInstructionsExecuted",
            "value": 612,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/2/totalDurationMs",
            "value": 53.82518800000025,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/2/manaUsed",
            "value": 12384,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/2/txHashMs",
            "value": 21.37474499999962,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/2/nonRevertiblePrivateInsertionsUs",
            "value": 2492.8609999997207,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/2/revertiblePrivateInsertionsUs",
            "value": 904.0310000000318,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/transfer_in_public/3/totalInstructionsExecuted",
            "value": 1907,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/transfer_in_public/3/totalDurationMs",
            "value": 57.953877999999804,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/transfer_in_public/3/manaUsed",
            "value": 48632,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/transfer_in_public/3/txHashMs",
            "value": 21.139542000000347,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/transfer_in_public/3/nonRevertiblePrivateInsertionsUs",
            "value": 2097.3760000001676,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/transfer_in_public/3/revertiblePrivateInsertionsUs",
            "value": 831.8099999996775,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/4/totalInstructionsExecuted",
            "value": 612,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/4/totalDurationMs",
            "value": 48.70459400000027,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/4/manaUsed",
            "value": 12384,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/4/txHashMs",
            "value": 21.203252000000248,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/4/nonRevertiblePrivateInsertionsUs",
            "value": 2219.3770000003497,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/4/revertiblePrivateInsertionsUs",
            "value": 894.5109999999659,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/5/totalInstructionsExecuted",
            "value": 612,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/5/totalDurationMs",
            "value": 49.38147200000003,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/5/manaUsed",
            "value": 12384,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/5/txHashMs",
            "value": 21.361864999999852,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/5/nonRevertiblePrivateInsertionsUs",
            "value": 2324.478999999883,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/5/revertiblePrivateInsertionsUs",
            "value": 812.3999999997977,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/6/totalInstructionsExecuted",
            "value": 612,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/6/totalDurationMs",
            "value": 47.38152799999989,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/6/manaUsed",
            "value": 12384,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/6/txHashMs",
            "value": 21.223003000000062,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/6/nonRevertiblePrivateInsertionsUs",
            "value": 2206.7870000000767,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/6/revertiblePrivateInsertionsUs",
            "value": 1409.5470000002024,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/burn_public/7/totalInstructionsExecuted",
            "value": 1133,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/burn_public/7/totalDurationMs",
            "value": 61.98833800000011,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/burn_public/7/manaUsed",
            "value": 35852,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/burn_public/7/txHashMs",
            "value": 21.153441999999814,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/burn_public/7/nonRevertiblePrivateInsertionsUs",
            "value": 2506.4909999996416,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/burn_public/7/revertiblePrivateInsertionsUs",
            "value": 840.6200000003992,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/8/totalInstructionsExecuted",
            "value": 612,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/8/totalDurationMs",
            "value": 48.295408999999836,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/8/manaUsed",
            "value": 12384,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/8/txHashMs",
            "value": 21.5354669999997,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/8/nonRevertiblePrivateInsertionsUs",
            "value": 2443.8100000002123,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/8/revertiblePrivateInsertionsUs",
            "value": 866.0709999999199,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/0/totalInstructionsExecuted",
            "value": 17011,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/0/totalDurationMs",
            "value": 160.36670800000002,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/0/manaUsed",
            "value": 381879,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/0/txHashMs",
            "value": 22.457438000000366,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/0/nonRevertiblePrivateInsertionsUs",
            "value": 2361.9790000002467,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/0/revertiblePrivateInsertionsUs",
            "value": 927.6319999999032,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/1/totalInstructionsExecuted",
            "value": 17011,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/1/totalDurationMs",
            "value": 147.50661899999977,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/1/manaUsed",
            "value": 381879,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/1/txHashMs",
            "value": 21.114552000000003,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/1/nonRevertiblePrivateInsertionsUs",
            "value": 2375.8890000003703,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/1/revertiblePrivateInsertionsUs",
            "value": 975.7519999998294,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/2/totalInstructionsExecuted",
            "value": 17011,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/2/totalDurationMs",
            "value": 144.0153949999999,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/2/manaUsed",
            "value": 381879,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/2/txHashMs",
            "value": 21.20532200000025,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/2/nonRevertiblePrivateInsertionsUs",
            "value": 2247.787999999673,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/2/revertiblePrivateInsertionsUs",
            "value": 769.3599999997787,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/constructor/3/totalInstructionsExecuted",
            "value": 1735,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/constructor/3/totalDurationMs",
            "value": 85.24708700000019,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/constructor/3/manaUsed",
            "value": 72855,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/constructor/3/txHashMs",
            "value": 21.008740000000216,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/constructor/3/nonRevertiblePrivateInsertionsUs",
            "value": 2213.858000000073,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/constructor/3/revertiblePrivateInsertionsUs",
            "value": 744.6990000003098,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/set_minter/4/totalInstructionsExecuted",
            "value": 635,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/set_minter/4/totalDurationMs",
            "value": 48.715044000000034,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/set_minter/4/manaUsed",
            "value": 19579,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/set_minter/4/txHashMs",
            "value": 21.076000999999906,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/set_minter/4/nonRevertiblePrivateInsertionsUs",
            "value": 2213.0269999997836,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/set_minter/4/revertiblePrivateInsertionsUs",
            "value": 796.9000000002779,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/add_liquidity/5/totalInstructionsExecuted",
            "value": 9272,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/add_liquidity/5/totalDurationMs",
            "value": 162.83598900000015,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/add_liquidity/5/manaUsed",
            "value": 252462,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/add_liquidity/5/txHashMs",
            "value": 21.04768100000001,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/add_liquidity/5/nonRevertiblePrivateInsertionsUs",
            "value": 3011.7270000000644,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/add_liquidity/5/revertiblePrivateInsertionsUs",
            "value": 732.8990000000886,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/swap_exact_tokens_for_tokens/6/totalInstructionsExecuted",
            "value": 5752,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/swap_exact_tokens_for_tokens/6/totalDurationMs",
            "value": 111.45959100000073,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/swap_exact_tokens_for_tokens/6/manaUsed",
            "value": 141831,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/swap_exact_tokens_for_tokens/6/txHashMs",
            "value": 21.033440000000155,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/swap_exact_tokens_for_tokens/6/nonRevertiblePrivateInsertionsUs",
            "value": 2106.65599999993,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/swap_exact_tokens_for_tokens/6/revertiblePrivateInsertionsUs",
            "value": 677.1390000003521,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/remove_liquidity/7/totalInstructionsExecuted",
            "value": 10059,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/remove_liquidity/7/totalDurationMs",
            "value": 160.3505780000005,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/remove_liquidity/7/manaUsed",
            "value": 264452,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/remove_liquidity/7/txHashMs",
            "value": 21.074741999999787,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/remove_liquidity/7/nonRevertiblePrivateInsertionsUs",
            "value": 2424.6000000002823,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/remove_liquidity/7/revertiblePrivateInsertionsUs",
            "value": 678.7489999996978,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmTest contract tests/AvmTest/bulk_testing/0/totalInstructionsExecuted",
            "value": 27133,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmTest contract tests/AvmTest/bulk_testing/0/totalDurationMs",
            "value": 255.53542899999957,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmTest contract tests/AvmTest/bulk_testing/0/manaUsed",
            "value": 557410,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmTest contract tests/AvmTest/bulk_testing/0/txHashMs",
            "value": 21.129282000000785,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmTest contract tests/AvmTest/bulk_testing/0/nonRevertiblePrivateInsertionsUs",
            "value": 2184.2179999994187,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmTest contract tests/AvmTest/bulk_testing/0/revertiblePrivateInsertionsUs",
            "value": 700.2880000000005,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_10/0/totalInstructionsExecuted",
            "value": 5195,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_10/0/totalDurationMs",
            "value": 103.91111900000033,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_10/0/manaUsed",
            "value": 90720,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_10/0/txHashMs",
            "value": 21.101762000000235,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_10/0/nonRevertiblePrivateInsertionsUs",
            "value": 2109.0759999997317,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_10/0/revertiblePrivateInsertionsUs",
            "value": 661.8479999997362,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_20/1/totalInstructionsExecuted",
            "value": 6318,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_20/1/totalDurationMs",
            "value": 59.48806799999966,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_20/1/manaUsed",
            "value": 111162,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_20/1/txHashMs",
            "value": 21.128131999999823,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_20/1/nonRevertiblePrivateInsertionsUs",
            "value": 2203.8469999997687,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_20/1/revertiblePrivateInsertionsUs",
            "value": 718.3989999994083,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_30/2/totalInstructionsExecuted",
            "value": 7669,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_30/2/totalDurationMs",
            "value": 64.06410500000038,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_30/2/manaUsed",
            "value": 135084,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_30/2/txHashMs",
            "value": 21.248013999999785,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_30/2/nonRevertiblePrivateInsertionsUs",
            "value": 2005.0750000000335,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_30/2/revertiblePrivateInsertionsUs",
            "value": 671.1080000004586,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_40/3/totalInstructionsExecuted",
            "value": 8874,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_40/3/totalDurationMs",
            "value": 66.13262000000032,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_40/3/manaUsed",
            "value": 156435,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_40/3/txHashMs",
            "value": 21.05467100000078,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_40/3/nonRevertiblePrivateInsertionsUs",
            "value": 2103.595999999925,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_40/3/revertiblePrivateInsertionsUs",
            "value": 645.9580000000642,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_50/4/totalInstructionsExecuted",
            "value": 10226,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_50/4/totalDurationMs",
            "value": 67.7572599999994,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_50/4/manaUsed",
            "value": 180366,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_50/4/txHashMs",
            "value": 21.029410000000098,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_50/4/nonRevertiblePrivateInsertionsUs",
            "value": 2126.6859999996086,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_50/4/revertiblePrivateInsertionsUs",
            "value": 640.7479999998031,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_60/5/totalInstructionsExecuted",
            "value": 11744,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_60/5/totalDurationMs",
            "value": 72.94163500000013,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_60/5/manaUsed",
            "value": 206913,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_60/5/txHashMs",
            "value": 21.15308300000015,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_60/5/nonRevertiblePrivateInsertionsUs",
            "value": 2717.294000000038,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_60/5/revertiblePrivateInsertionsUs",
            "value": 777.908999999454,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_70/6/totalInstructionsExecuted",
            "value": 13560,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_70/6/totalDurationMs",
            "value": 75.0431410000001,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_70/6/manaUsed",
            "value": 239988,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_70/6/txHashMs",
            "value": 21.245004000000336,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_70/6/nonRevertiblePrivateInsertionsUs",
            "value": 2443.159999999807,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_70/6/revertiblePrivateInsertionsUs",
            "value": 702.5889999995343,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_80/7/totalInstructionsExecuted",
            "value": 14790,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_80/7/totalDurationMs",
            "value": 78.03215699999964,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_80/7/manaUsed",
            "value": 261915,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_80/7/txHashMs",
            "value": 21.094242000000122,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_80/7/nonRevertiblePrivateInsertionsUs",
            "value": 2556.170999999267,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_80/7/revertiblePrivateInsertionsUs",
            "value": 644.8579999996582,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_90/8/totalInstructionsExecuted",
            "value": 16173,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_90/8/totalDurationMs",
            "value": 82.11586799999986,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_90/8/manaUsed",
            "value": 286554,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_90/8/txHashMs",
            "value": 21.118682000000263,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_90/8/nonRevertiblePrivateInsertionsUs",
            "value": 2077.9449999999997,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_90/8/revertiblePrivateInsertionsUs",
            "value": 680.7779999999184,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_100/9/totalInstructionsExecuted",
            "value": 17403,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_100/9/totalDurationMs",
            "value": 82.60947399999986,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_100/9/manaUsed",
            "value": 308481,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_100/9/txHashMs",
            "value": 21.06594100000075,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_100/9/nonRevertiblePrivateInsertionsUs",
            "value": 2158.716999999342,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_100/9/revertiblePrivateInsertionsUs",
            "value": 648.7379999998666,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_255/10/totalInstructionsExecuted",
            "value": 39046,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_255/10/totalDurationMs",
            "value": 153.07441800000015,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_255/10/manaUsed",
            "value": 693108,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_255/10/txHashMs",
            "value": 21.125811999999314,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_255/10/nonRevertiblePrivateInsertionsUs",
            "value": 3977.9889999999796,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_255/10/revertiblePrivateInsertionsUs",
            "value": 645.8280000006198,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_256/11/totalInstructionsExecuted",
            "value": 39204,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_256/11/totalDurationMs",
            "value": 133.60807699999987,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_256/11/manaUsed",
            "value": 696708,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_256/11/txHashMs",
            "value": 21.10837199999969,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_256/11/nonRevertiblePrivateInsertionsUs",
            "value": 2262.698000000455,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_256/11/revertiblePrivateInsertionsUs",
            "value": 695.2489999994214,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_511/12/totalInstructionsExecuted",
            "value": 74641,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_511/12/totalDurationMs",
            "value": 213.75488999999834,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_511/12/manaUsed",
            "value": 1326093,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_511/12/txHashMs",
            "value": 20.92547899999954,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_511/12/nonRevertiblePrivateInsertionsUs",
            "value": 2251.6880000002857,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_511/12/revertiblePrivateInsertionsUs",
            "value": 650.0880000003235,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_512/13/totalInstructionsExecuted",
            "value": 74700,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_512/13/totalDurationMs",
            "value": 215.99951900000087,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_512/13/manaUsed",
            "value": 1328580,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_512/13/txHashMs",
            "value": 21.224213999999847,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_512/13/nonRevertiblePrivateInsertionsUs",
            "value": 2489.831000000777,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_512/13/revertiblePrivateInsertionsUs",
            "value": 758.0600000001141,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_2048/14/totalInstructionsExecuted",
            "value": 287680,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_2048/14/totalDurationMs",
            "value": 708.0858499999995,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_2048/14/manaUsed",
            "value": 5120364,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_2048/14/txHashMs",
            "value": 21.169793000000936,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_2048/14/nonRevertiblePrivateInsertionsUs",
            "value": 2191.4969999997993,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_2048/14/revertiblePrivateInsertionsUs",
            "value": 648.4380000001693,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_hash/15/totalInstructionsExecuted",
            "value": 9533,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_hash/15/totalDurationMs",
            "value": 65.35831099999996,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_hash/15/manaUsed",
            "value": 175263,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_hash/15/txHashMs",
            "value": 21.034521000001405,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_hash/15/nonRevertiblePrivateInsertionsUs",
            "value": 2074.7559999999794,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_hash/15/revertiblePrivateInsertionsUs",
            "value": 668.4980000009091,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_f1600/16/totalInstructionsExecuted",
            "value": 3054,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_f1600/16/totalDurationMs",
            "value": 49.92036899999948,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_f1600/16/manaUsed",
            "value": 53874,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_f1600/16/txHashMs",
            "value": 21.175632999998925,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_f1600/16/nonRevertiblePrivateInsertionsUs",
            "value": 2194.5569999988948,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_f1600/16/revertiblePrivateInsertionsUs",
            "value": 695.809000000736,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/poseidon2_hash/17/totalInstructionsExecuted",
            "value": 2092,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/poseidon2_hash/17/totalDurationMs",
            "value": 45.677137000000585,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/poseidon2_hash/17/manaUsed",
            "value": 35940,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/poseidon2_hash/17/txHashMs",
            "value": 21.17148300000008,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/poseidon2_hash/17/nonRevertiblePrivateInsertionsUs",
            "value": 2010.5939999994007,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/poseidon2_hash/17/revertiblePrivateInsertionsUs",
            "value": 630.0869999995484,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash/18/totalInstructionsExecuted",
            "value": 22723,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash/18/totalDurationMs",
            "value": 356.68953299999885,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash/18/manaUsed",
            "value": 597213,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash/18/txHashMs",
            "value": 21.06760100000065,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash/18/nonRevertiblePrivateInsertionsUs",
            "value": 1998.6640000006446,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash/18/revertiblePrivateInsertionsUs",
            "value": 639.2479999994976,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash_with_index/19/totalInstructionsExecuted",
            "value": 22840,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash_with_index/19/totalDurationMs",
            "value": 322.31830699999955,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash_with_index/19/manaUsed",
            "value": 603648,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash_with_index/19/txHashMs",
            "value": 21.028910999999425,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash_with_index/19/nonRevertiblePrivateInsertionsUs",
            "value": 2212.267000000793,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash_with_index/19/revertiblePrivateInsertionsUs",
            "value": 749.3800000011106,
            "unit": "us"
          },
          {
            "name": "l1-contracts/forward (100_validators)",
            "value": 655258,
            "unit": "gas"
          },
          {
            "name": "l1-contracts/forward (100_validators) per l2 tx",
            "value": 1820.16,
            "unit": "gas"
          },
          {
            "name": "l1-contracts/forward (no_validators)",
            "value": 332545,
            "unit": "gas"
          },
          {
            "name": "l1-contracts/forward (no_validators) per l2 tx",
            "value": 923.74,
            "unit": "gas"
          },
          {
            "name": "l1-contracts/forward (overhead)",
            "value": 322713,
            "unit": "gas"
          },
          {
            "name": "l1-contracts/forward (overhead) per l2 tx",
            "value": 896.42,
            "unit": "gas"
          },
          {
            "name": "l1-contracts/setupEpoch (100_validators)",
            "value": 1627545,
            "unit": "gas"
          },
          {
            "name": "l1-contracts/setupEpoch (100_validators) per l2 tx",
            "value": 141.28,
            "unit": "gas"
          },
          {
            "name": "l1-contracts/setupEpoch (no_validators)",
            "value": 84128,
            "unit": "gas"
          },
          {
            "name": "l1-contracts/setupEpoch (no_validators) per l2 tx",
            "value": 7.3,
            "unit": "gas"
          },
          {
            "name": "l1-contracts/setupEpoch (overhead)",
            "value": 1543417,
            "unit": "gas"
          },
          {
            "name": "l1-contracts/setupEpoch (overhead) per l2 tx",
            "value": 133.98,
            "unit": "gas"
          },
          {
            "name": "l1-contracts/submitEpochRootProof (100_validators)",
            "value": 921756,
            "unit": "gas"
          },
          {
            "name": "l1-contracts/submitEpochRootProof (100_validators) per l2 tx",
            "value": 80.01,
            "unit": "gas"
          },
          {
            "name": "l1-contracts/submitEpochRootProof (no_validators)",
            "value": 921756,
            "unit": "gas"
          },
          {
            "name": "l1-contracts/submitEpochRootProof (no_validators) per l2 tx",
            "value": 80.01,
            "unit": "gas"
          },
          {
            "name": "l1-contracts/submitEpochRootProof (overhead)",
            "value": 0,
            "unit": "gas"
          },
          {
            "name": "l1-contracts/submitEpochRootProof (overhead) per l2 tx",
            "value": 0,
            "unit": "gas"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_64_64_4_opcodes",
            "value": 40310,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_64_64_4_gates",
            "value": 211923,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_tail_to_public_opcodes",
            "value": 16628,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_tail_to_public_gates",
            "value": 49235,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_4_64_32_opcodes",
            "value": 37021,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_4_64_32_gates",
            "value": 156801,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_4_4_4_4_4_4_4_4_4_opcodes",
            "value": 27176,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_4_4_4_4_4_4_4_4_4_gates",
            "value": 101131,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_base_public_opcodes",
            "value": 209839,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_base_public_gates",
            "value": 4526575,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_64_64_4_opcodes",
            "value": 37207,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_64_64_4_gates",
            "value": 170090,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_64_4_4_opcodes",
            "value": 32050,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_64_4_4_gates",
            "value": 119796,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_64_4_32_opcodes",
            "value": 41042,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_64_4_32_gates",
            "value": 210432,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_64_4_4_opcodes",
            "value": 38513,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_64_4_4_gates",
            "value": 205612,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_4_64_32_opcodes",
            "value": 40381,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_4_64_32_gates",
            "value": 200784,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_4_4_4_opcodes",
            "value": 32695,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_4_4_4_gates",
            "value": 145670,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_block_merge_opcodes",
            "value": 8684,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_block_merge_gates",
            "value": 1543358,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_4_4_32_opcodes",
            "value": 35224,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_4_4_32_gates",
            "value": 150491,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_root_opcodes",
            "value": 8670,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_root_gates",
            "value": 26799515,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_4_64_4_opcodes",
            "value": 34492,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_4_64_4_gates",
            "value": 151981,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_block_root_empty_opcodes",
            "value": 6404,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_block_root_empty_gates",
            "value": 708327,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_4_64_4_opcodes",
            "value": 34749,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_4_64_4_gates",
            "value": 154131,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_block_root_single_tx_opcodes",
            "value": 876816,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_block_root_single_tx_gates",
            "value": 3893725,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_32_32_32_32_32_32_32_32_opcodes",
            "value": 52340,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_32_32_32_32_32_32_32_32_gates",
            "value": 348149,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_4_4_4_opcodes",
            "value": 36055,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_4_4_4_gates",
            "value": 189653,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_4_64_32_opcodes",
            "value": 37278,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_4_64_32_gates",
            "value": 158951,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_0_0_64_0_0_0_0_0_0_opcodes",
            "value": 12563,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_0_0_64_0_0_0_0_0_0_gates",
            "value": 42086,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_64_0_0_0_0_0_0_0_0_opcodes",
            "value": 12563,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_64_0_0_0_0_0_0_0_0_gates",
            "value": 42086,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_init_opcodes",
            "value": 14838,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_init_gates",
            "value": 41309,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_4_4_4_opcodes",
            "value": 32952,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_4_4_4_gates",
            "value": 147820,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_16_16_16_16_16_16_16_16_16_opcodes",
            "value": 37971,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_16_16_16_16_16_16_16_16_16_gates",
            "value": 207005,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_4_4_32_opcodes",
            "value": 32121,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_4_4_32_gates",
            "value": 108658,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_4_4_4_opcodes",
            "value": 29592,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_4_4_4_gates",
            "value": 103837,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_64_64_4_opcodes",
            "value": 33847,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_64_64_4_gates",
            "value": 126107,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/parity_base_opcodes",
            "value": 3509,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/parity_base_gates",
            "value": 30646,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_base_private_opcodes",
            "value": 271548,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_base_private_gates",
            "value": 1895604,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_0_0_0_0_0_64_0_0_0_opcodes",
            "value": 20822,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_0_0_0_0_0_64_0_0_0_gates",
            "value": 56710,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_4_64_32_opcodes",
            "value": 33918,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_4_64_32_gates",
            "value": 114968,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_64_4_32_opcodes",
            "value": 34579,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_64_4_32_gates",
            "value": 124616,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_4_64_4_opcodes",
            "value": 37852,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_4_64_4_gates",
            "value": 195964,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_4_4_32_opcodes",
            "value": 38584,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_4_4_32_gates",
            "value": 194474,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_0_64_0_0_0_0_0_0_0_opcodes",
            "value": 27091,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_0_64_0_0_0_0_0_0_0_gates",
            "value": 263396,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_64_64_32_opcodes",
            "value": 36376,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_64_64_32_gates",
            "value": 130927,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_opcodes",
            "value": 78051,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_gates",
            "value": 625446,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_block_root_opcodes",
            "value": 878261,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_block_root_gates",
            "value": 4690089,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_64_4_4_opcodes",
            "value": 35410,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_64_4_4_gates",
            "value": 163779,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_64_64_4_opcodes",
            "value": 36950,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_64_64_4_gates",
            "value": 167940,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_64_64_32_opcodes",
            "value": 39736,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_64_64_32_gates",
            "value": 174910,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_64_4_32_opcodes",
            "value": 37682,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_64_4_32_gates",
            "value": 166449,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_4_64_4_opcodes",
            "value": 31389,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_4_64_4_gates",
            "value": 110148,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_4_4_32_opcodes",
            "value": 35481,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_4_4_32_gates",
            "value": 152641,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_tail_opcodes",
            "value": 5105,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_tail_gates",
            "value": 33621,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_0_0_0_64_0_0_0_0_0_opcodes",
            "value": 28437,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_0_0_0_64_0_0_0_0_0_gates",
            "value": 274966,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_merge_opcodes",
            "value": 1727,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_merge_gates",
            "value": 1463558,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_64_4_32_opcodes",
            "value": 37939,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_64_4_32_gates",
            "value": 168599,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_0_0_0_0_64_0_0_0_0_opcodes",
            "value": 13896,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_0_0_0_0_64_0_0_0_0_gates",
            "value": 101560,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/parity_root_opcodes",
            "value": 4158,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/parity_root_gates",
            "value": 2874960,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_inner_opcodes",
            "value": 31612,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_inner_gates",
            "value": 92632,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_64_4_4_opcodes",
            "value": 35153,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_64_4_4_gates",
            "value": 161629,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_64_64_32_opcodes",
            "value": 39479,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_64_64_32_gates",
            "value": 172760,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_64_64_32_opcodes",
            "value": 42839,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_64_64_32_gates",
            "value": 216743,
            "unit": "gates"
          }
        ]
      }
    ]
  }
}