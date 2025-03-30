window.BENCHMARK_DATA = {
  "lastUpdate": 1743367215138,
  "repoUrl": "https://github.com/AztecProtocol/aztec-packages",
  "entries": {
    "C++ Benchmark": [
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
        "date": 1743152925338,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 39634,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 27647,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 11789,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 14873,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 15398,
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
          "id": "2a2904a655092ec67f44af627b7d3d80ece52b51",
          "message": "fix: load two more points (#13119)\n\n@PhilWindle noticed that the prover agents had to download the CRS again\nin order to prove a root rollup. Looking at the files it seems they\nneeded two more points added to the initial preload (this is possible\nnow that the files are streamed, see #12996)",
          "timestamp": "2025-03-28T09:54:04Z",
          "tree_id": "7502b1915d4b99f2f9246a1327a3ab82c97769ba",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/2a2904a655092ec67f44af627b7d3d80ece52b51"
        },
        "date": 1743157324833,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 39593,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 26960,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 11688,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 14847,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 15209,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "f67375deb410e99dd05336e0bc58533127b86b6c",
          "message": "chore: Improve callstacks for public dispatch fns (#13120)\n\nBefore\n\n![image](https://github.com/user-attachments/assets/e08ca917-9420-4094-87ce-d17118af539d)\nAfter\n\n![image](https://github.com/user-attachments/assets/985f5954-38ed-41a6-b817-b1dec9404891)",
          "timestamp": "2025-03-28T12:25:40+01:00",
          "tree_id": "5d5e4f4fa24cb5522a07fae153ed9d5c32d62914",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f67375deb410e99dd05336e0bc58533127b86b6c"
        },
        "date": 1743161580350,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 34056,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 22078,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 10758,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 13041,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 13477,
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
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "970dae5b7745165c81b93a0b7240b428cf94e782",
          "message": "fix: force anvil/blob networking to ipv4 on localhost. attempt to fix port flakes (#13099)\n\nWe occasionally get \"port in use\" or \"unable to find available port\"\nissues in tests that use the network stack.\nWhen I was facing these with TXE startups, I think I eventually\n\"resolved\" it by ensuring we bind explicitly to the loopback interface\nusing only ipv4 by directly specifying `127.0.0.1`.\nIf you provide `localhost` you might bind on ipv6, and some of our\ndefaults are `0.0.0.0` which attempts to bind on all available\ninterfaces - and I think that may actually be where the problem lies.\n\nThis is a bit of a wing - we can see if it works.",
          "timestamp": "2025-03-28T12:21:17Z",
          "tree_id": "f7043bb7e63a83a3c90364e35ab71a1e7d373f83",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/970dae5b7745165c81b93a0b7240b428cf94e782"
        },
        "date": 1743166135155,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 39077,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 26489,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 11983,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 14748,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 15580,
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
          "id": "f87d5e30f06f84fea17928490283075019980851",
          "message": "refactor: metric attributes (#13126)\n\nDisallow attributes in metrics that could lead to high cardinality at\ncompile time.\n\n\n![image](https://github.com/user-attachments/assets/1bf57ecc-6530-4779-8582-bae47b90c6c9)\n\n\nFix #13063",
          "timestamp": "2025-03-28T12:38:07Z",
          "tree_id": "e824edc41ade9f62bcd7cf28390e070bca4171d6",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f87d5e30f06f84fea17928490283075019980851"
        },
        "date": 1743167181744,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 39547,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 27084,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 11762,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 14521,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 15414,
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
          "id": "a406c549b2e479146b24ff79082fb6708623dc78",
          "message": "feat: get mana limit from rollup by default. (#13029)\n\nAnd check that the sequencer respects it",
          "timestamp": "2025-03-28T08:41:53-04:00",
          "tree_id": "fcfa994b6d1a6739f3a09d6e9b405be42185b848",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a406c549b2e479146b24ff79082fb6708623dc78"
        },
        "date": 1743167227303,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 33730,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 22115,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 10694,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 13126,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 13435,
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
          "id": "a93ce6eb5ae91a42a3026a00d81a727022c2471c",
          "message": "fix: boolean config helper for cli args works now (#13110)\n\nUsing `booleanConfigHelper` without `[value]` in the commander flag was\nresulting in all our boolean cli args either using the default (if no\nvalue was provided), or to `false`, because the \"value\" supplied to the\n`parse` function was always `undefined`.\n\nThis resuled in, e.g. passing `--p2p-enabled` being interpreted as\nfalse.\n\nNow the expected behavior reigns: `--p2p-enabled` and\n`--p2p-enabled=true` and `--p2p-enabled true` all result in the flag\nbeing `true`, but `--p2p-enabled=false` and `--p2p-enabled false` result\nin the flag being `false`.\n\nIn the `testAccounts` case, since it was defined as `true` by default\nfor the sandbox, it was picking up that value when parsing for the node,\nso no matter what it was true.",
          "timestamp": "2025-03-28T08:53:37-04:00",
          "tree_id": "52fd37c68786193adaee74e1a4cf8658194f13fe",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a93ce6eb5ae91a42a3026a00d81a727022c2471c"
        },
        "date": 1743168405712,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 33692,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 21992,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 10671,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 13043,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 13368,
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
          "id": "bacae3d1fc7d70b7adf2946446af76d50eec1259",
          "message": "fix: fuzzing build issues (#13114)\n\nThis pr resolves the current issues with automated build for fuzzing",
          "timestamp": "2025-03-28T12:51:06Z",
          "tree_id": "e6ea8585120b018113e0902bdc9357bb886f8afe",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/bacae3d1fc7d70b7adf2946446af76d50eec1259"
        },
        "date": 1743168492189,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17683.20672799996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15699.610275 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 118151854752.79999,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 1607119272,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 214443100,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 19351.25868,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16554.094855000003 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 50920.868638,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 50920868000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3917.3905259997355,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3142.6714660000002 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10680.26858,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10680276000 ms\nthreads: 1"
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
          "id": "bacae3d1fc7d70b7adf2946446af76d50eec1259",
          "message": "fix: fuzzing build issues (#13114)\n\nThis pr resolves the current issues with automated build for fuzzing",
          "timestamp": "2025-03-28T12:51:06Z",
          "tree_id": "e6ea8585120b018113e0902bdc9357bb886f8afe",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/bacae3d1fc7d70b7adf2946446af76d50eec1259"
        },
        "date": 1743168502496,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 39553,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 26444,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 11880,
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
            "value": 15293,
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
          "id": "1c08d38c040be51ce7c87023a1aaf821179f9e32",
          "message": "chore: fuzzing build in ci (#13105)\n\nSet for now not to create object files, just sanity check the build.\nAlso moved to zstd compression (toggled via file suffix check of .zst)\nfor speed\n\n---------\n\nCo-authored-by: Sarkoxed <75146596+Sarkoxed@users.noreply.github.com>",
          "timestamp": "2025-03-28T16:41:00+03:00",
          "tree_id": "41e68df8ec1e660c1fe50e59153964abb2322581",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1c08d38c040be51ce7c87023a1aaf821179f9e32"
        },
        "date": 1743170996377,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 16915.94162499996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14930.831660000002 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 118122139148.30002,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 1474776994,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 203070687,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18029.70438300008,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15428.883387999998 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 46501.970928999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 46501972000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3153.692911999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 2967.958431 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 7985.377368,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 7985378000 ms\nthreads: 1"
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
          "id": "1c08d38c040be51ce7c87023a1aaf821179f9e32",
          "message": "chore: fuzzing build in ci (#13105)\n\nSet for now not to create object files, just sanity check the build.\nAlso moved to zstd compression (toggled via file suffix check of .zst)\nfor speed\n\n---------\n\nCo-authored-by: Sarkoxed <75146596+Sarkoxed@users.noreply.github.com>",
          "timestamp": "2025-03-28T16:41:00+03:00",
          "tree_id": "41e68df8ec1e660c1fe50e59153964abb2322581",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1c08d38c040be51ce7c87023a1aaf821179f9e32"
        },
        "date": 1743171005759,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 39622,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 25772,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 11907,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 14784,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 15365,
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
          "id": "7d875a6133c903341e8df11b5837dda80048a827",
          "message": "chore(avm): remove check_interaction from tests (#13136)\n\nWe think this gets sufficiently tested with the lookup builders (once https://github.com/AztecProtocol/aztec-packages/issues/13140 is solved).",
          "timestamp": "2025-03-28T16:55:47Z",
          "tree_id": "a3586711ccfadec678d2f6d2fd43f7bfe993a2ba",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7d875a6133c903341e8df11b5837dda80048a827"
        },
        "date": 1743183104052,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17647.801526999956,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15912.917383999998 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 118122032673.70001,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 1650985308,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 223865226,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18991.373918999896,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16414.67572 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 50875.239613,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 50875238000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3873.022097999865,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3158.646108 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10877.425882,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10877429000 ms\nthreads: 1"
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
          "id": "7d875a6133c903341e8df11b5837dda80048a827",
          "message": "chore(avm): remove check_interaction from tests (#13136)\n\nWe think this gets sufficiently tested with the lookup builders (once https://github.com/AztecProtocol/aztec-packages/issues/13140 is solved).",
          "timestamp": "2025-03-28T16:55:47Z",
          "tree_id": "a3586711ccfadec678d2f6d2fd43f7bfe993a2ba",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7d875a6133c903341e8df11b5837dda80048a827"
        },
        "date": 1743183112852,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 34264,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 22144,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 10810,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 13198,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 13495,
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
          "id": "aea210ba4c16dddc0088e20034d718f07e456dad",
          "message": "chore: Add ultra versions of fuzzers in stdlib (#13139)\n\nThis pr adds `*_ultra_fuzzer` versions for all the existing fuzzers in\nstdlib",
          "timestamp": "2025-03-28T20:03:28+03:00",
          "tree_id": "24f6dc991b559b3727cf016996da642fcba01752",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/aea210ba4c16dddc0088e20034d718f07e456dad"
        },
        "date": 1743183571437,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17019.91507499997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15112.553609999999 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 118116601154.2,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 1460467915,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 202851369,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 17854.240419999995,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15532.633483 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 46389.994674,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 46389995000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3142.879718999893,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 2966.3018979999997 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 7866.210699000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 7866211000 ms\nthreads: 1"
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
          "id": "aea210ba4c16dddc0088e20034d718f07e456dad",
          "message": "chore: Add ultra versions of fuzzers in stdlib (#13139)\n\nThis pr adds `*_ultra_fuzzer` versions for all the existing fuzzers in\nstdlib",
          "timestamp": "2025-03-28T20:03:28+03:00",
          "tree_id": "24f6dc991b559b3727cf016996da642fcba01752",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/aea210ba4c16dddc0088e20034d718f07e456dad"
        },
        "date": 1743183580486,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 34124,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 21995,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 10800,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 13119,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 13486,
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
          "id": "c5f998439ca29956a62466d202974e85ab58b7c0",
          "message": "feat: add ecdsa non ssh account to cli wallet (#13085)\n\nAfter the addition of ecdsa non-ssh by @Thunkar, this simply adds it to\nbe useable in the cli wallet.\n\nCo-authored-by: sklppy88 <esau@aztecprotocol.com>",
          "timestamp": "2025-03-28T18:07:44+01:00",
          "tree_id": "8cca3cbcd796d4dbafbe36a886d784fa3487b553",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c5f998439ca29956a62466d202974e85ab58b7c0"
        },
        "date": 1743183614270,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 34150,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 22229,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 10932,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 13192,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 13535,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "51711291+natebeauregard@users.noreply.github.com",
            "name": "Nate Beauregard",
            "username": "natebeauregard"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "455587132be156a18f7849ca585fe0ff4ae2637b",
          "message": "fix: validate private double spends in txs with public funcs (#13088)\n\nFixes https://github.com/AztecProtocol/aztec-packages/issues/12902\n\nThe post-processing double-spend validation broke once the\nPublicTxSimulator+AVM started performing all nullifier insertions.\n\nThis PR removes the post-processing double spend validation and instead\nchecks all txs (regardless of if the tx is private-only or has public\ncalls) for duplicate nullifiers during pre-processing. Then, the\nPublicTxSimulator+AVM will ensure that any nullifiers added during\npublic execution cannot cause collisions.\n\nsee\nhttps://demerzelsolutions.slack.com/archives/C04BTJAA694/p1743001880033519\nfor additional info",
          "timestamp": "2025-03-28T15:24:01-03:00",
          "tree_id": "450601e7eeca275260d00a06cc777097ef2433d4",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/455587132be156a18f7849ca585fe0ff4ae2637b"
        },
        "date": 1743187760321,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 34304,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 22201,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 10881,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 13154,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 13558,
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
          "id": "7c520a8825c919cfb0ece990dbfd4d6a087ac927",
          "message": "chore: Cron snapshot upload in spartan (#13108)\n\nAdds a cronjob to the spartan templates that curls the full node and\ninstructs it to start a snapshot upload to a gcs bucket. The admin api\nis exposed via a new service defined on the full node, which should not\nget exposed to the outside world based on the firewall rules we have\ndefined in terraform.",
          "timestamp": "2025-03-28T18:48:58Z",
          "tree_id": "0a0685ffcc35de89064cfbd3bca44a84f87fbb81",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7c520a8825c919cfb0ece990dbfd4d6a087ac927"
        },
        "date": 1743189356369,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 34188,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 22153,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 10793,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 13247,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 13588,
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
          "id": "493dede81c2b22426025a398ac81f6b3b8ad9e81",
          "message": "feat(noir): Allow missing optional fields in msgpack (#13141)\n\nFollowup for https://github.com/AztecProtocol/aztec-packages/pull/12841\n\nChanges code generation for msgpack so that it doesn't throw an error if\nan optional field of a `struct` is not present in the data. This is to\nallow @TomAFrench and @asterite to delete `Opcode::MemoryOp::predicate`\nwhich is an optional field that we no longer use. Removing such a field\nshould be a non-breaking change, as the field was optional to begin\nwith, so while even if it's present in C++ it should already handle it\nbeing empty.\n\nUnfortunately the `msgpack-c` library as far as I can see [would throw\nan\nerror](https://github.com/AztecProtocol/msgpack-c/blob/54e9865b84bbdc73cfbf8d1d437dbf769b64e386/include/msgpack/v1/adaptor/detail/cpp11_define_map.hpp#L33-L45)\nif the optional field would not be present in the data as NIL.\n\nFor this to work the PR re-introduces the `Helpers` and enumerates\nfields explicitly, instead of using `MSGPACK_FIELDS`. I changed the\nunmerged https://github.com/noir-lang/noir/pull/7716 to do codegen with\nthis change.\n\nI rebased https://github.com/AztecProtocol/aztec-packages/pull/13021 on\ntop of this PR to see if it works when msgpack is actually in use.\n\n### Note for future migration path\n\n@ludamad reached out that while the bytecode size increase shown in\nhttps://github.com/noir-lang/noir/pull/7690 doesn't seem too bad, and\ncompression compensates for the inclusion of string field names, it's\nstill wasteful to have to parse them, and it would be better to use\narrays.\n\nI established in\n[tests](https://github.com/noir-lang/noir/pull/7690/files#diff-2d66028e5a8966511a76d1740d752be294c0b6a46e0a567bc2959f91d9ce224bR169-R176)\nthat we what we call `msgpack-compact` format uses arrays for structs,\nbut still tags enums with types. We use a lot of enums, so there is\nstill quite a few strings. Ostensibly we could use [serde\nattributes](https://serde.rs/container-attrs.html) to shorten names, but\nit would probably be a nightmare and ugly.\n\nNevertheless if we generated C++ code to deal with arrays, we could save\nsome space.\n\nAnd if we want to stick to `bincode`, we can use\n`NOIR_SERIALIZATION_FORMAT=bincode`, which I back ported to the Noir\ncodegen PR, to generate `bincode` with a format byte marker. There is\nalso `bincode-legacy`, but unfortunately we only have one shot at\ndeserialising bincode in C++: if it fails, we can't catch the exception.\nTherefore the path to be able to use the bincode format marker is:\n1. Release `bb` which can handle the `msgpack` format (which has a\nprobe, doesn't have to throw)\n2. Start producing msgpack data from `nargo` \n3. Stop accepting unmarked bincode in `bb` and look for format byte == 1\nto show that bincode is in use\n4. Tell `nargo` which format to use\n\nEDIT: Unfortunately if we use `binpack` with today's data types it\nforces us to parse the Brillig part, as established by\nhttps://github.com/AztecProtocol/aztec-packages/pull/13143 which would\nmean the Noir team can't make any changes to Brillig opcodes without\nbreaking `bb`. We would need to change the format again to use two tier\nencoding, or use msgpack arrays.",
          "timestamp": "2025-03-28T18:40:28Z",
          "tree_id": "3e1ee8c69b353e2534034efc9f4fc47e9e24a838",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/493dede81c2b22426025a398ac81f6b3b8ad9e81"
        },
        "date": 1743189362531,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 16726.48567300007,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14988.732558 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 118125061884.5,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 1451178156,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 200784088,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 17827.54043399996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15701.612101 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 46460.570284999994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 46460571000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3200.270989000046,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3004.523784 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 7919.656704999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 7919657000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2209.31",
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
          "id": "493dede81c2b22426025a398ac81f6b3b8ad9e81",
          "message": "feat(noir): Allow missing optional fields in msgpack (#13141)\n\nFollowup for https://github.com/AztecProtocol/aztec-packages/pull/12841\n\nChanges code generation for msgpack so that it doesn't throw an error if\nan optional field of a `struct` is not present in the data. This is to\nallow @TomAFrench and @asterite to delete `Opcode::MemoryOp::predicate`\nwhich is an optional field that we no longer use. Removing such a field\nshould be a non-breaking change, as the field was optional to begin\nwith, so while even if it's present in C++ it should already handle it\nbeing empty.\n\nUnfortunately the `msgpack-c` library as far as I can see [would throw\nan\nerror](https://github.com/AztecProtocol/msgpack-c/blob/54e9865b84bbdc73cfbf8d1d437dbf769b64e386/include/msgpack/v1/adaptor/detail/cpp11_define_map.hpp#L33-L45)\nif the optional field would not be present in the data as NIL.\n\nFor this to work the PR re-introduces the `Helpers` and enumerates\nfields explicitly, instead of using `MSGPACK_FIELDS`. I changed the\nunmerged https://github.com/noir-lang/noir/pull/7716 to do codegen with\nthis change.\n\nI rebased https://github.com/AztecProtocol/aztec-packages/pull/13021 on\ntop of this PR to see if it works when msgpack is actually in use.\n\n### Note for future migration path\n\n@ludamad reached out that while the bytecode size increase shown in\nhttps://github.com/noir-lang/noir/pull/7690 doesn't seem too bad, and\ncompression compensates for the inclusion of string field names, it's\nstill wasteful to have to parse them, and it would be better to use\narrays.\n\nI established in\n[tests](https://github.com/noir-lang/noir/pull/7690/files#diff-2d66028e5a8966511a76d1740d752be294c0b6a46e0a567bc2959f91d9ce224bR169-R176)\nthat we what we call `msgpack-compact` format uses arrays for structs,\nbut still tags enums with types. We use a lot of enums, so there is\nstill quite a few strings. Ostensibly we could use [serde\nattributes](https://serde.rs/container-attrs.html) to shorten names, but\nit would probably be a nightmare and ugly.\n\nNevertheless if we generated C++ code to deal with arrays, we could save\nsome space.\n\nAnd if we want to stick to `bincode`, we can use\n`NOIR_SERIALIZATION_FORMAT=bincode`, which I back ported to the Noir\ncodegen PR, to generate `bincode` with a format byte marker. There is\nalso `bincode-legacy`, but unfortunately we only have one shot at\ndeserialising bincode in C++: if it fails, we can't catch the exception.\nTherefore the path to be able to use the bincode format marker is:\n1. Release `bb` which can handle the `msgpack` format (which has a\nprobe, doesn't have to throw)\n2. Start producing msgpack data from `nargo` \n3. Stop accepting unmarked bincode in `bb` and look for format byte == 1\nto show that bincode is in use\n4. Tell `nargo` which format to use\n\nEDIT: Unfortunately if we use `binpack` with today's data types it\nforces us to parse the Brillig part, as established by\nhttps://github.com/AztecProtocol/aztec-packages/pull/13143 which would\nmean the Noir team can't make any changes to Brillig opcodes without\nbreaking `bb`. We would need to change the format again to use two tier\nencoding, or use msgpack arrays.",
          "timestamp": "2025-03-28T18:40:28Z",
          "tree_id": "3e1ee8c69b353e2534034efc9f4fc47e9e24a838",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/493dede81c2b22426025a398ac81f6b3b8ad9e81"
        },
        "date": 1743189373218,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 33877,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 22011,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 10674,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 13071,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 13295,
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
          "id": "09e47221a56deec80324a8e2cb3e482bc9b000fe",
          "message": "chore: Add e2e test to bootstrap test_cmds (#13146)\n\nAdds test added in #13088",
          "timestamp": "2025-03-28T18:52:32Z",
          "tree_id": "6b71fef2b475b84a1086e3b84d46fef3fab2f2b0",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/09e47221a56deec80324a8e2cb3e482bc9b000fe"
        },
        "date": 1743189475220,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 34044,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 22224,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 10794,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 13128,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 13655,
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
          "id": "6307ba073e362a63dc50b7dbbeb9db2556aee6ed",
          "message": "feat: derived pending notes capsules slot (#13102)",
          "timestamp": "2025-03-28T21:52:11+01:00",
          "tree_id": "e4320018b0e38da00626f31fcf620952227e8e48",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/6307ba073e362a63dc50b7dbbeb9db2556aee6ed"
        },
        "date": 1743196704228,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 34111,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 22208,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 10840,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 13189,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 13528,
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
          "id": "98402412f0d47a00263d9db7f15b4f40baf420de",
          "message": "feat: making SyncDataProvider throw before sync (#13151)",
          "timestamp": "2025-03-28T22:23:10Z",
          "tree_id": "9151f30af41a35b25787e08d7f99874b794f1346",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/98402412f0d47a00263d9db7f15b4f40baf420de"
        },
        "date": 1743201042436,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 38420,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 25602,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 11822,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 14294,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 15292,
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
          "id": "88c0e046ccb8381910a4615ac6218dcdbf04d898",
          "message": "feat!: processing events in Aztec.nr (#12957)",
          "timestamp": "2025-03-28T23:20:13Z",
          "tree_id": "8d81b7869abbf53ec4c481839c66366a90dfc9ef",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/88c0e046ccb8381910a4615ac6218dcdbf04d898"
        },
        "date": 1743204863887,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 38973,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 26021,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 12046,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 14745,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 15675,
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
          "id": "0d6ec6353dd6bcc38250a4dca95ee293104e64bf",
          "message": "fix: separator in pending partial notes capsule array slot (#13153)",
          "timestamp": "2025-03-28T22:36:29-03:00",
          "tree_id": "81f7174f353be76e8097cc8a4ddd8f10e2b1461f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0d6ec6353dd6bcc38250a4dca95ee293104e64bf"
        },
        "date": 1743213910264,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 39183,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 26461,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 11721,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 14847,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 15624,
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
          "id": "921e347e39065f36b53e43a2d991a430e652269c",
          "message": "fix: eq instead of !== (#13161)\n\nFixes #13160 \n\nFixes issue in the `slasher_client` where it was using `!==` instead of\n`!a.equals(b)` for an `EthAddress`.\n\nWhen `!==` are used between two `EthAddress.ZERO` the result is as\nexpected, but for\n\n```typescript\n  const a = EthAddress.ZERO;\n  const b = EthAddress.fromString('0x0000000000000000000000000000000000000000');\n\n  console.log(`a ${a}`); // 0x0000000000000000000000000000000000000000\n  console.log(`b ${b}`); // 0x0000000000000000000000000000000000000000\n  console.log(`a === b ${a === b}`); // false\n  console.log(`a !== b ${a !== b}`); // true\n  console.log(`a.equals(b) ${a.equals(b)}`); // true\n  console.log(`!a.equals(b) ${!a.equals(b)}`); // false\n```",
          "timestamp": "2025-03-29T10:19:04Z",
          "tree_id": "2df1191bf50541f5adf6b60fe25ed49bc7825cd0",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/921e347e39065f36b53e43a2d991a430e652269c"
        },
        "date": 1743245263978,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 39990,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 26840,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 11840,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 14693,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 15260,
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
          "id": "4643a312d752567691703591bb610a4bd2fd1cb3",
          "message": "chore: log out the slash factory when a new rollup is deployed (#13131)\n\nUnfortunately we don't have the ability to grep logs in the TS wrapping\ntests of the CLI to ensure this \"actually worked\".",
          "timestamp": "2025-03-29T13:44:22Z",
          "tree_id": "c8e2319b0784f98fb4d9cb1589cad334430f1fdc",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/4643a312d752567691703591bb610a4bd2fd1cb3"
        },
        "date": 1743257502874,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 38979,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 26089,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 12125,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 14512,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 14963,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "saleel@aztecprotocol.com",
            "name": "saleel",
            "username": "saleel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "71b67197bcf179a992ea1567e4ac175d0e9606e0",
          "message": "fix: fetch the correct vk in getSolidityVerifier (#13157)",
          "timestamp": "2025-03-31T00:11:43+04:00",
          "tree_id": "37648841e50636d15d3df2cba089953ad91527a4",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/71b67197bcf179a992ea1567e4ac175d0e9606e0"
        },
        "date": 1743367204233,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17986.46703999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15707.434257 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 118129260378.7,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 1627049325,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 217456719,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18997.92120400002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16380.711336 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 51117.522207,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 51117521000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3983.1350470001325,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3151.594523 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10938.072233,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10938074000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2209.31",
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