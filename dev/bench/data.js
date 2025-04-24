window.BENCHMARK_DATA = {
  "lastUpdate": 1745531394009,
  "repoUrl": "https://github.com/AztecProtocol/aztec-packages",
  "entries": {
    "C++ Benchmark": [
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
        "date": 1744925715999,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm",
            "value": 66363,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm-memory",
            "value": 2187,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm",
            "value": 40164,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm-memory",
            "value": 1877,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm",
            "value": 25792,
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
            "value": 29053,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm-memory",
            "value": 1814,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm",
            "value": 36076,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm-memory",
            "value": 1832,
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
          "id": "7ab712db9c5dc8d0fc13d39dfe32e4f9464bc668",
          "message": "fix: native ivc benches not publishing (#13665)\n\nThis script needs to be made more elegant in a future pass, probably\nalong with a big cleanup of the benchmark names (most of the reason it\nis ugly is for backwards-compatibility)",
          "timestamp": "2025-04-17T22:31:18Z",
          "tree_id": "b7dc26f039f446388e07d9842dc5d7a4de7d018f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7ab712db9c5dc8d0fc13d39dfe32e4f9464bc668"
        },
        "date": 1744932551007,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17300.50209000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13633.887428 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2241978344,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 192144133,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 19868.381009999895,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16774.305066 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 56058.333071,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 56058334000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4390.458263000028,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3856.403866 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 12041.186498000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 12041191000 ms\nthreads: 1"
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
            "email": "98505400+ledwards2225@users.noreply.github.com",
            "name": "ledwards2225",
            "username": "ledwards2225"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": false,
          "id": "c8acae09dece27addbdce266be703a487be4d862",
          "message": "chore: delete zeromorph (#13667)\n\nWe're not going to use Zeromorph. The time has come to let it go.",
          "timestamp": "2025-04-17T23:35:07Z",
          "tree_id": "473722d9397f4fc995b3caaf47ceb4b64eebcf5c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c8acae09dece27addbdce266be703a487be4d862"
        },
        "date": 1744937512493,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17247.082002999832,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13596.980415999999 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2214721126,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 192570495,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 19899.809678999874,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16660.257318000004 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 56148.33418,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 56148336000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4311.775018999924,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3805.2854859999998 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11973.305765,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11973308000 ms\nthreads: 1"
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
            "email": "98505400+ledwards2225@users.noreply.github.com",
            "name": "ledwards2225",
            "username": "ledwards2225"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": false,
          "id": "c8acae09dece27addbdce266be703a487be4d862",
          "message": "chore: delete zeromorph (#13667)\n\nWe're not going to use Zeromorph. The time has come to let it go.",
          "timestamp": "2025-04-17T23:35:07Z",
          "tree_id": "473722d9397f4fc995b3caaf47ceb4b64eebcf5c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c8acae09dece27addbdce266be703a487be4d862"
        },
        "date": 1744937522577,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm",
            "value": 66357,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm-memory",
            "value": 2231,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm",
            "value": 39997,
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
            "value": 26951,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm-memory",
            "value": 1689,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm",
            "value": 29192,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm-memory",
            "value": 1841,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm",
            "value": 36087,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm-memory",
            "value": 1804,
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
          "distinct": false,
          "id": "ae578a28d7b50bf7a388af58e3cd24c90dbf315c",
          "message": "chore: delete Ultra Vanilla CIVC (#13669)\n\nThis was an experimental class introduced by Cody for doing \"vanilla\" UH\nrecursion with an interface similar to CIVC. Aside from the fact that we\nhave no need for something like this, it has no hope of being useful\nbecause it relies on the mechanism of appending recursive verifiers to\ninput circuits, similar to our original design for CIVC. This isn't\nsound because there's no way for the verifier to know that the recursive\nverifications were performed. This is precisely why Aztec has kernel\ncircuits which are specifically designed to perform recursion and are\nfixed by the protocol.",
          "timestamp": "2025-04-17T23:52:35Z",
          "tree_id": "2650a4cc2dda03eee53e7dd543888d0ad4f190ed",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ae578a28d7b50bf7a388af58e3cd24c90dbf315c"
        },
        "date": 1744938446588,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17450.653348000287,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13667.627040000001 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2227764007,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 189780097,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 19934.52844500007,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16915.311427 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 56512.981077,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 56512979000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4275.240779999422,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3660.2270139999996 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 12109.321742999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 12109324000 ms\nthreads: 1"
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
            "email": "98505400+ledwards2225@users.noreply.github.com",
            "name": "ledwards2225",
            "username": "ledwards2225"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": false,
          "id": "ae578a28d7b50bf7a388af58e3cd24c90dbf315c",
          "message": "chore: delete Ultra Vanilla CIVC (#13669)\n\nThis was an experimental class introduced by Cody for doing \"vanilla\" UH\nrecursion with an interface similar to CIVC. Aside from the fact that we\nhave no need for something like this, it has no hope of being useful\nbecause it relies on the mechanism of appending recursive verifiers to\ninput circuits, similar to our original design for CIVC. This isn't\nsound because there's no way for the verifier to know that the recursive\nverifications were performed. This is precisely why Aztec has kernel\ncircuits which are specifically designed to perform recursion and are\nfixed by the protocol.",
          "timestamp": "2025-04-17T23:52:35Z",
          "tree_id": "2650a4cc2dda03eee53e7dd543888d0ad4f190ed",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ae578a28d7b50bf7a388af58e3cd24c90dbf315c"
        },
        "date": 1744938455800,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 24277,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-add-liquidity-ivc-proof-memory",
            "value": 1350,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm",
            "value": 66397,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm-memory",
            "value": 2112,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 14709,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof-memory",
            "value": 1012,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm",
            "value": 40796,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm-memory",
            "value": 1820,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8321,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof-memory",
            "value": 939,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm",
            "value": 26792,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm-memory",
            "value": 1753,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 9189,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof-memory",
            "value": 950,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm",
            "value": 28346,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm-memory",
            "value": 1881,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 10546,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof-memory",
            "value": 951,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm",
            "value": 35426,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm-memory",
            "value": 1861,
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
          "id": "ac95729957e0ff9da11d18c38c379790545db154",
          "message": "chore: delete honk_recursion for building ACIR (#13664)\n\nCloses https://github.com/AztecProtocol/barretenberg/issues/1013 in the\ncontext for building ACIR.\n\nWhen we updated verify_proof_with_type to no longer default to plonk\nproofs, we forgot to also delete some hacky code wrt using the\nhonk_recursion flag for figuring out which recursive verifier to use.\nSince we always receive the proof type through the actual constraint,\nthere's no need to use the honk_recursion flag to pick this out, so it\ncan be completely removed for this context.",
          "timestamp": "2025-04-18T00:28:05Z",
          "tree_id": "92fcf62505cd9d569001e169175debadebcda1f7",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ac95729957e0ff9da11d18c38c379790545db154"
        },
        "date": 1744942638125,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17236.871326000255,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13691.086407 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2242778200,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 196190392,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 19901.43711499968,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16979.553810999998 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 56471.391077,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 56471392000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4282.613527999729,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3687.742033 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 12005.139685,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 12005143000 ms\nthreads: 1"
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
          "id": "ac95729957e0ff9da11d18c38c379790545db154",
          "message": "chore: delete honk_recursion for building ACIR (#13664)\n\nCloses https://github.com/AztecProtocol/barretenberg/issues/1013 in the\ncontext for building ACIR.\n\nWhen we updated verify_proof_with_type to no longer default to plonk\nproofs, we forgot to also delete some hacky code wrt using the\nhonk_recursion flag for figuring out which recursive verifier to use.\nSince we always receive the proof type through the actual constraint,\nthere's no need to use the honk_recursion flag to pick this out, so it\ncan be completely removed for this context.",
          "timestamp": "2025-04-18T00:28:05Z",
          "tree_id": "92fcf62505cd9d569001e169175debadebcda1f7",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ac95729957e0ff9da11d18c38c379790545db154"
        },
        "date": 1744942647493,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 24598,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-add-liquidity-ivc-proof-memory",
            "value": 1361,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm",
            "value": 66607,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm-memory",
            "value": 2227,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 14634,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof-memory",
            "value": 1007,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm",
            "value": 40663,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm-memory",
            "value": 1744,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8242,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof-memory",
            "value": 929,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm",
            "value": 25880,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm-memory",
            "value": 1707,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 9096,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof-memory",
            "value": 953,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm",
            "value": 29921,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm-memory",
            "value": 1778,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 10773,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof-memory",
            "value": 950,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm",
            "value": 36130,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm-memory",
            "value": 1811,
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
          "id": "017b00c0af3b1dc24edba931f7a3954e0c1df962",
          "message": "git subrepo push --branch=master noir-projects/aztec-nr\n\nsubrepo:\n  subdir:   \"noir-projects/aztec-nr\"\n  merged:   \"cbd6906369\"\nupstream:\n  origin:   \"https://github.com/AztecProtocol/aztec-nr\"\n  branch:   \"master\"\n  commit:   \"cbd6906369\"\ngit-subrepo:\n  version:  \"0.4.6\"\n  origin:   \"???\"\n  commit:   \"???\"",
          "timestamp": "2025-04-18T02:29:36Z",
          "tree_id": "b29387310112df4907b643d1d78c73233437d243",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/017b00c0af3b1dc24edba931f7a3954e0c1df962"
        },
        "date": 1744945375224,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 24439,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-add-liquidity-ivc-proof-memory",
            "value": 1351,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm",
            "value": 66947,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm-memory",
            "value": 2129,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 14709,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof-memory",
            "value": 1010,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm",
            "value": 39905,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm-memory",
            "value": 1826,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8217,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof-memory",
            "value": 942,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm",
            "value": 26910,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm-memory",
            "value": 1766,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 9134,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof-memory",
            "value": 951,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm",
            "value": 28244,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm-memory",
            "value": 1813,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 10717,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof-memory",
            "value": 949,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm",
            "value": 36103,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm-memory",
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
          "id": "ff29d8668fcad9001f701144918346849174fea1",
          "message": "chore: remove msm sorter (#13668)\n\nThe `MsmSorter` class contained logic to sort the inputs to an MSM\n{scalars, points} by scalar, sum the points sharing a scalar, then\nperform the MSM on the reduced result. This was motivated by the need to\ncommit to z_perm in the structured setting where the coefficients are\nconstant over large ranges. Turns out though that since our polys have a\nwell defined structure, its much better to simply provide the constant\nranges explicitly rather than sorting then adding. Much of the logic of\nthis class was repurposed into `BatchedAffineAddition` which is what\nsupports our `commit_structured_with_nonzero_complement` method (used\nfor `z_perm`).",
          "timestamp": "2025-04-18T03:30:02Z",
          "tree_id": "4a8c32ee1582651f4cbb043e49320477688d01b8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ff29d8668fcad9001f701144918346849174fea1"
        },
        "date": 1744950227522,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17223.11388100002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13578.593235000002 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2266459460,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 206129797,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 19880.44844299998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16729.324527 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 56264.38486,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 56264386000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4319.112354999788,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3803.0096720000006 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11945.283787999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11945288000 ms\nthreads: 1"
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
          "id": "ff29d8668fcad9001f701144918346849174fea1",
          "message": "chore: remove msm sorter (#13668)\n\nThe `MsmSorter` class contained logic to sort the inputs to an MSM\n{scalars, points} by scalar, sum the points sharing a scalar, then\nperform the MSM on the reduced result. This was motivated by the need to\ncommit to z_perm in the structured setting where the coefficients are\nconstant over large ranges. Turns out though that since our polys have a\nwell defined structure, its much better to simply provide the constant\nranges explicitly rather than sorting then adding. Much of the logic of\nthis class was repurposed into `BatchedAffineAddition` which is what\nsupports our `commit_structured_with_nonzero_complement` method (used\nfor `z_perm`).",
          "timestamp": "2025-04-18T03:30:02Z",
          "tree_id": "4a8c32ee1582651f4cbb043e49320477688d01b8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ff29d8668fcad9001f701144918346849174fea1"
        },
        "date": 1744950239934,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 24753,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-add-liquidity-ivc-proof-memory",
            "value": 1358,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm",
            "value": 66636,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm-memory",
            "value": 2227,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 14872,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof-memory",
            "value": 1013,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm",
            "value": 40930,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm-memory",
            "value": 1846,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8230,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof-memory",
            "value": 937,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm",
            "value": 26277,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm-memory",
            "value": 1738,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 9174,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof-memory",
            "value": 953,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm",
            "value": 28642,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm-memory",
            "value": 1764,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 10798,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof-memory",
            "value": 955,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm",
            "value": 36207,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm-memory",
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
          "id": "49db37e5b21a705f8fca5aa47d4f6d80b2b151ba",
          "message": "fix: benchmarks (#13794)\n\nthey were silently failing. Make them no longer silently fail as this\nwill just report an X on master - good info",
          "timestamp": "2025-04-24T14:46:37Z",
          "tree_id": "2140cfc4ad597fd48ab597d25ce7f04f7605b57d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/49db37e5b21a705f8fca5aa47d4f6d80b2b151ba"
        },
        "date": 1745509406947,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17258.41857,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13593.065635 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2282087390,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 198883492,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 19787.867478000182,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16665.177412 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 56168.729812000005,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 56168731000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4288.031822999983,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3763.0103630000003 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11966.047415000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11966051000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2231.75",
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
          "id": "dd59a7f3e2fc21777255e7c47a559cf7f5e84e4a",
          "message": "fix(bb/cmake): LMDB build is NOT the father (#13797)\n\nWhen it comes to the lmdb.h file from lmdb dependency, the build has\nnothing to do with it. I got into wrong thinking assuming that @alexghr\nadded this because it was a generated header. This explains why this was\nseemingly pattern-following yet caused issues. Adding this line only\nencouraged cmake to clean this up thinking lmdb would build it - when\ninstead it failed, complaining about it missing\n\n(We had not hit the issue in a while, then Kesha said he was hitting it\nconsistently, which let us confirm this as a fix)",
          "timestamp": "2025-04-24T15:38:29Z",
          "tree_id": "e098ca91ef7bc3c0fb380a535e0ad852df65a299",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/dd59a7f3e2fc21777255e7c47a559cf7f5e84e4a"
        },
        "date": 1745514019268,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17412.624287999963,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13744.460052999999 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2240147439,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 196049173,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 19827.708418000155,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16704.656963999998 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 56364.166660999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 56364168000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4241.357553999933,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3646.7138170000003 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11967.519659999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11967524000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2231.75",
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
          "distinct": false,
          "id": "1f9603eefccf7d9bbb12df086b10c949a880e8c3",
          "message": "feat: Store epoch proving job failure (#13752)\n\nAdds a config `PROVER_NODE_FAILED_EPOCH_STORE` pointing to a local\ndirectory or google storage. If set, when an epoch proving job fails, it\nuploads a snapshot of the archiver and world state, along with all txs,\nblocks, and cross-chain messages involved in the epoch, so we can\n(hopefully) reconstruct state at the time of the failure.\n\nRe-running is done via two new actions: one for downloading, another for\nactually proving. Proving is done with a local prover, which should be\ngood enough for debugging smallish epochs, but we can extend this to use\na remote broker if we need more horsepower. See\n`end-to-end/src/e2e_epochs/epochs_upload_failed_proof.test.ts` for an\nend-to-end on how to use these actions (with real proofs disabled).\n\nPending add the env var to the prover node in k8s, and cherry-pick to\nthe alpha-testnet branch once merged.\n\nFixes #13725",
          "timestamp": "2025-04-24T16:17:02Z",
          "tree_id": "8bfe068c3e5eba659247d52b2901a28c6f73a04c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1f9603eefccf7d9bbb12df086b10c949a880e8c3"
        },
        "date": 1745516637475,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 24322,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-add-liquidity-ivc-proof-memory",
            "value": 1354,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm",
            "value": 65650,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm-memory",
            "value": 2140,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 14657,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof-memory",
            "value": 1010,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm",
            "value": 40152,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm-memory",
            "value": 1869,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8117,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof-memory",
            "value": 929,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm",
            "value": 26207,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm-memory",
            "value": 1777,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 9274,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof-memory",
            "value": 939,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm",
            "value": 29317,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm-memory",
            "value": 1834,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 10626,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof-memory",
            "value": 941,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm",
            "value": 36117,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm-memory",
            "value": 1806,
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
          "id": "34538b29316cb9cbbbf792d11c814108b549b924",
          "message": "fix: Handle undefined proverCoordinationNodeUrls (#13804)\n\nGot hit by the following when deploying:\n\n```\nTypeError: Cannot read properties of undefined (reading 'length') at createProverCoordination (file:///usr/src/yarn-project/prover-node/dest/prover-coordination/factory.js:35:43) at createProverNode (file:///usr/src/yarn-project/prover-node/dest/factory.js:50:38) at process.processTicksAndRejections (node:internal/process/task_queues:95:5) at async startProverNode (file:///usr/src/yarn-project/aztec/dest/cli/cmds/start_prover_node.js:81:24) at async aztecStart (file:///usr/src/yarn-project/aztec/dest/cli/aztec_start_action.js:54:27) at async Command.<anonymous> (file:///usr/src/yarn-project/aztec/dest/cli/cli.js:17:16) at async Command.parseAsync (/usr/src/yarn-project/node_modules/commander/lib/command.js:1092:5) at async main (file:///usr/src/yarn-project/aztec/dest/bin/index.js:48:5)\n```",
          "timestamp": "2025-04-24T18:37:31Z",
          "tree_id": "a83565ceeddcc1f237aa03cd05a9da70c4ea264a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/34538b29316cb9cbbbf792d11c814108b549b924"
        },
        "date": 1745523414614,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 24414,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-add-liquidity-ivc-proof-memory",
            "value": 1345,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm",
            "value": 66431,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm-memory",
            "value": 2210,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 14610,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof-memory",
            "value": 1012,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm",
            "value": 42231,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm-memory",
            "value": 1786,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8163,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof-memory",
            "value": 925,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm",
            "value": 26817,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm-memory",
            "value": 1723,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 9057,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof-memory",
            "value": 939,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm",
            "value": 28437,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm-memory",
            "value": 1803,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 10634,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof-memory",
            "value": 937,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm",
            "value": 35895,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm-memory",
            "value": 1804,
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
          "id": "549c254cf89e44fdf883d0950dae36e50822c28f",
          "message": "chore: skip hinting for tree padding (#13818)\n\nBefore\n\n![image](https://github.com/user-attachments/assets/2933fef3-a1b5-45e4-882a-b6374d1682dc)\n\nAfter\n\n![image](https://github.com/user-attachments/assets/6e1b2db9-7e9d-49d5-acdf-810f1901c210)\n\nCo-authored-by: dbanks12 <david@aztecprotocol.com>",
          "timestamp": "2025-04-24T18:39:32Z",
          "tree_id": "5737334c0287e11c1f539123c12c9fec9c39f2f7",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/549c254cf89e44fdf883d0950dae36e50822c28f"
        },
        "date": 1745524721470,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 24468,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-add-liquidity-ivc-proof-memory",
            "value": 1349,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm",
            "value": 65980,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm-memory",
            "value": 2253,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 14658,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof-memory",
            "value": 1010,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm",
            "value": 40426,
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
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8081,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof-memory",
            "value": 927,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm",
            "value": 26797,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm-memory",
            "value": 1667,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 9209,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof-memory",
            "value": 938,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm",
            "value": 28088,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm-memory",
            "value": 1744,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 10708,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof-memory",
            "value": 938,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm",
            "value": 37023,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm-memory",
            "value": 1814,
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
          "distinct": true,
          "id": "d9146b29f07702a40dec81937e3703c97de701df",
          "message": "refactor(avm): some fixes and faster tests (#13785)\n\nThis PR does a few things\n* Improves the way to check for previously initialized polynomials in\n`compute_polynomials`.\n* Removes `AllConstRefEntities` from the flavor, and also\n`get_standard_row` from the polys. This is not used in \"prod\" and was\nonly used for check_circut and other things.\n* Creates an equivalent concept of `AvmFullRowConstRef` which is a row\nof references, similar to what was `AllConstRefEntities`.\n* We now use the above directly in check_circuit AND in tests, which\navoids creating full rows of fields.\n* This allowed some simplifications in `check_relation`.\n\nSome improvements: running all C++ VM2 tests (without goblin):\n* Before: 43s\n* After: 15s",
          "timestamp": "2025-04-24T18:47:23Z",
          "tree_id": "5962714a705727335143ee5ce153a9c9a16d5e19",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d9146b29f07702a40dec81937e3703c97de701df"
        },
        "date": 1745526421444,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17282.51378999994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13587.359328999999 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2205205159,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 201381325,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 19768.73753300015,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16750.855980999997 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 56451.044862,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 56451045000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4347.910818999935,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3717.1811049999997 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 12027.949297,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 12027954000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2231.75",
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
          "id": "d9146b29f07702a40dec81937e3703c97de701df",
          "message": "refactor(avm): some fixes and faster tests (#13785)\n\nThis PR does a few things\n* Improves the way to check for previously initialized polynomials in\n`compute_polynomials`.\n* Removes `AllConstRefEntities` from the flavor, and also\n`get_standard_row` from the polys. This is not used in \"prod\" and was\nonly used for check_circut and other things.\n* Creates an equivalent concept of `AvmFullRowConstRef` which is a row\nof references, similar to what was `AllConstRefEntities`.\n* We now use the above directly in check_circuit AND in tests, which\navoids creating full rows of fields.\n* This allowed some simplifications in `check_relation`.\n\nSome improvements: running all C++ VM2 tests (without goblin):\n* Before: 43s\n* After: 15s",
          "timestamp": "2025-04-24T18:47:23Z",
          "tree_id": "5962714a705727335143ee5ce153a9c9a16d5e19",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d9146b29f07702a40dec81937e3703c97de701df"
        },
        "date": 1745526432176,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 24433,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-add-liquidity-ivc-proof-memory",
            "value": 1350,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm",
            "value": 66457,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm-memory",
            "value": 2206,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 14688,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof-memory",
            "value": 1011,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm",
            "value": 41376,
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
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8242,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof-memory",
            "value": 928,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm",
            "value": 27204,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm-memory",
            "value": 1776,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 9082,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof-memory",
            "value": 940,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm",
            "value": 28067,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm-memory",
            "value": 1831,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 10713,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof-memory",
            "value": 940,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm",
            "value": 36064,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm-memory",
            "value": 1798,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "helloworld@mcgee.cat",
            "name": "Cat McGee",
            "username": "catmcgee"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": false,
          "id": "115611990d3a57bba60b5dde06929452ddac6c3a",
          "message": "feat(docs): \"try testnet\" collation page (#11299)\n\nCloses https://github.com/AztecProtocol/aztec-packages/issues/10493\nCloses https://github.com/AztecProtocol/aztec-packages/issues/10538\nCloses https://github.com/AztecProtocol/aztec-packages/issues/11723\n\nnot fully ready for review but i'd appreciate a look on the \"try\ntestnet\" and \"getting started with testnet\" pages\n\n---------\n\nCo-authored-by: Rahul Kothari <rahul.kothari.201@gmail.com>\nCo-authored-by: josh crites <critesjosh@gmail.com>\nCo-authored-by: Josh Crites <jc@joshcrites.com>",
          "timestamp": "2025-04-24T20:38:35Z",
          "tree_id": "baaa80f4982ace9166b414dd47fb379d807004a0",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/115611990d3a57bba60b5dde06929452ddac6c3a"
        },
        "date": 1745531385145,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 24262,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-add-liquidity-ivc-proof-memory",
            "value": 1352,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm",
            "value": 66757,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-add-liquidity-ivc-proof-wasm-memory",
            "value": 2198,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 14615,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof-memory",
            "value": 1012,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm",
            "value": 41283,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmamm-swap-exact-tokens-ivc-proof-wasm-memory",
            "value": 1835,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8191,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof-memory",
            "value": 926,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm",
            "value": 26719,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-mint-ivc-proof-wasm-memory",
            "value": 1750,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 9118,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof-memory",
            "value": 937,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm",
            "value": 28297,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmnft-transfer-in-private-ivc-proof-wasm-memory",
            "value": 1794,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 10570,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof-memory",
            "value": 941,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm",
            "value": 36283,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "wasmtoken-transfer-ivc-proof-wasm-memory",
            "value": 1827,
            "unit": "MB/iter",
            "extra": "iterations: undefined\ncpu: undefined MB\nthreads: undefined"
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