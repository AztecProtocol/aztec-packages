window.BENCHMARK_DATA = {
  "lastUpdate": 1744925714182,
  "repoUrl": "https://github.com/AztecProtocol/aztec-packages",
  "entries": {
    "C++ Benchmark": [
      {
        "commit": {
          "author": {
            "email": "nicolas.venturo@gmail.com",
            "name": "Nicolás Venturo",
            "username": "nventuro"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": false,
          "id": "afd35789e6995647ea8fd9c9f6690a7bcbc69842",
          "message": "chore: fix mistery irreproducible bug (#13494)\n\nCloses https://github.com/AztecProtocol/aztec-packages/issues/10558.\n\nI didn't really fix anything, I just removed the 'fix' and couldn't\nreproduce.",
          "timestamp": "2025-04-14T13:28:42Z",
          "tree_id": "784619db0d0304595aac085ca1008e106e9f2068",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/afd35789e6995647ea8fd9c9f6690a7bcbc69842"
        },
        "date": 1744641356910,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 30501,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 18061,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 9199,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10794,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12812,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "santiago@aztecprotocol.com",
            "name": "Santiago Palladino",
            "username": "spalladino"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": false,
          "id": "1b97cd2055e6b77974eea43ba66503b875d42f14",
          "message": "feat: Validator waits for archiver sync (#13497)\n\nSlow validators may receive a proposal to attest to before their\narchiver has synced to the block immediately before. Example log:\n\n```\n[18:02:27.581] ERROR: validator Failed to attest to proposal: Error: Unable to sync to block number 4811 (last synced is 4810)\n    at ServerWorldStateSynchronizer.syncImmediate (file:///usr/src/yarn-project/world-state/dest/synchronizer/server_world_state_synchronizer.js:145:19)\n    at async Sequencer.buildBlock (file:///usr/src/yarn-project/sequencer-client/dest/sequencer/sequencer.js:351:9)\n    at async ValidatorClient.reExecuteTransactions (file:///usr/src/yarn-project/validator-client/dest/validator.js:161:41)\n    at async ValidatorClient.attestToProposal (file:///usr/src/yarn-project/validator-client/dest/validator.js:127:17)\n    at async LibP2PService.processValidBlockProposal (file:///usr/src/yarn-project/p2p/dest/services/libp2p/libp2p_service.js:451:29)\n    at async LibP2PService.processBlockFromPeer (file:///usr/src/yarn-project/p2p/dest/services/libp2p/libp2p_service.js:441:9)\n    at async LibP2PService.handleNewGossipMessage (file:///usr/src/yarn-project/p2p/dest/services/libp2p/libp2p_service.js:355:13)\n    at async safeJob (file:///usr/src/yarn-project/p2p/dest/services/libp2p/libp2p_service.js:285:17) {\"slotNumber\":7976,\"blockNumber\":4812,\"archive\":\"0x1f26b22cdad7132d0bb06461300a27b12fde92b633633550e37764d810304cb4\",\"txCount\":0,\"txHashes\":[]}\n[18:02:29.560] INFO: archiver Downloaded L2 block 4811 {\"blockHash\":{},\"blockNumber\":4811,\"txCount\":0,\"globalVariables\":{\"chainId\":11155111,\"version\":3538330213,\"blockNumber\":4811,\"slotNumber\":7975,\"timestamp\":1744394520,\"coinbase\":\"0x2b64d6efab183a85f0b37e02b1975cd9f2d98068\",\"feeRecipient\":\"0x0000000000000000000000000000000000000000000000000000000000000000\",\"feePerDaGas\":0,\"feePerL2Gas\":0}}\n```\n\nThis PR has the validator keep retrying to sync to the target block\nuntil the reexecution deadline, rather than giving up immediately.",
          "timestamp": "2025-04-14T17:16:26Z",
          "tree_id": "51d2532f94267dcda9e5aad10e8fff867c4f68b3",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1b97cd2055e6b77974eea43ba66503b875d42f14"
        },
        "date": 1744655585845,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 30655,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17849,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 9225,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10951,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12692,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "94871c5920fec556b5351e42bf59d9e8daa2bc89",
          "message": "docs(bb): how to get wasm stack traces in bb.js (#13538)",
          "timestamp": "2025-04-14T18:02:44Z",
          "tree_id": "9f0a73f0ee03e3742b2ec20c5fa60012d05a9b73",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/94871c5920fec556b5351e42bf59d9e8daa2bc89"
        },
        "date": 1744657873055,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20727.50229300004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15621.455235000001 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 123230544503,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 2125036988,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 228394564,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 19809.05802999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16825.116639 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 56960.407242,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 56960409000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4094.956959000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3493.3341140000007 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 12031.612199,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 12031618000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2209.56",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
          "id": "f7fb5e651f2f73bdd224b3a4d2e5b742bbe4ca47",
          "message": "chore: use heap buffer methods for civc proof in bbjs (#13541)\n\nAdd \"heap buffer\" serialization for CIVC Proof type and use in bbjs\nmethods",
          "timestamp": "2025-04-14T22:07:25Z",
          "tree_id": "8dd4fb88b6d5b3b427ef618506a650fd6dff2a22",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f7fb5e651f2f73bdd224b3a4d2e5b742bbe4ca47"
        },
        "date": 1744672888276,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20896.108519000336,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15771.829500999998 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 123284297521.9,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 2114999674,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 230294940,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 19690.10065900011,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16600.532649 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 56384.278655,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 56384282000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4119.343459999982,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3520.653807 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11927.993765,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11927995000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2249.56",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
          "id": "f7fb5e651f2f73bdd224b3a4d2e5b742bbe4ca47",
          "message": "chore: use heap buffer methods for civc proof in bbjs (#13541)\n\nAdd \"heap buffer\" serialization for CIVC Proof type and use in bbjs\nmethods",
          "timestamp": "2025-04-14T22:07:25Z",
          "tree_id": "8dd4fb88b6d5b3b427ef618506a650fd6dff2a22",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f7fb5e651f2f73bdd224b3a4d2e5b742bbe4ca47"
        },
        "date": 1744672899104,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 30731,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17951,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 9162,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10799,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12709,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "distinct": false,
          "id": "5e8b0922bd5375cb038bb85bbf7751c48ae32aa6",
          "message": "feat: more tests for pairing point object (#13500)\n\nAdds integration tests to test that CIVC pass with\nHonkRecursionConstraints, and that tampering with the VK doesn't cause\nthings to fail (yet).",
          "timestamp": "2025-04-15T00:29:36Z",
          "tree_id": "7810c86a2da7a939065e619e524188eec8395af8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5e8b0922bd5375cb038bb85bbf7751c48ae32aa6"
        },
        "date": 1744681648834,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20789.459622999857,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15831.777237 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 123238641428.2,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 2163917739,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 244854605,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 19944.5195899998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16823.433979999998 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 56285.274355,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 56285279000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4054.205249000006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3479.524525 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11958.124518,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11958131000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2249.56",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
          "distinct": false,
          "id": "5e8b0922bd5375cb038bb85bbf7751c48ae32aa6",
          "message": "feat: more tests for pairing point object (#13500)\n\nAdds integration tests to test that CIVC pass with\nHonkRecursionConstraints, and that tampering with the VK doesn't cause\nthings to fail (yet).",
          "timestamp": "2025-04-15T00:29:36Z",
          "tree_id": "7810c86a2da7a939065e619e524188eec8395af8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5e8b0922bd5375cb038bb85bbf7751c48ae32aa6"
        },
        "date": 1744681658297,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 30385,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 18024,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 9168,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10838,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12621,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "distinct": false,
          "id": "9a5dc93c7e2ae7cce604757051bc3b7da5ae30d5",
          "message": "chore: bench ivc in native/wasm with memory/time (#13186)\n\nAdds ability to just call the main.cpp flow in wasm, allowing us to\neasily port our current benchmark to wasm, and measures time + memory\n\n- support compiling bb cli (main.cpp logic) in WASM, shim the no\nexceptions support accordingly. Note this is ONLY FOR wasmtime dev\ntesting. It does not get us browser support because the WASI file system\nAPI is not defined there.\n- add an experimental no exceptions build for native, to be benchmarked\n- support benching both wasm and native and capture their memory amounts\n- support a NATIVE_PRESET env var that controls bootstrap and benchmarks\nto opt into op count time metrics\n- more condensed printing of ivc trace amounts, just printing the\nmaximums and printing multiple counts on one line\n- Tricky change: Fix a static initialization bug when compiling plookup\ntables in wasm. a function static was used\n\nCloses https://github.com/AztecProtocol/barretenberg/issues/1244\n\n---------\n\nCo-authored-by: Copilot <175728472+Copilot@users.noreply.github.com>",
          "timestamp": "2025-04-15T00:31:53Z",
          "tree_id": "c3b92f293fd64bda64ceab543f19cb91a4c33111",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9a5dc93c7e2ae7cce604757051bc3b7da5ae30d5"
        },
        "date": 1744682179571,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17348.30423600033,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13538.612378 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2257771723,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 189492325,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 19805.274469000324,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16830.984804 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55966.440880999995,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55966443000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4205.197573000532,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3606.485619 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11629.197632999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11629200000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2215.75",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
          "distinct": false,
          "id": "9a5dc93c7e2ae7cce604757051bc3b7da5ae30d5",
          "message": "chore: bench ivc in native/wasm with memory/time (#13186)\n\nAdds ability to just call the main.cpp flow in wasm, allowing us to\neasily port our current benchmark to wasm, and measures time + memory\n\n- support compiling bb cli (main.cpp logic) in WASM, shim the no\nexceptions support accordingly. Note this is ONLY FOR wasmtime dev\ntesting. It does not get us browser support because the WASI file system\nAPI is not defined there.\n- add an experimental no exceptions build for native, to be benchmarked\n- support benching both wasm and native and capture their memory amounts\n- support a NATIVE_PRESET env var that controls bootstrap and benchmarks\nto opt into op count time metrics\n- more condensed printing of ivc trace amounts, just printing the\nmaximums and printing multiple counts on one line\n- Tricky change: Fix a static initialization bug when compiling plookup\ntables in wasm. a function static was used\n\nCloses https://github.com/AztecProtocol/barretenberg/issues/1244\n\n---------\n\nCo-authored-by: Copilot <175728472+Copilot@users.noreply.github.com>",
          "timestamp": "2025-04-15T00:31:53Z",
          "tree_id": "c3b92f293fd64bda64ceab543f19cb91a4c33111",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9a5dc93c7e2ae7cce604757051bc3b7da5ae30d5"
        },
        "date": 1744682189108,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm",
            "value": 87543,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm-memory",
            "value": 87543,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm",
            "value": 51354,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm-memory",
            "value": 51354,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm",
            "value": 29583,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm-memory",
            "value": 29583,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm",
            "value": 34746,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm-memory",
            "value": 34746,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm",
            "value": 43933,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm-memory",
            "value": 43933,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
          "id": "a7cfbbe8595ae3bdc4c7dd204dac524c03bbb358",
          "message": "fix: cpp bench ci (#13565)",
          "timestamp": "2025-04-15T10:10:17-04:00",
          "tree_id": "8d40dee5b283e69d03eb5715cdbc408c7d6be5ab",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a7cfbbe8595ae3bdc4c7dd204dac524c03bbb358"
        },
        "date": 1744729039361,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17369.478817000072,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13671.656391 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2227216851,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 199190559,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 20117.108548000033,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17068.405635000003 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55765.127112,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55765128000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4250.779878999992,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3649.4973249999994 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11652.293496,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11652297000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2215.75",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
          "id": "a7cfbbe8595ae3bdc4c7dd204dac524c03bbb358",
          "message": "fix: cpp bench ci (#13565)",
          "timestamp": "2025-04-15T10:10:17-04:00",
          "tree_id": "8d40dee5b283e69d03eb5715cdbc408c7d6be5ab",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a7cfbbe8595ae3bdc4c7dd204dac524c03bbb358"
        },
        "date": 1744729049578,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm",
            "value": 86580,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm-memory",
            "value": 86580,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm",
            "value": 51047,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm-memory",
            "value": 51047,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm",
            "value": 29356,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm-memory",
            "value": 29356,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm",
            "value": 34786,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm-memory",
            "value": 34786,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm",
            "value": 42571,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm-memory",
            "value": 42571,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
          "distinct": false,
          "id": "a89de5d213cf5d5cdbdc4e2e308848a20e64ef5f",
          "message": "refactor(public/avm): from hints to the end of the world (#13459)\n\nI had a few design goals with this PR\n1. Move the merkle hinting layer to the merkle db directly (from the\nPublicContractsDB)\n1. Make hinting a TxSimulator concept\n1. Divide the tree accesses into low level and high level (like we do in\nC++).\n1. Tighten our exports\n1. Some cleanups\n\nI'm satisfied with the result, but there are some things worth noting\n* Now the TxSimulator wraps the merkle db into a hinting merkle db. This\nmeans that the hints will _always_ be generated and the caller has no\ncontrol. However, reexecution and the TXE could benefit from a model\nwhere no hinting (or tracing) is done. I had a version of this PR where\nthis was done via an extra PublicTreesDBFactory that was passed to the\nTxSimulator, but I found it too much for the moment. I think at some\npoint we can consider having a more flexible factory type for the\nPublicProcessor and the TxSimulator where we can specify, e.g., merkle\nops, tracing, hinting, etc and have a \"Proving\" factory and a\n\"Simulation-only\" factory.\n\n## AI generated description\n\nThis PR refactors the public processor and simulator components to use\n`MerkleTreeWriteOperations` directly instead of going through the\n`PublicTreesDB` abstraction. Key changes include:\n\n- Changed `PublicTxSimulator` to accept a `MerkleTreeWriteOperations`\ninstead of `PublicTreesDB`\n- Moved `PublicTreesDB` to be an internal implementation detail rather\nthan a public API\n- Refactored `HintingPublicTreesDB` to `HintingMerkleWriteOperations` to\nwork directly with the merkle tree interface\n- Moved `SimpleContractDataSource` from `avm/fixtures` to\n`public/fixtures` for better organization\n- Added high-level methods to `PublicTreesDB` for writing note hashes\nand nullifiers\n- Simplified tree operations in `PublicPersistableStateManager` by using\nthe new high-level methods\n- Updated `checkL1ToL2MessageExists` to no longer require a contract\naddress parameter\n\nThis change simplifies the codebase by reducing unnecessary abstractions\nand making the component dependencies more explicit.",
          "timestamp": "2025-04-15T14:59:39Z",
          "tree_id": "859d0be15b138c9bbe6d544b98552e8443fb7953",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a89de5d213cf5d5cdbdc4e2e308848a20e64ef5f"
        },
        "date": 1744732446101,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm",
            "value": 86722,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm-memory",
            "value": 86722,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm",
            "value": 51013,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm-memory",
            "value": 51013,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm",
            "value": 30377,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm-memory",
            "value": 30377,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm",
            "value": 33699,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm-memory",
            "value": 33699,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm",
            "value": 42040,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm-memory",
            "value": 42040,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "nicolas.venturo@gmail.com",
            "name": "Nicolás Venturo",
            "username": "nventuro"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": false,
          "id": "ea12d56bbd83b127f27787695d398b40aa2a36f7",
          "message": "fix: make the token use large notes first (#13545)\n\nThis fixes an issue @alexghr has encountered where the AMM bot crashes\ndue to trying to use too many small notes. There's other things to fix\n(make `transfer_to_public` recursive, have better max notes limits,\netc.), but this quick patch will fix most issues (unless someone needs\nto combine more than 15 notes for a transfer), so it's a good stopgap\nmeasure.\n\nThe fix is trivial, but adding tests for it is not, reflecting TXE's\npoor state of affairs. I wanted to test that regardless of the order in\nwhich two notes are created, we always consume the larger one first, but\na) was forced to write two separate tests, since it seems we lack\ncontrol over TXE's execution cache (notably transient nullified notes),\nand b) was forced to use the actual token contract and to call contract\nfunctions due to #13269. Usage of `set_contract_address` is also quite\nobscure.\n\nEach test could e.g. have looked like this, which is much simpler and\nhas way fewer moving pieces:\n\n```noir\nenv.private_tx(|context| => {\n    let storage_slot = 5;\n    let balance_set =\n        BalanceSet::new(context, storage_slot);\n\n    recipient_balance_set.add(owner, small_note_amount);\n    recipient_balance_set.add(owner, large_note_amount);\n});\n\nenv.private_tx(|context| => {\n    let storage_slot = 5;\n    let balance_set =\n        BalanceSet::new(context, storage_slot);\n\n    let emission = recipient_balance_set.sub(owner, small_note_amount);\n    assert_eq(emission.emission.unwrap().note.value, large_mint_amount - small_mint_amount);\n});\n```\n\nI guess we'd need to explicitly deal with note discovery via oracle\nhints in that case, but regardless it seems solvable. It'd also let us\ntest that this works for both transient and settled notes, or even a mix\n(which is something we should have extensive coverage of in the almost\nnon-existent note getter options tests).",
          "timestamp": "2025-04-15T15:05:29Z",
          "tree_id": "eb29cd8ce9439d0246d24970dd5d08cd63ff0ea0",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ea12d56bbd83b127f27787695d398b40aa2a36f7"
        },
        "date": 1744732913990,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm",
            "value": 87274,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm-memory",
            "value": 87274,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm",
            "value": 52117,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm-memory",
            "value": 52117,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm",
            "value": 29497,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm-memory",
            "value": 29497,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm",
            "value": 34134,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm-memory",
            "value": 34134,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm",
            "value": 42740,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm-memory",
            "value": 42740,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
          "distinct": false,
          "id": "6b938322017ba4fa0baaf35be09c1c28b80e2dba",
          "message": "fix: amm bot (#13553)\n\nFix #13544",
          "timestamp": "2025-04-15T15:24:13Z",
          "tree_id": "bacb6480e099c6c677477c77d97bd770ae673079",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/6b938322017ba4fa0baaf35be09c1c28b80e2dba"
        },
        "date": 1744733932443,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm",
            "value": 87947,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm-memory",
            "value": 87947,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm",
            "value": 52939,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm-memory",
            "value": 52939,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm",
            "value": 29639,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm-memory",
            "value": 29639,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm",
            "value": 33814,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm-memory",
            "value": 33814,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm",
            "value": 42548,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm-memory",
            "value": 42548,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "47148561+Maddiaa0@users.noreply.github.com",
            "name": "Maddiaa",
            "username": "Maddiaa0"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": false,
          "id": "42dfbbf6e11b63727add72987edbbea08fb21e64",
          "message": "chore(noir-contracts): update readme (#13563)\n\nCurrent prose is unacceptable\n\nCo-authored-by: ludamad <adam.domurad@gmail.com>",
          "timestamp": "2025-04-15T15:25:00Z",
          "tree_id": "78e1c92de1f31112390c265aa97c947583cb9fdb",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/42dfbbf6e11b63727add72987edbbea08fb21e64"
        },
        "date": 1744734270106,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm",
            "value": 87834,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm-memory",
            "value": 87834,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm",
            "value": 51481,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm-memory",
            "value": 51481,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm",
            "value": 29743,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm-memory",
            "value": 29743,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm",
            "value": 34350,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm-memory",
            "value": 34350,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm",
            "value": 42839,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm-memory",
            "value": 42839,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
          "distinct": false,
          "id": "9a73c4a874f4f03f1f9de3a3cd9c8f57f742b32a",
          "message": "fix: wasm memory benchmark (#13573)",
          "timestamp": "2025-04-15T15:44:23Z",
          "tree_id": "e7374c7f21712a84f3e75eb9daef62489303baa7",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9a73c4a874f4f03f1f9de3a3cd9c8f57f742b32a"
        },
        "date": 1744736646485,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17510.197292000157,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13903.298712 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2241879681,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 217064167,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 19850.672813000074,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16958.849911 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 56189.26439,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 56189265000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4277.0219570002155,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3627.702583 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11889.4362,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11889440000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2335.75",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
          "distinct": false,
          "id": "9a73c4a874f4f03f1f9de3a3cd9c8f57f742b32a",
          "message": "fix: wasm memory benchmark (#13573)",
          "timestamp": "2025-04-15T15:44:23Z",
          "tree_id": "e7374c7f21712a84f3e75eb9daef62489303baa7",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9a73c4a874f4f03f1f9de3a3cd9c8f57f742b32a"
        },
        "date": 1744736656404,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm",
            "value": 87340,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm-memory",
            "value": 2211,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm",
            "value": 51823,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm-memory",
            "value": 1852,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm",
            "value": 29863,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm-memory",
            "value": 1841,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm",
            "value": 34001,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm-memory",
            "value": 1748,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm",
            "value": 42330,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm-memory",
            "value": 1846,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
          "distinct": false,
          "id": "b30b5b3bf13cf0aa556fc25c7f57869044a6a4ed",
          "message": "feat(avm): tagged value type in C++ (#13540)\n\nThe main new class is in `tagged_value.{hpp,cpp}`. You can see its use\nin `memory.{hpp,cpp}` and... everywhere. It was already all over the\nplace so it's a good thing that we tackle it now. It was a bit of a\npain.\n\n## AI generated description\n\nThis PR introduces a new `TaggedValue` class to replace the previous\nmemory value representation. The `TaggedValue` class encapsulates both a\nvalue and its type tag, providing a more robust and type-safe way to\nhandle different data types in the VM.\n\nKey changes:\n- Added `TaggedValue` class that uses a variant to store different\nnumeric types (uint1_t, uint8_t, uint16_t, etc.)\n- Implemented a new `uint1_t` class to represent boolean values\n- Updated memory operations to use `TaggedValue` instead of separate\nvalue and tag parameters\n- Modified bitwise operations to work with the new `TaggedValue` type\n- Updated all related code to use the new type system, including tests\nand simulation code",
          "timestamp": "2025-04-15T16:09:36Z",
          "tree_id": "41e26edd1182b5375e58a8477c0efab9eb06c569",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/b30b5b3bf13cf0aa556fc25c7f57869044a6a4ed"
        },
        "date": 1744738040705,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17434.942499000044,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13820.594966 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2224079580,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 198570723,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 20021.01738800002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17013.510328 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 56802.109099,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 56802110000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4328.122112000528,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3692.335405 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11911.790163000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11911793000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2335.75",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
          "distinct": false,
          "id": "b30b5b3bf13cf0aa556fc25c7f57869044a6a4ed",
          "message": "feat(avm): tagged value type in C++ (#13540)\n\nThe main new class is in `tagged_value.{hpp,cpp}`. You can see its use\nin `memory.{hpp,cpp}` and... everywhere. It was already all over the\nplace so it's a good thing that we tackle it now. It was a bit of a\npain.\n\n## AI generated description\n\nThis PR introduces a new `TaggedValue` class to replace the previous\nmemory value representation. The `TaggedValue` class encapsulates both a\nvalue and its type tag, providing a more robust and type-safe way to\nhandle different data types in the VM.\n\nKey changes:\n- Added `TaggedValue` class that uses a variant to store different\nnumeric types (uint1_t, uint8_t, uint16_t, etc.)\n- Implemented a new `uint1_t` class to represent boolean values\n- Updated memory operations to use `TaggedValue` instead of separate\nvalue and tag parameters\n- Modified bitwise operations to work with the new `TaggedValue` type\n- Updated all related code to use the new type system, including tests\nand simulation code",
          "timestamp": "2025-04-15T16:09:36Z",
          "tree_id": "41e26edd1182b5375e58a8477c0efab9eb06c569",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/b30b5b3bf13cf0aa556fc25c7f57869044a6a4ed"
        },
        "date": 1744738051173,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm",
            "value": 87566,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm-memory",
            "value": 2205,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm",
            "value": 52963,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm-memory",
            "value": 1797,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm",
            "value": 29806,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm-memory",
            "value": 1793,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm",
            "value": 33858,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm-memory",
            "value": 1784,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm",
            "value": 42372,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm-memory",
            "value": 1876,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "16536249+LHerskind@users.noreply.github.com",
            "name": "Lasse Herskind",
            "username": "LHerskind"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "1a3a326ef99340a61e917b3c2f8a6484337c0ad7",
          "message": "chore: mint block rewards for 200K blocks at deployment (#13537)\n\nFund the reward distributor with funds for 200K blocks as part of the\ndeployments.",
          "timestamp": "2025-04-15T17:03:40Z",
          "tree_id": "4f6853098244f141aa6da5921c51bdbc66e13de1",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1a3a326ef99340a61e917b3c2f8a6484337c0ad7"
        },
        "date": 1744740116347,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm",
            "value": 88052,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm-memory",
            "value": 2234,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm",
            "value": 51790,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm-memory",
            "value": 1857,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm",
            "value": 30001,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm-memory",
            "value": 1801,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm",
            "value": 34076,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm-memory",
            "value": 1780,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm",
            "value": 42793,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm-memory",
            "value": 1768,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "santiago@aztecprotocol.com",
            "name": "Santiago Palladino",
            "username": "spalladino"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "a296945ca8ef4e8b1fbfd9870eaf6030596cf241",
          "message": "chore: Cleanup scripts in package jsons in yarn-project (#13527)\n\n- Removes all `formatting` scripts in individual packages\n- Delegates `test`, `lint`, and `format` in the root to bootstrap.sh\n- Directly calls `tsc` for building on the root\n- Removes unmaintained watch script",
          "timestamp": "2025-04-15T18:19:27Z",
          "tree_id": "20194fade3cd215689866b882730ebf4952d5c40",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a296945ca8ef4e8b1fbfd9870eaf6030596cf241"
        },
        "date": 1744745513120,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm",
            "value": 87553,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm-memory",
            "value": 2226,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm",
            "value": 52751,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm-memory",
            "value": 1769,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm",
            "value": 29547,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm-memory",
            "value": 1842,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm",
            "value": 33784,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm-memory",
            "value": 1769,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm",
            "value": 42844,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm-memory",
            "value": 1707,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
          "distinct": false,
          "id": "498d4334eae71676e688aedae1d8d157b6345347",
          "message": "chore: add hacky faster bootstrap for bb-centric e2e flow (#13587)\n\nRight now a bb change will cause noir-projects to rebuild VKs, and other\ncomponents will conservatively rebuild. This can be used if you are sure\nyou have not changed VK construction. It means the other steps are\ngrabbed from cache - it also skips everything past yarn-project and\nshould be the fastest way to run e2e tests",
          "timestamp": "2025-04-15T21:31:08Z",
          "tree_id": "9920a020097ce9629196c94d79f3c1705872c111",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/498d4334eae71676e688aedae1d8d157b6345347"
        },
        "date": 1744756361556,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17261.84484400005,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13533.199256 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2231786449,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 190304422,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 20037.793832000032,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16797.789408 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55893.600119,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55893601000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4253.937114000109,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3736.180929 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11667.611336,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11667615000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2335.75",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
          "id": "3048a14c958976b9ce14b7a8640a4e671a6f882e",
          "message": "chore(bb): Make goblin a proper source module (#13580)\n\n- Also, don't just display one error in the IDE",
          "timestamp": "2025-04-15T21:59:00Z",
          "tree_id": "b374a9d481f578e80b1bdba6a788c4ad78d74366",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/3048a14c958976b9ce14b7a8640a4e671a6f882e"
        },
        "date": 1744759465115,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17324.981196999943,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13553.611948 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2233895697,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 204746885,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 19816.497435999736,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16697.506061 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 56563.727146000005,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 56563727000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4257.746359000521,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3697.352255 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11711.360772999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11711362000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2263.75",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
          "id": "3048a14c958976b9ce14b7a8640a4e671a6f882e",
          "message": "chore(bb): Make goblin a proper source module (#13580)\n\n- Also, don't just display one error in the IDE",
          "timestamp": "2025-04-15T21:59:00Z",
          "tree_id": "b374a9d481f578e80b1bdba6a788c4ad78d74366",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/3048a14c958976b9ce14b7a8640a4e671a6f882e"
        },
        "date": 1744759475175,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm",
            "value": 87561,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm-memory",
            "value": 2184,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm",
            "value": 52213,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm-memory",
            "value": 1863,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm",
            "value": 29529,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm-memory",
            "value": 1813,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm",
            "value": 33631,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm-memory",
            "value": 1800,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm",
            "value": 42507,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm-memory",
            "value": 1885,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
          "distinct": false,
          "id": "0ebb29ebf3798a17b162fadc6e9c0c7fcd98256a",
          "message": "chore(bb): debugging helpers (#13584)\n\nAllows for starting a vscode debugging session with whatever the cmake\ntarget currently selected is and with pretty-print helpers for fq, fr,\nuint256_t",
          "timestamp": "2025-04-15T23:02:01Z",
          "tree_id": "7afd67e45cbeadd910dc4dac17e3dc146703d875",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0ebb29ebf3798a17b162fadc6e9c0c7fcd98256a"
        },
        "date": 1744763228591,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17457.171965999805,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13724.37812 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2288768015,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 193166317,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 19888.720805000048,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16851.23208 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 56214.712318000005,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 56214712000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4275.321931000235,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3697.8842350000004 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11841.642586999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11841646000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2263.75",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
          "distinct": false,
          "id": "0ebb29ebf3798a17b162fadc6e9c0c7fcd98256a",
          "message": "chore(bb): debugging helpers (#13584)\n\nAllows for starting a vscode debugging session with whatever the cmake\ntarget currently selected is and with pretty-print helpers for fq, fr,\nuint256_t",
          "timestamp": "2025-04-15T23:02:01Z",
          "tree_id": "7afd67e45cbeadd910dc4dac17e3dc146703d875",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0ebb29ebf3798a17b162fadc6e9c0c7fcd98256a"
        },
        "date": 1744763238247,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm",
            "value": 87276,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm-memory",
            "value": 2259,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm",
            "value": 51750,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm-memory",
            "value": 1890,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm",
            "value": 29324,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm-memory",
            "value": 1765,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm",
            "value": 34623,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm-memory",
            "value": 1821,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm",
            "value": 42035,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm-memory",
            "value": 1866,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "gregojquiros@gmail.com",
            "name": "Gregorio Juliana",
            "username": "Thunkar"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "1ad924919ce90fa089ffd546dfb562c4d82af9dc",
          "message": "test: wasm proof verifying with native bb (#13499)\n\nMain feature\n- New test for testing wasm proof output verifying with native CLI,\nadapting the wasm ivc test in yarn-project\n\nAlso\n- dont hide test info by default\n- allow passing BB_WORKING_DIRECTORY env var and keeping outputs around\nlike in e2e\n- use new-style logger in wasm test, dedupe some setup code\n\n---------\n\nCo-authored-by: maramihali <mara@aztecprotocol.com>\nCo-authored-by: ledwards2225 <l.edwards.d@gmail.com>\nCo-authored-by: ludamad <domuradical@gmail.com>\nCo-authored-by: ludamad <adam.domurad@gmail.com>",
          "timestamp": "2025-04-16T00:34:17Z",
          "tree_id": "cc20ab2891a4c1ad6dbf094c8ec45e008bc0c7d9",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1ad924919ce90fa089ffd546dfb562c4d82af9dc"
        },
        "date": 1744766706825,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm",
            "value": 88239,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm-memory",
            "value": 2121,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm",
            "value": 51400,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm-memory",
            "value": 1864,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm",
            "value": 30107,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm-memory",
            "value": 1901,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm",
            "value": 34062,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm-memory",
            "value": 1840,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm",
            "value": 42923,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm-memory",
            "value": 1826,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "tech@aztecprotocol.com",
            "name": "AztecBot"
          },
          "committer": {
            "email": "tech@aztecprotocol.com",
            "name": "AztecBot"
          },
          "distinct": true,
          "id": "1dc92ef01fe73ced35b78c622c04e53f38dbfa24",
          "message": "git subrepo push --branch=master noir-projects/aztec-nr\n\nsubrepo:\n  subdir:   \"noir-projects/aztec-nr\"\n  merged:   \"6d4c70734f\"\nupstream:\n  origin:   \"https://github.com/AztecProtocol/aztec-nr\"\n  branch:   \"master\"\n  commit:   \"6d4c70734f\"\ngit-subrepo:\n  version:  \"0.4.6\"\n  origin:   \"???\"\n  commit:   \"???\"",
          "timestamp": "2025-04-16T02:30:44Z",
          "tree_id": "d521b1371129dc3447dfa9d9d360fa818f12b7a0",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1dc92ef01fe73ced35b78c622c04e53f38dbfa24"
        },
        "date": 1744772846532,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm",
            "value": 88022,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm-memory",
            "value": 2216,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm",
            "value": 51340,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm-memory",
            "value": 1897,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm",
            "value": 29338,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm-memory",
            "value": 1802,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm",
            "value": 34374,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm-memory",
            "value": 1836,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm",
            "value": 42800,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm-memory",
            "value": 1785,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
          "id": "df73c0528f56b50604febf3f9d02edbc370c7ce9",
          "message": "feat: Refactor IPA claim handling in acir format to support them for AVM (#13547)\n\nRefactor where we handle IPA claim handling to be at the acir_format\nlevel instead in within `process_honk_recursion_constraints`. This is\nneeded to handle circuits like the public base which will have AVM\nrecursion constraints and RollupHonk recursion constraints, which will\nnow BOTH produce IPA claims/proofs.\n\nFix Goblin AVM recursive verifier test and clean some small type-related\nthings.",
          "timestamp": "2025-04-16T02:23:30Z",
          "tree_id": "fa8082fa5a3086d61e878da4aa7c54d9931fbed7",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/df73c0528f56b50604febf3f9d02edbc370c7ce9"
        },
        "date": 1744775052826,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17374.060436000036,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13635.769610000001 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2245021070,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 207446971,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 19808.939674000158,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16670.528341999998 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55978.195664,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55978196000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4302.891421999902,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3752.696621 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11818.811772000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11818812000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2263.75",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
          "id": "df73c0528f56b50604febf3f9d02edbc370c7ce9",
          "message": "feat: Refactor IPA claim handling in acir format to support them for AVM (#13547)\n\nRefactor where we handle IPA claim handling to be at the acir_format\nlevel instead in within `process_honk_recursion_constraints`. This is\nneeded to handle circuits like the public base which will have AVM\nrecursion constraints and RollupHonk recursion constraints, which will\nnow BOTH produce IPA claims/proofs.\n\nFix Goblin AVM recursive verifier test and clean some small type-related\nthings.",
          "timestamp": "2025-04-16T02:23:30Z",
          "tree_id": "fa8082fa5a3086d61e878da4aa7c54d9931fbed7",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/df73c0528f56b50604febf3f9d02edbc370c7ce9"
        },
        "date": 1744775065489,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm",
            "value": 87474,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm-memory",
            "value": 2257,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm",
            "value": 52349,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm-memory",
            "value": 1892,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm",
            "value": 29525,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm-memory",
            "value": 1822,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm",
            "value": 33814,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm-memory",
            "value": 1789,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm",
            "value": 42065,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm-memory",
            "value": 1834,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "60546371+PhilWindle@users.noreply.github.com",
            "name": "PhilWindle",
            "username": "PhilWindle"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "9f0ff4a6bfed5f53ec2512e32c733e194c928cb7",
          "message": "chore: Updated contract addresses for alpha-testnet (#13585)\n\nThis PR simply updates the alpha-testnet contract addresses",
          "timestamp": "2025-04-16T13:54:07Z",
          "tree_id": "a829796f55fd5d13553aa1c05d6def06693f522d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9f0ff4a6bfed5f53ec2512e32c733e194c928cb7"
        },
        "date": 1744815209288,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm",
            "value": 88004,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm-memory",
            "value": 2223,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm",
            "value": 51775,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm-memory",
            "value": 1873,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm",
            "value": 29605,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm-memory",
            "value": 1796,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm",
            "value": 33739,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm-memory",
            "value": 1848,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm",
            "value": 42227,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm-memory",
            "value": 1833,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "santiago@aztecprotocol.com",
            "name": "Santiago Palladino",
            "username": "spalladino"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": false,
          "id": "60e73f987f850ad0db8fcdce3e9e9d092f2fc0d0",
          "message": "chore: Fetch rollup address using version as index (#13620)\n\nIf fetching the rollup address given a version identifier fails, it\ntries again using it as an index instead.",
          "timestamp": "2025-04-16T16:43:39Z",
          "tree_id": "c230c80adfb26d86a4c41c3d290518f687d5d1db",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/60e73f987f850ad0db8fcdce3e9e9d092f2fc0d0"
        },
        "date": 1744825236758,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm",
            "value": 87673,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm-memory",
            "value": 2257,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm",
            "value": 52475,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm-memory",
            "value": 1890,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm",
            "value": 29530,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm-memory",
            "value": 1829,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm",
            "value": 33509,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm-memory",
            "value": 1800,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm",
            "value": 42225,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm-memory",
            "value": 1728,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "35969035+varex83@users.noreply.github.com",
            "name": "Bohdan Ohorodnii",
            "username": "varex83"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": false,
          "id": "4264c8cbcd0a44bab5c50ff1a3a28cc441b7b060",
          "message": "feat(p2p): add private peers (#12585)\n\nCloses #12444\n\n---------\n\nCo-authored-by: Nate Beauregard <nathanbeauregard@gmail.com>\nCo-authored-by: Maddiaa <47148561+Maddiaa0@users.noreply.github.com>\nCo-authored-by: Nate Beauregard <51711291+natebeauregard@users.noreply.github.com>",
          "timestamp": "2025-04-16T17:16:57Z",
          "tree_id": "06dd25b616ff83fd16fe835e26928140394f1c2b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/4264c8cbcd0a44bab5c50ff1a3a28cc441b7b060"
        },
        "date": 1744827327055,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm",
            "value": 87034,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm-memory",
            "value": 2209,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm",
            "value": 51287,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm-memory",
            "value": 1892,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm",
            "value": 29275,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm-memory",
            "value": 1811,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm",
            "value": 34468,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm-memory",
            "value": 1792,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm",
            "value": 41826,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm-memory",
            "value": 1885,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
          "id": "70c58ab773c7e8e2ed2bcc4eb7acbeec31477200",
          "message": "fix: update metric name to avoid conflicts (#13629)\n\nFix #13626",
          "timestamp": "2025-04-16T18:00:31Z",
          "tree_id": "deff475860a9797291468cfb79f8dac7115500ad",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/70c58ab773c7e8e2ed2bcc4eb7acbeec31477200"
        },
        "date": 1744830372515,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm",
            "value": 87703,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm-memory",
            "value": 2190,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm",
            "value": 52349,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm-memory",
            "value": 1860,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm",
            "value": 29461,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm-memory",
            "value": 1815,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm",
            "value": 34035,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm-memory",
            "value": 1880,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm",
            "value": 42575,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm-memory",
            "value": 1817,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
          "distinct": false,
          "id": "caac1c911722c6ec43cba85cf2b6786a247bfc52",
          "message": "refactor(avm): move interaction jobs to trace builders (#13621)\n\nNext step is to make the tests use these, so that we are sure we are\ntesting the way we generate lookups in prod.\n\nHowever this is not trivial because sometimes we want to use subsets, or\nwe want to expect failures when running particular subsets. Will think\nmore about how to do this. I have some ideas.",
          "timestamp": "2025-04-16T17:35:10Z",
          "tree_id": "fce066832067441f1db3bba56014f46fc872ae9d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/caac1c911722c6ec43cba85cf2b6786a247bfc52"
        },
        "date": 1744830374125,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17318.554066999695,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13648.604153999999 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2215403241,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 198916229,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 20080.305585000133,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16790.264558999996 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55956.364112999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55956363000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4291.58740100047,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3722.0894749999998 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 12253.977377,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 12253981000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2263.75",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
          "distinct": false,
          "id": "caac1c911722c6ec43cba85cf2b6786a247bfc52",
          "message": "refactor(avm): move interaction jobs to trace builders (#13621)\n\nNext step is to make the tests use these, so that we are sure we are\ntesting the way we generate lookups in prod.\n\nHowever this is not trivial because sometimes we want to use subsets, or\nwe want to expect failures when running particular subsets. Will think\nmore about how to do this. I have some ideas.",
          "timestamp": "2025-04-16T17:35:10Z",
          "tree_id": "fce066832067441f1db3bba56014f46fc872ae9d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/caac1c911722c6ec43cba85cf2b6786a247bfc52"
        },
        "date": 1744830383715,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm",
            "value": 87801,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm-memory",
            "value": 2222,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm",
            "value": 52449,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm-memory",
            "value": 1870,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm",
            "value": 29443,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm-memory",
            "value": 1699,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm",
            "value": 33757,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm-memory",
            "value": 1655,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm",
            "value": 42462,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm-memory",
            "value": 1838,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "75146596+Sarkoxed@users.noreply.github.com",
            "name": "Sarkoxed",
            "username": "Sarkoxed"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": false,
          "id": "f02123d95d6a84460b6535312f4d1de52e8e1e19",
          "message": "feat: SMT verification module updates (#13551)\n\nThis pr mostly consists of code refactoring/renames \n\n## Cmake\n\n`cvc5` build is now multi-threaded\n\n## Circuit Builders\n\n`CircuitBuilderBase` - added `circuit_finalized` into msgpack schema\n`UltraCircuitBuilder` - zero is now force renamed during circuit export\n\n## smt_subcircuits\n\nswitched `0xabbba` to `0` since it produced failures duirng circuit\ncreations\n\n## Solver\n\n- Added new method `get` and `operator[]`. These two methods extract the\nvalue of the variable from solver. Added a test\n- fixed the incorrectly placed `BITVECTOR_UDIV`\n- renamed `getValue` to `get_symbolic_value` to avoid confusion\n\n## Terms\n\n- New constructor, based on `bb::fr` value\n- Got rid of `isFiniteField` like members. Useless\n- Added `normalize` method, for more readability\n- Refactored the operators\n\n## SMT_Util\n\n- add `is_signed` flag in `string_to_fr()` to avoid overflows \n\n## Tests\n\nFor most part it's either a rename, engine switch or new `operator[]`\nrefactoring\n\nAlso \n- fixed an incorrect `extract_bit` test\n- \n\nAll the current changes are reflected in `README.md`\n\n---------\n\nCo-authored-by: Innokentii Sennovskii <isennovskiy@gmail.com>",
          "timestamp": "2025-04-16T19:05:39Z",
          "tree_id": "ed81b35b21e04f83e64049ed57e98b3ed1ca8ac9",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f02123d95d6a84460b6535312f4d1de52e8e1e19"
        },
        "date": 1744835229692,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17389.17140500007,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13574.152675 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2248297426,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 192011502,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 19942.926839999927,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16925.322164 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 56434.672778,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 56434673000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4269.953613000325,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3687.88259 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11894.960735999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11894964000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2263.75",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "75146596+Sarkoxed@users.noreply.github.com",
            "name": "Sarkoxed",
            "username": "Sarkoxed"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": false,
          "id": "f02123d95d6a84460b6535312f4d1de52e8e1e19",
          "message": "feat: SMT verification module updates (#13551)\n\nThis pr mostly consists of code refactoring/renames \n\n## Cmake\n\n`cvc5` build is now multi-threaded\n\n## Circuit Builders\n\n`CircuitBuilderBase` - added `circuit_finalized` into msgpack schema\n`UltraCircuitBuilder` - zero is now force renamed during circuit export\n\n## smt_subcircuits\n\nswitched `0xabbba` to `0` since it produced failures duirng circuit\ncreations\n\n## Solver\n\n- Added new method `get` and `operator[]`. These two methods extract the\nvalue of the variable from solver. Added a test\n- fixed the incorrectly placed `BITVECTOR_UDIV`\n- renamed `getValue` to `get_symbolic_value` to avoid confusion\n\n## Terms\n\n- New constructor, based on `bb::fr` value\n- Got rid of `isFiniteField` like members. Useless\n- Added `normalize` method, for more readability\n- Refactored the operators\n\n## SMT_Util\n\n- add `is_signed` flag in `string_to_fr()` to avoid overflows \n\n## Tests\n\nFor most part it's either a rename, engine switch or new `operator[]`\nrefactoring\n\nAlso \n- fixed an incorrect `extract_bit` test\n- \n\nAll the current changes are reflected in `README.md`\n\n---------\n\nCo-authored-by: Innokentii Sennovskii <isennovskiy@gmail.com>",
          "timestamp": "2025-04-16T19:05:39Z",
          "tree_id": "ed81b35b21e04f83e64049ed57e98b3ed1ca8ac9",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f02123d95d6a84460b6535312f4d1de52e8e1e19"
        },
        "date": 1744835239786,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm",
            "value": 88050,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm-memory",
            "value": 2173,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm",
            "value": 52605,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm-memory",
            "value": 1842,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm",
            "value": 29491,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm-memory",
            "value": 1844,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm",
            "value": 34601,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm-memory",
            "value": 1853,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm",
            "value": 42638,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm-memory",
            "value": 1793,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "47148561+Maddiaa0@users.noreply.github.com",
            "name": "Maddiaa",
            "username": "Maddiaa0"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": false,
          "id": "f709fab13118d12b85c7b1efd724b1876b9ed520",
          "message": "feat(p2p): optional P2P_BROADCAST_PORT (#13525)\n\nfixes: https://github.com/AztecProtocol/aztec-packages/issues/13165",
          "timestamp": "2025-04-16T19:57:48Z",
          "tree_id": "9209901346aa4f083454c46bb7a5ad010e190931",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f709fab13118d12b85c7b1efd724b1876b9ed520"
        },
        "date": 1744836740615,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm",
            "value": 88766,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm-memory",
            "value": 2193,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm",
            "value": 52278,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm-memory",
            "value": 1853,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm",
            "value": 30314,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm-memory",
            "value": 1824,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm",
            "value": 34992,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm-memory",
            "value": 1740,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm",
            "value": 43117,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm-memory",
            "value": 1760,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "santiago@aztecprotocol.com",
            "name": "Santiago Palladino",
            "username": "spalladino"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "abbad4c54fa4ec300dfc8fa0ea6b407979fdd247",
          "message": "chore: Use chain monitor to sync system time in p2p tests (#13632)\n\nInstead of sending a tx and awaiting its receipt, we monitor for new l1\nblocks and update time then.\n\nShould fix a [flake in p2p\ntests](http://ci.aztec-labs.com/e0ca323545d90e02) where\n`syncMockSystemTime` was called twice simultaneously and caused two txs\nfrom the same address to be sent at the same time, leading to a nonce\nclash:\n\n```\n19:30:55     FormattedViemError: Nonce provided for the transaction is lower than the current nonce of the account.\n19:30:55     Try increasing the nonce or find the latest nonce with `getTransactionCount`.\n19:30:55\n19:30:55     Request Arguments:\n19:30:55       from: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266\n19:30:55       to: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266\n19:30:55       value:                 0.000000000000000001 ETH\n19:30:55       data: 0x\n19:30:55       gas:                   25201\n19:30:55       maxFeePerGas:          1.365169136 gwei\n19:30:55       maxPriorityFeePerGas:  1.2 gwei\n19:30:55\n19:30:55     Details: transaction already imported\n19:30:55     Version: viem@2.23.7\n19:30:55\n19:30:55       298 |         }\n19:30:55       299 |     }\n19:30:55     > 300 |     return new FormattedViemError(formattedRes.replace(/\\\\n/g, '\\n'), error?.metaMessages);\n19:30:55           |            ^\n19:30:55       301 | }\n19:30:55       302 | export function tryGetCustomErrorName(err) {\n19:30:55       303 |     try {\n19:30:55\n19:30:55       at formatViemError (../../ethereum/dest/utils.js:300:12)\n19:30:55       at L1TxUtilsWithBlobs.sendTransaction (../../ethereum/dest/l1_tx_utils.js:177:31)\n19:30:55       at L1TxUtilsWithBlobs.sendAndMonitorTransaction (../../ethereum/dest/l1_tx_utils.js:326:48)\n19:30:55       at P2PNetworkTest.syncMockSystemTime (e2e_p2p/p2p_network.ts:163:25)\n19:30:55       at e2e_p2p/reex.test.ts:219:9\n```",
          "timestamp": "2025-04-16T20:54:21Z",
          "tree_id": "d5acec0beb696138bfa86cda4f1f47c079f21e4e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/abbad4c54fa4ec300dfc8fa0ea6b407979fdd247"
        },
        "date": 1744840052517,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm",
            "value": 88371,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm-memory",
            "value": 2162,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm",
            "value": 52685,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm-memory",
            "value": 1799,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm",
            "value": 29407,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm-memory",
            "value": 1837,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm",
            "value": 34010,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm-memory",
            "value": 1770,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm",
            "value": 42089,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm-memory",
            "value": 1779,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "tech@aztecprotocol.com",
            "name": "AztecBot"
          },
          "committer": {
            "email": "tech@aztecprotocol.com",
            "name": "AztecBot"
          },
          "distinct": true,
          "id": "da1e6986d7f59b49739a42aba07718b75f39e6cb",
          "message": "git subrepo push --branch=master noir-projects/aztec-nr\n\nsubrepo:\n  subdir:   \"noir-projects/aztec-nr\"\n  merged:   \"24b9f372b4\"\nupstream:\n  origin:   \"https://github.com/AztecProtocol/aztec-nr\"\n  branch:   \"master\"\n  commit:   \"24b9f372b4\"\ngit-subrepo:\n  version:  \"0.4.6\"\n  origin:   \"???\"\n  commit:   \"???\"",
          "timestamp": "2025-04-17T02:30:31Z",
          "tree_id": "df48f992689bd71532eac9290ea97a0cf8522f70",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/da1e6986d7f59b49739a42aba07718b75f39e6cb"
        },
        "date": 1744859069344,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm",
            "value": 87954,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm-memory",
            "value": 2195,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm",
            "value": 51740,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm-memory",
            "value": 1822,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm",
            "value": 30022,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm-memory",
            "value": 1773,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm",
            "value": 33653,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm-memory",
            "value": 1840,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm",
            "value": 43882,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm-memory",
            "value": 1766,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
          "id": "489c6cf66bdf9eaba7e1c98d9e2004fe703b22cc",
          "message": "feat: track rewards and slots (#13546)\n\nThis PR adds metrics to track rewards for sequencers/provers and slots\nfor sequencers.",
          "timestamp": "2025-04-17T11:18:15Z",
          "tree_id": "2ba9cf4d0ee50f07dca264ce6f95b4090235e78a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/489c6cf66bdf9eaba7e1c98d9e2004fe703b22cc"
        },
        "date": 1744891825748,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm",
            "value": 87649,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm-memory",
            "value": 2233,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm",
            "value": 52767,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm-memory",
            "value": 1836,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm",
            "value": 30204,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm-memory",
            "value": 1692,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm",
            "value": 34473,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm-memory",
            "value": 1820,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm",
            "value": 42929,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm-memory",
            "value": 1712,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
          "distinct": false,
          "id": "53c070d3954b927a2718f32f4823dc51d8764bda",
          "message": "fix: make translator use ultra rather than eccvm ops (#13489)\n\nWhile attempting to implement the consistency check between the Merge\nand Translator Verifier I realised that the TranslatorCircuitBuilder is\nconstructed using the VMops, redundantly converted to UltraOps. This PR\naddressed the issue and attempts a small cleanup on the\n`UltraEccOpsTable`.\n\nCloses https://github.com/AztecProtocol/barretenberg/issues/1266",
          "timestamp": "2025-04-17T14:34:14Z",
          "tree_id": "5382cecaf1f714013616d2c47bbc18a23b497754",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/53c070d3954b927a2718f32f4823dc51d8764bda"
        },
        "date": 1744903746872,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17331.795435000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13757.999491999999 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2305453043,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 199219651,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 19832.406747000052,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17013.809998 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 56394.264808,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 56394266000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4298.394403999964,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3699.276911 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11798.226954999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11798230000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2263.75",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
          "distinct": false,
          "id": "53c070d3954b927a2718f32f4823dc51d8764bda",
          "message": "fix: make translator use ultra rather than eccvm ops (#13489)\n\nWhile attempting to implement the consistency check between the Merge\nand Translator Verifier I realised that the TranslatorCircuitBuilder is\nconstructed using the VMops, redundantly converted to UltraOps. This PR\naddressed the issue and attempts a small cleanup on the\n`UltraEccOpsTable`.\n\nCloses https://github.com/AztecProtocol/barretenberg/issues/1266",
          "timestamp": "2025-04-17T14:34:14Z",
          "tree_id": "5382cecaf1f714013616d2c47bbc18a23b497754",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/53c070d3954b927a2718f32f4823dc51d8764bda"
        },
        "date": 1744903756720,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm",
            "value": 88576,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm-memory",
            "value": 2199,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm",
            "value": 53165,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm-memory",
            "value": 1764,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm",
            "value": 31179,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm-memory",
            "value": 1795,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm",
            "value": 34473,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm-memory",
            "value": 1812,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm",
            "value": 43287,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm-memory",
            "value": 1797,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
          "distinct": false,
          "id": "9d941b6b55e03d2f5ad96b00fd488a71e6082f3f",
          "message": "fix(avm): cpp addressing (#13652)\n\nfix(avm): cpp addressing\n\ntesting for addressing",
          "timestamp": "2025-04-17T15:00:08Z",
          "tree_id": "94bb248508c49d688c6ebec36bbc37a320590322",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9d941b6b55e03d2f5ad96b00fd488a71e6082f3f"
        },
        "date": 1744906499885,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17330.069012999957,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13568.412097000002 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2226281493,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 200159539,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 19899.389172000156,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16747.259288999998 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 56474.861775,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 56474863000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4257.550259000254,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3707.0343489999996 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11946.59517,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11946598000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2263.75",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
          "distinct": false,
          "id": "9d941b6b55e03d2f5ad96b00fd488a71e6082f3f",
          "message": "fix(avm): cpp addressing (#13652)\n\nfix(avm): cpp addressing\n\ntesting for addressing",
          "timestamp": "2025-04-17T15:00:08Z",
          "tree_id": "94bb248508c49d688c6ebec36bbc37a320590322",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9d941b6b55e03d2f5ad96b00fd488a71e6082f3f"
        },
        "date": 1744906510751,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm",
            "value": 87157,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm-memory",
            "value": 2183,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm",
            "value": 52414,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm-memory",
            "value": 1755,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm",
            "value": 30383,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm-memory",
            "value": 1729,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm",
            "value": 34248,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm-memory",
            "value": 1775,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm",
            "value": 43559,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm-memory",
            "value": 1807,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "47148561+Maddiaa0@users.noreply.github.com",
            "name": "Maddiaa",
            "username": "Maddiaa0"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "58c143b4fcdbd323fad178549c27042815ce4de0",
          "message": "fix: discv5 test failure (#13653)\n\n## Overview\n\nBase config was being passed to the bootstrap node by reference, which\nwas overriding the p2pbroadcast port on start up, which meant the port\nwas not being updated in the test.\n\nI didnt experience this in the broadcast pr as i ran the tests\nindividually\n\n----------\nalso renaming getAllPeers to getKadValues as private peers can be peers\nbut not in the kad, so the name no longer fits after the private peers\npr",
          "timestamp": "2025-04-17T16:35:08Z",
          "tree_id": "e8ba6bd78a0e9c2633e73f2c62a72a8518cb51ae",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/58c143b4fcdbd323fad178549c27042815ce4de0"
        },
        "date": 1744912254558,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm",
            "value": 87450,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm-memory",
            "value": 2225,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm",
            "value": 51604,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm-memory",
            "value": 1800,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm",
            "value": 30193,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm-memory",
            "value": 1739,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm",
            "value": 35329,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm-memory",
            "value": 1757,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm",
            "value": 42195,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm-memory",
            "value": 1864,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
          "id": "66a61bad67f2c007b63b0cf060f8d65ef6900ae9",
          "message": "feat: no longer recompute vk's in CIVC proofs (#13590)\n\nApologies for the big PR. Lots of the stuff in here ended up being\nchicken and egg with wanting to do refactoring to make this process\nsmoother/help debug tricky issues, and wanting to see that those\nrefactorings actually make sense by the end.\n\nWe no longer compute VKs on the fly in CIVC. This saves ~25% of\ncomputation. This is done throughout by consolidating IVC inputs into a\nsingle ivc-inputs.msgpack structure which supports passing bytecode,\nwitness & vk information to the bb backend. Now attaches a name for each\nfunction, as well.\n\nMajor features:\n- IVC inputs passed thru native and wasm are always passed a single\nfile/buffer. This is encoded using msgpack and capture bytecode,\nwitness, vk, and function name (which is now printed, but only properly\npassed by native) For native, the bincode and witnesses are gzipped, for\nWASM they are uncompressed. For actions such as gates or write_vk, the\nIVC inputs are used with same structure but witness and vk data can be\nblank.\n\nThis has a bunch of implications, such as having to break away from the\nrigid API base class in bb cli (which overall doesn't feel worthwhile\nanyway as CIVC is fundamentally different than UH), having to string vk\ninfo along, etc.\n\nOther features:\n\nDebuggability:\n\n- Correct README.md instructions on WASM stack traces (give up on\ngetting line numbers working :/)\n- clangd now properly shows all errors in a C++ file you're browsing,\ninstead of only showing you the first error.\n\nCleanup\n\n- small cleanup to acir tests, but still not testing new ivc flow there.\nLightest weight test is ivc-integration in yarn-project\n- Get rid of --input_type in bb cli for CIVC. now implied always to be\nwhat was previously runtime_stack. Simplifies usages, other modes were\nunused.\n- more ignored linting in the clangd file. Maybe one day we can enforce\nthe remaining as errors.\n- Clean up msgpack usage. Msgpack headers were leaking everywhere and it\nis a chunky library.\n- Consolidate with using msgpackr as our only typescript messagepack\nlibrary\n\nBenches\n\n- use wasmtime helper in bb bootstrap. deduplicate code in bench. bench\nnow honours NATIVE_PRESET, and if you do\n```\nexport NATIVE_PRESET=op-count-time\n./bootstrap.sh\n./bootstrap.sh bench\n```\nyou will get op count timings for our native ivc benches.\n\n---------\n\nCo-authored-by: Copilot <175728472+Copilot@users.noreply.github.com>\nCo-authored-by: thunkar <gregojquiros@gmail.com>\nCo-authored-by: maramihali <mara@aztecprotocol.com>\nCo-authored-by: ledwards2225 <l.edwards.d@gmail.com>",
          "timestamp": "2025-04-17T16:39:33-04:00",
          "tree_id": "cceae41613bb981b8388ac35e8cd4c337641854c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/66a61bad67f2c007b63b0cf060f8d65ef6900ae9"
        },
        "date": 1744923637953,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17390.92751599992,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13834.366274 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2225732345,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 190960315,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 19889.894319999712,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16871.292714 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 56150.705876,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 56150707000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4266.9954459997825,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3640.8459409999996 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 12264.782207,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 12264786000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2263.75",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
          "id": "66a61bad67f2c007b63b0cf060f8d65ef6900ae9",
          "message": "feat: no longer recompute vk's in CIVC proofs (#13590)\n\nApologies for the big PR. Lots of the stuff in here ended up being\nchicken and egg with wanting to do refactoring to make this process\nsmoother/help debug tricky issues, and wanting to see that those\nrefactorings actually make sense by the end.\n\nWe no longer compute VKs on the fly in CIVC. This saves ~25% of\ncomputation. This is done throughout by consolidating IVC inputs into a\nsingle ivc-inputs.msgpack structure which supports passing bytecode,\nwitness & vk information to the bb backend. Now attaches a name for each\nfunction, as well.\n\nMajor features:\n- IVC inputs passed thru native and wasm are always passed a single\nfile/buffer. This is encoded using msgpack and capture bytecode,\nwitness, vk, and function name (which is now printed, but only properly\npassed by native) For native, the bincode and witnesses are gzipped, for\nWASM they are uncompressed. For actions such as gates or write_vk, the\nIVC inputs are used with same structure but witness and vk data can be\nblank.\n\nThis has a bunch of implications, such as having to break away from the\nrigid API base class in bb cli (which overall doesn't feel worthwhile\nanyway as CIVC is fundamentally different than UH), having to string vk\ninfo along, etc.\n\nOther features:\n\nDebuggability:\n\n- Correct README.md instructions on WASM stack traces (give up on\ngetting line numbers working :/)\n- clangd now properly shows all errors in a C++ file you're browsing,\ninstead of only showing you the first error.\n\nCleanup\n\n- small cleanup to acir tests, but still not testing new ivc flow there.\nLightest weight test is ivc-integration in yarn-project\n- Get rid of --input_type in bb cli for CIVC. now implied always to be\nwhat was previously runtime_stack. Simplifies usages, other modes were\nunused.\n- more ignored linting in the clangd file. Maybe one day we can enforce\nthe remaining as errors.\n- Clean up msgpack usage. Msgpack headers were leaking everywhere and it\nis a chunky library.\n- Consolidate with using msgpackr as our only typescript messagepack\nlibrary\n\nBenches\n\n- use wasmtime helper in bb bootstrap. deduplicate code in bench. bench\nnow honours NATIVE_PRESET, and if you do\n```\nexport NATIVE_PRESET=op-count-time\n./bootstrap.sh\n./bootstrap.sh bench\n```\nyou will get op count timings for our native ivc benches.\n\n---------\n\nCo-authored-by: Copilot <175728472+Copilot@users.noreply.github.com>\nCo-authored-by: thunkar <gregojquiros@gmail.com>\nCo-authored-by: maramihali <mara@aztecprotocol.com>\nCo-authored-by: ledwards2225 <l.edwards.d@gmail.com>",
          "timestamp": "2025-04-17T16:39:33-04:00",
          "tree_id": "cceae41613bb981b8388ac35e8cd4c337641854c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/66a61bad67f2c007b63b0cf060f8d65ef6900ae9"
        },
        "date": 1744923648144,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm",
            "value": 65797,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm-memory",
            "value": 2228,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm",
            "value": 41057,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm-memory",
            "value": 1779,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm",
            "value": 26045,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm-memory",
            "value": 1745,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm",
            "value": 28083,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm-memory",
            "value": 1844,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm",
            "value": 35838,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm-memory",
            "value": 1766,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
          "id": "71e81ce464627f733f5671341bd36e074071ded2",
          "message": "feat: VK generation test for HonkRecursionConstraint (#13637)\n\nAdds a new test that checks whether the HonkRecursionConstraint circuit\nis the same with valid inputs vs with dummy inputs.",
          "timestamp": "2025-04-17T19:20:04Z",
          "tree_id": "2eb786c277a2177f8f170b9fdf1feaa5d6775c4a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/71e81ce464627f733f5671341bd36e074071ded2"
        },
        "date": 1744925705717,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17406.694519999746,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13779.73129 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2325715292,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 193260907,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 19892.848472999958,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16825.092436000003 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 56198.747931,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 56198749000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4268.11941599999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3620.3875299999995 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11853.282099000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11853286000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2263.75",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
          }
        ]
      }
    ],
    "P2P Testbench": [
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
          "id": "912f2c539bcf382e28df4afa0fc44fec89f3cd85",
          "message": "feat(p2p): gossipsub scoring adjustments + testbench",
          "timestamp": "2025-02-23T02:27:21Z",
          "url": "https://github.com/AztecProtocol/aztec-packages/pull/12075/commits/912f2c539bcf382e28df4afa0fc44fec89f3cd85"
        },
        "date": 1740346403428,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "degree-1-strict - numberReceived",
            "value": 3,
            "unit": "ma"
          },
          {
            "name": "degree-1-strict - minDelay",
            "value": 383,
            "unit": "ma"
          },
          {
            "name": "degree-1-strict - maxDelay",
            "value": 5276,
            "unit": "ma"
          },
          {
            "name": "degree-1-strict - averageDelay",
            "value": 2716.33,
            "unit": "ma"
          },
          {
            "name": "degree-1-strict - medianDelay",
            "value": 2490,
            "unit": "ma"
          },
          {
            "name": "normal-degree-50-nodes - numberReceived",
            "value": 26,
            "unit": "ma"
          },
          {
            "name": "normal-degree-50-nodes - minDelay",
            "value": 50,
            "unit": "ma"
          },
          {
            "name": "normal-degree-50-nodes - maxDelay",
            "value": 7221,
            "unit": "ma"
          },
          {
            "name": "normal-degree-50-nodes - averageDelay",
            "value": 2146.35,
            "unit": "ma"
          },
          {
            "name": "normal-degree-50-nodes - medianDelay",
            "value": 925,
            "unit": "ma"
          }
        ]
      }
    ]
  }
}