window.BENCHMARK_DATA = {
  "lastUpdate": 1747152147249,
  "repoUrl": "https://github.com/AztecProtocol/aztec-packages",
  "entries": {
    "C++ Benchmark": [
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
          "distinct": false,
          "id": "fc3910288b3c43ae3c2939d88acc1cd5485f0330",
          "message": "feat: full AVM public inputs struct in C++, including tracegen of full PI columns (#14088)\n\nCo-authored-by: AztecBot <tech@aztecprotocol.com>",
          "timestamp": "2025-05-08T20:20:24Z",
          "tree_id": "796b748f9be43a666cc9ffba1c2ccebcc5cb663f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/fc3910288b3c43ae3c2939d88acc1cd5485f0330"
        },
        "date": 1746739911149,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17962.42856700019,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14429.312539 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 4796162072,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 196415971,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 25421.021898000163,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19870.997017 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 69190.99574700001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 69190996000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4238.27002400003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3573.299211 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11335.711150999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11335713000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2269.19",
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
          "distinct": false,
          "id": "fc3910288b3c43ae3c2939d88acc1cd5485f0330",
          "message": "feat: full AVM public inputs struct in C++, including tracegen of full PI columns (#14088)\n\nCo-authored-by: AztecBot <tech@aztecprotocol.com>",
          "timestamp": "2025-05-08T20:20:24Z",
          "tree_id": "796b748f9be43a666cc9ffba1c2ccebcc5cb663f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/fc3910288b3c43ae3c2939d88acc1cd5485f0330"
        },
        "date": 1746739925097,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24342,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1910,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 77966,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2343,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 20892,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2352,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 67277,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3096,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14654,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1195,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 48934,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1800,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 18035,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1381,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 59317,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1981,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12421,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1138,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 41768,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1789,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21786,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1725,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 71346,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2284,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14162,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1189,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 48439,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1758,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13654,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1176,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 45307,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1785,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
          "distinct": false,
          "id": "278661f67ce4d444b068b331971a5bb3e2a2461f",
          "message": "feat!: AVM DebugLog opcode should be (mostly) a no-op unless doing verbose \"client-initiated-simulation\" (#14085)\n\nUnless initiated from `node.simulatePublicCalls()` or from TXE, with\nlog-level verbose, DebugLog should be a no-op.\n\nIt is a no-op, but it resolves memory address operands to avoid the need\nto special case things in C++. Special casing would be \"this instruction\nhas memory offset operands but we only _sometimes_ want to resolve and\ntag check them and generate events\".\n\nIt does not do any slice memory stuff when in no-op mode.\n\nCo-authored-by: AztecBot <tech@aztecprotocol.com>",
          "timestamp": "2025-05-08T21:11:35Z",
          "tree_id": "5fbed74cb1b033fb7032c584f49136af2022a76d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/278661f67ce4d444b068b331971a5bb3e2a2461f"
        },
        "date": 1746743031337,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18118.888899000012,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14250.299770000001 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 4795770784,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 196898465,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 25233.52181700011,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19980.737789 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 69574.55052599999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 69574551000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4289.637433999815,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3638.9764410000002 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11439.273476999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11439275000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2285.19",
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
          "distinct": false,
          "id": "278661f67ce4d444b068b331971a5bb3e2a2461f",
          "message": "feat!: AVM DebugLog opcode should be (mostly) a no-op unless doing verbose \"client-initiated-simulation\" (#14085)\n\nUnless initiated from `node.simulatePublicCalls()` or from TXE, with\nlog-level verbose, DebugLog should be a no-op.\n\nIt is a no-op, but it resolves memory address operands to avoid the need\nto special case things in C++. Special casing would be \"this instruction\nhas memory offset operands but we only _sometimes_ want to resolve and\ntag check them and generate events\".\n\nIt does not do any slice memory stuff when in no-op mode.\n\nCo-authored-by: AztecBot <tech@aztecprotocol.com>",
          "timestamp": "2025-05-08T21:11:35Z",
          "tree_id": "5fbed74cb1b033fb7032c584f49136af2022a76d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/278661f67ce4d444b068b331971a5bb3e2a2461f"
        },
        "date": 1746743043646,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24396,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1872,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 78654,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2386,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 20985,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2286,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 67342,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3125,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14786,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1193,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 47535,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1871,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 18060,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1378,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58014,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1917,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12546,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1136,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 42072,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1799,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21697,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1724,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 71934,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2243,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14281,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1189,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 47139,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1865,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13543,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1175,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 44228,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1847,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "asterite@gmail.com",
            "name": "Ary Borenszweig",
            "username": "asterite"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": false,
          "id": "3a5f9cfd12d602d35888cb8cd0d247983d3e9c9a",
          "message": "fix: tuple mismatch in some tests (#14175)\n\nIf you have code like this:\n\n```noir\nfn main() {\n    let (x, y) = (1, 2, 3);\n}\n```\n\nthen Noir, unlike Rust, doesn't complain that the left-hand side tuple\ndoesn't have exactly the number of elements that are on the right side.\n\nThat's about to change (it's a bug) when this PR merges:\nhttps://github.com/noir-lang/noir/pull/8424\n\nBefore that, we can fix the existing errors here.\n\nI chose to ignore the extra tuple element because it's currently\nignored, but I don't know if the \"owner\" should be used for something in\ntests (alternatively maybe \"owner\" should not be returned if it's not\ngoing to be used).",
          "timestamp": "2025-05-08T22:03:21Z",
          "tree_id": "e62f62cfb88f56e4b3c15e6e138b8c157418c867",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/3a5f9cfd12d602d35888cb8cd0d247983d3e9c9a"
        },
        "date": 1746744505256,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24353,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1875,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 78384,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2342,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 21210,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2317,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 67473,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3171,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14569,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1194,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 49186,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1839,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 18015,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1376,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58518,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2007,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12453,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1134,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 41320,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1737,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21767,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1760,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 71843,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2169,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14334,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1189,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 48002,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1816,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13619,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1173,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 44926,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1825,
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
          "id": "5b2ead29cd6e82013019a6d288cadae6123a1700",
          "message": "refactor: flat grumpkin CRS, use CDN, remove old srs_db  (#14097)\n\nA bunch of bn254/grumpkin CRS cleanup. The main motivation was to get\nrid of the extra srs_db download in CI, but it was tangled enough that\nit was best the code was refactored first.\n\nMain changes:\n- Rework the old file crs factory class to be a 'NativeCrsFactory',\nreflecting its use in native code (WASM still uses MemCrsFactory). This\nacts like a file-backed CRS that reads from ~/.bb-crs if allow_download\n= false, otherwise it reads from the network if not enough CRS points\nare found. Tested in crs_factory.test.cpp.\n- Remove the srs_db folder that redundantly downloads CRS. Rework all\nreferences to it to instead use the downloaded-on-demand version in\n~/.bb-crs\n- 'Flatten' grumpkin i.e. removing the header. This is for now called\ngrumpkin_g1.flat.dat but we can shortly move it to the original\ngrumpkin_g1.dat name. Remove the hacky grumpkin_size file as it is now\neasy to tell from the .dat file size itself.\n- Move to the new CDN-delivered CRS URL\n\nOther changes:\n- Remove the hacky up-front CRS initialization (except in WASM/bb.js,\nwhere it is still needed), fully embracing the originally intended\non-demand CRS loading.\n- no redundant verifier and prover CRS's, just make one CRS that does\nboth. We basically always want the verifier CRS around, and it's easy\nenough to represent a verifier as a 'prover' CRS with one point for\nbn254. For grumpkin, they were already identical.\n- Allow for short syntax `bb prove -s client_ivc` if\n`ivc-inputs.msgpack` is in the current working directory. The proof will\ngo in an 'out' folder that is created if it does not exist.\n- Refactor old tests that used very low level ways of reading CRS. This\nuncovered fundamental flaws in them, such as trying to read `2**20`\npoints from grumpkin (which has `2**18` max)\n\nCloses https://github.com/AztecProtocol/barretenberg/issues/1163\nCloses https://github.com/AztecProtocol/barretenberg/issues/1180\n\n---------\n\nCo-authored-by: AztecBot <tech@aztecprotocol.com>",
          "timestamp": "2025-05-08T22:41:16Z",
          "tree_id": "0a5d30ae1ade27d9bed2dd10a5a65cb35cddd2c8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5b2ead29cd6e82013019a6d288cadae6123a1700"
        },
        "date": 1746747976896,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18018.11098600001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14411.926288 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 4791873579,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 202958939,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 25678.747052999825,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 20113.046798000003 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 69731.82248799999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 69731824000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4336.500346000321,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3695.7263909999997 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11609.475924,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11609478000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2205.19",
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
          "id": "5b2ead29cd6e82013019a6d288cadae6123a1700",
          "message": "refactor: flat grumpkin CRS, use CDN, remove old srs_db  (#14097)\n\nA bunch of bn254/grumpkin CRS cleanup. The main motivation was to get\nrid of the extra srs_db download in CI, but it was tangled enough that\nit was best the code was refactored first.\n\nMain changes:\n- Rework the old file crs factory class to be a 'NativeCrsFactory',\nreflecting its use in native code (WASM still uses MemCrsFactory). This\nacts like a file-backed CRS that reads from ~/.bb-crs if allow_download\n= false, otherwise it reads from the network if not enough CRS points\nare found. Tested in crs_factory.test.cpp.\n- Remove the srs_db folder that redundantly downloads CRS. Rework all\nreferences to it to instead use the downloaded-on-demand version in\n~/.bb-crs\n- 'Flatten' grumpkin i.e. removing the header. This is for now called\ngrumpkin_g1.flat.dat but we can shortly move it to the original\ngrumpkin_g1.dat name. Remove the hacky grumpkin_size file as it is now\neasy to tell from the .dat file size itself.\n- Move to the new CDN-delivered CRS URL\n\nOther changes:\n- Remove the hacky up-front CRS initialization (except in WASM/bb.js,\nwhere it is still needed), fully embracing the originally intended\non-demand CRS loading.\n- no redundant verifier and prover CRS's, just make one CRS that does\nboth. We basically always want the verifier CRS around, and it's easy\nenough to represent a verifier as a 'prover' CRS with one point for\nbn254. For grumpkin, they were already identical.\n- Allow for short syntax `bb prove -s client_ivc` if\n`ivc-inputs.msgpack` is in the current working directory. The proof will\ngo in an 'out' folder that is created if it does not exist.\n- Refactor old tests that used very low level ways of reading CRS. This\nuncovered fundamental flaws in them, such as trying to read `2**20`\npoints from grumpkin (which has `2**18` max)\n\nCloses https://github.com/AztecProtocol/barretenberg/issues/1163\nCloses https://github.com/AztecProtocol/barretenberg/issues/1180\n\n---------\n\nCo-authored-by: AztecBot <tech@aztecprotocol.com>",
          "timestamp": "2025-05-08T22:41:16Z",
          "tree_id": "0a5d30ae1ade27d9bed2dd10a5a65cb35cddd2c8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5b2ead29cd6e82013019a6d288cadae6123a1700"
        },
        "date": 1746747991403,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24184,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1764,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 77886,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2273,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 20954,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2300,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 68153,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3153,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14670,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1082,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 48643,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1707,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 17903,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1268,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 57956,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1764,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12536,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1024,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 41200,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1618,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21663,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1613,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 71587,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2143,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14045,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1077,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 47869,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1634,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13264,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1063,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 44593,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1808,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
          "id": "17f5c41757abf15364ba7f937200508d3e8993fc",
          "message": "feat!: add pairing agg in a few more places (#14125)\n\n1. Add nested pairing point aggregation to the native UH verifier (uses\nnew native `PairingPoints` class)\n2. Add aggregation of nested pairing points of final accumulated circuit\nin hiding circuit\n3. Add precomputed VKs to ivc-inputs.msgpack in ivc_integration suite\n4. fix bug in `generate3FunctionTestingIVCStack` (was passing the wrong\nVK for one circuit)\n\nCloses https://github.com/AztecProtocol/barretenberg/issues/1382",
          "timestamp": "2025-05-09T00:20:02Z",
          "tree_id": "b6712cf87466854026528cea5faec6f4a5a0d1d0",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/17f5c41757abf15364ba7f937200508d3e8993fc"
        },
        "date": 1746753690786,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18031.555129000026,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14547.419696 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 4853933608,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 206113864,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 25586.123500000213,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 20173.618718 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 69406.018694,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 69406019000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4344.59169100046,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3619.2791770000003 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11602.628153,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11602630000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2325.19",
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
          "id": "17f5c41757abf15364ba7f937200508d3e8993fc",
          "message": "feat!: add pairing agg in a few more places (#14125)\n\n1. Add nested pairing point aggregation to the native UH verifier (uses\nnew native `PairingPoints` class)\n2. Add aggregation of nested pairing points of final accumulated circuit\nin hiding circuit\n3. Add precomputed VKs to ivc-inputs.msgpack in ivc_integration suite\n4. fix bug in `generate3FunctionTestingIVCStack` (was passing the wrong\nVK for one circuit)\n\nCloses https://github.com/AztecProtocol/barretenberg/issues/1382",
          "timestamp": "2025-05-09T00:20:02Z",
          "tree_id": "b6712cf87466854026528cea5faec6f4a5a0d1d0",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/17f5c41757abf15364ba7f937200508d3e8993fc"
        },
        "date": 1746753703610,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24050,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1760,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 76823,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2264,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 20995,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2333,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 67485,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3041,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14861,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1081,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 49242,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1743,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 17675,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1267,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58608,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1878,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12341,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1024,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 40586,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1577,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21554,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1612,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 70775,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2115,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14260,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1095,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 48479,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1633,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13364,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1061,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 44259,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1662,
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
          "id": "a6de3d0385c1dd1b1dd6c5f0b98430ab8ff85ad5",
          "message": "git subrepo push --branch=master noir-projects/aztec-nr\n\nsubrepo:\n  subdir:   \"noir-projects/aztec-nr\"\n  merged:   \"73cf91d049\"\nupstream:\n  origin:   \"https://github.com/AztecProtocol/aztec-nr\"\n  branch:   \"master\"\n  commit:   \"73cf91d049\"\ngit-subrepo:\n  version:  \"0.4.6\"\n  origin:   \"???\"\n  commit:   \"???\"",
          "timestamp": "2025-05-09T02:32:03Z",
          "tree_id": "435df0f792bfb9a0422f5adb9ac3b23e704e5363",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a6de3d0385c1dd1b1dd6c5f0b98430ab8ff85ad5"
        },
        "date": 1746759952545,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24194,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1761,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 78320,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2181,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 20792,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2310,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 67674,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3111,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14611,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1080,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 48318,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1735,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 17722,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1267,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58064,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1878,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12245,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1003,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 41586,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1640,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21692,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1635,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 71105,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2138,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14168,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1078,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 47575,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1713,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13219,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1062,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 44262,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1705,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
          "distinct": false,
          "id": "cf08c09b975a0d0ce69eba8418b1743e6e0e61e3",
          "message": "feat: add txe test contract + a new helper that disables out of context oracles (#14165)\n\nThis PR simply moves some tests from in `CounterContract` #14020 to a\nnew bespoke `TXETest` contract. Also it puts the scaffolding in for\ndisabling oracles in a txe test not invoked from a `env.` function",
          "timestamp": "2025-05-09T11:07:07Z",
          "tree_id": "545659fe9ebb8b98d32f648c38a5b9b92a7acea3",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/cf08c09b975a0d0ce69eba8418b1743e6e0e61e3"
        },
        "date": 1746790649262,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24109,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1792,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 77261,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2192,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 21044,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2310,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 67486,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3071,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14638,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1083,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 48860,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1627,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 17884,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1266,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58493,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1844,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12232,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1026,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 41226,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1655,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21724,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1615,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 71012,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2118,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14367,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1076,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 48514,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1707,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13318,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1062,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 44808,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1701,
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
          "id": "4fe7c5139d3ad173dababa0b51c95405b44975b1",
          "message": "chore: Reenable sentinel e2e test (#14185)\n\nCI was failing as nodes sometimes started a bit late, causing the\nsentinel to miss the first slot and return a history shorter than\nexpected.\n\nThis PR waits until sentinel has collected the expected data.",
          "timestamp": "2025-05-09T13:54:27Z",
          "tree_id": "1eda318918e99c8cc48db44e5f95579fca536f34",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/4fe7c5139d3ad173dababa0b51c95405b44975b1"
        },
        "date": 1746800666988,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24200,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1756,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 78227,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2263,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 21243,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2300,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 68464,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3141,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14400,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1085,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 48273,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1709,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 17776,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1302,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58134,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1812,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12409,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1027,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 41541,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1636,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21931,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1647,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 71712,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2069,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 13875,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1074,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 47755,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1638,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13141,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1061,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 44730,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1756,
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
          "id": "073bc7d4bb65324458febb9ccaf7a92449194542",
          "message": "fix: Handle \"zero\" as key on LMDBv2 map (#14183)\n\nFixes #14182",
          "timestamp": "2025-05-09T14:02:59Z",
          "tree_id": "4f3c518d97a1ae4650a236e2c05456ce79f4173d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/073bc7d4bb65324458febb9ccaf7a92449194542"
        },
        "date": 1746801767257,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24259,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1772,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 77891,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2217,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 21314,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2309,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 69364,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3099,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14523,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1116,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 48385,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1687,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 17809,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1303,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 57845,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1785,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12475,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1025,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 41256,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1655,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21871,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1610,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 72541,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2201,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14125,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1078,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 48001,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1630,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13207,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1063,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 43868,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1742,
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
          "id": "2815d939e11fed9cc6205107171caf6c1a518058",
          "message": "chore(avm): less verbose equality check (#14188)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\nline.",
          "timestamp": "2025-05-09T14:25:29Z",
          "tree_id": "05be49142f3ef8292786f954aad4f5ccf3a67122",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/2815d939e11fed9cc6205107171caf6c1a518058"
        },
        "date": 1746803072423,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24386,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1764,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 78401,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2197,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 21256,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2348,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 67534,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3104,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14511,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1086,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 48190,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1768,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 17698,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1265,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58259,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1903,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12338,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1027,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 42326,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1619,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21684,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1651,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 70997,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2119,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14007,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1075,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 47426,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1681,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13178,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1061,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 44821,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1710,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
          "distinct": false,
          "id": "11cf4e6e4e8804166f45160cdeaf831bab15c018",
          "message": "fix: getEpochAndSlotAtSlot computation (#14189)",
          "timestamp": "2025-05-09T14:52:02Z",
          "tree_id": "3aba754c1c8883062f00d6ab50724229eadf0177",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/11cf4e6e4e8804166f45160cdeaf831bab15c018"
        },
        "date": 1746804996795,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24198,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1779,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 77488,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2257,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 21077,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2285,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 68693,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3018,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14625,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1081,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 47880,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1695,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 18165,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1265,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 57623,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1828,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12250,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1024,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 40964,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1681,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21755,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1644,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 72511,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2071,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14130,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1079,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 47095,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1729,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13311,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1062,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 44115,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1777,
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
          "id": "cbe7246e9c3e933d3e85076a22d42741f8117b6d",
          "message": "chore: Run all nested e2e tests by default on CI (#14186)\n\nWe were missing all `e2e_epochs` and `e2e_sequencer` tests.",
          "timestamp": "2025-05-09T15:55:22Z",
          "tree_id": "f4f6eea4217f2d1f448b565bcc6df1d88767b005",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/cbe7246e9c3e933d3e85076a22d42741f8117b6d"
        },
        "date": 1746811409116,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24393,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1777,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 78524,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2241,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 20799,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2332,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 67414,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3077,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14430,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1082,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 49113,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1736,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 17752,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1302,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58231,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1903,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12310,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1023,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 42317,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1590,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21593,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1613,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 70800,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2135,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 13957,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1077,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 48223,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1704,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13327,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1059,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 44845,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1712,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
          "distinct": false,
          "id": "5ff375219c58809a119a42cf96ec1b3ef43904f1",
          "message": "feat!: Indirect flag is now sorted by operand (#14184)\n\nPreviously, the indirect flag was LSB [operand_0_indirect,\noperand_1_indirect, operand_0_relative, operand_1_relative, ...0] MSB.\nThis made it so different amounts of operands would make the indirect\nflag have different meanings. This PR changes it to LSB\n[operand_0_indirect, operand_0_relative, operand_1_indirect ...] MSB\nThis way the meaning of the operand flag doesn't change with the number\nof operands, and we also avoid having to construct addressing with the\nconcrete operand count.",
          "timestamp": "2025-05-09T16:47:30Z",
          "tree_id": "517c992849ee2676af7c74fe1aa1f670f225b8a0",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5ff375219c58809a119a42cf96ec1b3ef43904f1"
        },
        "date": 1746812619831,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17933.83108399985,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14220.819063 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 5042821691,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 203901763,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 25600.870942000256,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 20151.747561 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 70344.506694,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 70344508000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4685.168179999891,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4000.0935009999994 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11865.927726,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11865929000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2325.19",
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
          "distinct": false,
          "id": "5ff375219c58809a119a42cf96ec1b3ef43904f1",
          "message": "feat!: Indirect flag is now sorted by operand (#14184)\n\nPreviously, the indirect flag was LSB [operand_0_indirect,\noperand_1_indirect, operand_0_relative, operand_1_relative, ...0] MSB.\nThis made it so different amounts of operands would make the indirect\nflag have different meanings. This PR changes it to LSB\n[operand_0_indirect, operand_0_relative, operand_1_indirect ...] MSB\nThis way the meaning of the operand flag doesn't change with the number\nof operands, and we also avoid having to construct addressing with the\nconcrete operand count.",
          "timestamp": "2025-05-09T16:47:30Z",
          "tree_id": "517c992849ee2676af7c74fe1aa1f670f225b8a0",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5ff375219c58809a119a42cf96ec1b3ef43904f1"
        },
        "date": 1746812632941,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24173,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1798,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 76826,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2181,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 20862,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2340,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 67522,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3158,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14370,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1083,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 49095,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1700,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 17754,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1265,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 57570,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1821,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12160,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1027,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 41166,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1594,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21577,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1614,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 70739,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2165,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14000,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1104,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 48206,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1609,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13201,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1060,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 43802,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1651,
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
          "id": "4d1a7c839df7081da05c2086a6f312c8a405cc45",
          "message": "chore: Update the list of security bugs (#13825)\n\nReorganize the security bugs table and add a few new ones",
          "timestamp": "2025-05-09T16:55:25Z",
          "tree_id": "fa0223d9d477d05dc16c77d14d186aa3b9679b84",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/4d1a7c839df7081da05c2086a6f312c8a405cc45"
        },
        "date": 1746812736004,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17808.413131999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14262.924554 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 4862726118,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 200630754,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 25232.696317999966,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19794.826651 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 70047.88158599999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 70047886000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4156.094309999958,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3477.8155009999996 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11507.006082,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11507010000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2325.19",
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
          "distinct": false,
          "id": "904ed3de53f7e334feb0888be7523579e55b147b",
          "message": "chore(bb.js): remove plonk utils (#14180)",
          "timestamp": "2025-05-09T17:55:38Z",
          "tree_id": "daf4e975af34c393c1bbb1d6c314d7cd42c0fae4",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/904ed3de53f7e334feb0888be7523579e55b147b"
        },
        "date": 1746818514102,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18135.053983000034,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14500.449171 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 4918378469,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 201041861,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 25750.64859600002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 20013.101894 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 70139.79743600001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 70139799000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4298.323681000056,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3728.7703930000002 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11534.304155,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11534305000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2325.19",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
          "id": "cd3eb1bf0dae859e0a3b3f3a706df7d35b7be6a9",
          "message": "fix(cli): remove extra .split (#14170)\n\nIt is already parsed in the sequencers command\nfixes: https://github.com/AztecProtocol/aztec-packages/issues/14167",
          "timestamp": "2025-05-09T18:11:16Z",
          "tree_id": "58900f65b3ed2d9569d416dcb23b9e98ee350df1",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/cd3eb1bf0dae859e0a3b3f3a706df7d35b7be6a9"
        },
        "date": 1746818527840,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24356,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1775,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 78304,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2214,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 20919,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2361,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 69162,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3009,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14493,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1077,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 48571,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1743,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 17696,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1268,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58245,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1899,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12508,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1041,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 42252,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1692,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21492,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1612,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 72567,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2144,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 13983,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1095,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 48031,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1707,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13305,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1063,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 44644,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1705,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
          "distinct": false,
          "id": "904ed3de53f7e334feb0888be7523579e55b147b",
          "message": "chore(bb.js): remove plonk utils (#14180)",
          "timestamp": "2025-05-09T17:55:38Z",
          "tree_id": "daf4e975af34c393c1bbb1d6c314d7cd42c0fae4",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/904ed3de53f7e334feb0888be7523579e55b147b"
        },
        "date": 1746818530008,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24224,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1789,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 77814,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2294,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 21142,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2338,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 67622,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3087,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14370,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1082,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 49463,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1675,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 17798,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1302,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 57826,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1866,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12285,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1023,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 42343,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1596,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21707,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1612,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 71009,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2163,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14116,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1097,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 48339,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1718,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13215,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1062,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 44874,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1679,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
          "id": "27eed71c797f86e2190e14bb95290d3c73131564",
          "message": "feat!: use given lengths to trim emitted logs (#14041)\n\n- All types of logs (private, public, contract class) will now be\nemitted from the contracts with a length. The base rollup will include\nthe logs to the blobs based on the specified length.\n\nRefactoring:\n- Change the prefixes of side effects in blobs to be the number of items\ninstead of the total fields of all items. It's cheaper to compute and\neasier to deserialise.\n- Remove `counter` from `LogHash` when outputted from private tail.\nCounter is only required when processing in private. We used to set it\nto 0 when exposing to public.\n\nRenaming:\n- Rename `[PUBLIC/CONTRACT_CLASS]_LOG_DATA_SIZE_IN_FIELDS ` to\n`[PUBLIC/CONTRACT_CLASS]_LOG_SIZE_IN_FIELDS ` to be consistent with\n`PRIVATE_LOG_SIZE_IN_FIELDS`.\n- Rename `[PUBLIC/CONTRACT_CLASS]_LOG_SIZE_IN_FIELDS ` to\n`[PUBLIC/CONTRACT_CLASS]_LOG_LENGTH` because other constants for a\nstruct's total number of fields are named `[...]_LENGTH`.",
          "timestamp": "2025-05-09T19:33:39Z",
          "tree_id": "1c8977b580d267bda7f41122d1dba607ad9bb4b0",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/27eed71c797f86e2190e14bb95290d3c73131564"
        },
        "date": 1746821935049,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17862.829740999812,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14337.4586 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 4935151919,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 199099954,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 25289.27617799991,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19970.916192 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 69747.803212,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 69747805000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4303.738829000167,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3674.416387 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11591.950805,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11591954000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2325.19",
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
          "id": "27eed71c797f86e2190e14bb95290d3c73131564",
          "message": "feat!: use given lengths to trim emitted logs (#14041)\n\n- All types of logs (private, public, contract class) will now be\nemitted from the contracts with a length. The base rollup will include\nthe logs to the blobs based on the specified length.\n\nRefactoring:\n- Change the prefixes of side effects in blobs to be the number of items\ninstead of the total fields of all items. It's cheaper to compute and\neasier to deserialise.\n- Remove `counter` from `LogHash` when outputted from private tail.\nCounter is only required when processing in private. We used to set it\nto 0 when exposing to public.\n\nRenaming:\n- Rename `[PUBLIC/CONTRACT_CLASS]_LOG_DATA_SIZE_IN_FIELDS ` to\n`[PUBLIC/CONTRACT_CLASS]_LOG_SIZE_IN_FIELDS ` to be consistent with\n`PRIVATE_LOG_SIZE_IN_FIELDS`.\n- Rename `[PUBLIC/CONTRACT_CLASS]_LOG_SIZE_IN_FIELDS ` to\n`[PUBLIC/CONTRACT_CLASS]_LOG_LENGTH` because other constants for a\nstruct's total number of fields are named `[...]_LENGTH`.",
          "timestamp": "2025-05-09T19:33:39Z",
          "tree_id": "1c8977b580d267bda7f41122d1dba607ad9bb4b0",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/27eed71c797f86e2190e14bb95290d3c73131564"
        },
        "date": 1746821948654,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24693,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1771,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 78840,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2267,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 21698,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2336,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 70118,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3064,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14628,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1079,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 48266,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1664,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 17777,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1263,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 57593,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1786,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12952,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1033,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 42414,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1674,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 22371,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1657,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 73451,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2110,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14347,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1116,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 48249,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1650,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13118,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1056,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 43956,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1732,
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
          "id": "b67afe429d431c7516b95f9c6d1b6e358907ef33",
          "message": "git subrepo push --branch=master noir-projects/aztec-nr\n\nsubrepo:\n  subdir:   \"noir-projects/aztec-nr\"\n  merged:   \"8676744a84\"\nupstream:\n  origin:   \"https://github.com/AztecProtocol/aztec-nr\"\n  branch:   \"master\"\n  commit:   \"8676744a84\"\ngit-subrepo:\n  version:  \"0.4.6\"\n  origin:   \"???\"\n  commit:   \"???\"",
          "timestamp": "2025-05-10T02:30:39Z",
          "tree_id": "fc0a9f6a101169b74e3f2236ae617fa5dc603e86",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/b67afe429d431c7516b95f9c6d1b6e358907ef33"
        },
        "date": 1746846268756,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24389,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1798,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 78184,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2289,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 20783,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2319,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 67858,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3068,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14450,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1081,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 48273,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1701,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 17885,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1308,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 57916,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1821,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12758,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1030,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 42448,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1668,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21730,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1617,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 71365,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2111,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14440,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1079,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 48005,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1674,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13253,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1057,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 44201,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1731,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
          "distinct": false,
          "id": "62df16a67e7b078b0e9d319517f8caff50c9afb6",
          "message": "refactor: fetch chain id and version once for all blocks (#13909)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\nline.",
          "timestamp": "2025-05-12T10:14:08Z",
          "tree_id": "0b5036b362830bfbd04b54d1fdebf9124e39893f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/62df16a67e7b078b0e9d319517f8caff50c9afb6"
        },
        "date": 1747047306211,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24224,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1755,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 77273,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2289,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 21149,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2303,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 67985,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3071,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14541,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1077,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 48743,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1691,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 18032,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1266,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 59005,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1834,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12621,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1032,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 42184,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1535,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21611,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1655,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 71392,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2116,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14528,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1097,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 48387,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1645,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13372,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1057,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 45000,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1678,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
          "distinct": false,
          "id": "e04e34923fd7c2d92c1626b6631ca6faab0d3690",
          "message": "feat: add experimental utility call interfaces and use them with `env.simulate_utility` txe tests (#14181)\n\nThis does not affect users not calling this via the TXe, as there is no\nAPI to call the actual interface on the call interface itself.\n\nThis simply allows for the macro to expose the UtilityCallInterface, so\nwe can have parity when writing TXe tests.",
          "timestamp": "2025-05-12T10:23:32Z",
          "tree_id": "0e7dc43507498da3b76b270bc80a1e0ce2d21c02",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e04e34923fd7c2d92c1626b6631ca6faab0d3690"
        },
        "date": 1747050643727,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24173,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1783,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 78979,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2204,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 20946,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2337,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 68421,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3093,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14881,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1074,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 49376,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1736,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 17915,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1269,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58728,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1887,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12623,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1010,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 43180,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1634,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21891,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1653,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 71734,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2093,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14631,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1099,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 49373,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1654,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13441,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1055,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 44764,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1820,
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
          "id": "09fc599f3cf35e9821be67b58c94475e6b142b6b",
          "message": "feat: RAM/ROM tables handler in SMT verification module (#14150)\n\nThis pr adds a mechanism to handle RAM/ROM tables in SMT Verification\nmodule\n\n# UltraCircuit\n\n- Fixed `bool_gate` handler\n- Added `fix_witness` gate handler\n- tables' sizes are now stored\n- Fixed an optimization issue: now all the entries of `XOR` and `AND`\nare properly bounded\n\n- `handle_aux_relation` - adds non native field arithmetic constraints\nto solver\n- `handle_rom_tables`, `handle_ram_tables` - adds memory constraints to\nsolver\n\n- Added tests to verify that all the new mechanisms work fine\n\n\n# Minor changes\n\n## CircuitBase\n\n- now all the ultra related stuff is not handled in the base class\n- public inputs are now  set for optimization and relaxation purposes\n\n## Circuit Schema && CircuitBuilder\n\n- Added RAM/ROM tables export\n\n## Solver\n\n- Fixed set representation",
          "timestamp": "2025-05-12T12:49:58Z",
          "tree_id": "d14a90125fcc5c6f5ca39d177941c818a582cd1f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/09fc599f3cf35e9821be67b58c94475e6b142b6b"
        },
        "date": 1747057936594,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17845.63974900004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14279.271658 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 4794679770,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 202710280,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 25546.753773999968,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19921.816584999997 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 70069.704902,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 70069705000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4340.523184000062,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3586.0007940000005 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11551.592191000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11551594000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2205.19",
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
          "id": "09fc599f3cf35e9821be67b58c94475e6b142b6b",
          "message": "feat: RAM/ROM tables handler in SMT verification module (#14150)\n\nThis pr adds a mechanism to handle RAM/ROM tables in SMT Verification\nmodule\n\n# UltraCircuit\n\n- Fixed `bool_gate` handler\n- Added `fix_witness` gate handler\n- tables' sizes are now stored\n- Fixed an optimization issue: now all the entries of `XOR` and `AND`\nare properly bounded\n\n- `handle_aux_relation` - adds non native field arithmetic constraints\nto solver\n- `handle_rom_tables`, `handle_ram_tables` - adds memory constraints to\nsolver\n\n- Added tests to verify that all the new mechanisms work fine\n\n\n# Minor changes\n\n## CircuitBase\n\n- now all the ultra related stuff is not handled in the base class\n- public inputs are now  set for optimization and relaxation purposes\n\n## Circuit Schema && CircuitBuilder\n\n- Added RAM/ROM tables export\n\n## Solver\n\n- Fixed set representation",
          "timestamp": "2025-05-12T12:49:58Z",
          "tree_id": "d14a90125fcc5c6f5ca39d177941c818a582cd1f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/09fc599f3cf35e9821be67b58c94475e6b142b6b"
        },
        "date": 1747057951234,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 23956,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1767,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 76640,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2260,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 20817,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2305,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 66936,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3024,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14435,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1078,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 48625,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1717,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 18054,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1269,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 59303,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1881,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12585,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1032,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 41512,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1730,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21528,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1656,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 71554,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2080,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14187,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1081,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 48242,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1753,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13249,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1056,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 45457,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1767,
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
          "id": "34eaa0ee0d80e56f9bb7d000c2f38cef57a1165f",
          "message": "fix(bb): honour CRS_PATH env var (#14208)",
          "timestamp": "2025-05-12T13:05:20Z",
          "tree_id": "ef4a34cfe586fb40d50aad19f9c1f78ec29cee1f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/34eaa0ee0d80e56f9bb7d000c2f38cef57a1165f"
        },
        "date": 1747058869546,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17979.92001900002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14206.220984 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 4775372052,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 195906730,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 25492.76774000009,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19900.669847 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 70086.37886999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 70086381000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4352.944562000175,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3701.3590960000006 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11635.914372999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11635916000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2205.19",
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
          "id": "34eaa0ee0d80e56f9bb7d000c2f38cef57a1165f",
          "message": "fix(bb): honour CRS_PATH env var (#14208)",
          "timestamp": "2025-05-12T13:05:20Z",
          "tree_id": "ef4a34cfe586fb40d50aad19f9c1f78ec29cee1f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/34eaa0ee0d80e56f9bb7d000c2f38cef57a1165f"
        },
        "date": 1747058882259,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24388,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1773,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 77150,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2269,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 20999,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2315,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 67357,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3084,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14583,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1074,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 48890,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1753,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 18043,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1307,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58496,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1905,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12744,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1028,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 41538,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1651,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21802,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1617,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 71150,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2068,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14445,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1096,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 48990,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1684,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13480,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1096,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 44403,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1730,
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
          "id": "a5914ce8b250876fc53ce681c4c56b4affe35eb6",
          "message": "chore: Deflake e2e sentinel test (#14190)\n\nFound and fixed another flake. Stats for attestors are not collected in\nslots where no block proposal was seen, so history was shorter than\nexpected for those.",
          "timestamp": "2025-05-12T14:00:05Z",
          "tree_id": "9248cec3350437e207b7bc1bb74086650bea4a0d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a5914ce8b250876fc53ce681c4c56b4affe35eb6"
        },
        "date": 1747061677905,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24257,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1792,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 78534,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2198,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 21121,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2297,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 67850,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3033,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14574,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1077,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 48696,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1780,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 17934,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1272,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58214,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1839,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12651,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1027,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 42636,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1614,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21812,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1622,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 71339,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2230,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14551,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1081,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 48667,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1714,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13341,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1055,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 44573,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1698,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
          "id": "60dbe1a5a0287aebb51f41259dc2be0f90e30b62",
          "message": "chore: Bump Noir reference (#14055)\n\nAutomated pull of nightly from the\n[noir](https://github.com/noir-lang/noir) programming language, a\ndependency of Aztec.\nBEGIN_COMMIT_OVERRIDE\nfix: always type-check turbofish, and error when it's not allowed\n(https://github.com/noir-lang/noir/pull/8437)\nchore: Release Noir(1.0.0-beta.5)\n(https://github.com/noir-lang/noir/pull/7955)\nfeat(greybox_fuzzer): Parallel fuzz tests\n(https://github.com/noir-lang/noir/pull/8432)\nfix(ssa): Mislabeled instructions with side effects in\nEnableSideEffectsIf removal pass\n(https://github.com/noir-lang/noir/pull/8355)\nfeat: SSA pass impact report\n(https://github.com/noir-lang/noir/pull/8393)\nchore: bump external pinned commits\n(https://github.com/noir-lang/noir/pull/8433)\nchore: separate benchmarking from github actions more\n(https://github.com/noir-lang/noir/pull/7943)\nchore(fuzz): Break up the AST fuzzer `compare` module\n(https://github.com/noir-lang/noir/pull/8431)\nchore(fuzz): Rename `init_vs_final` to `min_vs_full`\n(https://github.com/noir-lang/noir/pull/8430)\nfix!: error on tuple mismatch\n(https://github.com/noir-lang/noir/pull/8424)\nchore: bump external pinned commits\n(https://github.com/noir-lang/noir/pull/8429)\nchore(acir): Test whether the predicate has an effect on slice\nintrinsics (https://github.com/noir-lang/noir/pull/8421)\nfeat(ssa): Mark transitively dead parameters during DIE\n(https://github.com/noir-lang/noir/pull/8254)\nfix(ssa_gen): Do not code gen fetching of empty arrays when initializing\nthe data bus (https://github.com/noir-lang/noir/pull/8426)\nchore: remove `.aztec-sync-commit`\n(https://github.com/noir-lang/noir/pull/8415)\nchore(test): Add more unit tests for\n`inline_functions_with_at_most_one_instruction`\n(https://github.com/noir-lang/noir/pull/8418)\nchore: add minor docs for interpreter\n(https://github.com/noir-lang/noir/pull/8397)\nfix: print slice composite types surrounded by parentheses\n(https://github.com/noir-lang/noir/pull/8412)\nfeat: Skip SSA passes that contain any of the given messages\n(https://github.com/noir-lang/noir/pull/8416)\nfix: disable range constraints using the predicate\n(https://github.com/noir-lang/noir/pull/8396)\nchore: bumping external libraries\n(https://github.com/noir-lang/noir/pull/8406)\nchore: redo typo PR by shystrui1199\n(https://github.com/noir-lang/noir/pull/8405)\nfeat(test): add `nargo_fuzz_target`\n(https://github.com/noir-lang/noir/pull/8308)\nfix: allow names to collide in the values/types namespaces\n(https://github.com/noir-lang/noir/pull/8286)\nfix: Fix sequencing of side-effects in lvalue\n(https://github.com/noir-lang/noir/pull/8384)\nfeat(greybox_fuzzer): Maximum executions parameter added\n(https://github.com/noir-lang/noir/pull/8390)\nfix: warn on and discard unreachable statements after break and continue\n(https://github.com/noir-lang/noir/pull/8382)\nfix: add handling for u128 infix ops in interpreter\n(https://github.com/noir-lang/noir/pull/8392)\nchore: move acirgen tests into separate file\n(https://github.com/noir-lang/noir/pull/8376)\nfeat(fuzz): initial version of comptime vs brillig target for AST fuzzer\n(https://github.com/noir-lang/noir/pull/8335)\nchore: apply lints to `ast_fuzzer`\n(https://github.com/noir-lang/noir/pull/8386)\nchore: add note on AI generated PRs in `CONTRIBUTING.md`\n(https://github.com/noir-lang/noir/pull/8385)\nchore: document flattening pass\n(https://github.com/noir-lang/noir/pull/8312)\nfix: comptime shift-right overflow is zero\n(https://github.com/noir-lang/noir/pull/8380)\nfeat: let static_assert accept any type for its message\n(https://github.com/noir-lang/noir/pull/8322)\nfix(expand): output safety comment before statements\n(https://github.com/noir-lang/noir/pull/8378)\nchore: avoid need to rebuild after running tests\n(https://github.com/noir-lang/noir/pull/8379)\nchore: bump dependencies (https://github.com/noir-lang/noir/pull/8372)\nchore: Add GITHUB_TOKEN to cross build\n(https://github.com/noir-lang/noir/pull/8370)\nchore: redo typo PR by GarmashAlex\n(https://github.com/noir-lang/noir/pull/8364)\nchore: remove unsafe code from greybox fuzzer\n(https://github.com/noir-lang/noir/pull/8315)\nfeat: add `--fuzz-timeout` to `nargo test` options\n(https://github.com/noir-lang/noir/pull/8326)\nchore: bump external pinned commits\n(https://github.com/noir-lang/noir/pull/8334)\nfix(expand): try to use \"Self\" in function calls\n(https://github.com/noir-lang/noir/pull/8353)\nfix: Fix evaluation order of assignments with side-effects in their rhs\n(https://github.com/noir-lang/noir/pull/8342)\nfix: let comptime Field value carry the field's sign\n(https://github.com/noir-lang/noir/pull/8343)\nfix: Ordering of items in callstacks\n(https://github.com/noir-lang/noir/pull/8338)\nchore: add snapshosts for nargo expand tests\n(https://github.com/noir-lang/noir/pull/8318)\nfix(ownership): Clone global arrays\n(https://github.com/noir-lang/noir/pull/8328)\nchore: Replace all SSA interpreter panics with error variants\n(https://github.com/noir-lang/noir/pull/8311)\nfeat: Metamorphic AST fuzzing\n(https://github.com/noir-lang/noir/pull/8299)\nfix: fix some Display implementations for AST nodes\n(https://github.com/noir-lang/noir/pull/8316)\nchore: remove leftover file\n(https://github.com/noir-lang/noir/pull/8313)\nfix: uses non-zero points with ec-add-unsafe\n(https://github.com/noir-lang/noir/pull/8248)\nEND_COMMIT_OVERRIDE\n\n---------\n\nCo-authored-by: AztecBot <tech@aztecprotocol.com>\nCo-authored-by: Tom French <15848336+TomAFrench@users.noreply.github.com>",
          "timestamp": "2025-05-12T14:45:07Z",
          "tree_id": "47cde8e9ec89c713527d7a8ca7927728fc44acc8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/60dbe1a5a0287aebb51f41259dc2be0f90e30b62"
        },
        "date": 1747065438557,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24414,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1770,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 78910,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2198,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 20853,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2325,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 67735,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3126,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14456,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1076,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 49450,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1710,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 17873,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1266,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58150,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1876,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12764,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1003,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 43042,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1658,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21672,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1620,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 71577,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2199,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14313,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1078,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 48952,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1659,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13277,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1055,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 45090,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1693,
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
          "id": "4fe0c9afc4cb91d45f3068b96001e5833550fda2",
          "message": "feat: translator merge consistency check!  (#14098)\n\nEnsure final merge and translator operate on the same op queue by\nvalidating the full table commitments received by the final merge\nverifier and the witness commitments in translator verifier\ncorresponding to the op queue. To achieve this with shifts working\ncorrectly in translator, we need to introduce functionality that adds\ndata to the ultra version of the op queue without affecting vm\noperations, currently just a no-op operation.",
          "timestamp": "2025-05-12T15:47:39Z",
          "tree_id": "f20beac57382c5d07a8b50217e409b5e910c8140",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/4fe0c9afc4cb91d45f3068b96001e5833550fda2"
        },
        "date": 1747066931916,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18111.255883000238,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14490.940341 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 4811498386,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 195896245,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 25822.724235000125,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 20260.386547 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 69423.12440399999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 69423124000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4336.421771000005,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3747.5042259999996 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11444.02837,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11444029000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2253.19",
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
          "id": "4fe0c9afc4cb91d45f3068b96001e5833550fda2",
          "message": "feat: translator merge consistency check!  (#14098)\n\nEnsure final merge and translator operate on the same op queue by\nvalidating the full table commitments received by the final merge\nverifier and the witness commitments in translator verifier\ncorresponding to the op queue. To achieve this with shifts working\ncorrectly in translator, we need to introduce functionality that adds\ndata to the ultra version of the op queue without affecting vm\noperations, currently just a no-op operation.",
          "timestamp": "2025-05-12T15:47:39Z",
          "tree_id": "f20beac57382c5d07a8b50217e409b5e910c8140",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/4fe0c9afc4cb91d45f3068b96001e5833550fda2"
        },
        "date": 1747066944374,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24361,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1792,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 79088,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2301,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 21003,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2299,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 67950,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3119,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14948,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1077,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 49837,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1756,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 18606,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1310,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 60034,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1913,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12724,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1006,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 43246,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1633,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21589,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1621,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 71353,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2174,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14694,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1096,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 49826,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1652,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13950,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1096,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 46751,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1702,
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
          "id": "09a0b71b998eee81bdbd2c37a579ccd56f413f6d",
          "message": "fix: don't call noir_sync just to clean noir folder (#14193)\n\nWe have a chicken and egg problem cleaning noir right now",
          "timestamp": "2025-05-12T16:49:57Z",
          "tree_id": "eab0d413072e1cb6af76a50bee22df6fca206dad",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/09a0b71b998eee81bdbd2c37a579ccd56f413f6d"
        },
        "date": 1747071767463,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24377,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1771,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 79120,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2255,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 21033,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2306,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 67995,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3138,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14606,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1082,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 48394,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1768,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 17916,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1269,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58260,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1836,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12726,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1029,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 43343,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1635,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21818,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1658,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 71211,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2153,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14365,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1080,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 48181,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1662,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13419,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1055,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 44750,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1612,
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
          "id": "1318fb4e5320b4bd61d5f40b5c44bcc7e365d872",
          "message": "chore(rollup): add function to trigger seed snapshot for next epoch (#13910)\n\n## Overview\nAdds cli arg to set the seed for the next epoch, much cheaper than\nperforming the whole sampling",
          "timestamp": "2025-05-12T17:12:52Z",
          "tree_id": "e490d86931d02601676697297561560423ed4b00",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1318fb4e5320b4bd61d5f40b5c44bcc7e365d872"
        },
        "date": 1747074050092,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 23901,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1773,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 76741,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2272,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 20848,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2316,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 67378,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3078,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14488,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1079,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 49961,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1671,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 17793,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1306,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 57930,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1878,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12557,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1029,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 41796,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1680,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21548,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1623,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 70708,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2088,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14220,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1096,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 49098,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1674,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13041,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1054,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 44293,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1753,
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
          "id": "eda5cc8f20cd5acf14d1d0513234e86dbc13875f",
          "message": "fix: Delete txs and attestations from p2p pool on finalized blocks (#14200)\n\nInstead of relying on config variables for choosing how long to keep\nproven txs and attestations, rely on finalized blocks instead.\n\n**Breaking**: Removes env vars `P2P_TX_POOL_KEEP_PROVEN_FOR` and\n`P2P_ATTESTATION_POOL_KEEP_FOR` (cc @devrel).\n    \nFixes #13575",
          "timestamp": "2025-05-12T18:24:09Z",
          "tree_id": "067801c2d4fddc7239604c8b47c8d7a0bc32f71c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/eda5cc8f20cd5acf14d1d0513234e86dbc13875f"
        },
        "date": 1747076320828,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 23953,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1810,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 76804,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2269,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 20835,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2288,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 67079,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3110,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14466,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1075,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 48829,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1670,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 17853,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1307,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58062,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1784,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12444,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1028,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 41638,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1699,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21551,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1616,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 71461,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2141,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14329,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1077,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 48373,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1623,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13375,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1056,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 44495,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1667,
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
          "id": "c9d894c2f7e38d4e7b9f4a63865629111bca31ee",
          "message": "chore: Fix l1-reorg e2e flakes (#14218)\n\nAttempted fixes for:\n\n```\n13:15:46  FAIL  src/e2e_epochs/epochs_l1_reorgs.test.ts (322.03 s)\n13:15:46   e2e_epochs/epochs_l1_reorgs\n13:15:46     ✓ prunes L2 blocks if a proof is removed due to an L1 reorg (77417 ms)\n13:15:46     ✓ does not prune if a second proof lands within the submission window after the first one is reorged out (68186 ms)\n13:15:46     ✕ restores L2 blocks if a proof is added due to an L1 reorg (72522 ms)\n13:15:46     ✓ prunes L2 blocks from pending chain removed from L1 due to an L1 reorg (48771 ms)\n13:15:46     ✓ sees new blocks added in an L1 reorg (48871 ms)\n13:15:46     ○ skipped updates cross-chain messages changed due to an L1 reorg\n13:15:46 \n13:15:46   ● e2e_epochs/epochs_l1_reorgs › restores L2 blocks if a proof is added due to an L1 reorg\n13:15:46 \n13:15:46     expect(received).resolves.toEqual(expected) // deep equality\n13:15:46 \n13:15:46     Expected: 2\n13:15:46     Received: 0\n13:15:46 \n13:15:46       149 |     // And so the node undoes its reorg\n13:15:46       150 |     await retryUntil(() => node.getBlockNumber().then(b => b === monitor.l2BlockNumber), 'node sync', syncTimeout, 0.1);\n13:15:46     > 151 |     await expect(node.getProvenBlockNumber()).resolves.toEqual(monitor.l2ProvenBlockNumber);\n13:15:46           |                                                        ^\n13:15:46       152 |\n13:15:46       153 |     logger.warn(`Test succeeded`);\n13:15:46       154 |   });\n13:15:46 \n13:15:46       at Object.toEqual (../../node_modules/expect/build/index.js:174:22)\n13:15:46       at Object.toEqual (e2e_epochs/epochs_l1_reorgs.test.ts:151:56)\n```\n\n(link to run [here](http://ci.aztec-labs.com/46d88c7dd30334d2))\n\n```\n10:34:18  FAIL  src/e2e_epochs/epochs_l1_reorgs.test.ts\n10:34:18   e2e_epochs/epochs_l1_reorgs\n10:34:18     ✕ prunes L2 blocks if a proof is removed due to an L1 reorg (45473 ms)\n10:34:18     ✓ does not prune if a second proof lands within the submission window after the first one is reorged out (68275 ms)\n10:34:18     ✓ restores L2 blocks if a proof is added due to an L1 reorg (73214 ms)\n10:34:18     ✓ prunes L2 blocks from pending chain removed from L1 due to an L1 reorg (48365 ms)\n10:34:18     ✓ sees new blocks added in an L1 reorg (48927 ms)\n10:34:18     ○ skipped updates cross-chain messages changed due to an L1 reorg\n10:34:18 \n10:34:18   ● e2e_epochs/epochs_l1_reorgs › prunes L2 blocks if a proof is removed due to an L1 reorg\n10:34:18 \n10:34:18     expect(received).toEqual(expected) // deep equality\n10:34:18 \n10:34:18     Expected: 0\n10:34:18     Received: 2\n10:34:18 \n10:34:18       59 |     await context.cheatCodes.eth.reorg(2);\n10:34:18       60 |     await monitor.run();\n10:34:18     > 61 |     expect(monitor.l2ProvenBlockNumber).toEqual(0);\n10:34:18          |                                         ^\n10:34:18       62 |\n10:34:18       63 |     // Wait until the end of the proof submission window for the first epoch\n10:34:18       64 |     await test.waitUntilEndOfProofSubmissionWindow(0);\n10:34:18 \n10:34:18       at Object.toEqual (e2e_epochs/epochs_l1_reorgs.test.ts:61:41)\n```\n\n(link to run [here](http://ci.aztec-labs.com/acafe11a371dc863))",
          "timestamp": "2025-05-12T18:30:57Z",
          "tree_id": "66dd3dac1a10071920a73e5f7b50501fb3ceabb0",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c9d894c2f7e38d4e7b9f4a63865629111bca31ee"
        },
        "date": 1747077125985,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24150,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1770,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 77809,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2264,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 21194,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2315,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 67632,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3080,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14709,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1078,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 48200,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1727,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 17935,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1302,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 59057,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1866,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12651,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1029,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 41902,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1704,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21727,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1657,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 71042,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2137,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14545,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1080,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 47571,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1666,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13321,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1060,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 45872,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1715,
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
          "id": "bbc532c663d7ff342420bba6ed00875a263f2039",
          "message": "chore: Fix flake in validator sentinel (#14232)\n\nFixes flake\n\n```\n17:54:55  FAIL  src/e2e_p2p/validators_sentinel.test.ts\n17:54:55   e2e_p2p_validators_sentinel\n17:54:55     with an offline validator\n17:54:55       ✓ collects stats on offline validator (7 ms)\n17:54:55       ✓ collects stats on a block builder (3 ms)\n17:54:55       ✓ collects stats on an attestor (6 ms)\n17:54:55       ✕ starts a sentinel on a fresh node (48514 ms)\n17:54:55 \n17:54:55   ● e2e_p2p_validators_sentinel › with an offline validator › starts a sentinel on a fresh node\n17:54:55 \n17:54:55     expect(received).toBeGreaterThan(expected)\n17:54:55 \n17:54:55     Expected: > 1\n17:54:55     Received:   1\n17:54:55 \n17:54:55       162 |       expect(stats.stats[newNodeValidator]).toBeDefined();\n17:54:55       163 |       expect(stats.stats[newNodeValidator].history.length).toBeGreaterThanOrEqual(1);\n17:54:55     > 164 |       expect(Object.keys(stats.stats).length).toBeGreaterThan(1);\n17:54:55           |                                               ^\n17:54:55       165 |     });\n17:54:55       166 |   });\n17:54:55       167 | });\n17:54:55 \n17:54:55       at Object.toBeGreaterThan (e2e_p2p/validators_sentinel.test.ts:164:47)\n```",
          "timestamp": "2025-05-12T19:22:07Z",
          "tree_id": "2c03c9404d78944254554065345b1ba5f14d0fe2",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/bbc532c663d7ff342420bba6ed00875a263f2039"
        },
        "date": 1747080333287,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24576,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1779,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 79266,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2288,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 20736,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2336,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 67395,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3066,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14744,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1074,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 49799,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1676,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 18034,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1305,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 60192,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1881,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12741,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1031,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 43847,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1635,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21656,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1622,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 71399,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2103,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14490,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1078,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 49427,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1669,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13400,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1056,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 45761,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1709,
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
          "id": "55c4136cec17c1fc2e12a73073ed61ecfaa75e45",
          "message": "chore: nuke validator add cheatcode (#14191)\n\nFixes #12050.\n\nAdds a tiny `MultiAdder` that can be used to add a bunch of validators\nat once. I could be done similarly with a multicall and a proxy, but\nthis seemed the simplest for my case.",
          "timestamp": "2025-05-12T21:17:59Z",
          "tree_id": "45aaf796af94d8c886a9d8f5f94d9d870c2dedbe",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/55c4136cec17c1fc2e12a73073ed61ecfaa75e45"
        },
        "date": 1747087152878,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24073,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1778,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 77616,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2269,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 20934,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2299,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 67233,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3032,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14543,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1075,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 48811,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1695,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 17938,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1304,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 59204,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1818,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12438,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1029,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 41164,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1634,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21603,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1618,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 70842,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2213,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14407,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1076,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 48397,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1707,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13232,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1059,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 45415,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1720,
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
          "id": "39f837c2cebc3739036dab6290c0017d1bd9f538",
          "message": "git subrepo push --branch=master noir-projects/aztec-nr\n\nsubrepo:\n  subdir:   \"noir-projects/aztec-nr\"\n  merged:   \"e851b303b5\"\nupstream:\n  origin:   \"https://github.com/AztecProtocol/aztec-nr\"\n  branch:   \"master\"\n  commit:   \"e851b303b5\"\ngit-subrepo:\n  version:  \"0.4.6\"\n  origin:   \"???\"\n  commit:   \"???\"",
          "timestamp": "2025-05-13T02:32:36Z",
          "tree_id": "6dbfcf796432382b5faddc9dd653905fda1314ed",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/39f837c2cebc3739036dab6290c0017d1bd9f538"
        },
        "date": 1747105547198,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24684,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1787,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 79450,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2290,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 21649,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2276,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 69469,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3072,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 15386,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1079,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 49728,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1752,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 18813,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1268,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 60136,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1911,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 13030,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1004,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 42568,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1672,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 22192,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1654,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 72878,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2120,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 15285,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1097,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 49356,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1631,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 14288,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1097,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 47193,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1757,
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
          "distinct": false,
          "id": "e8147081ccda54ea590b150b1b9584add99e2083",
          "message": "feat: remove extra pairing point aggregation batch_mul (#14219)\n\nCloses https://github.com/AztecProtocol/barretenberg/issues/1325.\n\nWe are currently doing pairing point aggregation with a batchmul of size\n1 in operator* and then another batchmul of size 2 in operator+. If we\njust directly do it, we can do it with just 1 batchmul of size 2. This\ndrops the number of transcript rows in the ECCVM, but doesn't affect the\nactual number of rows because the MSM builder row count dominates it by\na significant margin.",
          "timestamp": "2025-05-13T10:29:27Z",
          "tree_id": "550262948cc8af2ee7a5c85722a7807d033b7789",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e8147081ccda54ea590b150b1b9584add99e2083"
        },
        "date": 1747135845713,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17944.50011200024,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14361.227357 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 4225752177,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 194149930,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 22736.383488999763,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17646.700360999996 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 62351.469452,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 62351470000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4244.289778000166,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3560.1811740000003 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11520.156697,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11520157000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2253.19",
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
          "id": "e8147081ccda54ea590b150b1b9584add99e2083",
          "message": "feat: remove extra pairing point aggregation batch_mul (#14219)\n\nCloses https://github.com/AztecProtocol/barretenberg/issues/1325.\n\nWe are currently doing pairing point aggregation with a batchmul of size\n1 in operator* and then another batchmul of size 2 in operator+. If we\njust directly do it, we can do it with just 1 batchmul of size 2. This\ndrops the number of transcript rows in the ECCVM, but doesn't affect the\nactual number of rows because the MSM builder row count dominates it by\na significant margin.",
          "timestamp": "2025-05-13T10:29:27Z",
          "tree_id": "550262948cc8af2ee7a5c85722a7807d033b7789",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e8147081ccda54ea590b150b1b9584add99e2083"
        },
        "date": 1747135863324,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24254,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1785,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 78744,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2234,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 21063,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2297,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 68167,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3045,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14590,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1081,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 48550,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1699,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 17868,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1301,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58042,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1926,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12218,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1030,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 41861,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1669,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21853,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1655,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 72179,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2155,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14101,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1076,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 47714,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1726,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13437,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1056,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 44183,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1760,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
          "distinct": false,
          "id": "5e0b14bd09aa2130797989f7773d31f4e2565f1c",
          "message": "chore: Bump Noir reference (#14233)\n\nAutomated pull of nightly from the\n[noir](https://github.com/noir-lang/noir) programming language, a\ndependency of Aztec.\nBEGIN_COMMIT_OVERRIDE\nfix: sign extend in signed cast\n(https://github.com/noir-lang/noir/pull/8264)\nchore(fuzz): Do not use zero length types in the main input output\n(https://github.com/noir-lang/noir/pull/8465)\nchore: fix visibility issues in test suite\n(https://github.com/noir-lang/noir/pull/8454)\nchore: blackbox functions for ssa intepreter\n(https://github.com/noir-lang/noir/pull/8375)\nfeat: improve bitshift codegen\n(https://github.com/noir-lang/noir/pull/8442)\nfix(ssa): Mark mutually recursive simple functions\n(https://github.com/noir-lang/noir/pull/8447)\nfix: Fix nested trait dispatch with associated types\n(https://github.com/noir-lang/noir/pull/8440)\nchore: carry visibilities in monomorphized AST\n(https://github.com/noir-lang/noir/pull/8439)\nchore(tests): Add regression for now passing test\n(https://github.com/noir-lang/noir/pull/8441)\nchore: use human-readable bytecode in snapshots\n(https://github.com/noir-lang/noir/pull/8164)\nchore: bump external pinned commits\n(https://github.com/noir-lang/noir/pull/8445)\nEND_COMMIT_OVERRIDE\n\n---------\n\nCo-authored-by: AztecBot <tech@aztecprotocol.com>\nCo-authored-by: Tom French <15848336+TomAFrench@users.noreply.github.com>",
          "timestamp": "2025-05-13T10:47:52Z",
          "tree_id": "5e6c2872d1f7ffb8acb86b7ede0eca788250ffb7",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5e0b14bd09aa2130797989f7773d31f4e2565f1c"
        },
        "date": 1747137021568,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24338,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1770,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 77606,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2241,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 21104,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2300,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 68357,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3144,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14617,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1076,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 48375,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1695,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 17939,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1271,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58217,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1850,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12300,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1027,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 40633,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1564,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21918,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1619,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 72347,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2132,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14131,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1098,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 47273,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1747,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13215,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1056,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 44352,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1731,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
          "id": "3aa76742d0b25f941daa2ae566d0beb9393e5061",
          "message": "fix: incorrectly computing l2 to l1 msg subtree root (#14240)\n\nFixes #14174\n\n@MirandaWood managed to figure out that we did not correctly compute the\nmessage subtree root for a tx with no messages.\n\nIn a followup PR I will merge the e2e_outbox and l2_to_l1 e2e tests as\nhaving them separated is purely a tech debt. I will also consider\ncleaning up `AztecNodeService.getL2ToL1MessageMembershipWitness`.",
          "timestamp": "2025-05-13T12:14:00Z",
          "tree_id": "d8b5d2b9b851aa1ce7a90abfaac54f6fdca024a1",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/3aa76742d0b25f941daa2ae566d0beb9393e5061"
        },
        "date": 1747142461974,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24133,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1771,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 76883,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2238,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 20869,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2336,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 68443,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3020,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14686,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1074,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 48318,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1671,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 18063,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1305,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 59069,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1760,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12234,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1028,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 40695,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1675,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21754,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1658,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 71641,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2118,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14107,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1077,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 47346,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1591,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13504,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1056,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 44870,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1711,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
          "distinct": false,
          "id": "0592163c0eef7e64a4f961b818923441b06dff43",
          "message": "chore: utility func attr without full path in the artifact (#13892)\n\nWith https://github.com/noir-lang/noir/issues/7912 issue now being\ntackled I remove the original workaround from the codebase. Getting rid\nof the full path from the ABI makes our TS codebase cleaner.\n\n~Currently blocked by https://github.com/noir-lang/noir/issues/8255~",
          "timestamp": "2025-05-13T13:14:25Z",
          "tree_id": "4eca4b6fc764281463662607ceb3dd3787768df8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0592163c0eef7e64a4f961b818923441b06dff43"
        },
        "date": 1747143903407,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24074,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1768,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 78955,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2263,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 21001,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2298,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 68743,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3095,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14471,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1080,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 48832,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1713,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 17798,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1304,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58467,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1883,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12501,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1044,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 41499,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1674,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21730,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1616,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 72069,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2124,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14218,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1078,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 48254,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1724,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13195,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1058,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 45030,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1687,
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
          "id": "8ca9cda6c42c4461f303eed2d94542fc2d9564ee",
          "message": "chore: enable zk-related relation correctness tests in Translator and better handling of const sizes (#14224)\n\nWe merged a micro-optimisation of initialising Translator\nProverPolynomials strictly on their actual mini circuit size. This gets\nin the way of being able to hide such polynomials and, in fact, the\nability to run ZK correctly (hence having the relation correctness tests\nwith zk commented out). As this optimisation is not necessary to ensure\nTranslator is within the WASM memory limits, we roll back to having the\npolynomials initialised on the appropriate fixed sizes. I also attempted\nto cleanup up our initialisation of mini and dyadic circuit size with\nconstants within Translator.",
          "timestamp": "2025-05-13T13:58:19Z",
          "tree_id": "02a3456b2308fec31318c65909f5c275e63a6638",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8ca9cda6c42c4461f303eed2d94542fc2d9564ee"
        },
        "date": 1747148585600,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18339.779787000225,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14435.999731 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 4251726765,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 194172348,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 22793.52037300032,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17831.449424 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 63030.940619,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 63030942000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4310.025385999779,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3693.8447189999997 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11257.532366,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11257534000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2253.19",
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
          "id": "8ca9cda6c42c4461f303eed2d94542fc2d9564ee",
          "message": "chore: enable zk-related relation correctness tests in Translator and better handling of const sizes (#14224)\n\nWe merged a micro-optimisation of initialising Translator\nProverPolynomials strictly on their actual mini circuit size. This gets\nin the way of being able to hide such polynomials and, in fact, the\nability to run ZK correctly (hence having the relation correctness tests\nwith zk commented out). As this optimisation is not necessary to ensure\nTranslator is within the WASM memory limits, we roll back to having the\npolynomials initialised on the appropriate fixed sizes. I also attempted\nto cleanup up our initialisation of mini and dyadic circuit size with\nconstants within Translator.",
          "timestamp": "2025-05-13T13:58:19Z",
          "tree_id": "02a3456b2308fec31318c65909f5c275e63a6638",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8ca9cda6c42c4461f303eed2d94542fc2d9564ee"
        },
        "date": 1747148599271,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24463,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1780,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 79598,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2258,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 21205,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2297,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 68466,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3096,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14747,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1084,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 48675,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1763,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 18154,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1309,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58724,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1923,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12754,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1015,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 42823,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1706,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21884,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1656,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 72076,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2181,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14355,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1106,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 48138,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1772,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13516,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1074,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 44609,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1689,
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
          "id": "344a3f53a32d329dfa7a48bb38f88e894e7326cf",
          "message": "fix: bad quoting in noir bootstrap (#14260)\n\nIt was breaking direct calls to noir/bootstrap.sh and release action",
          "timestamp": "2025-05-13T16:39:09+01:00",
          "tree_id": "2bc4bb41a9bf964450fbe77bc57e8a4328ae0097",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/344a3f53a32d329dfa7a48bb38f88e894e7326cf"
        },
        "date": 1747152146208,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24434,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1774,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 78115,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2296,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 21051,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2329,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 67899,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3072,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14919,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1077,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 49155,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1750,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 18208,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1306,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58792,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1833,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12738,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1034,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 41712,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1739,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21738,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1651,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 71644,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2171,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14332,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1107,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 48898,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1739,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13612,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1056,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 45161,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1755,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          }
        ]
      }
    ]
  }
}