window.BENCHMARK_DATA = {
  "lastUpdate": 1742901484144,
  "repoUrl": "https://github.com/AztecProtocol/aztec-packages",
  "entries": {
    "C++ Benchmark": [
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
          "id": "096f7394297e1b0fb01237423589ef4b814b7e06",
          "message": "feat(sol): setup epoch - sampling without replacement (#12753)\n\n## Overview\n\nSimple Sample without replacement with transient storage. Updates how\ncertain functions on the rollup is consumed to work around viem.\n\nCore update:\nsetupEpoch -  3,476,415  -> 1,372,704\n\n---------\n\nCo-authored-by: LHerskind <16536249+LHerskind@users.noreply.github.com>",
          "timestamp": "2025-03-20T15:58:27Z",
          "tree_id": "981188f3d8608f730e90ef82a86374bcb9f34dce",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/096f7394297e1b0fb01237423589ef4b814b7e06"
        },
        "date": 1742488132907,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 42310,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 25058,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 11722,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 14548,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 17710,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "13aa4f5fabadcd18daae30bac3955145eb44837e",
          "message": "chore: Cleanup and re-specify sequencer config in RC1 (#12898)\n\nThis PR just re-specifies sequencer config in RC-1 to ensure it doesn't\ninadvertently get overwritten. Also some cleanup of old env vars.",
          "timestamp": "2025-03-20T16:33:38Z",
          "tree_id": "b1c544f4493e8ac3bd80aa0f96d39e507b57d4b9",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/13aa4f5fabadcd18daae30bac3955145eb44837e"
        },
        "date": 1742490024601,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 42617,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 25109,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 11866,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 14654,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 17767,
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
          "id": "a96a908faa8122d026372a66423c94c256aa2dba",
          "message": "chore(p2p): add tx queue to prevent ddos attacks (#12603)\n\ncloses https://github.com/AztecProtocol/aztec-packages/issues/12416\n\nAdds a `SerialQueue` for sending one tx at a time and adds a timeout of\n1s for invalid tx proofs to be invalidated.\n\nAdditionally, adds a new e2e test to ensure that large influxes of\ninvalid txs are filtered out and do not cause the node to crash or\nprevent valid txs from persisting through the p2p network.\n\n---------\n\nCo-authored-by: PhilWindle <60546371+PhilWindle@users.noreply.github.com>",
          "timestamp": "2025-03-20T16:49:19Z",
          "tree_id": "2f64d2d9b3078e294b92768b416f901e10d5b3d5",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a96a908faa8122d026372a66423c94c256aa2dba"
        },
        "date": 1742491164907,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 44858,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 26030,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 11602,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 14465,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 18889,
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
          "id": "fa2bf95359545956c6dd9f394026b138fd93e600",
          "message": "feat: generate subrelation-label comment in generated relation hpp (#12914)",
          "timestamp": "2025-03-20T18:23:52Z",
          "tree_id": "0bdd046350c1d1dc63bdcd33b7dca150e45497ca",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/fa2bf95359545956c6dd9f394026b138fd93e600"
        },
        "date": 1742496794044,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 16872.67831300005,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15133.441566999998 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 117827914727.09999,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 1435964139,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 205421551,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 17754.209930000114,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15340.662517 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 50551.960607,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 50551960000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3113.115606000065,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 2946.4745170000006 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 8957.69604,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 8957697000 ms\nthreads: 1"
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
          "id": "fa2bf95359545956c6dd9f394026b138fd93e600",
          "message": "feat: generate subrelation-label comment in generated relation hpp (#12914)",
          "timestamp": "2025-03-20T18:23:52Z",
          "tree_id": "0bdd046350c1d1dc63bdcd33b7dca150e45497ca",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/fa2bf95359545956c6dd9f394026b138fd93e600"
        },
        "date": 1742496803619,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 33562,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 21848,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 10704,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 13106,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12893,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "5d871f8f662f5fa2dc3b278cd35e5f54f58ef220",
          "message": "fix: Removed logged config object in L1 Tx Utils (#12901)",
          "timestamp": "2025-03-20T18:35:17Z",
          "tree_id": "72ffa6fb15d7737636aacda48581e16f8f1c9826",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5d871f8f662f5fa2dc3b278cd35e5f54f58ef220"
        },
        "date": 1742497517129,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 42372,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 25160,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 11795,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 14629,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 17704,
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
          "id": "5b064bcc6eb347dd53ad3870fe0486792d2f79bb",
          "message": "fix(bb.js): remove size metadata from UH proof (#12775)\n\nFixes #11829 \n\n- Remove first 4 bytes from proof (metadata - length of \"proof + PI\" in\nfields) returned from `UltraHonkBackend.generateProof()`\n- `proof` returned is now 14080 bytes (440 fields) and can be directly\nverified in solidity\n\n\nNote: `proof` output from bb CLI also includes the size metadata in the\nfirst 4 bytes. This should go away with #11024\n\n---------\n\nCo-authored-by: Tom French <15848336+TomAFrench@users.noreply.github.com>",
          "timestamp": "2025-03-20T22:26:33+04:00",
          "tree_id": "1575143bb9da65fe27f3bf7c4f6f57b753f29724",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5b064bcc6eb347dd53ad3870fe0486792d2f79bb"
        },
        "date": 1742499853080,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17136.728666999945,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15095.333082 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 117861884358.40001,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 1447838822,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 198878852,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 17691.06459999989,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15445.619601 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 49903.880012,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 49903881000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3128.0394809998597,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 2993.0078000000003 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 8646.025262000003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 8646026000 ms\nthreads: 1"
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
          "id": "5b064bcc6eb347dd53ad3870fe0486792d2f79bb",
          "message": "fix(bb.js): remove size metadata from UH proof (#12775)\n\nFixes #11829 \n\n- Remove first 4 bytes from proof (metadata - length of \"proof + PI\" in\nfields) returned from `UltraHonkBackend.generateProof()`\n- `proof` returned is now 14080 bytes (440 fields) and can be directly\nverified in solidity\n\n\nNote: `proof` output from bb CLI also includes the size metadata in the\nfirst 4 bytes. This should go away with #11024\n\n---------\n\nCo-authored-by: Tom French <15848336+TomAFrench@users.noreply.github.com>",
          "timestamp": "2025-03-20T22:26:33+04:00",
          "tree_id": "1575143bb9da65fe27f3bf7c4f6f57b753f29724",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5b064bcc6eb347dd53ad3870fe0486792d2f79bb"
        },
        "date": 1742499862700,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 34146,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 21979,
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
            "value": 12885,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 13365,
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
          "id": "61068dae2f702ce5dba74b36a50b68112ae05d38",
          "message": "Revert \"feat: recording circuit inputs + oracles (#12148)\"\n\nThis reverts commit 5436627816d1b675f7bf68ec43fbd4807bd0d142.",
          "timestamp": "2025-03-20T23:00:01Z",
          "tree_id": "6d09443715c094fdad5e0bc916c5f3e2159b9d3b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/61068dae2f702ce5dba74b36a50b68112ae05d38"
        },
        "date": 1742513640600,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 33818,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 21807,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 10670,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 13026,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 13247,
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
          "id": "41bf13e9bfc87167fae10af7e5c84d05ae7d7193",
          "message": "fix: Disallow registration of contract classes with no public bytecode (#12910)\n\nThe transpiler also injects now a revert public_dispatch function of 22\nbytes (1 field) in contracts without public functions.",
          "timestamp": "2025-03-21T09:53:14+01:00",
          "tree_id": "e3d6dad24c65711a9f33bdc1093411e55818d6d6",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/41bf13e9bfc87167fae10af7e5c84d05ae7d7193"
        },
        "date": 1742549493177,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 39631,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 26659,
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
            "value": 14411,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 14903,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "ce84b2ddf99374bb0748d7b020025d087e531c63",
          "message": "chore: Bump Noir reference (#12894)\n\nAutomated pull of nightly from the\n[noir](https://github.com/noir-lang/noir) programming language, a\ndependency of Aztec.\nBEGIN_COMMIT_OVERRIDE\nchore: add more test suites to CI\n(https://github.com/noir-lang/noir/pull/7757)\nchore(docs): Avoid colliding filenames\n(https://github.com/noir-lang/noir/pull/7771)\nfeat(ssa): Basic control dependent LICM\n(https://github.com/noir-lang/noir/pull/7660)\nchore: run `noir_wasm` over `test_programs`\n(https://github.com/noir-lang/noir/pull/7765)\nfix(ci): Fail the CI job on a Brillig report failure\n(https://github.com/noir-lang/noir/pull/7762)\nfix(ci): Exclude inliner specific reference count tests from Brillig\ntrace report (https://github.com/noir-lang/noir/pull/7761)\nchore: pull out pure functions from interpreter\n(https://github.com/noir-lang/noir/pull/7755)\nfix: add missing inputs to `BlackBoxFuncCall::get_inputs_vec` for EcAdd\n(https://github.com/noir-lang/noir/pull/7752)\nfeat: add `EmbeddedCurvePoint::generator()` to return generator point\n(https://github.com/noir-lang/noir/pull/7754)\nchore: remove bun from docs in favour of yarn\n(https://github.com/noir-lang/noir/pull/7756)\nchore: Fix rustdocs error (https://github.com/noir-lang/noir/pull/7750)\nchore: add `shared` module within `noirc_frontend`\n(https://github.com/noir-lang/noir/pull/7746)\nchore: push users towards nargo in tutorial\n(https://github.com/noir-lang/noir/pull/7736)\nchore: Add GITHUB_TOKEN for downloading prost_prebuilt to acvm.js build\n(https://github.com/noir-lang/noir/pull/7745)\nEND_COMMIT_OVERRIDE\n\n---------\n\nCo-authored-by: AztecBot <tech@aztecprotocol.com>",
          "timestamp": "2025-03-21T10:56:43Z",
          "tree_id": "e86921fc239d6fecfe6968486da5bde3fb537bc9",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ce84b2ddf99374bb0748d7b020025d087e531c63"
        },
        "date": 1742557021044,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 39484,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 26984,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 11806,
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
            "value": 15013,
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
          "id": "7aa0b871bb154ad50cb4643bae0879d89244f784",
          "message": "fix: pass bot salt (#12923)\n\nPass deployment salt for the bot's account contract based on the its pod\nname. (This way we can have multiple bots all producing private txs)",
          "timestamp": "2025-03-21T11:56:10Z",
          "tree_id": "8eb2656a7b0c3e8945c741f701f5852dc442b313",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7aa0b871bb154ad50cb4643bae0879d89244f784"
        },
        "date": 1742560102273,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 39320,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 26069,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 12123,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 14626,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 14994,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "isennovskiy@gmail.com",
            "name": "Innokentii Sennovskii",
            "username": "Rumata888"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "c524339c1fcc5202a634fe2edeff4c4606a31d87",
          "message": "feat: Montgomery optimisation (partial) (#12822)\n\nChanges Montgomery reduction in wasm for 254-bit fields to include\nYuval's trick and prepares constants for similar changes in x86_64.\nBefore:\n\n![image](https://github.com/user-attachments/assets/0fb0f037-b24f-43d2-b12e-ae6c9675abe8)\nAfter:\n\n![image](https://github.com/user-attachments/assets/52914d78-5d8a-4735-be9e-d58bb1822cab)",
          "timestamp": "2025-03-21T12:42:42Z",
          "tree_id": "c3703c4d20381bcfcb427902832d6275209ab565",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c524339c1fcc5202a634fe2edeff4c4606a31d87"
        },
        "date": 1742563256556,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18465.73607099981,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16176.484716 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 117840275535.90001,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 1608833256,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 215615375,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18693.86850700016,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16340.628059 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 50449.320998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 50449319000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3918.34969200022,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3109.6519559999997 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9570.909935,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9570914000 ms\nthreads: 1"
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
            "email": "isennovskiy@gmail.com",
            "name": "Innokentii Sennovskii",
            "username": "Rumata888"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "c524339c1fcc5202a634fe2edeff4c4606a31d87",
          "message": "feat: Montgomery optimisation (partial) (#12822)\n\nChanges Montgomery reduction in wasm for 254-bit fields to include\nYuval's trick and prepares constants for similar changes in x86_64.\nBefore:\n\n![image](https://github.com/user-attachments/assets/0fb0f037-b24f-43d2-b12e-ae6c9675abe8)\nAfter:\n\n![image](https://github.com/user-attachments/assets/52914d78-5d8a-4735-be9e-d58bb1822cab)",
          "timestamp": "2025-03-21T12:42:42Z",
          "tree_id": "c3703c4d20381bcfcb427902832d6275209ab565",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c524339c1fcc5202a634fe2edeff4c4606a31d87"
        },
        "date": 1742563265508,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 39536,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 26708,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 11913,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 14891,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 15372,
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
          "id": "716ab4f58b72225c3a9fd96762d549b29290bc61",
          "message": "feat: add minter role to TestERC20 (#12889)\n\nAllows multiple accounts to be minters of the staking and fee assets.\n\nCreates a FeeAssetHandler in the periphery to allow mints of a fixed\nsize.\n\nAlso allows rollup owner to update the mana target (and thus, the mana\nlimit which is twice the target).\n\nSee\n[design](https://github.com/AztecProtocol/engineering-designs/blob/42455c99b867cde4d67700bc97ac12309c2332ea/docs/faucets/dd.md#testerc20)\n\nFix #12887\nFix #12882",
          "timestamp": "2025-03-21T10:11:56-04:00",
          "tree_id": "9935c202bf8e512b93fb44eb02f255383fcacb23",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/716ab4f58b72225c3a9fd96762d549b29290bc61"
        },
        "date": 1742567970344,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 39366,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 26038,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 11690,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 14795,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 15280,
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
          "id": "9770e1513e46566147f471f287f4202c27dfd604",
          "message": "feat!: `AztecNode.findLeavesIndexes` returning block info (#12890)",
          "timestamp": "2025-03-21T08:26:50-06:00",
          "tree_id": "b5a2ec16b2d2e9850232410212fff88e9465e365",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9770e1513e46566147f471f287f4202c27dfd604"
        },
        "date": 1742568709940,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 39349,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 26150,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 11829,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 14956,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 15224,
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
          "id": "cb978b5a848214803d81dc791800c0976835e4ad",
          "message": "chore: Add comment on verifyHistoricBlock (#12933)\n\nAdds comment on `verifyHistoricBlock` for clarity.",
          "timestamp": "2025-03-21T15:17:48Z",
          "tree_id": "9a98b7a24f0f7eae4d0b3aeb28f4f207cf02536c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/cb978b5a848214803d81dc791800c0976835e4ad"
        },
        "date": 1742570907979,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 39411,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 25798,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 11813,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 14379,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 15240,
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
          "id": "bf9a034fe72efdc1a8dc8820983ec091d0efb995",
          "message": "feat: reapplying reverted circuits recorder with a fix (#12919)",
          "timestamp": "2025-03-21T15:54:51Z",
          "tree_id": "80110738438c13dc1f7cfd786f4198e108458d79",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/bf9a034fe72efdc1a8dc8820983ec091d0efb995"
        },
        "date": 1742573125201,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 39594,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 26202,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 11580,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 14558,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 15213,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "42733a693956e67a38a094688df119a7a87593f8",
          "message": "fix: Fix prover node publisher for multi-proofs (#12924)\n\nThe prover node publisher did not correctly support multi-proofs. This\nshould fix it.",
          "timestamp": "2025-03-21T16:09:06Z",
          "tree_id": "9dce50895632c159921223e7600a6e5f59794ebe",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/42733a693956e67a38a094688df119a7a87593f8"
        },
        "date": 1742574887098,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 39523,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 26446,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 11847,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 14448,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 15165,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "05af647330aa6ec5dfebbc3f66ab36531ca29ae1",
          "message": "chore: separated multi map and fixed indexeddb map (#12896)\n\nThis PR cleans up `kv-store` a bit, attempting to separate maps and\nmultimaps a little bit better. The old approach caused a very stupid but\ndifficult to track bug in the `IndexedDB` implementation that would\ncause partial notes to never be discovered and simulations to crash.\n\nAlso removed the `WithSize` variants of maps that were not implemented\nin most store types and had a different testing flow, since they appear\nto be completely unused @Maddiaa0\n\n@alexghr do you think we can get rid of the old lmdb implementations\nsoon?",
          "timestamp": "2025-03-21T17:47:05+01:00",
          "tree_id": "b0a8bd96f469c8fee9cde2a6ec88f8fd6f149ac8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/05af647330aa6ec5dfebbc3f66ab36531ca29ae1"
        },
        "date": 1742576987806,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 39355,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 26084,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 11608,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 14479,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 15191,
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
          "id": "0ae68919479ba44188ad3797ef7832c987870a18",
          "message": "feat(avm): Port field gt to vm2 (#12883)\n\nPorts field greater than to vm2, removing non-ff and eq functionality,\nwhich could be trivally inlined in other gadgets.",
          "timestamp": "2025-03-21T18:36:23+01:00",
          "tree_id": "24dc2925ae93c0ccda3b9cf0d73e24ddb80fa6c0",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0ae68919479ba44188ad3797ef7832c987870a18"
        },
        "date": 1742580512175,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 16784.564521999982,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14805.066171 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 117850055055.7,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 1441079664,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 199128986,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 17561.83371899999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15189.908022000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 45958.22453199999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 45958226000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3045.0406009999824,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 2875.8087669999995 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 7868.143594,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 7868145000 ms\nthreads: 1"
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
          "id": "0ae68919479ba44188ad3797ef7832c987870a18",
          "message": "feat(avm): Port field gt to vm2 (#12883)\n\nPorts field greater than to vm2, removing non-ff and eq functionality,\nwhich could be trivally inlined in other gadgets.",
          "timestamp": "2025-03-21T18:36:23+01:00",
          "tree_id": "24dc2925ae93c0ccda3b9cf0d73e24ddb80fa6c0",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0ae68919479ba44188ad3797ef7832c987870a18"
        },
        "date": 1742580525062,
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
            "value": 22126,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 10770,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 12974,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 13356,
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
          "id": "43155d693ef1e957a44cad0d8375a7d771ad857a",
          "message": "fix: pull CRS data ahead of time (#12945)\n\nDownload a bunch of points needed for proof generation/verification.\nNOTE: the point files are cached so if the files that exist in the\ndefault location already contain enough points this is a noop (a good\nidea to use docker volumes)",
          "timestamp": "2025-03-21T18:50:44Z",
          "tree_id": "cb540182784315d15fd870f0df8e3dff0750f182",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/43155d693ef1e957a44cad0d8375a7d771ad857a"
        },
        "date": 1742584221909,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17971.27533799994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15753.714780999999 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 117837653661.7,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 1620540942,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 213712508,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18592.54971799987,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16080.635525000002 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 50253.806311,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 50253805000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3867.336239999986,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3096.5461199999995 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9995.916971,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9995923000 ms\nthreads: 1"
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
          "id": "43155d693ef1e957a44cad0d8375a7d771ad857a",
          "message": "fix: pull CRS data ahead of time (#12945)\n\nDownload a bunch of points needed for proof generation/verification.\nNOTE: the point files are cached so if the files that exist in the\ndefault location already contain enough points this is a noop (a good\nidea to use docker volumes)",
          "timestamp": "2025-03-21T18:50:44Z",
          "tree_id": "cb540182784315d15fd870f0df8e3dff0750f182",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/43155d693ef1e957a44cad0d8375a7d771ad857a"
        },
        "date": 1742584230442,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 33961,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 21993,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 10709,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 13030,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 13321,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "1a016024b60b6b35946d899b3943a420b010b768",
          "message": "feat: use msgpack for ClientIvc::Proof in API (#12911)\n\nSwitches to using msgpack for serialization/deserialization of a\nClientIVC::Proof, instead of our custom serialization lib.\n\nThis was motivated by the desire to gracefully handle (reject) invalid\nproof buffers (in the form of fully random bytes) in native\nverification. Our custom serialization library is not meant to handle a\nfully random buffer because it relies on 4-byte chunks containing size\ndata that indicate how much to read from an address. When the size bytes\nare corrupted, the code may attempt to read into uninitialized memory.\nMsgpack on the other hand will throw a meaningful and consistent error\nwhen the proof structure is not as expected. This results in\nverification failure by default.\n\nNote: if the proof has valid structure but is not itself valid,\nverification will proceed as normal and return failure in a time less\nthan or equal to that required for successful verification.\n\n---------\n\nCo-authored-by: PhilWindle <philip.windle@gmail.com>\nCo-authored-by: cody <codygunton@gmail.com>",
          "timestamp": "2025-03-21T20:02:31Z",
          "tree_id": "25c0caa77aef167d7c1fa6c708028ff6457b93ae",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1a016024b60b6b35946d899b3943a420b010b768"
        },
        "date": 1742589283727,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18377.42336300016,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16250.040685000002 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 117857147905.69998,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 1585997818,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 212462355,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18889.139067000087,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16266.897395 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 50261.068602,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 50261067000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3991.220455000075,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3101.4006249999998 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9683.995098000003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9683997000 ms\nthreads: 1"
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
          "id": "1a016024b60b6b35946d899b3943a420b010b768",
          "message": "feat: use msgpack for ClientIvc::Proof in API (#12911)\n\nSwitches to using msgpack for serialization/deserialization of a\nClientIVC::Proof, instead of our custom serialization lib.\n\nThis was motivated by the desire to gracefully handle (reject) invalid\nproof buffers (in the form of fully random bytes) in native\nverification. Our custom serialization library is not meant to handle a\nfully random buffer because it relies on 4-byte chunks containing size\ndata that indicate how much to read from an address. When the size bytes\nare corrupted, the code may attempt to read into uninitialized memory.\nMsgpack on the other hand will throw a meaningful and consistent error\nwhen the proof structure is not as expected. This results in\nverification failure by default.\n\nNote: if the proof has valid structure but is not itself valid,\nverification will proceed as normal and return failure in a time less\nthan or equal to that required for successful verification.\n\n---------\n\nCo-authored-by: PhilWindle <philip.windle@gmail.com>\nCo-authored-by: cody <codygunton@gmail.com>",
          "timestamp": "2025-03-21T20:02:31Z",
          "tree_id": "25c0caa77aef167d7c1fa6c708028ff6457b93ae",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1a016024b60b6b35946d899b3943a420b010b768"
        },
        "date": 1742589292386,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 34072,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 22055,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 10802,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 12954,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 13293,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "15848336+TomAFrench@users.noreply.github.com",
            "name": "Tom French",
            "username": "TomAFrench"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "397144f93b72ea7fdbddc7251e3fd3cef8672652",
          "message": "fix: no hardcoded versions in bbup (#12944)\n\nI've updated bbup to pull the version of bb to install for a given noir\nversion from a json file in aztec-packages (previously it would read\nsome file inside of the noir repo at the given release tag of noir that\nthey have installed.\n\nWe can then update this in future without needing to migrate people onto\nnew versions of bbup.",
          "timestamp": "2025-03-21T20:35:32Z",
          "tree_id": "076d83003542592699f9b338ba04ba2d6b26fbe6",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/397144f93b72ea7fdbddc7251e3fd3cef8672652"
        },
        "date": 1742589977406,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17027.95696699991,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15221.162809000001 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 117850042675.9,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 1441807793,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 201721424,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 17622.93710500012,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15291.272468000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 46003.901425,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 46003901000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3067.263771000171,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 2906.68655 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 8149.405669999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 8149406000 ms\nthreads: 1"
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
            "email": "15848336+TomAFrench@users.noreply.github.com",
            "name": "Tom French",
            "username": "TomAFrench"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "397144f93b72ea7fdbddc7251e3fd3cef8672652",
          "message": "fix: no hardcoded versions in bbup (#12944)\n\nI've updated bbup to pull the version of bb to install for a given noir\nversion from a json file in aztec-packages (previously it would read\nsome file inside of the noir repo at the given release tag of noir that\nthey have installed.\n\nWe can then update this in future without needing to migrate people onto\nnew versions of bbup.",
          "timestamp": "2025-03-21T20:35:32Z",
          "tree_id": "076d83003542592699f9b338ba04ba2d6b26fbe6",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/397144f93b72ea7fdbddc7251e3fd3cef8672652"
        },
        "date": 1742589986480,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 34039,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 21846,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 10649,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 12963,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 13217,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "fdf1da45cb25b756eaa6af15e5dc7761d15cbcc3",
          "message": "chore: fee cleanup (#12941)\n\n- `SponsoredFeePaymentMethod` gets into `aztec.js` , but that's it\n(meaning the method can be used from aztec.js, but there's no concept of\nwhere's deployed/how to get the address/bytecode, etc). It's under\n`@aztec/aztec.js/fee/testing` to make abundantly clear that this is not\na \"production acceptable\" approach.\n- Similarly to `setupCanonicalL2FeeJuice` there's a utility method that\ncan be used from the CLI/during sandbox setup to deploy a\n`SponsoredFeePaymentContract`. It spits out the address where the\ncontract is located, just like the test accounts.\n- You CAN programatically obtain the address of the \"canonical\"\n`SponsoredFeePaymentContract` via `@aztec/sandbox`, but you CANNOT via\n`@aztec/aztec.js`. This is because getting the address implies loading\nthe contract bytecode and it's not a protocol contract, making imports\nmessy and tripping the user into making poor decisions in their app\ndesign. If you want to use it in your app, obtain it from the sandbox\noutput or from an announcement (just like a faucet address, for example)\n- This address is only canonical in the sense it's salt is hardcoded to\n0 (this lives in `@aztec/constants` under `SPONSORED_FPC_SALT`. For\ntestnet it should be prefunded! @PhilWindle @alexghr\n\nThis PR also builds upon the work done in `aztec.js`, allowing us to\nfinally get rid of the special handling of account contract deployments\n`deploy_account_method.ts` by creating a new `FeePaymentMethod` (that's\nnot exposed externally!) that allows an account to pay for its own\ndeployment 😁\n\n---------\n\nCo-authored-by: Jan Beneš <janbenes1234@gmail.com>",
          "timestamp": "2025-03-21T21:37:07+01:00",
          "tree_id": "eaa4338861daa992bb53836b61dd28190a07ca6e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/fdf1da45cb25b756eaa6af15e5dc7761d15cbcc3"
        },
        "date": 1742590942374,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 33837,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 21846,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 10773,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 12861,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 13268,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "c3337af484a752294b2a817649ac69de5cadae11",
          "message": "fix: Remove workaround (#12952)",
          "timestamp": "2025-03-21T21:41:13Z",
          "tree_id": "78a72acf3442cb57d2283519eb68e18e97c55857",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c3337af484a752294b2a817649ac69de5cadae11"
        },
        "date": 1742594747050,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 39118,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 26219,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 11569,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 14621,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 15473,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "e13edb83b72a593ba3a5106d411d2537016d036e",
          "message": "chore: L2 chain config for alpha testnet (#12962)\n\nThis PR adds a chain config block for alpha testnet",
          "timestamp": "2025-03-22T14:36:35Z",
          "tree_id": "3dc7765831ac6268495d5133ff4e24d15d2adc41",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e13edb83b72a593ba3a5106d411d2537016d036e"
        },
        "date": 1742655105058,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 38879,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 26399,
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
            "value": 14681,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 15121,
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
          "id": "3933b35bcf92f20c32dfd742d01c3caaf7ad977f",
          "message": "fix: yolo txe binds just to localhost by default.",
          "timestamp": "2025-03-22T19:11:58Z",
          "tree_id": "c917dc69dc265ae758cde5692d8f0692512851f9",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/3933b35bcf92f20c32dfd742d01c3caaf7ad977f"
        },
        "date": 1742672120836,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 39589,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 27642,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 11774,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 14857,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 15372,
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
          "id": "7843a6714547a71c64274830ebb6176d78dbb890",
          "message": "chore: Change `/bin/bash` shebang to be env based (#12834)\n\nChanges `#!/bin/bash` in scripts into `#!/usr/bin/env bash`, to be more\ncross platform.\n\n### Why?\n\nI was just trying to test initialising `noir-repo` on my Mac, because I\nwanted to avoid having to delete it on the mainframe, however the\nversion of `bash` shipped with MacOS is 3.2, and it doesn't have all the\noptions that the `ci3` scripts assume, which caused failures. I have the\nlatest `bash` installed via Homebrew, but the scripts are coded to use\nthe one in `/bin`, which is the old version and cannot be updated.\n\n```console\n$ hash=$(./noir/bootstrap.sh hash)\n/Users/aakoshh/Work/aztec/aztec-packages/ci3/source_options: line 9: shopt: globstar: invalid shell option name\n$ shopt\n...\nglobskipdots   \ton\nglobstar       \toff\ngnu_errfmt     \toff\n...\n$ echo $SHELL\n/opt/homebrew/bin/bash\n$ /bin/bash --version\nGNU bash, version 3.2.57(1)-release (arm64-apple-darwin24)\nCopyright (C) 2007 Free Software Foundation, Inc.\n$ /opt/homebrew/bin/bash --version\nGNU bash, version 5.2.37(1)-release (aarch64-apple-darwin24.0.0)\n$ /bin/bash\n$ shopt\n...\nforce_fignore  \ton\ngnu_errfmt     \toff\nhistappend     \toff\n...\n```",
          "timestamp": "2025-03-22T22:36:09Z",
          "tree_id": "cdd738af86bfece376a20ac399eedd13061319f1",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7843a6714547a71c64274830ebb6176d78dbb890"
        },
        "date": 1742685224433,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18292.73986399994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16015.570333 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 117871055915,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 1602432119,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 215761735,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18697.826976999975,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16113.96241 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 50587.317206,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 50587316000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3904.717247999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3147.889574 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10807.665549000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10807668000 ms\nthreads: 1"
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
          "id": "7843a6714547a71c64274830ebb6176d78dbb890",
          "message": "chore: Change `/bin/bash` shebang to be env based (#12834)\n\nChanges `#!/bin/bash` in scripts into `#!/usr/bin/env bash`, to be more\ncross platform.\n\n### Why?\n\nI was just trying to test initialising `noir-repo` on my Mac, because I\nwanted to avoid having to delete it on the mainframe, however the\nversion of `bash` shipped with MacOS is 3.2, and it doesn't have all the\noptions that the `ci3` scripts assume, which caused failures. I have the\nlatest `bash` installed via Homebrew, but the scripts are coded to use\nthe one in `/bin`, which is the old version and cannot be updated.\n\n```console\n$ hash=$(./noir/bootstrap.sh hash)\n/Users/aakoshh/Work/aztec/aztec-packages/ci3/source_options: line 9: shopt: globstar: invalid shell option name\n$ shopt\n...\nglobskipdots   \ton\nglobstar       \toff\ngnu_errfmt     \toff\n...\n$ echo $SHELL\n/opt/homebrew/bin/bash\n$ /bin/bash --version\nGNU bash, version 3.2.57(1)-release (arm64-apple-darwin24)\nCopyright (C) 2007 Free Software Foundation, Inc.\n$ /opt/homebrew/bin/bash --version\nGNU bash, version 5.2.37(1)-release (aarch64-apple-darwin24.0.0)\n$ /bin/bash\n$ shopt\n...\nforce_fignore  \ton\ngnu_errfmt     \toff\nhistappend     \toff\n...\n```",
          "timestamp": "2025-03-22T22:36:09Z",
          "tree_id": "cdd738af86bfece376a20ac399eedd13061319f1",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7843a6714547a71c64274830ebb6176d78dbb890"
        },
        "date": 1742685234262,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 39197,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 26551,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 11897,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 14820,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 15501,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "leizciw@gmail.com",
            "name": "Leila Wang",
            "username": "LeilaWang"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "18bcc1b1777650d6249e2cdc824ed8acbe39c506",
          "message": "refactor: remove selector from public call request (#12828)\n\n- Remove `function_selector` from `PublicCallRequest` as it is no longer\nused.\n- Remove `public_functions` from `ContractClass`.\n- `ContractClass` checks that there's at most 1 public function in the\nartifact.\n- Rename `args` to `calldata` when it's public calldata that includes\nthe function selector.\n- Use different generator indexes for calldata and regular args.\n\n### aztec-nr\n- Rename oracle calls `enqueue_public_function_call_internal ` to\n`notify_enqueued_public_function_call `, and\n`set_public_teardown_function_call_internal` to\n`notify_set_public_teardown_function_call `, to be consistent with other\noracle calls.\n- Storing data to execution cache will need to provide the hash in\naddition to the preimage, making it possible to use it for different\ntypes of data. Currently it's used for calldata and args.\n\n### node\n- Rename `getContractFunctionName` to `getDebugFunctionName`, as the\nfunction name won't always be available. It's set by explicitly calling\n`registerContractFunctionSignatures` for debugging purpose.\n- Remove `ExecutionRequest[]` in `Tx` and replace it with `calldata[]`.\nWe now loop through the `publicCallRequests` in the public inputs and\npair each with an entry in `calldata[]`.\n- `DataValidator` checks that calldata are provided for all the\nnon-empty public call requests, and the hash is correct.",
          "timestamp": "2025-03-23T13:50:19Z",
          "tree_id": "da67f601d8c18deba44229b7133b3a9d7a20a73f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/18bcc1b1777650d6249e2cdc824ed8acbe39c506"
        },
        "date": 1742740210366,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18322.372929000267,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16201.106228 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 117836966037,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 1606562884,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 215818685,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18831.64191900005,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16452.635690999996 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 51045.754291000005,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 51045754000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3913.129949999984,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3149.647342 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9501.005137,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9501010000 ms\nthreads: 1"
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
            "email": "leizciw@gmail.com",
            "name": "Leila Wang",
            "username": "LeilaWang"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "18bcc1b1777650d6249e2cdc824ed8acbe39c506",
          "message": "refactor: remove selector from public call request (#12828)\n\n- Remove `function_selector` from `PublicCallRequest` as it is no longer\nused.\n- Remove `public_functions` from `ContractClass`.\n- `ContractClass` checks that there's at most 1 public function in the\nartifact.\n- Rename `args` to `calldata` when it's public calldata that includes\nthe function selector.\n- Use different generator indexes for calldata and regular args.\n\n### aztec-nr\n- Rename oracle calls `enqueue_public_function_call_internal ` to\n`notify_enqueued_public_function_call `, and\n`set_public_teardown_function_call_internal` to\n`notify_set_public_teardown_function_call `, to be consistent with other\noracle calls.\n- Storing data to execution cache will need to provide the hash in\naddition to the preimage, making it possible to use it for different\ntypes of data. Currently it's used for calldata and args.\n\n### node\n- Rename `getContractFunctionName` to `getDebugFunctionName`, as the\nfunction name won't always be available. It's set by explicitly calling\n`registerContractFunctionSignatures` for debugging purpose.\n- Remove `ExecutionRequest[]` in `Tx` and replace it with `calldata[]`.\nWe now loop through the `publicCallRequests` in the public inputs and\npair each with an entry in `calldata[]`.\n- `DataValidator` checks that calldata are provided for all the\nnon-empty public call requests, and the hash is correct.",
          "timestamp": "2025-03-23T13:50:19Z",
          "tree_id": "da67f601d8c18deba44229b7133b3a9d7a20a73f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/18bcc1b1777650d6249e2cdc824ed8acbe39c506"
        },
        "date": 1742740219222,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 39783,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 26141,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 11615,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 14874,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 15159,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "75c1549dd325cd42da22e407de8971c909050561",
          "message": "chore: Set default proving config to true (#12964)\n\nUp until now our configurations have generally defaulted to swtiching\noff proving. This is desirable for e2e tests and the sandbox etc. I\nthink we are at the point where the default should be switched on and\nthe user has to make a decision to switch it off.",
          "timestamp": "2025-03-23T16:17:51Z",
          "tree_id": "34e5b52c6f1215c400e36bf32de7b35881c85b5f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/75c1549dd325cd42da22e407de8971c909050561"
        },
        "date": 1742748512267,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 39243,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 25927,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 11569,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 14331,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 15025,
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
          "id": "1a37d6d4c5f4470fa87bd5bd3934e23ce0a9fb10",
          "message": "chore: deflake the kind smoke test (#12955)\n\nSmoke test runs in just under 5 minutes in ci now (just under 3 minutes\nlocally).\nIt has ran through the deflaker (locally) 100 times with no error; i.e.\n\n```\n./yarn-project/end-to-end/scripts/deflaker.sh ./spartan/bootstrap.sh test-kind-smoke\n```\n\nHowever, it did flake when I was running it on mainframe, so updating\nmyself to receive slack notifications.\n\nSee [passing CI run](http://ci.aztec-labs.com/5ffc13f772a79c68)\n\nchanges:\n- have the pxe and bot just connect to the boot node\n- retain the setup l2 contracts job if it fails\n- make the 1-validators yaml lighter/faster\n- use 1-validators in the smoke test in CI\n- fix the kubectl await to only await the pxe\n- make the deflaker support bootstrap scripts\n\nFix #11177",
          "timestamp": "2025-03-23T14:40:39-04:00",
          "tree_id": "370aae2582cceb57e889c939284ddc574d7c6e4d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1a37d6d4c5f4470fa87bd5bd3934e23ce0a9fb10"
        },
        "date": 1742756808350,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 39638,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 25980,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 11538,
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
            "value": 15399,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "49d6bfadb0584e7d5238a319540e2b28255fb688",
          "message": "fix: increased poseidon gates (#12973)\n\nAfter this: https://github.com/AztecProtocol/aztec-packages/pull/12061\nwe were overflowing the trace on contract class registrations. This was\nnot caught by tests due to:\n\n- Insufficient tests with full proving (and the ones we have deploy\nwithout proving!)\n- Insufficient WASM testing: this overflow caused the overflowing trace\nto go over 4GB",
          "timestamp": "2025-03-24T12:11:33+01:00",
          "tree_id": "9cf42eebcbf4d5f2a92b189fd26776e6b180c534",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/49d6bfadb0584e7d5238a319540e2b28255fb688"
        },
        "date": 1742815235280,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17540.68579900013,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15493.358198999998 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 117852315551.70001,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 1648798055,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 214943633,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18739.322067000103,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16333.614012999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 50409.772733,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 50409774000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3886.441416999787,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3123.2665249999995 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10039.363405,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10039367000 ms\nthreads: 1"
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
          "id": "49d6bfadb0584e7d5238a319540e2b28255fb688",
          "message": "fix: increased poseidon gates (#12973)\n\nAfter this: https://github.com/AztecProtocol/aztec-packages/pull/12061\nwe were overflowing the trace on contract class registrations. This was\nnot caught by tests due to:\n\n- Insufficient tests with full proving (and the ones we have deploy\nwithout proving!)\n- Insufficient WASM testing: this overflow caused the overflowing trace\nto go over 4GB",
          "timestamp": "2025-03-24T12:11:33+01:00",
          "tree_id": "9cf42eebcbf4d5f2a92b189fd26776e6b180c534",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/49d6bfadb0584e7d5238a319540e2b28255fb688"
        },
        "date": 1742815246958,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 39511,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 27001,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 11660,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 14401,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 14930,
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
          "id": "5a256c8abaeb65a1fdc47eb674ae19819a795d48",
          "message": "chore: Fix for e2e gossip network test (#12954)",
          "timestamp": "2025-03-24T11:46:28Z",
          "tree_id": "7ec30bc2d4f67e00b8bc288c5f7d7a02ebef1e6d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5a256c8abaeb65a1fdc47eb674ae19819a795d48"
        },
        "date": 1742818701862,
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
            "value": 27334,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 11781,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 14886,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 15330,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "1e796e2d1cc293010942b85165aa04c8b3ab31b3",
          "message": "chore: Bump Noir reference (#12958)\n\nAutomated pull of nightly from the\n[noir](https://github.com/noir-lang/noir) programming language, a\ndependency of Aztec.\nBEGIN_COMMIT_OVERRIDE\nchore: remove duplication on library list files\n(https://github.com/noir-lang/noir/pull/7774)\nchore: bump bb to 0.82.0 (https://github.com/noir-lang/noir/pull/7777)\nfeat: optimize unconstrained `embedded_curve_add`\n(https://github.com/noir-lang/noir/pull/7751)\nEND_COMMIT_OVERRIDE\n\n---------\n\nCo-authored-by: AztecBot <tech@aztecprotocol.com>\nCo-authored-by: Tom French <15848336+TomAFrench@users.noreply.github.com>",
          "timestamp": "2025-03-24T12:11:32Z",
          "tree_id": "57061c001e9e1add1f3cc71c979ef2423b4e6a86",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1e796e2d1cc293010942b85165aa04c8b3ab31b3"
        },
        "date": 1742819926851,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 39381,
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
            "value": 11602,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 14553,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 14983,
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
          "id": "33e528f15947eef5697f2b70d7f510b5ba6b60fa",
          "message": "feat: translator zk relation adjustments testing (#12718)\n\nThis PR changes DeltaRangeConstraint and Permutation relation in\nTranslator to operate correctly in the presence of masking data at the\nend of the polynomials as well as unit tests to establish correctness of\nthe changes given masking is not yet full enabled in Translator.",
          "timestamp": "2025-03-24T12:35:09Z",
          "tree_id": "c26431db9a5376c3059f3c292645c306fe11be29",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/33e528f15947eef5697f2b70d7f510b5ba6b60fa"
        },
        "date": 1742821389343,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17370.29308700005,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15476.61839 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 118208111971.8,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 1586795398,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 217999356,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18610.694457999896,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16112.786123 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 50103.702647,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 50103704000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3801.6696539999657,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3046.648991 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 8831.084283999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 8831088000 ms\nthreads: 1"
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
          "id": "33e528f15947eef5697f2b70d7f510b5ba6b60fa",
          "message": "feat: translator zk relation adjustments testing (#12718)\n\nThis PR changes DeltaRangeConstraint and Permutation relation in\nTranslator to operate correctly in the presence of masking data at the\nend of the polynomials as well as unit tests to establish correctness of\nthe changes given masking is not yet full enabled in Translator.",
          "timestamp": "2025-03-24T12:35:09Z",
          "tree_id": "c26431db9a5376c3059f3c292645c306fe11be29",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/33e528f15947eef5697f2b70d7f510b5ba6b60fa"
        },
        "date": 1742821398609,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 39080,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 27020,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 11870,
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
            "value": 15475,
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
          "id": "a85f5305d491e61bb0df159c31a08bf52e2534dc",
          "message": "fix: sponsored fpc arg parsed correctly (#12976) (#12977)\n\nResyncing master after hotfix for alpha-testnet. Holding for release\n0.82.2 to go in !\n\nCo-authored-by: sklppy88 <esau@aztecprotocol.com>",
          "timestamp": "2025-03-24T14:22:44+01:00",
          "tree_id": "c89fe9c6a93cbbbbfb0f71c913853684e78bb142",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a85f5305d491e61bb0df159c31a08bf52e2534dc"
        },
        "date": 1742824265889,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 39518,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 26562,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 11754,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 14668,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 15380,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "james.zaki@proton.me",
            "name": "James Zaki",
            "username": "jzaki"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "4a0fd588d46617eec8ded7a1bccf746401d8c3a4",
          "message": "docs: Add fees to cli reference (#12884)\n\nCo-authored-by: josh crites <critesjosh@gmail.com>\nCo-authored-by: Josh Crites <jc@joshcrites.com>",
          "timestamp": "2025-03-24T21:32:10Z",
          "tree_id": "49d02ab7d68f5627cedb0c6a8ef58f7d4b5a16f6",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/4a0fd588d46617eec8ded7a1bccf746401d8c3a4"
        },
        "date": 1742853510355,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 34038,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 21808,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 10807,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 12992,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 13443,
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
          "id": "e2b1361f73ddcb582275cb9f9bb8100a94bbc9c7",
          "message": "feat(avm): vm2 initial context (#12972)\n\nThis adds the initial work for `context` and `context_stack` to vm2. The\ninterfaces will still need to be updated in the future, but it sets up\nthe points where the context events will happen (i.e. at the end of the\nmain execution loop and within `call`).\n\nThis also outlines the contents of the two events albeit commented out\nfor now (until we have the supported inputs in the context itself)",
          "timestamp": "2025-03-25T11:41:19+08:00",
          "tree_id": "d8c37cf8472368ef6d8562ff6d8e4e84013d76ce",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e2b1361f73ddcb582275cb9f9bb8100a94bbc9c7"
        },
        "date": 1742876183750,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 16811.9593519998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15041.937918 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 118201499006.8,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 1533446247,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 210026512,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 17876.8131920001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15703.471489 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 46525.382555000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 46525383000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3166.623635000178,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3005.4799089999997 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 8029.322448999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 8029323000 ms\nthreads: 1"
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
          "id": "e2b1361f73ddcb582275cb9f9bb8100a94bbc9c7",
          "message": "feat(avm): vm2 initial context (#12972)\n\nThis adds the initial work for `context` and `context_stack` to vm2. The\ninterfaces will still need to be updated in the future, but it sets up\nthe points where the context events will happen (i.e. at the end of the\nmain execution loop and within `call`).\n\nThis also outlines the contents of the two events albeit commented out\nfor now (until we have the supported inputs in the context itself)",
          "timestamp": "2025-03-25T11:41:19+08:00",
          "tree_id": "d8c37cf8472368ef6d8562ff6d8e4e84013d76ce",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e2b1361f73ddcb582275cb9f9bb8100a94bbc9c7"
        },
        "date": 1742876192163,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 34327,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 22069,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 10798,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 13102,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 13562,
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
          "id": "73820e442ed58433874746f9ab47a1dfde6af986",
          "message": "fix: extend e2e 2 pxes timeout. strip color codes for error_regex.",
          "timestamp": "2025-03-25T08:34:15Z",
          "tree_id": "a6a1c0673dc8daea1be2744761bb03bb7cf87957",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/73820e442ed58433874746f9ab47a1dfde6af986"
        },
        "date": 1742893368917,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 39496,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 26023,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 11683,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 14833,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 15674,
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
          "id": "8871c83fb13d15d5d36d2466e9953e9bb679ffd0",
          "message": "fix(avm): semicolons are hard (#12999)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\nline.",
          "timestamp": "2025-03-25T19:11:29+08:00",
          "tree_id": "dbf25a7a5efadfdaa3670b5dcf69d466f274667e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8871c83fb13d15d5d36d2466e9953e9bb679ffd0"
        },
        "date": 1742901477156,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17697.02036000035,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15810.325277999998 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 118232273103.49998,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 1621263948,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 215576718,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18833.311929000047,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16491.389416 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 50591.22415,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 50591224000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4168.386129999817,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3106.1777530000004 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9337.427859999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9337435000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2233.31",
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