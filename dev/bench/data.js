window.BENCHMARK_DATA = {
  "lastUpdate": 1746812629051,
  "repoUrl": "https://github.com/AztecProtocol/aztec-packages",
  "entries": {
    "C++ Benchmark": [
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
          "id": "30c2030c13c80df5c03f441139dde3387b0931cb",
          "message": "chore: better handling of ultra ops in translator circuit builder (#13990)\n\nThis PR attempts to improve clarity in the circuit builder and reduce\nthe size of existing methods by separating the logic that checks ultra\nops and the logic that populates corresponding wire data using the ultra\nop from other builder logic. This will additionally help code\nshareability in upcoming modifications. I also fixed the\n`TranslatorOpcodeConstraintRelation` as it was accepting some opcodes\nthat are not supported",
          "timestamp": "2025-05-06T13:39:06Z",
          "tree_id": "e42723a846cc88379cccfd442b0bb139ed4108ae",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/30c2030c13c80df5c03f441139dde3387b0931cb"
        },
        "date": 1746542558255,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24524,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1877,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 78324,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2330,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 21557,
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
            "value": 68378,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3038,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14780,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1189,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 50082,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1840,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 18252,
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
            "value": 59696,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1922,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12765,
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
            "value": 41645,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1763,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21494,
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
            "value": 70168,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2264,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14530,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1193,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 49233,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1800,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13615,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1172,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 45721,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1752,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
          "distinct": false,
          "id": "187c5fc4620336105d7341403b04ed619157f9a7",
          "message": "fix: goblin recursive bugs (#13124)\n\n* Pass `translation_evaluations` from ECCVM to Translator verifier\nwithout creating unconstrained witnesses\n* Remove `translation_evaluations` from `GoblinProof`.\n* Replace insecure `pow()` in ECCVM verifier with a squaring loop\n\n* Fix a bug in `dyadic_size()` method in `MegaTraceBlockData`.",
          "timestamp": "2025-05-06T15:44:11Z",
          "tree_id": "db5a14571c68d6f35b4caa143ea73878b4710b7a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/187c5fc4620336105d7341403b04ed619157f9a7"
        },
        "date": 1746548689422,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17929.04506700006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14211.737362 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2137687187,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 210013738,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 19956.508069999927,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17051.950348 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55084.247389,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55084248000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4413.101988000108,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3675.8103859999997 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11661.793704000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11661801000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2231.81",
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
          "distinct": false,
          "id": "187c5fc4620336105d7341403b04ed619157f9a7",
          "message": "fix: goblin recursive bugs (#13124)\n\n* Pass `translation_evaluations` from ECCVM to Translator verifier\nwithout creating unconstrained witnesses\n* Remove `translation_evaluations` from `GoblinProof`.\n* Replace insecure `pow()` in ECCVM verifier with a squaring loop\n\n* Fix a bug in `dyadic_size()` method in `MegaTraceBlockData`.",
          "timestamp": "2025-05-06T15:44:11Z",
          "tree_id": "db5a14571c68d6f35b4caa143ea73878b4710b7a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/187c5fc4620336105d7341403b04ed619157f9a7"
        },
        "date": 1746548703984,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24568,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1869,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 78489,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2372,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 21106,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2277,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 67800,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3030,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14914,
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
            "value": 49595,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1806,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 17948,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1379,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58917,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1962,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12578,
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
            "value": 41785,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1779,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21200,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1759,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 70179,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2253,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14413,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1191,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 49577,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1806,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13520,
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
            "value": 44589,
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
          "id": "f061a1003c1b36897996ba4e7770a0275e334b81",
          "message": "fix: Set and map keys should be strings (#13993)\n\nThis PR fixes a couple of instances of maps and sets that don't have\nstring keys.",
          "timestamp": "2025-05-06T17:00:05Z",
          "tree_id": "279c80d0ec4d97eb075bfff5c200935384af8e77",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f061a1003c1b36897996ba4e7770a0275e334b81"
        },
        "date": 1746553636051,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24761,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1876,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 79569,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2368,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 21357,
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
            "value": 68178,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3112,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14721,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1190,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 49296,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1818,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 17906,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1380,
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
            "value": 1947,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12684,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1135,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 42711,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1755,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21266,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1726,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 69996,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2293,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14265,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1191,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 48428,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1784,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13430,
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
            "value": 45123,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1739,
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
          "distinct": true,
          "id": "5f2097ce85f8aa4e934808a892442af97ed66735",
          "message": "feat: playground updates (#14103)\n\nSyncing from alpha-testnet\n\n---------\n\nCo-authored-by: thunkar <gregojquiros@gmail.com>\nCo-authored-by: Joe Andrews <joe@fuuzik.com>",
          "timestamp": "2025-05-06T20:03:14Z",
          "tree_id": "bdc29e2910af35e652055ac278df4426e6139dbf",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5f2097ce85f8aa4e934808a892442af97ed66735"
        },
        "date": 1746564598745,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24337,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1873,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 77662,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2419,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 21414,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2290,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 67496,
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
            "value": 14756,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1191,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 49149,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1837,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 18111,
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
            "value": 58914,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1922,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12430,
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
            "value": 41633,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1807,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21512,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1758,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 69813,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2286,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14496,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1209,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 48897,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1828,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13572,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1177,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 45367,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1795,
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
          "id": "a515ae8f76beaa47adb1071606846671b6f1eb22",
          "message": "feat!: Aggregate pairing points (#13972)\n\nCloses https://github.com/AztecProtocol/barretenberg/issues/1304.\nCloses https://github.com/AztecProtocol/barretenberg/issues/1069.\nCloses https://github.com/AztecProtocol/barretenberg/issues/801.\nCloses https://github.com/AztecProtocol/barretenberg/issues/1309.\nCloses https://github.com/AztecProtocol/barretenberg/issues/950.\nCloses https://github.com/AztecProtocol/barretenberg/issues/1021.\n\n- **Refactor how we aggregate.** Before, we used to pass in the input\npairing point object into functions as an argument, following how plonk\nhad done it. However, this is entirely unnecessary if we just aggregate\nthe output pairing points outside of it. For example, if function A\ncalls a recursive verifier, we will just do the aggregation in function\nA instead of inside the recursive verifier. The ordering of aggregation\ndoes not matter at all - as long as we are using valid recursion\nseparators, we should be fine.\n- **Add [[nodiscard]] attributes and remove [[maybe_unused]]\nattributes** to verify_proof calls to help us check for unused pairing\npoints.\n- **Aggregate properly everywhere.** We used to ignore pairing points in\nmost places, but now we try to aggregate everything properly. I tried to\nbe thorough in my search, but its possible that I missed somewhere.\n\nDue to the refactoring, we also close\nhttps://github.com/AztecProtocol/barretenberg/issues/1380, as we remove\n1 unnecessary aggregate call in almost all situations by avoiding\naggregation with a default object. Because of this, we drop the number\nof Ultra gates of the UltraRecursiveVerifier **from 730689 to 664852, a\ndrop of around 66k or 9%**.\n\n---------\n\nCo-authored-by: ledwards2225 <l.edwards.d@gmail.com>\nCo-authored-by: ludamad <domuradical@gmail.com>",
          "timestamp": "2025-05-06T22:24:38Z",
          "tree_id": "496a8eb56d8ebf71cbe018981ea0c7db4ecf9114",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a515ae8f76beaa47adb1071606846671b6f1eb22"
        },
        "date": 1746574666677,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17891.089436999664,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14296.511039 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 4849480558,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 201607984,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 25324.085436000132,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19974.872058999998 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 69807.942991,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 69807943000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4242.64736799978,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3682.0560460000006 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11481.310985,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11481315000 ms\nthreads: 1"
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
          "id": "a515ae8f76beaa47adb1071606846671b6f1eb22",
          "message": "feat!: Aggregate pairing points (#13972)\n\nCloses https://github.com/AztecProtocol/barretenberg/issues/1304.\nCloses https://github.com/AztecProtocol/barretenberg/issues/1069.\nCloses https://github.com/AztecProtocol/barretenberg/issues/801.\nCloses https://github.com/AztecProtocol/barretenberg/issues/1309.\nCloses https://github.com/AztecProtocol/barretenberg/issues/950.\nCloses https://github.com/AztecProtocol/barretenberg/issues/1021.\n\n- **Refactor how we aggregate.** Before, we used to pass in the input\npairing point object into functions as an argument, following how plonk\nhad done it. However, this is entirely unnecessary if we just aggregate\nthe output pairing points outside of it. For example, if function A\ncalls a recursive verifier, we will just do the aggregation in function\nA instead of inside the recursive verifier. The ordering of aggregation\ndoes not matter at all - as long as we are using valid recursion\nseparators, we should be fine.\n- **Add [[nodiscard]] attributes and remove [[maybe_unused]]\nattributes** to verify_proof calls to help us check for unused pairing\npoints.\n- **Aggregate properly everywhere.** We used to ignore pairing points in\nmost places, but now we try to aggregate everything properly. I tried to\nbe thorough in my search, but its possible that I missed somewhere.\n\nDue to the refactoring, we also close\nhttps://github.com/AztecProtocol/barretenberg/issues/1380, as we remove\n1 unnecessary aggregate call in almost all situations by avoiding\naggregation with a default object. Because of this, we drop the number\nof Ultra gates of the UltraRecursiveVerifier **from 730689 to 664852, a\ndrop of around 66k or 9%**.\n\n---------\n\nCo-authored-by: ledwards2225 <l.edwards.d@gmail.com>\nCo-authored-by: ludamad <domuradical@gmail.com>",
          "timestamp": "2025-05-06T22:24:38Z",
          "tree_id": "496a8eb56d8ebf71cbe018981ea0c7db4ecf9114",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a515ae8f76beaa47adb1071606846671b6f1eb22"
        },
        "date": 1746574680864,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24334,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1877,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 77672,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2280,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 20744,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2290,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 67577,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3116,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14676,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1199,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 49409,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1819,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 17954,
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
            "value": 58180,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1958,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12478,
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
            "value": 41276,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1656,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21748,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1723,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 72210,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2179,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14430,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1192,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 49287,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1812,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13386,
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
            "value": 44719,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1852,
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
          "id": "1ff4447bfbe6833b06243117955deccc01ec2955",
          "message": "git subrepo push --branch=master noir-projects/aztec-nr\n\nsubrepo:\n  subdir:   \"noir-projects/aztec-nr\"\n  merged:   \"25bc63e443\"\nupstream:\n  origin:   \"https://github.com/AztecProtocol/aztec-nr\"\n  branch:   \"master\"\n  commit:   \"25bc63e443\"\ngit-subrepo:\n  version:  \"0.4.6\"\n  origin:   \"???\"\n  commit:   \"???\"",
          "timestamp": "2025-05-07T02:32:07Z",
          "tree_id": "48a0f2a4a56b72378400e4bbb6bbf338806919df",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1ff4447bfbe6833b06243117955deccc01ec2955"
        },
        "date": 1746587200631,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24029,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1895,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 76652,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2309,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 20770,
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
            "value": 67029,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3122,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14710,
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
            "value": 49961,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1825,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 17820,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1379,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58008,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1941,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12286,
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
            "value": 40912,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1736,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21569,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1723,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 70986,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2290,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14238,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1207,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 48140,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1842,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13347,
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
            "value": 44629,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1855,
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
          "distinct": false,
          "id": "810053233e7bedacc38892dbdc873e46792f42c3",
          "message": "chore: run setupEpoch separately (#13984)\n\nFollowing the seed snapshots pr #13577 there was a change that mean that\n`getCurrentProposer` can end up running the `setupEpoch` (reducing\nnumber of different flows etc). However, that meant that when we were\nrunning our benchmark test to get some gas numbers, we never end up\nincluding the gas spent to setup the epoch. To address, we are now\nexplicitly calling `setupEpoch` such that we get some neat measurements\nfor it, also making it clear when changes are made that impact the\nsampling.\n\nA nice side effect, is that it more simply allow us to do the proper\namortized cost for sampling as the propose is for 360 tx, but sampling\nis for 11520 (32 * 360). This new setup makes it more simple to see the\ndirect impact from the sampling on tx costs etc.",
          "timestamp": "2025-05-07T07:40:09Z",
          "tree_id": "b00e0fa7fc47b729ef2f7a0c6eba4eb86deabdaa",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/810053233e7bedacc38892dbdc873e46792f42c3"
        },
        "date": 1746606092706,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24446,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1885,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 78497,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2374,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 21090,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2287,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 68300,
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
            "value": 14708,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1196,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 49012,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1823,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 17955,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1414,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58294,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1902,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12413,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1137,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 42871,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1736,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21883,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1758,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 71772,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2217,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14205,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1205,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 48453,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1799,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13545,
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
            "value": 44839,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1768,
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
          "distinct": false,
          "id": "47926c91bdbfc6ae0dafb4b7b2c18681fabe3ec9",
          "message": "feat: initial gas bench gh (#13986)\n\nAdding benchmark reporting for some l1 gas numbers (see\nhttps://aztecprotocol.github.io/aztec-packages/dev/l1-gas-bench/).\n\nCurrently have removed the if, to see it being run on this pr and get it\ngoing.",
          "timestamp": "2025-05-07T08:53:19Z",
          "tree_id": "9d76ddf7975d251b43fb7addf206f9c8ec3d6986",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/47926c91bdbfc6ae0dafb4b7b2c18681fabe3ec9"
        },
        "date": 1746609999511,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24325,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1871,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 78009,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2373,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 21062,
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
            "value": 68786,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3097,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14614,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1191,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 48191,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1904,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 17732,
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
            "value": 58331,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1969,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12395,
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
            "value": 41504,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1673,
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
            "value": 1761,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 72140,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2282,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14120,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1191,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 47316,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1819,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13303,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1174,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 45284,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1802,
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
          "distinct": true,
          "id": "e6e429e631c745770337192947fd37646d985475",
          "message": "chore: start translator logic at an even index (#13985)\n\nWe want to be able to add random data in the ultra op queue (at the\nbeginning and end) to make the merge protocol zk without affecting the\nlogic of translator or the version of the op queue used by eccvm. All\nwires in translator circuit builder start with a 0 to enable shifting.\nBut having the builder add data in all wires, including the ones\ncontaining op queue data, breaks the ability of the Goblin verifier to\ncompare the full table commitments in the last merge against the\ncorresponding translator witness polynomials commitments.\n\nTo solve this we want to add the 0 row (plus random rows eventually) via\nthe ultra op queue logic, but each ultra op populates two positions in\nthe translator wires. Prior to this work, the translator relations were\nimplemented to expect the main logic to start at an odd index (i.e. the\nfirst ultra op resides at index 1 and 2). Preserving this would have\nmeant we need to implement a special branch of logic in the ultra op\nqueue that only populates 1 row with data rather than 2 in the ultra\ntables. This PR swaps what happens at even and odd indexes to facilitate\nadding 0 and random rows via the existing op queue logic by making\ntranslator logic start at an even index (so currently at index 2).",
          "timestamp": "2025-05-07T08:58:25Z",
          "tree_id": "9e8217b3cf90bf9c1ef436700a12a59fda5dfcf5",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e6e429e631c745770337192947fd37646d985475"
        },
        "date": 1746611957391,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18033.398406999822,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14177.195861 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 4771435874,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 203253184,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 25376.3761109999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19857.422682 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 69419.45713299999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 69419457000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4257.98032000057,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3620.3835369999997 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11520.458199,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11520461000 ms\nthreads: 1"
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
          "id": "e6e429e631c745770337192947fd37646d985475",
          "message": "chore: start translator logic at an even index (#13985)\n\nWe want to be able to add random data in the ultra op queue (at the\nbeginning and end) to make the merge protocol zk without affecting the\nlogic of translator or the version of the op queue used by eccvm. All\nwires in translator circuit builder start with a 0 to enable shifting.\nBut having the builder add data in all wires, including the ones\ncontaining op queue data, breaks the ability of the Goblin verifier to\ncompare the full table commitments in the last merge against the\ncorresponding translator witness polynomials commitments.\n\nTo solve this we want to add the 0 row (plus random rows eventually) via\nthe ultra op queue logic, but each ultra op populates two positions in\nthe translator wires. Prior to this work, the translator relations were\nimplemented to expect the main logic to start at an odd index (i.e. the\nfirst ultra op resides at index 1 and 2). Preserving this would have\nmeant we need to implement a special branch of logic in the ultra op\nqueue that only populates 1 row with data rather than 2 in the ultra\ntables. This PR swaps what happens at even and odd indexes to facilitate\nadding 0 and random rows via the existing op queue logic by making\ntranslator logic start at an even index (so currently at index 2).",
          "timestamp": "2025-05-07T08:58:25Z",
          "tree_id": "9e8217b3cf90bf9c1ef436700a12a59fda5dfcf5",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e6e429e631c745770337192947fd37646d985475"
        },
        "date": 1746611970414,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24322,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1892,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 77831,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2359,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 21039,
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
            "value": 68760,
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
            "value": 14729,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1189,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 48435,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1846,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 18157,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1414,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58286,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1959,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12374,
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
            "value": 40917,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1757,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21971,
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
            "value": 72475,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2226,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14244,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1192,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 47950,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1823,
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
            "value": 1175,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 44717,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1867,
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
          "id": "b50e8bab66f4068325871c52924df57db7a7d873",
          "message": "chore: L1 reorg test for loading blocks before L1 syncpoint (#14122)\n\nAdds an L1 reorg scenario test for loading blocks older than last sync\npoint (see `checkForNewBlocksBeforeL1SyncPoint`)",
          "timestamp": "2025-05-07T10:08:16Z",
          "tree_id": "ab577415275e48feda8df2af2dc8d7dd153e31cd",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/b50e8bab66f4068325871c52924df57db7a7d873"
        },
        "date": 1746614987563,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24564,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1908,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 78851,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2352,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 20983,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2284,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 67940,
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
            "value": 14529,
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
            "value": 49833,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1810,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 17984,
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
            "value": 58448,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1978,
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
            "value": 1138,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 42154,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1781,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21852,
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
            "value": 72218,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2250,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14494,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1217,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 48971,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1765,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13464,
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
            "value": 44799,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1823,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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
          "distinct": false,
          "id": "8d81136d3ddf396fc061fa8074c9ba5f9fb2ab40",
          "message": "chore: more specific world state tree map size config (#13905)\n\nCloses https://github.com/AztecProtocol/aztec-packages/issues/13386\n\nAdds tree map size configurations for each specific world state tree\n(archive, nullifier tree, note hash tree, public data tree, L1 to L2\nmessage tree).\n\nAdditionally, adds a blob sink map size configuration.",
          "timestamp": "2025-05-07T12:29:35Z",
          "tree_id": "60f6a8bc2bbb4c005a9b71f2462259e4987b2646",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8d81136d3ddf396fc061fa8074c9ba5f9fb2ab40"
        },
        "date": 1746625373287,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17711.103483999977,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13982.018813 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 4839968613,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 201878710,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 25106.351195000003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19603.453154 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 69520.943085,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 69520945000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4221.580207999978,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3661.6986719999995 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11397.780598000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11397783000 ms\nthreads: 1"
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
            "email": "51711291+natebeauregard@users.noreply.github.com",
            "name": "Nate Beauregard",
            "username": "natebeauregard"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": false,
          "id": "8d81136d3ddf396fc061fa8074c9ba5f9fb2ab40",
          "message": "chore: more specific world state tree map size config (#13905)\n\nCloses https://github.com/AztecProtocol/aztec-packages/issues/13386\n\nAdds tree map size configurations for each specific world state tree\n(archive, nullifier tree, note hash tree, public data tree, L1 to L2\nmessage tree).\n\nAdditionally, adds a blob sink map size configuration.",
          "timestamp": "2025-05-07T12:29:35Z",
          "tree_id": "60f6a8bc2bbb4c005a9b71f2462259e4987b2646",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8d81136d3ddf396fc061fa8074c9ba5f9fb2ab40"
        },
        "date": 1746625389114,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24309,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1869,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 77802,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2351,
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
            "value": 2286,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 68741,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3086,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14711,
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
            "value": 48443,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1751,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 18113,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1379,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58377,
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
            "value": 12310,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1139,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 40960,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1740,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21813,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1722,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 72479,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2270,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14289,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1190,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 48074,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1840,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13578,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1174,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 44774,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1823,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "olehmisar@gmail.com",
            "name": "oleh",
            "username": "olehmisar"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": false,
          "id": "3a901453a5d99969cc29d4d89de5a4decf73f97c",
          "message": "fix: use globalThis instead of self in PXE (#14136)\n\nA simple fix to make `@pxe/client` work in node.js. Not tested. Please\nrun CI. Similar to\nhttps://github.com/AztecProtocol/aztec-packages/pull/10747",
          "timestamp": "2025-05-07T15:30:47Z",
          "tree_id": "b42efec1cb67a5b021cf8304954a0129c1048587",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/3a901453a5d99969cc29d4d89de5a4decf73f97c"
        },
        "date": 1746633851555,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24469,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1893,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 77077,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2424,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 21170,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2289,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 66620,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3004,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14516,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1192,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 48878,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1801,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 17908,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1375,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 59160,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1950,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12253,
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
            "value": 41903,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1772,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21835,
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
            "value": 70955,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2247,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14268,
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
            "value": 47975,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1806,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13453,
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
            "value": 45205,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1837,
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
          "id": "98a7ec01df19e1d5981cc21a9487a192497849a1",
          "message": "feat: more profiling (#14142)\n\n- Consolidation of our profiling/timing structs in order to surface more\nand more data to the user on \"where is time spent\" when sending TXs.\n- Display of profiling information on both playground and CLI wallet\n- General improvements for cli-wallet startup time and usability, trying\nto remove the mandatory node or pxe requirements for local-only\ncommands.\n- Removed useless fee estimation default param that forced resimulation\non cli-wallet. Heads up! Fee estimation right now is all but disabled in\nboth playground and cli-wallet, but at least we're not wasting time on\nit. Discussed a bit with @iAmMichaelConnor, and will review soon with\nsane defaults",
          "timestamp": "2025-05-07T18:47:12Z",
          "tree_id": "18869b2a4e7a609e3e0009c292439716fd844e11",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/98a7ec01df19e1d5981cc21a9487a192497849a1"
        },
        "date": 1746645671968,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24559,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1899,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 77492,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2399,
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
            "value": 2283,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 66892,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3140,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14825,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1189,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 49492,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1742,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 17897,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1382,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58619,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1960,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12582,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1137,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 41198,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1776,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21617,
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
            "value": 71381,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2241,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14250,
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
            "value": 48696,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1854,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13299,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1172,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 45142,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1815,
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
          "id": "08184fbc13622a15f5bdea4f227dbe9d45685709",
          "message": "chore: civc debugging utils (#13900)\n\nAdds some debugging functionality that's been useful to me on a number\nof occasions including\n1. Two tests in AcirIntegrationTest for debugging CIVC from msgpack\ninputs (disabled like all of the others)\n2. A `compute_vk_hash` utility for debugging discrepancies between\ncircuits that are expected to be equivalent\n3. Adds `Debug CIVC transaction` config to launch.json to allow quick\ndebugging of CIVC w/ msgpack inputs",
          "timestamp": "2025-05-07T20:22:59Z",
          "tree_id": "dc90d3579375f61f24a0b8ca514e9f9ee6fa4611",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/08184fbc13622a15f5bdea4f227dbe9d45685709"
        },
        "date": 1746651844860,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18023.53832300014,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14244.403688 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 4809272423,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 202849014,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 25436.778253000284,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19896.633414 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 69598.95734,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 69598958000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4239.693132999946,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3690.684573 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11424.795920999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11424798000 ms\nthreads: 1"
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
          "id": "08184fbc13622a15f5bdea4f227dbe9d45685709",
          "message": "chore: civc debugging utils (#13900)\n\nAdds some debugging functionality that's been useful to me on a number\nof occasions including\n1. Two tests in AcirIntegrationTest for debugging CIVC from msgpack\ninputs (disabled like all of the others)\n2. A `compute_vk_hash` utility for debugging discrepancies between\ncircuits that are expected to be equivalent\n3. Adds `Debug CIVC transaction` config to launch.json to allow quick\ndebugging of CIVC w/ msgpack inputs",
          "timestamp": "2025-05-07T20:22:59Z",
          "tree_id": "dc90d3579375f61f24a0b8ca514e9f9ee6fa4611",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/08184fbc13622a15f5bdea4f227dbe9d45685709"
        },
        "date": 1746651859125,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24538,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1886,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 78465,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2393,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 21258,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2290,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 68403,
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
            "value": 14614,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1197,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 48353,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1832,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 17926,
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
            "value": 58784,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1993,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12559,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1137,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 42372,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1798,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 22181,
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
            "value": 72120,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2207,
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
            "value": 1210,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 47715,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1805,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13367,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1174,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 44896,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1829,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "rodrigo.ferreira@aya.yale.edu",
            "name": "Rodrigo Ferreira",
            "username": "raugfer"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "6d593a64afc8b2e6524292c716c0226e3334b44e",
          "message": "fix(starknet-bb): Clears extraneous MSB from r_inv_wasm_5/r_inv_wasm_7 (#13704)\n\nThis PR attempts to fix a bb.js/WASM bug for the UltraStarknetFlavor.\nUnfortunately, it was introduced by the original implementation\n(#11489).\n\nIn short, the STARK252 field constants `r_inv_wasm_5` and `r_inv_wasm_7`\nwere declared with 30-bits when 29-bits are expected.\n\nHopefully this simple change should fix bb.js's buggy behavior.\n\n@ludamad Please take a look, thanks in advance",
          "timestamp": "2025-05-07T22:21:07+01:00",
          "tree_id": "605d3d8c34f0a4f589262cacf2967601690c7094",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/6d593a64afc8b2e6524292c716c0226e3334b44e"
        },
        "date": 1746655904191,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17941.482023999924,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14153.833629 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 4721756257,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 197644104,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 25492.38255199998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19830.045751 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 69243.801628,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 69243802000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4189.918863000457,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3585.073039 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11401.065226,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11401068000 ms\nthreads: 1"
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
            "email": "rodrigo.ferreira@aya.yale.edu",
            "name": "Rodrigo Ferreira",
            "username": "raugfer"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "6d593a64afc8b2e6524292c716c0226e3334b44e",
          "message": "fix(starknet-bb): Clears extraneous MSB from r_inv_wasm_5/r_inv_wasm_7 (#13704)\n\nThis PR attempts to fix a bb.js/WASM bug for the UltraStarknetFlavor.\nUnfortunately, it was introduced by the original implementation\n(#11489).\n\nIn short, the STARK252 field constants `r_inv_wasm_5` and `r_inv_wasm_7`\nwere declared with 30-bits when 29-bits are expected.\n\nHopefully this simple change should fix bb.js's buggy behavior.\n\n@ludamad Please take a look, thanks in advance",
          "timestamp": "2025-05-07T22:21:07+01:00",
          "tree_id": "605d3d8c34f0a4f589262cacf2967601690c7094",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/6d593a64afc8b2e6524292c716c0226e3334b44e"
        },
        "date": 1746655917250,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24324,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1883,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 78785,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2358,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 20913,
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
            "value": 67606,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3090,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14558,
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
            "value": 48568,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1850,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 18044,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1379,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58515,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1975,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12534,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1137,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 41980,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1679,
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
            "value": 1759,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 71038,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2259,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14321,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1211,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 48498,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1819,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13446,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1174,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 45818,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1848,
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
          "id": "03d6547218cee1eb175f287f81136c6adb149a79",
          "message": "feat(release): intel mac version fix, starknet bb variant build (#14013)\n\nSo far just enabled for mac. Linux and WASM support TODO\n\nNoticed that intel mac had the wrong sed command while at it",
          "timestamp": "2025-05-07T21:51:05Z",
          "tree_id": "b9808b177b76dad3d833859d1cba99f47d30a652",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/03d6547218cee1eb175f287f81136c6adb149a79"
        },
        "date": 1746658378333,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18053.29738899991,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14248.06927 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 4783853174,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 197077872,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 25343.851401999927,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 20235.673985 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 69672.149165,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 69672150000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4286.154785000235,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3672.132 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11376.459062999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11376460000 ms\nthreads: 1"
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
          "id": "03d6547218cee1eb175f287f81136c6adb149a79",
          "message": "feat(release): intel mac version fix, starknet bb variant build (#14013)\n\nSo far just enabled for mac. Linux and WASM support TODO\n\nNoticed that intel mac had the wrong sed command while at it",
          "timestamp": "2025-05-07T21:51:05Z",
          "tree_id": "b9808b177b76dad3d833859d1cba99f47d30a652",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/03d6547218cee1eb175f287f81136c6adb149a79"
        },
        "date": 1746658390986,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24312,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1869,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 77263,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2329,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 21026,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2284,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 67131,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3160,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 15050,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1192,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 48902,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1766,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 18055,
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
            "value": 59735,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2002,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12422,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1137,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 40595,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1797,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21810,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1734,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 71149,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2295,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14535,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1191,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 48376,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1839,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13567,
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
            "value": 45555,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1819,
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
          "id": "7d5bb11ce79ee8094e5f0b2fa489259c6f4d2514",
          "message": "fix: yp run_test.sh arg passing (#14154)",
          "timestamp": "2025-05-07T23:26:02Z",
          "tree_id": "a1bf033efbdf28f51351adea4c65d46632766c0f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7d5bb11ce79ee8094e5f0b2fa489259c6f4d2514"
        },
        "date": 1746662319749,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24462,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1893,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 78738,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2317,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 20776,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2289,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 67838,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3040,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 15030,
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
            "value": 49065,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1829,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 18245,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1377,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58713,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1967,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12604,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1135,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 42322,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1712,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21601,
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
            "value": 71417,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2289,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14542,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1187,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 47860,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1791,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13696,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1171,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 45152,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1840,
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
          "id": "c855d048fe250d55b220e6d26822ee16d62e228c",
          "message": "git subrepo push --branch=master noir-projects/aztec-nr\n\nsubrepo:\n  subdir:   \"noir-projects/aztec-nr\"\n  merged:   \"aa67df1d68\"\nupstream:\n  origin:   \"https://github.com/AztecProtocol/aztec-nr\"\n  branch:   \"master\"\n  commit:   \"aa67df1d68\"\ngit-subrepo:\n  version:  \"0.4.6\"\n  origin:   \"???\"\n  commit:   \"???\"",
          "timestamp": "2025-05-08T02:32:23Z",
          "tree_id": "90a82df450aebcde1460c599793b795865971bec",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c855d048fe250d55b220e6d26822ee16d62e228c"
        },
        "date": 1746673645172,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24145,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1893,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 77259,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2385,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 21018,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2318,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 67291,
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
            "value": 14786,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1198,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 49847,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1850,
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
            "value": 1374,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 59004,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1954,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12398,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1137,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 41404,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1716,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21699,
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
            "value": 70964,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2289,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14535,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1188,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 48370,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1743,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13531,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1174,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 45003,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1789,
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
          "id": "4fab079c0dcf45117ca6dcd1b46bcb01b50f1bd2",
          "message": "chore: advance block when deploying contract txe (#14107)\n\nRight now we mine an extra block when we do not need to and not after\nany initializers have been emitted, forcing us to\n`env.advance_block_by()` after any time we deploy to actually discover\nthose side effects via note discovery.\n\nNote that this removes the ability to check the note cache directly\nafter deployment but I think that is such a niche case and we can always\nre-add an endpoint that doesn't advance block after deployment if\nnecessary",
          "timestamp": "2025-05-08T05:49:02Z",
          "tree_id": "07bb24ec2c7b1aa58e1a22b1962fdb4906cb340c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/4fab079c0dcf45117ca6dcd1b46bcb01b50f1bd2"
        },
        "date": 1746685995118,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24586,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1876,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 79089,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2349,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 21019,
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
            "value": 67368,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3089,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14578,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1196,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 48660,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1850,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 17959,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1374,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58329,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1941,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12544,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1132,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 42590,
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
            "value": 21803,
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
            "value": 71299,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2261,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14082,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1190,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 48046,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1793,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13523,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1174,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 45526,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1784,
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
          "distinct": true,
          "id": "957aaaef0fa3b93cf6d24c429d06563cabb46856",
          "message": "feat: txe new contract calling flow (#14020)\n\nThis is the first phase of TXe 2.0.\n\nWe're adding a new interface for calling private contract functions.\nThis handles external calls, as well as proper public calls.\n\nThis leverages the existing `PrivateExecutionContext` as well as the\n`PublicProcessor` to handle the execution.",
          "timestamp": "2025-05-08T10:06:40Z",
          "tree_id": "457c15d2872416151bb1d0181109278c40a86a5c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/957aaaef0fa3b93cf6d24c429d06563cabb46856"
        },
        "date": 1746701471499,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24367,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1907,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 78191,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2321,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 20957,
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
            "value": 68342,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3097,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14764,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1192,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 49013,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1833,
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
            "value": 1414,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58397,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1969,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12391,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1137,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 41711,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1797,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21881,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1723,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 71994,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2195,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14387,
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
            "value": 47768,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1804,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13410,
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
            "value": 44529,
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
          "id": "5c14e5f41dabad01c79e337c23dc85bda209dc82",
          "message": "chore: creating a node rpc should have retries by default (#14159)\n\nExternals are seeing lots of issues with 502's which break the\nuseability of anything that requires a node via rpc (which is nearly\neverything). The actual backoff is arbitrarily set, but this is a\nplaceholder series that hopefully informs our builders that a retry is\npossible. Furthermore I foresee this simple retry solving and unblocking\na large proportion of the current issues faced.",
          "timestamp": "2025-05-08T12:46:05Z",
          "tree_id": "9a90a6561b6fab3d213a09341323087c109fbf15",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5c14e5f41dabad01c79e337c23dc85bda209dc82"
        },
        "date": 1746710336354,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24094,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1906,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 77630,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2303,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 20973,
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
            "value": 67344,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3089,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14649,
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
            "value": 48547,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1836,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 18077,
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
            "value": 59163,
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
            "value": 12335,
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
            "value": 41560,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1773,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21622,
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
            "value": 71553,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2245,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14275,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1192,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 48055,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1849,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13477,
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
            "value": 45014,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1844,
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
          "distinct": false,
          "id": "d5e6b09350a86237e422d713d1831a837e8ce46e",
          "message": "chore: Merging alpha testnet changes back to master (#14143)\n\nThis PR cherry picks changes from alpha-testnet back to master.\n\n---------\n\nCo-authored-by: Alex Gherghisan <alexghr@users.noreply.github.com>\nCo-authored-by: Maddiaa <47148561+Maddiaa0@users.noreply.github.com>\nCo-authored-by: saleel <saleel@aztecprotocol.com>\nCo-authored-by: spypsy <spypsy@users.noreply.github.com>\nCo-authored-by: Gregorio Juliana <gregojquiros@gmail.com>\nCo-authored-by: saleel <saleel@saleel.xyz>\nCo-authored-by: Santiago Palladino <santiago@aztecprotocol.com>\nCo-authored-by: Santiago Palladino <santiago@aztec-labs.com>",
          "timestamp": "2025-05-08T13:29:28Z",
          "tree_id": "290103d8a5b0b944440d3e7fb55b755f1f0babb8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d5e6b09350a86237e422d713d1831a837e8ce46e"
        },
        "date": 1746713357093,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24352,
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
            "value": 78477,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2373,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 20878,
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
            "value": 67295,
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
            "value": 14808,
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
            "value": 48666,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1861,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 18011,
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
            "value": 57945,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1951,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12497,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1137,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 41692,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1775,
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
            "value": 1758,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 71915,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2299,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14296,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1206,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 47675,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1822,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13477,
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
            "value": 44240,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1818,
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
          "distinct": false,
          "id": "6b23d48eddee95af347487073f2d69a99ad241d6",
          "message": "refactor: timestamp based snapshots (#14128)\n\nFixes #13877. \n\nUpdates the address snapshot library to be based on time only, and rely\non the caller to pass meaningful time in. The staking lib can then feed\nalong the timestamp for which the current epoch is stable `timeOfEpoch -\n1` and we can neatly use the same storage later for different rollups.\n\nAlters quite a lot of the tests to test the timings.",
          "timestamp": "2025-05-08T13:47:32Z",
          "tree_id": "8728d8c1d12ccb57afe3c46348c3bb70559671df",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/6b23d48eddee95af347487073f2d69a99ad241d6"
        },
        "date": 1746714548910,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24253,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1867,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 77595,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2394,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 21078,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2287,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 68244,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3079,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14689,
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
            "value": 48842,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1858,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 18101,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1379,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58995,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2004,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12524,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1140,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 40584,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1711,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21895,
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
            "value": 72554,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2254,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14198,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1191,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 47649,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1743,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13574,
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
            "value": 45196,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1807,
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
          "distinct": true,
          "id": "f85d01c16ebe9fbf384f74ad72cb6b5c86b5174e",
          "message": "feat: minimal Avm PublicInputs in Cpp, Noir & Cpp `to/from_columns`, PI tracegen and evaluate all PI cols in verifiers (#13698)\n\nAlso row-indices constants are defined/computed.\n\n*NOTE:* The 'lengths' entries flagged as \"NEW\" are not added in this PR.\n\n\n![image](https://github.com/user-attachments/assets/cc10c638-817f-4741-878e-13238c6a22dd)\n\n![image](https://github.com/user-attachments/assets/8bc36e9d-d7ca-42ea-949a-a2a05925cdb0)\n\n---------\n\nCo-authored-by: dbanks12 <david@aztecprotocol.com>",
          "timestamp": "2025-05-08T18:32:59Z",
          "tree_id": "404ef7d3620d814436e990cdb4df421f268511c4",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f85d01c16ebe9fbf384f74ad72cb6b5c86b5174e"
        },
        "date": 1746731277554,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17856.30711399972,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14411.841137 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 4871980304,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 199952277,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 25639.278000000104,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 20125.692335 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 69541.261464,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 69541262000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4256.686510000236,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3520.658771 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11486.423416,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11486427000 ms\nthreads: 1"
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
          "distinct": true,
          "id": "f85d01c16ebe9fbf384f74ad72cb6b5c86b5174e",
          "message": "feat: minimal Avm PublicInputs in Cpp, Noir & Cpp `to/from_columns`, PI tracegen and evaluate all PI cols in verifiers (#13698)\n\nAlso row-indices constants are defined/computed.\n\n*NOTE:* The 'lengths' entries flagged as \"NEW\" are not added in this PR.\n\n\n![image](https://github.com/user-attachments/assets/cc10c638-817f-4741-878e-13238c6a22dd)\n\n![image](https://github.com/user-attachments/assets/8bc36e9d-d7ca-42ea-949a-a2a05925cdb0)\n\n---------\n\nCo-authored-by: dbanks12 <david@aztecprotocol.com>",
          "timestamp": "2025-05-08T18:32:59Z",
          "tree_id": "404ef7d3620d814436e990cdb4df421f268511c4",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f85d01c16ebe9fbf384f74ad72cb6b5c86b5174e"
        },
        "date": 1746731290560,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24348,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1896,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 77917,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2367,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 20959,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2287,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 67251,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 3120,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14681,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1197,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 49515,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1887,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 18118,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1414,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58962,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1975,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12532,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1139,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 40890,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1770,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21857,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof-memory",
            "value": 1737,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm",
            "value": 70994,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2280,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14424,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1194,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 47884,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1792,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13617,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-memory",
            "value": 1174,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 45046,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1842,
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
          "distinct": true,
          "id": "5ccf2ad2cdc3595afd4a167a7f9b565b8ecdca20",
          "message": "fix: l2 to l1 messages from private should be properly ordered by phase alongside publicly created ones (#14118)\n\nAlso, better tests of side effects for the public tx simulator,\nespecially including tests of notes & messages being thrown away/kept\nproperly based on whether a phase reverted.\n\nCo-authored-by: AztecBot <tech@aztecprotocol.com>",
          "timestamp": "2025-05-08T19:33:45Z",
          "tree_id": "617f6cd5383c1c968358caf088e3735f3641a059",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5ccf2ad2cdc3595afd4a167a7f9b565b8ecdca20"
        },
        "date": 1746735258720,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof",
            "value": 24476,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1898,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 77515,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2402,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof",
            "value": 21290,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-memory",
            "value": 2289,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm",
            "value": 67497,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+deploy_tokenContract_with_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 2984,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof",
            "value": 14679,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-memory",
            "value": 1192,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm",
            "value": 49744,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+token_bridge_claim_private+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1855,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof",
            "value": 18030,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+private_fpc-ivc-proof-memory",
            "value": 1382,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm",
            "value": 58454,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 1957,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof",
            "value": 12368,
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
            "value": 42327,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_0_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1832,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+private_fpc-ivc-proof",
            "value": 21863,
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
            "value": 71003,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+private_fpc-ivc-proof-wasm-memory",
            "value": 2251,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof",
            "value": 14180,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-ecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-memory",
            "value": 1186,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm",
            "value": 48872,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmecdsar1+transfer_1_recursions+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1835,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-schnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof",
            "value": 13403,
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
            "value": 44711,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmschnorr+deploy_tokenContract_no_registration+sponsored_fpc-ivc-proof-wasm-memory",
            "value": 1762,
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
      }
    ]
  }
}