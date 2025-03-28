window.BENCHMARK_DATA = {
  "lastUpdate": 1743152923681,
  "repoUrl": "https://github.com/AztecProtocol/aztec-packages",
  "entries": {
    "C++ Benchmark": [
      {
        "commit": {
          "author": {
            "email": "9820846+rw0x0@users.noreply.github.com",
            "name": "Roman Walch",
            "username": "rw0x0"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "76ef873f0721843bb2f44e2428d352edf595d1c3",
          "message": "fix: make circuit parsing deterministic (#11772)",
          "timestamp": "2025-03-26T11:36:28Z",
          "tree_id": "99813f93acb4c2bca53cf02b059d89b9e26d43ba",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/76ef873f0721843bb2f44e2428d352edf595d1c3"
        },
        "date": 1742990256766,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 42434,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 25194,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 11988,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 14749,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 17919,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "34ec9e8300116d27c1903a1daae775672186c945",
          "message": "feat(avm): merkle db hints (part 1) (#12922)\n\nThis PR adds AVM hints for the following merkle operations\n* getPreviousValueIndex to get the low leaf index\n* getLeafPreimage to get the low leaf preimage\n* getSiblingPath to get the low leaf sibling path\n\nOn the C++ side, the operations are called slightly differently. I'm using the C++ world state db names.\n\nThis PR also separates the C++ DB interfaces into low level (basically the equivalent of the TS merkleops) and high level (equivalent of the public trees db/journal). This needed to be done because loose low level operations cannot necessarily be constrained. We usually need more context, and a coarser granularity. Therefore the idea is that low level ops are hinted (and unconstrained), and high level ops are constrained.\n\nHinting is currently tested via the deserialization tests, and it should be used by the bulk test, but we never get there (beyond bytecode processing). So some things might still be wrong.\n\nI'm trying to get this out as quick as possible to unblock others.\n\n```\nInitializing HintedRawContractDB with...\n * contractInstances: 6\n * contractClasses: 3\n * bytecodeCommitments: 3\nInitializing HintedRawMerkleDB with...\n * get_sibling_path hints: 3\n * get_previous_value_index hints: 27\n * get_leaf_preimage hints_public_data_tree: 3\n```\n\nPS: there's probably a lot of duplication happening now in the hints. We'll have to eventually deduplicate.",
          "timestamp": "2025-03-26T12:08:05Z",
          "tree_id": "9d34bec4915bbd9a3cac20240f72ce7da1cdb1ab",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/34ec9e8300116d27c1903a1daae775672186c945"
        },
        "date": 1742993494003,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17787.76900799994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16028.835694999998 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 118196082938.9,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 1607914189,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 226426031,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18832.47929699996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16492.859961000002 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 50890.441796,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 50890445000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3940.9771740001815,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3170.108081 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10953.660945000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10953662000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2233.31",
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
          "distinct": true,
          "id": "34ec9e8300116d27c1903a1daae775672186c945",
          "message": "feat(avm): merkle db hints (part 1) (#12922)\n\nThis PR adds AVM hints for the following merkle operations\n* getPreviousValueIndex to get the low leaf index\n* getLeafPreimage to get the low leaf preimage\n* getSiblingPath to get the low leaf sibling path\n\nOn the C++ side, the operations are called slightly differently. I'm using the C++ world state db names.\n\nThis PR also separates the C++ DB interfaces into low level (basically the equivalent of the TS merkleops) and high level (equivalent of the public trees db/journal). This needed to be done because loose low level operations cannot necessarily be constrained. We usually need more context, and a coarser granularity. Therefore the idea is that low level ops are hinted (and unconstrained), and high level ops are constrained.\n\nHinting is currently tested via the deserialization tests, and it should be used by the bulk test, but we never get there (beyond bytecode processing). So some things might still be wrong.\n\nI'm trying to get this out as quick as possible to unblock others.\n\n```\nInitializing HintedRawContractDB with...\n * contractInstances: 6\n * contractClasses: 3\n * bytecodeCommitments: 3\nInitializing HintedRawMerkleDB with...\n * get_sibling_path hints: 3\n * get_previous_value_index hints: 27\n * get_leaf_preimage hints_public_data_tree: 3\n```\n\nPS: there's probably a lot of duplication happening now in the hints. We'll have to eventually deduplicate.",
          "timestamp": "2025-03-26T12:08:05Z",
          "tree_id": "9d34bec4915bbd9a3cac20240f72ce7da1cdb1ab",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/34ec9e8300116d27c1903a1daae775672186c945"
        },
        "date": 1742993503593,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 39378,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 27651,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 12138,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 14775,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 15410,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "d768d2661462f93d798a3f535d9a7b33fc619276",
          "message": "chore: fix governance util issue (#13043)\n\nUpdates the governance util such that it uses the correct asset",
          "timestamp": "2025-03-26T14:13:46Z",
          "tree_id": "3fc85ef5b7fbc02975c1cbffd116bf84fba9a9ea",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d768d2661462f93d798a3f535d9a7b33fc619276"
        },
        "date": 1742999636826,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 39775,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 26792,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 11742,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 14398,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 15242,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "fefffa7a6376066792874da4c5da41126603841d",
          "message": "chore: towards no more mock op_queues (#12984)\n\nRemove occurences of mock ecc ops additions in scenarios where the merge\nprotocol operates properly without adding this merge operations but we\nare also not required to make some actual changes to the protocol\nitself.",
          "timestamp": "2025-03-26T14:24:00Z",
          "tree_id": "5b9e2ccabd7ddb216d8259b5131a737d7e6a7ed1",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/fefffa7a6376066792874da4c5da41126603841d"
        },
        "date": 1743000875516,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18155.40277199989,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15692.458041 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 118235006046.39998,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 1609881281,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 217208239,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18843.816236000293,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16567.902389 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 50816.65990600001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 50816661000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3885.940515999664,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3073.21232 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9677.887788000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9677894000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2233.31",
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
          "distinct": true,
          "id": "fefffa7a6376066792874da4c5da41126603841d",
          "message": "chore: towards no more mock op_queues (#12984)\n\nRemove occurences of mock ecc ops additions in scenarios where the merge\nprotocol operates properly without adding this merge operations but we\nare also not required to make some actual changes to the protocol\nitself.",
          "timestamp": "2025-03-26T14:24:00Z",
          "tree_id": "5b9e2ccabd7ddb216d8259b5131a737d7e6a7ed1",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/fefffa7a6376066792874da4c5da41126603841d"
        },
        "date": 1743000884828,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 39834,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 25986,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 11920,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 14962,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 15441,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "1ebd04424dca674b35c4fc3d32e240046f9b27fa",
          "message": "chore(bb): minor acir buf C++ improvements (#13042)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\nline.",
          "timestamp": "2025-03-26T14:38:21Z",
          "tree_id": "74dd59a306f9a0cbd7c2f957d2bafac019b7e930",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1ebd04424dca674b35c4fc3d32e240046f9b27fa"
        },
        "date": 1743002535187,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18352.42153900026,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15929.495907999999 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 118209698116.8,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 1605401108,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 213938312,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18854.315133,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16380.851954999996 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 50810.648989,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 50810650000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4042.7683810003145,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3074.5222640000006 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9959.260553,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9959264000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2217.31",
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
          "distinct": true,
          "id": "1ebd04424dca674b35c4fc3d32e240046f9b27fa",
          "message": "chore(bb): minor acir buf C++ improvements (#13042)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\nline.",
          "timestamp": "2025-03-26T14:38:21Z",
          "tree_id": "74dd59a306f9a0cbd7c2f957d2bafac019b7e930",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1ebd04424dca674b35c4fc3d32e240046f9b27fa"
        },
        "date": 1743002544006,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 39404,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 27385,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 11961,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 14500,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 15391,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "152162806+sklppy88@users.noreply.github.com",
            "name": "esau",
            "username": "sklppy88"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "8a47d8ba6618fa5299923d8b70bb3cfe88e48115",
          "message": "fix: bootstrap network and sponsored fpc devnet (#13044)\n\nEnables sponsoredFPC and fixes bootstrap network\n\nCo-authored-by: sklppy88 <esau@aztecprotocol.com>",
          "timestamp": "2025-03-26T16:29:48+01:00",
          "tree_id": "b61dd476682adffe52546b9638354d5d9af2dcc6",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8a47d8ba6618fa5299923d8b70bb3cfe88e48115"
        },
        "date": 1743004822458,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 39476,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 26493,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 11777,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 14424,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 15322,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "3a7ba2d12da63833ef233b290d51428594f21c13",
          "message": "chore: redundant if in affine from projective constructor (#13045)\n\nThe if-statement at the end of the projective to affine constructor is\nredundant, we check that the projective point is infinity at the\nbeginning of the function and the operations we perform afterwards do\nnot affect it in a way that would make it become infinity.",
          "timestamp": "2025-03-26T15:36:35Z",
          "tree_id": "755181a5808e6ba644ec16f1406c5572090ed559",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/3a7ba2d12da63833ef233b290d51428594f21c13"
        },
        "date": 1743006040038,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17470.99967999975,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15385.156629000001 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 118216840396.9,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 1625678504,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 226298233,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18741.82956599998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16378.913896 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 50731.78329199999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 50731783000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3864.1164549994755,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3098.0226849999995 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10678.45013,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10678454000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2217.31",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "68168980+just-mitch@users.noreply.github.com",
            "name": "just-mitch",
            "username": "just-mitch"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "af48184f5786e21b7e2e7aa980487b04495a2559",
          "message": "feat: staking asset handler (#12968)\n\nFix #12932",
          "timestamp": "2025-03-26T11:38:38-04:00",
          "tree_id": "bd02b0f6ee462d1ce944711ee6f5d9d959089048",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/af48184f5786e21b7e2e7aa980487b04495a2559"
        },
        "date": 1743006041931,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 39384,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 27251,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 11891,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 14608,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 15205,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "3a7ba2d12da63833ef233b290d51428594f21c13",
          "message": "chore: redundant if in affine from projective constructor (#13045)\n\nThe if-statement at the end of the projective to affine constructor is\nredundant, we check that the projective point is infinity at the\nbeginning of the function and the operations we perform afterwards do\nnot affect it in a way that would make it become infinity.",
          "timestamp": "2025-03-26T15:36:35Z",
          "tree_id": "755181a5808e6ba644ec16f1406c5572090ed559",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/3a7ba2d12da63833ef233b290d51428594f21c13"
        },
        "date": 1743006049741,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 38998,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 26222,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 11780,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 14876,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 15318,
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
          "distinct": true,
          "id": "f972db97dcd643bf5a86fd7ff7439303135fefac",
          "message": "fix: Syntax error when running tests via jest after tsc build (#13051)\n\nRunning e2e tests in jest after building using `tsc -b` would result in\nan error `SyntaxError: 'super' keyword unexpected here`.\n\n```\n FAIL  src/e2e_block_building.test.ts\n  ● Test suite failed to run\n\n    SyntaxError: 'super' keyword unexpected here\n\n      at Runtime.loadEsmModule (../../node_modules/jest-runtime/build/index.js:517:20)\n```\n\nAfter patching jest to report where the issue was coming up, it turned\nout it was caused by the usage of `super` in a js private method. For\nsome reason tsc was emitting the following:\n\n```ts\n  async #getHintKey(treeId: MerkleTreeId): Promise<AppendOnlyTreeSnapshot> {\n    const treeInfo = await super.getTreeInfo(treeId);\n    return new AppendOnlyTreeSnapshot(Fr.fromBuffer(treeInfo.root), Number(treeInfo.size));\n  }\n```\n\n```js\n_HintingPublicTreesDB_instances = new WeakSet(), _HintingPublicTreesDB_getHintKey =\n// Private methods.\nasync function _HintingPublicTreesDB_getHintKey(treeId) {\n    const treeInfo = await super.getTreeInfo(treeId);\n    return new AppendOnlyTreeSnapshot(Fr.fromBuffer(treeInfo.root), Number(treeInfo.size));\n};\n```\n\nSince the private method was moved outside the class as part of code\ngeneration, node threw a syntax error since `super` can only be used in\nthe context of a class.\n\nThis patches the issue by using regular ts private methods, but we still\nneed to figure out why ts is emitting invalid js code.",
          "timestamp": "2025-03-26T16:20:25Z",
          "tree_id": "bb33ad02e393bcccb63af19dc736cd97506a5299",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f972db97dcd643bf5a86fd7ff7439303135fefac"
        },
        "date": 1743007899000,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 39298,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 26015,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 11756,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 14852,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 15361,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "dc5f78f7f0e6a1a20c3e0a280abca7e7edbf69d0",
          "message": "chore: comprehensive cleanup of translator flavor and use inheritance properly in flavors (#13041)\n\nCloses https://github.com/AztecProtocol/barretenberg/issues/810.\n\nClarify getters in the `TranslatorFlavor` and ensure all the existing\ngetters are actually needed. We also were (and I think still are in\nECCVM) using inheritance weirdly between entities so cleaned that up as\nwell. There is still work to be done in ECCVM (added to\n[this](https://github.com/AztecProtocol/barretenberg/issues/939) issue).",
          "timestamp": "2025-03-26T16:36:06Z",
          "tree_id": "8c89cfc04c3d7ce5f0ba235b86cb71271dd67404",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/dc5f78f7f0e6a1a20c3e0a280abca7e7edbf69d0"
        },
        "date": 1743009529109,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17677.901296999837,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15723.22519 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 118216480231.20001,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 1610100161,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 217039075,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18863.60348199992,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16331.762823 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 51175.479991,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 51175477000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3935.2651289996174,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3122.6714060000004 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10093.710904,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10093715000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2217.31",
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
          "distinct": true,
          "id": "dc5f78f7f0e6a1a20c3e0a280abca7e7edbf69d0",
          "message": "chore: comprehensive cleanup of translator flavor and use inheritance properly in flavors (#13041)\n\nCloses https://github.com/AztecProtocol/barretenberg/issues/810.\n\nClarify getters in the `TranslatorFlavor` and ensure all the existing\ngetters are actually needed. We also were (and I think still are in\nECCVM) using inheritance weirdly between entities so cleaned that up as\nwell. There is still work to be done in ECCVM (added to\n[this](https://github.com/AztecProtocol/barretenberg/issues/939) issue).",
          "timestamp": "2025-03-26T16:36:06Z",
          "tree_id": "8c89cfc04c3d7ce5f0ba235b86cb71271dd67404",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/dc5f78f7f0e6a1a20c3e0a280abca7e7edbf69d0"
        },
        "date": 1743009537948,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 39786,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 26308,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 11832,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 14963,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 15767,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "152162806+sklppy88@users.noreply.github.com",
            "name": "esau",
            "username": "sklppy88"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "d92d8955753b0079ca884767fe26968dea9fc377",
          "message": "fix: starting the sandbox with no pxe should still deploy initial test accounts (#13047)\n\nResolves #12950 without adding cheatcodes to advance a block.\n\nCo-authored-by: sklppy88 <esau@aztecprotocol.com>",
          "timestamp": "2025-03-26T18:17:33+01:00",
          "tree_id": "419974572e2be8f0daf3196155851a1415ca0911",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d92d8955753b0079ca884767fe26968dea9fc377"
        },
        "date": 1743011415457,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 39157,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 26081,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 11753,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 14486,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 15093,
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
          "distinct": true,
          "id": "985e83bec2b4da9791f47768953cba3d9af57f66",
          "message": "fix: Bump tsc target (#13052)\n\nWe were using different targets for tsc and swc (es2020 vs es2022). This\nPR updates tsc target so it matches the swc one, to minimize\nincompatibilities between code built with either tool.",
          "timestamp": "2025-03-26T17:12:53Z",
          "tree_id": "84d80ddbc27939afcb9d1d859f9465b5791deef0",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/985e83bec2b4da9791f47768953cba3d9af57f66"
        },
        "date": 1743011478815,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 39167,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 26573,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 11651,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 14641,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 15194,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "da6d02178f2cb61e56e8f9e702aba574f8b03cee",
          "message": "chore: remove dummy ops in decider pk (#13049)\n\nWe used to not serialise and deserialise infinity points in the\ntranscript properly until\n[this](https://github.com/AztecProtocol/aztec-packages/pull/7709). More\nprecisely, it was possible to get to\n[this](https://github.com/AztecProtocol/aztec-packages/blob/mm/handle-merge/barretenberg/cpp/src/barretenberg/ecc/groups/element_impl.hpp#L68)\npoint in the projective to affine constructor (used when operating with\nzero commitments) because the transcript was not setting the infinity\nflag in situations when `z=0`. This was leading to intermmitent issues\nthat resulted in us adding dummy ecc ops [this\nPR](https://github.com/AztecProtocol/aztec-packages/pull/5174/files). We\nshould now be able to remove these dummy ops.",
          "timestamp": "2025-03-26T21:34:50Z",
          "tree_id": "6186a6d282b6d2750c826f05901df49f79f70c81",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/da6d02178f2cb61e56e8f9e702aba574f8b03cee"
        },
        "date": 1743027407179,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18103.45665800014,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15728.001332 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 118097433092.70001,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 1626241758,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 214258037,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18940.553406000163,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16430.234347999998 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 50826.727472,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 50826728000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3941.7176159995506,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3167.706297 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10704.704576,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10704710000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2217.31",
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
          "distinct": true,
          "id": "da6d02178f2cb61e56e8f9e702aba574f8b03cee",
          "message": "chore: remove dummy ops in decider pk (#13049)\n\nWe used to not serialise and deserialise infinity points in the\ntranscript properly until\n[this](https://github.com/AztecProtocol/aztec-packages/pull/7709). More\nprecisely, it was possible to get to\n[this](https://github.com/AztecProtocol/aztec-packages/blob/mm/handle-merge/barretenberg/cpp/src/barretenberg/ecc/groups/element_impl.hpp#L68)\npoint in the projective to affine constructor (used when operating with\nzero commitments) because the transcript was not setting the infinity\nflag in situations when `z=0`. This was leading to intermmitent issues\nthat resulted in us adding dummy ecc ops [this\nPR](https://github.com/AztecProtocol/aztec-packages/pull/5174/files). We\nshould now be able to remove these dummy ops.",
          "timestamp": "2025-03-26T21:34:50Z",
          "tree_id": "6186a6d282b6d2750c826f05901df49f79f70c81",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/da6d02178f2cb61e56e8f9e702aba574f8b03cee"
        },
        "date": 1743027416165,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 39571,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 26715,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 11841,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 15080,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 15439,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "janbenes1234@gmail.com",
            "name": "Jan Beneš",
            "username": "benesjan"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "0b7e5649237a66247b26bda6330fdd87cb002059",
          "message": "feat: LogEncryption trait (#12942)",
          "timestamp": "2025-03-27T02:00:24Z",
          "tree_id": "f2de830552fe9addf844138ba0b4fc29701d9f3f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0b7e5649237a66247b26bda6330fdd87cb002059"
        },
        "date": 1743041517504,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 39350,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 26910,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 11912,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 14551,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 15581,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "janbenes1234@gmail.com",
            "name": "Jan Beneš",
            "username": "benesjan"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "20d734a11549d7a100d8f7e0ec64ca86d4cb73f8",
          "message": "feat: 64 bit log type id, 64 bit log metadata (#12956)",
          "timestamp": "2025-03-26T20:32:24-06:00",
          "tree_id": "92987217b6b580a9f6bcd2098d3abb548eeec484",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/20d734a11549d7a100d8f7e0ec64ca86d4cb73f8"
        },
        "date": 1743044379930,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 34214,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 22120,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 10816,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 13104,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 13473,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "f03b2e5b541757e1dcb7daf821977f43758be70c",
          "message": "feat(avm): add calldata & returndata to context (#13008)\n\n- Reading calldata and (almost) writing returndata to the vm2 contexts. \n- Splits context interfaces into Enqueued and Nested\n- Adds parent contexts (to nested contexts) and child contexts (in both)\nto the `context` class\n\nNothing much flexs these for now - we will need to start doing the\nXDATA_COPY opcodes soon.",
          "timestamp": "2025-03-27T13:03:16+08:00",
          "tree_id": "336f04ead2b9cf3e2cf99a1c1027b497c15f256e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f03b2e5b541757e1dcb7daf821977f43758be70c"
        },
        "date": 1743054330304,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18135.563227999683,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15869.864851 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 118110546069.4,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 1604357625,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 213670710,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18939.57986999976,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16560.136962999997 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 50992.814411,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 50992814000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3908.891637999659,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3118.9090459999998 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10758.921083000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10758925000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2217.31",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
          "id": "f03b2e5b541757e1dcb7daf821977f43758be70c",
          "message": "feat(avm): add calldata & returndata to context (#13008)\n\n- Reading calldata and (almost) writing returndata to the vm2 contexts. \n- Splits context interfaces into Enqueued and Nested\n- Adds parent contexts (to nested contexts) and child contexts (in both)\nto the `context` class\n\nNothing much flexs these for now - we will need to start doing the\nXDATA_COPY opcodes soon.",
          "timestamp": "2025-03-27T13:03:16+08:00",
          "tree_id": "336f04ead2b9cf3e2cf99a1c1027b497c15f256e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f03b2e5b541757e1dcb7daf821977f43758be70c"
        },
        "date": 1743054341969,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 39527,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 26742,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 12093,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 15008,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 15428,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "9612a4e25b825f4ef6080c165f070cc7b36bab49",
          "message": "feat: track total tx fee (#12601)",
          "timestamp": "2025-03-27T11:02:47Z",
          "tree_id": "748c44c244f57934a772372cfa66e04f85c9e36c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9612a4e25b825f4ef6080c165f070cc7b36bab49"
        },
        "date": 1743075057106,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 39200,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 26031,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 11817,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 14543,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 15342,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "327341fb11f99fec6219164cdc2c12f996b77182",
          "message": "fix: invalid getCommittee function (#13072)",
          "timestamp": "2025-03-27T11:55:06Z",
          "tree_id": "e87b18b7fd0019f74c35fc78634a2ce5258f67ea",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/327341fb11f99fec6219164cdc2c12f996b77182"
        },
        "date": 1743076920035,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 39406,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 26149,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 11893,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 14682,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 15322,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "4eb1156250d2221e028c340e7d93dcdc39803cbe",
          "message": "feat: gas benchmark for \"normal usage\" (#13073)\n\nFixed #13075\n\nCreating explicit benchmarking test for gas such that there is something\nthat is:\n1) convenient to check against for optimisations\n2) gives a somewhat correct view instead of having all the failure cases\nin the mix\n\nThe test runs with a validator set of 100 entities, that each have a\nforwarder contract. We then ram through time and submit and fake proof\n100 blocks to collect data.\n\nNotice, that if you bump up the numbers of entities or blocks foundry is\nprobably going to explode if you don't also change the gas limits\nbecause that is a lot of things being loaded in 🤷\n\nTodo: Talk to @Maddiaa0 @just-mitch and @aminsammara on which numbers\nare missing and what should make its way into the fancy benchmark graphs\nthat charlie setup. Most should be in #12615",
          "timestamp": "2025-03-27T12:25:04Z",
          "tree_id": "cfad1b61ac0b5244adf8725ad91e94149da1ddca",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/4eb1156250d2221e028c340e7d93dcdc39803cbe"
        },
        "date": 1743078714351,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 39367,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 26105,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 11656,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 14431,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 15435,
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
          "distinct": true,
          "id": "27f1eca25c4c5849d32541b5ad1d3068d5d1911a",
          "message": "chore: Speed up and deflake sentinel test (#13078)\n\nThe sentinel e2e test was [sometimes\nfailing](http://ci.aztec-labs.com/0534e1b01190d6fd) since not enough\nblocks were mined in time. We believe this was because the offline\nvalidator was being picked up as proposer, so multiple slots end up\nbeing missed.\n\nThis PR fixes it by bumping timeout and reducing the number of blocks we\nmine. We used to mine so many to make sure that each validator was\npicked at least one as proposer, so no matter which one we inspected, we\ncould assert there was at least one block proposed in its stats. We now\njust look for one with proposals and assert on it.",
          "timestamp": "2025-03-27T13:16:06Z",
          "tree_id": "7ca9c4170f282f039dcdd51e437430b16cc181f3",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/27f1eca25c4c5849d32541b5ad1d3068d5d1911a"
        },
        "date": 1743083066318,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 39465,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 26311,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 11650,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 14606,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 15603,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "fbbc6c701efa4f3cc7317e437a103f9a1b51895d",
          "message": "feat(avm): merkle hints (part 2) (#13077)\n\nGetLeafPreimage complete for public data and nullifiers.\nGetLeafValue complete for note hashes and l1 to l2.\n\nChanged getNullifierIndex to use other methods (the hinted ones). Please check that.",
          "timestamp": "2025-03-27T13:25:31Z",
          "tree_id": "d03a9b5933099c56b2653cb27aa424a96800e1a5",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/fbbc6c701efa4f3cc7317e437a103f9a1b51895d"
        },
        "date": 1743084483245,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17709.224575999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15685.129216 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 118092275587.5,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 1614565156,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 216699627,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 19420.962194999902,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16533.805862999998 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 51114.444956,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 51114445000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3906.573181999647,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3125.8379999999993 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11200.441566,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11200445000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2249.31",
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
          "distinct": true,
          "id": "fbbc6c701efa4f3cc7317e437a103f9a1b51895d",
          "message": "feat(avm): merkle hints (part 2) (#13077)\n\nGetLeafPreimage complete for public data and nullifiers.\nGetLeafValue complete for note hashes and l1 to l2.\n\nChanged getNullifierIndex to use other methods (the hinted ones). Please check that.",
          "timestamp": "2025-03-27T13:25:31Z",
          "tree_id": "d03a9b5933099c56b2653cb27aa424a96800e1a5",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/fbbc6c701efa4f3cc7317e437a103f9a1b51895d"
        },
        "date": 1743084494077,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 39455,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 26402,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 11627,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 14635,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 15115,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "a64d1dc9d7b0071f4cde2a4213f76c881a6fbe3f",
          "message": "chore: remove addition of dummy ops in mock circuit producer (#13003)\n\nEvery call to `prove_merge` checks whether the ecc_op block is empty and\nadds dummy ops if required to avoid issues. Therefore, there is no need\nto add dummy ops when creating mock circuits. This isolates the addition\nof dummy gates to two places: at builder finalisation and when necessary\nin `prove_merge`.",
          "timestamp": "2025-03-27T13:47:32Z",
          "tree_id": "48ea72add036f1a865bdbb9a7f7dae47063ac281",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a64d1dc9d7b0071f4cde2a4213f76c881a6fbe3f"
        },
        "date": 1743085360362,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 16899.368651999794,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15049.991731 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 118099183530.7,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 1464774219,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 202408256,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 17866.25002200003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15430.016348000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 46519.166945000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 46519168000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3264.6335070000987,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3042.355048 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 7967.483516000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 7967485000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2249.31",
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
          "distinct": true,
          "id": "a64d1dc9d7b0071f4cde2a4213f76c881a6fbe3f",
          "message": "chore: remove addition of dummy ops in mock circuit producer (#13003)\n\nEvery call to `prove_merge` checks whether the ecc_op block is empty and\nadds dummy ops if required to avoid issues. Therefore, there is no need\nto add dummy ops when creating mock circuits. This isolates the addition\nof dummy gates to two places: at builder finalisation and when necessary\nin `prove_merge`.",
          "timestamp": "2025-03-27T13:47:32Z",
          "tree_id": "48ea72add036f1a865bdbb9a7f7dae47063ac281",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a64d1dc9d7b0071f4cde2a4213f76c881a6fbe3f"
        },
        "date": 1743085370919,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 34108,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 22047,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 10819,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 13210,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 13546,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "5764343+charlielye@users.noreply.github.com",
            "name": "Charlie Lye",
            "username": "charlielye"
          },
          "committer": {
            "email": "5764343+charlielye@users.noreply.github.com",
            "name": "Charlie Lye",
            "username": "charlielye"
          },
          "distinct": true,
          "id": "531b321fe2038f44e0bd9829344d657aa52eaaea",
          "message": "Merge branch 'master' of github.com:aztecprotocol/aztec-packages",
          "timestamp": "2025-03-27T14:28:08Z",
          "tree_id": "fbd54ce970374fff13a20688f3c1aab6a6abdab1",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/531b321fe2038f44e0bd9829344d657aa52eaaea"
        },
        "date": 1743086110346,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 16899.368651999794,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15049.991731 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 118099183530.7,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 1464774219,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 202408256,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 17866.25002200003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15430.016348000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 46519.166945000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 46519168000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3264.6335070000987,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3042.355048 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 7967.483516000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 7967485000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2249.31",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "5764343+charlielye@users.noreply.github.com",
            "name": "Charlie Lye",
            "username": "charlielye"
          },
          "committer": {
            "email": "5764343+charlielye@users.noreply.github.com",
            "name": "Charlie Lye",
            "username": "charlielye"
          },
          "distinct": true,
          "id": "531b321fe2038f44e0bd9829344d657aa52eaaea",
          "message": "Merge branch 'master' of github.com:aztecprotocol/aztec-packages",
          "timestamp": "2025-03-27T14:28:08Z",
          "tree_id": "fbd54ce970374fff13a20688f3c1aab6a6abdab1",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/531b321fe2038f44e0bd9829344d657aa52eaaea"
        },
        "date": 1743086120517,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 34108,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 22047,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 10819,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 13210,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 13546,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "5764343+charlielye@users.noreply.github.com",
            "name": "Charlie Lye",
            "username": "charlielye"
          },
          "committer": {
            "email": "5764343+charlielye@users.noreply.github.com",
            "name": "Charlie Lye",
            "username": "charlielye"
          },
          "distinct": true,
          "id": "8fc3c158ee8fac2386c656e7a7589527a06bd704",
          "message": "Revert \"chore: add default native proving for cli wallet retry (#13028)\"\n\nThis reverts commit b2f47855fa1877dc488ee4753037e5e057f5179d.",
          "timestamp": "2025-03-27T15:15:48Z",
          "tree_id": "a3967607117ca7a1d3240d5a90a970ea6ec92319",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8fc3c158ee8fac2386c656e7a7589527a06bd704"
        },
        "date": 1743090244341,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 39448,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 26556,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 11990,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 14388,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 15274,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "e1f2bddb4c1a21aeb1c058da2c8002863cff3e24",
          "message": "chore(avm): remove codegen (all but flavor) (#13079)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\nline.",
          "timestamp": "2025-03-27T15:33:20Z",
          "tree_id": "aa7358f1bbfa4a37559270678d8d1ce70ea22587",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e1f2bddb4c1a21aeb1c058da2c8002863cff3e24"
        },
        "date": 1743091283411,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17559.560789000214,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15401.058093 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 118094856289.09998,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 1601965452,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 215018166,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18609.50086699995,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16584.833573 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 50947.529495,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 50947531000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3851.2604559998636,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3023.702854 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9944.696800000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9944701000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2249.31",
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
          "distinct": true,
          "id": "e1f2bddb4c1a21aeb1c058da2c8002863cff3e24",
          "message": "chore(avm): remove codegen (all but flavor) (#13079)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\nline.",
          "timestamp": "2025-03-27T15:33:20Z",
          "tree_id": "aa7358f1bbfa4a37559270678d8d1ce70ea22587",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e1f2bddb4c1a21aeb1c058da2c8002863cff3e24"
        },
        "date": 1743091292911,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 39437,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 26344,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 11904,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 14821,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 15783,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "9c82f3f053e01cee5359f8b1625ecd27c4978bd2",
          "message": "chore(avm): final codegen nuking (#13089)\n\nMoves the only variable part of the flavor into a new file `flavor_variables.hpp`. Nukes the rest.",
          "timestamp": "2025-03-27T16:48:44Z",
          "tree_id": "6a91392f38901e6d52b5c3d60464129c53cd0385",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9c82f3f053e01cee5359f8b1625ecd27c4978bd2"
        },
        "date": 1743094801764,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17737.60518400013,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15691.826265 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 118131912581.50002,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 1697693380,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 234531236,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18799.340072000177,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16411.493393 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 50502.813094,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 50502816000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3918.650917999912,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3109.1013729999995 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10472.434481,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10472442000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2249.31",
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
          "distinct": true,
          "id": "9c82f3f053e01cee5359f8b1625ecd27c4978bd2",
          "message": "chore(avm): final codegen nuking (#13089)\n\nMoves the only variable part of the flavor into a new file `flavor_variables.hpp`. Nukes the rest.",
          "timestamp": "2025-03-27T16:48:44Z",
          "tree_id": "6a91392f38901e6d52b5c3d60464129c53cd0385",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9c82f3f053e01cee5359f8b1625ecd27c4978bd2"
        },
        "date": 1743094811875,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 39273,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 26829,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 11766,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 14897,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 15329,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "janbenes1234@gmail.com",
            "name": "Jan Beneš",
            "username": "benesjan"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "8e71e55911f928aaccaa07637631171c18584390",
          "message": "refactor: `getIndexedTaggingSecretAsSender` oracle cleanup (#13015)",
          "timestamp": "2025-03-27T17:23:37Z",
          "tree_id": "adf5bfad6c53901f64389a3840c536d03393fb2f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8e71e55911f928aaccaa07637631171c18584390"
        },
        "date": 1743096646352,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 33956,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 21974,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 10745,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 13187,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 13524,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "68168980+just-mitch@users.noreply.github.com",
            "name": "just-mitch",
            "username": "just-mitch"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "d936285f306eb79c268bfb02e365ef6462f9a0d0",
          "message": "fix: fuzzer on staking asset handler constructor test (#13101)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\nline.",
          "timestamp": "2025-03-27T18:59:20Z",
          "tree_id": "d541c9de77201597a37158dd9ba03b420a54d154",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d936285f306eb79c268bfb02e365ef6462f9a0d0"
        },
        "date": 1743102376082,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 40726,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 26121,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 11959,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 14600,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 15481,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "7bb43a9978d521d3b54284c16f0f4dcfebc46f0b",
          "message": "chore: Add a script to generate cpp files for AVM2 (#13091)",
          "timestamp": "2025-03-27T19:09:35Z",
          "tree_id": "18569f600fb4e4c3f5870f30547881529ff5e078",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7bb43a9978d521d3b54284c16f0f4dcfebc46f0b"
        },
        "date": 1743104329461,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17686.933186999795,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15633.650682000001 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 118124934161.50002,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 1597093410,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 214667547,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18788.992860000006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16329.262234999998 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 50493.297082000005,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 50493296000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3941.3406860001032,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3079.0796929999997 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9844.459069999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9844466000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2249.31",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
          "id": "7bb43a9978d521d3b54284c16f0f4dcfebc46f0b",
          "message": "chore: Add a script to generate cpp files for AVM2 (#13091)",
          "timestamp": "2025-03-27T19:09:35Z",
          "tree_id": "18569f600fb4e4c3f5870f30547881529ff5e078",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7bb43a9978d521d3b54284c16f0f4dcfebc46f0b"
        },
        "date": 1743104338568,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 39100,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 25978,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 11903,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 14835,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 15295,
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
          "distinct": true,
          "id": "1e77efb31fd8f22496eebb7b575952b9ebc14b27",
          "message": "feat: Prover node snapshot sync (#13097)\n\nBuilds on #12927",
          "timestamp": "2025-03-27T19:50:54Z",
          "tree_id": "b97552f7fe638a264b37b82a55eff7e925a1ab0b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1e77efb31fd8f22496eebb7b575952b9ebc14b27"
        },
        "date": 1743105454047,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 33896,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 21998,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 10767,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 13015,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 13454,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "aakoshh@gmail.com",
            "name": "Akosh Farkash",
            "username": "aakoshh"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "1e58eb1511e01463ba8f7052839b1f0d85e6f2ef",
          "message": "feat: `msgpack` encoding for `Program` and `WitnessStack` (#12841)\n\nAdds `msgpack` serialisation to the generated Acir and Witness C++ code.\n\nI moved the alterations described in `dsl/README.md` into the code\ngeneration itself, so no manual work is required. The PR is running\nagainst a feature branch with the same name in Noir, here's the upstream\nPR: https://github.com/noir-lang/noir/pull/7716\n\nWith this PR is merged, `bb` should be able to handle `msgpack` or\n`bincode`. Once that's released we can switch to using `msgpack` in Noir\nin both native and wasm by merging\nhttps://github.com/noir-lang/noir/pull/7810. And then we can remove the\n`msgpack` format detection and the fallback to `bincode`.\n\n**TODO**:\n- [x] Get it to compile \n- [x] Change `nargo` to allow compiling contracts with `msgpack` format:\nadded `NOIR_SERIALIZATION_FORMAT` env var\n- [x] Add a first byte to the data to say which serialization format it\nis. There is a chance that it would clash with existing bincode data\nthough, so a fallback would anyway be necessary. (Or we should ascertain\nthat bincode never starts with some specific bit sequence).\n- [x] ~Change the `bb` code so it tries `bincode`, then falls back to\n`msgpack` - this way the currently used format stays fast, but we can\nfeed it new data.~ _This looks problematic, as exceptions in the wasm\nbuild is disabled in `arch.cmake` and `throw_or_abort` aborts in wasm.\nInstead we run\n[msgpack::parse](https://c.msgpack.org/cpp/namespacemsgpack.html#ad844d148ad1ff6c9193b02529fe32968)\nfirst to check if the data looks like msgpack; if not, we use bincode._\n- [x] Run integration tests with `msgpack` on both sides in\nhttps://github.com/AztecProtocol/aztec-packages/pull/13021\n- [x] Ignore the Brillig opcodes in Barretenberg\n- [x] Change the serialization of `WitnessStack` and `WitnessMap` to use\nthe env var, add fallbacks in `bb` for them\n- [x] Revert the change to `noir-repo-ref` before merging\n\n\n### Use of `MSGPACK_FIELDS`\n\nThe generated code is using `MSGPACK_FIELDS` for structs, to keep it\nmore terse.\n\nAt some point during debugging the memory issue below I changed it so\nthat I can have more direct control by generating code for individual\nfields. That needed some helper functions which I looted from the\n`msgpack-c` library and injected into the namespaces as a `Helpers`\nstruct. This approach might be useful if we wanted to have extra checks,\nfor example rejecting the data if there are extra fields, indicating a\ntype has been extended with things we don't recognise, or if we wanted\nhandle renamed fields. I left it out so there is less code to maintain,\nbut if we need it we can recover it from the [commit\nhistory](https://github.com/noir-lang/noir/pull/7716/commits/b0a612de5f2f27fd8010182704d14dc96ce113cb).\n\n### Compile `nargo` with the `msgpack` feature\n\n```bash\necho af/msgpack-codegen > noir/noir-repo-ref\nnoir/bootstrap.sh\n```\n\n### Generate and compile C++ code\n\n```bash\ncd noir/noir-repo && NOIR_CODEGEN_OVERWRITE=1 cargo test -p acir cpp_codegen && cd -\ncp noir/noir-repo/acvm-repo/acir/codegen/acir.cpp barretenberg/cpp/src/barretenberg/dsl/acir_format/serde/acir.hpp\ncp noir/noir-repo/acvm-repo/acir/codegen/witness.cpp barretenberg/cpp/src/barretenberg/dsl/acir_format/serde/witness_stack.hpp\ncd barretenberg/cpp && ./format.sh changed && cd -\n\nbarretenberg/cpp/bootstrap.sh\n```\n\n### Test `nargo` with `bb`\n\nOne example of an integration test that uses `bb` and noir in the Noir\nrepo is\nhttps://github.com/noir-lang/noir/actions/runs/13631231158/job/38099477964\n\nWe can call it like this:\n\n```bash\ncd noir/noir-repo && cargo install --path tooling/nargo_cli && cd -\n./barretenberg/cpp/bootstrap.sh\nexport BACKEND=$(pwd)/barretenberg/cpp/build/bin/bb\nexport NOIR_SERIALIZATION_FORMAT=msgpack\nnoir/noir-repo/examples/prove_and_verify/test.sh\n```\n\nIf it works, it should print this:\n```console\n% unset NOIR_SERIALIZATION_FORMAT                       \n% noir/noir-repo/examples/prove_and_verify/test.sh      \n[hello_world] Circuit witness successfully solved\n[hello_world] Witness saved to /mnt/user-data/akosh/aztec-packages/noir/noir-repo/examples/prove_and_verify/target/witness.gz\nFinalized circuit size: 18\nProof saved to \"./proofs/proof\"\nFinalized circuit size: 18\nVK saved to \"./target/vk\"\nProof verified successfully\n```\n\nWhereas if it doesn't:\n```console\n% export NOIR_SERIALIZATION_FORMAT=msgpack                                                                                                                                                            \n% noir/noir-repo/examples/prove_and_verify/test.sh             \n[hello_world] Circuit witness successfully solved\n[hello_world] Witness saved to /mnt/user-data/akosh/aztec-packages/noir/noir-repo/examples/prove_and_verify/target/witness.gz\nLength is too large\n```\n\nI attached the final artefacts to the PR so it's easier to test with\njust `bb`.\n\n[hello_world.json](https://github.com/user-attachments/files/19391072/hello_world.json)\n\n[witness.gz](https://github.com/user-attachments/files/19391074/witness.gz)\n\n\n### Further testing\n\nWith the `noir-repo-ref` pointing at the feature `af/msgpack-codegen`\nfeature branch, we can run all the contract compilations and tests with\n`msgpack` as follows:\n\n```shell\nexport NOIR_SERIALIZATION_FORMAT=msgpack       \n./bootstrap.sh ci\n```\n\nThis is tested in\nhttps://github.com/AztecProtocol/aztec-packages/pull/13021\n\n### Peek into artefacts\n\nWe can inspect the file in JSON format using\n[this](https://crates.io/crates/msgpack-cli) msgpack CLI tool.\n\n```shell\njq -r '.bytecode' ./target/program.json | base64 --decode | gunzip | tail -c +2 | mpk --to-json | jq\n```\n\nThanks Tom for the\n[spell](https://github.com/AztecProtocol/msgpack-c/pull/5#issuecomment-2743703506)\n🙏\n\n### False bug\n\nAt some point I thought had to make some fixes in `msgpack-c` itself to\nmake this work: https://github.com/AztecProtocol/msgpack-c/pull/5\nA similar [blocking\nbug](https://github.com/AztecProtocol/aztec-packages/pull/12841#issuecomment-2746520682)\nwas encountered when running the entire `ci` build with msgpack format.\n\nIt turned out it was a [dangling\npointer](https://github.com/msgpack/msgpack-c/issues/695#issuecomment-393035172)\nissue, fixed in\nhttps://github.com/AztecProtocol/aztec-packages/pull/12841/commits/5810e3b5120c09fbe9887461f4b4fa56332c1b7d\n\nMuch of the comments below are related to my struggles that came from\nthis mistake; you can ignore them.",
          "timestamp": "2025-03-27T19:51:22Z",
          "tree_id": "0d1c277fda6b7ced3597555dfb10ebcce7cc9ace",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1e58eb1511e01463ba8f7052839b1f0d85e6f2ef"
        },
        "date": 1743107875499,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 16506.995484000072,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14798.799859 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 118092152862.29999,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 1454400738,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 206546268,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 17769.921337999906,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15411.750506 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 46586.858636000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 46586860000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3247.825586999852,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3015.5093850000007 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 7933.171543,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 7933171000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2337.31",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "aakoshh@gmail.com",
            "name": "Akosh Farkash",
            "username": "aakoshh"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "1e58eb1511e01463ba8f7052839b1f0d85e6f2ef",
          "message": "feat: `msgpack` encoding for `Program` and `WitnessStack` (#12841)\n\nAdds `msgpack` serialisation to the generated Acir and Witness C++ code.\n\nI moved the alterations described in `dsl/README.md` into the code\ngeneration itself, so no manual work is required. The PR is running\nagainst a feature branch with the same name in Noir, here's the upstream\nPR: https://github.com/noir-lang/noir/pull/7716\n\nWith this PR is merged, `bb` should be able to handle `msgpack` or\n`bincode`. Once that's released we can switch to using `msgpack` in Noir\nin both native and wasm by merging\nhttps://github.com/noir-lang/noir/pull/7810. And then we can remove the\n`msgpack` format detection and the fallback to `bincode`.\n\n**TODO**:\n- [x] Get it to compile \n- [x] Change `nargo` to allow compiling contracts with `msgpack` format:\nadded `NOIR_SERIALIZATION_FORMAT` env var\n- [x] Add a first byte to the data to say which serialization format it\nis. There is a chance that it would clash with existing bincode data\nthough, so a fallback would anyway be necessary. (Or we should ascertain\nthat bincode never starts with some specific bit sequence).\n- [x] ~Change the `bb` code so it tries `bincode`, then falls back to\n`msgpack` - this way the currently used format stays fast, but we can\nfeed it new data.~ _This looks problematic, as exceptions in the wasm\nbuild is disabled in `arch.cmake` and `throw_or_abort` aborts in wasm.\nInstead we run\n[msgpack::parse](https://c.msgpack.org/cpp/namespacemsgpack.html#ad844d148ad1ff6c9193b02529fe32968)\nfirst to check if the data looks like msgpack; if not, we use bincode._\n- [x] Run integration tests with `msgpack` on both sides in\nhttps://github.com/AztecProtocol/aztec-packages/pull/13021\n- [x] Ignore the Brillig opcodes in Barretenberg\n- [x] Change the serialization of `WitnessStack` and `WitnessMap` to use\nthe env var, add fallbacks in `bb` for them\n- [x] Revert the change to `noir-repo-ref` before merging\n\n\n### Use of `MSGPACK_FIELDS`\n\nThe generated code is using `MSGPACK_FIELDS` for structs, to keep it\nmore terse.\n\nAt some point during debugging the memory issue below I changed it so\nthat I can have more direct control by generating code for individual\nfields. That needed some helper functions which I looted from the\n`msgpack-c` library and injected into the namespaces as a `Helpers`\nstruct. This approach might be useful if we wanted to have extra checks,\nfor example rejecting the data if there are extra fields, indicating a\ntype has been extended with things we don't recognise, or if we wanted\nhandle renamed fields. I left it out so there is less code to maintain,\nbut if we need it we can recover it from the [commit\nhistory](https://github.com/noir-lang/noir/pull/7716/commits/b0a612de5f2f27fd8010182704d14dc96ce113cb).\n\n### Compile `nargo` with the `msgpack` feature\n\n```bash\necho af/msgpack-codegen > noir/noir-repo-ref\nnoir/bootstrap.sh\n```\n\n### Generate and compile C++ code\n\n```bash\ncd noir/noir-repo && NOIR_CODEGEN_OVERWRITE=1 cargo test -p acir cpp_codegen && cd -\ncp noir/noir-repo/acvm-repo/acir/codegen/acir.cpp barretenberg/cpp/src/barretenberg/dsl/acir_format/serde/acir.hpp\ncp noir/noir-repo/acvm-repo/acir/codegen/witness.cpp barretenberg/cpp/src/barretenberg/dsl/acir_format/serde/witness_stack.hpp\ncd barretenberg/cpp && ./format.sh changed && cd -\n\nbarretenberg/cpp/bootstrap.sh\n```\n\n### Test `nargo` with `bb`\n\nOne example of an integration test that uses `bb` and noir in the Noir\nrepo is\nhttps://github.com/noir-lang/noir/actions/runs/13631231158/job/38099477964\n\nWe can call it like this:\n\n```bash\ncd noir/noir-repo && cargo install --path tooling/nargo_cli && cd -\n./barretenberg/cpp/bootstrap.sh\nexport BACKEND=$(pwd)/barretenberg/cpp/build/bin/bb\nexport NOIR_SERIALIZATION_FORMAT=msgpack\nnoir/noir-repo/examples/prove_and_verify/test.sh\n```\n\nIf it works, it should print this:\n```console\n% unset NOIR_SERIALIZATION_FORMAT                       \n% noir/noir-repo/examples/prove_and_verify/test.sh      \n[hello_world] Circuit witness successfully solved\n[hello_world] Witness saved to /mnt/user-data/akosh/aztec-packages/noir/noir-repo/examples/prove_and_verify/target/witness.gz\nFinalized circuit size: 18\nProof saved to \"./proofs/proof\"\nFinalized circuit size: 18\nVK saved to \"./target/vk\"\nProof verified successfully\n```\n\nWhereas if it doesn't:\n```console\n% export NOIR_SERIALIZATION_FORMAT=msgpack                                                                                                                                                            \n% noir/noir-repo/examples/prove_and_verify/test.sh             \n[hello_world] Circuit witness successfully solved\n[hello_world] Witness saved to /mnt/user-data/akosh/aztec-packages/noir/noir-repo/examples/prove_and_verify/target/witness.gz\nLength is too large\n```\n\nI attached the final artefacts to the PR so it's easier to test with\njust `bb`.\n\n[hello_world.json](https://github.com/user-attachments/files/19391072/hello_world.json)\n\n[witness.gz](https://github.com/user-attachments/files/19391074/witness.gz)\n\n\n### Further testing\n\nWith the `noir-repo-ref` pointing at the feature `af/msgpack-codegen`\nfeature branch, we can run all the contract compilations and tests with\n`msgpack` as follows:\n\n```shell\nexport NOIR_SERIALIZATION_FORMAT=msgpack       \n./bootstrap.sh ci\n```\n\nThis is tested in\nhttps://github.com/AztecProtocol/aztec-packages/pull/13021\n\n### Peek into artefacts\n\nWe can inspect the file in JSON format using\n[this](https://crates.io/crates/msgpack-cli) msgpack CLI tool.\n\n```shell\njq -r '.bytecode' ./target/program.json | base64 --decode | gunzip | tail -c +2 | mpk --to-json | jq\n```\n\nThanks Tom for the\n[spell](https://github.com/AztecProtocol/msgpack-c/pull/5#issuecomment-2743703506)\n🙏\n\n### False bug\n\nAt some point I thought had to make some fixes in `msgpack-c` itself to\nmake this work: https://github.com/AztecProtocol/msgpack-c/pull/5\nA similar [blocking\nbug](https://github.com/AztecProtocol/aztec-packages/pull/12841#issuecomment-2746520682)\nwas encountered when running the entire `ci` build with msgpack format.\n\nIt turned out it was a [dangling\npointer](https://github.com/msgpack/msgpack-c/issues/695#issuecomment-393035172)\nissue, fixed in\nhttps://github.com/AztecProtocol/aztec-packages/pull/12841/commits/5810e3b5120c09fbe9887461f4b4fa56332c1b7d\n\nMuch of the comments below are related to my struggles that came from\nthis mistake; you can ignore them.",
          "timestamp": "2025-03-27T19:51:22Z",
          "tree_id": "0d1c277fda6b7ced3597555dfb10ebcce7cc9ace",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1e58eb1511e01463ba8f7052839b1f0d85e6f2ef"
        },
        "date": 1743107884715,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 39190,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 26506,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 11892,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 14972,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 15271,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "distinct": true,
          "id": "69f426e2e2bcef09c6a4f42300e92f4ded24e9f0",
          "message": "fix: cycle_group fuzzer (#12921)\n\nThis pr fixes several issues in `cycle_group`, `cycle_group fuzzer` and\n`field_t`. And prepares the repo for automated fuzzing\n\n## CMake\n\n- Added new definition for `SHOW_INFORMATION` for debugging the fuzzer\noutputs\n- Removed `coverage` options from clang, since it's no longer supported\n\n## Field\n\n- switched a bunch of zeros to ones in `field_t` `const` initializations\nto make the behavior of constants uniform across all the methods\n- `operator-()` and `operator-(other)` no longer change the\nmultiplicative constant of a `const`\n- `operator+(other)` no longer adds the corresponding multiplicative\nconstants of two consts\n- Consequently assert equal now behaves better and creates less gates on\naverage\n\n- added the regression tests on the bug\n\n## Cycle Group\n\nI decided to get rid of `is_standard` parameter in constructors. Now it\nfully depends on the input values.\n\n`set_point_at_infinity` - major changes in this method. Now all the edge\ncases are handled. I hope\nAlso, from now on it's explicitly checked that we don't set the point at\ninfinity to not infinity, since this behavior is undefined.\n\n`operator+`, `operator-`. Got rid of the blank `cycle_group\nresult(ctx)`. It caused too many problems. Now the result is properly\nconstructed from coordinates and `is_infinty`.\n\n\n## Cycle Group Fuzzer\n\n- Got rid of the old `SHOW_INFORMATION` macros to make uniform builds in\nautomated setting\n- changed the `set_inf` method to work under new restrictions\n\n---------\n\nCo-authored-by: Innokentii Sennovskii <isennovskiy@gmail.com>",
          "timestamp": "2025-03-27T23:43:35+03:00",
          "tree_id": "a902eb4965590d832125ce2bd30a6d6963890e61",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/69f426e2e2bcef09c6a4f42300e92f4ded24e9f0"
        },
        "date": 1743108688609,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 16680.24922199993,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14895.434302 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 118126788329.9,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 1452723638,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 208285057,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 17889.94706100016,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15486.324605 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 46585.932436,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 46585933000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3133.678574000214,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 2951.470995 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 7986.230005999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 7986230000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2337.31",
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
          "distinct": true,
          "id": "69f426e2e2bcef09c6a4f42300e92f4ded24e9f0",
          "message": "fix: cycle_group fuzzer (#12921)\n\nThis pr fixes several issues in `cycle_group`, `cycle_group fuzzer` and\n`field_t`. And prepares the repo for automated fuzzing\n\n## CMake\n\n- Added new definition for `SHOW_INFORMATION` for debugging the fuzzer\noutputs\n- Removed `coverage` options from clang, since it's no longer supported\n\n## Field\n\n- switched a bunch of zeros to ones in `field_t` `const` initializations\nto make the behavior of constants uniform across all the methods\n- `operator-()` and `operator-(other)` no longer change the\nmultiplicative constant of a `const`\n- `operator+(other)` no longer adds the corresponding multiplicative\nconstants of two consts\n- Consequently assert equal now behaves better and creates less gates on\naverage\n\n- added the regression tests on the bug\n\n## Cycle Group\n\nI decided to get rid of `is_standard` parameter in constructors. Now it\nfully depends on the input values.\n\n`set_point_at_infinity` - major changes in this method. Now all the edge\ncases are handled. I hope\nAlso, from now on it's explicitly checked that we don't set the point at\ninfinity to not infinity, since this behavior is undefined.\n\n`operator+`, `operator-`. Got rid of the blank `cycle_group\nresult(ctx)`. It caused too many problems. Now the result is properly\nconstructed from coordinates and `is_infinty`.\n\n\n## Cycle Group Fuzzer\n\n- Got rid of the old `SHOW_INFORMATION` macros to make uniform builds in\nautomated setting\n- changed the `set_inf` method to work under new restrictions\n\n---------\n\nCo-authored-by: Innokentii Sennovskii <isennovskiy@gmail.com>",
          "timestamp": "2025-03-27T23:43:35+03:00",
          "tree_id": "a902eb4965590d832125ce2bd30a6d6963890e61",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/69f426e2e2bcef09c6a4f42300e92f4ded24e9f0"
        },
        "date": 1743108697647,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 33913,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 21944,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 10859,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 13074,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 13489,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "00fae1befe285cca454bdc13f205fa0cbc38174b",
          "message": "feat: benchmark avm simulator (#12985)\n\nThis PR does _not_ integrate benchmarks into CI. It updates the\nsimulator tests to support benchmarking, adds a bench test, and\npretty-prints simulator benchmarks.\n\n## AvmSimulator\n- instrCounter tracked in machine state. When a nested call returns, its\nparent absorbs its instrCounter. This might seem weird, but it's the\nmetric we want. If it feels too wrong, i'm fine having both an\ninstrCounter and a totalInstrCounter. Or we can rename this one\ntotalInstrCounter for clarity.\n\n## PublicTxSimulationTester, SimpleContractDataSource\n- SimpleContractDataSource now tracks contract & function names so that\n`getDebugFunctionName()` works properly in simulator tests\n- Tester only creates a single PublicTxSimulator that is used for all\nsimulations instead of one per simulation\n- Test can create a `TestExecutorMetrics` and pass it into\n`PublicTxSimulationTester` constructor so that many test cases can\naggregate metrics into the same class.\n\n## Metrics / Benchmarking\nI opted _not_ to use the telemetry based benchmarking used by\n`e2e_block_building.test.ts`. Instead, I created a custom\n`TestExecutorMetrics` for benchmarking the simulator in exactly the way\nthat works for us. We can easily add `toGithubActionsBenchmark()`\nadapter function if it is valuable.\n\nRunning the tests with `BENCH_OUTPUT_MD` set will output the results to\nthe specified markdown file. Running them without that env var set will\n`log.info` them.\n\n## New AMM test isolated to public simulation for measurements\nThis is brittle. It gives us measurements, but will break if any changes\nare made to AMM.\n\n![image](https://github.com/user-attachments/assets/abffd658-5b79-430a-9a68-822ba911e997)\n\n![image](https://github.com/user-attachments/assets/78816f68-c470-41d8-991c-731e512cf1a1)\n\n![image](https://github.com/user-attachments/assets/2d8f8782-bb25-4928-b36e-2b584098834d)",
          "timestamp": "2025-03-27T21:53:52Z",
          "tree_id": "0a1be7b5aa44fc1901b8b33dbec6d60211509b32",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/00fae1befe285cca454bdc13f205fa0cbc38174b"
        },
        "date": 1743112854179,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 39435,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 26194,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 11785,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 14775,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 15101,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "152162806+sklppy88@users.noreply.github.com",
            "name": "esau",
            "username": "sklppy88"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "7dac390c30b0f857878c28dc109a4851940eba3c",
          "message": "fix: use version from registry for rollup instead of config (#12938)\n\nThis ensures that we use rollup / registry from the version passed in,\nand the version is now optional and not preset to 1. I'm not removing\nany config though to keep this individual change small, as the cleanup\nwill be bigger and may want to be thought out a bit more.\n\nCo-authored-by: sklppy88 <esau@aztecprotocol.com>",
          "timestamp": "2025-03-28T02:35:18+01:00",
          "tree_id": "d276f3b93f21112976754ac37532c8fb2bf9ed59",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7dac390c30b0f857878c28dc109a4851940eba3c"
        },
        "date": 1743127298963,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 34113,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 22183,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 10829,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 13313,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 13583,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "0e602556e2874309162f66a53d1afaf0d8546c9e",
          "message": "feat: remove unary trick in decomposition and constraints polishing (#13080)\n\nBenchmarks after this PR:\n\n```\n-------------------------------------------------------------------------------\nBenchmark                                     Time             CPU   Iterations\n-------------------------------------------------------------------------------\nbc_decomposition_acc                       7.34 us         7.33 us        96151\nbc_decomposition_interactions_acc         0.704 us        0.704 us       987128\nbc_hashing_acc                            0.905 us        0.905 us       769096\nbc_hashing_interactions_acc                1.39 us         1.39 us       505947\ninstr_fetching_acc                         8.69 us         8.69 us        81451\ninstr_fetching_interactions_acc            5.90 us         5.89 us       119592\n```\nBenchmarks before this PR:\n\n```\nbc_decomposition_acc                       13.3 us         13.3 us        55869\nbc_decomposition_interactions_acc          1.36 us         1.36 us       508241\nbc_hashing_acc                            0.827 us        0.827 us       810309\nbc_hashing_interactions_acc                1.52 us         1.52 us       427220\ninstr_fetching_acc                         8.84 us         8.84 us        81336\ninstr_fetching_interactions_acc            5.84 us         5.83 us       119965\n```",
          "timestamp": "2025-03-28T09:01:18Z",
          "tree_id": "212b5a5a73678c30ee7cac38381978581d27ee20",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0e602556e2874309162f66a53d1afaf0d8546c9e"
        },
        "date": 1743152913039,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18078.403519999938,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15942.651672000002 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 118113573037.6,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 1602908467,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 217051072,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18798.37757999985,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16364.396474 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 50950.65014799999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 50950650000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3957.5683810003284,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3126.4956999999995 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10820.951487,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10820954000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2337.31",
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