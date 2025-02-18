window.BENCHMARK_DATA = {
  "lastUpdate": 1739883736900,
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
          "id": "3980f6cb58f51723296c1db3e6228c242377c935",
          "message": "feat(avm): sequential lookup resolution (#11769)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this line.",
          "timestamp": "2025-02-12T12:55:32Z",
          "tree_id": "48bdbc59059b09022ba8b6185b6cbba67a7ccc55",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/3980f6cb58f51723296c1db3e6228c242377c935"
        },
        "date": 1739365972789,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20093.227934000028,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17145.414128000004 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21776.043335000053,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19393.360780000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4103.784555999993,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3782.2931049999997 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 84637.959682,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 84637961000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14517.742892000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14517744000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2385448085,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2385448085 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 148315666,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 148315666 ns\nthreads: 1"
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
          "id": "ed215e8d86eb9cc441bc60be090d0225d03e1fb3",
          "message": "chore: use RelationChecker in relation correctness tests and add Translator interleaving test (#11878)\n\nThe RelationChecker was introduced as a debugging utility in a previous\r\nPR but was not actually used in relevant tests, leading to duplicated\r\ncode. This PR fixes that and aims to refine the check function in the\r\nutility. It also includes refactoring of stale code and adds a small\r\nsequential test that changing the interleaving strategy in translator\r\nwill not break the PermutationRelation and DeltaRangeConstraintRelation\r\n(the two relations that now operate on the concatenated polynomials)",
          "timestamp": "2025-02-12T15:17:11Z",
          "tree_id": "275ae60582d15f573dc4ea325d6f8feae00e9169",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ed215e8d86eb9cc441bc60be090d0225d03e1fb3"
        },
        "date": 1739374449382,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19750.348890999987,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16850.706449 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21444.526182000005,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18797.480171 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4067.2636779999893,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3766.4752670000003 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 75518.12293099999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 75518124000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14407.127980999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14407129000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2637187705,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2637187705 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 133439767,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 133439767 ns\nthreads: 1"
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
          "id": "fdc2042d318eb00082c1f014066d4f177c5f72a1",
          "message": "fix: Empty blocks can now be unwound (#11920)\n\nThis PR has the following changes:\r\n\r\n1. Fixes an issue where empty blocks added from the genesis state could\r\nnot be unwound.\r\n2. Refactors the retrieval of meta data so a transaction is not required\r\nif just reading uncommitted data.\r\n3. We now provide a specific method for committing the genesis state.",
          "timestamp": "2025-02-12T15:26:54Z",
          "tree_id": "53f8f4c77f4c3b0288b4349b8febb3eab0b2f5cc",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/fdc2042d318eb00082c1f014066d4f177c5f72a1"
        },
        "date": 1739376087227,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20615.668932000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17638.683384 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21653.675975,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19037.451891 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4494.92410000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4212.206265 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 80197.17479,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 80197175000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13468.419773,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13468420000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2476523364,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2476523364 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 141588284,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 141588284 ns\nthreads: 1"
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
          "id": "6464059047f5e563b4a2207c72ea57d84f1b43cc",
          "message": "feat: Native world state now supports checkpointing  (#11739)\n\nThis PR introduces checkpointing to the native world state. \r\n\r\nCheckpointing allows for state updates to be reverted to a previous\r\nstate. This can be done to an arbitrary depth.\r\n\r\n---------\r\n\r\nCo-authored-by: Alex Gherghisan <alexg@aztecprotocol.com>",
          "timestamp": "2025-02-12T19:37:48Z",
          "tree_id": "3db75519add689febcf204a1e6ae96e5f7e5a2a7",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/6464059047f5e563b4a2207c72ea57d84f1b43cc"
        },
        "date": 1739390054847,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19758.472902999983,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16937.815788999997 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21385.89081500001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18897.586096000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4075.264261000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3783.0714459999995 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 75214.594814,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 75214596000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14409.883042,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14409884000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2333407771,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2333407771 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 133140235,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 133140235 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "domuradical@gmail.com",
            "name": "ludamad",
            "username": "ludamad"
          },
          "committer": {
            "email": "domuradical@gmail.com",
            "name": "ludamad",
            "username": "ludamad"
          },
          "distinct": true,
          "id": "7a76374d51e822f419fa00e49b36340e4a512ca9",
          "message": "--ignored files too",
          "timestamp": "2025-02-12T22:48:29Z",
          "tree_id": "4720a792c7613ee9a85d4d14be278b9711e47886",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7a76374d51e822f419fa00e49b36340e4a512ca9"
        },
        "date": 1739402092278,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18352.138348999913,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16123.864729 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18783.20463299997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16488.720099000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4042.1647189998566,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3116.5696770000004 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54916.607443,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54916611000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10669.048437,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10669056000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1800036745,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1800036745 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 128188830,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 128188830 ns\nthreads: 1"
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
          "id": "082ed66bee121c29621e73540e930c6162ff9e8c",
          "message": "chore: op queue cleanup (#11925)\n\nPrecursor cleanup of the `ECCOpQueue` class. \n\n- remove unused logic related to asynchronously updating the op queue\n- move logic for tracking ECCVM row usage into a sub-class\nEccvmRowTracker\n- general syntax cleanup",
          "timestamp": "2025-02-12T15:51:41-07:00",
          "tree_id": "6a1139f0508bd09219162c9f906adc62dde99e16",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/082ed66bee121c29621e73540e930c6162ff9e8c"
        },
        "date": 1739402280987,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20199.34910799998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17102.965545 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21941.216296999984,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19501.613326000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4162.93243299998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3887.3578089999996 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 77284.03128400001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 77284031000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14589.530673000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14589531000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2385422733,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2385422733 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 135072840,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 135072840 ns\nthreads: 1"
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
          "id": "e1567e987e87d05ed684f7be48fd2dd4fbe8d43a",
          "message": "Update bootstrap.sh",
          "timestamp": "2025-02-13T00:12:13Z",
          "tree_id": "cdc11e25f14c236c023084de0d0ed5f1137419f8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e1567e987e87d05ed684f7be48fd2dd4fbe8d43a"
        },
        "date": 1739406184582,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18144.11199699998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16127.813609 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18560.50134999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16172.764604000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3846.9365550000703,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3095.8197149999996 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54912.166688,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54912168000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11406.814688999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11406817000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1806579207,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1806579207 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 129102069,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 129102069 ns\nthreads: 1"
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
          "id": "7f3bcccf81eafe51bac589599a21e1a68117e5c9",
          "message": "grind baby grind",
          "timestamp": "2025-02-13T00:13:28Z",
          "tree_id": "053e5cbd9a3f73d9b35ca927a59e353047b68a42",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7f3bcccf81eafe51bac589599a21e1a68117e5c9"
        },
        "date": 1739406269976,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18172.887891000017,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16029.509789999998 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18603.11177599999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16393.072671 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3915.1752300000453,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3076.473743 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54965.659322,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54965660000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10431.515263,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10431520000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1808463020,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1808463020 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 129084588,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 129084588 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "domuradical@gmail.com",
            "name": "ludamad",
            "username": "ludamad"
          },
          "committer": {
            "email": "domuradical@gmail.com",
            "name": "ludamad",
            "username": "ludamad"
          },
          "distinct": true,
          "id": "cd3ee7f0d3b2bc13a2a1b812beb6e2654ee66ed1",
          "message": "Merge remote-tracking branch 'origin/ci3-fake-master' into ci3-fake-master",
          "timestamp": "2025-02-13T08:39:37Z",
          "tree_id": "0cf5df858a63a4db1dd412fe919eb88ecb074ae7",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/cd3ee7f0d3b2bc13a2a1b812beb6e2654ee66ed1"
        },
        "date": 1739437400491,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18042.68821400001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15856.260483999999 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18538.37488099998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16065.907245000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3852.0219290001023,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3131.6464530000003 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55282.521339,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55282523000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11094.995866,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11094999000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1813917306,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1813917306 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 133987662,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 133987662 ns\nthreads: 1"
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
          "id": "f87d0e380a9bc2bad78a2ba8f57b87115a7ec842",
          "message": "chore(master): Release 0.76.3",
          "timestamp": "2025-02-13T08:58:01Z",
          "url": "https://github.com/AztecProtocol/aztec-packages/pull/11924/commits/f87d0e380a9bc2bad78a2ba8f57b87115a7ec842"
        },
        "date": 1739437622738,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19817.806886,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16830.133472 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21554.134912999983,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19166.074354000004 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4063.20387400001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3808.0564269999995 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 75172.38043199999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 75172381000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14428.28627,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14428287000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2335032226,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2335032226 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 134494031,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 134494031 ns\nthreads: 1"
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
          "id": "f8fe602fe978fcd9f61a6476d24c03eb552d5341",
          "message": "feat(avm): constrained ec_add (#11525)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\r\nline.",
          "timestamp": "2025-02-13T10:31:59Z",
          "tree_id": "703f7d96bb42e22232cb6e81e6e57d8c8056749e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f8fe602fe978fcd9f61a6476d24c03eb552d5341"
        },
        "date": 1739443736551,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19882.779287999994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17025.416019 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21678.378683999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19244.714270000004 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4101.979628000009,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3833.000713 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 85015.37016899999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 85015370000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14519.75816,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14519759000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3107353091,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3107353091 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 167858029,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 167858029 ns\nthreads: 1"
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
          "id": "b865cccad1e5ff4b1cc175acd2095f0d2c1d423d",
          "message": "chore(avm): tracegen interactions assertion (#11972)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this line.",
          "timestamp": "2025-02-13T12:36:22Z",
          "tree_id": "9fd1e9f708ac7cd2a3651217ee113485a05ba9e2",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/b865cccad1e5ff4b1cc175acd2095f0d2c1d423d"
        },
        "date": 1739451144776,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19688.813485,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16847.588804 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21438.397313000023,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19428.84856 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4073.243609000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3820.294695 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 76075.219784,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 76075219000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14408.330074999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14408331000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2347613006,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2347613006 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 133471319,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 133471319 ns\nthreads: 1"
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
          "id": "95b581de29df183c7ee443c990fef11a3f9a301e",
          "message": "feat(avm): relation microbenchmarks (#11974)\n\nRelation accumulation microbenchmarks\n\n```\n----------------------------------------------------------------------\nBenchmark                            Time             CPU   Iterations\n----------------------------------------------------------------------\nalu_acc_random                   0.126 us        0.126 us      5542448\nbc_decomposition_acc_random       4.32 us         4.32 us       161914\nbc_retrieval_acc_random          0.024 us        0.024 us     28942571\nbitwise_acc_random                1.42 us         1.42 us       493754\necc_acc_random                    2.61 us         2.61 us       269299\nexecution_acc_random             0.527 us        0.527 us      1309267\ninstr_fetching_acc_random        0.024 us        0.024 us     29060773\nrange_check_acc_random            2.77 us         2.77 us       257953\nsha256_acc_random                 6.33 us         6.33 us       111173\n```",
          "timestamp": "2025-02-13T12:38:32Z",
          "tree_id": "a4d9ce3d63bf12aa0639719c11ea2f8763e085ff",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/95b581de29df183c7ee443c990fef11a3f9a301e"
        },
        "date": 1739451307833,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19715.376171000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16917.24779 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21560.375647,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19052.936192 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4092.942883000006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3804.6566430000003 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 85588.19262599999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 85588193000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14448.867079000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14448866000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2356653593,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2356653593 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 136974539,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 136974539 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "domuradical@gmail.com",
            "name": "ludamad",
            "username": "ludamad"
          },
          "committer": {
            "email": "domuradical@gmail.com",
            "name": "ludamad",
            "username": "ludamad"
          },
          "distinct": true,
          "id": "f11d3903b3def2a93afe6764f56f9f45c02f48a7",
          "message": "cleanup",
          "timestamp": "2025-02-13T12:36:06Z",
          "tree_id": "e4b6152a35ec9a723b6a41bb5547759eec904a6e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f11d3903b3def2a93afe6764f56f9f45c02f48a7"
        },
        "date": 1739451742263,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18188.017486000033,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16222.525063 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18678.905398999857,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16327.409725 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3848.8889469999776,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3112.436424 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55221.597924,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55221599000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10608.840078999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10608843000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1807472139,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1807472139 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 131876434,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 131876434 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "domuradical@gmail.com",
            "name": "ludamad",
            "username": "ludamad"
          },
          "committer": {
            "email": "domuradical@gmail.com",
            "name": "ludamad",
            "username": "ludamad"
          },
          "distinct": true,
          "id": "d0ab4b7c81e69e34a7b89d42c04a2b8c32baf52b",
          "message": "fix slack logic",
          "timestamp": "2025-02-13T12:38:42Z",
          "tree_id": "87ce11606ddfd9656bfcb82c04224fd68eac4246",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d0ab4b7c81e69e34a7b89d42c04a2b8c32baf52b"
        },
        "date": 1739451910343,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18157.176316999994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16051.900906 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18647.8915109999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16223.614831000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3926.1201409999558,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3166.9184920000002 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55246.363472000005,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55246365000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11101.1768,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11101178000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1822560556,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1822560556 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 132330572,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 132330572 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "domuradical@gmail.com",
            "name": "ludamad",
            "username": "ludamad"
          },
          "committer": {
            "email": "domuradical@gmail.com",
            "name": "ludamad",
            "username": "ludamad"
          },
          "distinct": false,
          "id": "d246cc15018c274f19245ecb265a47d1b29a0e34",
          "message": "Merge remote-tracking branch 'origin/master' into ci3-release-test",
          "timestamp": "2025-02-13T12:43:30Z",
          "tree_id": "d1ff4074788357fe88993c67462d22f037bfed02",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d246cc15018c274f19245ecb265a47d1b29a0e34"
        },
        "date": 1739452893389,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18364.56830899988,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16299.085409 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18707.920687000296,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16394.771189 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4073.3246640002108,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3181.764426 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55097.61531100001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55097618000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11357.524494,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11357548000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1823060326,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1823060326 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 133866437,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 133866437 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "domuradical@gmail.com",
            "name": "ludamad",
            "username": "ludamad"
          },
          "committer": {
            "email": "domuradical@gmail.com",
            "name": "ludamad",
            "username": "ludamad"
          },
          "distinct": false,
          "id": "d246cc15018c274f19245ecb265a47d1b29a0e34",
          "message": "Merge remote-tracking branch 'origin/master' into ci3-release-test",
          "timestamp": "2025-02-13T12:43:30Z",
          "tree_id": "d1ff4074788357fe88993c67462d22f037bfed02",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d246cc15018c274f19245ecb265a47d1b29a0e34"
        },
        "date": 1739452924661,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18364.56830899988,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16299.085409 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18707.920687000296,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16394.771189 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4073.3246640002108,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3181.764426 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55097.61531100001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55097618000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11357.524494,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11357548000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1823060326,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1823060326 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 133866437,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 133866437 ns\nthreads: 1"
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
          "id": "3a03fe052bbbdbf3ed0e44d0a5ed2701beb67689",
          "message": "chore(master): Release 0.76.4",
          "timestamp": "2025-02-13T15:46:11Z",
          "url": "https://github.com/AztecProtocol/aztec-packages/pull/11971/commits/3a03fe052bbbdbf3ed0e44d0a5ed2701beb67689"
        },
        "date": 1739462132639,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19749.756007999993,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16772.894749 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21623.772971999984,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19221.365389 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4107.517180999992,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3845.4931570000003 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 76527.401622,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 76527402000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14565.685312,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14565686000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2546620468,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2546620468 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 138494048,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 138494048 ns\nthreads: 1"
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
          "id": "6c9305897c9c333791d333d332cafa352f9bbe58",
          "message": "feat: PIL relations modifications for bc decomposition (#11935)\n\n```\r\n----------------------------------------------------------------------\r\nBenchmark                            Time             CPU   Iterations\r\n----------------------------------------------------------------------\r\nalu_acc_random                   0.126 us        0.126 us      5553823\r\nbc_decomposition_acc_random       8.73 us         8.73 us        80583\r\nbc_retrieval_acc_random          0.024 us        0.024 us     29187915\r\nbitwise_acc_random                1.42 us         1.42 us       493026\r\necc_acc_random                    2.59 us         2.59 us       269872\r\nexecution_acc_random             0.524 us        0.524 us      1339762\r\ninstr_fetching_acc_random        0.024 us        0.024 us     29288136\r\nrange_check_acc_random            2.67 us         2.67 us       262513\r\nsha256_acc_random                 6.25 us         6.25 us       111991\r\n```",
          "timestamp": "2025-02-13T17:34:57+01:00",
          "tree_id": "6d597e1136ea4cf605059f4e576847822281d4eb",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/6c9305897c9c333791d333d332cafa352f9bbe58"
        },
        "date": 1739465955500,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20794.973448000008,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17974.696425000002 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21791.425892000007,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19180.924053 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4472.892544999979,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4112.5963329999995 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 73158.95751,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 73158958000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13531.784989000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13531785000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2490362517,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2490362517 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 147715099,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 147715099 ns\nthreads: 1"
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
          "id": "be1b563ffe99689af45c9241a1d94d53de1c4e35",
          "message": "chore: op wires index from 0 (#11986)\n\nThe ecc op relation in Mega is designed to check that the ecc op data\nhas been duplicated across the wires and ecc_op_wires. Because the wires\nneed to be shifted, they contain a zero row, meaning the ecc op data is\nstored starting from index 1. Prior to this PR, the op wires also stored\nthe data this way, even though they dont need to be shifted. Its more\nconvenient for the ecc op wires to index from zero. This is achieved by\nsimply utilizing the shifted wires in the relation so that we check\necc_op_wire[i] = wire[i+1].\n\nNote: also fixes an incorrect skip condition in the EccOpRelation that\nwas not caught prior due to an unrelated bug that will be fixed in\nanother PR.",
          "timestamp": "2025-02-13T12:31:44-07:00",
          "tree_id": "8a0820276c52745ef79a215c3bdb37b28429aa03",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/be1b563ffe99689af45c9241a1d94d53de1c4e35"
        },
        "date": 1739476133902,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20560.81565299996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17695.849037000004 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21682.422184000017,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18906.432971000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4472.108256000012,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4163.633242 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 73320.063362,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 73320063000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13456.631414999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13456632000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2611656601,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2611656601 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 142926815,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 142926815 ns\nthreads: 1"
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
          "id": "2c199d852b316775053751fc67bd5018f35cf61b",
          "message": "feat: poseidon2 in vm2 (#11597)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\r\nline.",
          "timestamp": "2025-02-14T12:43:05Z",
          "tree_id": "ded1ab2d6ae35181c473083efec43b51392290f7",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/2c199d852b316775053751fc67bd5018f35cf61b"
        },
        "date": 1739538019237,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19799.610655000037,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17050.165887 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21561.330535000023,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19112.80939 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4075.5684900000233,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3821.244053 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 75134.517779,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 75134518000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14425.359297,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14425360000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2342022021,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2342022021 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 134049734,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 134049734 ns\nthreads: 1"
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
          "id": "723163a9a93d628c9688ff5861ed7bff556bae16",
          "message": "feat: Cl/ci3.3 (#10946)\n\n[CI3 introduction.](https://hackmd.io/bTnKHtTHT8mAdTtD0t7JvA?view)\r\n\r\nThis is a majority step towards the vision of CI3, still namely missing\r\nmerge queue.\r\n\r\nNew features:\r\n- Grinding flakes in master. We run all tests on 5 separate runners to\r\nreport on flakes at the source.\r\n- External contributors can now have CI run just by approving their PR. \r\n- Ability to debug CI entirely from commandline from any machine. Get\r\ndropped into a productive shell right after the CI failure by doing\r\n`./ci.sh ec2` while your PR is a draft (note: do not do this if pushing\r\nto a non-draft PR).\r\n- Add tests to CI by adding tests to bootstrap. Target a rich\r\nenvironment with no differences from running inside the dev container.\r\n- Releases that are fully dry-runnable and deployable from a single\r\ncommand. See above hackmd for details.\r\n- Recovery from spot eviction (finally implemented correctly).\r\n\r\nSome remaining items are tracked here.\r\nhttps://github.com/aztecprotocol/aztec-packages/issues/10775\r\n\r\n---------\r\n\r\nCo-authored-by: ludamad <domuradical@gmail.com>\r\nCo-authored-by: ludamad <adam.domurad@gmail.com>\r\nCo-authored-by: thunkar <gregojquiros@gmail.com>",
          "timestamp": "2025-02-14T12:59:22Z",
          "tree_id": "85acd18259eaa089b56151f51cbcc72dcf0ebff2",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/723163a9a93d628c9688ff5861ed7bff556bae16"
        },
        "date": 1739540072733,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18351.557659000035,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16251.382791000002 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18748.663436000017,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16344.662915 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3966.570054000158,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3172.46146 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55257.81427,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55257815000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11365.368749,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11365373000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1832061531,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1832061531 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 131153334,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 131153334 ns\nthreads: 1"
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
          "id": "1dbaf37c281baaa1c5555174f5e99d01d6a8854b",
          "message": "fix: playground improvements (#12010)\n\nlog panel prevented some txs from being sent, import types affected\r\nproduction builds",
          "timestamp": "2025-02-14T15:04:17Z",
          "tree_id": "7cc4833f9cd656efeff5bc395bf80b0b7f3af250",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1dbaf37c281baaa1c5555174f5e99d01d6a8854b"
        },
        "date": 1739546067271,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18035.961868000017,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15972.900548000001 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18409.426161,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16230.944167 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3822.1105640000133,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3051.038035 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54563.643755000005,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54563645000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9939.243801,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9939250000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1795150451,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1795150451 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 128186841,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 128186841 ns\nthreads: 1"
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
          "id": "adacbda44dc7223ac0dd849c3951b61263eaece2",
          "message": "feat(avm): interactions microbenchmarks (#12005)\n\n```\n----------------------------------------------------------------------------\nBenchmark                                  Time             CPU   Iterations\n----------------------------------------------------------------------------\nalu_acc                                0.123 us        0.123 us      5733323\nbc_decomposition_acc                    8.74 us         8.74 us        80218\nbc_decomposition_interactions_acc       1.10 us         1.10 us       635912\nbc_retrieval_acc                       0.024 us        0.024 us     29223517\nbitwise_acc                             1.42 us         1.42 us       493467\nbitwise_interactions_acc               0.947 us        0.947 us       756449\necc_acc                                 2.59 us         2.59 us       268431\nexecution_acc                          0.519 us        0.519 us      1348920\nexecution_interactions_acc              1.53 us         1.53 us       459332\ninstr_fetching_acc                     0.024 us        0.024 us     29175405\nposeidon2_hash_acc                      1.86 us         1.86 us       377966\nposeidon2_hash_interactions_acc        0.743 us        0.743 us       943393\nposeidon2_perm_acc                      44.1 us         44.1 us        16011\nrange_check_acc                         2.68 us         2.68 us       260746\nrange_check_interactions_acc            3.53 us         3.53 us       198772\nsha256_acc                              6.25 us         6.24 us       112169\nsha256_interactions_acc                0.406 us        0.406 us      1736243\n```",
          "timestamp": "2025-02-14T10:37:52-05:00",
          "tree_id": "7101a3daf586f2c6d93cc4b5e2a378db2873aa96",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/adacbda44dc7223ac0dd849c3951b61263eaece2"
        },
        "date": 1739548894513,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18130.676950999943,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15986.488747 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18619.035850000044,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16460.302063 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3890.1604389998283,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3150.0280940000002 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55374.345571,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55374347000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11588.472747,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11588475000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1805893201,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1805893201 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 131345815,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 131345815 ns\nthreads: 1"
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
          "id": "9fedf8b9aed70abf7cb9e52ec305fcb0cf80b06a",
          "message": "chore(avm): Add comments in byte decomposition and hashing pil files (#12011)\n\nAdd comments in byte decomposition and hashing pil files and boolean\r\nrelation in bitwise.pil",
          "timestamp": "2025-02-14T17:22:51+01:00",
          "tree_id": "fbca2187c29be3fcd430ae5f75581936aa76e3f8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9fedf8b9aed70abf7cb9e52ec305fcb0cf80b06a"
        },
        "date": 1739551594030,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18250.700126999844,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16133.313581000002 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18652.454971,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16446.149862000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3907.2975179999503,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3104.662058 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55173.716966,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55173720000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9641.993386,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9641996000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1813327549,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1813327549 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 130071936,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 130071936 ns\nthreads: 1"
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
          "distinct": true,
          "id": "d1144e57927bf062ddb43d1194a40a686e2f9737",
          "message": "chore: turn get_vk_merkle_tree into a global (#12009)\n\nCalling `get_vk_merkle_tree` during comptime takes 80ms on my machine.\nIt's called several times during compilation.\n\nRunning `time nargo check --force` inside `rollup-base-private` used to\ntake 1.3 seconds on my machine. With this change it takes 0.6 seconds.\nIt's not that much for a human, but `nargo check` is what LSP uses so\nthis should speed up LSP in these projects by a noticeable amount.",
          "timestamp": "2025-02-14T17:37:23Z",
          "tree_id": "cb9109cd3505edd4eff100d3914232e7ebca7850",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d1144e57927bf062ddb43d1194a40a686e2f9737"
        },
        "date": 1739556014051,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18124.868891999995,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16007.239689000002 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18593.10187999995,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16501.382161 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3925.6521390000216,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3167.3881949999995 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55468.425597,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55468426000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11131.095260999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11131099000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1823151374,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1823151374 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 135660520,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 135660520 ns\nthreads: 1"
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
          "id": "283050db11cd723ca41b1f349bab666d772d05d2",
          "message": "chore: proof submission window in charts (#11993)\n\nI ran a [successful deployment of\r\nRC-1](https://github.com/AztecProtocol/aztec-packages/actions/runs/13314469598)\r\nto gke-private/mitch.\r\nSee the [proven chain\r\nadvancing](https://cloudlogging.app.goo.gl/B9nXhrH3tmZnYVby8)\r\n\r\nAlso remove some dead values files.",
          "timestamp": "2025-02-14T19:02:59Z",
          "tree_id": "96ed41c8592b6f9a503621cab8b6637f15d379c1",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/283050db11cd723ca41b1f349bab666d772d05d2"
        },
        "date": 1739560993197,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18041.573430000084,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15841.327466 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18620.864071000142,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16327.047741000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3865.861246999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3099.932936 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55365.849685999994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55365852000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10985.898537,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10985905000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1820259928,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1820259928 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 133605533,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 133605533 ns\nthreads: 1"
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
          "id": "0dbd60e20028a9281df2c7eeef2b2ab307600a9e",
          "message": "chore(avm): fix test names (#12017)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this line.",
          "timestamp": "2025-02-14T19:07:41Z",
          "tree_id": "7cdf825ae48938711a1d34acfae5fc668160c087",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0dbd60e20028a9281df2c7eeef2b2ab307600a9e"
        },
        "date": 1739561519906,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18290.239000999918,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16138.251344 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18663.57409400007,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16330.308382999998 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3857.1539950000897,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3034.994758 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55071.241346,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55071245000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9922.484751,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9922488000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1861998441,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1861998441 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 130916390,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 130916390 ns\nthreads: 1"
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
          "id": "a8c9285df069377bc7d5c802fa0b997868daac78",
          "message": "chore(ci3): release pass (#12016)\n\nCo-authored-by: Charlie Lye <karl.lye@gmail.com>\r\nCo-authored-by: thunkar <gregojquiros@gmail.com>",
          "timestamp": "2025-02-14T19:24:37Z",
          "tree_id": "676afac17813c4eaf367312f72ad72b26e6e12eb",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a8c9285df069377bc7d5c802fa0b997868daac78"
        },
        "date": 1739562477988,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18184.526628000185,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16110.195129999998 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18757.738717000168,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16362.987561 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3997.2766560001673,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3151.866055 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55256.351533,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55256351000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 12037.516598999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 12037521000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1837575839,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1837575839 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 131987008,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 131987008 ns\nthreads: 1"
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
          "id": "fe2c77bb56d56c83bdce6ea708ee1a7cd360978f",
          "message": "feat: Sync from noir (#12002)\n\nAutomated pull of development from the\n[noir](https://github.com/noir-lang/noir) programming language, a\ndependency of Aztec.\nBEGIN_COMMIT_OVERRIDE\nfix(ssa): Do not deduplicate division by a zero constant\n(https://github.com/noir-lang/noir/pull/7393)\nchore: document traits required to be in scope\n(https://github.com/noir-lang/noir/pull/7387)\nfix: field zero division in brillig\n(https://github.com/noir-lang/noir/pull/7386)\nchore: box `ParserError`s in `InterpreterError`\n(https://github.com/noir-lang/noir/pull/7373)\nchore: remove unnecessary dereferencing within brillig vm\n(https://github.com/noir-lang/noir/pull/7375)\nfix: give \"correct\" error when trying to use AsTraitPath\n(https://github.com/noir-lang/noir/pull/7360)\nEND_COMMIT_OVERRIDE\n\n---------\n\nCo-authored-by: Tom French <15848336+TomAFrench@users.noreply.github.com>",
          "timestamp": "2025-02-14T19:37:43Z",
          "tree_id": "b1cf6dc76ed5490f4f283a2eeeac9b9d37b8e3f2",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/fe2c77bb56d56c83bdce6ea708ee1a7cd360978f"
        },
        "date": 1739563359941,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18126.20716499987,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16042.353617 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18603.09570599998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16327.955765000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3888.5236720000194,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3087.0518789999996 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55536.430089999994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55536431000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10857.471972,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10857476000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1816113384,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1816113384 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 134085562,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 134085562 ns\nthreads: 1"
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
          "id": "f96903792b7f050f63f37e49382afd0ea114b94e",
          "message": "chore(ci3): label handling (#12020)",
          "timestamp": "2025-02-14T20:12:07Z",
          "tree_id": "9766a5981c339b44e07c59fad2922235f66dca7d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f96903792b7f050f63f37e49382afd0ea114b94e"
        },
        "date": 1739564559879,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18072.268280999993,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15971.024243000002 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18531.105095999977,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16235.809557999999 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3843.291487999977,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3107.055706 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55168.556744,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55168558000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9475.941302000003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9475944000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1820055600,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1820055600 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 133266457,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 133266457 ns\nthreads: 1"
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
          "id": "d8534ec6e48f7fc469a4370abfb3061427469c7c",
          "message": "chore: skip flakey p2p (#12021)",
          "timestamp": "2025-02-14T23:09:07Z",
          "tree_id": "1999bbec49f8a49e69c00068711c91be496bd21a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d8534ec6e48f7fc469a4370abfb3061427469c7c"
        },
        "date": 1739575177683,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18037.378052999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15937.616101 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18567.52139400004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16178.019913 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3870.910135000031,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3073.831465 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55175.349675,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55175351000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10928.430685000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10928439000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1820938292,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1820938292 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 130705776,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 130705776 ns\nthreads: 1"
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
          "id": "de7882ccb72d371f66f07c66d3e762374aac909b",
          "message": "feat: new op queue logic (#11999)\n\nNew class EccOpsTable to support the new concatenate-via-relations\napproach to the Merge protocol.\n\nBackground: The \"Merge\" protocol is essentially a protocol for\nestablishing that a large table was constructed as the concatenation of\nsmaller ones (subtables). In the original version of the protocol, the\nlarger table was obtained by successively appending subtables (one from\neach circuit). The new version requires that subtables be PRE-pended.\nThis results in a simpler protocol overall (and, importantly, one that's\neasier to make ZK) but its a bit more annoying from a data management\nstandpoint since in general we don't want to pre-pend things in memory.\nThis PR introduces a class `EccOpsTable` which stores individual\nsubtables which can be virtually \"prepended\" to construct the entries of\nthe corresponding aggregate table as needed.",
          "timestamp": "2025-02-15T12:53:49-07:00",
          "tree_id": "f199c0cf9d7d55e48000439b9b22ad5df8cc133d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/de7882ccb72d371f66f07c66d3e762374aac909b"
        },
        "date": 1739650856324,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18218.27088200007,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16090.161274000004 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18711.115801000007,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16408.70379 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4010.99242999976,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3131.0757529999996 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55306.514611,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55306515000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10391.696799000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10391700000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1823023468,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1823023468 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 127892281,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 127892281 ns\nthreads: 1"
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
          "id": "ba50dd92a4ef0a30e8a136a0038f489e466802d7",
          "message": "fix(ci3): fix ./bootstrap.sh fast in noir-projects (#12026)",
          "timestamp": "2025-02-15T15:44:32-05:00",
          "tree_id": "36a0bda7973c759ba2ae72f373a6d0f2f6df5f01",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ba50dd92a4ef0a30e8a136a0038f489e466802d7"
        },
        "date": 1739653495972,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17951.99469500017,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15895.375432999997 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18541.15595400003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16128.288628 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3964.595658999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3072.1547349999996 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55162.955009,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55162956000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10971.659951,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10971660000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1857845676,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1857845676 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 131687619,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 131687619 ns\nthreads: 1"
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
          "id": "6f771b9f55fdc568944e78b5ae05eeff25033b1e",
          "message": "chore: structured polys in Translator (#12003)\n\nIn this PR:\r\n* renamed the `MINIMUM_MINI_CIRCUIT_SIZE`. Initially, the variable was\r\n2048 existed to determine the lower bound of the translator vm. In the\r\nfixed size VM work it became the upper_bound of the translator. Renamed\r\nthe variable to `FIXED_TRANSLATOR_VM_SIZE` and enforced statically that\r\nthis never gets set under 2048.\r\n* make the prover polynomials structured, so now the majority of\r\npolynomials in translator only have space allocated up to the mini\r\ncircuit size",
          "timestamp": "2025-02-15T21:58:04+01:00",
          "tree_id": "6df4557a6531f72aa2b31a51d7784bec8b804e0f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/6f771b9f55fdc568944e78b5ae05eeff25033b1e"
        },
        "date": 1739655254316,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18189.39530600005,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15915.337828 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18706.344808000038,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16251.708061000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3939.2020780001076,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3162.6268669999995 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55094.560113,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55094560000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10357.982311,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10357984000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1824159654,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1824159654 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 129649571,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 129649571 ns\nthreads: 1"
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
          "id": "3633c077e48f051919c30f4377fbb967f696b773",
          "message": "fix: unexposing test fr from vkey struct ts (#12028)\n\nwhoops !",
          "timestamp": "2025-02-15T21:56:12Z",
          "tree_id": "2f32a9363dae4031e0528b163ef39ffbe26277fd",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/3633c077e48f051919c30f4377fbb967f696b773"
        },
        "date": 1739657796983,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18039.335058999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15931.832471 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18565.380645000005,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16177.571516 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3870.8480039999813,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3084.2926980000007 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54956.944531,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54956945000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10379.151297,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10379156000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1812584741,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1812584741 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 131095380,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 131095380 ns\nthreads: 1"
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
          "id": "2f4f7a6126230e010f9a22fca76e74c344982f2e",
          "message": "chore: redo typo PR by maximevtush (#12033)\n\nThanks maximevtush for\nhttps://github.com/AztecProtocol/aztec-packages/pull/12030. Our policy\nis to redo typo changes to dissuade metric farming. This is an automated\nscript.",
          "timestamp": "2025-02-16T11:34:54-05:00",
          "tree_id": "6477794dbcc2c50a094872338468eadc5106cc8c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/2f4f7a6126230e010f9a22fca76e74c344982f2e"
        },
        "date": 1739724890572,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18161.758910999994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16012.543032 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18594.301562000055,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16105.156753 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3943.8402950000864,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3113.5112190000004 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55094.110021,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55094109000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10172.353963,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10172362000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1815084719,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1815084719 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 128740696,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 128740696 ns\nthreads: 1"
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
          "id": "0c937238e193ad1a9936004f665a319ba92468d9",
          "message": "feat!: enforce fees (#11480)\n\n### Circuits\r\n- Private kernels ensure that fee payer is not empty.\r\n- Private base rollup and the avm check that the fee payer must have\r\nenough balance to pay the fee.\r\n\r\n### Aztec.js/cli\r\n- Default payment method is `FeeJuicePaymentMethod`, the fee payer is\r\nthe wallet owner.\r\n- `NoFeePaymentMethod` is no longer available.\r\n- \r\n\r\n### End-to-end/Sandbox\r\n- Some public data leaves are created for funding the initial test\r\naccounts with fee juice. The genesis archive root and block hash are\r\ngenerated with these public data leaves.\r\n  - For the e2e tests, the test accounts are generated randomly.\r\n- For the sandbox, the test accounts are defined in\r\n`@aztec/accounts/testing`.\r\n- These funded test accounts can deploy their own account contract and\r\npay the fee for the deployment themselves.\r\n- These funded test accounts can be used to deploy another account\r\nwithout pre-funded fee juice.\r\n- By calling `someAccountManager.deploy({ deployWallet: fundedWallet })`\r\n- `BananaCoin` and `BananaFPC` are deployed in sandbox by default. Users\r\ncan use the funded accounts to mint banana coin for a new account.\r\n- The new account can then submit transactions and pay the fees using\r\n`PrivateFeePaymentMethod`.\r\n  - See example in `end-to-end/src/composed/e2e_sandbox_example.test.ts`\r\n\r\n---------\r\n\r\nCo-authored-by: Alex Gherghisan <alexghr@users.noreply.github.com>\r\nCo-authored-by: ludamad <domuradical@gmail.com>",
          "timestamp": "2025-02-17T09:00:37+01:00",
          "tree_id": "7cf64fee037fb7e98d424d44ece100fb57ad4d9b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0c937238e193ad1a9936004f665a319ba92468d9"
        },
        "date": 1739781429915,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18338.773387999936,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16067.586888000002 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18842.640455000037,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16471.326252000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4024.2380279998997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3154.818714 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55020.452012,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55020450000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11293.945298,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11293951000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1825613558,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1825613558 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 135923700,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 135923700 ns\nthreads: 1"
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
          "id": "be273e536d27ed101201f108f3f1971bb99cfab4",
          "message": "feat: Contract updates (#11514)\n\nImplements\r\nhttps://hackmd.io/McJEZq0DRlSU0xZjg41QqQ?view#Contract-upgradeability\r\nCloses https://github.com/AztecProtocol/aztec-packages/issues/8979\r\n\r\n---------\r\n\r\nCo-authored-by: Leila Wang <leizciw@gmail.com>\r\nCo-authored-by: Alex Gherghisan <alexghr@users.noreply.github.com>",
          "timestamp": "2025-02-17T10:06:27+01:00",
          "tree_id": "fe3fb014fb1173741bc534dbd5e219a751b0ca32",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/be273e536d27ed101201f108f3f1971bb99cfab4"
        },
        "date": 1739783812593,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18155.77185000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16089.490837 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18552.418585,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16249.258402000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3845.72835299997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3052.679883999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55031.879607999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55031880000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10577.461694,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10577464000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1793077066,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1793077066 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 128968515,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 128968515 ns\nthreads: 1"
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
          "id": "af8c7d6d974232c4d65e43d7005b4d505065a8d8",
          "message": "feat(avm): packed field in bytecode decomposition (#12015)\n\n```\n----------------------------------------------------------------------------\nBenchmark                                  Time             CPU   Iterations\n----------------------------------------------------------------------------\nbc_decomposition_acc                    10.9 us         10.8 us        64294\nbc_decomposition_interactions_acc       1.12 us         1.12 us       635595\n```",
          "timestamp": "2025-02-17T12:25:45Z",
          "tree_id": "a3e00c034c972bb1cb8d24f67d36f9aedec231e7",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/af8c7d6d974232c4d65e43d7005b4d505065a8d8"
        },
        "date": 1739796641262,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18128.714296999988,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16032.233798 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18773.769971000092,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16322.243547999999 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3935.1615500002026,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3087.322353 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54947.885979,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54947883000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11098.674887000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11098678000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1836168299,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1836168299 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 135816022,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 135816022 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "84741533+jewelofchaos9@users.noreply.github.com",
            "name": "defkit",
            "username": "jewelofchaos9"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "914ead09cb19b1a1f8929db7603fdb7e0433482b",
          "message": "chore(docs): acir formal verification final report (#12040)\n\nSMT verification results of ssa->acir translation.",
          "timestamp": "2025-02-17T12:49:24Z",
          "tree_id": "b3c7d1cf67e9bc432d304c432753f2a8ed37b705",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/914ead09cb19b1a1f8929db7603fdb7e0433482b"
        },
        "date": 1739797193789,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18075.453373000015,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16051.966492000001 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18669.87492499999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16194.918232999999 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3915.178076000018,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3094.3153509999997 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54786.092111000005,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54786091000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10631.256249,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10631260000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1816231128,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1816231128 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 134972954,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 134972954 ns\nthreads: 1"
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
          "id": "24e02d32f43d692582231605df90208aa3afb10e",
          "message": "fix: Basic install test (#12049)\n\nChanging the test to use one of the prefilled accounts for now.\r\nPossible other options:\r\n- Bridge from l1 in the test: The ugly thing about this is showing the\r\nuser that he has to send garbage txs to make the sandbox chain advance\r\nso the l1l2 message gets included. Would be nice to show them the\r\nbridging though.\r\n- Create a free for all FPC: Using the fpc is maybe too complicated for\r\na getting started guide?\r\n- Use the bananacoin FPC: I think it's too complicated for getting\r\nstarted, but should be nice as a second tutorial\r\n \r\nHaven't changed the tutorial (getting_started.md) yet until I get some\r\ninput on the options\r\n \r\n@Thunkar I think the cli-wallet tests aren't running in CI, because they\r\nare assuming no fees",
          "timestamp": "2025-02-17T18:27:28+01:00",
          "tree_id": "86a2372b712014150b72b032db34225256967f41",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/24e02d32f43d692582231605df90208aa3afb10e"
        },
        "date": 1739813874354,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18125.37029600003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15906.914583999998 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18683.836364999992,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16217.380595999999 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3918.816131999961,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3082.05831 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54826.743786,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54826743000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10864.299625,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10864306000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1804453099,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1804453099 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 130484083,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 130484083 ns\nthreads: 1"
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
          "id": "0c9b2749f8dc000e93940c9bba1a3320bd814514",
          "message": "fix: aztec up hash (#12052)\n\nneeded dependency package listed",
          "timestamp": "2025-02-17T17:39:38Z",
          "tree_id": "91a7662cd7597dbb28251a516e219d3d0baa0ec1",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0c9b2749f8dc000e93940c9bba1a3320bd814514"
        },
        "date": 1739814615249,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17999.369012999978,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15824.030663 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18579.844863000006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16287.465149 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3833.2978010000147,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3089.9071690000005 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54563.097516,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54563096000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10322.775940999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10322783000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1817231976,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1817231976 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 130979811,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 130979811 ns\nthreads: 1"
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
          "id": "e9e1afe29c8c321c689f1ce25d05b6692d93e341",
          "message": "fix: update parser test (#12056)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\nline.",
          "timestamp": "2025-02-17T19:18:32Z",
          "tree_id": "a65d7099cd50204a0ecab0efe9131c3ea8c10111",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e9e1afe29c8c321c689f1ce25d05b6692d93e341"
        },
        "date": 1739821132158,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18129.837407999956,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15950.632961999998 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18655.422824999958,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16686.412431 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3872.051441999929,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3080.53111 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54700.101678000006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54700100000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9588.394004999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9588399000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1803542027,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1803542027 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 129281354,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 129281354 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "jose@aztecprotocol.com",
            "name": "José Pedro Sousa",
            "username": "signorecello"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "3c72eadf88e3e7c43b7d3f6506ca4969f77c0e13",
          "message": "chore(bb): quick fix (#12054)\n\nQuickly adding an option so we can export the UltraKeccakHonk VK\r\n\r\nCo-authored-by: signorecello <outgoing@zkpedro.dev>\r\nCo-authored-by: Maddiaa <47148561+Maddiaa0@users.noreply.github.com>",
          "timestamp": "2025-02-17T19:45:16Z",
          "tree_id": "bdded036c0cfa8eec7355628e30ffb9f003c3841",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/3c72eadf88e3e7c43b7d3f6506ca4969f77c0e13"
        },
        "date": 1739822768011,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18109.299859999963,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15951.714059 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18466.065640000124,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16090.914033999998 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3818.7827289998495,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3113.189872 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54638.387069,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54638386000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9698.016322,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9698020000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1819817622,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1819817622 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 131032834,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 131032834 ns\nthreads: 1"
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
          "id": "7b7d960d51027b549ec9627ba2822fb87100a022",
          "message": "fix: p2p testbench (#12053)",
          "timestamp": "2025-02-17T21:42:03Z",
          "tree_id": "3ec98973a4daa593a39ab9736fa44e307223f5a5",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7b7d960d51027b549ec9627ba2822fb87100a022"
        },
        "date": 1739829919979,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18417.763296999965,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16255.595890999999 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18555.668458000127,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16140.138437000001 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3880.8178629999475,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3092.2522830000007 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54794.041199,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54794042000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11290.980502,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11290991000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1816350590,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1816350590 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 133232867,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 133232867 ns\nthreads: 1"
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
          "id": "15ccf534e9546d8e1edd186121d602cbc4b5a3da",
          "message": "chore: remove code vendored from bignum (#12044)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\nline.\n\n---------\n\nCo-authored-by: Khashayar Barooti <khashayar@aztecprotocol.com>",
          "timestamp": "2025-02-17T21:49:36Z",
          "tree_id": "06fcd71bed2ef6239484f809181569607fc5e149",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/15ccf534e9546d8e1edd186121d602cbc4b5a3da"
        },
        "date": 1739830386682,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18197.54862900004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16135.078455000003 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18639.225546000034,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16321.219611 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3880.9011510002165,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3113.6057250000003 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54832.365333,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54832365000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10742.576329,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10742582000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1819653535,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1819653535 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 132396126,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 132396126 ns\nthreads: 1"
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
          "id": "7df5c1661a8ddeb23daba9bedb7bc56f3e0c8901",
          "message": "fix: call ivc integration browser test (#12059)",
          "timestamp": "2025-02-17T17:55:59-05:00",
          "tree_id": "2c92e42d939b33fcd268db301633cc41d5a09428",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7df5c1661a8ddeb23daba9bedb7bc56f3e0c8901"
        },
        "date": 1739834368613,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18148.17604999985,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16116.726794999999 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18660.226512999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16281.979556 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3966.992110000092,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3089.7706279999998 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54845.015946,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54845016000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11297.389065000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11297393000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1835726400,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1835726400 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 135508193,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 135508193 ns\nthreads: 1"
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
          "id": "8aee21da34016782dfb0476df858d64e3333d994",
          "message": "feat: make rewards claimable (#11975)\n\nFixes #11949.",
          "timestamp": "2025-02-18T09:04:01Z",
          "tree_id": "b5bfdb2c01aa7348ee5ca806425d3fdea6272ec7",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8aee21da34016782dfb0476df858d64e3333d994"
        },
        "date": 1739870911877,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18112.768509000034,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15981.205748999999 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18718.990391000036,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16333.252645000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4003.4159639999416,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3102.036591 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54970.957800000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54970958000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11057.511843,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11057513000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1829537793,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1829537793 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 134968343,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 134968343 ns\nthreads: 1"
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
          "id": "fc8d49b3c2ac365217452e3083096a90116c97fe",
          "message": "fix: Ensure a clean LMDB wrapper shutdown (#12041)\n\nThis PR introduces additional synchronisation into the NAPI module to\r\nensure a clean LMDB wrapper shutdown.",
          "timestamp": "2025-02-18T12:25:36Z",
          "tree_id": "ffcaa397f196918504df7dac96b5913aec961d99",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/fc8d49b3c2ac365217452e3083096a90116c97fe"
        },
        "date": 1739883729168,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18269.12806900009,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16048.445266999997 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18877.22990499992,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16482.467230000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3967.1238879998327,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3118.2572680000003 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55162.35316599999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55162353000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11259.285661,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11259288000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1816174601,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1816174601 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 131514224,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 131514224 ns\nthreads: 1"
          }
        ]
      }
    ]
  }
}