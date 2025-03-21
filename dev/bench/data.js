window.BENCHMARK_DATA = {
  "lastUpdate": 1742589984995,
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
          "id": "2c89970c2142bd6934e4dcf81f1a00c36d083f07",
          "message": "fix: make bb mac workaround kick off automatically (#12651)\n\nThis will streamline the release process until this is fully done with\ncross compiles",
          "timestamp": "2025-03-14T03:16:14+09:00",
          "tree_id": "b38c167ad3950486909724a442b6668d4323fea5",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/2c89970c2142bd6934e4dcf81f1a00c36d083f07"
        },
        "date": 1741891596465,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18025.996274999896,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15921.379896 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18612.458613999934,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16298.042681000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3796.088232999864,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3034.4858019999997 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54760.601221,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54760602000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10899.427848999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10899432000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1613359844,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1613359844 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 219125869,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 219125869 ns\nthreads: 1"
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
          "id": "52575d82279e5bc8caca5922289aa2e8e157f4a3",
          "message": "fix: bench upload logic (#12800)",
          "timestamp": "2025-03-17T11:37:35-04:00",
          "tree_id": "f85f248ba089bfb563198b0616a75af2f242be15",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/52575d82279e5bc8caca5922289aa2e8e157f4a3"
        },
        "date": 1742227405065,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17872.0024050001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15772.682208999999 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 117748255211.3,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 1601237449,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 213375376,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18574.36891899988,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16171.600753 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54385.582372000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54385582000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3782.039356000041,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 2993.9132879999997 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10159.238985,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10159242000 ms\nthreads: 1"
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
          "id": "100d31fa2b017617d8c4238c2e819f0ae653b074",
          "message": "chore: Update references to GH issues to reflect recent changes (#12722)\n\nAfter looking over all of the Barretenberg issues, and closing some, I\nhave gone through the monorepo to remove any stale references to these\nissues. In a small number of cases I opened a new, issue which was a\nrefinement of the previous issue, and in the case of slab allocation I\nleft the stale issues in since I thought it could be helpful if that\nissue is ever reopened.",
          "timestamp": "2025-03-17T12:43:04-04:00",
          "tree_id": "28295b0e830468823f3bd0560d9735c4e8e8a8aa",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/100d31fa2b017617d8c4238c2e819f0ae653b074"
        },
        "date": 1742232144967,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18190.259972999684,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15972.490602 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 117757453489.99998,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 1658364393,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 231266845,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18815.73351499992,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16326.429828999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55050.549125,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55050550000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3902.314273999764,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3071.8012270000004 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10043.984663,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10043992000 ms\nthreads: 1"
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
          "id": "2fd47f674f487c1b8f3c4389abf2124e73d0da6a",
          "message": "fix: update join split test hash (#12798)\n\nUpdate the circuit hash in a join split test. This changes all the time\nbut the test is currently skipped on CI so whoever pushed the PR that\nchanged it wasn't alerted. May wind up deleting these altogether at some\npoint soon.",
          "timestamp": "2025-03-17T10:21:52-07:00",
          "tree_id": "0ad157348b4df3c91eecf9e662f58f43bf95a9c4",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/2fd47f674f487c1b8f3c4389abf2124e73d0da6a"
        },
        "date": 1742234387627,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18165.535497000063,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15997.693997999999 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 117765486863.39998,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 1625114514,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 226682897,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18809.234265999978,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16498.861259 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55069.784941000005,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55069784000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3867.609295999955,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3113.705645 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10674.185683000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10674189000 ms\nthreads: 1"
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
          "id": "392abc287812ccee2fc8be14132fda74d1e95672",
          "message": "fix: redo \"fix: make vk metadata actual witnesses\" (#12535)\n\nReverts AztecProtocol/aztec-packages#12534. This was reverted due to\nbreaking e2e-prover-full\n\nCo-authored-by: Lucas Xia <lucasxia01@gmail.com>",
          "timestamp": "2025-03-17T13:29:08-04:00",
          "tree_id": "c8b56e6e40987052267cbfb0153b9fd57ab78b23",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/392abc287812ccee2fc8be14132fda74d1e95672"
        },
        "date": 1742234783501,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18574.072044000102,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16226.711718 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 117735958245.4,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 1617690716,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 218901781,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18900.791500999956,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16437.75797 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55143.730713,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55143731000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3842.8058100000726,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3117.095798 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10255.291738,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10255297000 ms\nthreads: 1"
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
          "id": "95a0ec174a7ad07c5584d6d2f9b8a775321a1f50",
          "message": "fix: cpp ivc bench (#12815)",
          "timestamp": "2025-03-17T17:09:25-04:00",
          "tree_id": "e4001bdc4a05daba47780670a9df9535d5d67e25",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/95a0ec174a7ad07c5584d6d2f9b8a775321a1f50"
        },
        "date": 1742250236941,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 38827,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 25561,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17936.281925000003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15812.969825999999 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 117735720600.2,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 1615088593,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 212688333,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18693.395686000033,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16325.580334000002 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54645.949759,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54645948000 ms\nthreads: 1"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 11407,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 14326,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 14916,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3801.58626299999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3032.9817489999996 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10368.054414999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10368058000 ms\nthreads: 1"
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
          "id": "189fc8388831f0d36b7c0d8de96fca9d1ce6f07a",
          "message": "Merge branch 'master' of github.com:aztecprotocol/aztec-packages",
          "timestamp": "2025-03-18T15:53:11Z",
          "tree_id": "9390dd7bc74e3b988b4d223ec2ea66c544feb74a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/189fc8388831f0d36b7c0d8de96fca9d1ce6f07a"
        },
        "date": 1742314357150,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 39382,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 26677,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18350.029480000103,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16016.392651999997 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 117856246462.2,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 1602256987,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 224858140,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18693.264371999932,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16265.676263000003 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55235.565342999995,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55235566000 ms\nthreads: 1"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 11891,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 14768,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 15552,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3918.1659020002826,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3156.307688 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11261.815299000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11261819000 ms\nthreads: 1"
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
          "id": "233ca3eb21fdd04ac676f37b21ef4d0b7c74932a",
          "message": "chore(avm): vm2 lazy bytecode loading (#12847)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this line.",
          "timestamp": "2025-03-18T17:05:48Z",
          "tree_id": "8d76e428c46cc3913396ecc13090f10fed566aa5",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/233ca3eb21fdd04ac676f37b21ef4d0b7c74932a"
        },
        "date": 1742320083675,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 39434,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 26440,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18152.584247999584,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15985.96143 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 117831117316.90001,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 1597585979,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 213587133,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18710.20141500003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16279.589767000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55085.688323,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55085688000 ms\nthreads: 1"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 11799,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 14540,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 14990,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3932.0093040000756,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3136.8573890000002 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11349.533999000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11349538000 ms\nthreads: 1"
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
          "id": "04981e2a395e51cd07a398c173d55a3a3a53ae44",
          "message": "refactor(avm): vm2 recursive execution (#12842)\n\nAfter discussions with @IlyasRidhuan we think this is the most viable\npath to make things work for CALL and context management.",
          "timestamp": "2025-03-19T23:10:37+08:00",
          "tree_id": "363b64f68372aa2a122218855730d4bdbcc0fe17",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/04981e2a395e51cd07a398c173d55a3a3a53ae44"
        },
        "date": 1742398748550,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 34003,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 22356,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17115.814393999928,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15113.863798999999 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 117822023765.3,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 1495092600,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 203417844,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 17996.02665499992,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15474.759369000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 49957.784125,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 49957785000 ms\nthreads: 1"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 10755,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 13018,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 13339,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3362.6136400000632,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 2963.554606 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 8840.967408,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 8840968000 ms\nthreads: 1"
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
          "id": "65bd2764bdeafe6f2d259600b809d002c49e74fd",
          "message": "feat: precomputed ClientIVC VKs (#12126)\n\nAfter this PR, we no longer rely on a user provided vk when verifying\ncivc proofs. This was insecure.\n\n`yarn-project/bb-prover` now has a `yarn generate` step that creates two\nfiles in `yarn-project/bb-prover/artifacts`: `private-civc-vk` and\n`public-civc-vk`. These correspond to clientivc stacks that end in the\nprivate and public tail, respectively.\n\nThis is achieved by pinning historic CIVC inputs and using one public\nand private example, respectively. If the number of public inputs in the\ntail circuits, or the fundamental structure, change we will need to bump\nthis. This pinning will be obsoleted by\nhttps://github.com/AztecProtocol/barretenberg/issues/1296.\n\nThe write_vk command **is to be considered undocumented**. It is subject\nto change. Namely, a future simplification\n(https://github.com/AztecProtocol/barretenberg/issues/1296) will make it\nnot take an ivc stack. Original comments by Cody below:\n```\nAdd a write_vk command to generate a vk for generating ClientIVC proofs. This consists of: a vk for 'the' hiding circuit, a vk for the ECCVM and a vk for the Translator. The later two could and perhaps should go away in the future since they are actually just fixed constants known at C++ compile time. The former sounds like a constant, but in fact the key depends on the number of outputs of the final circuit in a stack to be verified. At the moment the two possibilities in our system are the private kernel tail and tail-to-public circuits, where the latter I'm told has very many PIs, enough that we should have a distinction. I believe this means having two Tubes, or making the Tube receive exeuction time input on which of the two keys it should use.\n\nWe remove the special handling of single circuits in ClientIVC. This was originally added so that there would be _some_ unit tests of the bb binary of ClientIVC, but the new tests in this PR will fill that role better by being more realistic.\nI also shove some little API improvements requested by @saleel in here to make sure they don't get lost in the shuffle.\n```\n\nCloses https://github.com/AztecProtocol/barretenberg/issues/1245\n\n---------\n\nCo-authored-by: ludamad <domuradical@gmail.com>\nCo-authored-by: ludamad <adam.domurad@gmail.com>\nCo-authored-by: ledwards2225 <l.edwards.d@gmail.com>",
          "timestamp": "2025-03-19T10:11:38-07:00",
          "tree_id": "82a7de1b6215d0c66c8dc984e155c2e7a1c0e67a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/65bd2764bdeafe6f2d259600b809d002c49e74fd"
        },
        "date": 1742406976103,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18292.647633000342,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15931.166812000001 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 117854656180.8,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 1603262790,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 213872819,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18772.753179999654,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16200.766742999998 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54584.216374,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54584214000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3864.951802000178,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3098.742549 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10421.290076,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10421297000 ms\nthreads: 1"
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
          "id": "65bd2764bdeafe6f2d259600b809d002c49e74fd",
          "message": "feat: precomputed ClientIVC VKs (#12126)\n\nAfter this PR, we no longer rely on a user provided vk when verifying\ncivc proofs. This was insecure.\n\n`yarn-project/bb-prover` now has a `yarn generate` step that creates two\nfiles in `yarn-project/bb-prover/artifacts`: `private-civc-vk` and\n`public-civc-vk`. These correspond to clientivc stacks that end in the\nprivate and public tail, respectively.\n\nThis is achieved by pinning historic CIVC inputs and using one public\nand private example, respectively. If the number of public inputs in the\ntail circuits, or the fundamental structure, change we will need to bump\nthis. This pinning will be obsoleted by\nhttps://github.com/AztecProtocol/barretenberg/issues/1296.\n\nThe write_vk command **is to be considered undocumented**. It is subject\nto change. Namely, a future simplification\n(https://github.com/AztecProtocol/barretenberg/issues/1296) will make it\nnot take an ivc stack. Original comments by Cody below:\n```\nAdd a write_vk command to generate a vk for generating ClientIVC proofs. This consists of: a vk for 'the' hiding circuit, a vk for the ECCVM and a vk for the Translator. The later two could and perhaps should go away in the future since they are actually just fixed constants known at C++ compile time. The former sounds like a constant, but in fact the key depends on the number of outputs of the final circuit in a stack to be verified. At the moment the two possibilities in our system are the private kernel tail and tail-to-public circuits, where the latter I'm told has very many PIs, enough that we should have a distinction. I believe this means having two Tubes, or making the Tube receive exeuction time input on which of the two keys it should use.\n\nWe remove the special handling of single circuits in ClientIVC. This was originally added so that there would be _some_ unit tests of the bb binary of ClientIVC, but the new tests in this PR will fill that role better by being more realistic.\nI also shove some little API improvements requested by @saleel in here to make sure they don't get lost in the shuffle.\n```\n\nCloses https://github.com/AztecProtocol/barretenberg/issues/1245\n\n---------\n\nCo-authored-by: ludamad <domuradical@gmail.com>\nCo-authored-by: ludamad <adam.domurad@gmail.com>\nCo-authored-by: ledwards2225 <l.edwards.d@gmail.com>",
          "timestamp": "2025-03-19T10:11:38-07:00",
          "tree_id": "82a7de1b6215d0c66c8dc984e155c2e7a1c0e67a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/65bd2764bdeafe6f2d259600b809d002c49e74fd"
        },
        "date": 1742406985225,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 39524,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 26336,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 11646,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 14509,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 15127,
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
          "id": "dc8ab31a7fb88e1054e177cbe7b8594da16f24af",
          "message": "fix: misleading test (#12877)\n\n@nventuro this test became misleading because of changes you did in the\npartial notes PR\n<img width=\"1451\" alt=\"image\"\nsrc=\"https://github.com/user-attachments/assets/b963e655-95bf-4be5-8874-ca7e81bf402c\"\n/>\n\nIn this PR I clarify it.",
          "timestamp": "2025-03-19T14:25:45-03:00",
          "tree_id": "a91af56fa58c1c10da01ece4d731851be82f230d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/dc8ab31a7fb88e1054e177cbe7b8594da16f24af"
        },
        "date": 1742407287433,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 33574,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 21681,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 10536,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 12839,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 13170,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "b9e6a1978c2f2c880634b40b16c11ab2e025691a",
          "message": "chore: allow individual service data map size configuration (#12853)\n\nFixes #12831",
          "timestamp": "2025-03-19T17:25:36Z",
          "tree_id": "2b0deb0d162900eaad827c940b5850598993007f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/b9e6a1978c2f2c880634b40b16c11ab2e025691a"
        },
        "date": 1742407898367,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 33899,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 21955,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 10715,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 12994,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 13281,
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
          "id": "aec93dfb44cc98b49bfedd68b7f15d2d22b79947",
          "message": "fix: yolo fix",
          "timestamp": "2025-03-19T18:29:46Z",
          "tree_id": "28a09124d253f4f6a52ffdf9ccc7520b72e1f1b7",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/aec93dfb44cc98b49bfedd68b7f15d2d22b79947"
        },
        "date": 1742412036605,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 34172,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 22031,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 10779,
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
            "value": 13483,
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
          "id": "4bae3974f8d6a069b4b5cce796e5a0385d4ff04c",
          "message": "fix: oracles handlers (#12864)",
          "timestamp": "2025-03-19T22:07:10+01:00",
          "tree_id": "fabc91552394a2335a8b36f4de7e5eadeec19416",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/4bae3974f8d6a069b4b5cce796e5a0385d4ff04c"
        },
        "date": 1742421191939,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 38911,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 25993,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 11510,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 14232,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 15169,
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
          "id": "09a09d5a6e3d6960eb054cbee58415bfc939e55f",
          "message": "feat(avm): instruction fetching parsing error (#12804)",
          "timestamp": "2025-03-20T10:03:15+01:00",
          "tree_id": "4e35db69b6e4ee66b5b27ce38764f9ca81f04f46",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/09a09d5a6e3d6960eb054cbee58415bfc939e55f"
        },
        "date": 1742464265461,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18057.82026299994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15966.12633 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 117860786294,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 1586986013,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 218238390,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18621.712063999894,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16266.191962 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54722.708037,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54722708000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3797.694564000267,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3092.017032 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10711.385275999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10711390000 ms\nthreads: 1"
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
          "id": "09a09d5a6e3d6960eb054cbee58415bfc939e55f",
          "message": "feat(avm): instruction fetching parsing error (#12804)",
          "timestamp": "2025-03-20T10:03:15+01:00",
          "tree_id": "4e35db69b6e4ee66b5b27ce38764f9ca81f04f46",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/09a09d5a6e3d6960eb054cbee58415bfc939e55f"
        },
        "date": 1742464276752,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 38960,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 25525,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 11702,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 14221,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 14889,
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
          "id": "d69901f2953ee6f2aecb4fbdcc1776393d9002f8",
          "message": "chore(avm): Constrain pc_size_in_bits column and rename (#12899)",
          "timestamp": "2025-03-20T12:57:38+01:00",
          "tree_id": "c1e526128a96fb24a11fb5036801ceff543a23ee",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d69901f2953ee6f2aecb4fbdcc1776393d9002f8"
        },
        "date": 1742474427025,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18059.321617000023,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15830.209958 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 117831783113.09999,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 1587908233,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 215451153,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18706.563968999944,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16094.867317000002 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55033.74086900001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55033741000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3873.794870000438,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3080.6088839999998 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11067.141902000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11067148000 ms\nthreads: 1"
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
          "id": "d69901f2953ee6f2aecb4fbdcc1776393d9002f8",
          "message": "chore(avm): Constrain pc_size_in_bits column and rename (#12899)",
          "timestamp": "2025-03-20T12:57:38+01:00",
          "tree_id": "c1e526128a96fb24a11fb5036801ceff543a23ee",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d69901f2953ee6f2aecb4fbdcc1776393d9002f8"
        },
        "date": 1742474435592,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 38801,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 26354,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 11524,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 14740,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 15086,
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
          "id": "fd7adb1b39540b98d72b17fff5f2ec6bf81de143",
          "message": "chore: fix archiver.test.ts (#12907)\n\nSomehow CI passed on #12863 even though this test is failing because of the changes 😅 This pr should fix it by putting in the proper layers.",
          "timestamp": "2025-03-20T14:33:31Z",
          "tree_id": "3c80380eb061572b7f5001f0697fc7fd8eeda8a2",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/fd7adb1b39540b98d72b17fff5f2ec6bf81de143"
        },
        "date": 1742483206980,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 39246,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 25305,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 11443,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 14666,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 15135,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "6efc8cee715537bb69ae46994ce5f4bdf6d10485",
          "message": "chore: vars for --network ignition-testnet (#12886)",
          "timestamp": "2025-03-20T15:03:58Z",
          "tree_id": "2a52d437f6c8e26065230d062d503214091bb1da",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/6efc8cee715537bb69ae46994ce5f4bdf6d10485"
        },
        "date": 1742485189749,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 39804,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 26600,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 11793,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 14531,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 15348,
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
          "id": "16232c8df518dc7915c39066178124cdfefd962a",
          "message": "chore: add support for caching `node_modules` within a nested repository (#12862)\n\nThis PR removes a hack added in #12760\n\nThis fixes an issue where we were querying the root git repository for\nhashes for files which are only tracked in the `noir/noir-repo`\nrepository. We now set the `REPO_PATH` env variable so that we run `git\nls-tree` on the correct repository.",
          "timestamp": "2025-03-20T15:20:05Z",
          "tree_id": "5d6efc63255d5687cc0b3b99b5c976de1e4b2f4f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/16232c8df518dc7915c39066178124cdfefd962a"
        },
        "date": 1742486106644,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 39333,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 25852,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 11715,
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
            "value": 15584,
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
          "id": "4d96fc0e596e04d3266b9f31b2eed338260ccf91",
          "message": "chore: Remove magic number from AVM bytecode (#12900)",
          "timestamp": "2025-03-20T16:29:51+01:00",
          "tree_id": "eccf26f869554c1091c192f6256302a4e9fb4c44",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/4d96fc0e596e04d3266b9f31b2eed338260ccf91"
        },
        "date": 1742486493078,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 42480,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 25041,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 11770,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 14573,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 17745,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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