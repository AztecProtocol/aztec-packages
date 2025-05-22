window.BENCHMARK_DATA = {
  "lastUpdate": 1747924003641,
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
      }
    ]
  }
}