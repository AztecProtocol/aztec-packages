window.BENCHMARK_DATA = {
  "lastUpdate": 1747934565440,
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
      },
      {
        "commit": {
          "author": {
            "name": "Alex Gherghisan",
            "username": "alexghr",
            "email": "alexghr@users.noreply.github.com"
          },
          "committer": {
            "name": "GitHub",
            "username": "web-flow",
            "email": "noreply@github.com"
          },
          "id": "ee94e1040c76ac02184f306d4532ca8d7fdea4fe",
          "message": "fix: bump defaults (#14466)",
          "timestamp": "2025-05-22T14:48:17Z",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ee94e1040c76ac02184f306d4532ca8d7fdea4fe"
        },
        "date": 1747927752483,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "barretenberg/cpp/bb-micro-bench/wasm/ultra_honk",
            "value": 8260.209818,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/bb-micro-bench/wasm/client_ivc",
            "value": 59710.978247,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/bb-micro-bench/native/ultra_honk",
            "value": 3474.0333289998944,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/bb-micro-bench/native/client_ivc",
            "value": 22850.847574,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/bb-micro-bench/native/client_ivc_17_in_20",
            "value": 18191.23468199996,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+sponsored_fpc/wasm/seconds",
            "value": 44536,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+sponsored_fpc/wasm/memory",
            "value": 1045,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+sponsored_fpc/native/seconds",
            "value": 16602,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+sponsored_fpc/native/memory",
            "value": 1021,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/schnorr+deploy_tokenContract_no_registration+sponsored_fpc/wasm/seconds",
            "value": 40656,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/schnorr+deploy_tokenContract_no_registration+sponsored_fpc/wasm/memory",
            "value": 1157,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/schnorr+deploy_tokenContract_no_registration+sponsored_fpc/native/seconds",
            "value": 15438,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/schnorr+deploy_tokenContract_no_registration+sponsored_fpc/native/memory",
            "value": 1077,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+sponsored_fpc/wasm/seconds",
            "value": 38894,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+sponsored_fpc/wasm/memory",
            "value": 976,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+sponsored_fpc/native/seconds",
            "value": 14544,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+sponsored_fpc/native/memory",
            "value": 979,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+token_bridge_claim_private+sponsored_fpc/wasm/seconds",
            "value": 45773,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+token_bridge_claim_private+sponsored_fpc/wasm/memory",
            "value": 1113,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+token_bridge_claim_private+sponsored_fpc/native/seconds",
            "value": 17019,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+token_bridge_claim_private+sponsored_fpc/native/memory",
            "value": 1056,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+private_fpc/wasm/seconds",
            "value": 69053,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+private_fpc/wasm/memory",
            "value": 1298,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+private_fpc/native/seconds",
            "value": 25927,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+private_fpc/native/memory",
            "value": 1234,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc/wasm/seconds",
            "value": 91369,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc/wasm/memory",
            "value": 1906,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc/native/seconds",
            "value": 31797,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc/native/memory",
            "value": 1274,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc/wasm/seconds",
            "value": 71797,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc/wasm/memory",
            "value": 2760,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc/native/seconds",
            "value": 24537,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc/native/memory",
            "value": 2074,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+private_fpc/wasm/seconds",
            "value": 60102,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+private_fpc/wasm/memory",
            "value": 1040,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+private_fpc/native/seconds",
            "value": 22471,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+private_fpc/native/memory",
            "value": 1166,
            "unit": "MB"
          },
          {
            "name": "barretenberg/acir_tests/ultra_honk_rec_wasm_memory",
            "value": 2.19,
            "unit": "MiB"
          },
          {
            "name": "yarn-project/end-to-end/Sequencer/aztec.sequencer.block.build_duration",
            "value": 7149,
            "unit": "ms"
          },
          {
            "name": "yarn-project/end-to-end/Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.20465868661515818,
            "unit": "us/mana"
          },
          {
            "name": "yarn-project/end-to-end/Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 97522,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/constructor/0/totalInstructionsExecuted",
            "value": 17011,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/constructor/0/totalDurationMs",
            "value": 205.53057100000024,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/constructor/0/manaUsed",
            "value": 381879,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/constructor/0/txHashMs",
            "value": 24.28834500000039,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/constructor/0/nonRevertiblePrivateInsertionsUs",
            "value": 4962.503000000197,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/constructor/0/revertiblePrivateInsertionsUs",
            "value": 2255.083999999897,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/mint_to_public/1/totalInstructionsExecuted",
            "value": 1461,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/mint_to_public/1/totalDurationMs",
            "value": 69.68988099999979,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/mint_to_public/1/manaUsed",
            "value": 42698,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/mint_to_public/1/txHashMs",
            "value": 22.029221000000234,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/mint_to_public/1/nonRevertiblePrivateInsertionsUs",
            "value": 3520.382000000154,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/mint_to_public/1/revertiblePrivateInsertionsUs",
            "value": 906.3700000001518,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/2/totalInstructionsExecuted",
            "value": 612,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/2/totalDurationMs",
            "value": 55.82915099999991,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/2/manaUsed",
            "value": 12384,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/2/txHashMs",
            "value": 21.366899000000103,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/2/nonRevertiblePrivateInsertionsUs",
            "value": 2471.8809999999394,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/2/revertiblePrivateInsertionsUs",
            "value": 928.8109999997687,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/transfer_in_public/3/totalInstructionsExecuted",
            "value": 1907,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/transfer_in_public/3/totalDurationMs",
            "value": 58.25125799999978,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/transfer_in_public/3/manaUsed",
            "value": 48632,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/transfer_in_public/3/txHashMs",
            "value": 21.151192999999694,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/transfer_in_public/3/nonRevertiblePrivateInsertionsUs",
            "value": 2291.537000000062,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/transfer_in_public/3/revertiblePrivateInsertionsUs",
            "value": 894.8589999999967,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/4/totalInstructionsExecuted",
            "value": 612,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/4/totalDurationMs",
            "value": 47.62856800000009,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/4/manaUsed",
            "value": 12384,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/4/txHashMs",
            "value": 21.37201099999993,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/4/nonRevertiblePrivateInsertionsUs",
            "value": 2326.2190000000373,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/4/revertiblePrivateInsertionsUs",
            "value": 941.8729999997595,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/5/totalInstructionsExecuted",
            "value": 612,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/5/totalDurationMs",
            "value": 49.26335500000005,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/5/manaUsed",
            "value": 12384,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/5/txHashMs",
            "value": 21.218747999999778,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/5/nonRevertiblePrivateInsertionsUs",
            "value": 2268.6149999999543,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/5/revertiblePrivateInsertionsUs",
            "value": 801.792000000205,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/6/totalInstructionsExecuted",
            "value": 612,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/6/totalDurationMs",
            "value": 47.992436,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/6/manaUsed",
            "value": 12384,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/6/txHashMs",
            "value": 21.208458000000064,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/6/nonRevertiblePrivateInsertionsUs",
            "value": 2216.3110000001325,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/6/revertiblePrivateInsertionsUs",
            "value": 1499.61600000006,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/burn_public/7/totalInstructionsExecuted",
            "value": 1133,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/burn_public/7/totalDurationMs",
            "value": 58.68507200000022,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/burn_public/7/manaUsed",
            "value": 35852,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/burn_public/7/txHashMs",
            "value": 21.24082000000044,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/burn_public/7/nonRevertiblePrivateInsertionsUs",
            "value": 2442.219000000023,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/burn_public/7/revertiblePrivateInsertionsUs",
            "value": 757.6389999999265,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/8/totalInstructionsExecuted",
            "value": 612,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/8/totalDurationMs",
            "value": 48.382256000000325,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/8/manaUsed",
            "value": 12384,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/8/txHashMs",
            "value": 21.429744000000028,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/8/nonRevertiblePrivateInsertionsUs",
            "value": 2705.7780000000093,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/8/revertiblePrivateInsertionsUs",
            "value": 858.9470000001711,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/0/totalInstructionsExecuted",
            "value": 17011,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/0/totalDurationMs",
            "value": 155.73511599999983,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/0/manaUsed",
            "value": 381879,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/0/txHashMs",
            "value": 22.278299999999945,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/0/nonRevertiblePrivateInsertionsUs",
            "value": 2271.705000000111,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/0/revertiblePrivateInsertionsUs",
            "value": 818.2630000001154,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/1/totalInstructionsExecuted",
            "value": 17011,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/1/totalDurationMs",
            "value": 144.3010119999999,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/1/manaUsed",
            "value": 381879,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/1/txHashMs",
            "value": 21.177145999999993,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/1/nonRevertiblePrivateInsertionsUs",
            "value": 2379.464000000098,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/1/revertiblePrivateInsertionsUs",
            "value": 980.485999999928,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/2/totalInstructionsExecuted",
            "value": 17011,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/2/totalDurationMs",
            "value": 144.72670500000004,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/2/manaUsed",
            "value": 381879,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/2/txHashMs",
            "value": 21.09691900000007,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/2/nonRevertiblePrivateInsertionsUs",
            "value": 2280.036000000109,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/2/revertiblePrivateInsertionsUs",
            "value": 809.7520000001168,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/constructor/3/totalInstructionsExecuted",
            "value": 1735,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/constructor/3/totalDurationMs",
            "value": 86.38552000000027,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/constructor/3/manaUsed",
            "value": 72855,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/constructor/3/txHashMs",
            "value": 21.106669000000238,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/constructor/3/nonRevertiblePrivateInsertionsUs",
            "value": 2411.895999999615,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/constructor/3/revertiblePrivateInsertionsUs",
            "value": 752.0979999999327,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/set_minter/4/totalInstructionsExecuted",
            "value": 635,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/set_minter/4/totalDurationMs",
            "value": 48.10538499999984,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/set_minter/4/manaUsed",
            "value": 19579,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/set_minter/4/txHashMs",
            "value": 21.060746999999992,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/set_minter/4/nonRevertiblePrivateInsertionsUs",
            "value": 2196.060000000216,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/set_minter/4/revertiblePrivateInsertionsUs",
            "value": 798.3919999996942,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/add_liquidity/5/totalInstructionsExecuted",
            "value": 9272,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/add_liquidity/5/totalDurationMs",
            "value": 165.96755500000017,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/add_liquidity/5/manaUsed",
            "value": 252462,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/add_liquidity/5/txHashMs",
            "value": 21.02672399999983,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/add_liquidity/5/nonRevertiblePrivateInsertionsUs",
            "value": 5752.473999999893,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/add_liquidity/5/revertiblePrivateInsertionsUs",
            "value": 721.2449999997261,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/swap_exact_tokens_for_tokens/6/totalInstructionsExecuted",
            "value": 5752,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/swap_exact_tokens_for_tokens/6/totalDurationMs",
            "value": 108.0971470000004,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/swap_exact_tokens_for_tokens/6/manaUsed",
            "value": 141831,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/swap_exact_tokens_for_tokens/6/txHashMs",
            "value": 21.21061699999973,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/swap_exact_tokens_for_tokens/6/nonRevertiblePrivateInsertionsUs",
            "value": 2415.9660000004806,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/swap_exact_tokens_for_tokens/6/revertiblePrivateInsertionsUs",
            "value": 727.0159999998214,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/remove_liquidity/7/totalInstructionsExecuted",
            "value": 10059,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/remove_liquidity/7/totalDurationMs",
            "value": 157.63659199999984,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/remove_liquidity/7/manaUsed",
            "value": 264452,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/remove_liquidity/7/txHashMs",
            "value": 21.014852999999675,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/remove_liquidity/7/nonRevertiblePrivateInsertionsUs",
            "value": 2183.2690000001094,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/remove_liquidity/7/revertiblePrivateInsertionsUs",
            "value": 678.3619999996517,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmTest contract tests/AvmTest/bulk_testing/0/totalInstructionsExecuted",
            "value": 27133,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmTest contract tests/AvmTest/bulk_testing/0/totalDurationMs",
            "value": 249.44977199999994,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmTest contract tests/AvmTest/bulk_testing/0/manaUsed",
            "value": 557410,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmTest contract tests/AvmTest/bulk_testing/0/txHashMs",
            "value": 21.191186000000016,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmTest contract tests/AvmTest/bulk_testing/0/nonRevertiblePrivateInsertionsUs",
            "value": 2155.8459999996558,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmTest contract tests/AvmTest/bulk_testing/0/revertiblePrivateInsertionsUs",
            "value": 724.6160000004238,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_10/0/totalInstructionsExecuted",
            "value": 5195,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_10/0/totalDurationMs",
            "value": 103.40760399999999,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_10/0/manaUsed",
            "value": 90720,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_10/0/txHashMs",
            "value": 21.105069999999614,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_10/0/nonRevertiblePrivateInsertionsUs",
            "value": 2027.4669999998878,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_10/0/revertiblePrivateInsertionsUs",
            "value": 716.5349999995669,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_20/1/totalInstructionsExecuted",
            "value": 6318,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_20/1/totalDurationMs",
            "value": 59.299339000000145,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_20/1/manaUsed",
            "value": 111162,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_20/1/txHashMs",
            "value": 21.27457400000003,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_20/1/nonRevertiblePrivateInsertionsUs",
            "value": 2112.1149999999034,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_20/1/revertiblePrivateInsertionsUs",
            "value": 701.1449999999968,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_30/2/totalInstructionsExecuted",
            "value": 7669,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_30/2/totalDurationMs",
            "value": 65.41900800000076,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_30/2/manaUsed",
            "value": 135084,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_30/2/txHashMs",
            "value": 21.115842000000157,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_30/2/nonRevertiblePrivateInsertionsUs",
            "value": 2424.3900000001304,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_30/2/revertiblePrivateInsertionsUs",
            "value": 719.9170000003505,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_40/3/totalInstructionsExecuted",
            "value": 8874,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_40/3/totalDurationMs",
            "value": 67.68639600000006,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_40/3/manaUsed",
            "value": 156435,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_40/3/txHashMs",
            "value": 20.924856999999975,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_40/3/nonRevertiblePrivateInsertionsUs",
            "value": 2288.0489999997735,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_40/3/revertiblePrivateInsertionsUs",
            "value": 785.8810000006997,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_50/4/totalInstructionsExecuted",
            "value": 10226,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_50/4/totalDurationMs",
            "value": 68.16318200000023,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_50/4/manaUsed",
            "value": 180366,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_50/4/txHashMs",
            "value": 21.04436699999951,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_50/4/nonRevertiblePrivateInsertionsUs",
            "value": 2710.6720000001587,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_50/4/revertiblePrivateInsertionsUs",
            "value": 670.0819999996384,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_60/5/totalInstructionsExecuted",
            "value": 11744,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_60/5/totalDurationMs",
            "value": 75.0998840000002,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_60/5/manaUsed",
            "value": 206913,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_60/5/txHashMs",
            "value": 21.041605999999774,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_60/5/nonRevertiblePrivateInsertionsUs",
            "value": 2559.160000000702,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_60/5/revertiblePrivateInsertionsUs",
            "value": 762.100000000828,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_70/6/totalInstructionsExecuted",
            "value": 13560,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_70/6/totalDurationMs",
            "value": 75.53830000000016,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_70/6/manaUsed",
            "value": 239988,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_70/6/txHashMs",
            "value": 21.059408000000076,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_70/6/nonRevertiblePrivateInsertionsUs",
            "value": 2251.3159999998607,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_70/6/revertiblePrivateInsertionsUs",
            "value": 709.4950000000608,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_80/7/totalInstructionsExecuted",
            "value": 14790,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_80/7/totalDurationMs",
            "value": 78.4109239999998,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_80/7/manaUsed",
            "value": 261915,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_80/7/txHashMs",
            "value": 21.02623500000027,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_80/7/nonRevertiblePrivateInsertionsUs",
            "value": 2592.5130000005083,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_80/7/revertiblePrivateInsertionsUs",
            "value": 680.1230000000942,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_90/8/totalInstructionsExecuted",
            "value": 16173,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_90/8/totalDurationMs",
            "value": 82.69351899999947,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_90/8/manaUsed",
            "value": 286554,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_90/8/txHashMs",
            "value": 21.088090000000193,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_90/8/nonRevertiblePrivateInsertionsUs",
            "value": 2168.209000000388,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_90/8/revertiblePrivateInsertionsUs",
            "value": 647.371000000021,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_100/9/totalInstructionsExecuted",
            "value": 17403,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_100/9/totalDurationMs",
            "value": 83.03454599999986,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_100/9/manaUsed",
            "value": 308481,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_100/9/txHashMs",
            "value": 20.98293199999989,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_100/9/nonRevertiblePrivateInsertionsUs",
            "value": 2093.3539999996356,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_100/9/revertiblePrivateInsertionsUs",
            "value": 678.1229999996867,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_255/10/totalInstructionsExecuted",
            "value": 39046,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_255/10/totalDurationMs",
            "value": 135.9085930000001,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_255/10/manaUsed",
            "value": 693108,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_255/10/txHashMs",
            "value": 20.919815999999628,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_255/10/nonRevertiblePrivateInsertionsUs",
            "value": 2187.790999999379,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_255/10/revertiblePrivateInsertionsUs",
            "value": 633.389999999963,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_256/11/totalInstructionsExecuted",
            "value": 39204,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_256/11/totalDurationMs",
            "value": 135.66699299999982,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_256/11/manaUsed",
            "value": 696708,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_256/11/txHashMs",
            "value": 21.086119999999937,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_256/11/nonRevertiblePrivateInsertionsUs",
            "value": 2167.640000000574,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_256/11/revertiblePrivateInsertionsUs",
            "value": 679.7529999994367,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_511/12/totalInstructionsExecuted",
            "value": 74641,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_511/12/totalDurationMs",
            "value": 219.50163199999952,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_511/12/manaUsed",
            "value": 1326093,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_511/12/txHashMs",
            "value": 21.030425000000832,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_511/12/nonRevertiblePrivateInsertionsUs",
            "value": 2364.545000000362,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_511/12/revertiblePrivateInsertionsUs",
            "value": 683.3930000011605,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_512/13/totalInstructionsExecuted",
            "value": 74700,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_512/13/totalDurationMs",
            "value": 220.37564100000054,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_512/13/manaUsed",
            "value": 1328580,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_512/13/txHashMs",
            "value": 21.31000700000004,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_512/13/nonRevertiblePrivateInsertionsUs",
            "value": 2260.7759999991686,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_512/13/revertiblePrivateInsertionsUs",
            "value": 723.957000000155,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_2048/14/totalInstructionsExecuted",
            "value": 287680,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_2048/14/totalDurationMs",
            "value": 728.629221000001,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_2048/14/manaUsed",
            "value": 5120364,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_2048/14/txHashMs",
            "value": 21.221841000000495,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_2048/14/nonRevertiblePrivateInsertionsUs",
            "value": 2058.8710000010906,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_2048/14/revertiblePrivateInsertionsUs",
            "value": 758.9590000006865,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_hash/15/totalInstructionsExecuted",
            "value": 9533,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_hash/15/totalDurationMs",
            "value": 65.77434499999981,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_hash/15/manaUsed",
            "value": 175263,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_hash/15/txHashMs",
            "value": 20.955368999999337,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_hash/15/nonRevertiblePrivateInsertionsUs",
            "value": 2146.0880000013276,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_hash/15/revertiblePrivateInsertionsUs",
            "value": 647.9510000008304,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_f1600/16/totalInstructionsExecuted",
            "value": 3054,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_f1600/16/totalDurationMs",
            "value": 49.75096200000007,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_f1600/16/manaUsed",
            "value": 53874,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_f1600/16/txHashMs",
            "value": 21.062117000001308,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_f1600/16/nonRevertiblePrivateInsertionsUs",
            "value": 2247.69600000036,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_f1600/16/revertiblePrivateInsertionsUs",
            "value": 663.0110000005516,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/poseidon2_hash/17/totalInstructionsExecuted",
            "value": 2092,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/poseidon2_hash/17/totalDurationMs",
            "value": 47.48168499999883,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/poseidon2_hash/17/manaUsed",
            "value": 35940,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/poseidon2_hash/17/txHashMs",
            "value": 20.946108000000095,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/poseidon2_hash/17/nonRevertiblePrivateInsertionsUs",
            "value": 2280.3690000000643,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/poseidon2_hash/17/revertiblePrivateInsertionsUs",
            "value": 637.8100000001723,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash/18/totalInstructionsExecuted",
            "value": 22772,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash/18/totalDurationMs",
            "value": 368.982446,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash/18/manaUsed",
            "value": 600453,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash/18/txHashMs",
            "value": 21.04639600000155,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash/18/nonRevertiblePrivateInsertionsUs",
            "value": 2152.1880000000237,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash/18/revertiblePrivateInsertionsUs",
            "value": 662.5409999996918,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash_with_index/19/totalInstructionsExecuted",
            "value": 22800,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash_with_index/19/totalDurationMs",
            "value": 327.1206309999998,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash_with_index/19/manaUsed",
            "value": 601311,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash_with_index/19/txHashMs",
            "value": 21.031295000000682,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash_with_index/19/nonRevertiblePrivateInsertionsUs",
            "value": 2356.6940000000614,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash_with_index/19/revertiblePrivateInsertionsUs",
            "value": 661.3820000002306,
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
      },
      {
        "commit": {
          "author": {
            "name": "Álvaro Rodríguez",
            "username": "sirasistant",
            "email": "sirasistant@gmail.com"
          },
          "committer": {
            "name": "GitHub",
            "username": "web-flow",
            "email": "noreply@github.com"
          },
          "id": "4fede8303a84cc32c3bf58f86c01f80a7aef228b",
          "message": "fix!: Gas limit in call should be u32 (#14462)\n\nResolves https://github.com/AztecProtocol/aztec-packages/issues/14458",
          "timestamp": "2025-05-22T15:07:55Z",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/4fede8303a84cc32c3bf58f86c01f80a7aef228b"
        },
        "date": 1747928566829,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "barretenberg/cpp/bb-micro-bench/wasm/ultra_honk",
            "value": 8291.316889,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/bb-micro-bench/wasm/client_ivc",
            "value": 58826.451063,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/bb-micro-bench/native/ultra_honk",
            "value": 3514.973497000028,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/bb-micro-bench/native/client_ivc",
            "value": 22715.97689600003,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/bb-micro-bench/native/client_ivc_17_in_20",
            "value": 18134.963789000038,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+sponsored_fpc/wasm/seconds",
            "value": 44412,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+sponsored_fpc/wasm/memory",
            "value": 1044,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+sponsored_fpc/native/seconds",
            "value": 16559,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+sponsored_fpc/native/memory",
            "value": 995,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/schnorr+deploy_tokenContract_no_registration+sponsored_fpc/wasm/seconds",
            "value": 40517,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/schnorr+deploy_tokenContract_no_registration+sponsored_fpc/wasm/memory",
            "value": 987,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/schnorr+deploy_tokenContract_no_registration+sponsored_fpc/native/seconds",
            "value": 15609,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/schnorr+deploy_tokenContract_no_registration+sponsored_fpc/native/memory",
            "value": 1086,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+sponsored_fpc/wasm/seconds",
            "value": 39193,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+sponsored_fpc/wasm/memory",
            "value": 1054,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+sponsored_fpc/native/seconds",
            "value": 14483,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+sponsored_fpc/native/memory",
            "value": 996,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+token_bridge_claim_private+sponsored_fpc/wasm/seconds",
            "value": 45248,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+token_bridge_claim_private+sponsored_fpc/wasm/memory",
            "value": 1108,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+token_bridge_claim_private+sponsored_fpc/native/seconds",
            "value": 17108,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+token_bridge_claim_private+sponsored_fpc/native/memory",
            "value": 1023,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+private_fpc/wasm/seconds",
            "value": 69024,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+private_fpc/wasm/memory",
            "value": 1296,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+private_fpc/native/seconds",
            "value": 25764,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+private_fpc/native/memory",
            "value": 1234,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc/wasm/seconds",
            "value": 92647,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc/wasm/memory",
            "value": 1791,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc/native/seconds",
            "value": 31750,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc/native/memory",
            "value": 1271,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc/wasm/seconds",
            "value": 70697,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc/wasm/memory",
            "value": 2907,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc/native/seconds",
            "value": 24553,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc/native/memory",
            "value": 2086,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+private_fpc/wasm/seconds",
            "value": 59672,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+private_fpc/wasm/memory",
            "value": 1069,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+private_fpc/native/seconds",
            "value": 22405,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+private_fpc/native/memory",
            "value": 1197,
            "unit": "MB"
          },
          {
            "name": "barretenberg/acir_tests/ultra_honk_rec_wasm_memory",
            "value": 2.19,
            "unit": "MiB"
          },
          {
            "name": "yarn-project/end-to-end/Sequencer/aztec.sequencer.block.build_duration",
            "value": 6850,
            "unit": "ms"
          },
          {
            "name": "yarn-project/end-to-end/Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.19609861799498968,
            "unit": "us/mana"
          },
          {
            "name": "yarn-project/end-to-end/Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 98651,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/constructor/0/totalInstructionsExecuted",
            "value": 17262,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/constructor/0/totalDurationMs",
            "value": 213.45259399999986,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/constructor/0/manaUsed",
            "value": 385938,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/constructor/0/txHashMs",
            "value": 24.428885999999693,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/constructor/0/nonRevertiblePrivateInsertionsUs",
            "value": 4928.863999999976,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/constructor/0/revertiblePrivateInsertionsUs",
            "value": 2331.7040000001725,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/mint_to_public/1/totalInstructionsExecuted",
            "value": 1363,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/mint_to_public/1/totalDurationMs",
            "value": 67.659537,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/mint_to_public/1/manaUsed",
            "value": 41750,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/mint_to_public/1/txHashMs",
            "value": 22.343276999999944,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/mint_to_public/1/nonRevertiblePrivateInsertionsUs",
            "value": 3146.8629999999393,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/mint_to_public/1/revertiblePrivateInsertionsUs",
            "value": 922.6810000000114,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/2/totalInstructionsExecuted",
            "value": 580,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/2/totalDurationMs",
            "value": 53.33631500000001,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/2/manaUsed",
            "value": 12138,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/2/txHashMs",
            "value": 21.399445999999898,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/2/nonRevertiblePrivateInsertionsUs",
            "value": 2599.6000000000095,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/2/revertiblePrivateInsertionsUs",
            "value": 956.9120000001021,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/transfer_in_public/3/totalInstructionsExecuted",
            "value": 1800,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/transfer_in_public/3/totalDurationMs",
            "value": 61.96755600000006,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/transfer_in_public/3/manaUsed",
            "value": 47660,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/transfer_in_public/3/txHashMs",
            "value": 21.19385999999986,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/transfer_in_public/3/nonRevertiblePrivateInsertionsUs",
            "value": 2718.7629999998535,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/transfer_in_public/3/revertiblePrivateInsertionsUs",
            "value": 843.1299999997464,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/4/totalInstructionsExecuted",
            "value": 580,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/4/totalDurationMs",
            "value": 50.40973800000029,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/4/manaUsed",
            "value": 12138,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/4/txHashMs",
            "value": 21.244821999999658,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/4/nonRevertiblePrivateInsertionsUs",
            "value": 2489.3879999999626,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/4/revertiblePrivateInsertionsUs",
            "value": 927.3619999999028,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/5/totalInstructionsExecuted",
            "value": 580,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/5/totalDurationMs",
            "value": 47.223603999999796,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/5/manaUsed",
            "value": 12138,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/5/txHashMs",
            "value": 21.195600999999897,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/5/nonRevertiblePrivateInsertionsUs",
            "value": 2285.0029999999606,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/5/revertiblePrivateInsertionsUs",
            "value": 787.3679999997876,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/6/totalInstructionsExecuted",
            "value": 580,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/6/totalDurationMs",
            "value": 48.42447100000027,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/6/manaUsed",
            "value": 12138,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/6/txHashMs",
            "value": 21.269732999999633,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/6/nonRevertiblePrivateInsertionsUs",
            "value": 2411.356000000069,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/6/revertiblePrivateInsertionsUs",
            "value": 1573.6560000000281,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/burn_public/7/totalInstructionsExecuted",
            "value": 1040,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/burn_public/7/totalDurationMs",
            "value": 53.92039799999975,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/burn_public/7/manaUsed",
            "value": 34865,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/burn_public/7/txHashMs",
            "value": 21.31681299999991,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/burn_public/7/nonRevertiblePrivateInsertionsUs",
            "value": 2384.79499999994,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/burn_public/7/revertiblePrivateInsertionsUs",
            "value": 849.8599999998078,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/8/totalInstructionsExecuted",
            "value": 580,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/8/totalDurationMs",
            "value": 49.42117499999995,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/8/manaUsed",
            "value": 12138,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/8/txHashMs",
            "value": 21.41973599999983,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/8/nonRevertiblePrivateInsertionsUs",
            "value": 2665.5619999996816,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/8/revertiblePrivateInsertionsUs",
            "value": 970.531999999821,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/0/totalInstructionsExecuted",
            "value": 17262,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/0/totalDurationMs",
            "value": 160.86926600000015,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/0/manaUsed",
            "value": 385938,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/0/txHashMs",
            "value": 21.446516999999858,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/0/nonRevertiblePrivateInsertionsUs",
            "value": 2354.585000000043,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/0/revertiblePrivateInsertionsUs",
            "value": 884.7110000001521,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/1/totalInstructionsExecuted",
            "value": 17262,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/1/totalDurationMs",
            "value": 148.91113899999982,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/1/manaUsed",
            "value": 385938,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/1/txHashMs",
            "value": 21.36627499999986,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/1/nonRevertiblePrivateInsertionsUs",
            "value": 2315.0839999998425,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/1/revertiblePrivateInsertionsUs",
            "value": 1015.2530000000297,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/2/totalInstructionsExecuted",
            "value": 17262,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/2/totalDurationMs",
            "value": 146.80484000000024,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/2/manaUsed",
            "value": 385938,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/2/txHashMs",
            "value": 21.21581100000003,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/2/nonRevertiblePrivateInsertionsUs",
            "value": 2427.345999999943,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/2/revertiblePrivateInsertionsUs",
            "value": 797.4189999999908,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/constructor/3/totalInstructionsExecuted",
            "value": 1729,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/constructor/3/totalDurationMs",
            "value": 85.419848,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/constructor/3/manaUsed",
            "value": 72894,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/constructor/3/txHashMs",
            "value": 21.0747980000001,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/constructor/3/nonRevertiblePrivateInsertionsUs",
            "value": 2179.160000000138,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/constructor/3/revertiblePrivateInsertionsUs",
            "value": 745.1280000000224,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/set_minter/4/totalInstructionsExecuted",
            "value": 611,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/set_minter/4/totalDurationMs",
            "value": 49.16235800000004,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/set_minter/4/manaUsed",
            "value": 19447,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/set_minter/4/txHashMs",
            "value": 21.048897000000125,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/set_minter/4/nonRevertiblePrivateInsertionsUs",
            "value": 2525.858999999855,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/set_minter/4/revertiblePrivateInsertionsUs",
            "value": 806.6179999996166,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/add_liquidity/5/totalInstructionsExecuted",
            "value": 8919,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/add_liquidity/5/totalDurationMs",
            "value": 160.96747799999957,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/add_liquidity/5/manaUsed",
            "value": 250443,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/add_liquidity/5/txHashMs",
            "value": 21.045326999999816,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/add_liquidity/5/nonRevertiblePrivateInsertionsUs",
            "value": 2977.979000000232,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/add_liquidity/5/revertiblePrivateInsertionsUs",
            "value": 712.5369999998838,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/swap_exact_tokens_for_tokens/6/totalInstructionsExecuted",
            "value": 5602,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/swap_exact_tokens_for_tokens/6/totalDurationMs",
            "value": 112.70672099999956,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/swap_exact_tokens_for_tokens/6/manaUsed",
            "value": 141372,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/swap_exact_tokens_for_tokens/6/txHashMs",
            "value": 21.166830000000118,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/swap_exact_tokens_for_tokens/6/nonRevertiblePrivateInsertionsUs",
            "value": 2248.0520000008255,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/swap_exact_tokens_for_tokens/6/revertiblePrivateInsertionsUs",
            "value": 700.2769999999146,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/remove_liquidity/7/totalInstructionsExecuted",
            "value": 9974,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/remove_liquidity/7/totalDurationMs",
            "value": 159.49955500000033,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/remove_liquidity/7/manaUsed",
            "value": 266909,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/remove_liquidity/7/txHashMs",
            "value": 21.460987999999816,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/remove_liquidity/7/nonRevertiblePrivateInsertionsUs",
            "value": 2373.305000000073,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/remove_liquidity/7/revertiblePrivateInsertionsUs",
            "value": 686.9959999994535,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmTest contract tests/AvmTest/bulk_testing/0/totalInstructionsExecuted",
            "value": 25908,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmTest contract tests/AvmTest/bulk_testing/0/totalDurationMs",
            "value": 248.85545400000046,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmTest contract tests/AvmTest/bulk_testing/0/manaUsed",
            "value": 540316,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmTest contract tests/AvmTest/bulk_testing/0/txHashMs",
            "value": 21.27418200000011,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmTest contract tests/AvmTest/bulk_testing/0/nonRevertiblePrivateInsertionsUs",
            "value": 2345.263999999588,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmTest contract tests/AvmTest/bulk_testing/0/revertiblePrivateInsertionsUs",
            "value": 711.9370000000345,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_10/0/totalInstructionsExecuted",
            "value": 5033,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_10/0/totalDurationMs",
            "value": 106.59432899999956,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_10/0/manaUsed",
            "value": 88512,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_10/0/txHashMs",
            "value": 21.18847100000039,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_10/0/nonRevertiblePrivateInsertionsUs",
            "value": 2168.829999999616,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_10/0/revertiblePrivateInsertionsUs",
            "value": 757.4670000003607,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_20/1/totalInstructionsExecuted",
            "value": 5857,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_20/1/totalDurationMs",
            "value": 58.727210000000014,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_20/1/manaUsed",
            "value": 104100,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_20/1/txHashMs",
            "value": 21.16182000000026,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_20/1/nonRevertiblePrivateInsertionsUs",
            "value": 2313.5540000002948,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_20/1/revertiblePrivateInsertionsUs",
            "value": 758.8470000000598,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_30/2/totalInstructionsExecuted",
            "value": 6978,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_30/2/totalDurationMs",
            "value": 62.51431800000046,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_30/2/manaUsed",
            "value": 124476,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_30/2/txHashMs",
            "value": 21.03711800000019,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_30/2/nonRevertiblePrivateInsertionsUs",
            "value": 2228.1810000004043,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_30/2/revertiblePrivateInsertionsUs",
            "value": 631.9539999994959,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_40/3/totalInstructionsExecuted",
            "value": 7951,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_40/3/totalDurationMs",
            "value": 63.509771,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_40/3/manaUsed",
            "value": 142215,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_40/3/txHashMs",
            "value": 21.056148000000576,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_40/3/nonRevertiblePrivateInsertionsUs",
            "value": 2277.552999999898,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_40/3/revertiblePrivateInsertionsUs",
            "value": 689.9759999996604,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_50/4/totalInstructionsExecuted",
            "value": 9074,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_50/4/totalDurationMs",
            "value": 65.84414600000036,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_50/4/manaUsed",
            "value": 162609,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_50/4/txHashMs",
            "value": 21.01982599999974,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_50/4/nonRevertiblePrivateInsertionsUs",
            "value": 2126.328999999714,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_50/4/revertiblePrivateInsertionsUs",
            "value": 632.5340000003052,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_60/5/totalInstructionsExecuted",
            "value": 10361,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_60/5/totalDurationMs",
            "value": 70.7363779999996,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_60/5/manaUsed",
            "value": 185553,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_60/5/txHashMs",
            "value": 21.166510000000017,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_60/5/nonRevertiblePrivateInsertionsUs",
            "value": 2629.120999999941,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_60/5/revertiblePrivateInsertionsUs",
            "value": 811.2689999998111,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_70/6/totalInstructionsExecuted",
            "value": 11987,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_70/6/totalDurationMs",
            "value": 73.6903969999994,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_70/6/manaUsed",
            "value": 215892,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_70/6/txHashMs",
            "value": 21.14436999999998,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_70/6/nonRevertiblePrivateInsertionsUs",
            "value": 2124.249000000418,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_70/6/revertiblePrivateInsertionsUs",
            "value": 665.1449999999386,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_80/7/totalInstructionsExecuted",
            "value": 12987,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_80/7/totalDurationMs",
            "value": 76.60684399999991,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_80/7/manaUsed",
            "value": 234249,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_80/7/txHashMs",
            "value": 20.98465600000054,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_80/7/nonRevertiblePrivateInsertionsUs",
            "value": 2589.509999999791,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_80/7/revertiblePrivateInsertionsUs",
            "value": 686.5060000000085,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_90/8/totalInstructionsExecuted",
            "value": 14140,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_90/8/totalDurationMs",
            "value": 81.7450630000003,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_90/8/manaUsed",
            "value": 255318,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_90/8/txHashMs",
            "value": 21.352543999999398,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_90/8/nonRevertiblePrivateInsertionsUs",
            "value": 2143.9589999999953,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_90/8/revertiblePrivateInsertionsUs",
            "value": 688.4159999999611,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_100/9/totalInstructionsExecuted",
            "value": 15140,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_100/9/totalDurationMs",
            "value": 79.632654,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_100/9/manaUsed",
            "value": 273675,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_100/9/txHashMs",
            "value": 21.04516700000022,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_100/9/nonRevertiblePrivateInsertionsUs",
            "value": 2095.2380000007906,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_100/9/revertiblePrivateInsertionsUs",
            "value": 617.7939999997761,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_255/10/totalInstructionsExecuted",
            "value": 33218,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_255/10/totalDurationMs",
            "value": 127.24537700000019,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_255/10/manaUsed",
            "value": 602967,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_255/10/txHashMs",
            "value": 21.269952999999987,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_255/10/nonRevertiblePrivateInsertionsUs",
            "value": 2174.5700000001307,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_255/10/revertiblePrivateInsertionsUs",
            "value": 637.4740000001111,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_256/11/totalInstructionsExecuted",
            "value": 33313,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_256/11/totalDurationMs",
            "value": 127.94493299999976,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_256/11/manaUsed",
            "value": 605454,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_256/11/txHashMs",
            "value": 21.292602999999872,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_256/11/nonRevertiblePrivateInsertionsUs",
            "value": 2556.1390000002575,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_256/11/revertiblePrivateInsertionsUs",
            "value": 660.1149999996778,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_511/12/totalInstructionsExecuted",
            "value": 62965,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_511/12/totalDurationMs",
            "value": 199.79926800000067,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_511/12/manaUsed",
            "value": 1145424,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_511/12/txHashMs",
            "value": 21.18137999999999,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_511/12/nonRevertiblePrivateInsertionsUs",
            "value": 2139.489000001049,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_511/12/revertiblePrivateInsertionsUs",
            "value": 589.5239999990736,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_512/13/totalInstructionsExecuted",
            "value": 62918,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_512/13/totalDurationMs",
            "value": 202.36504699999932,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_512/13/manaUsed",
            "value": 1145871,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_512/13/txHashMs",
            "value": 21.246721999999863,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_512/13/nonRevertiblePrivateInsertionsUs",
            "value": 2160.2399999992485,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_512/13/revertiblePrivateInsertionsUs",
            "value": 679.6050000011746,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_2048/14/totalInstructionsExecuted",
            "value": 240570,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_2048/14/totalDurationMs",
            "value": 648.0927709999996,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_2048/14/manaUsed",
            "value": 4389303,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_2048/14/txHashMs",
            "value": 21.43675699999949,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_2048/14/nonRevertiblePrivateInsertionsUs",
            "value": 2453.8069999998697,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_2048/14/revertiblePrivateInsertionsUs",
            "value": 715.2659999992466,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_hash/15/totalInstructionsExecuted",
            "value": 9484,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_hash/15/totalDurationMs",
            "value": 67.31865899999866,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_hash/15/manaUsed",
            "value": 175077,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_hash/15/txHashMs",
            "value": 21.30137400000058,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_hash/15/nonRevertiblePrivateInsertionsUs",
            "value": 2411.9860000009794,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_hash/15/revertiblePrivateInsertionsUs",
            "value": 643.8349999989441,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_f1600/16/totalInstructionsExecuted",
            "value": 3079,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_f1600/16/totalDurationMs",
            "value": 49.45986600000106,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_f1600/16/manaUsed",
            "value": 54405,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_f1600/16/txHashMs",
            "value": 21.21252099999947,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_f1600/16/nonRevertiblePrivateInsertionsUs",
            "value": 2151.0099999995873,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_f1600/16/revertiblePrivateInsertionsUs",
            "value": 647.9450000006182,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/poseidon2_hash/17/totalInstructionsExecuted",
            "value": 2207,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/poseidon2_hash/17/totalDurationMs",
            "value": 49.54791699999987,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/poseidon2_hash/17/manaUsed",
            "value": 38118,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/poseidon2_hash/17/txHashMs",
            "value": 21.386156000000483,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/poseidon2_hash/17/nonRevertiblePrivateInsertionsUs",
            "value": 2021.4370000012423,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/poseidon2_hash/17/revertiblePrivateInsertionsUs",
            "value": 692.1160000001692,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash/18/totalInstructionsExecuted",
            "value": 22939,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash/18/totalDurationMs",
            "value": 378.9697780000006,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash/18/manaUsed",
            "value": 603243,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash/18/txHashMs",
            "value": 21.099467999998524,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash/18/nonRevertiblePrivateInsertionsUs",
            "value": 2032.7870000000985,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash/18/revertiblePrivateInsertionsUs",
            "value": 644.0249999996013,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash_with_index/19/totalInstructionsExecuted",
            "value": 22894,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash_with_index/19/totalDurationMs",
            "value": 333.36906199999976,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash_with_index/19/manaUsed",
            "value": 600897,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash_with_index/19/txHashMs",
            "value": 21.14020000000164,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash_with_index/19/nonRevertiblePrivateInsertionsUs",
            "value": 2168.7199999996665,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash_with_index/19/revertiblePrivateInsertionsUs",
            "value": 636.0050000002957,
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
            "value": 211922,
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
            "value": 156800,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_4_4_4_4_4_4_4_4_4_opcodes",
            "value": 27176,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_4_4_4_4_4_4_4_4_4_gates",
            "value": 101130,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_base_public_opcodes",
            "value": 209839,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_base_public_gates",
            "value": 4526489,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_64_64_4_opcodes",
            "value": 37207,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_64_64_4_gates",
            "value": 170089,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_64_4_4_opcodes",
            "value": 32050,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_64_4_4_gates",
            "value": 119795,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_64_4_32_opcodes",
            "value": 41042,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_64_4_32_gates",
            "value": 210431,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_64_4_4_opcodes",
            "value": 38513,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_64_4_4_gates",
            "value": 205611,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_4_64_32_opcodes",
            "value": 40381,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_4_64_32_gates",
            "value": 200783,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_4_4_4_opcodes",
            "value": 32695,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_4_4_4_gates",
            "value": 145669,
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
            "value": 150490,
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
            "value": 151980,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_block_root_empty_opcodes",
            "value": 6403,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_block_root_empty_gates",
            "value": 708324,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_4_64_4_opcodes",
            "value": 34749,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_4_64_4_gates",
            "value": 154130,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_block_root_single_tx_opcodes",
            "value": 876814,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_block_root_single_tx_gates",
            "value": 3893724,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_32_32_32_32_32_32_32_32_opcodes",
            "value": 52340,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_32_32_32_32_32_32_32_32_gates",
            "value": 348148,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_4_4_4_opcodes",
            "value": 36055,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_4_4_4_gates",
            "value": 189652,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_4_64_32_opcodes",
            "value": 37278,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_4_64_32_gates",
            "value": 158950,
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
            "value": 147819,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_16_16_16_16_16_16_16_16_16_opcodes",
            "value": 37971,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_16_16_16_16_16_16_16_16_16_gates",
            "value": 207004,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_4_4_32_opcodes",
            "value": 32121,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_4_4_32_gates",
            "value": 108657,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_4_4_4_opcodes",
            "value": 29592,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_4_4_4_gates",
            "value": 103836,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_64_64_4_opcodes",
            "value": 33847,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_64_64_4_gates",
            "value": 126106,
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
            "value": 271420,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_base_private_gates",
            "value": 1895471,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_0_0_0_0_0_64_0_0_0_opcodes",
            "value": 20822,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_0_0_0_0_0_64_0_0_0_gates",
            "value": 56709,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_4_64_32_opcodes",
            "value": 33918,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_4_64_32_gates",
            "value": 114967,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_64_4_32_opcodes",
            "value": 34579,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_64_4_32_gates",
            "value": 124615,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_4_64_4_opcodes",
            "value": 37852,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_4_64_4_gates",
            "value": 195963,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_4_4_32_opcodes",
            "value": 38584,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_4_4_32_gates",
            "value": 194473,
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
            "value": 130926,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_opcodes",
            "value": 78051,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_gates",
            "value": 625445,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_block_root_opcodes",
            "value": 878258,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_block_root_gates",
            "value": 4690087,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_64_4_4_opcodes",
            "value": 35410,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_64_4_4_gates",
            "value": 163778,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_64_64_4_opcodes",
            "value": 36950,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_64_64_4_gates",
            "value": 167939,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_64_64_32_opcodes",
            "value": 39736,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_64_64_32_gates",
            "value": 174909,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_64_4_32_opcodes",
            "value": 37682,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_64_4_32_gates",
            "value": 166448,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_4_64_4_opcodes",
            "value": 31389,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_4_64_4_gates",
            "value": 110147,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_4_4_32_opcodes",
            "value": 35481,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_4_4_32_gates",
            "value": 152640,
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
            "value": 1726,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_merge_gates",
            "value": 1463557,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_64_4_32_opcodes",
            "value": 37939,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_64_4_32_gates",
            "value": 168598,
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
            "value": 161628,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_64_64_32_opcodes",
            "value": 39479,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_64_64_32_gates",
            "value": 172759,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_64_64_32_opcodes",
            "value": 42839,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_64_64_32_gates",
            "value": 216742,
            "unit": "gates"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "name": "Aztec Bot",
            "username": "AztecBot",
            "email": "49558828+AztecBot@users.noreply.github.com"
          },
          "committer": {
            "name": "GitHub",
            "username": "web-flow",
            "email": "noreply@github.com"
          },
          "id": "e29adbe719a4b8e28b9296664b481f1a20e7d0da",
          "message": "chore: Bump Noir reference (#14403)\n\nAutomated pull of nightly from the\n[noir](https://github.com/noir-lang/noir) programming language, a\ndependency of Aztec.\nBEGIN_COMMIT_OVERRIDE\nfix(licm): Account for nested loops being control dependent when\nanalyzing outer loops (https://github.com/noir-lang/noir/pull/8593)\nchore(refactor): Switch unreachable function removal to use centralized\ncall graph (https://github.com/noir-lang/noir/pull/8578)\nchore(test): Allow lambdas in fuzzing\n(https://github.com/noir-lang/noir/pull/8584)\nchore: use insta for execution_success stdout\n(https://github.com/noir-lang/noir/pull/8576)\nchore: use generator instead of zero for ec-add predicate\n(https://github.com/noir-lang/noir/pull/8552)\nfix: use predicate expression as binary result\n(https://github.com/noir-lang/noir/pull/8583)\nfix(ssa): Do not generate apply functions when no lambda variants exist\n(https://github.com/noir-lang/noir/pull/8573)\nchore: put `nargo expand` snapshosts in the same directory\n(https://github.com/noir-lang/noir/pull/8577)\nchore: Use FxHashMap for TypeBindings\n(https://github.com/noir-lang/noir/pull/8574)\nchore(experimental): use larger stack size for parsing\n(https://github.com/noir-lang/noir/pull/8347)\nchore: use insta snapshots for compile_failure stderr\n(https://github.com/noir-lang/noir/pull/8569)\nchore(inlining): Mark functions with <= 10 instructions and no control\nflow as inline always (https://github.com/noir-lang/noir/pull/8533)\nchore(ssa): Add weighted edges to call graph, move callers and callees\nmethods to call graph (https://github.com/noir-lang/noir/pull/8513)\nfix(frontend): Override to allow empty array input\n(https://github.com/noir-lang/noir/pull/8568)\nfix: avoid logging all unused params in DIE pass\n(https://github.com/noir-lang/noir/pull/8566)\nchore: bump external pinned commits\n(https://github.com/noir-lang/noir/pull/8562)\nchore(deps): bump base-x from 3.0.9 to 3.0.11\n(https://github.com/noir-lang/noir/pull/8555)\nchore(fuzz): Call function pointers\n(https://github.com/noir-lang/noir/pull/8531)\nfeat: C++ codegen for msgpack\n(https://github.com/noir-lang/noir/pull/7716)\nfeat(performance): brillig array set optimization\n(https://github.com/noir-lang/noir/pull/8550)\nchore(fuzz): AST fuzzer to use function valued arguments (Part 1)\n(https://github.com/noir-lang/noir/pull/8514)\nfix(licm): Check whether the loop is executed when hoisting with a\npredicate (https://github.com/noir-lang/noir/pull/8546)\nfeat: Implement $crate (https://github.com/noir-lang/noir/pull/8537)\nfix: add offset to ArrayGet\n(https://github.com/noir-lang/noir/pull/8536)\nchore: remove some unused enum variants and functions\n(https://github.com/noir-lang/noir/pull/8538)\nfix: disallow `()` in entry points\n(https://github.com/noir-lang/noir/pull/8529)\nchore: Remove println in ssa interpreter\n(https://github.com/noir-lang/noir/pull/8528)\nfix: don't overflow when casting signed value to u128\n(https://github.com/noir-lang/noir/pull/8526)\nchore(performance): Enable hoisting pure with predicate calls\n(https://github.com/noir-lang/noir/pull/8522)\nfeat(fuzz): AST fuzzing with SSA interpreter\n(https://github.com/noir-lang/noir/pull/8436)\nchore: Add u1 ops to interpreter, convert Value panics to errors\n(https://github.com/noir-lang/noir/pull/8469)\nchore: Release Noir(1.0.0-beta.6)\n(https://github.com/noir-lang/noir/pull/8438)\nchore(fuzz): AST generator to add `ctx_limit` to all functions\n(https://github.com/noir-lang/noir/pull/8507)\nfix(inlining): Use centralized CallGraph structure for inline info\ncomputation (https://github.com/noir-lang/noir/pull/8489)\nfix: remove private builtins from `Field` impl\n(https://github.com/noir-lang/noir/pull/8496)\nfeat: primitive types are no longer keywords\n(https://github.com/noir-lang/noir/pull/8470)\nfix: parenthesized pattern, and correct 1-element tuple printing\n(https://github.com/noir-lang/noir/pull/8482)\nfix: fix visibility of methods in `std::meta`\n(https://github.com/noir-lang/noir/pull/8497)\nfix: Change `can_be_main` to be recursive\n(https://github.com/noir-lang/noir/pull/8501)\nchore: add SSA interpreter test for higher order functions\n(https://github.com/noir-lang/noir/pull/8486)\nfix(frontend)!: Ban zero sized arrays and strings as program input\n(https://github.com/noir-lang/noir/pull/8491)\nfix!: remove `to_be_radix` and `to_le_radix` from stdlib interface\n(https://github.com/noir-lang/noir/pull/8495)\nEND_COMMIT_OVERRIDE\n\n---------\n\nCo-authored-by: AztecBot <tech@aztecprotocol.com>\nCo-authored-by: Tom French <15848336+TomAFrench@users.noreply.github.com>",
          "timestamp": "2025-05-22T15:00:44Z",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e29adbe719a4b8e28b9296664b481f1a20e7d0da"
        },
        "date": 1747928672359,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "barretenberg/cpp/bb-micro-bench/wasm/ultra_honk",
            "value": 8249.500431999999,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/bb-micro-bench/wasm/client_ivc",
            "value": 58959.378826,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/bb-micro-bench/native/ultra_honk",
            "value": 3450.586497000131,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/bb-micro-bench/native/client_ivc",
            "value": 22712.131548999878,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/bb-micro-bench/native/client_ivc_17_in_20",
            "value": 18177.200879999873,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+sponsored_fpc/wasm/seconds",
            "value": 44363,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+sponsored_fpc/wasm/memory",
            "value": 993,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+sponsored_fpc/native/seconds",
            "value": 16544,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+sponsored_fpc/native/memory",
            "value": 989,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/schnorr+deploy_tokenContract_no_registration+sponsored_fpc/wasm/seconds",
            "value": 41160,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/schnorr+deploy_tokenContract_no_registration+sponsored_fpc/wasm/memory",
            "value": 1124,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/schnorr+deploy_tokenContract_no_registration+sponsored_fpc/native/seconds",
            "value": 15407,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/schnorr+deploy_tokenContract_no_registration+sponsored_fpc/native/memory",
            "value": 1084,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+sponsored_fpc/wasm/seconds",
            "value": 39214,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+sponsored_fpc/wasm/memory",
            "value": 1043,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+sponsored_fpc/native/seconds",
            "value": 14582,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+sponsored_fpc/native/memory",
            "value": 996,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+token_bridge_claim_private+sponsored_fpc/wasm/seconds",
            "value": 45478,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+token_bridge_claim_private+sponsored_fpc/wasm/memory",
            "value": 1104,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+token_bridge_claim_private+sponsored_fpc/native/seconds",
            "value": 17137,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+token_bridge_claim_private+sponsored_fpc/native/memory",
            "value": 1046,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+private_fpc/wasm/seconds",
            "value": 69104,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+private_fpc/wasm/memory",
            "value": 1295,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+private_fpc/native/seconds",
            "value": 25807,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+private_fpc/native/memory",
            "value": 1237,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc/wasm/seconds",
            "value": 91717,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc/wasm/memory",
            "value": 1783,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc/native/seconds",
            "value": 31979,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc/native/memory",
            "value": 1282,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc/wasm/seconds",
            "value": 71088,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc/wasm/memory",
            "value": 2846,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc/native/seconds",
            "value": 24747,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc/native/memory",
            "value": 2045,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+private_fpc/wasm/seconds",
            "value": 59938,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+private_fpc/wasm/memory",
            "value": 1059,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+private_fpc/native/seconds",
            "value": 22348,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+private_fpc/native/memory",
            "value": 1133,
            "unit": "MB"
          },
          {
            "name": "barretenberg/acir_tests/ultra_honk_rec_wasm_memory",
            "value": 2.19,
            "unit": "MiB"
          },
          {
            "name": "yarn-project/end-to-end/Sequencer/aztec.sequencer.block.build_duration",
            "value": 6614,
            "unit": "ms"
          },
          {
            "name": "yarn-project/end-to-end/Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.18933276483015146,
            "unit": "us/mana"
          },
          {
            "name": "yarn-project/end-to-end/Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 99446,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/constructor/0/totalInstructionsExecuted",
            "value": 17262,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/constructor/0/totalDurationMs",
            "value": 205.14405099999976,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/constructor/0/manaUsed",
            "value": 385938,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/constructor/0/txHashMs",
            "value": 24.40434600000026,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/constructor/0/nonRevertiblePrivateInsertionsUs",
            "value": 4831.90599999989,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/constructor/0/revertiblePrivateInsertionsUs",
            "value": 2323.649999999816,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/mint_to_public/1/totalInstructionsExecuted",
            "value": 1363,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/mint_to_public/1/totalDurationMs",
            "value": 69.11774300000025,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/mint_to_public/1/manaUsed",
            "value": 41750,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/mint_to_public/1/txHashMs",
            "value": 22.060244999999668,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/mint_to_public/1/nonRevertiblePrivateInsertionsUs",
            "value": 3545.63300000018,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/mint_to_public/1/revertiblePrivateInsertionsUs",
            "value": 934.704000000238,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/2/totalInstructionsExecuted",
            "value": 580,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/2/totalDurationMs",
            "value": 53.653649000000314,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/2/manaUsed",
            "value": 12138,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/2/txHashMs",
            "value": 21.354697000000215,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/2/nonRevertiblePrivateInsertionsUs",
            "value": 2537.5560000002224,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/2/revertiblePrivateInsertionsUs",
            "value": 925.9940000001734,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/transfer_in_public/3/totalInstructionsExecuted",
            "value": 1800,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/transfer_in_public/3/totalDurationMs",
            "value": 57.39551699999993,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/transfer_in_public/3/manaUsed",
            "value": 47660,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/transfer_in_public/3/txHashMs",
            "value": 21.11180099999956,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/transfer_in_public/3/nonRevertiblePrivateInsertionsUs",
            "value": 2190.7069999997475,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/transfer_in_public/3/revertiblePrivateInsertionsUs",
            "value": 843.5119999999188,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/4/totalInstructionsExecuted",
            "value": 580,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/4/totalDurationMs",
            "value": 49.758988000000045,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/4/manaUsed",
            "value": 12138,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/4/txHashMs",
            "value": 21.19695300000012,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/4/nonRevertiblePrivateInsertionsUs",
            "value": 2796.1629999999786,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/4/revertiblePrivateInsertionsUs",
            "value": 931.1850000003687,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/5/totalInstructionsExecuted",
            "value": 580,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/5/totalDurationMs",
            "value": 47.34448500000008,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/5/manaUsed",
            "value": 12138,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/5/txHashMs",
            "value": 21.13966100000016,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/5/nonRevertiblePrivateInsertionsUs",
            "value": 2297.109999999975,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/5/revertiblePrivateInsertionsUs",
            "value": 788.3310000001984,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/6/totalInstructionsExecuted",
            "value": 580,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/6/totalDurationMs",
            "value": 46.74937,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/6/manaUsed",
            "value": 12138,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/6/txHashMs",
            "value": 21.06135899999981,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/6/nonRevertiblePrivateInsertionsUs",
            "value": 2059.8140000001877,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/6/revertiblePrivateInsertionsUs",
            "value": 1375.235999999859,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/burn_public/7/totalInstructionsExecuted",
            "value": 1040,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/burn_public/7/totalDurationMs",
            "value": 56.46427300000005,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/burn_public/7/manaUsed",
            "value": 34865,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/burn_public/7/txHashMs",
            "value": 21.377277999999933,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/burn_public/7/nonRevertiblePrivateInsertionsUs",
            "value": 2432.92399999973,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/burn_public/7/revertiblePrivateInsertionsUs",
            "value": 853.3619999998336,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/8/totalInstructionsExecuted",
            "value": 580,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/8/totalDurationMs",
            "value": 48.30583999999999,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/8/manaUsed",
            "value": 12138,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/8/txHashMs",
            "value": 21.384267999999793,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/8/nonRevertiblePrivateInsertionsUs",
            "value": 2325.560000000223,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/8/revertiblePrivateInsertionsUs",
            "value": 861.3920000002508,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/0/totalInstructionsExecuted",
            "value": 17262,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/0/totalDurationMs",
            "value": 157.31318299999975,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/0/manaUsed",
            "value": 385938,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/0/txHashMs",
            "value": 21.36628699999983,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/0/nonRevertiblePrivateInsertionsUs",
            "value": 2202.9270000002725,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/0/revertiblePrivateInsertionsUs",
            "value": 877.3729999998068,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/1/totalInstructionsExecuted",
            "value": 17262,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/1/totalDurationMs",
            "value": 146.20342300000038,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/1/manaUsed",
            "value": 385938,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/1/txHashMs",
            "value": 21.0523790000002,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/1/nonRevertiblePrivateInsertionsUs",
            "value": 2330.221000000165,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/1/revertiblePrivateInsertionsUs",
            "value": 935.1339999998345,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/2/totalInstructionsExecuted",
            "value": 17262,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/2/totalDurationMs",
            "value": 144.6166519999997,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/2/manaUsed",
            "value": 385938,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/2/txHashMs",
            "value": 21.122491000000082,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/2/nonRevertiblePrivateInsertionsUs",
            "value": 2411.8130000001656,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/2/revertiblePrivateInsertionsUs",
            "value": 791.3699999999153,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/constructor/3/totalInstructionsExecuted",
            "value": 1729,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/constructor/3/totalDurationMs",
            "value": 84.40181100000018,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/constructor/3/manaUsed",
            "value": 72894,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/constructor/3/txHashMs",
            "value": 21.042009000000235,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/constructor/3/nonRevertiblePrivateInsertionsUs",
            "value": 2157.0459999998093,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/constructor/3/revertiblePrivateInsertionsUs",
            "value": 764.2489999998361,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/set_minter/4/totalInstructionsExecuted",
            "value": 611,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/set_minter/4/totalDurationMs",
            "value": 51.23294699999997,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/set_minter/4/manaUsed",
            "value": 19447,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/set_minter/4/txHashMs",
            "value": 20.971926000000167,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/set_minter/4/nonRevertiblePrivateInsertionsUs",
            "value": 2153.766999999789,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/set_minter/4/revertiblePrivateInsertionsUs",
            "value": 3761.7780000000494,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/add_liquidity/5/totalInstructionsExecuted",
            "value": 8919,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/add_liquidity/5/totalDurationMs",
            "value": 162.95437999999967,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/add_liquidity/5/manaUsed",
            "value": 250443,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/add_liquidity/5/txHashMs",
            "value": 21.077139999999872,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/add_liquidity/5/nonRevertiblePrivateInsertionsUs",
            "value": 3078.140000000076,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/add_liquidity/5/revertiblePrivateInsertionsUs",
            "value": 745.5899999999929,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/swap_exact_tokens_for_tokens/6/totalInstructionsExecuted",
            "value": 5602,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/swap_exact_tokens_for_tokens/6/totalDurationMs",
            "value": 110.28928600000017,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/swap_exact_tokens_for_tokens/6/manaUsed",
            "value": 141372,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/swap_exact_tokens_for_tokens/6/txHashMs",
            "value": 20.959846000000653,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/swap_exact_tokens_for_tokens/6/nonRevertiblePrivateInsertionsUs",
            "value": 2038.1729999999152,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/swap_exact_tokens_for_tokens/6/revertiblePrivateInsertionsUs",
            "value": 665.6969999994544,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/remove_liquidity/7/totalInstructionsExecuted",
            "value": 9974,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/remove_liquidity/7/totalDurationMs",
            "value": 157.02444599999944,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/remove_liquidity/7/manaUsed",
            "value": 266909,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/remove_liquidity/7/txHashMs",
            "value": 21.098869999999806,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/remove_liquidity/7/nonRevertiblePrivateInsertionsUs",
            "value": 2176.8369999999777,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/remove_liquidity/7/revertiblePrivateInsertionsUs",
            "value": 736.6890000002968,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmTest contract tests/AvmTest/bulk_testing/0/totalInstructionsExecuted",
            "value": 25908,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmTest contract tests/AvmTest/bulk_testing/0/totalDurationMs",
            "value": 248.6036949999998,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmTest contract tests/AvmTest/bulk_testing/0/manaUsed",
            "value": 540316,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmTest contract tests/AvmTest/bulk_testing/0/txHashMs",
            "value": 21.063629999999648,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmTest contract tests/AvmTest/bulk_testing/0/nonRevertiblePrivateInsertionsUs",
            "value": 2204.026999999769,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmTest contract tests/AvmTest/bulk_testing/0/revertiblePrivateInsertionsUs",
            "value": 718.8689999993585,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_10/0/totalInstructionsExecuted",
            "value": 5033,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_10/0/totalDurationMs",
            "value": 103.89109999999982,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_10/0/manaUsed",
            "value": 88512,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_10/0/txHashMs",
            "value": 21.119101000000228,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_10/0/nonRevertiblePrivateInsertionsUs",
            "value": 2156.136000000515,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_10/0/revertiblePrivateInsertionsUs",
            "value": 744.9200000000928,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_20/1/totalInstructionsExecuted",
            "value": 5857,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_20/1/totalDurationMs",
            "value": 57.59855299999981,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_20/1/manaUsed",
            "value": 104100,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_20/1/txHashMs",
            "value": 21.111680999999408,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_20/1/nonRevertiblePrivateInsertionsUs",
            "value": 2270.658999999796,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_20/1/revertiblePrivateInsertionsUs",
            "value": 645.8970000003319,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_30/2/totalInstructionsExecuted",
            "value": 6978,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_30/2/totalDurationMs",
            "value": 60.368954000000485,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_30/2/manaUsed",
            "value": 124476,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_30/2/txHashMs",
            "value": 21.050468999999794,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_30/2/nonRevertiblePrivateInsertionsUs",
            "value": 2050.673000000643,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_30/2/revertiblePrivateInsertionsUs",
            "value": 715.7790000001114,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_40/3/totalInstructionsExecuted",
            "value": 7951,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_40/3/totalDurationMs",
            "value": 62.590863000000354,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_40/3/manaUsed",
            "value": 142215,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_40/3/txHashMs",
            "value": 20.963246999999683,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_40/3/nonRevertiblePrivateInsertionsUs",
            "value": 2190.4670000003534,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_40/3/revertiblePrivateInsertionsUs",
            "value": 729.4690000007904,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_50/4/totalInstructionsExecuted",
            "value": 9074,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_50/4/totalDurationMs",
            "value": 64.91943300000003,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_50/4/manaUsed",
            "value": 162609,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_50/4/txHashMs",
            "value": 21.072000000000116,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_50/4/nonRevertiblePrivateInsertionsUs",
            "value": 2103.9849999997386,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_50/4/revertiblePrivateInsertionsUs",
            "value": 672.7569999993648,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_60/5/totalInstructionsExecuted",
            "value": 10361,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_60/5/totalDurationMs",
            "value": 67.78349799999978,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_60/5/manaUsed",
            "value": 185553,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_60/5/txHashMs",
            "value": 21.102679999999964,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_60/5/nonRevertiblePrivateInsertionsUs",
            "value": 2353.0620000001363,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_60/5/revertiblePrivateInsertionsUs",
            "value": 733.0289999999877,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_70/6/totalInstructionsExecuted",
            "value": 11987,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_70/6/totalDurationMs",
            "value": 72.19701400000031,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_70/6/manaUsed",
            "value": 215892,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_70/6/txHashMs",
            "value": 21.10389099999975,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_70/6/nonRevertiblePrivateInsertionsUs",
            "value": 2311.061000000336,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_70/6/revertiblePrivateInsertionsUs",
            "value": 674.4870000002265,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_80/7/totalInstructionsExecuted",
            "value": 12987,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_80/7/totalDurationMs",
            "value": 75.69695500000034,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_80/7/manaUsed",
            "value": 234249,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_80/7/txHashMs",
            "value": 21.483941000000414,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_80/7/nonRevertiblePrivateInsertionsUs",
            "value": 2627.0180000001346,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_80/7/revertiblePrivateInsertionsUs",
            "value": 665.5769999997574,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_90/8/totalInstructionsExecuted",
            "value": 14140,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_90/8/totalDurationMs",
            "value": 77.67621599999984,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_90/8/manaUsed",
            "value": 255318,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_90/8/txHashMs",
            "value": 21.117040999999517,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_90/8/nonRevertiblePrivateInsertionsUs",
            "value": 2388.4720000005473,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_90/8/revertiblePrivateInsertionsUs",
            "value": 703.099000000293,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_100/9/totalInstructionsExecuted",
            "value": 15140,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_100/9/totalDurationMs",
            "value": 80.03972799999974,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_100/9/manaUsed",
            "value": 273675,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_100/9/txHashMs",
            "value": 21.22913400000016,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_100/9/nonRevertiblePrivateInsertionsUs",
            "value": 2166.4959999998246,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_100/9/revertiblePrivateInsertionsUs",
            "value": 666.0270000002129,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_255/10/totalInstructionsExecuted",
            "value": 33218,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_255/10/totalDurationMs",
            "value": 134.09707700000035,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_255/10/manaUsed",
            "value": 602967,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_255/10/txHashMs",
            "value": 20.975107000000207,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_255/10/nonRevertiblePrivateInsertionsUs",
            "value": 2115.805000000364,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_255/10/revertiblePrivateInsertionsUs",
            "value": 688.017999999829,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_256/11/totalInstructionsExecuted",
            "value": 33313,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_256/11/totalDurationMs",
            "value": 130.36565100000007,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_256/11/manaUsed",
            "value": 605454,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_256/11/txHashMs",
            "value": 21.657325000000128,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_256/11/nonRevertiblePrivateInsertionsUs",
            "value": 2373.301999999967,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_256/11/revertiblePrivateInsertionsUs",
            "value": 828.6909999997079,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_511/12/totalInstructionsExecuted",
            "value": 62965,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_511/12/totalDurationMs",
            "value": 191.27432900000167,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_511/12/manaUsed",
            "value": 1145424,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_511/12/txHashMs",
            "value": 21.062409000000116,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_511/12/nonRevertiblePrivateInsertionsUs",
            "value": 2321.9609999996464,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_511/12/revertiblePrivateInsertionsUs",
            "value": 706.888999999137,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_512/13/totalInstructionsExecuted",
            "value": 62918,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_512/13/totalDurationMs",
            "value": 193.3833739999991,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_512/13/manaUsed",
            "value": 1145871,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_512/13/txHashMs",
            "value": 21.184063000000606,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_512/13/nonRevertiblePrivateInsertionsUs",
            "value": 2135.2160000005824,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_512/13/revertiblePrivateInsertionsUs",
            "value": 752.9090000007272,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_2048/14/totalInstructionsExecuted",
            "value": 240570,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_2048/14/totalDurationMs",
            "value": 610.0470019999993,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_2048/14/manaUsed",
            "value": 4389303,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_2048/14/txHashMs",
            "value": 21.120950999998968,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_2048/14/nonRevertiblePrivateInsertionsUs",
            "value": 2054.802999999083,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_2048/14/revertiblePrivateInsertionsUs",
            "value": 641.2359999994806,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_hash/15/totalInstructionsExecuted",
            "value": 9484,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_hash/15/totalDurationMs",
            "value": 65.20629100000042,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_hash/15/manaUsed",
            "value": 175077,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_hash/15/txHashMs",
            "value": 21.082650000000285,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_hash/15/nonRevertiblePrivateInsertionsUs",
            "value": 2054.3830000005983,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_hash/15/revertiblePrivateInsertionsUs",
            "value": 653.4670000000915,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_f1600/16/totalInstructionsExecuted",
            "value": 3079,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_f1600/16/totalDurationMs",
            "value": 48.72533099999964,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_f1600/16/manaUsed",
            "value": 54405,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_f1600/16/txHashMs",
            "value": 21.107270000000426,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_f1600/16/nonRevertiblePrivateInsertionsUs",
            "value": 2565.907000000152,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_f1600/16/revertiblePrivateInsertionsUs",
            "value": 645.846999999776,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/poseidon2_hash/17/totalInstructionsExecuted",
            "value": 2207,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/poseidon2_hash/17/totalDurationMs",
            "value": 49.77856900000006,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/poseidon2_hash/17/manaUsed",
            "value": 38118,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/poseidon2_hash/17/txHashMs",
            "value": 21.07163000000037,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/poseidon2_hash/17/nonRevertiblePrivateInsertionsUs",
            "value": 2406.902999999147,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/poseidon2_hash/17/revertiblePrivateInsertionsUs",
            "value": 733.7590000006458,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash/18/totalInstructionsExecuted",
            "value": 22975,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash/18/totalDurationMs",
            "value": 363.08688099999927,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash/18/manaUsed",
            "value": 605868,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash/18/txHashMs",
            "value": 21.029437999999573,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash/18/nonRevertiblePrivateInsertionsUs",
            "value": 1970.9509999993315,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash/18/revertiblePrivateInsertionsUs",
            "value": 649.6269999988726,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash_with_index/19/totalInstructionsExecuted",
            "value": 22960,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash_with_index/19/totalDurationMs",
            "value": 326.123966000001,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash_with_index/19/manaUsed",
            "value": 605310,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash_with_index/19/txHashMs",
            "value": 21.02588900000046,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash_with_index/19/nonRevertiblePrivateInsertionsUs",
            "value": 2195.1669999998558,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash_with_index/19/revertiblePrivateInsertionsUs",
            "value": 688.3880000004865,
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
            "value": 211922,
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
            "value": 156800,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_4_4_4_4_4_4_4_4_4_opcodes",
            "value": 27176,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_4_4_4_4_4_4_4_4_4_gates",
            "value": 101130,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_base_public_opcodes",
            "value": 209839,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_base_public_gates",
            "value": 4526489,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_64_64_4_opcodes",
            "value": 37207,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_64_64_4_gates",
            "value": 170089,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_64_4_4_opcodes",
            "value": 32050,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_64_4_4_gates",
            "value": 119795,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_64_4_32_opcodes",
            "value": 41042,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_64_4_32_gates",
            "value": 210431,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_64_4_4_opcodes",
            "value": 38513,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_64_4_4_gates",
            "value": 205611,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_4_64_32_opcodes",
            "value": 40381,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_4_64_32_gates",
            "value": 200783,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_4_4_4_opcodes",
            "value": 32695,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_4_4_4_gates",
            "value": 145669,
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
            "value": 150490,
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
            "value": 151980,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_block_root_empty_opcodes",
            "value": 6403,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_block_root_empty_gates",
            "value": 708324,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_4_64_4_opcodes",
            "value": 34749,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_4_64_4_gates",
            "value": 154130,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_block_root_single_tx_opcodes",
            "value": 876814,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_block_root_single_tx_gates",
            "value": 3893724,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_32_32_32_32_32_32_32_32_opcodes",
            "value": 52340,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_32_32_32_32_32_32_32_32_gates",
            "value": 348148,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_4_4_4_opcodes",
            "value": 36055,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_4_4_4_gates",
            "value": 189652,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_4_64_32_opcodes",
            "value": 37278,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_4_64_32_gates",
            "value": 158950,
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
            "value": 147819,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_16_16_16_16_16_16_16_16_16_opcodes",
            "value": 37971,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_16_16_16_16_16_16_16_16_16_gates",
            "value": 207004,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_4_4_32_opcodes",
            "value": 32121,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_4_4_32_gates",
            "value": 108657,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_4_4_4_opcodes",
            "value": 29592,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_4_4_4_gates",
            "value": 103836,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_64_64_4_opcodes",
            "value": 33847,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_64_64_4_gates",
            "value": 126106,
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
            "value": 271420,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_base_private_gates",
            "value": 1895471,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_0_0_0_0_0_64_0_0_0_opcodes",
            "value": 20822,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_0_0_0_0_0_64_0_0_0_gates",
            "value": 56709,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_4_64_32_opcodes",
            "value": 33918,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_4_64_32_gates",
            "value": 114967,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_64_4_32_opcodes",
            "value": 34579,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_64_4_32_gates",
            "value": 124615,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_4_64_4_opcodes",
            "value": 37852,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_4_64_4_gates",
            "value": 195963,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_4_4_32_opcodes",
            "value": 38584,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_4_4_32_gates",
            "value": 194473,
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
            "value": 130926,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_opcodes",
            "value": 78051,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_gates",
            "value": 625445,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_block_root_opcodes",
            "value": 878258,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_block_root_gates",
            "value": 4690087,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_64_4_4_opcodes",
            "value": 35410,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_64_4_4_gates",
            "value": 163778,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_64_64_4_opcodes",
            "value": 36950,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_64_64_4_gates",
            "value": 167939,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_64_64_32_opcodes",
            "value": 39736,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_64_64_32_gates",
            "value": 174909,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_64_4_32_opcodes",
            "value": 37682,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_64_4_32_gates",
            "value": 166448,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_4_64_4_opcodes",
            "value": 31389,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_4_64_4_gates",
            "value": 110147,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_4_4_32_opcodes",
            "value": 35481,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_4_4_32_gates",
            "value": 152640,
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
            "value": 1726,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_merge_gates",
            "value": 1463557,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_64_4_32_opcodes",
            "value": 37939,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_64_4_32_gates",
            "value": 168598,
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
            "value": 161628,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_64_64_32_opcodes",
            "value": 39479,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_64_64_32_gates",
            "value": 172759,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_64_64_32_opcodes",
            "value": 42839,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_64_64_32_gates",
            "value": 216742,
            "unit": "gates"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "name": "Rodrigo Ferreira",
            "username": "raugfer",
            "email": "rodrigo.ferreira@aya.yale.edu"
          },
          "committer": {
            "name": "GitHub",
            "username": "web-flow",
            "email": "noreply@github.com"
          },
          "id": "224b219356f8094853e817d6a00e10b7ae5f887d",
          "message": "feat: Adds StarknetZK WASM bindings to bb.js (#14372)\n\nExposes StarknetZK API in BB and adds WASM bindings for it in bb.js.\n\nThis PR just adds code related to StarknetZK but makes three noticeable\ncorrections to barretenberg/ts/src/barretenberg_api/index.ts regarding\nKeccak/KeccakZK:\n\n1. Removes duplicate declaration of acirProveUltraKeccakZkHonk in the\nBarretenbergApiSync class\n2. Adds missing declaration of acirVerifyUltraKeccakHonk to the\nBarretenbergApiSync class\n3. Replaces suffix ZKHonk by ZkHonk on API method names to conform with\nbindgen.sh's expected output\n\n---------\n\nCo-authored-by: ludamad <adam.domurad@gmail.com>",
          "timestamp": "2025-05-22T15:22:22Z",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/224b219356f8094853e817d6a00e10b7ae5f887d"
        },
        "date": 1747930929779,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "barretenberg/cpp/bb-micro-bench/wasm/ultra_honk",
            "value": 8222.613245,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/bb-micro-bench/wasm/client_ivc",
            "value": 59231.331577,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/bb-micro-bench/native/ultra_honk",
            "value": 3552.274430999887,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/bb-micro-bench/native/client_ivc",
            "value": 22727.236285000115,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/bb-micro-bench/native/client_ivc_17_in_20",
            "value": 18123.25809699996,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+sponsored_fpc/wasm/seconds",
            "value": 44282,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+sponsored_fpc/wasm/memory",
            "value": 1009,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+sponsored_fpc/native/seconds",
            "value": 16495,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+sponsored_fpc/native/memory",
            "value": 995,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/schnorr+deploy_tokenContract_no_registration+sponsored_fpc/wasm/seconds",
            "value": 40795,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/schnorr+deploy_tokenContract_no_registration+sponsored_fpc/wasm/memory",
            "value": 980,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/schnorr+deploy_tokenContract_no_registration+sponsored_fpc/native/seconds",
            "value": 15513,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/schnorr+deploy_tokenContract_no_registration+sponsored_fpc/native/memory",
            "value": 1085,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+sponsored_fpc/wasm/seconds",
            "value": 39150,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+sponsored_fpc/wasm/memory",
            "value": 976,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+sponsored_fpc/native/seconds",
            "value": 14529,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+sponsored_fpc/native/memory",
            "value": 1004,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+token_bridge_claim_private+sponsored_fpc/wasm/seconds",
            "value": 45608,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+token_bridge_claim_private+sponsored_fpc/wasm/memory",
            "value": 1129,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+token_bridge_claim_private+sponsored_fpc/native/seconds",
            "value": 17055,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+token_bridge_claim_private+sponsored_fpc/native/memory",
            "value": 1071,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+private_fpc/wasm/seconds",
            "value": 69511,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+private_fpc/wasm/memory",
            "value": 1332,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+private_fpc/native/seconds",
            "value": 27009,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+private_fpc/native/memory",
            "value": 1234,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc/wasm/seconds",
            "value": 92150,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc/wasm/memory",
            "value": 1874,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc/native/seconds",
            "value": 31856,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc/native/memory",
            "value": 1292,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc/wasm/seconds",
            "value": 71682,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc/wasm/memory",
            "value": 2810,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc/native/seconds",
            "value": 24600,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc/native/memory",
            "value": 2055,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+private_fpc/wasm/seconds",
            "value": 60356,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+private_fpc/wasm/memory",
            "value": 1113,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+private_fpc/native/seconds",
            "value": 22630,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+private_fpc/native/memory",
            "value": 1178,
            "unit": "MB"
          },
          {
            "name": "barretenberg/acir_tests/ultra_honk_rec_wasm_memory",
            "value": 2.19,
            "unit": "MiB"
          },
          {
            "name": "yarn-project/end-to-end/Sequencer/aztec.sequencer.block.build_duration",
            "value": 6697,
            "unit": "ms"
          },
          {
            "name": "yarn-project/end-to-end/Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.1917084926670543,
            "unit": "us/mana"
          },
          {
            "name": "yarn-project/end-to-end/Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 98683,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/constructor/0/totalInstructionsExecuted",
            "value": 17011,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/constructor/0/totalDurationMs",
            "value": 211.420709,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/constructor/0/manaUsed",
            "value": 381879,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/constructor/0/txHashMs",
            "value": 26.63892999999962,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/constructor/0/nonRevertiblePrivateInsertionsUs",
            "value": 4820.782000000236,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/constructor/0/revertiblePrivateInsertionsUs",
            "value": 2222.131999999874,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/mint_to_public/1/totalInstructionsExecuted",
            "value": 1461,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/mint_to_public/1/totalDurationMs",
            "value": 74.73488700000007,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/mint_to_public/1/manaUsed",
            "value": 42698,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/mint_to_public/1/txHashMs",
            "value": 22.114732000000004,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/mint_to_public/1/nonRevertiblePrivateInsertionsUs",
            "value": 3822.68299999987,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/mint_to_public/1/revertiblePrivateInsertionsUs",
            "value": 954.258000000209,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/2/totalInstructionsExecuted",
            "value": 612,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/2/totalDurationMs",
            "value": 56.502950000000055,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/2/manaUsed",
            "value": 12384,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/2/txHashMs",
            "value": 21.391728000000057,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/2/nonRevertiblePrivateInsertionsUs",
            "value": 2429.6370000001843,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/2/revertiblePrivateInsertionsUs",
            "value": 917.9469999999128,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/transfer_in_public/3/totalInstructionsExecuted",
            "value": 1907,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/transfer_in_public/3/totalDurationMs",
            "value": 61.77999,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/transfer_in_public/3/manaUsed",
            "value": 48632,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/transfer_in_public/3/txHashMs",
            "value": 21.259746000000177,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/transfer_in_public/3/nonRevertiblePrivateInsertionsUs",
            "value": 2493.0480000002717,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/transfer_in_public/3/revertiblePrivateInsertionsUs",
            "value": 929.5379999998659,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/4/totalInstructionsExecuted",
            "value": 612,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/4/totalDurationMs",
            "value": 48.65034999999989,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/4/manaUsed",
            "value": 12384,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/4/txHashMs",
            "value": 21.243326000000252,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/4/nonRevertiblePrivateInsertionsUs",
            "value": 2200.2219999999397,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/4/revertiblePrivateInsertionsUs",
            "value": 902.2469999999885,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/5/totalInstructionsExecuted",
            "value": 612,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/5/totalDurationMs",
            "value": 48.62930899999992,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/5/manaUsed",
            "value": 12384,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/5/txHashMs",
            "value": 21.30780700000014,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/5/nonRevertiblePrivateInsertionsUs",
            "value": 2335.3039999997236,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/5/revertiblePrivateInsertionsUs",
            "value": 789.9349999997867,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/6/totalInstructionsExecuted",
            "value": 612,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/6/totalDurationMs",
            "value": 47.648321000000124,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/6/manaUsed",
            "value": 12384,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/6/txHashMs",
            "value": 21.168624999999793,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/6/nonRevertiblePrivateInsertionsUs",
            "value": 2319.173999999748,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/6/revertiblePrivateInsertionsUs",
            "value": 1590.961000000334,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/burn_public/7/totalInstructionsExecuted",
            "value": 1133,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/burn_public/7/totalDurationMs",
            "value": 61.022645999999895,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/burn_public/7/manaUsed",
            "value": 35852,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/burn_public/7/txHashMs",
            "value": 21.234306000000288,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/burn_public/7/nonRevertiblePrivateInsertionsUs",
            "value": 2659.611000000041,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/burn_public/7/revertiblePrivateInsertionsUs",
            "value": 834.3359999998938,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/8/totalInstructionsExecuted",
            "value": 612,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/8/totalDurationMs",
            "value": 48.665140000000065,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/8/manaUsed",
            "value": 12384,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/8/txHashMs",
            "value": 21.600602999999865,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/8/nonRevertiblePrivateInsertionsUs",
            "value": 2458.227000000079,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/8/revertiblePrivateInsertionsUs",
            "value": 954.4989999999416,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/0/totalInstructionsExecuted",
            "value": 17011,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/0/totalDurationMs",
            "value": 155.10516400000006,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/0/manaUsed",
            "value": 381879,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/0/txHashMs",
            "value": 21.45851999999968,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/0/nonRevertiblePrivateInsertionsUs",
            "value": 2319.5340000002034,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/0/revertiblePrivateInsertionsUs",
            "value": 962.3579999997673,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/1/totalInstructionsExecuted",
            "value": 17011,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/1/totalDurationMs",
            "value": 144.89876800000002,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/1/manaUsed",
            "value": 381879,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/1/txHashMs",
            "value": 21.163645000000088,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/1/nonRevertiblePrivateInsertionsUs",
            "value": 2450.1759999998285,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/1/revertiblePrivateInsertionsUs",
            "value": 1001.0489999999663,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/2/totalInstructionsExecuted",
            "value": 17011,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/2/totalDurationMs",
            "value": 148.6965409999998,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/2/manaUsed",
            "value": 381879,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/2/txHashMs",
            "value": 21.088032999999996,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/2/nonRevertiblePrivateInsertionsUs",
            "value": 2352.824999999939,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/2/revertiblePrivateInsertionsUs",
            "value": 788.5550000000876,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/constructor/3/totalInstructionsExecuted",
            "value": 1735,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/constructor/3/totalDurationMs",
            "value": 86.09661499999993,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/constructor/3/manaUsed",
            "value": 72855,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/constructor/3/txHashMs",
            "value": 20.984000999999807,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/constructor/3/nonRevertiblePrivateInsertionsUs",
            "value": 2205.341999999746,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/constructor/3/revertiblePrivateInsertionsUs",
            "value": 875.7070000001477,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/set_minter/4/totalInstructionsExecuted",
            "value": 635,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/set_minter/4/totalDurationMs",
            "value": 51.244189000000006,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/set_minter/4/manaUsed",
            "value": 19579,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/set_minter/4/txHashMs",
            "value": 21.04736200000025,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/set_minter/4/nonRevertiblePrivateInsertionsUs",
            "value": 2290.5540000001565,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/set_minter/4/revertiblePrivateInsertionsUs",
            "value": 4215.270000000146,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/add_liquidity/5/totalInstructionsExecuted",
            "value": 9272,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/add_liquidity/5/totalDurationMs",
            "value": 162.26144900000008,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/add_liquidity/5/manaUsed",
            "value": 252462,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/add_liquidity/5/txHashMs",
            "value": 21.10939399999961,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/add_liquidity/5/nonRevertiblePrivateInsertionsUs",
            "value": 2747.7929999995467,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/add_liquidity/5/revertiblePrivateInsertionsUs",
            "value": 668.0830000004789,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/swap_exact_tokens_for_tokens/6/totalInstructionsExecuted",
            "value": 5752,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/swap_exact_tokens_for_tokens/6/totalDurationMs",
            "value": 110.15299400000004,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/swap_exact_tokens_for_tokens/6/manaUsed",
            "value": 141831,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/swap_exact_tokens_for_tokens/6/txHashMs",
            "value": 21.12249399999928,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/swap_exact_tokens_for_tokens/6/nonRevertiblePrivateInsertionsUs",
            "value": 2427.7669999992213,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/swap_exact_tokens_for_tokens/6/revertiblePrivateInsertionsUs",
            "value": 731.1639999998079,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/remove_liquidity/7/totalInstructionsExecuted",
            "value": 10059,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/remove_liquidity/7/totalDurationMs",
            "value": 155.2482460000001,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/remove_liquidity/7/manaUsed",
            "value": 264452,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/remove_liquidity/7/txHashMs",
            "value": 21.10261300000002,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/remove_liquidity/7/nonRevertiblePrivateInsertionsUs",
            "value": 2177.6209999998173,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/remove_liquidity/7/revertiblePrivateInsertionsUs",
            "value": 652.7820000001157,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmTest contract tests/AvmTest/bulk_testing/0/totalInstructionsExecuted",
            "value": 27133,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmTest contract tests/AvmTest/bulk_testing/0/totalDurationMs",
            "value": 252.06741500000044,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmTest contract tests/AvmTest/bulk_testing/0/manaUsed",
            "value": 557410,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmTest contract tests/AvmTest/bulk_testing/0/txHashMs",
            "value": 21.125793000000158,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmTest contract tests/AvmTest/bulk_testing/0/nonRevertiblePrivateInsertionsUs",
            "value": 2271.983999999975,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmTest contract tests/AvmTest/bulk_testing/0/revertiblePrivateInsertionsUs",
            "value": 741.2539999995715,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_10/0/totalInstructionsExecuted",
            "value": 5195,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_10/0/totalDurationMs",
            "value": 105.06094800000028,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_10/0/manaUsed",
            "value": 90720,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_10/0/txHashMs",
            "value": 21.087602999999945,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_10/0/nonRevertiblePrivateInsertionsUs",
            "value": 2045.6389999999374,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_10/0/revertiblePrivateInsertionsUs",
            "value": 677.5529999995342,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_20/1/totalInstructionsExecuted",
            "value": 6318,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_20/1/totalDurationMs",
            "value": 58.426706000000195,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_20/1/manaUsed",
            "value": 111162,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_20/1/txHashMs",
            "value": 21.040431999999782,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_20/1/nonRevertiblePrivateInsertionsUs",
            "value": 2110.020999999506,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_20/1/revertiblePrivateInsertionsUs",
            "value": 689.8330000003625,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_30/2/totalInstructionsExecuted",
            "value": 7669,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_30/2/totalDurationMs",
            "value": 60.81587099999979,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_30/2/manaUsed",
            "value": 135084,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_30/2/txHashMs",
            "value": 20.986870000000636,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_30/2/nonRevertiblePrivateInsertionsUs",
            "value": 2256.753000000572,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_30/2/revertiblePrivateInsertionsUs",
            "value": 612.6720000002024,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_40/3/totalInstructionsExecuted",
            "value": 8874,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_40/3/totalDurationMs",
            "value": 68.16730199999984,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_40/3/manaUsed",
            "value": 156435,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_40/3/txHashMs",
            "value": 21.075502000000597,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_40/3/nonRevertiblePrivateInsertionsUs",
            "value": 2249.912999999651,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_40/3/revertiblePrivateInsertionsUs",
            "value": 621.4820000004693,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_50/4/totalInstructionsExecuted",
            "value": 10226,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_50/4/totalDurationMs",
            "value": 66.69614399999955,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_50/4/manaUsed",
            "value": 180366,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_50/4/txHashMs",
            "value": 21.086113000000296,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_50/4/nonRevertiblePrivateInsertionsUs",
            "value": 2415.697000000364,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_50/4/revertiblePrivateInsertionsUs",
            "value": 660.5719999997746,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_60/5/totalInstructionsExecuted",
            "value": 11744,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_60/5/totalDurationMs",
            "value": 70.90030500000012,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_60/5/manaUsed",
            "value": 206913,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_60/5/txHashMs",
            "value": 21.191414999999324,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_60/5/nonRevertiblePrivateInsertionsUs",
            "value": 2674.812000000202,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_60/5/revertiblePrivateInsertionsUs",
            "value": 707.2330000000875,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_70/6/totalInstructionsExecuted",
            "value": 13560,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_70/6/totalDurationMs",
            "value": 75.47393300000022,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_70/6/manaUsed",
            "value": 239988,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_70/6/txHashMs",
            "value": 21.113263000000188,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_70/6/nonRevertiblePrivateInsertionsUs",
            "value": 2289.244000000508,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_70/6/revertiblePrivateInsertionsUs",
            "value": 650.3130000000965,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_80/7/totalInstructionsExecuted",
            "value": 14790,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_80/7/totalDurationMs",
            "value": 78.09651200000008,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_80/7/manaUsed",
            "value": 261915,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_80/7/txHashMs",
            "value": 21.106213000000025,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_80/7/nonRevertiblePrivateInsertionsUs",
            "value": 2560.4389999998602,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_80/7/revertiblePrivateInsertionsUs",
            "value": 648.9220000003115,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_90/8/totalInstructionsExecuted",
            "value": 16173,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_90/8/totalDurationMs",
            "value": 82.23864199999934,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_90/8/manaUsed",
            "value": 286554,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_90/8/txHashMs",
            "value": 21.098783000000367,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_90/8/nonRevertiblePrivateInsertionsUs",
            "value": 2116.1510000001726,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_90/8/revertiblePrivateInsertionsUs",
            "value": 761.4949999997407,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_100/9/totalInstructionsExecuted",
            "value": 17403,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_100/9/totalDurationMs",
            "value": 83.42535399999997,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_100/9/manaUsed",
            "value": 308481,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_100/9/txHashMs",
            "value": 21.087212999999792,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_100/9/nonRevertiblePrivateInsertionsUs",
            "value": 2273.192999999992,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_100/9/revertiblePrivateInsertionsUs",
            "value": 736.1650000002555,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_255/10/totalInstructionsExecuted",
            "value": 39046,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_255/10/totalDurationMs",
            "value": 149.27872900000057,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_255/10/manaUsed",
            "value": 693108,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_255/10/txHashMs",
            "value": 21.668193999999858,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_255/10/nonRevertiblePrivateInsertionsUs",
            "value": 2143.630999999914,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_255/10/revertiblePrivateInsertionsUs",
            "value": 796.5850000000501,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_256/11/totalInstructionsExecuted",
            "value": 39204,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_256/11/totalDurationMs",
            "value": 133.87528699999984,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_256/11/manaUsed",
            "value": 696708,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_256/11/txHashMs",
            "value": 20.90576400000009,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_256/11/nonRevertiblePrivateInsertionsUs",
            "value": 2061.1479999997755,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_256/11/revertiblePrivateInsertionsUs",
            "value": 657.0120000005772,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_511/12/totalInstructionsExecuted",
            "value": 74641,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_511/12/totalDurationMs",
            "value": 216.48780700000134,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_511/12/manaUsed",
            "value": 1326093,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_511/12/txHashMs",
            "value": 21.148268999999345,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_511/12/nonRevertiblePrivateInsertionsUs",
            "value": 2206.5110000003187,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_511/12/revertiblePrivateInsertionsUs",
            "value": 653.3129999988887,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_512/13/totalInstructionsExecuted",
            "value": 74700,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_512/13/totalDurationMs",
            "value": 215.85413599999993,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_512/13/manaUsed",
            "value": 1328580,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_512/13/txHashMs",
            "value": 21.084548000000723,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_512/13/nonRevertiblePrivateInsertionsUs",
            "value": 2184.74199999946,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_512/13/revertiblePrivateInsertionsUs",
            "value": 702.0630000006349,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_2048/14/totalInstructionsExecuted",
            "value": 287680,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_2048/14/totalDurationMs",
            "value": 713.884578000001,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_2048/14/manaUsed",
            "value": 5120364,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_2048/14/txHashMs",
            "value": 21.17562899999939,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_2048/14/nonRevertiblePrivateInsertionsUs",
            "value": 2068.5489999996207,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_2048/14/revertiblePrivateInsertionsUs",
            "value": 593.9519999992626,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_hash/15/totalInstructionsExecuted",
            "value": 9533,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_hash/15/totalDurationMs",
            "value": 64.9650870000005,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_hash/15/manaUsed",
            "value": 175263,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_hash/15/txHashMs",
            "value": 21.158869999999297,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_hash/15/nonRevertiblePrivateInsertionsUs",
            "value": 2084.0989999996964,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_hash/15/revertiblePrivateInsertionsUs",
            "value": 615.0020000004588,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_f1600/16/totalInstructionsExecuted",
            "value": 3054,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_f1600/16/totalDurationMs",
            "value": 48.06001799999831,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_f1600/16/manaUsed",
            "value": 53874,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_f1600/16/txHashMs",
            "value": 21.133858999999575,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_f1600/16/nonRevertiblePrivateInsertionsUs",
            "value": 2135.8609999988403,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_f1600/16/revertiblePrivateInsertionsUs",
            "value": 643.1520000005548,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/poseidon2_hash/17/totalInstructionsExecuted",
            "value": 2092,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/poseidon2_hash/17/totalDurationMs",
            "value": 48.04368799999975,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/poseidon2_hash/17/manaUsed",
            "value": 35940,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/poseidon2_hash/17/txHashMs",
            "value": 21.1102690000007,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/poseidon2_hash/17/nonRevertiblePrivateInsertionsUs",
            "value": 2115.3699999995297,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/poseidon2_hash/17/revertiblePrivateInsertionsUs",
            "value": 668.6220000010508,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash/18/totalInstructionsExecuted",
            "value": 22758,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash/18/totalDurationMs",
            "value": 373.4779520000011,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash/18/manaUsed",
            "value": 599910,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash/18/txHashMs",
            "value": 21.028266999999687,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash/18/nonRevertiblePrivateInsertionsUs",
            "value": 1993.7369999988732,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash/18/revertiblePrivateInsertionsUs",
            "value": 680.9430000012071,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash_with_index/19/totalInstructionsExecuted",
            "value": 22785,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash_with_index/19/totalDurationMs",
            "value": 333.55512699999963,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash_with_index/19/manaUsed",
            "value": 599853,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash_with_index/19/txHashMs",
            "value": 21.028567000001203,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash_with_index/19/nonRevertiblePrivateInsertionsUs",
            "value": 2148.341000000073,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash_with_index/19/revertiblePrivateInsertionsUs",
            "value": 638.781999999992,
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
            "name": "James Zaki",
            "username": "jzaki",
            "email": "james.zaki@proton.me"
          },
          "committer": {
            "name": "GitHub",
            "username": "web-flow",
            "email": "noreply@github.com"
          },
          "id": "a2b1b9d5679f9a5b2a8b13c6c12e0baf225b850e",
          "message": "docs: update node version instructions (#14412)\n\n- [x] update prerequisite to v22 (min v20)\n- [x] review `Contract Tutorials` (minor fix)\n- Review `Full-Stack Tutorials`\n- [x] [Getting started with\nAztec.js](http://localhost:3000/next/developers/tutorials/codealong/js_tutorials/aztecjs-getting-started)\n- [x] [Node.js app that interacts with\ncontracts](http://localhost:3000/next/developers/tutorials/codealong/js_tutorials/simple_dapp)\n- [x] [Token Bridge\nTutorial](http://localhost:3000/next/developers/tutorials/codealong/js_tutorials/token_bridge)\n- [x] [Uniswap\nBridge](http://localhost:3000/next/developers/tutorials/codealong/js_tutorials/uniswap)\n- [x] Apply fixes to all versioned_docs\n- [x] Apply node version updates to relevant versioned_docs\n\n---------\n\nCo-authored-by: josh crites <critesjosh@gmail.com>",
          "timestamp": "2025-05-22T16:12:58Z",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a2b1b9d5679f9a5b2a8b13c6c12e0baf225b850e"
        },
        "date": 1747931836465,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "barretenberg/cpp/bb-micro-bench/wasm/ultra_honk",
            "value": 8205.37463,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/bb-micro-bench/wasm/client_ivc",
            "value": 58941.093426,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/bb-micro-bench/native/ultra_honk",
            "value": 3460.006567999926,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/bb-micro-bench/native/client_ivc",
            "value": 22628.815316999862,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/bb-micro-bench/native/client_ivc_17_in_20",
            "value": 18186.64382599991,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+sponsored_fpc/wasm/seconds",
            "value": 44200,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+sponsored_fpc/wasm/memory",
            "value": 1028,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+sponsored_fpc/native/seconds",
            "value": 16573,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+sponsored_fpc/native/memory",
            "value": 1029,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/schnorr+deploy_tokenContract_no_registration+sponsored_fpc/wasm/seconds",
            "value": 40742,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/schnorr+deploy_tokenContract_no_registration+sponsored_fpc/wasm/memory",
            "value": 1020,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/schnorr+deploy_tokenContract_no_registration+sponsored_fpc/native/seconds",
            "value": 15377,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/schnorr+deploy_tokenContract_no_registration+sponsored_fpc/native/memory",
            "value": 1076,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+sponsored_fpc/wasm/seconds",
            "value": 39277,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+sponsored_fpc/wasm/memory",
            "value": 1032,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+sponsored_fpc/native/seconds",
            "value": 14573,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+sponsored_fpc/native/memory",
            "value": 1001,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+token_bridge_claim_private+sponsored_fpc/wasm/seconds",
            "value": 45356,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+token_bridge_claim_private+sponsored_fpc/wasm/memory",
            "value": 1144,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+token_bridge_claim_private+sponsored_fpc/native/seconds",
            "value": 16873,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+token_bridge_claim_private+sponsored_fpc/native/memory",
            "value": 1086,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+private_fpc/wasm/seconds",
            "value": 69183,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+private_fpc/wasm/memory",
            "value": 1315,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+private_fpc/native/seconds",
            "value": 25816,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+private_fpc/native/memory",
            "value": 1235,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc/wasm/seconds",
            "value": 91060,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc/wasm/memory",
            "value": 1927,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc/native/seconds",
            "value": 31868,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc/native/memory",
            "value": 1276,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc/wasm/seconds",
            "value": 71470,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc/wasm/memory",
            "value": 2776,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc/native/seconds",
            "value": 24437,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc/native/memory",
            "value": 2037,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+private_fpc/wasm/seconds",
            "value": 59844,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+private_fpc/wasm/memory",
            "value": 1079,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+private_fpc/native/seconds",
            "value": 22279,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+private_fpc/native/memory",
            "value": 1150,
            "unit": "MB"
          },
          {
            "name": "barretenberg/acir_tests/ultra_honk_rec_wasm_memory",
            "value": 2.19,
            "unit": "MiB"
          },
          {
            "name": "yarn-project/end-to-end/Sequencer/aztec.sequencer.block.build_duration",
            "value": 6689,
            "unit": "ms"
          },
          {
            "name": "yarn-project/end-to-end/Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.19148617977220422,
            "unit": "us/mana"
          },
          {
            "name": "yarn-project/end-to-end/Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 102112,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/constructor/0/totalInstructionsExecuted",
            "value": 17011,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/constructor/0/totalDurationMs",
            "value": 213.30365100000017,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/constructor/0/manaUsed",
            "value": 381879,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/constructor/0/txHashMs",
            "value": 27.88738599999988,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/constructor/0/nonRevertiblePrivateInsertionsUs",
            "value": 4517.817000000377,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/constructor/0/revertiblePrivateInsertionsUs",
            "value": 2298.135000000002,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/mint_to_public/1/totalInstructionsExecuted",
            "value": 1461,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/mint_to_public/1/totalDurationMs",
            "value": 66.3545039999999,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/mint_to_public/1/manaUsed",
            "value": 42698,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/mint_to_public/1/txHashMs",
            "value": 22.15753900000027,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/mint_to_public/1/nonRevertiblePrivateInsertionsUs",
            "value": 2483.0590000001393,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/mint_to_public/1/revertiblePrivateInsertionsUs",
            "value": 951.2530000001789,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/2/totalInstructionsExecuted",
            "value": 612,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/2/totalDurationMs",
            "value": 52.52992399999994,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/2/manaUsed",
            "value": 12384,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/2/txHashMs",
            "value": 21.44823200000019,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/2/nonRevertiblePrivateInsertionsUs",
            "value": 2803.877000000284,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/2/revertiblePrivateInsertionsUs",
            "value": 935.0620000000163,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/transfer_in_public/3/totalInstructionsExecuted",
            "value": 1907,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/transfer_in_public/3/totalDurationMs",
            "value": 55.60557700000027,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/transfer_in_public/3/manaUsed",
            "value": 48632,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/transfer_in_public/3/txHashMs",
            "value": 21.29777899999999,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/transfer_in_public/3/nonRevertiblePrivateInsertionsUs",
            "value": 2236.094000000321,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/transfer_in_public/3/revertiblePrivateInsertionsUs",
            "value": 906.4610000000357,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/4/totalInstructionsExecuted",
            "value": 612,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/4/totalDurationMs",
            "value": 49.05521099999987,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/4/manaUsed",
            "value": 12384,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/4/txHashMs",
            "value": 21.131314000000202,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/4/nonRevertiblePrivateInsertionsUs",
            "value": 2283.4939999997914,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/4/revertiblePrivateInsertionsUs",
            "value": 916.6019999997843,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/5/totalInstructionsExecuted",
            "value": 612,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/5/totalDurationMs",
            "value": 49.30315699999983,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/5/manaUsed",
            "value": 12384,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/5/txHashMs",
            "value": 21.247207999999773,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/5/nonRevertiblePrivateInsertionsUs",
            "value": 2124.9800000000505,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/5/revertiblePrivateInsertionsUs",
            "value": 764.5980000002055,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/6/totalInstructionsExecuted",
            "value": 612,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/6/totalDurationMs",
            "value": 47.05208300000004,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/6/manaUsed",
            "value": 12384,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/6/txHashMs",
            "value": 21.007222000000183,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/6/nonRevertiblePrivateInsertionsUs",
            "value": 2176.531999999952,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/6/revertiblePrivateInsertionsUs",
            "value": 1408.2940000002964,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/burn_public/7/totalInstructionsExecuted",
            "value": 1133,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/burn_public/7/totalDurationMs",
            "value": 62.56711399999995,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/burn_public/7/manaUsed",
            "value": 35852,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/burn_public/7/txHashMs",
            "value": 21.23380700000007,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/burn_public/7/nonRevertiblePrivateInsertionsUs",
            "value": 2511.910000000171,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/burn_public/7/revertiblePrivateInsertionsUs",
            "value": 822.1200000002682,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/8/totalInstructionsExecuted",
            "value": 612,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/8/totalDurationMs",
            "value": 47.97970499999974,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/8/manaUsed",
            "value": 12384,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/8/txHashMs",
            "value": 21.34027900000001,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/8/nonRevertiblePrivateInsertionsUs",
            "value": 2560.030999999981,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/8/revertiblePrivateInsertionsUs",
            "value": 831.2399999999798,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/0/totalInstructionsExecuted",
            "value": 17011,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/0/totalDurationMs",
            "value": 154.97575899999993,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/0/manaUsed",
            "value": 381879,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/0/txHashMs",
            "value": 21.395481000000018,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/0/nonRevertiblePrivateInsertionsUs",
            "value": 2347.9160000001684,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/0/revertiblePrivateInsertionsUs",
            "value": 907.7520000000732,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/1/totalInstructionsExecuted",
            "value": 17011,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/1/totalDurationMs",
            "value": 146.13839800000005,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/1/manaUsed",
            "value": 381879,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/1/txHashMs",
            "value": 21.241078000000016,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/1/nonRevertiblePrivateInsertionsUs",
            "value": 2293.2449999998425,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/1/revertiblePrivateInsertionsUs",
            "value": 920.3919999999925,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/2/totalInstructionsExecuted",
            "value": 17011,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/2/totalDurationMs",
            "value": 144.14203999999972,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/2/manaUsed",
            "value": 381879,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/2/txHashMs",
            "value": 21.291979000000083,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/2/nonRevertiblePrivateInsertionsUs",
            "value": 2240.403000000242,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/2/revertiblePrivateInsertionsUs",
            "value": 798.0790000001434,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/constructor/3/totalInstructionsExecuted",
            "value": 1735,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/constructor/3/totalDurationMs",
            "value": 85.61560300000019,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/constructor/3/manaUsed",
            "value": 72855,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/constructor/3/txHashMs",
            "value": 21.236296999999922,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/constructor/3/nonRevertiblePrivateInsertionsUs",
            "value": 2195.412000000033,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/constructor/3/revertiblePrivateInsertionsUs",
            "value": 714.216999999735,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/set_minter/4/totalInstructionsExecuted",
            "value": 635,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/set_minter/4/totalDurationMs",
            "value": 48.07941800000026,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/set_minter/4/manaUsed",
            "value": 19579,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/set_minter/4/txHashMs",
            "value": 21.1687450000004,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/set_minter/4/nonRevertiblePrivateInsertionsUs",
            "value": 2440.8979999998337,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/set_minter/4/revertiblePrivateInsertionsUs",
            "value": 740.4679999999644,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/add_liquidity/5/totalInstructionsExecuted",
            "value": 9272,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/add_liquidity/5/totalDurationMs",
            "value": 156.7645309999998,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/add_liquidity/5/manaUsed",
            "value": 252462,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/add_liquidity/5/txHashMs",
            "value": 21.19455599999992,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/add_liquidity/5/nonRevertiblePrivateInsertionsUs",
            "value": 2802.476999999726,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/add_liquidity/5/revertiblePrivateInsertionsUs",
            "value": 724.076999999852,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/swap_exact_tokens_for_tokens/6/totalInstructionsExecuted",
            "value": 5752,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/swap_exact_tokens_for_tokens/6/totalDurationMs",
            "value": 105.31377299999986,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/swap_exact_tokens_for_tokens/6/manaUsed",
            "value": 141831,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/swap_exact_tokens_for_tokens/6/txHashMs",
            "value": 21.126024999999572,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/swap_exact_tokens_for_tokens/6/nonRevertiblePrivateInsertionsUs",
            "value": 2125.011000000086,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/swap_exact_tokens_for_tokens/6/revertiblePrivateInsertionsUs",
            "value": 637.5550000002477,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/remove_liquidity/7/totalInstructionsExecuted",
            "value": 10059,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/remove_liquidity/7/totalDurationMs",
            "value": 154.21779100000003,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/remove_liquidity/7/manaUsed",
            "value": 264452,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/remove_liquidity/7/txHashMs",
            "value": 21.24797699999999,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/remove_liquidity/7/nonRevertiblePrivateInsertionsUs",
            "value": 2420.5379999993966,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/remove_liquidity/7/revertiblePrivateInsertionsUs",
            "value": 704.9969999998211,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmTest contract tests/AvmTest/bulk_testing/0/totalInstructionsExecuted",
            "value": 27133,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmTest contract tests/AvmTest/bulk_testing/0/totalDurationMs",
            "value": 246.24062699999922,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmTest contract tests/AvmTest/bulk_testing/0/manaUsed",
            "value": 557410,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmTest contract tests/AvmTest/bulk_testing/0/txHashMs",
            "value": 21.15380499999992,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmTest contract tests/AvmTest/bulk_testing/0/nonRevertiblePrivateInsertionsUs",
            "value": 2266.964000000371,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmTest contract tests/AvmTest/bulk_testing/0/revertiblePrivateInsertionsUs",
            "value": 673.6160000000382,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_10/0/totalInstructionsExecuted",
            "value": 5195,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_10/0/totalDurationMs",
            "value": 104.84846199999993,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_10/0/manaUsed",
            "value": 90720,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_10/0/txHashMs",
            "value": 21.9303230000005,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_10/0/nonRevertiblePrivateInsertionsUs",
            "value": 2264.373999999407,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_10/0/revertiblePrivateInsertionsUs",
            "value": 785.399000000325,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_20/1/totalInstructionsExecuted",
            "value": 6318,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_20/1/totalDurationMs",
            "value": 58.15838800000074,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_20/1/manaUsed",
            "value": 111162,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_20/1/txHashMs",
            "value": 21.092843000000357,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_20/1/nonRevertiblePrivateInsertionsUs",
            "value": 2047.8089999996882,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_20/1/revertiblePrivateInsertionsUs",
            "value": 641.9059999998353,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_30/2/totalInstructionsExecuted",
            "value": 7669,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_30/2/totalDurationMs",
            "value": 61.68507200000022,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_30/2/manaUsed",
            "value": 135084,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_30/2/txHashMs",
            "value": 21.016311999999743,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_30/2/nonRevertiblePrivateInsertionsUs",
            "value": 2132.7400000000125,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_30/2/revertiblePrivateInsertionsUs",
            "value": 645.0059999997393,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_40/3/totalInstructionsExecuted",
            "value": 8874,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_40/3/totalDurationMs",
            "value": 68.00410300000021,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_40/3/manaUsed",
            "value": 156435,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_40/3/txHashMs",
            "value": 21.267077999999856,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_40/3/nonRevertiblePrivateInsertionsUs",
            "value": 2227.452999999514,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_40/3/revertiblePrivateInsertionsUs",
            "value": 693.8669999999547,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_50/4/totalInstructionsExecuted",
            "value": 10226,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_50/4/totalDurationMs",
            "value": 67.02575900000011,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_50/4/manaUsed",
            "value": 180366,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_50/4/txHashMs",
            "value": 21.10417299999972,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_50/4/nonRevertiblePrivateInsertionsUs",
            "value": 2291.8549999994866,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_50/4/revertiblePrivateInsertionsUs",
            "value": 664.6559999999226,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_60/5/totalInstructionsExecuted",
            "value": 11744,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_60/5/totalDurationMs",
            "value": 72.41026800000054,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_60/5/manaUsed",
            "value": 206913,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_60/5/txHashMs",
            "value": 21.23928700000033,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_60/5/nonRevertiblePrivateInsertionsUs",
            "value": 2917.0700000004217,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_60/5/revertiblePrivateInsertionsUs",
            "value": 723.4570000000531,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_70/6/totalInstructionsExecuted",
            "value": 13560,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_70/6/totalDurationMs",
            "value": 74.79551600000013,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_70/6/manaUsed",
            "value": 239988,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_70/6/txHashMs",
            "value": 21.12929499999973,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_70/6/nonRevertiblePrivateInsertionsUs",
            "value": 2341.5060000006633,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_70/6/revertiblePrivateInsertionsUs",
            "value": 693.717000000106,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_80/7/totalInstructionsExecuted",
            "value": 14790,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_80/7/totalDurationMs",
            "value": 78.92988400000013,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_80/7/manaUsed",
            "value": 261915,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_80/7/txHashMs",
            "value": 21.075972999999976,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_80/7/nonRevertiblePrivateInsertionsUs",
            "value": 2548.9010000001144,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_80/7/revertiblePrivateInsertionsUs",
            "value": 654.6760000001086,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_90/8/totalInstructionsExecuted",
            "value": 16173,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_90/8/totalDurationMs",
            "value": 82.53056000000015,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_90/8/manaUsed",
            "value": 286554,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_90/8/txHashMs",
            "value": 21.22774599999957,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_90/8/nonRevertiblePrivateInsertionsUs",
            "value": 2234.4530000000304,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_90/8/revertiblePrivateInsertionsUs",
            "value": 667.0659999999771,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_100/9/totalInstructionsExecuted",
            "value": 17403,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_100/9/totalDurationMs",
            "value": 83.52500299999974,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_100/9/manaUsed",
            "value": 308481,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_100/9/txHashMs",
            "value": 21.24971699999969,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_100/9/nonRevertiblePrivateInsertionsUs",
            "value": 2190.3220000003785,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_100/9/revertiblePrivateInsertionsUs",
            "value": 674.6359999997367,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_255/10/totalInstructionsExecuted",
            "value": 39046,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_255/10/totalDurationMs",
            "value": 134.75803600000017,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_255/10/manaUsed",
            "value": 693108,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_255/10/txHashMs",
            "value": 21.12143399999968,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_255/10/nonRevertiblePrivateInsertionsUs",
            "value": 2066.7990000001737,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_255/10/revertiblePrivateInsertionsUs",
            "value": 725.9969999995519,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_256/11/totalInstructionsExecuted",
            "value": 39204,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_256/11/totalDurationMs",
            "value": 132.2512459999998,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_256/11/manaUsed",
            "value": 696708,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_256/11/txHashMs",
            "value": 21.114383999999518,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_256/11/nonRevertiblePrivateInsertionsUs",
            "value": 2190.17200000053,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_256/11/revertiblePrivateInsertionsUs",
            "value": 648.6549999999625,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_511/12/totalInstructionsExecuted",
            "value": 74641,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_511/12/totalDurationMs",
            "value": 217.3953390000006,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_511/12/manaUsed",
            "value": 1326093,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_511/12/txHashMs",
            "value": 21.201395999998567,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_511/12/nonRevertiblePrivateInsertionsUs",
            "value": 2395.8569999995234,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_511/12/revertiblePrivateInsertionsUs",
            "value": 655.8660000009695,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_512/13/totalInstructionsExecuted",
            "value": 74700,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_512/13/totalDurationMs",
            "value": 215.6534069999998,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_512/13/manaUsed",
            "value": 1328580,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_512/13/txHashMs",
            "value": 21.393911000001026,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_512/13/nonRevertiblePrivateInsertionsUs",
            "value": 2184.063000000606,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_512/13/revertiblePrivateInsertionsUs",
            "value": 660.7360000016342,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_2048/14/totalInstructionsExecuted",
            "value": 287680,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_2048/14/totalDurationMs",
            "value": 716.970593,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_2048/14/manaUsed",
            "value": 5120364,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_2048/14/txHashMs",
            "value": 21.12357499999962,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_2048/14/nonRevertiblePrivateInsertionsUs",
            "value": 2184.792000000016,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_2048/14/revertiblePrivateInsertionsUs",
            "value": 690.0870000008581,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_hash/15/totalInstructionsExecuted",
            "value": 9533,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_hash/15/totalDurationMs",
            "value": 64.50374999999985,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_hash/15/manaUsed",
            "value": 175263,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_hash/15/txHashMs",
            "value": 21.05184200000076,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_hash/15/nonRevertiblePrivateInsertionsUs",
            "value": 2071.640000000116,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_hash/15/revertiblePrivateInsertionsUs",
            "value": 638.6849999998958,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_f1600/16/totalInstructionsExecuted",
            "value": 3054,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_f1600/16/totalDurationMs",
            "value": 48.336874000000535,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_f1600/16/manaUsed",
            "value": 53874,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_f1600/16/txHashMs",
            "value": 21.326888999999937,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_f1600/16/nonRevertiblePrivateInsertionsUs",
            "value": 2305.355000000418,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_f1600/16/revertiblePrivateInsertionsUs",
            "value": 674.8859999988781,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/poseidon2_hash/17/totalInstructionsExecuted",
            "value": 2092,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/poseidon2_hash/17/totalDurationMs",
            "value": 48.052387000001545,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/poseidon2_hash/17/manaUsed",
            "value": 35940,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/poseidon2_hash/17/txHashMs",
            "value": 21.220205999999962,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/poseidon2_hash/17/nonRevertiblePrivateInsertionsUs",
            "value": 2140.6320000005508,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/poseidon2_hash/17/revertiblePrivateInsertionsUs",
            "value": 678.7860000004002,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash/18/totalInstructionsExecuted",
            "value": 22747,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash/18/totalDurationMs",
            "value": 364.24870399999963,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash/18/manaUsed",
            "value": 598164,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash/18/txHashMs",
            "value": 21.073991999999635,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash/18/nonRevertiblePrivateInsertionsUs",
            "value": 2252.4540000013076,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash/18/revertiblePrivateInsertionsUs",
            "value": 657.0359999986977,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash_with_index/19/totalInstructionsExecuted",
            "value": 22810,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash_with_index/19/totalDurationMs",
            "value": 326.24471599999924,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash_with_index/19/manaUsed",
            "value": 602001,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash_with_index/19/txHashMs",
            "value": 21.13298399999985,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash_with_index/19/nonRevertiblePrivateInsertionsUs",
            "value": 2347.0259999994596,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash_with_index/19/revertiblePrivateInsertionsUs",
            "value": 667.9560000011406,
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
            "name": "Leila Wang",
            "username": "LeilaWang",
            "email": "leizciw@gmail.com"
          },
          "committer": {
            "name": "GitHub",
            "username": "web-flow",
            "email": "noreply@github.com"
          },
          "id": "d59737075c781597a7991709109cf7c5f9fc741f",
          "message": "refactor!: remove unneeded root rollup public inputs (#13929)\n\nRemove:\n- `previous_archive.next_available_leaf_index`\n- `end_archive.next_available_leaf_index`\n- `end_timestamp`\n- `end_block_number`\n- `out_hash`\n\nThe first 4 are committed to by start and end block number, which are\nconstrained by `proposed_block_header_hashes`.\n`out_hash` is not used at all beyond block root. Each block's `out_hash`\nis also constrained by its `proposed_block_header_hash`.",
          "timestamp": "2025-05-22T16:24:35Z",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d59737075c781597a7991709109cf7c5f9fc741f"
        },
        "date": 1747934258363,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "barretenberg/cpp/bb-micro-bench/wasm/ultra_honk",
            "value": 8309.317671,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/bb-micro-bench/wasm/client_ivc",
            "value": 58857.347865,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/bb-micro-bench/native/ultra_honk",
            "value": 3528.506939999943,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/bb-micro-bench/native/client_ivc",
            "value": 22608.319747999987,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/bb-micro-bench/native/client_ivc_17_in_20",
            "value": 18075.99720500002,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+sponsored_fpc/wasm/seconds",
            "value": 44175,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+sponsored_fpc/wasm/memory",
            "value": 1007,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+sponsored_fpc/native/seconds",
            "value": 16565,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+sponsored_fpc/native/memory",
            "value": 1013,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/schnorr+deploy_tokenContract_no_registration+sponsored_fpc/wasm/seconds",
            "value": 40719,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/schnorr+deploy_tokenContract_no_registration+sponsored_fpc/wasm/memory",
            "value": 1108,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/schnorr+deploy_tokenContract_no_registration+sponsored_fpc/native/seconds",
            "value": 15513,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/schnorr+deploy_tokenContract_no_registration+sponsored_fpc/native/memory",
            "value": 1054,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+sponsored_fpc/wasm/seconds",
            "value": 38915,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+sponsored_fpc/wasm/memory",
            "value": 1053,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+sponsored_fpc/native/seconds",
            "value": 14566,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+sponsored_fpc/native/memory",
            "value": 1003,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+token_bridge_claim_private+sponsored_fpc/wasm/seconds",
            "value": 45332,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+token_bridge_claim_private+sponsored_fpc/wasm/memory",
            "value": 1131,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+token_bridge_claim_private+sponsored_fpc/native/seconds",
            "value": 17080,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+token_bridge_claim_private+sponsored_fpc/native/memory",
            "value": 1048,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+private_fpc/wasm/seconds",
            "value": 69025,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+private_fpc/wasm/memory",
            "value": 1298,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+private_fpc/native/seconds",
            "value": 25919,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+private_fpc/native/memory",
            "value": 1234,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc/wasm/seconds",
            "value": 91163,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc/wasm/memory",
            "value": 1942,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc/native/seconds",
            "value": 31702,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc/native/memory",
            "value": 1270,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc/wasm/seconds",
            "value": 71216,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc/wasm/memory",
            "value": 2801,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc/native/seconds",
            "value": 24716,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc/native/memory",
            "value": 2046,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+private_fpc/wasm/seconds",
            "value": 59984,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+private_fpc/wasm/memory",
            "value": 1097,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+private_fpc/native/seconds",
            "value": 22522,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+private_fpc/native/memory",
            "value": 1158,
            "unit": "MB"
          },
          {
            "name": "barretenberg/acir_tests/ultra_honk_rec_wasm_memory",
            "value": 2.19,
            "unit": "MiB"
          },
          {
            "name": "yarn-project/end-to-end/Sequencer/aztec.sequencer.block.build_duration",
            "value": 6676,
            "unit": "ms"
          },
          {
            "name": "yarn-project/end-to-end/Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.1911153895476318,
            "unit": "us/mana"
          },
          {
            "name": "yarn-project/end-to-end/Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 97423,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/constructor/0/totalInstructionsExecuted",
            "value": 17262,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/constructor/0/totalDurationMs",
            "value": 219.8694089999999,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/constructor/0/manaUsed",
            "value": 385938,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/constructor/0/txHashMs",
            "value": 27.90114799999992,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/constructor/0/nonRevertiblePrivateInsertionsUs",
            "value": 5057.225000000017,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/constructor/0/revertiblePrivateInsertionsUs",
            "value": 2209.3939999999748,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/mint_to_public/1/totalInstructionsExecuted",
            "value": 1363,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/mint_to_public/1/totalDurationMs",
            "value": 68.70529299999998,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/mint_to_public/1/manaUsed",
            "value": 41750,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/mint_to_public/1/txHashMs",
            "value": 22.052674000000025,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/mint_to_public/1/nonRevertiblePrivateInsertionsUs",
            "value": 3337.2129999997924,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/mint_to_public/1/revertiblePrivateInsertionsUs",
            "value": 936.4329999998517,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/2/totalInstructionsExecuted",
            "value": 580,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/2/totalDurationMs",
            "value": 52.345720000000256,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/2/manaUsed",
            "value": 12138,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/2/txHashMs",
            "value": 21.49377000000004,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/2/nonRevertiblePrivateInsertionsUs",
            "value": 2432.589999999891,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/2/revertiblePrivateInsertionsUs",
            "value": 899.5220000001609,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/transfer_in_public/3/totalInstructionsExecuted",
            "value": 1800,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/transfer_in_public/3/totalDurationMs",
            "value": 57.21630099999993,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/transfer_in_public/3/manaUsed",
            "value": 47660,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/transfer_in_public/3/txHashMs",
            "value": 21.198321999999735,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/transfer_in_public/3/nonRevertiblePrivateInsertionsUs",
            "value": 2199.6839999997064,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/transfer_in_public/3/revertiblePrivateInsertionsUs",
            "value": 828.4300000000258,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/4/totalInstructionsExecuted",
            "value": 580,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/4/totalDurationMs",
            "value": 48.90816599999971,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/4/manaUsed",
            "value": 12138,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/4/txHashMs",
            "value": 21.248073000000204,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/4/nonRevertiblePrivateInsertionsUs",
            "value": 2287.6759999999194,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/4/revertiblePrivateInsertionsUs",
            "value": 879.4110000003457,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/5/totalInstructionsExecuted",
            "value": 580,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/5/totalDurationMs",
            "value": 47.31406599999991,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/5/manaUsed",
            "value": 12138,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/5/txHashMs",
            "value": 21.3256650000003,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/5/nonRevertiblePrivateInsertionsUs",
            "value": 2305.127000000084,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/5/revertiblePrivateInsertionsUs",
            "value": 802.4399999999332,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/6/totalInstructionsExecuted",
            "value": 580,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/6/totalDurationMs",
            "value": 50.27758899999981,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/6/manaUsed",
            "value": 12138,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/6/txHashMs",
            "value": 21.171362000000045,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/6/nonRevertiblePrivateInsertionsUs",
            "value": 2141.732999999931,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/6/revertiblePrivateInsertionsUs",
            "value": 1322.3320000001877,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/burn_public/7/totalInstructionsExecuted",
            "value": 1040,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/burn_public/7/totalDurationMs",
            "value": 55.05177700000013,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/burn_public/7/manaUsed",
            "value": 34865,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/burn_public/7/txHashMs",
            "value": 21.318504999999732,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/burn_public/7/nonRevertiblePrivateInsertionsUs",
            "value": 2486.891000000014,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/burn_public/7/revertiblePrivateInsertionsUs",
            "value": 871.0519999999633,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/8/totalInstructionsExecuted",
            "value": 580,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/8/totalDurationMs",
            "value": 49.32964700000002,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/8/manaUsed",
            "value": 12138,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/8/txHashMs",
            "value": 21.37436600000001,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/8/nonRevertiblePrivateInsertionsUs",
            "value": 2408.700000000408,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/8/revertiblePrivateInsertionsUs",
            "value": 938.673000000108,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/0/totalInstructionsExecuted",
            "value": 17262,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/0/totalDurationMs",
            "value": 160.73264199999994,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/0/manaUsed",
            "value": 385938,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/0/txHashMs",
            "value": 21.402628000000277,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/0/nonRevertiblePrivateInsertionsUs",
            "value": 2344.4879999997283,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/0/revertiblePrivateInsertionsUs",
            "value": 933.1429999997454,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/1/totalInstructionsExecuted",
            "value": 17262,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/1/totalDurationMs",
            "value": 150.60061199999973,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/1/manaUsed",
            "value": 385938,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/1/txHashMs",
            "value": 21.139150999999856,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/1/nonRevertiblePrivateInsertionsUs",
            "value": 2510.8620000000883,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/1/revertiblePrivateInsertionsUs",
            "value": 1025.5349999997634,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/2/totalInstructionsExecuted",
            "value": 17262,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/2/totalDurationMs",
            "value": 148.41786900000034,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/2/manaUsed",
            "value": 385938,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/2/txHashMs",
            "value": 21.111699999999928,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/2/nonRevertiblePrivateInsertionsUs",
            "value": 2357.618999999886,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/2/revertiblePrivateInsertionsUs",
            "value": 782.329000000118,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/constructor/3/totalInstructionsExecuted",
            "value": 1729,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/constructor/3/totalDurationMs",
            "value": 83.18408999999974,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/constructor/3/manaUsed",
            "value": 72894,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/constructor/3/txHashMs",
            "value": 21.015548000000308,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/constructor/3/nonRevertiblePrivateInsertionsUs",
            "value": 2249.366000000009,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/constructor/3/revertiblePrivateInsertionsUs",
            "value": 769.0190000002985,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/set_minter/4/totalInstructionsExecuted",
            "value": 611,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/set_minter/4/totalDurationMs",
            "value": 50.97737599999982,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/set_minter/4/manaUsed",
            "value": 19447,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/set_minter/4/txHashMs",
            "value": 21.035817999999836,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/set_minter/4/nonRevertiblePrivateInsertionsUs",
            "value": 2318.0069999998523,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/set_minter/4/revertiblePrivateInsertionsUs",
            "value": 826.5910000000076,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/add_liquidity/5/totalInstructionsExecuted",
            "value": 8919,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/add_liquidity/5/totalDurationMs",
            "value": 162.4820149999996,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/add_liquidity/5/manaUsed",
            "value": 250443,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/add_liquidity/5/txHashMs",
            "value": 21.047877999999855,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/add_liquidity/5/nonRevertiblePrivateInsertionsUs",
            "value": 2921.45199999959,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/add_liquidity/5/revertiblePrivateInsertionsUs",
            "value": 740.8479999999145,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/swap_exact_tokens_for_tokens/6/totalInstructionsExecuted",
            "value": 5602,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/swap_exact_tokens_for_tokens/6/totalDurationMs",
            "value": 111.87591800000064,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/swap_exact_tokens_for_tokens/6/manaUsed",
            "value": 141372,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/swap_exact_tokens_for_tokens/6/txHashMs",
            "value": 21.17873200000031,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/swap_exact_tokens_for_tokens/6/nonRevertiblePrivateInsertionsUs",
            "value": 2249.044999999569,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/swap_exact_tokens_for_tokens/6/revertiblePrivateInsertionsUs",
            "value": 718.1479999999283,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/remove_liquidity/7/totalInstructionsExecuted",
            "value": 9974,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/remove_liquidity/7/totalDurationMs",
            "value": 163.36161699999957,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/remove_liquidity/7/manaUsed",
            "value": 266909,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/remove_liquidity/7/txHashMs",
            "value": 21.139350999999806,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/remove_liquidity/7/nonRevertiblePrivateInsertionsUs",
            "value": 2252.62500000008,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/remove_liquidity/7/revertiblePrivateInsertionsUs",
            "value": 689.9370000000999,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmTest contract tests/AvmTest/bulk_testing/0/totalInstructionsExecuted",
            "value": 25908,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmTest contract tests/AvmTest/bulk_testing/0/totalDurationMs",
            "value": 247.60329300000012,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmTest contract tests/AvmTest/bulk_testing/0/manaUsed",
            "value": 540316,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmTest contract tests/AvmTest/bulk_testing/0/txHashMs",
            "value": 21.165022000000135,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmTest contract tests/AvmTest/bulk_testing/0/nonRevertiblePrivateInsertionsUs",
            "value": 2316.1569999992935,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmTest contract tests/AvmTest/bulk_testing/0/revertiblePrivateInsertionsUs",
            "value": 721.2770000005548,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_10/0/totalInstructionsExecuted",
            "value": 5033,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_10/0/totalDurationMs",
            "value": 105.90711100000044,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_10/0/manaUsed",
            "value": 88512,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_10/0/txHashMs",
            "value": 21.106700000000274,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_10/0/nonRevertiblePrivateInsertionsUs",
            "value": 2296.7969999999696,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_10/0/revertiblePrivateInsertionsUs",
            "value": 665.3559999995196,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_20/1/totalInstructionsExecuted",
            "value": 5857,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_20/1/totalDurationMs",
            "value": 58.557323,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_20/1/manaUsed",
            "value": 104100,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_20/1/txHashMs",
            "value": 21.180661999999757,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_20/1/nonRevertiblePrivateInsertionsUs",
            "value": 2238.785000000462,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_20/1/revertiblePrivateInsertionsUs",
            "value": 672.3070000007283,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_30/2/totalInstructionsExecuted",
            "value": 6978,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_30/2/totalDurationMs",
            "value": 62.268905000000814,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_30/2/manaUsed",
            "value": 124476,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_30/2/txHashMs",
            "value": 21.098339999999553,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_30/2/nonRevertiblePrivateInsertionsUs",
            "value": 2201.6050000001997,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_30/2/revertiblePrivateInsertionsUs",
            "value": 630.8749999998327,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_40/3/totalInstructionsExecuted",
            "value": 7951,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_40/3/totalDurationMs",
            "value": 64.53009999999995,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_40/3/manaUsed",
            "value": 142215,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_40/3/txHashMs",
            "value": 21.360155999999733,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_40/3/nonRevertiblePrivateInsertionsUs",
            "value": 2598.6740000007558,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_40/3/revertiblePrivateInsertionsUs",
            "value": 677.5770000003831,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_50/4/totalInstructionsExecuted",
            "value": 9074,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_50/4/totalDurationMs",
            "value": 66.88084700000036,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_50/4/manaUsed",
            "value": 162609,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_50/4/txHashMs",
            "value": 21.127089999999953,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_50/4/nonRevertiblePrivateInsertionsUs",
            "value": 2208.5550000001604,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_50/4/revertiblePrivateInsertionsUs",
            "value": 635.8849999996892,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_60/5/totalInstructionsExecuted",
            "value": 10361,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_60/5/totalDurationMs",
            "value": 72.55115899999964,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_60/5/manaUsed",
            "value": 185553,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_60/5/txHashMs",
            "value": 21.165111000000252,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_60/5/nonRevertiblePrivateInsertionsUs",
            "value": 2408.110000000306,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_60/5/revertiblePrivateInsertionsUs",
            "value": 664.9070000003121,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_70/6/totalInstructionsExecuted",
            "value": 11987,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_70/6/totalDurationMs",
            "value": 73.92192300000079,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_70/6/manaUsed",
            "value": 215892,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_70/6/txHashMs",
            "value": 21.27704300000005,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_70/6/nonRevertiblePrivateInsertionsUs",
            "value": 2340.348000000631,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_70/6/revertiblePrivateInsertionsUs",
            "value": 800.5000000002838,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_80/7/totalInstructionsExecuted",
            "value": 12987,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_80/7/totalDurationMs",
            "value": 80.10726799999975,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_80/7/manaUsed",
            "value": 234249,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_80/7/txHashMs",
            "value": 21.122629000000416,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_80/7/nonRevertiblePrivateInsertionsUs",
            "value": 3491.1870000005365,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_80/7/revertiblePrivateInsertionsUs",
            "value": 712.2369999997318,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_90/8/totalInstructionsExecuted",
            "value": 14140,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_90/8/totalDurationMs",
            "value": 80.96551,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_90/8/manaUsed",
            "value": 255318,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_90/8/txHashMs",
            "value": 21.54055900000003,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_90/8/nonRevertiblePrivateInsertionsUs",
            "value": 2343.8380000006873,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_90/8/revertiblePrivateInsertionsUs",
            "value": 755.3289999996196,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_100/9/totalInstructionsExecuted",
            "value": 15140,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_100/9/totalDurationMs",
            "value": 80.45641700000033,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_100/9/manaUsed",
            "value": 273675,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_100/9/txHashMs",
            "value": 21.009696999999505,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_100/9/nonRevertiblePrivateInsertionsUs",
            "value": 2221.3550000005853,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_100/9/revertiblePrivateInsertionsUs",
            "value": 759.7189999996772,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_255/10/totalInstructionsExecuted",
            "value": 33218,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_255/10/totalDurationMs",
            "value": 126.26818600000024,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_255/10/manaUsed",
            "value": 602967,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_255/10/txHashMs",
            "value": 21.15596099999948,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_255/10/nonRevertiblePrivateInsertionsUs",
            "value": 2067.1220000003814,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_255/10/revertiblePrivateInsertionsUs",
            "value": 654.6560000006139,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_256/11/totalInstructionsExecuted",
            "value": 33313,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_256/11/totalDurationMs",
            "value": 126.12968199999978,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_256/11/manaUsed",
            "value": 605454,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_256/11/txHashMs",
            "value": 21.230681999999433,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_256/11/nonRevertiblePrivateInsertionsUs",
            "value": 2273.98600000015,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_256/11/revertiblePrivateInsertionsUs",
            "value": 748.0979999991177,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_511/12/totalInstructionsExecuted",
            "value": 62965,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_511/12/totalDurationMs",
            "value": 201.36657800000103,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_511/12/manaUsed",
            "value": 1145424,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_511/12/txHashMs",
            "value": 21.198601000000053,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_511/12/nonRevertiblePrivateInsertionsUs",
            "value": 2163.693999998941,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_511/12/revertiblePrivateInsertionsUs",
            "value": 636.555999999473,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_512/13/totalInstructionsExecuted",
            "value": 62918,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_512/13/totalDurationMs",
            "value": 203.54799300000013,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_512/13/manaUsed",
            "value": 1145871,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_512/13/txHashMs",
            "value": 21.198671999998624,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_512/13/nonRevertiblePrivateInsertionsUs",
            "value": 2473.1919999994716,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_512/13/revertiblePrivateInsertionsUs",
            "value": 711.8979999995645,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_2048/14/totalInstructionsExecuted",
            "value": 240570,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_2048/14/totalDurationMs",
            "value": 648.7638939999997,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_2048/14/manaUsed",
            "value": 4389303,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_2048/14/txHashMs",
            "value": 21.617801999998846,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_2048/14/nonRevertiblePrivateInsertionsUs",
            "value": 2017.0709999983956,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_2048/14/revertiblePrivateInsertionsUs",
            "value": 757.7490000003309,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_hash/15/totalInstructionsExecuted",
            "value": 9484,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_hash/15/totalDurationMs",
            "value": 67.02751100000023,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_hash/15/manaUsed",
            "value": 175077,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_hash/15/txHashMs",
            "value": 21.27732300000025,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_hash/15/nonRevertiblePrivateInsertionsUs",
            "value": 2090.3220000000147,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_hash/15/revertiblePrivateInsertionsUs",
            "value": 624.5159999998577,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_f1600/16/totalInstructionsExecuted",
            "value": 3079,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_f1600/16/totalDurationMs",
            "value": 48.92001700000037,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_f1600/16/manaUsed",
            "value": 54405,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_f1600/16/txHashMs",
            "value": 21.080619000000297,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_f1600/16/nonRevertiblePrivateInsertionsUs",
            "value": 2289.9770000003628,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_f1600/16/revertiblePrivateInsertionsUs",
            "value": 663.5469999982888,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/poseidon2_hash/17/totalInstructionsExecuted",
            "value": 2207,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/poseidon2_hash/17/totalDurationMs",
            "value": 48.14180699999997,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/poseidon2_hash/17/manaUsed",
            "value": 38118,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/poseidon2_hash/17/txHashMs",
            "value": 21.025947000000087,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/poseidon2_hash/17/nonRevertiblePrivateInsertionsUs",
            "value": 2173.174999999901,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/poseidon2_hash/17/revertiblePrivateInsertionsUs",
            "value": 659.3269999993936,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash/18/totalInstructionsExecuted",
            "value": 22918,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash/18/totalDurationMs",
            "value": 367.22172599999976,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash/18/manaUsed",
            "value": 602358,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash/18/txHashMs",
            "value": 21.057598000001235,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash/18/nonRevertiblePrivateInsertionsUs",
            "value": 2401.6300000002957,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash/18/revertiblePrivateInsertionsUs",
            "value": 630.4149999996298,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash_with_index/19/totalInstructionsExecuted",
            "value": 22926,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash_with_index/19/totalDurationMs",
            "value": 324.17888700000003,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash_with_index/19/manaUsed",
            "value": 601977,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash_with_index/19/txHashMs",
            "value": 21.057597999999416,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash_with_index/19/nonRevertiblePrivateInsertionsUs",
            "value": 1956.900000001042,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash_with_index/19/revertiblePrivateInsertionsUs",
            "value": 594.3640000004962,
            "unit": "us"
          },
          {
            "name": "l1-contracts/forward (100_validators)",
            "value": 655059,
            "unit": "gas"
          },
          {
            "name": "l1-contracts/forward (100_validators) per l2 tx",
            "value": 1819.61,
            "unit": "gas"
          },
          {
            "name": "l1-contracts/forward (no_validators)",
            "value": 332346,
            "unit": "gas"
          },
          {
            "name": "l1-contracts/forward (no_validators) per l2 tx",
            "value": 923.18,
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
            "value": 1627567,
            "unit": "gas"
          },
          {
            "name": "l1-contracts/setupEpoch (100_validators) per l2 tx",
            "value": 141.28,
            "unit": "gas"
          },
          {
            "name": "l1-contracts/setupEpoch (no_validators)",
            "value": 84150,
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
            "value": 920325,
            "unit": "gas"
          },
          {
            "name": "l1-contracts/submitEpochRootProof (100_validators) per l2 tx",
            "value": 79.89,
            "unit": "gas"
          },
          {
            "name": "l1-contracts/submitEpochRootProof (no_validators)",
            "value": 920325,
            "unit": "gas"
          },
          {
            "name": "l1-contracts/submitEpochRootProof (no_validators) per l2 tx",
            "value": 79.89,
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
            "value": 211922,
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
            "value": 156800,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_4_4_4_4_4_4_4_4_4_opcodes",
            "value": 27176,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_4_4_4_4_4_4_4_4_4_gates",
            "value": 101130,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_base_public_opcodes",
            "value": 209839,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_base_public_gates",
            "value": 4526489,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_64_64_4_opcodes",
            "value": 37207,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_64_64_4_gates",
            "value": 170089,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_64_4_4_opcodes",
            "value": 32050,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_64_4_4_gates",
            "value": 119795,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_64_4_32_opcodes",
            "value": 41042,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_64_4_32_gates",
            "value": 210431,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_64_4_4_opcodes",
            "value": 38513,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_64_4_4_gates",
            "value": 205611,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_4_64_32_opcodes",
            "value": 40381,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_4_64_32_gates",
            "value": 200783,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_4_4_4_opcodes",
            "value": 32695,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_4_4_4_gates",
            "value": 145669,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_block_merge_opcodes",
            "value": 6971,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_block_merge_gates",
            "value": 1533674,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_4_4_32_opcodes",
            "value": 35224,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_4_4_32_gates",
            "value": 150490,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_root_opcodes",
            "value": 6982,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_root_gates",
            "value": 26789895,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_4_64_4_opcodes",
            "value": 34492,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_4_64_4_gates",
            "value": 151980,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_block_root_empty_opcodes",
            "value": 6403,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_block_root_empty_gates",
            "value": 708324,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_4_64_4_opcodes",
            "value": 34749,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_4_64_4_gates",
            "value": 154130,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_block_root_single_tx_opcodes",
            "value": 876814,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_block_root_single_tx_gates",
            "value": 3893724,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_32_32_32_32_32_32_32_32_opcodes",
            "value": 52340,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_32_32_32_32_32_32_32_32_gates",
            "value": 348148,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_4_4_4_opcodes",
            "value": 36055,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_4_4_4_gates",
            "value": 189652,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_4_64_32_opcodes",
            "value": 37278,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_4_64_32_gates",
            "value": 158950,
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
            "value": 147819,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_16_16_16_16_16_16_16_16_16_opcodes",
            "value": 37971,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_16_16_16_16_16_16_16_16_16_gates",
            "value": 207004,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_4_4_32_opcodes",
            "value": 32121,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_4_4_32_gates",
            "value": 108657,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_4_4_4_opcodes",
            "value": 29592,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_4_4_4_gates",
            "value": 103836,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_64_64_4_opcodes",
            "value": 33847,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_64_64_4_gates",
            "value": 126106,
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
            "value": 271420,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_base_private_gates",
            "value": 1895471,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_0_0_0_0_0_64_0_0_0_opcodes",
            "value": 20822,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_0_0_0_0_0_64_0_0_0_gates",
            "value": 56709,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_4_64_32_opcodes",
            "value": 33918,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_4_64_32_gates",
            "value": 114967,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_64_4_32_opcodes",
            "value": 34579,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_64_4_32_gates",
            "value": 124615,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_4_64_4_opcodes",
            "value": 37852,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_4_64_4_gates",
            "value": 195963,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_4_4_32_opcodes",
            "value": 38584,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_4_4_32_gates",
            "value": 194473,
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
            "value": 130926,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_opcodes",
            "value": 78051,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_gates",
            "value": 625445,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_block_root_opcodes",
            "value": 878258,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_block_root_gates",
            "value": 4690087,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_64_4_4_opcodes",
            "value": 35410,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_64_4_4_gates",
            "value": 163778,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_64_64_4_opcodes",
            "value": 36950,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_64_64_4_gates",
            "value": 167939,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_64_64_32_opcodes",
            "value": 39736,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_64_64_32_gates",
            "value": 174909,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_64_4_32_opcodes",
            "value": 37682,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_64_4_32_gates",
            "value": 166448,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_4_64_4_opcodes",
            "value": 31389,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_4_64_4_gates",
            "value": 110147,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_4_4_32_opcodes",
            "value": 35481,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_4_4_32_gates",
            "value": 152640,
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
            "value": 1726,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_merge_gates",
            "value": 1463557,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_64_4_32_opcodes",
            "value": 37939,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_64_4_32_gates",
            "value": 168598,
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
            "value": 161628,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_64_64_32_opcodes",
            "value": 39479,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_64_64_32_gates",
            "value": 172759,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_64_64_32_opcodes",
            "value": 42839,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_64_64_32_gates",
            "value": 216742,
            "unit": "gates"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "name": "Facundo",
            "username": "fcarreiro",
            "email": "fcarreiro@users.noreply.github.com"
          },
          "committer": {
            "name": "GitHub",
            "username": "web-flow",
            "email": "noreply@github.com"
          },
          "id": "d1c2bcbee151e78cf1f119e374dc26d45387fa98",
          "message": "chore(avm): stack based external calls (#14447)\n\nAlso some changes to tx trace based on discussions.",
          "timestamp": "2025-05-22T16:25:38Z",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d1c2bcbee151e78cf1f119e374dc26d45387fa98"
        },
        "date": 1747934333139,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "barretenberg/cpp/bb-micro-bench/wasm/ultra_honk",
            "value": 8239.079881,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/bb-micro-bench/wasm/client_ivc",
            "value": 58578.644834,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/bb-micro-bench/native/ultra_honk",
            "value": 3465.1099919999524,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/bb-micro-bench/native/client_ivc",
            "value": 22663.924468000005,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/bb-micro-bench/native/client_ivc_17_in_20",
            "value": 18201.779436999914,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+sponsored_fpc/wasm/seconds",
            "value": 44136,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+sponsored_fpc/wasm/memory",
            "value": 997,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+sponsored_fpc/native/seconds",
            "value": 16581,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+sponsored_fpc/native/memory",
            "value": 981,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/schnorr+deploy_tokenContract_no_registration+sponsored_fpc/wasm/seconds",
            "value": 40785,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/schnorr+deploy_tokenContract_no_registration+sponsored_fpc/wasm/memory",
            "value": 1145,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/schnorr+deploy_tokenContract_no_registration+sponsored_fpc/native/seconds",
            "value": 15530,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/schnorr+deploy_tokenContract_no_registration+sponsored_fpc/native/memory",
            "value": 1083,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+sponsored_fpc/wasm/seconds",
            "value": 39143,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+sponsored_fpc/wasm/memory",
            "value": 1065,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+sponsored_fpc/native/seconds",
            "value": 14526,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+sponsored_fpc/native/memory",
            "value": 1002,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+token_bridge_claim_private+sponsored_fpc/wasm/seconds",
            "value": 45632,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+token_bridge_claim_private+sponsored_fpc/wasm/memory",
            "value": 1177,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+token_bridge_claim_private+sponsored_fpc/native/seconds",
            "value": 17049,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+token_bridge_claim_private+sponsored_fpc/native/memory",
            "value": 1070,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+private_fpc/wasm/seconds",
            "value": 68404,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+private_fpc/wasm/memory",
            "value": 1296,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+private_fpc/native/seconds",
            "value": 25702,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+private_fpc/native/memory",
            "value": 1232,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc/wasm/seconds",
            "value": 91638,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc/wasm/memory",
            "value": 1895,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc/native/seconds",
            "value": 31802,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc/native/memory",
            "value": 1266,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc/wasm/seconds",
            "value": 72602,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc/wasm/memory",
            "value": 2791,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc/native/seconds",
            "value": 24602,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc/native/memory",
            "value": 2067,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+private_fpc/wasm/seconds",
            "value": 59837,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+private_fpc/wasm/memory",
            "value": 1108,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+private_fpc/native/seconds",
            "value": 22377,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+private_fpc/native/memory",
            "value": 1131,
            "unit": "MB"
          },
          {
            "name": "barretenberg/acir_tests/ultra_honk_rec_wasm_memory",
            "value": 2.19,
            "unit": "MiB"
          },
          {
            "name": "yarn-project/end-to-end/Sequencer/aztec.sequencer.block.build_duration",
            "value": 6991,
            "unit": "ms"
          },
          {
            "name": "yarn-project/end-to-end/Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.20014502508517673,
            "unit": "us/mana"
          },
          {
            "name": "yarn-project/end-to-end/Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 100875,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/constructor/0/totalInstructionsExecuted",
            "value": 17262,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/constructor/0/totalDurationMs",
            "value": 221.0343640000001,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/constructor/0/manaUsed",
            "value": 385938,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/constructor/0/txHashMs",
            "value": 28.41445300000032,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/constructor/0/nonRevertiblePrivateInsertionsUs",
            "value": 4722.6849999997285,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/constructor/0/revertiblePrivateInsertionsUs",
            "value": 2288.860999999997,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/mint_to_public/1/totalInstructionsExecuted",
            "value": 1363,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/mint_to_public/1/totalDurationMs",
            "value": 70.50364300000001,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/mint_to_public/1/manaUsed",
            "value": 41750,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/mint_to_public/1/txHashMs",
            "value": 22.153530000000046,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/mint_to_public/1/nonRevertiblePrivateInsertionsUs",
            "value": 3535.9239999997953,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/mint_to_public/1/revertiblePrivateInsertionsUs",
            "value": 950.7770000000164,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/2/totalInstructionsExecuted",
            "value": 580,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/2/totalDurationMs",
            "value": 60.61853599999995,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/2/manaUsed",
            "value": 12138,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/2/txHashMs",
            "value": 21.443037999999888,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/2/nonRevertiblePrivateInsertionsUs",
            "value": 2475.2440000002025,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/2/revertiblePrivateInsertionsUs",
            "value": 899.0770000000339,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/transfer_in_public/3/totalInstructionsExecuted",
            "value": 1800,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/transfer_in_public/3/totalDurationMs",
            "value": 54.99438400000008,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/transfer_in_public/3/manaUsed",
            "value": 47660,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/transfer_in_public/3/txHashMs",
            "value": 21.233044000000064,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/transfer_in_public/3/nonRevertiblePrivateInsertionsUs",
            "value": 2495.785000000069,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/transfer_in_public/3/revertiblePrivateInsertionsUs",
            "value": 788.2540000000517,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/4/totalInstructionsExecuted",
            "value": 580,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/4/totalDurationMs",
            "value": 49.90830199999982,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/4/manaUsed",
            "value": 12138,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/4/txHashMs",
            "value": 21.158511999999973,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/4/nonRevertiblePrivateInsertionsUs",
            "value": 2374.153000000206,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/4/revertiblePrivateInsertionsUs",
            "value": 978.9369999998598,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/5/totalInstructionsExecuted",
            "value": 580,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/5/totalDurationMs",
            "value": 46.74490400000013,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/5/manaUsed",
            "value": 12138,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/5/txHashMs",
            "value": 21.155001999999968,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/5/nonRevertiblePrivateInsertionsUs",
            "value": 2293.380999999954,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/5/revertiblePrivateInsertionsUs",
            "value": 811.2049999999726,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/6/totalInstructionsExecuted",
            "value": 580,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/6/totalDurationMs",
            "value": 48.91499399999975,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/6/manaUsed",
            "value": 12138,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/6/txHashMs",
            "value": 21.20186300000023,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/6/nonRevertiblePrivateInsertionsUs",
            "value": 2351.2430000000677,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/6/revertiblePrivateInsertionsUs",
            "value": 1597.5289999996676,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/burn_public/7/totalInstructionsExecuted",
            "value": 1040,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/burn_public/7/totalDurationMs",
            "value": 53.59914899999967,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/burn_public/7/manaUsed",
            "value": 34865,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/burn_public/7/txHashMs",
            "value": 21.37950600000022,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/burn_public/7/nonRevertiblePrivateInsertionsUs",
            "value": 2346.6520000001765,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/burn_public/7/revertiblePrivateInsertionsUs",
            "value": 806.6340000000309,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/8/totalInstructionsExecuted",
            "value": 580,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/8/totalDurationMs",
            "value": 48.82589299999972,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/8/manaUsed",
            "value": 12138,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/8/txHashMs",
            "value": 21.29328499999974,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/8/nonRevertiblePrivateInsertionsUs",
            "value": 2543.616999999813,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/8/revertiblePrivateInsertionsUs",
            "value": 834.4059999999445,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/0/totalInstructionsExecuted",
            "value": 17262,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/0/totalDurationMs",
            "value": 163.9277119999997,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/0/manaUsed",
            "value": 385938,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/0/txHashMs",
            "value": 21.578109999999924,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/0/nonRevertiblePrivateInsertionsUs",
            "value": 2511.594999999943,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/0/revertiblePrivateInsertionsUs",
            "value": 881.7959999996674,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/1/totalInstructionsExecuted",
            "value": 17262,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/1/totalDurationMs",
            "value": 150.65835199999992,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/1/manaUsed",
            "value": 385938,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/1/txHashMs",
            "value": 21.155902999999853,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/1/nonRevertiblePrivateInsertionsUs",
            "value": 2619.9069999997846,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/1/revertiblePrivateInsertionsUs",
            "value": 974.8970000000554,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/2/totalInstructionsExecuted",
            "value": 17262,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/2/totalDurationMs",
            "value": 147.83605100000023,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/2/manaUsed",
            "value": 385938,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/2/txHashMs",
            "value": 21.26439500000015,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/2/nonRevertiblePrivateInsertionsUs",
            "value": 2342.942000000221,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/2/revertiblePrivateInsertionsUs",
            "value": 772.034000000076,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/constructor/3/totalInstructionsExecuted",
            "value": 1729,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/constructor/3/totalDurationMs",
            "value": 83.91788599999973,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/constructor/3/manaUsed",
            "value": 72894,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/constructor/3/txHashMs",
            "value": 21.09581100000014,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/constructor/3/nonRevertiblePrivateInsertionsUs",
            "value": 2379.051999999774,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/constructor/3/revertiblePrivateInsertionsUs",
            "value": 712.2119999999086,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/set_minter/4/totalInstructionsExecuted",
            "value": 611,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/set_minter/4/totalDurationMs",
            "value": 48.38103499999988,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/set_minter/4/manaUsed",
            "value": 19447,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/set_minter/4/txHashMs",
            "value": 21.042371000000003,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/set_minter/4/nonRevertiblePrivateInsertionsUs",
            "value": 2296.701000000212,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/set_minter/4/revertiblePrivateInsertionsUs",
            "value": 794.2739999998594,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/add_liquidity/5/totalInstructionsExecuted",
            "value": 8919,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/add_liquidity/5/totalDurationMs",
            "value": 165.75079500000038,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/add_liquidity/5/manaUsed",
            "value": 250443,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/add_liquidity/5/txHashMs",
            "value": 21.045530000000326,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/add_liquidity/5/nonRevertiblePrivateInsertionsUs",
            "value": 3017.374000000018,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/add_liquidity/5/revertiblePrivateInsertionsUs",
            "value": 759.5940000001065,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/swap_exact_tokens_for_tokens/6/totalInstructionsExecuted",
            "value": 5602,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/swap_exact_tokens_for_tokens/6/totalDurationMs",
            "value": 111.49284400000033,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/swap_exact_tokens_for_tokens/6/manaUsed",
            "value": 141372,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/swap_exact_tokens_for_tokens/6/txHashMs",
            "value": 21.1860029999998,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/swap_exact_tokens_for_tokens/6/nonRevertiblePrivateInsertionsUs",
            "value": 2247.0109999994747,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/swap_exact_tokens_for_tokens/6/revertiblePrivateInsertionsUs",
            "value": 681.5620000006675,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/remove_liquidity/7/totalInstructionsExecuted",
            "value": 9974,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/remove_liquidity/7/totalDurationMs",
            "value": 167.10303999999996,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/remove_liquidity/7/manaUsed",
            "value": 266909,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/remove_liquidity/7/txHashMs",
            "value": 20.975099000000228,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/remove_liquidity/7/nonRevertiblePrivateInsertionsUs",
            "value": 2297.0210000003135,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/remove_liquidity/7/revertiblePrivateInsertionsUs",
            "value": 694.5829999995112,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmTest contract tests/AvmTest/bulk_testing/0/totalInstructionsExecuted",
            "value": 25908,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmTest contract tests/AvmTest/bulk_testing/0/totalDurationMs",
            "value": 252.58871399999953,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmTest contract tests/AvmTest/bulk_testing/0/manaUsed",
            "value": 540316,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmTest contract tests/AvmTest/bulk_testing/0/txHashMs",
            "value": 21.20375299999978,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmTest contract tests/AvmTest/bulk_testing/0/nonRevertiblePrivateInsertionsUs",
            "value": 2080.266999999367,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmTest contract tests/AvmTest/bulk_testing/0/revertiblePrivateInsertionsUs",
            "value": 753.1440000002476,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_10/0/totalInstructionsExecuted",
            "value": 5033,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_10/0/totalDurationMs",
            "value": 106.5506150000001,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_10/0/manaUsed",
            "value": 88512,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_10/0/txHashMs",
            "value": 21.07506100000046,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_10/0/nonRevertiblePrivateInsertionsUs",
            "value": 2158.7390000004234,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_10/0/revertiblePrivateInsertionsUs",
            "value": 637.8119999999399,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_20/1/totalInstructionsExecuted",
            "value": 5857,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_20/1/totalDurationMs",
            "value": 57.01396999999997,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_20/1/manaUsed",
            "value": 104100,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_20/1/txHashMs",
            "value": 20.94180899999992,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_20/1/nonRevertiblePrivateInsertionsUs",
            "value": 1981.4960000003339,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_20/1/revertiblePrivateInsertionsUs",
            "value": 610.1810000000114,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_30/2/totalInstructionsExecuted",
            "value": 6978,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_30/2/totalDurationMs",
            "value": 60.76869799999986,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_30/2/manaUsed",
            "value": 124476,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_30/2/txHashMs",
            "value": 21.098570999999538,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_30/2/nonRevertiblePrivateInsertionsUs",
            "value": 2192.2590000003765,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_30/2/revertiblePrivateInsertionsUs",
            "value": 667.0619999995324,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_40/3/totalInstructionsExecuted",
            "value": 7951,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_40/3/totalDurationMs",
            "value": 62.779083999999784,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_40/3/manaUsed",
            "value": 142215,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_40/3/txHashMs",
            "value": 21.00510899999972,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_40/3/nonRevertiblePrivateInsertionsUs",
            "value": 2255.3109999998924,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_40/3/revertiblePrivateInsertionsUs",
            "value": 660.9410000000935,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_50/4/totalInstructionsExecuted",
            "value": 9074,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_50/4/totalDurationMs",
            "value": 66.52455199999986,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_50/4/manaUsed",
            "value": 162609,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_50/4/txHashMs",
            "value": 21.188092999999753,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_50/4/nonRevertiblePrivateInsertionsUs",
            "value": 2117.0579999998154,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_50/4/revertiblePrivateInsertionsUs",
            "value": 629.1909999999916,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_60/5/totalInstructionsExecuted",
            "value": 10361,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_60/5/totalDurationMs",
            "value": 71.1112579999999,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_60/5/manaUsed",
            "value": 185553,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_60/5/txHashMs",
            "value": 21.273753999999826,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_60/5/nonRevertiblePrivateInsertionsUs",
            "value": 2549.025999999685,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_60/5/revertiblePrivateInsertionsUs",
            "value": 728.5130000000208,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_70/6/totalInstructionsExecuted",
            "value": 11987,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_70/6/totalDurationMs",
            "value": 72.65810500000043,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_70/6/manaUsed",
            "value": 215892,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_70/6/txHashMs",
            "value": 21.088271000000532,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_70/6/nonRevertiblePrivateInsertionsUs",
            "value": 2124.03600000016,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_70/6/revertiblePrivateInsertionsUs",
            "value": 663.6410000000978,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_80/7/totalInstructionsExecuted",
            "value": 12987,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_80/7/totalDurationMs",
            "value": 76.66676300000017,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_80/7/manaUsed",
            "value": 234249,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_80/7/txHashMs",
            "value": 21.15805200000068,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_80/7/nonRevertiblePrivateInsertionsUs",
            "value": 2525.6540000000314,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_80/7/revertiblePrivateInsertionsUs",
            "value": 667.9710000007617,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_90/8/totalInstructionsExecuted",
            "value": 14140,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_90/8/totalDurationMs",
            "value": 80.99635799999942,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_90/8/manaUsed",
            "value": 255318,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_90/8/txHashMs",
            "value": 21.22877299999982,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_90/8/nonRevertiblePrivateInsertionsUs",
            "value": 2424.351999999999,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_90/8/revertiblePrivateInsertionsUs",
            "value": 678.7619999995513,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_100/9/totalInstructionsExecuted",
            "value": 15140,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_100/9/totalDurationMs",
            "value": 80.91617599999972,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_100/9/manaUsed",
            "value": 273675,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_100/9/txHashMs",
            "value": 21.074600999999348,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_100/9/nonRevertiblePrivateInsertionsUs",
            "value": 2436.421999999766,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_100/9/revertiblePrivateInsertionsUs",
            "value": 730.8320000001913,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_255/10/totalInstructionsExecuted",
            "value": 33218,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_255/10/totalDurationMs",
            "value": 147.36492399999952,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_255/10/manaUsed",
            "value": 602967,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_255/10/txHashMs",
            "value": 26.757278000000042,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_255/10/nonRevertiblePrivateInsertionsUs",
            "value": 2511.402999999518,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_255/10/revertiblePrivateInsertionsUs",
            "value": 857.4640000006184,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_256/11/totalInstructionsExecuted",
            "value": 33313,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_256/11/totalDurationMs",
            "value": 128.08535399999982,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_256/11/manaUsed",
            "value": 605454,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_256/11/txHashMs",
            "value": 21.188782999999603,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_256/11/nonRevertiblePrivateInsertionsUs",
            "value": 2244.2580000006274,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_256/11/revertiblePrivateInsertionsUs",
            "value": 650.0509999996211,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_511/12/totalInstructionsExecuted",
            "value": 62965,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_511/12/totalDurationMs",
            "value": 200.18815899999936,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_511/12/manaUsed",
            "value": 1145424,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_511/12/txHashMs",
            "value": 21.03809999999976,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_511/12/nonRevertiblePrivateInsertionsUs",
            "value": 2150.8169999997335,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_511/12/revertiblePrivateInsertionsUs",
            "value": 626.5710000006948,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_512/13/totalInstructionsExecuted",
            "value": 62918,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_512/13/totalDurationMs",
            "value": 201.76094699999885,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_512/13/manaUsed",
            "value": 1145871,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_512/13/txHashMs",
            "value": 21.23535400000037,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_512/13/nonRevertiblePrivateInsertionsUs",
            "value": 2235.4880000002595,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_512/13/revertiblePrivateInsertionsUs",
            "value": 688.9919999994163,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_2048/14/totalInstructionsExecuted",
            "value": 240570,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_2048/14/totalDurationMs",
            "value": 643.7777800000003,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_2048/14/manaUsed",
            "value": 4389303,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_2048/14/txHashMs",
            "value": 21.20251300000018,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_2048/14/nonRevertiblePrivateInsertionsUs",
            "value": 2103.135999999722,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_2048/14/revertiblePrivateInsertionsUs",
            "value": 678.9610000014363,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_hash/15/totalInstructionsExecuted",
            "value": 9484,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_hash/15/totalDurationMs",
            "value": 65.75946699999986,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_hash/15/manaUsed",
            "value": 175077,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_hash/15/txHashMs",
            "value": 21.004500000000917,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_hash/15/nonRevertiblePrivateInsertionsUs",
            "value": 2046.0849999999482,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_hash/15/revertiblePrivateInsertionsUs",
            "value": 658.5909999994328,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_f1600/16/totalInstructionsExecuted",
            "value": 3079,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_f1600/16/totalDurationMs",
            "value": 47.95575099999951,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_f1600/16/manaUsed",
            "value": 54405,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_f1600/16/txHashMs",
            "value": 21.00318899999911,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_f1600/16/nonRevertiblePrivateInsertionsUs",
            "value": 2185.026999999536,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_f1600/16/revertiblePrivateInsertionsUs",
            "value": 642.9609999995591,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/poseidon2_hash/17/totalInstructionsExecuted",
            "value": 2207,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/poseidon2_hash/17/totalDurationMs",
            "value": 50.04752699999881,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/poseidon2_hash/17/manaUsed",
            "value": 38118,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/poseidon2_hash/17/txHashMs",
            "value": 21.127512999999453,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/poseidon2_hash/17/nonRevertiblePrivateInsertionsUs",
            "value": 2494.6230000005016,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/poseidon2_hash/17/revertiblePrivateInsertionsUs",
            "value": 730.7020000007469,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash/18/totalInstructionsExecuted",
            "value": 22886,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash/18/totalDurationMs",
            "value": 365.9187589999983,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash/18/manaUsed",
            "value": 600714,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash/18/txHashMs",
            "value": 21.01792999999998,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash/18/nonRevertiblePrivateInsertionsUs",
            "value": 1945.1630000003206,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash/18/revertiblePrivateInsertionsUs",
            "value": 606.0510000006616,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash_with_index/19/totalInstructionsExecuted",
            "value": 22905,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash_with_index/19/totalDurationMs",
            "value": 329.15215999999964,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash_with_index/19/manaUsed",
            "value": 601797,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash_with_index/19/txHashMs",
            "value": 21.08857100000023,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash_with_index/19/nonRevertiblePrivateInsertionsUs",
            "value": 2181.047000000035,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash_with_index/19/revertiblePrivateInsertionsUs",
            "value": 621.9899999996414,
            "unit": "us"
          },
          {
            "name": "l1-contracts/forward (100_validators)",
            "value": 655059,
            "unit": "gas"
          },
          {
            "name": "l1-contracts/forward (100_validators) per l2 tx",
            "value": 1819.61,
            "unit": "gas"
          },
          {
            "name": "l1-contracts/forward (no_validators)",
            "value": 332346,
            "unit": "gas"
          },
          {
            "name": "l1-contracts/forward (no_validators) per l2 tx",
            "value": 923.18,
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
            "value": 1627567,
            "unit": "gas"
          },
          {
            "name": "l1-contracts/setupEpoch (100_validators) per l2 tx",
            "value": 141.28,
            "unit": "gas"
          },
          {
            "name": "l1-contracts/setupEpoch (no_validators)",
            "value": 84150,
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
            "value": 920325,
            "unit": "gas"
          },
          {
            "name": "l1-contracts/submitEpochRootProof (100_validators) per l2 tx",
            "value": 79.89,
            "unit": "gas"
          },
          {
            "name": "l1-contracts/submitEpochRootProof (no_validators)",
            "value": 920325,
            "unit": "gas"
          },
          {
            "name": "l1-contracts/submitEpochRootProof (no_validators) per l2 tx",
            "value": 79.89,
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
            "value": 211922,
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
            "value": 156800,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_4_4_4_4_4_4_4_4_4_opcodes",
            "value": 27176,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_4_4_4_4_4_4_4_4_4_gates",
            "value": 101130,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_base_public_opcodes",
            "value": 209839,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_base_public_gates",
            "value": 4526489,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_64_64_4_opcodes",
            "value": 37207,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_64_64_4_gates",
            "value": 170089,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_64_4_4_opcodes",
            "value": 32050,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_64_4_4_gates",
            "value": 119795,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_64_4_32_opcodes",
            "value": 41042,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_64_4_32_gates",
            "value": 210431,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_64_4_4_opcodes",
            "value": 38513,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_64_4_4_gates",
            "value": 205611,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_4_64_32_opcodes",
            "value": 40381,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_4_64_32_gates",
            "value": 200783,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_4_4_4_opcodes",
            "value": 32695,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_4_4_4_gates",
            "value": 145669,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_block_merge_opcodes",
            "value": 6971,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_block_merge_gates",
            "value": 1533674,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_4_4_32_opcodes",
            "value": 35224,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_4_4_32_gates",
            "value": 150490,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_root_opcodes",
            "value": 6982,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_root_gates",
            "value": 26789895,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_4_64_4_opcodes",
            "value": 34492,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_4_64_4_gates",
            "value": 151980,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_block_root_empty_opcodes",
            "value": 6403,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_block_root_empty_gates",
            "value": 708324,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_4_64_4_opcodes",
            "value": 34749,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_4_64_4_gates",
            "value": 154130,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_block_root_single_tx_opcodes",
            "value": 876814,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_block_root_single_tx_gates",
            "value": 3893724,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_32_32_32_32_32_32_32_32_opcodes",
            "value": 52340,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_32_32_32_32_32_32_32_32_gates",
            "value": 348148,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_4_4_4_opcodes",
            "value": 36055,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_4_4_4_gates",
            "value": 189652,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_4_64_32_opcodes",
            "value": 37278,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_4_64_32_gates",
            "value": 158950,
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
            "value": 147819,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_16_16_16_16_16_16_16_16_16_opcodes",
            "value": 37971,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_16_16_16_16_16_16_16_16_16_gates",
            "value": 207004,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_4_4_32_opcodes",
            "value": 32121,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_4_4_32_gates",
            "value": 108657,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_4_4_4_opcodes",
            "value": 29592,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_4_4_4_gates",
            "value": 103836,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_64_64_4_opcodes",
            "value": 33847,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_64_64_4_gates",
            "value": 126106,
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
            "value": 271420,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_base_private_gates",
            "value": 1895471,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_0_0_0_0_0_64_0_0_0_opcodes",
            "value": 20822,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_0_0_0_0_0_64_0_0_0_gates",
            "value": 56709,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_4_64_32_opcodes",
            "value": 33918,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_4_64_32_gates",
            "value": 114967,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_64_4_32_opcodes",
            "value": 34579,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_64_4_32_gates",
            "value": 124615,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_4_64_4_opcodes",
            "value": 37852,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_4_64_4_gates",
            "value": 195963,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_4_4_32_opcodes",
            "value": 38584,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_4_4_32_gates",
            "value": 194473,
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
            "value": 130926,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_opcodes",
            "value": 78051,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_gates",
            "value": 625445,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_block_root_opcodes",
            "value": 878258,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_block_root_gates",
            "value": 4690087,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_64_4_4_opcodes",
            "value": 35410,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_64_4_4_gates",
            "value": 163778,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_64_64_4_opcodes",
            "value": 36950,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_64_64_4_gates",
            "value": 167939,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_64_64_32_opcodes",
            "value": 39736,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_64_64_32_gates",
            "value": 174909,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_64_4_32_opcodes",
            "value": 37682,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_64_4_32_gates",
            "value": 166448,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_4_64_4_opcodes",
            "value": 31389,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_4_64_4_gates",
            "value": 110147,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_4_4_32_opcodes",
            "value": 35481,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_4_4_32_gates",
            "value": 152640,
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
            "value": 1726,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_merge_gates",
            "value": 1463557,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_64_4_32_opcodes",
            "value": 37939,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_64_4_32_gates",
            "value": 168598,
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
            "value": 161628,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_64_64_32_opcodes",
            "value": 39479,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_64_64_32_gates",
            "value": 172759,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_64_64_32_opcodes",
            "value": 42839,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_64_64_32_gates",
            "value": 216742,
            "unit": "gates"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "name": "Tom French",
            "username": "TomAFrench",
            "email": "15848336+TomAFrench@users.noreply.github.com"
          },
          "committer": {
            "name": "GitHub",
            "username": "web-flow",
            "email": "noreply@github.com"
          },
          "id": "07163e7b1f4dc28c7a04946d5afc430d9c5f07ac",
          "message": "chore: bump things (#14471)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\nline.",
          "timestamp": "2025-05-22T16:33:30Z",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/07163e7b1f4dc28c7a04946d5afc430d9c5f07ac"
        },
        "date": 1747934555390,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "barretenberg/cpp/bb-micro-bench/wasm/ultra_honk",
            "value": 8290.604449,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/bb-micro-bench/wasm/client_ivc",
            "value": 58829.924063,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/bb-micro-bench/native/ultra_honk",
            "value": 3468.5703509999257,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/bb-micro-bench/native/client_ivc",
            "value": 22566.61565400009,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/bb-micro-bench/native/client_ivc_17_in_20",
            "value": 18203.330909999975,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+sponsored_fpc/wasm/seconds",
            "value": 44163,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+sponsored_fpc/wasm/memory",
            "value": 1008,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+sponsored_fpc/native/seconds",
            "value": 16681,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+sponsored_fpc/native/memory",
            "value": 1002,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/schnorr+deploy_tokenContract_no_registration+sponsored_fpc/wasm/seconds",
            "value": 40497,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/schnorr+deploy_tokenContract_no_registration+sponsored_fpc/wasm/memory",
            "value": 1013,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/schnorr+deploy_tokenContract_no_registration+sponsored_fpc/native/seconds",
            "value": 15474,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/schnorr+deploy_tokenContract_no_registration+sponsored_fpc/native/memory",
            "value": 1086,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+sponsored_fpc/wasm/seconds",
            "value": 38820,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+sponsored_fpc/wasm/memory",
            "value": 1030,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+sponsored_fpc/native/seconds",
            "value": 14513,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+sponsored_fpc/native/memory",
            "value": 997,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+token_bridge_claim_private+sponsored_fpc/wasm/seconds",
            "value": 45510,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+token_bridge_claim_private+sponsored_fpc/wasm/memory",
            "value": 1113,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+token_bridge_claim_private+sponsored_fpc/native/seconds",
            "value": 17058,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+token_bridge_claim_private+sponsored_fpc/native/memory",
            "value": 1031,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+private_fpc/wasm/seconds",
            "value": 68719,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+private_fpc/wasm/memory",
            "value": 1296,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+private_fpc/native/seconds",
            "value": 25598,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_1_recursions+private_fpc/native/memory",
            "value": 1235,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc/wasm/seconds",
            "value": 91094,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc/wasm/memory",
            "value": 1812,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc/native/seconds",
            "value": 31808,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc/native/memory",
            "value": 1278,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc/wasm/seconds",
            "value": 71011,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc/wasm/memory",
            "value": 2848,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc/native/seconds",
            "value": 24532,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc/native/memory",
            "value": 2083,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+private_fpc/wasm/seconds",
            "value": 59545,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+private_fpc/wasm/memory",
            "value": 1074,
            "unit": "MB"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+private_fpc/native/seconds",
            "value": 22439,
            "unit": "ms"
          },
          {
            "name": "barretenberg/cpp/app-proving/ecdsar1+transfer_0_recursions+private_fpc/native/memory",
            "value": 1134,
            "unit": "MB"
          },
          {
            "name": "barretenberg/acir_tests/ultra_honk_rec_wasm_memory",
            "value": 2.19,
            "unit": "MiB"
          },
          {
            "name": "yarn-project/end-to-end/Sequencer/aztec.sequencer.block.build_duration",
            "value": 6774,
            "unit": "ms"
          },
          {
            "name": "yarn-project/end-to-end/Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.19392340994924054,
            "unit": "us/mana"
          },
          {
            "name": "yarn-project/end-to-end/Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 97587,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/constructor/0/totalInstructionsExecuted",
            "value": 17262,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/constructor/0/totalDurationMs",
            "value": 220.94900299999972,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/constructor/0/manaUsed",
            "value": 385938,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/constructor/0/txHashMs",
            "value": 25.317285999999967,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/constructor/0/nonRevertiblePrivateInsertionsUs",
            "value": 4912.271000000146,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/constructor/0/revertiblePrivateInsertionsUs",
            "value": 2460.4510000003756,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/mint_to_public/1/totalInstructionsExecuted",
            "value": 1363,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/mint_to_public/1/totalDurationMs",
            "value": 72.48166700000002,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/mint_to_public/1/manaUsed",
            "value": 41750,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/mint_to_public/1/txHashMs",
            "value": 22.134675999999672,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/mint_to_public/1/nonRevertiblePrivateInsertionsUs",
            "value": 3295.7510000001093,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/mint_to_public/1/revertiblePrivateInsertionsUs",
            "value": 1026.1829999999463,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/2/totalInstructionsExecuted",
            "value": 580,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/2/totalDurationMs",
            "value": 60.595118000000184,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/2/manaUsed",
            "value": 12138,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/2/txHashMs",
            "value": 21.441698000000088,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/2/nonRevertiblePrivateInsertionsUs",
            "value": 2476.940999999897,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/2/revertiblePrivateInsertionsUs",
            "value": 915.7019999997829,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/transfer_in_public/3/totalInstructionsExecuted",
            "value": 1800,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/transfer_in_public/3/totalDurationMs",
            "value": 59.58874500000002,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/transfer_in_public/3/manaUsed",
            "value": 47660,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/transfer_in_public/3/txHashMs",
            "value": 21.249335999999857,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/transfer_in_public/3/nonRevertiblePrivateInsertionsUs",
            "value": 2326.9789999999375,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/transfer_in_public/3/revertiblePrivateInsertionsUs",
            "value": 835.109999999986,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/4/totalInstructionsExecuted",
            "value": 580,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/4/totalDurationMs",
            "value": 50.96246799999972,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/4/manaUsed",
            "value": 12138,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/4/txHashMs",
            "value": 21.369886999999835,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/4/nonRevertiblePrivateInsertionsUs",
            "value": 2477.220000000216,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/4/revertiblePrivateInsertionsUs",
            "value": 873.9510000000337,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/5/totalInstructionsExecuted",
            "value": 580,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/5/totalDurationMs",
            "value": 46.79858599999989,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/5/manaUsed",
            "value": 12138,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/5/txHashMs",
            "value": 21.38206799999989,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/5/nonRevertiblePrivateInsertionsUs",
            "value": 2288.5590000000775,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/5/revertiblePrivateInsertionsUs",
            "value": 813.3000000002539,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/6/totalInstructionsExecuted",
            "value": 580,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/6/totalDurationMs",
            "value": 48.09845099999984,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/6/manaUsed",
            "value": 12138,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/6/txHashMs",
            "value": 21.246415999999954,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/6/nonRevertiblePrivateInsertionsUs",
            "value": 2372.9600000001483,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/6/revertiblePrivateInsertionsUs",
            "value": 1495.0290000001587,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/burn_public/7/totalInstructionsExecuted",
            "value": 1040,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/burn_public/7/totalDurationMs",
            "value": 54.346810000000005,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/burn_public/7/manaUsed",
            "value": 34865,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/burn_public/7/txHashMs",
            "value": 21.29157699999996,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/burn_public/7/nonRevertiblePrivateInsertionsUs",
            "value": 2469.9110000001383,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/burn_public/7/revertiblePrivateInsertionsUs",
            "value": 825.3800000002229,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/8/totalInstructionsExecuted",
            "value": 580,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/8/totalDurationMs",
            "value": 50.00567499999988,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/8/manaUsed",
            "value": 12138,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/8/txHashMs",
            "value": 21.466157999999723,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/8/nonRevertiblePrivateInsertionsUs",
            "value": 2477.791000000252,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/Token contract tests/Token/balance_of_public/8/revertiblePrivateInsertionsUs",
            "value": 940.6519999997727,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/0/totalInstructionsExecuted",
            "value": 17262,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/0/totalDurationMs",
            "value": 164.63304800000014,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/0/manaUsed",
            "value": 385938,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/0/txHashMs",
            "value": 21.466087999999672,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/0/nonRevertiblePrivateInsertionsUs",
            "value": 2462.9399999998896,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/0/revertiblePrivateInsertionsUs",
            "value": 925.220999999965,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/1/totalInstructionsExecuted",
            "value": 17262,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/1/totalDurationMs",
            "value": 148.9629829999999,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/1/manaUsed",
            "value": 385938,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/1/txHashMs",
            "value": 21.247505999999703,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/1/nonRevertiblePrivateInsertionsUs",
            "value": 2490.012000000206,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/1/revertiblePrivateInsertionsUs",
            "value": 955.2419999999984,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/2/totalInstructionsExecuted",
            "value": 17262,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/2/totalDurationMs",
            "value": 148.73995999999988,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/2/manaUsed",
            "value": 385938,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/2/txHashMs",
            "value": 21.22034500000018,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/2/nonRevertiblePrivateInsertionsUs",
            "value": 2279.2380000000776,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/Token/constructor/2/revertiblePrivateInsertionsUs",
            "value": 795.1899999998204,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/constructor/3/totalInstructionsExecuted",
            "value": 1729,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/constructor/3/totalDurationMs",
            "value": 85.29698700000017,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/constructor/3/manaUsed",
            "value": 72894,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/constructor/3/txHashMs",
            "value": 20.97826299999997,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/constructor/3/nonRevertiblePrivateInsertionsUs",
            "value": 2214.3479999999727,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/constructor/3/revertiblePrivateInsertionsUs",
            "value": 718.4590000001663,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/set_minter/4/totalInstructionsExecuted",
            "value": 611,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/set_minter/4/totalDurationMs",
            "value": 51.1599699999997,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/set_minter/4/manaUsed",
            "value": 19447,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/set_minter/4/txHashMs",
            "value": 21.055022999999892,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/set_minter/4/nonRevertiblePrivateInsertionsUs",
            "value": 2280.0489999999627,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/set_minter/4/revertiblePrivateInsertionsUs",
            "value": 3778.9769999999407,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/add_liquidity/5/totalInstructionsExecuted",
            "value": 8919,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/add_liquidity/5/totalDurationMs",
            "value": 161.82975399999987,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/add_liquidity/5/manaUsed",
            "value": 250443,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/add_liquidity/5/txHashMs",
            "value": 21.201834999999846,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/add_liquidity/5/nonRevertiblePrivateInsertionsUs",
            "value": 2912.8860000000714,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/add_liquidity/5/revertiblePrivateInsertionsUs",
            "value": 742.3289999996996,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/swap_exact_tokens_for_tokens/6/totalInstructionsExecuted",
            "value": 5602,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/swap_exact_tokens_for_tokens/6/totalDurationMs",
            "value": 113.51652999999988,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/swap_exact_tokens_for_tokens/6/manaUsed",
            "value": 141372,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/swap_exact_tokens_for_tokens/6/txHashMs",
            "value": 21.140504999999393,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/swap_exact_tokens_for_tokens/6/nonRevertiblePrivateInsertionsUs",
            "value": 2174.6570000004795,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/swap_exact_tokens_for_tokens/6/revertiblePrivateInsertionsUs",
            "value": 650.4279999999198,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/remove_liquidity/7/totalInstructionsExecuted",
            "value": 9974,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/remove_liquidity/7/totalDurationMs",
            "value": 158.89314600000034,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/remove_liquidity/7/manaUsed",
            "value": 266909,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/remove_liquidity/7/txHashMs",
            "value": 21.109933000000638,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/remove_liquidity/7/nonRevertiblePrivateInsertionsUs",
            "value": 2287.4990000000253,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AMM contract tests/AMM/remove_liquidity/7/revertiblePrivateInsertionsUs",
            "value": 700.8690000002389,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmTest contract tests/AvmTest/bulk_testing/0/totalInstructionsExecuted",
            "value": 25908,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmTest contract tests/AvmTest/bulk_testing/0/totalDurationMs",
            "value": 249.62563200000022,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmTest contract tests/AvmTest/bulk_testing/0/manaUsed",
            "value": 540316,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmTest contract tests/AvmTest/bulk_testing/0/txHashMs",
            "value": 21.145024999999805,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmTest contract tests/AvmTest/bulk_testing/0/nonRevertiblePrivateInsertionsUs",
            "value": 2239.4580000000133,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmTest contract tests/AvmTest/bulk_testing/0/revertiblePrivateInsertionsUs",
            "value": 703.389000000243,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_10/0/totalInstructionsExecuted",
            "value": 5033,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_10/0/totalDurationMs",
            "value": 105.6395309999998,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_10/0/manaUsed",
            "value": 88512,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_10/0/txHashMs",
            "value": 21.120124000000033,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_10/0/nonRevertiblePrivateInsertionsUs",
            "value": 2149.0469999998822,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_10/0/revertiblePrivateInsertionsUs",
            "value": 711.1390000000029,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_20/1/totalInstructionsExecuted",
            "value": 5857,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_20/1/totalDurationMs",
            "value": 58.667004000000816,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_20/1/manaUsed",
            "value": 104100,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_20/1/txHashMs",
            "value": 21.244176000000152,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_20/1/nonRevertiblePrivateInsertionsUs",
            "value": 2164.5269999999073,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_20/1/revertiblePrivateInsertionsUs",
            "value": 662.2580000002927,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_30/2/totalInstructionsExecuted",
            "value": 6978,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_30/2/totalDurationMs",
            "value": 61.19398599999931,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_30/2/manaUsed",
            "value": 124476,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_30/2/txHashMs",
            "value": 21.08508299999994,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_30/2/nonRevertiblePrivateInsertionsUs",
            "value": 2113.886000000093,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_30/2/revertiblePrivateInsertionsUs",
            "value": 630.6070000000545,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_40/3/totalInstructionsExecuted",
            "value": 7951,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_40/3/totalDurationMs",
            "value": 64.38278499999979,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_40/3/manaUsed",
            "value": 142215,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_40/3/txHashMs",
            "value": 21.265456000000086,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_40/3/nonRevertiblePrivateInsertionsUs",
            "value": 2184.917000000496,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_40/3/revertiblePrivateInsertionsUs",
            "value": 678.2190000003538,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_50/4/totalInstructionsExecuted",
            "value": 9074,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_50/4/totalDurationMs",
            "value": 67.58588500000042,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_50/4/manaUsed",
            "value": 162609,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_50/4/txHashMs",
            "value": 21.15297399999963,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_50/4/nonRevertiblePrivateInsertionsUs",
            "value": 2237.398000000212,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_50/4/revertiblePrivateInsertionsUs",
            "value": 651.3779999995677,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_60/5/totalInstructionsExecuted",
            "value": 10361,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_60/5/totalDurationMs",
            "value": 70.53223199999957,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_60/5/manaUsed",
            "value": 185553,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_60/5/txHashMs",
            "value": 21.08149400000002,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_60/5/nonRevertiblePrivateInsertionsUs",
            "value": 2740.1740000004793,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_60/5/revertiblePrivateInsertionsUs",
            "value": 657.5679999996282,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_70/6/totalInstructionsExecuted",
            "value": 11987,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_70/6/totalDurationMs",
            "value": 73.17814499999986,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_70/6/manaUsed",
            "value": 215892,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_70/6/txHashMs",
            "value": 21.001203000000714,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_70/6/nonRevertiblePrivateInsertionsUs",
            "value": 2129.186999999547,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_70/6/revertiblePrivateInsertionsUs",
            "value": 671.1279999999533,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_80/7/totalInstructionsExecuted",
            "value": 12987,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_80/7/totalDurationMs",
            "value": 79.97195999999985,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_80/7/manaUsed",
            "value": 234249,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_80/7/txHashMs",
            "value": 21.142414999999346,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_80/7/nonRevertiblePrivateInsertionsUs",
            "value": 2064.9359999997614,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_80/7/revertiblePrivateInsertionsUs",
            "value": 647.7390000000014,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_90/8/totalInstructionsExecuted",
            "value": 14140,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_90/8/totalDurationMs",
            "value": 81.25193600000057,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_90/8/manaUsed",
            "value": 255318,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_90/8/txHashMs",
            "value": 21.347606999999698,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_90/8/nonRevertiblePrivateInsertionsUs",
            "value": 2356.9790000001376,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_90/8/revertiblePrivateInsertionsUs",
            "value": 677.2389999996449,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_100/9/totalInstructionsExecuted",
            "value": 15140,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_100/9/totalDurationMs",
            "value": 80.17929299999923,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_100/9/manaUsed",
            "value": 273675,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_100/9/txHashMs",
            "value": 21.049893999999767,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_100/9/nonRevertiblePrivateInsertionsUs",
            "value": 2057.755000000725,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_100/9/revertiblePrivateInsertionsUs",
            "value": 622.6379999998244,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_255/10/totalInstructionsExecuted",
            "value": 33218,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_255/10/totalDurationMs",
            "value": 149.83218399999987,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_255/10/manaUsed",
            "value": 602967,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_255/10/txHashMs",
            "value": 21.2016050000002,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_255/10/nonRevertiblePrivateInsertionsUs",
            "value": 8313.46399999984,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_255/10/revertiblePrivateInsertionsUs",
            "value": 1017.6830000000336,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_256/11/totalInstructionsExecuted",
            "value": 33313,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_256/11/totalDurationMs",
            "value": 127.93409900000006,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_256/11/manaUsed",
            "value": 605454,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_256/11/txHashMs",
            "value": 21.17582500000026,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_256/11/nonRevertiblePrivateInsertionsUs",
            "value": 2075.7959999991726,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_256/11/revertiblePrivateInsertionsUs",
            "value": 648.1370000001334,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_511/12/totalInstructionsExecuted",
            "value": 62965,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_511/12/totalDurationMs",
            "value": 203.31546200000048,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_511/12/manaUsed",
            "value": 1145424,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_511/12/txHashMs",
            "value": 21.244305999998687,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_511/12/nonRevertiblePrivateInsertionsUs",
            "value": 2210.2080000004207,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_511/12/revertiblePrivateInsertionsUs",
            "value": 597.3970000013651,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_512/13/totalInstructionsExecuted",
            "value": 62918,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_512/13/totalDurationMs",
            "value": 203.07094900000084,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_512/13/manaUsed",
            "value": 1145871,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_512/13/txHashMs",
            "value": 21.425677999999607,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_512/13/nonRevertiblePrivateInsertionsUs",
            "value": 2201.557000000321,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_512/13/revertiblePrivateInsertionsUs",
            "value": 714.9690000005648,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_2048/14/totalInstructionsExecuted",
            "value": 240570,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_2048/14/totalDurationMs",
            "value": 656.007794000001,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_2048/14/manaUsed",
            "value": 4389303,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_2048/14/txHashMs",
            "value": 21.11053300000094,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_2048/14/nonRevertiblePrivateInsertionsUs",
            "value": 2111.6860000001907,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/sha256_hash_2048/14/revertiblePrivateInsertionsUs",
            "value": 643.4879999997065,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_hash/15/totalInstructionsExecuted",
            "value": 9484,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_hash/15/totalDurationMs",
            "value": 67.89277000000038,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_hash/15/manaUsed",
            "value": 175077,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_hash/15/txHashMs",
            "value": 21.082422999999835,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_hash/15/nonRevertiblePrivateInsertionsUs",
            "value": 2114.277000000584,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_hash/15/revertiblePrivateInsertionsUs",
            "value": 679.7580000002199,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_f1600/16/totalInstructionsExecuted",
            "value": 3079,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_f1600/16/totalDurationMs",
            "value": 48.79489999999896,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_f1600/16/manaUsed",
            "value": 54405,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_f1600/16/txHashMs",
            "value": 21.025243000000046,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_f1600/16/nonRevertiblePrivateInsertionsUs",
            "value": 2026.7650000005233,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/keccak_f1600/16/revertiblePrivateInsertionsUs",
            "value": 670.3980000002048,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/poseidon2_hash/17/totalInstructionsExecuted",
            "value": 2207,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/poseidon2_hash/17/totalDurationMs",
            "value": 49.80125299999963,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/poseidon2_hash/17/manaUsed",
            "value": 38118,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/poseidon2_hash/17/txHashMs",
            "value": 21.252016000000367,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/poseidon2_hash/17/nonRevertiblePrivateInsertionsUs",
            "value": 2185.6779999998253,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/poseidon2_hash/17/revertiblePrivateInsertionsUs",
            "value": 696.6680000004999,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash/18/totalInstructionsExecuted",
            "value": 22925,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash/18/totalDurationMs",
            "value": 362.02773799999886,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash/18/manaUsed",
            "value": 602277,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash/18/txHashMs",
            "value": 21.06755300000077,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash/18/nonRevertiblePrivateInsertionsUs",
            "value": 2051.274999999805,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash/18/revertiblePrivateInsertionsUs",
            "value": 627.1579999993264,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash_with_index/19/totalInstructionsExecuted",
            "value": 22928,
            "unit": "#instructions"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash_with_index/19/totalDurationMs",
            "value": 328.0425030000006,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash_with_index/19/manaUsed",
            "value": 602538,
            "unit": "mana"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash_with_index/19/txHashMs",
            "value": 21.08681400000023,
            "unit": "ms"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash_with_index/19/nonRevertiblePrivateInsertionsUs",
            "value": 2158.8969999993424,
            "unit": "us"
          },
          {
            "name": "yarn-project/simulator/AvmGadgetsTest contract tests/AvmGadgetsTest/pedersen_hash_with_index/19/revertiblePrivateInsertionsUs",
            "value": 638.2580000008602,
            "unit": "us"
          },
          {
            "name": "l1-contracts/forward (100_validators)",
            "value": 655059,
            "unit": "gas"
          },
          {
            "name": "l1-contracts/forward (100_validators) per l2 tx",
            "value": 1819.61,
            "unit": "gas"
          },
          {
            "name": "l1-contracts/forward (no_validators)",
            "value": 332346,
            "unit": "gas"
          },
          {
            "name": "l1-contracts/forward (no_validators) per l2 tx",
            "value": 923.18,
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
            "value": 1627567,
            "unit": "gas"
          },
          {
            "name": "l1-contracts/setupEpoch (100_validators) per l2 tx",
            "value": 141.28,
            "unit": "gas"
          },
          {
            "name": "l1-contracts/setupEpoch (no_validators)",
            "value": 84150,
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
            "value": 920325,
            "unit": "gas"
          },
          {
            "name": "l1-contracts/submitEpochRootProof (100_validators) per l2 tx",
            "value": 79.89,
            "unit": "gas"
          },
          {
            "name": "l1-contracts/submitEpochRootProof (no_validators)",
            "value": 920325,
            "unit": "gas"
          },
          {
            "name": "l1-contracts/submitEpochRootProof (no_validators) per l2 tx",
            "value": 79.89,
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
            "value": 211922,
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
            "value": 156800,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_4_4_4_4_4_4_4_4_4_opcodes",
            "value": 27176,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_4_4_4_4_4_4_4_4_4_gates",
            "value": 101130,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_base_public_opcodes",
            "value": 209839,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_base_public_gates",
            "value": 4526489,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_64_64_4_opcodes",
            "value": 37207,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_64_64_4_gates",
            "value": 170089,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_64_4_4_opcodes",
            "value": 32050,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_64_4_4_gates",
            "value": 119795,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_64_4_32_opcodes",
            "value": 41042,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_64_4_32_gates",
            "value": 210431,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_64_4_4_opcodes",
            "value": 38513,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_64_4_4_gates",
            "value": 205611,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_4_64_32_opcodes",
            "value": 40381,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_4_64_32_gates",
            "value": 200783,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_4_4_4_opcodes",
            "value": 32695,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_4_4_4_gates",
            "value": 145669,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_block_merge_opcodes",
            "value": 6971,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_block_merge_gates",
            "value": 1533674,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_4_4_32_opcodes",
            "value": 35224,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_4_4_32_gates",
            "value": 150490,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_root_opcodes",
            "value": 6982,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_root_gates",
            "value": 26789895,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_4_64_4_opcodes",
            "value": 34492,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_4_64_4_gates",
            "value": 151980,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_block_root_empty_opcodes",
            "value": 6403,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_block_root_empty_gates",
            "value": 708324,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_4_64_4_opcodes",
            "value": 34749,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_4_64_4_gates",
            "value": 154130,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_block_root_single_tx_opcodes",
            "value": 876814,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_block_root_single_tx_gates",
            "value": 3893724,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_32_32_32_32_32_32_32_32_opcodes",
            "value": 52340,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_32_32_32_32_32_32_32_32_gates",
            "value": 348148,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_4_4_4_opcodes",
            "value": 36055,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_4_4_4_gates",
            "value": 189652,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_4_64_32_opcodes",
            "value": 37278,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_4_64_32_gates",
            "value": 158950,
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
            "value": 147819,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_16_16_16_16_16_16_16_16_16_opcodes",
            "value": 37971,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_16_16_16_16_16_16_16_16_16_gates",
            "value": 207004,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_4_4_32_opcodes",
            "value": 32121,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_4_4_32_gates",
            "value": 108657,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_4_4_4_opcodes",
            "value": 29592,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_4_4_4_gates",
            "value": 103836,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_64_64_4_opcodes",
            "value": 33847,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_64_64_4_gates",
            "value": 126106,
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
            "value": 271420,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_base_private_gates",
            "value": 1895471,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_0_0_0_0_0_64_0_0_0_opcodes",
            "value": 20822,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_0_0_0_0_0_64_0_0_0_gates",
            "value": 56709,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_4_64_32_opcodes",
            "value": 33918,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_4_64_32_gates",
            "value": 114967,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_64_4_32_opcodes",
            "value": 34579,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_64_4_32_gates",
            "value": 124615,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_4_64_4_opcodes",
            "value": 37852,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_4_64_4_gates",
            "value": 195963,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_4_4_32_opcodes",
            "value": 38584,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_4_4_32_gates",
            "value": 194473,
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
            "value": 130926,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_opcodes",
            "value": 78051,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_gates",
            "value": 625445,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_block_root_opcodes",
            "value": 878258,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_block_root_gates",
            "value": 4690087,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_64_4_4_opcodes",
            "value": 35410,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_64_4_4_gates",
            "value": 163778,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_64_64_4_opcodes",
            "value": 36950,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_64_64_4_gates",
            "value": 167939,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_64_64_32_opcodes",
            "value": 39736,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_64_64_32_gates",
            "value": 174909,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_64_4_32_opcodes",
            "value": 37682,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_64_4_32_gates",
            "value": 166448,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_4_64_4_opcodes",
            "value": 31389,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_4_4_4_4_64_4_gates",
            "value": 110147,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_4_4_32_opcodes",
            "value": 35481,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_4_4_32_gates",
            "value": 152640,
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
            "value": 1726,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/rollup_merge_gates",
            "value": 1463557,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_64_4_32_opcodes",
            "value": 37939,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_4_32_16_4_4_64_4_32_gates",
            "value": 168598,
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
            "value": 161628,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_64_64_32_opcodes",
            "value": 39479,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_4_4_4_64_64_32_gates",
            "value": 172759,
            "unit": "gates"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_64_64_32_opcodes",
            "value": 42839,
            "unit": "opcodes"
          },
          {
            "name": "noir-projects/noir-protocol-circuits/private_kernel_reset_32_16_32_16_4_4_64_64_32_gates",
            "value": 216742,
            "unit": "gates"
          }
        ]
      }
    ]
  }
}