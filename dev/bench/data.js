window.BENCHMARK_DATA = {
  "lastUpdate": 1743468164223,
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
        "date": 1743367216649,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 39519,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 26425,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 11634,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 14935,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 15350,
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
          "id": "504c33886bda9e159859b07cf3d2217d23e35a61",
          "message": "chore: Merge alpha back to master (#13128)\n\nThis PR is to simply merge alpha testnet back to master\n\n---------\n\nCo-authored-by: Alex Gherghisan <alexghr@users.noreply.github.com>\nCo-authored-by: Gregorio Juliana <gregojquiros@gmail.com>",
          "timestamp": "2025-03-30T22:17:37Z",
          "tree_id": "5dfc13336ab978172a705e0f793db9061c63f2b7",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/504c33886bda9e159859b07cf3d2217d23e35a61"
        },
        "date": 1743373829147,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 39392,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 26077,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 11994,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 14475,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 15309,
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
          "id": "5a4f2acf8a30ebaa488eb6e2fd3f3783afb91f45",
          "message": "chore: use testnet optimized trace (#13135)\n\nUpdate the structured trace utilized by the CIVC API\n(E2E_FULL_TEST_STRUCTURE) to the one that minimally encompasses the five\nkey transactions targeted for testnet 1. The total structured size is\nnow $242,024$, just shy of $2^{18}$. These are:\n\n```\ndeploy_ecdsar1+sponsored_fpc\ndeploy_ecdsar1+sponsored_fpc\necdsar1+amm_add_liquidity_1_recursions+sponsored_fpc\necdsar1+token_bridge_claim_private+sponsored_fpc\necdsar1+transfer_1_recursions+sponsored_fpc\n```",
          "timestamp": "2025-03-30T16:24:58-07:00",
          "tree_id": "9de386e36afa698f19529895055b274804787635",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5a4f2acf8a30ebaa488eb6e2fd3f3783afb91f45"
        },
        "date": 1743379535716,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 16385.25136499993,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13357.21209 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 118117379525.79999,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 1599263512,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 217228591,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 19339.57310599999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16555.763430000003 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 50961.618256999995,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 50961614000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3904.1105829996923,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3106.3781280000003 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9739.034712000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9739036000 ms\nthreads: 1"
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
          "id": "5a4f2acf8a30ebaa488eb6e2fd3f3783afb91f45",
          "message": "chore: use testnet optimized trace (#13135)\n\nUpdate the structured trace utilized by the CIVC API\n(E2E_FULL_TEST_STRUCTURE) to the one that minimally encompasses the five\nkey transactions targeted for testnet 1. The total structured size is\nnow $242,024$, just shy of $2^{18}$. These are:\n\n```\ndeploy_ecdsar1+sponsored_fpc\ndeploy_ecdsar1+sponsored_fpc\necdsar1+amm_add_liquidity_1_recursions+sponsored_fpc\necdsar1+token_bridge_claim_private+sponsored_fpc\necdsar1+transfer_1_recursions+sponsored_fpc\n```",
          "timestamp": "2025-03-30T16:24:58-07:00",
          "tree_id": "9de386e36afa698f19529895055b274804787635",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5a4f2acf8a30ebaa488eb6e2fd3f3783afb91f45"
        },
        "date": 1743379545033,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 26560,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17855,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8399,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10001,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 10761,
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
          "id": "101ff789f12be6ccfb69d7c3b00a55a891ac1d86",
          "message": "fix(avm): alu interface (#13115)\n\nChanges the Alu interface so that it is no longer mem-aware. \r\n\r\nNote: The underlying alu operations are not correctly handled - that's for a future PR.\r\n\r\nNote2: ValueRefAndTag is ok for now, but will likely need to be changed in future.",
          "timestamp": "2025-03-31T13:12:09+01:00",
          "tree_id": "d46b84b2a9936a32e03cd218eed75d572baf984b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/101ff789f12be6ccfb69d7c3b00a55a891ac1d86"
        },
        "date": 1743425817028,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 16668.588311999883,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13327.87923 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 118132951035.6,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 1602570061,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 212720101,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 19066.89097699973,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16498.005537 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 51166.106098000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 51166108000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3910.2669330000026,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3117.68085 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9985.368273999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9985372000 ms\nthreads: 1"
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
          "id": "101ff789f12be6ccfb69d7c3b00a55a891ac1d86",
          "message": "fix(avm): alu interface (#13115)\n\nChanges the Alu interface so that it is no longer mem-aware. \r\n\r\nNote: The underlying alu operations are not correctly handled - that's for a future PR.\r\n\r\nNote2: ValueRefAndTag is ok for now, but will likely need to be changed in future.",
          "timestamp": "2025-03-31T13:12:09+01:00",
          "tree_id": "d46b84b2a9936a32e03cd218eed75d572baf984b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/101ff789f12be6ccfb69d7c3b00a55a891ac1d86"
        },
        "date": 1743425826168,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 26567,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17494,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8420,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10029,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 10663,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "3a555ef27c0682e18cba1c73666477a57a334f8a",
          "message": "feat: Increase CIVC depth with no rollup cost (#13106)\n\nDoubles the Translator capacity to allow for 17 (mocked) kernel\nexecutions. ECCVM capacity currently blocks doing 18. This is recorded\nin tests. The tests are slower than I would like, but my attempts to use\na smaller trace structure failed in a variety of ways.\n\nTo ensure Translator RAM costs doesn't blow up WASM we allocated and\ndeallocated the commitment key as necessary and tweaked\nProverPolynomials to only be initialised on the actual circuit size\n(this creates friction with ZK but will be handled in a follow-on).\n\n---------\n\nCo-authored-by: maramihali <mara@aztecprotocol.com>\nCo-authored-by: ledwards2225 <l.edwards.d@gmail.com>",
          "timestamp": "2025-03-31T13:20:38+01:00",
          "tree_id": "60789987b6009dfd035fddbd674d5eacd101d93a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/3a555ef27c0682e18cba1c73666477a57a334f8a"
        },
        "date": 1743426108963,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 16611.024826000175,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13376.10448 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 121785478522.79999,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 1799757746,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 211621324,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 19014.739856000233,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16447.904813 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 51370.464980000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 51370463000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4004.653619000237,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3079.6095590000004 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10125.935625,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10125937000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2265.31",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
          "id": "3a555ef27c0682e18cba1c73666477a57a334f8a",
          "message": "feat: Increase CIVC depth with no rollup cost (#13106)\n\nDoubles the Translator capacity to allow for 17 (mocked) kernel\nexecutions. ECCVM capacity currently blocks doing 18. This is recorded\nin tests. The tests are slower than I would like, but my attempts to use\na smaller trace structure failed in a variety of ways.\n\nTo ensure Translator RAM costs doesn't blow up WASM we allocated and\ndeallocated the commitment key as necessary and tweaked\nProverPolynomials to only be initialised on the actual circuit size\n(this creates friction with ZK but will be handled in a follow-on).\n\n---------\n\nCo-authored-by: maramihali <mara@aztecprotocol.com>\nCo-authored-by: ledwards2225 <l.edwards.d@gmail.com>",
          "timestamp": "2025-03-31T13:20:38+01:00",
          "tree_id": "60789987b6009dfd035fddbd674d5eacd101d93a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/3a555ef27c0682e18cba1c73666477a57a334f8a"
        },
        "date": 1743426118716,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 27098,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 18014,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8786,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10428,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 10872,
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
          "id": "87809b27c701e4ded7658c966e64c5639b991e59",
          "message": "feat: util for computing proposer/forwarder address (#13169)\n\nFrom within `yarn-project/ethereum` you can now\n```\nyarn proposer-address 0x8048539a57619864fdcAE35282731809CD1f5E8D\n```\nwhich returns the proposer address for that attester if they're using\nthe standard forwarder.",
          "timestamp": "2025-03-31T08:37:24-04:00",
          "tree_id": "1cf0c1c21bb636110f47b8a0144b0551ea274a48",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/87809b27c701e4ded7658c966e64c5639b991e59"
        },
        "date": 1743426406590,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 26970,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 18043,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8701,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10457,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 10937,
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
          "id": "cf5e21753f10258d2953e22f3c8281f1b604e26f",
          "message": "chore: remove templating by flavor in merge protocol (#13098)\n\nThe merge protocol never benefited from the structures that are part of\nFlavor so it makes sense to remove the templating.",
          "timestamp": "2025-03-31T13:52:12Z",
          "tree_id": "ff059ecbd78614f115e86a691ef26feb59a76421",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/cf5e21753f10258d2953e22f3c8281f1b604e26f"
        },
        "date": 1743431567806,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 16774.438033000024,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13689.550747 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 121715727368.9,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 1780660998,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 228362620,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 19675.213988999985,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16792.604154 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 52402.768288,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 52402768000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3941.604955999992,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3176.4994860000006 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9880.390704,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9880392000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2265.31",
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
          "id": "cf5e21753f10258d2953e22f3c8281f1b604e26f",
          "message": "chore: remove templating by flavor in merge protocol (#13098)\n\nThe merge protocol never benefited from the structures that are part of\nFlavor so it makes sense to remove the templating.",
          "timestamp": "2025-03-31T13:52:12Z",
          "tree_id": "ff059ecbd78614f115e86a691ef26feb59a76421",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/cf5e21753f10258d2953e22f3c8281f1b604e26f"
        },
        "date": 1743431578454,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 26958,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17935,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8767,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10437,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 10959,
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
          "id": "f13be092be613be836a51cdadd78ce0837522f79",
          "message": "chore: rename journal dir and file to state manager & mv to up to public/ (#13159)",
          "timestamp": "2025-03-31T14:09:55Z",
          "tree_id": "3c019e4f6b99a124f8e7994f7f174e17fa6dd167",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f13be092be613be836a51cdadd78ce0837522f79"
        },
        "date": 1743432706948,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 26888,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17986,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8787,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10553,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 11028,
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
          "id": "260a057e65f3054643e64cb57d90f972de708a61",
          "message": "fix: trying to fix EADDRINUSE (#13176)\n\n* Fix a bunch of `afterAll/afterEvery` mismatches that could lead to\n`EADDRINUSE` errors.\n* Force more networking binds (particularly in p2p tests) to loopback\n(`127.0.0.1`) to avoid potential `EADDRINUSE` or at least be more\nexplicit about what interface the error is happening on.\n* Force anvil back to `8545` and be explicit if you want a different\nport number. Again to make it easier to detect and diagnose improper\ncode.\n* `setup` function at least tears down anvil if it throws. It should\nprobably cleanup other things as well.",
          "timestamp": "2025-03-31T16:15:04+01:00",
          "tree_id": "6df7dbabbb5fc6bda34f36592e886a24ac43ba08",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/260a057e65f3054643e64cb57d90f972de708a61"
        },
        "date": 1743435853593,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 26807,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17884,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8723,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10339,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 10962,
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
          "id": "800ab8d69fda8c82d4b1ca0146aa31edff58839d",
          "message": "feat: purge of log decryption in TS (#12992)",
          "timestamp": "2025-03-31T17:35:11+02:00",
          "tree_id": "1e886c2db238beecc24c28c63a079bfbdebb7ed3",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/800ab8d69fda8c82d4b1ca0146aa31edff58839d"
        },
        "date": 1743437208776,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 26850,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17869,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8781,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10357,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 11130,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "105737703+iakovenkos@users.noreply.github.com",
            "name": "sergei iakovenko",
            "username": "iakovenkos"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "a78480282b384441902b3629814871dacabc1b18",
          "message": "fix: recursive sumcheck bugs (#12885)\n\nFix several bugs found in the recursive sumcheck verifiers",
          "timestamp": "2025-03-31T15:41:33Z",
          "tree_id": "d752f244116febb71768d97950d4f64adae925e0",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a78480282b384441902b3629814871dacabc1b18"
        },
        "date": 1743437453080,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 16735.20425300012,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13474.058076999998 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 121683569791.79999,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 1812820006,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 214508042,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 19402.231405000064,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16752.273573 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 53359.432705,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 53359432000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3901.5416489999097,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3112.569054 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9570.200838999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9570206000 ms\nthreads: 1"
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
            "email": "105737703+iakovenkos@users.noreply.github.com",
            "name": "sergei iakovenko",
            "username": "iakovenkos"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "a78480282b384441902b3629814871dacabc1b18",
          "message": "fix: recursive sumcheck bugs (#12885)\n\nFix several bugs found in the recursive sumcheck verifiers",
          "timestamp": "2025-03-31T15:41:33Z",
          "tree_id": "d752f244116febb71768d97950d4f64adae925e0",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a78480282b384441902b3629814871dacabc1b18"
        },
        "date": 1743437463376,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 26809,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 18016,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8756,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10347,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 10865,
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
          "id": "f5bcecee3bcf0fab0ef06701daa77228b24af508",
          "message": "refactor: minor tagging API improvement (#13092)",
          "timestamp": "2025-03-31T16:08:13Z",
          "tree_id": "e8d757bc251539d044755db5523891a96e8fafd6",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f5bcecee3bcf0fab0ef06701daa77228b24af508"
        },
        "date": 1743439064348,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 26869,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17981,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8766,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10336,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 11011,
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
          "id": "1c2291a344e7528a04d1bf6081f29a9678ecded5",
          "message": "fix: Race condition while unwinding blocks (#13148)\n\nWe hit [the following error](http://ci.aztec-labs.com/54d28d81fcad1e9b)\nin CI:\n\n```\n19:05:17   ● e2e_block_building › reorgs › detects an upcoming reorg and builds a block for the correct slot\n19:05:17 \n19:05:17     Could not retrieve body for block 4 0x139a9efee631a725b0ed6bc428460ceedb98bd2502ef13eeaa65123fd0cd98f9\n19:05:17 \n19:05:17       124 |         const blockBodyBuffer = await this.#blockBodies.getAsync(blockHash);\n19:05:17       125 |         if (blockBodyBuffer === undefined) {\n19:05:17     > 126 |             throw new Error(`Could not retrieve body for block ${header.globalVariables.blockNumber.toNumber()} ${blockHash}`);\n19:05:17           |                   ^\n19:05:17       127 |         }\n19:05:17       128 |         const body = Body.fromBuffer(blockBodyBuffer);\n19:05:17       129 |         const block = new L2Block(archive, header, body);\n19:05:17 \n19:05:17       at BlockStore.getBlockFromBlockStorage (../../archiver/dest/archiver/kv_archiver_store/block_store.js:126:19)\n19:05:17       at BlockStore.getSettledTxReceipt (../../archiver/dest/archiver/kv_archiver_store/block_store.js:165:23)\n19:05:17       at AztecNodeService.getTxReceipt (../../aztec-node/dest/aztec-node/server.js:357:34)\n19:05:17       at e2e_block_building.test.ts:567:22\n19:05:17       at retryUntil (../../foundation/dest/retry/index.js:84:24)\n19:05:17       at Object.<anonymous> (e2e_block_building.test.ts:566:7)\n```\n\nApparently this happens because we try calling `getTxReceipt` **during**\na block unwind (ie reorg) operation, the new test `does not fail if the\nblock is unwound while requesting a tx` could reproduce it consistently.\nThis is odd, since the only way that can happen is if the block body has\nbeen deleted but not the header. And these operations happen within the\nsame write tx in `unwindBlocks`.\n\nEither way, this fixes it by ignoring missing block bodies as if the\nentire block were missing.",
          "timestamp": "2025-03-31T13:11:48-03:00",
          "tree_id": "90e71803774ed6a9d44f4d4fa424c8711105ba10",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1c2291a344e7528a04d1bf6081f29a9678ecded5"
        },
        "date": 1743439268375,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 26718,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17989,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8727,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10409,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 10925,
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
          "id": "229515fc89ec8b82375fd3ea0de58c2db96ad582",
          "message": "fix: Handle proven chain events referring to unseen blocks (#13144)\n\nThe L2BlockStream works by comparing a local and a remote block source.\nFor simplicity, we had created an L2TipsStore that keeps track of\n\"local\" block tips seen, either in memory or storage.\n\nHowever, when using the in-memory one, if the block stream reported a\nproven block number that the tips store hadn't seen, the tip store would\nthrow due to not having its block hash when it tried to retrieve it\nlater.\n\nThis fixes it by emitting the block hash along with the number from all\nblock stream events, and storing them in the tips store.\n\nFixes #13142",
          "timestamp": "2025-03-31T13:11:54-03:00",
          "tree_id": "fa55b52bdcab2b579c5af96d1f67e2dce7be5c54",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/229515fc89ec8b82375fd3ea0de58c2db96ad582"
        },
        "date": 1743439270306,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 26910,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17901,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8801,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10339,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 10913,
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
          "id": "7a2c9b72debd949d3b9537bd9755b5d66c649151",
          "message": "feat: more benchmarks (#13103)\n\nCo-authored-by: cody <codygunton@gmail.com>\nCo-authored-by: maramihali <mara@aztecprotocol.com>\nCo-authored-by: Nicolás Venturo <nicolas.venturo@gmail.com>\nCo-authored-by: ledwards2225 <l.edwards.d@gmail.com>",
          "timestamp": "2025-03-31T16:21:39Z",
          "tree_id": "ca53f06341edf33c4cc6ad60d8b713a18210643f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7a2c9b72debd949d3b9537bd9755b5d66c649151"
        },
        "date": 1743439871220,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 16651.419100999876,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13516.400503 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 121704736817.7,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 1765771426,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 216587039,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 19295.59739899992,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16695.764528000003 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 52400.062060000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 52400061000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3947.317673000043,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3165.6628790000004 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10096.481134,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10096485000 ms\nthreads: 1"
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
          "id": "7a2c9b72debd949d3b9537bd9755b5d66c649151",
          "message": "feat: more benchmarks (#13103)\n\nCo-authored-by: cody <codygunton@gmail.com>\nCo-authored-by: maramihali <mara@aztecprotocol.com>\nCo-authored-by: Nicolás Venturo <nicolas.venturo@gmail.com>\nCo-authored-by: ledwards2225 <l.edwards.d@gmail.com>",
          "timestamp": "2025-03-31T16:21:39Z",
          "tree_id": "ca53f06341edf33c4cc6ad60d8b713a18210643f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7a2c9b72debd949d3b9537bd9755b5d66c649151"
        },
        "date": 1743439881693,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 26875,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 18319,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8801,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10392,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 10858,
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
          "id": "cb1a857e210638f734e19f95d01284dabbd26f17",
          "message": "chore: convenient way to run app ivc from bb (#13158)\n\nOne can now run (for example, any master commit that has finished\nbenchmarking can be used):\n`barretenberg/cpp/bootstrap.sh e2e_ivc_bench\n88c0e046ccb8381910a4615ac6218dcdbf04d898`\n\nAlso bundled: \n- error in CI if we edit cache contents and try to cache upload\n- bench cleanup and bash typo fix\n- remove AZTEC_CACHE_NO_SCRIPTS as it has gotchas",
          "timestamp": "2025-03-31T18:53:51Z",
          "tree_id": "97166afc550d8f2f1a56372108234a8cce406153",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/cb1a857e210638f734e19f95d01284dabbd26f17"
        },
        "date": 1743448386351,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 16832.730271999935,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13571.63772 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 121743918258.40001,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 1883796558,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 219287923,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 19303.281483000093,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16499.783423 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 52744.716141000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 52744717000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3918.0867870002203,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3171.815474 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9220.294609000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9220305000 ms\nthreads: 1"
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
          "id": "cb1a857e210638f734e19f95d01284dabbd26f17",
          "message": "chore: convenient way to run app ivc from bb (#13158)\n\nOne can now run (for example, any master commit that has finished\nbenchmarking can be used):\n`barretenberg/cpp/bootstrap.sh e2e_ivc_bench\n88c0e046ccb8381910a4615ac6218dcdbf04d898`\n\nAlso bundled: \n- error in CI if we edit cache contents and try to cache upload\n- bench cleanup and bash typo fix\n- remove AZTEC_CACHE_NO_SCRIPTS as it has gotchas",
          "timestamp": "2025-03-31T18:53:51Z",
          "tree_id": "97166afc550d8f2f1a56372108234a8cce406153",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/cb1a857e210638f734e19f95d01284dabbd26f17"
        },
        "date": 1743448396203,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 27136,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 18436,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8822,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10385,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 11275,
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
          "id": "c1004995e948039371d85020cdcb9d7029955b76",
          "message": "fix: handling multiple identical logs in a tx (#13184)",
          "timestamp": "2025-03-31T18:13:11-06:00",
          "tree_id": "4e0807b9dd7c64fe21572a228a094f39701dd2fc",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c1004995e948039371d85020cdcb9d7029955b76"
        },
        "date": 1743468156580,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 27064,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17950,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8794,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10353,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 11131,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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