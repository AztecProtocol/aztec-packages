window.BENCHMARK_DATA = {
  "lastUpdate": 1740674088832,
  "repoUrl": "https://github.com/AztecProtocol/aztec-packages",
  "entries": {
    "C++ Benchmark": [
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
          "id": "b35a61df37a8c26b5fa8cb8b60520ea982e04a65",
          "message": "feat: add wasm memory benchmark to bench.json (redo) (#12205)\n\nReinstates #11551 with e2e-all flag to test bench running.",
          "timestamp": "2025-02-21T19:34:11-05:00",
          "tree_id": "18dd13bc16a1b679bcb70b69731f42d4b535d817",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/b35a61df37a8c26b5fa8cb8b60520ea982e04a65"
        },
        "date": 1740185330636,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18058.540739000022,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15802.331154 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18571.705784999947,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16320.107383 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3851.2579190000906,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3074.8108449999995 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54723.253657,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54723253000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11264.470395,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11264474000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1818322940,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1818322940 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 127788707,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 127788707 ns\nthreads: 1"
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
            "email": "critesjosh@gmail.com",
            "name": "josh crites",
            "username": "critesjosh"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "17719739ab9a62c6371cf8e1cd59dd2f2d571387",
          "message": "fix: Fix broken error message link (#12187)\n\n- fixes a broken error message link\n- removes some redundant files from the docs\n- moves `mod test;` out of the code block reference for the counter\ncontract tutorial",
          "timestamp": "2025-02-22T00:55:53Z",
          "tree_id": "356f682699d42de124525a287c326f3e2f4a19e0",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/17719739ab9a62c6371cf8e1cd59dd2f2d571387"
        },
        "date": 1740187341110,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18100.50350300003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16072.843147 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18812.31977699986,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16512.734104 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3949.7023240001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3120.2308179999995 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54857.74075800001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54857740000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11594.481318000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11594482000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1845208593,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1845208593 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 140050899,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 140050899 ns\nthreads: 1"
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
          "id": "6df809b891ad4023b1947b0c674daabd6761b91a",
          "message": "chore: Rename output_data_type and replace output_content by flag (#12198)\n\nSome small QOL improvements suggested by @saleel",
          "timestamp": "2025-02-21T20:33:27-05:00",
          "tree_id": "f1f47b9495c0abfce0f84ef4da606b88b0a0f249",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/6df809b891ad4023b1947b0c674daabd6761b91a"
        },
        "date": 1740189726206,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18292.656510999906,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16162.291377000003 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18734.581273999993,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16440.037995 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4005.6864810001116,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3101.933337 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54982.124484,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54982123000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9896.654186,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9896658000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1823800546,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1823800546 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 130326842,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 130326842 ns\nthreads: 1"
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
          "id": "5aaa7eee2463579eafadfbbe770619866c4dfcba",
          "message": "feat: bytecode hashing (#12142)\n\n```\n------- STATS -------\nprove/execute_log_derivative_inverse_commitments_round_ms: 128\nprove/execute_log_derivative_inverse_round_ms: 337\nprove/execute_pcs_rounds_ms: 2128\nprove/execute_relation_check_rounds_ms: 8229\nprove/execute_wire_commitments_round_ms: 1321\nproving/all_ms: 13251\nproving/construct_proof_ms: 12145\nproving/init_polys_to_be_shifted_ms: 55\nproving/init_polys_unshifted_ms: 30\nproving/prove:compute_polynomials_ms: 296\nproving/prove:construct_prover_ms: 1\nproving/prove:proving_key_ms: 548\nproving/prove:verification_key_ms: 110\nproving/set_polys_shifted_ms: 0\nproving/set_polys_unshifted_ms: 209\nsimulation/all_ms: 26\ntracegen/all_ms: 2305\ntracegen/alu_ms: 0\ntracegen/bytecode_decomposition_ms: 2137\ntracegen/bytecode_hashing_ms: 26\ntracegen/bytecode_retrieval_ms: 0\ntracegen/ecc_add_ms: 0\ntracegen/execution_ms: 0\ntracegen/instruction_fetching_ms: 0\ntracegen/interactions_ms: 61\ntracegen/poseidon2_hash_ms: 3\ntracegen/poseidon2_permutation_ms: 116\ntracegen/sha256_compression_ms: 0\ntracegen/traces_ms: 2243\n\nColumn sizes per namespace:\n  precomputed: 2097152 (~2^21)\n  execution: 6 (~2^3)\n  alu: 0 (~2^0)\n  bc_decomposition: 60506 (~2^16)\n  bc_hashing: 1953 (~2^11)\n  bc_retrieval: 1 (~2^0)\n  bitwise: 0 (~2^0)\n  ecc: 0 (~2^0)\n  instr_fetching: 6 (~2^3)\n  poseidon2_hash: 1953 (~2^11)\n  poseidon2_perm: 1952 (~2^11)\n  range_check: 0 (~2^0)\n  sha256: 0 (~2^0)\n  lookup: 196608 (~2^18)\n```",
          "timestamp": "2025-02-22T16:58:07Z",
          "tree_id": "4135703c0b18dddf2f3980b5a4e0880a79089fd5",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5aaa7eee2463579eafadfbbe770619866c4dfcba"
        },
        "date": 1740245032008,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18367.18967599995,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16133.616360000002 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18724.327532999952,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16300.345942 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3923.8447400000496,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3168.463304 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54660.264289000006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54660265000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10931.801844000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10931806000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1822876239,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1822876239 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 133235492,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 133235492 ns\nthreads: 1"
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
        "date": 1740346393405,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 22016.579100999934,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18605.236213 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18726.906290999978,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16319.063031 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4164.433076999899,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3505.4332139999997 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 58844.636936,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 58844637000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 12702.943999000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 12702947000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1915292072,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1915292072 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 159160617,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 159160617 ns\nthreads: 1"
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
            "name": "AztecProtocol",
            "username": "AztecProtocol"
          },
          "committer": {
            "name": "AztecProtocol",
            "username": "AztecProtocol"
          },
          "id": "d742834bb55548a1bc94a773b1eb40e8c9b397ae",
          "message": "feat(p2p): gossipsub scoring adjustments + testbench in ci",
          "timestamp": "2025-02-23T02:27:21Z",
          "url": "https://github.com/AztecProtocol/aztec-packages/pull/12075/commits/d742834bb55548a1bc94a773b1eb40e8c9b397ae"
        },
        "date": 1740393339852,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 22007.076390000067,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18618.862093999996 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18840.81777600011,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16248.153754 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4075.606318000041,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3477.7401210000003 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 58449.341547,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 58449342000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 12719.646217,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 12719653000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1944721650,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1944721650 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 156147752,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 156147752 ns\nthreads: 1"
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
          "id": "208404e1b3823ed21781a4c3bcace7619411b0f9",
          "message": "fix(blob-sink): type check next slot (#12117)",
          "timestamp": "2025-02-24T11:17:17Z",
          "tree_id": "c3a62148825c023c5b68359e086ec0af6651763a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/208404e1b3823ed21781a4c3bcace7619411b0f9"
        },
        "date": 1740397260690,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18435.80145200008,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16102.147178 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18828.950947000067,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16502.334918 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4028.1630810000024,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3209.2624869999995 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54967.090252999995,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54967090000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11751.065045,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11751076000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1832845950,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1832845950 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 131226984,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 131226984 ns\nthreads: 1"
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
          "id": "220612520525c03cadec2eea439055430fa67064",
          "message": "fix(spartan): each tx bot replica gets its own l1 private key (#12219)",
          "timestamp": "2025-02-24T12:47:47Z",
          "tree_id": "ebd263e59a28f98e6eb68bf4efb37454a5f1539d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/220612520525c03cadec2eea439055430fa67064"
        },
        "date": 1740402599457,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18162.572875000023,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15960.390959 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18603.143216000033,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16266.450794 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3825.6271200000356,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3091.4730820000004 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54885.904406999995,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54885905000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10330.583151,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10330590000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1818401743,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1818401743 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 128774542,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 128774542 ns\nthreads: 1"
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
          "id": "ec7d34987bca0c42c5e0ba5cced2f29d42cc65db",
          "message": "chore!: Remove msm opcode (#12192)\n\nThe MSM opcode is now transpiled to a procedure that implements it via\necadd. We can safely remove it now.",
          "timestamp": "2025-02-24T15:04:12+01:00",
          "tree_id": "8b62fd6280f24370f78325850652091d5f84751b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ec7d34987bca0c42c5e0ba5cced2f29d42cc65db"
        },
        "date": 1740407856241,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18435.85760200017,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16323.372298999999 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18743.88933099999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16384.951856 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3978.705810000065,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3119.5890900000004 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55025.413647999994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55025408000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10711.259893,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10711265000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1812277723,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1812277723 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 132411961,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 132411961 ns\nthreads: 1"
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
          "id": "8f121f8355e84a31ca08a56a829f8c545f058ff7",
          "message": "chore(p2p): run testbench with 200kb transactions (#12218)\n\n## Overview\n\nBumps transactions size use random ClientIVC proofs in testbench \n\n```\nconst CLIENT_IVC_PROOF_LENGTH = 172052;\nconst CLIENT_IVC_VK_LENGTH = 2730;\n```",
          "timestamp": "2025-02-24T15:19:11Z",
          "tree_id": "8de9e7028424ad42c564f1feb594d50c62bc4fa6",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8f121f8355e84a31ca08a56a829f8c545f058ff7"
        },
        "date": 1740412089928,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18346.567696000195,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16206.130508999997 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18823.241184999915,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16401.564675999998 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4030.936354000005,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3235.078521 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54960.043689000006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54960044000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10310.284687000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10310287000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1829711230,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1829711230 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 130552186,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 130552186 ns\nthreads: 1"
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
          "id": "4bd5678f840694333725aed44e00ced576ef9950",
          "message": "chore: @aztec/stdlib pt.5 -> started circuit-types minification (#12232)\n\nInitial cleanup of `circuit-types`. Attempted to do more in one go, but\nthe trees were pretty much all over the place.",
          "timestamp": "2025-02-24T17:24:46+01:00",
          "tree_id": "7ec7da89509a7e6936083fe1932136b10a2128b1",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/4bd5678f840694333725aed44e00ced576ef9950"
        },
        "date": 1740416151262,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18341.654283000025,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16176.527652 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18830.065332000006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16320.225928 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3961.3667069997973,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3148.826145 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54966.396415,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54966397000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10471.9078,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10471919000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1829405466,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1829405466 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 132137704,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 132137704 ns\nthreads: 1"
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
          "id": "b2b5589cacc926fcb7a6a5ec1dbc5fdf023b65cc",
          "message": "chore(p2p): remove debug disable message validators  (#12237)",
          "timestamp": "2025-02-25T10:52:20Z",
          "tree_id": "a05b0337153e74e34666a9600b5824be62ae3489",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/b2b5589cacc926fcb7a6a5ec1dbc5fdf023b65cc"
        },
        "date": 1740482483726,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18244.805316999875,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16154.350743000003 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18755.36757200007,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16342.291262 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3983.2226109997464,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3258.984435 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55100.247589,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55100249000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10526.288085999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10526291000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1830173203,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1830173203 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 125791435,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 125791435 ns\nthreads: 1"
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
            "email": "karl.lye@gmail.com",
            "name": "Charlie Lye",
            "username": "charlielye"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "4d94bc3d56b7d516ca7cf99df21c21edd556710d",
          "message": "feat: compress/decompress redis logs (#12243)\n\nShould save quite a bit of space, hopefully giving the data a longer\nlifetime before eviction.\nHandles both compressed and uncompressed logs.",
          "timestamp": "2025-02-25T12:07:42Z",
          "tree_id": "7d24a70d8afb07bdd4c1fee60f1156fcb160c4d2",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/4d94bc3d56b7d516ca7cf99df21c21edd556710d"
        },
        "date": 1740486194877,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18188.725105000005,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16135.782790000001 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18618.33660399998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16409.065652 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3859.389539999995,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3077.774431 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54737.52495199999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54737525000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11353.529429,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11353535000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1814794670,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1814794670 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 131235394,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 131235394 ns\nthreads: 1"
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
          "id": "9139ffb905d2ac9740121b6ef249607ca3302e1d",
          "message": "fix: Node getBlockHeader returns undefined for non-existent blocks (#12242)\n\nAztec node's `getBlockHeader` returned the initial genesis header when\nqueried for a non-existing block.",
          "timestamp": "2025-02-25T09:10:26-03:00",
          "tree_id": "386f4e50b530145dcdc966122850987cd68fa786",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9139ffb905d2ac9740121b6ef249607ca3302e1d"
        },
        "date": 1740487183559,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18227.17163399989,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16144.696984 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18741.780255000092,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16320.769129999999 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3941.120327999897,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3188.058156 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54876.14524699999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54876145000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10307.052516000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10307055000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1832997861,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1832997861 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 134469195,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 134469195 ns\nthreads: 1"
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
            "email": "karl.lye@gmail.com",
            "name": "Charlie Lye",
            "username": "charlielye"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "1a34cdf8c456533cdc7a3e3bf59e396a5e139f0e",
          "message": "feat: Cl/ci3.4 (#12018)\n\n* Introduces \"skipped\" test log so you can see a list of all skipped\ntests, with log links to their successful run.\n* Test logs have metadata added in the header (command, commit link, env\nvars, date).\n* CI docs around approach to reproducing flakes.\n* Denoise logs can now be \"live tailed\" with `ci llog <id>`.\n* Logs for local (non CI) runs expire within 8 hours. CI logs retained\nfor 14 days.\n* Denoise logs use a temp file rather than ephermeral file descriptor,\nwhich I'm moon-shot hoping will fix the \"hanging CI machine after\nfailure\" issue (existing code never closed the fd).\n* Only put anvil in release-image rather than all of foundry (slight\nimage space save).\n* Make the p2p e2e tests \"grindable\" by using unique data dirs.",
          "timestamp": "2025-02-25T15:14:53Z",
          "tree_id": "829b3b41216372fff7c0a32050a837d600237bb0",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1a34cdf8c456533cdc7a3e3bf59e396a5e139f0e"
        },
        "date": 1740498304299,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18307.49617299989,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16145.352753999998 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18832.08790999993,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16291.062576000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4003.163303000065,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3188.78763 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55098.13765,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55098139000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11267.503283,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11267513000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1834150075,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1834150075 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 131077952,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 131077952 ns\nthreads: 1"
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
          "id": "63081a4f7279a29d020c78cd15635ae618d771d3",
          "message": "refactor!: note interfaces (#12106)",
          "timestamp": "2025-02-26T00:17:59Z",
          "tree_id": "9ec1278af6e17a7d3319a1cc2fd3a8349438425b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/63081a4f7279a29d020c78cd15635ae618d771d3"
        },
        "date": 1740530786376,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18137.63883699994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16034.22133 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18634.687618999807,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16426.715566000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3879.2754920000334,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3112.53043 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54772.620625,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54772619000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11097.105875000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11097113000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1835302529,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1835302529 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 129756027,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 129756027 ns\nthreads: 1"
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
          "id": "83214fcb0bacb0c596b17c321ea99a280ad2147a",
          "message": "fix: Enforce no import side effects (#12268)\n\nSince we enabled `verbatimModuleSyntax` in yarn project, all imports of\nthe like `import { type Foo } from './foo.js'` now cause `foo.js` to be\nactually imported in runtime. To prevent this, the `type` modifier needs\nto be moved out of the braces. This is what this eslint rule does.\n\nSee [this\npost](https://typescript-eslint.io/blog/consistent-type-imports-and-exports-why-and-how/#verbatim-module-syntax)\nfor more info.",
          "timestamp": "2025-02-26T01:06:57Z",
          "tree_id": "5f14cd84c456dfa7ab82b431eecca9e83333a1bc",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/83214fcb0bacb0c596b17c321ea99a280ad2147a"
        },
        "date": 1740533916668,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18406.723074999943,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16312.480667999998 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18745.517887000005,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16242.10115 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4007.2359159998996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3197.482536 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54821.97465,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54821973000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9750.016864000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9750021000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1829858510,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1829858510 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 127134591,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 127134591 ns\nthreads: 1"
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
          "id": "9ccd2c9cb9a1a932dd22eae16c64288cc0ff24af",
          "message": "chore: cleanup stdlib internal imports (#12274)\n\nThanks @sklppy88 for the heads up!",
          "timestamp": "2025-02-26T07:47:21+01:00",
          "tree_id": "accb17e2f13fe1e3e3844cde294cb2db0dc7e737",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9ccd2c9cb9a1a932dd22eae16c64288cc0ff24af"
        },
        "date": 1740554525796,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18131.968670000104,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16054.204241999998 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18471.453201999793,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16280.352329 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3920.152401999985,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3088.2025790000002 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54514.999772,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54515000000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9349.240704,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9349247000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1804206471,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1804206471 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 127990200,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 127990200 ns\nthreads: 1"
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
          "id": "7c3eed09c11e59006cc7f6b80693264f32819420",
          "message": "feat: metrics (#12256)\n\nMore metrics fixes",
          "timestamp": "2025-02-26T08:52:52Z",
          "tree_id": "ed840dbb33f973f75f40d74af319408721fd268f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7c3eed09c11e59006cc7f6b80693264f32819420"
        },
        "date": 1740561666874,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18392.53748400006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16172.457123 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18783.985854000093,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16503.364765000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4040.4455880000114,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3201.9833530000005 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55657.778836,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55657779000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9407.328069,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9407332000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1829998567,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1829998567 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 134477984,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 134477984 ns\nthreads: 1"
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
          "id": "f887efc9c47a643e6eba4aaabafdeef46c77ff4a",
          "message": "fix: prometheus scrapes itself in the cluster (#12277)",
          "timestamp": "2025-02-26T09:29:17Z",
          "tree_id": "074d8fd895c0e70cbc13d3444349b8d9d40735ae",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f887efc9c47a643e6eba4aaabafdeef46c77ff4a"
        },
        "date": 1740563532851,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18580.484788000147,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16456.434877 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18812.58359000003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16570.961467 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3987.7334349996545,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3142.2164980000002 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54997.383904,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54997371000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10217.298942,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10217307000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1821695315,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1821695315 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 136152104,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 136152104 ns\nthreads: 1"
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
          "id": "5da66c833f25fcd72b611f6de75e2040554bc475",
          "message": "refactor: proving cost in fee header (#12048)",
          "timestamp": "2025-02-26T10:39:37Z",
          "tree_id": "955f02b4219c5376e8d9deaa2c40e94694e0fc84",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5da66c833f25fcd72b611f6de75e2040554bc475"
        },
        "date": 1740567930890,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18421.864129999904,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16258.578279000001 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18708.696600000167,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16380.526998000001 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4000.644589000103,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3173.4500530000005 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55027.79324100001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55027794000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11103.012053,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11103017000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1828765238,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1828765238 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 132123741,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 132123741 ns\nthreads: 1"
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
          "id": "5d49445812dca3405805d92c9236f90236b3ce98",
          "message": "docs: Fees doc snippets and code snippets (#12229)",
          "timestamp": "2025-02-26T11:06:12Z",
          "tree_id": "a78a223ab01d242e5530be89da7f384b70ea9e5e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5d49445812dca3405805d92c9236f90236b3ce98"
        },
        "date": 1740569721187,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18231.541997000022,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15980.735325 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18726.657449999948,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16336.34813 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3967.7975150002567,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3163.96359 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54884.056704,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54884056000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11671.069705999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11671075000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1811684462,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1811684462 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 130761695,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 130761695 ns\nthreads: 1"
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
          "id": "a20da9b93ea76b9a02fc8447303a833b173578b9",
          "message": "fix: darwin build (#12290)\n\nCo-authored-by: IlyasRidhuan <ilyasridhuan@gmail.com>",
          "timestamp": "2025-02-26T17:11:31Z",
          "tree_id": "45bb4b1107e6c6ba6444bc0e6b88d301ecec7ec7",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a20da9b93ea76b9a02fc8447303a833b173578b9"
        },
        "date": 1740592262671,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17923.031965000064,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15952.024304000002 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18462.81610699998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16546.379267 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3973.1337240000357,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3088.3861999999995 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54191.02463199999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54191025000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10698.594458,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10698598000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1803999724,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1803999724 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 123847077,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 123847077 ns\nthreads: 1"
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
            "email": "karl.lye@gmail.com",
            "name": "Charlie Lye",
            "username": "charlielye"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "b0de9e8d58f93d149e59cf3ca7ac81bf51b68e12",
          "message": "feat: live logs (#12271)\n\nWe publish denoise logs to redis every 5s.",
          "timestamp": "2025-02-26T17:32:49Z",
          "tree_id": "4e4ecc8d6dbbc9539362f73b950127d701ca93b7",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/b0de9e8d58f93d149e59cf3ca7ac81bf51b68e12"
        },
        "date": 1740592698489,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18418.52892399993,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16229.577579 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18635.477901000057,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16248.441368999998 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3982.4811020002926,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3232.588258 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55006.305841,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55006305000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11129.494998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11129504000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1823158390,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1823158390 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 134841210,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 134841210 ns\nthreads: 1"
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
          "id": "a90f08e245add379fa0257c81f8e2819beb190cb",
          "message": "feat: fetch addresses from registry (#12000)\n\nKey changes:\n- Makes slash factory address optional in L1ContractAddresses interface\n- Adds new RegisterNewRollupVersionPayload contract for registering new rollup versions\n- Adds new Registry contract with methods for managing rollup versions\n- Extracts rollup deployment logic into separate deployRollupAndPeriphery function\n- Adds collectAddresses and collectAddressesSafe methods to Registry for fetching contract addresses\n- Transfers fee asset ownership to coin issuer during deployment",
          "timestamp": "2025-02-26T12:34:14-05:00",
          "tree_id": "343a179b8001ae3dcd48c1ceceef46860b9ffca8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a90f08e245add379fa0257c81f8e2819beb190cb"
        },
        "date": 1740593073667,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18357.676352,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16288.068329000002 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18687.448896999966,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16325.035460000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3936.7649640000764,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3143.172431 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54974.701894,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54974702000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10492.620427999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10492629000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1814947357,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1814947357 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 134744105,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 134744105 ns\nthreads: 1"
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
          "id": "6749596f41f45b566bedf58c9c5f5a5fdca2ac11",
          "message": "feat: prepend based merge (#12093)\n\nReorganize the existing merge protocol to establish the _pre_-pending of\nsubtables of ecc ops from each circuit, rather than appending. This is\nfacilitated by classes `UltraEccOpsTable` and `EccvmOpsTable`\n(implemented in a previous PR) that handle the storage and virtual\npre-pending of subtables.\n\nThe merge protocol proceeds by opening univariate polynomials T_j,\nT_{j,prev}, and t_j (columns of full table, previous full table, and\ncurrent subtable respectively) and checking the identity T_j(x) = t_j(x)\n+ x^k * T_{j,prev}(x) at a single challenge point. (Polynomials t_j are\nexplicitly degree checked in main protocol via a relation that checks\nthat they are zero beyond idx k-1).\n\nNote: Missing pieces in the merge are (1) connecting [t] from the main\nprotocol to [t] in the merge and (2) connecting [T] from step i-1 to\n[T_prev] at step i. These will be handled in follow ons.",
          "timestamp": "2025-02-26T11:01:31-07:00",
          "tree_id": "d25cf6fad7b3b5b413f7e8a87456044865c3d14a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/6749596f41f45b566bedf58c9c5f5a5fdca2ac11"
        },
        "date": 1740595387740,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18296.289300999888,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16247.807529 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18891.91436300007,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16501.721402000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4009.243207000054,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3167.3543530000006 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55190.336882,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55190337000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10988.607329,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10988610000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1902961206,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1902961206 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 222074163,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 222074163 ns\nthreads: 1"
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
          "id": "cc0130ab2626421ef537da0069fcac72a8291cce",
          "message": "chore: enabling `e2e_contract_updates` in CI + nuking irrelevant test (#12293)",
          "timestamp": "2025-02-26T18:12:00Z",
          "tree_id": "4336394ad3dbd91cb0609a8c368d88e35b087b4a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/cc0130ab2626421ef537da0069fcac72a8291cce"
        },
        "date": 1740595482773,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18553.241402000138,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16325.891835 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18768.78591400009,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16348.242003000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4018.8767839999855,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3143.8382229999993 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54914.925358,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54914926000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9962.699479,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9962710000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1920207300,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1920207300 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 222058131,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 222058131 ns\nthreads: 1"
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
          "id": "e200f8bec616608557bfc170732e126fa4866472",
          "message": "feat: Sync from noir (#12298)\n\nAutomated pull of development from the\n[noir](https://github.com/noir-lang/noir) programming language, a\ndependency of Aztec.\nBEGIN_COMMIT_OVERRIDE\nchore!: bump msrv to 1.85.0\n(https://github.com/noir-lang/noir/pull/7530)\nfix: No longer error on INT_MIN globals\n(https://github.com/noir-lang/noir/pull/7519)\nfix: correctly format trait function with multiple where clauses\n(https://github.com/noir-lang/noir/pull/7531)\nchore(ssa): Do not run passes on Brillig functions post Brillig gen\n(https://github.com/noir-lang/noir/pull/7527)\nEND_COMMIT_OVERRIDE\n\n---------\n\nCo-authored-by: guipublic <guipublic@gmail.com>\nCo-authored-by: guipublic <47281315+guipublic@users.noreply.github.com>",
          "timestamp": "2025-02-26T18:30:44Z",
          "tree_id": "f92b615b79884a0cd9e8c6aeb900d95a8486a23d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e200f8bec616608557bfc170732e126fa4866472"
        },
        "date": 1740596524330,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18104.259960000036,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15971.020394000001 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18823.434158000055,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16333.626006999999 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3968.3651579998696,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3158.376714 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55146.739344,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55146740000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10563.580955000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10563585000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1901821191,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1901821191 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 216192054,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 216192054 ns\nthreads: 1"
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
          "id": "2e7b2da5e501bc53c6e5b7d2b7e1ebcf8b24bb57",
          "message": "fix(e2e): p2p_reqresp (#12297)",
          "timestamp": "2025-02-26T19:05:13Z",
          "tree_id": "210d9d8fdf8dd792fd4e69f1a3eaa569edd6f10c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/2e7b2da5e501bc53c6e5b7d2b7e1ebcf8b24bb57"
        },
        "date": 1740598513957,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18251.62955199994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16108.402033 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18708.35237899996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16398.936315 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4043.4944029998405,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3155.3163900000004 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55270.374791999995,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55270375000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10111.255833000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10111262000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1898839111,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1898839111 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 223448150,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 223448150 ns\nthreads: 1"
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
          "id": "f59f91e450e481981b374e9209304789f54d6d22",
          "message": "chore: Do not set CI_FULL outside CI (#12300)\n\nDo not set the CI_FULL env var if running outside CI",
          "timestamp": "2025-02-26T16:26:10-03:00",
          "tree_id": "bad4bd99d2f608711361c5d7d47bdce1a6c69a49",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f59f91e450e481981b374e9209304789f54d6d22"
        },
        "date": 1740599593294,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18188.986916999966,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16187.990658 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18748.61619300009,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16406.915736 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4084.0826060002655,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3098.577419 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55281.217712,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55281213000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11351.215530000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11351218000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1920878002,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1920878002 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 222799485,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 222799485 ns\nthreads: 1"
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
            "email": "spypsy@users.noreply.github.com",
            "name": "spypsy",
            "username": "spypsy"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "fcf6278d376e9393d242d6c68f4df5d738ce75ab",
          "message": "chore!: enable multiple L1 nodes to be used (#11945)\n\n- Updates `ETHEREUM_HOST` env var to `ETHEREUM_HOSTS`. Using a single\nhost should still work as it did before\n- Single `ViemWalletClient` & `ViemPublicClient`\n\nBREAKING CHANGE:\n- env var `ETHEREUM_HOST` -> `ETHEREUM_HOSTS`\n- CLI arg `--l1-rpc-url` -> `--l1-rpc-urls`\n- TypeScript configs with `l1RpcUrl` -> `l1RpcUrls`\n- aztec.js functions with `l1RpcUrl` -> `l1RpcUrls`\n- `DeployL1Contracts` (type) -> `DeployL1ContractsReturnType`\n\nFixes #11790 \n\nFollow-up #12254",
          "timestamp": "2025-02-26T19:23:15Z",
          "tree_id": "41392dcf4b4e30c692d15e1c644bad2d97ebda3c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/fcf6278d376e9393d242d6c68f4df5d738ce75ab"
        },
        "date": 1740599599402,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18306.747417,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15949.069419 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18811.581847999834,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16396.840817 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3932.524032999936,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3172.3505649999997 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55308.658141,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55308658000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11126.477631999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11126481000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1898424441,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1898424441 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 226836388,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 226836388 ns\nthreads: 1"
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
            "email": "spypsy@users.noreply.github.com",
            "name": "spypsy",
            "username": "spypsy"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "62faad5cf843bcc0655ac98f2dec8e7bc2378e29",
          "message": "chore: new mnemonic deployments on sepolia (#12076)\n\nFixes #11765 \nUpdating how we make sepolia deployments on k8s. \nInstead of fixed pre-funded addresses, we have a single private key that\nfunds new addresses for each new deployment.\nAlso fixes setting up the transaction bot for sepolia deployments",
          "timestamp": "2025-02-26T19:23:51Z",
          "tree_id": "e87c326d376181a2bdf364965ff06562e04c82a6",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/62faad5cf843bcc0655ac98f2dec8e7bc2378e29"
        },
        "date": 1740599612708,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18408.850437999943,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16101.926566 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18735.460719000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16350.875583000001 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3988.0140329998994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3182.173379 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55356.050455000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55356050000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9688.407573,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9688412000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1896751537,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1896751537 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 213749965,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 213749965 ns\nthreads: 1"
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
          "id": "894273fdbd8e29caa2b0d76dd556ef97d117c8a1",
          "message": "chore: Reenable dapp subscription test (#12304)\n\nFixes #12296\nFixes #6651",
          "timestamp": "2025-02-26T19:47:00Z",
          "tree_id": "092b227b4e163dc24c443a41ca98d77612e66364",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/894273fdbd8e29caa2b0d76dd556ef97d117c8a1"
        },
        "date": 1740600990026,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18275.02492799999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15981.279989999999 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18781.566085000122,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16392.794237000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4013.656114999776,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3126.2238079999997 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55048.995983999994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55048994000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11622.939715999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11622951000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1887216217,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1887216217 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 214004504,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 214004504 ns\nthreads: 1"
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
          "id": "3cb6920eae9814919e135d8715ef445f3c5cc8e0",
          "message": "chore: Lazy loading artifacts everywhere (#12285)\n\nThis PR adds the *option* to lazily load JSON artifacts in all the\npackages that were missing that functionality, further improving bundle\nsizes for the browser and allowing us to finally put limits on our\nexample apps bundle sizes:\n\n* `noir-protocol-circuits-types/vks`: now allow vk lazy imports via the\n`LazyArtifactProvider` in the `/client` export, while maintaining the\nbundled version for the server under `/server/vks`\n* `accounts`: Now all exports provide a lazy version, e.g:\n`@aztec/accounts/schnorr/lazy`. This has proven to be complicated due to\nthe testing import leaking into the browser (where type assertions are\nnot widely supported). Now there's also `/testing/lazy`. This testing\npackage is needed in the browser for the prefunded accounts.\n* `protocol-contracts`: Now with a lazy version and exporting\n`ProtocolContractProviders` so that PXE can be configured with bundled\nand lazy versions.\n\n\nBesides the type assertion issue, we absolutely want to keep bundled and\nlazy versions because some environments don't play well with `await\nimport` (namely service workers in firefox)\n\n---------\n\nCo-authored-by: esau <152162806+sklppy88@users.noreply.github.com>",
          "timestamp": "2025-02-26T19:56:40Z",
          "tree_id": "63024bdc8fea5767ee221e8d0791de57da85da45",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/3cb6920eae9814919e135d8715ef445f3c5cc8e0"
        },
        "date": 1740601561469,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18271.652731000133,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16225.018531 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18769.05979000003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16323.808413000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3963.6365950000254,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3162.7365649999992 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55260.706969,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55260707000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10194.521936,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10194525000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1910639338,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1910639338 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 217566535,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 217566535 ns\nthreads: 1"
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
            "email": "nicolas.venturo@gmail.com",
            "name": "Nicolás Venturo",
            "username": "nventuro"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "31c80347245f030ee6be4313e187cf000861556e",
          "message": "feat!: rename compute_nullifier_without_context (#12308)\n\nFollow up from #12240. This aligns both compute nullifier functions.\nWith the new metadata bits calling this is quite simple, and it's very\nclear that we're only using it for note discovery. Some macros were\nsimplified a bit as a result as well.",
          "timestamp": "2025-02-26T21:24:38Z",
          "tree_id": "654efb8f4f3a2d6ce25a22700ee689b5f2e91474",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/31c80347245f030ee6be4313e187cf000861556e"
        },
        "date": 1740607075371,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17980.09371099988,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15937.175013999999 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18543.606648999914,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16239.573944 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3917.8687190001256,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3071.3308740000007 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54764.119191,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54764115000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10786.79508,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10786797000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1912813568,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1912813568 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 213166604,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 213166604 ns\nthreads: 1"
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
            "email": "santiago@aztecprotocol.com",
            "name": "Santiago Palladino",
            "username": "spalladino"
          },
          "committer": {
            "email": "santiago@aztecprotocol.com",
            "name": "Santiago Palladino",
            "username": "spalladino"
          },
          "distinct": true,
          "id": "46ef22b9c0a2532aebe63c9b9fa2bf47cd4e2f56",
          "message": "revert: \"chore: Fix and reenable fees-settings test (#12302)\"\n\nThis reverts commit dbcb2b10ab1b85b675d83613aa527ca088964bd4.",
          "timestamp": "2025-02-26T19:17:27-03:00",
          "tree_id": "01d7b6451214a3eb54b68c5af730391f878988be",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/46ef22b9c0a2532aebe63c9b9fa2bf47cd4e2f56"
        },
        "date": 1740609244663,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18137.420160999965,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15986.934587999998 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18508.27914100006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16207.515645000001 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3885.8780129999673,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3041.6197289999996 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55340.671415000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55340670000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11588.661279,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11588665000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1921714664,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1921714664 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 213529522,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 213529522 ns\nthreads: 1"
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
          "id": "44748dd058d9fb162bdd9fa2e365e626ad437201",
          "message": "fix: slack notify was broken by quoted commit titles",
          "timestamp": "2025-02-26T15:50:54-07:00",
          "tree_id": "d7999ddd0f0847055a4b53f7f47a636db482c7a9",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/44748dd058d9fb162bdd9fa2e365e626ad437201"
        },
        "date": 1740611223485,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18138.099802999932,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16132.673616000002 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18538.52034199997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16108.854083999997 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3887.927434000062,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3040.731724 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54761.61181,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54761612000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9493.100714,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9493103000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1902488144,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1902488144 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 219882276,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 219882276 ns\nthreads: 1"
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
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "e83fe03b8fb93c990f332d3fb31ebc35cf9a1d19",
          "message": "feat: Slack message to ci channel tagging owners on flakes. (#12284)\n\n* .test_skip_patterns is now .test_patterns.yml and assigns owners to\ntests.\n* If in CI and a matching test fails, it doesnt fail the build but\nslacks the log to the owner.\n* Some additional denoise header metadata.\n* We still \"fail fast\" when doing a test run locally.",
          "timestamp": "2025-02-26T22:52:21Z",
          "tree_id": "4e461dc26b6f38542403a08ef9a318631b1345d9",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e83fe03b8fb93c990f332d3fb31ebc35cf9a1d19"
        },
        "date": 1740612120092,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18413.378018999992,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16299.849970000001 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18763.52351200012,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16369.790009999999 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4001.129346000198,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3150.7979550000005 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55032.740424,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55032741000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9293.240442999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9293242000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1912368646,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1912368646 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 212168083,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 212168083 ns\nthreads: 1"
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
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "f9f598d0692dd22471b563dbc95d0a1f2c3eb8af",
          "message": "chore: flakes. for lasse. (#12316)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\nline.",
          "timestamp": "2025-02-26T23:54:46Z",
          "tree_id": "38ad3c2ed1c6a3503196916cf9b3270c94a5a88e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f9f598d0692dd22471b563dbc95d0a1f2c3eb8af"
        },
        "date": 1740615639650,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18344.22951300007,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16226.207793 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18803.769282000074,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16294.932283000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4007.930801999919,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3203.6870959999997 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55156.586070000005,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55156587000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11084.904166,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11084907000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1900256770,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1900256770 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 214513016,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 214513016 ns\nthreads: 1"
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
          "id": "26195f7c43e781ddcc400e69a8d4d8820fdae85c",
          "message": "yolo e2e default reporter",
          "timestamp": "2025-02-27T09:28:10Z",
          "tree_id": "d32767a8697bb1459c2489fc159274994931d0b7",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/26195f7c43e781ddcc400e69a8d4d8820fdae85c"
        },
        "date": 1740651545760,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18176.63603899996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15970.775173 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18889.10868800008,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16396.421225 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4033.7630009998975,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3235.5141030000004 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55362.870863000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55362869000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11260.997604,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11261009000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1924542377,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1924542377 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 214893156,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 214893156 ns\nthreads: 1"
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
          "id": "107c41ca3586d5bba0d56be436a2b11af3721c76",
          "message": "yolo extend timeout on test-local",
          "timestamp": "2025-02-27T09:51:57Z",
          "tree_id": "d4f29e4ff0fd86a75827303e8441f97b9c8159e7",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/107c41ca3586d5bba0d56be436a2b11af3721c76"
        },
        "date": 1740651688791,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18230.892638000114,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16218.469577 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18838.092953000116,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16369.30958 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4050.763841999924,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3143.0653839999995 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55393.655284,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55393655000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11214.694132,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11214701000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1928175767,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1928175767 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 211582741,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 211582741 ns\nthreads: 1"
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
          "id": "a36334092980138bbe2e9f6e90aefd8489108e6a",
          "message": "docs: Fee concepts page (#12281)\n\nCloses: https://github.com/AztecProtocol/aztec-packages/issues/9619",
          "timestamp": "2025-02-27T10:11:42Z",
          "tree_id": "573882f9c281c6008b6bd37e37fef97e762d3254",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a36334092980138bbe2e9f6e90aefd8489108e6a"
        },
        "date": 1740652925490,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18003.203812000036,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15873.714796 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18552.717323000026,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16222.006871000001 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3863.161099000081,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3083.643147 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54631.362506000005,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54631364000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10960.663953000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10960671000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1910422777,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1910422777 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 215281950,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 215281950 ns\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2281.31",
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
          "id": "350e31cd53414f36066f5beb59cb25468f558d33",
          "message": "feat(avm): Scalar mul (#12255)\n\nImplement scalar mul gadget\n\n---------\n\nCo-authored-by: fcarreiro <facundo@aztecprotocol.com>",
          "timestamp": "2025-02-27T11:14:13+01:00",
          "tree_id": "8729721583669c556d45dc55511dac650db91e85",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/350e31cd53414f36066f5beb59cb25468f558d33"
        },
        "date": 1740653820925,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18301.66582999982,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16279.794327000001 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18784.85827500026,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16465.014841000004 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4048.8585950001834,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3227.9421199999997 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55294.992741,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55294993000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10851.714457,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10851715000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1885870961,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1885870961 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 213160237,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 213160237 ns\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2281.31",
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
          "id": "fd5623ff6400e72f1c1d44a79e74b32cb75d3ced",
          "message": "skip test-local as currently straight broken",
          "timestamp": "2025-02-27T11:06:46Z",
          "tree_id": "88c71c510d2c35ebb71fa90009c46f7de29d6633",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/fd5623ff6400e72f1c1d44a79e74b32cb75d3ced"
        },
        "date": 1740655548700,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17866.746497999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15770.071739 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18498.92563600008,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16011.8173 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3937.0831370000587,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3097.0220990000003 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54746.462700000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54746465000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11366.09799,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11366105000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1892177735,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1892177735 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 214794050,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 214794050 ns\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2281.31",
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
          "id": "e632bd7e58e31b19d5f85cb461d5b7ca80ece697",
          "message": "feat: expose bb_wasm_path in foundation and bb-prover (#12330)\n\nAllows alternative `.wasms` file to be loaded into `bb.js` from both\n`foundation` (and thus, `aztec.js`) and `bb-prover`.\n\nThis is useful in itself, but the aim of this PR is solving\nhttps://github.com/AztecProtocol/aztec-packages/issues/11963 by allowing\nbypassing the lazy loading of bb wasms (disguised as js files)\n\nThis PR also prepares boxes and playground for strict size limits by\nensuring no artifacts are included in main bundles.",
          "timestamp": "2025-02-27T13:18:24+01:00",
          "tree_id": "ac256f9679b19ed42fdbd61fe6f13a6f9fbcf961",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e632bd7e58e31b19d5f85cb461d5b7ca80ece697"
        },
        "date": 1740660719907,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18293.629009999902,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15995.684612 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18681.593179999938,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16476.041547 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3942.440311000155,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3161.642472 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55190.936725,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55190939000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10067.836023,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10067838000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1897233898,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1897233898 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 212535250,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 212535250 ns\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2281.31",
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
          "id": "2b94e626ed48195c2bf0a3b718751347699e827d",
          "message": "feat: add gates command for client_ivc in new cli (#12323)\n\n- Add --scheme flag for gates command in the new bb cli + implement for\nclient_ivc (use existing method)\n- Update usages in flamegraph and profiler (this was already broken as\nprevious `gates_for_ivc` command was moved under OLD_API flag)",
          "timestamp": "2025-02-27T12:42:28Z",
          "tree_id": "0b52941f50252a37745e84b5920ef8cd21b9360b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/2b94e626ed48195c2bf0a3b718751347699e827d"
        },
        "date": 1740662187935,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18278.924999000083,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15978.519194999999 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18875.075554999967,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16549.545395999998 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3936.8078879999757,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3154.7347390000004 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55604.984584,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55604985000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10837.111183,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10837118000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1911647599,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1911647599 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 215596943,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 215596943 ns\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2281.31",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
          "id": "7b7ef154eb6bbe802bce89518a15d4aaed194565",
          "message": "refactor: run separate anvils for the l1 cheatcode tests (#12334)",
          "timestamp": "2025-02-27T12:55:00Z",
          "tree_id": "7b168d4ba6899627cd59b43759cb1ef61b148022",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7b7ef154eb6bbe802bce89518a15d4aaed194565"
        },
        "date": 1740662764057,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18270.141677000083,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16127.697770999997 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18777.5182219998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16372.404836999998 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3967.964168000208,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3198.9219090000006 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55022.847493,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55022852000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10283.098544000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10283104000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1911372272,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1911372272 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 220355679,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 220355679 ns\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2281.31",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "mvezenov@gmail.com",
            "name": "Maxim Vezenov",
            "username": "vezenovm"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "ed3249904bf113ff2818499eff15069a5192c455",
          "message": "fix(aztec-nr): Use mutable ref when mutating variable in closure (#12311)\n\nPost https://github.com/noir-lang/noir/pull/7488 aztec-nr is going to\nfail to compile as we now explicitly error when attempting to use a\ncapture mutably (lambda captures are meant to be entirely immutable).\nThe current code only worked because it was done at comptime.",
          "timestamp": "2025-02-27T13:29:23Z",
          "tree_id": "66e68fc5570f89932425f42620c86cc7b3b815ac",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ed3249904bf113ff2818499eff15069a5192c455"
        },
        "date": 1740665206187,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18330.625191999843,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16158.300750000002 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18840.65656300004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16430.807674 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3994.051480000053,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3193.1216780000004 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55007.640242999994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55007640000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9571.853281000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9571861000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1902591005,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1902591005 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 215236958,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 215236958 ns\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2281.31",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
          "id": "393a2df61356b90fc3c89a9af2423e1739bea733",
          "message": "chore: bump time to notice prune to 1s in slasher_client test (#12336)",
          "timestamp": "2025-02-27T14:32:34Z",
          "tree_id": "af073b02cefc08458fe7db044de36c07c06e8ebc",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/393a2df61356b90fc3c89a9af2423e1739bea733"
        },
        "date": 1740668952189,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18286.027038000157,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16164.096849 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18765.74957899993,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16296.859296 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3928.9755610000157,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3120.13758 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54903.084396,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54903085000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9981.935817,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9981938000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1898653585,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1898653585 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 212950689,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 212950689 ns\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2281.31",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
          "id": "8181149877386eca54ee7a8b578a68ccb0c9585e",
          "message": "fix: make block number in txe make sense (#11807)\n\nRight now `env.block_number()` returns the block number that is\ncurrently being built, as per an arbitrary choice when creating the TXe.\n\nBut this has a strange side effect of the current block (from the\nheader) and `env.block_number()` not matching up. The current header has\n`env.block_number() - 1` because the current header reflects the state\nof the last committed block.\n\nBefore this mattered less because we couldn't do historical proofs, and\nbecause we had less of a notion of \"correctness\" in blocks but now due\nto the changes this makes sense to change.\n\n---------\n\nCo-authored-by: benesjan <janbenes1234@gmail.com>",
          "timestamp": "2025-02-28T00:56:52+09:00",
          "tree_id": "a0f65e9c893095731465799cf250fd107b397440",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8181149877386eca54ee7a8b578a68ccb0c9585e"
        },
        "date": 1740674081232,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18267.676931000096,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16197.836061 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18783.73483900009,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16513.480575 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3955.0182509997285,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3178.1439890000006 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55000.963178,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55000964000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9752.227081,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9752233000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1942346365,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1942346365 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 213344019,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 213344019 ns\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2281.31",
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