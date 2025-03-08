window.BENCHMARK_DATA = {
  "lastUpdate": 1741426117737,
  "repoUrl": "https://github.com/AztecProtocol/aztec-packages",
  "entries": {
    "C++ Benchmark": [
      {
        "commit": {
          "author": {
            "email": "mara@aztec-labs.com",
            "name": "maramihali",
            "username": "maramihali"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "aaef150f70197c9c59fafc06bd54eb7415185541",
          "message": "chore: parallelise interleaving and remove mentions of concatenation (#12373)\n\nIn this PR:\n* rename all mentions of concatenation to interleaving and remove the\nfunctions doing concatenation or toy interleaving, remove redundant\ntests related to the toy interleaving\n* parallelise the function constructing the interleaved polynomials from\ngroups (running the ClientIVC benchmark now shows no decrease in\nperformance)",
          "timestamp": "2025-03-05T18:11:00Z",
          "tree_id": "65e19cb4c57dbcf9a35cafa04c73ac3fb3bdae2c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/aaef150f70197c9c59fafc06bd54eb7415185541"
        },
        "date": 1741200698231,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18375.856698000007,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16074.999987999998 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18880.77298500002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16489.99323 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3946.281467999597,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3168.8245930000003 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55228.775245000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55228775000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9941.434894,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9941436000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1910214844,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1910214844 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 218805327,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 218805327 ns\nthreads: 1"
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
          "id": "80c9b4e2e34e70d423622ea0391a6d0a1785ddf9",
          "message": "fix: update bbup to match new release naming (#12495)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\nline.",
          "timestamp": "2025-03-05T13:34:44-05:00",
          "tree_id": "d06252237772e0bac6f062fd0f56ea75951df62c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/80c9b4e2e34e70d423622ea0391a6d0a1785ddf9"
        },
        "date": 1741202459337,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18011.361953000007,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15900.820964 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18651.774841999897,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16304.77351 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3836.4296879997255,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3087.183767 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54779.418416,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54779418000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9978.066083,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9978071000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1885849924,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1885849924 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 211532938,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 211532938 ns\nthreads: 1"
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
          "id": "3b981f9217f9b859bdfbcdba2f5c080392c98da6",
          "message": "chore: fix a bunch of trait import issues (#12431)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\nline.",
          "timestamp": "2025-03-05T19:05:04Z",
          "tree_id": "edb8f27088b11d75033c36c5b7069466b7cfcd78",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/3b981f9217f9b859bdfbcdba2f5c080392c98da6"
        },
        "date": 1741203528767,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18327.026243999855,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16124.392135 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18681.443285000114,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16244.653399 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3878.8610250001057,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3089.8239439999998 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55236.77291600001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55236774000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10069.38365,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10069386000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1909020292,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1909020292 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 219302052,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 219302052 ns\nthreads: 1"
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
            "email": "84764772+aminsammara@users.noreply.github.com",
            "name": "Amin Sammara",
            "username": "aminsammara"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "ec2ce9a37e489aadb8b48d801f6fb70ee6b42003",
          "message": "chore: clean env vars (#12356)\n\ncall me henry hoover\n\n---------\n\nCo-authored-by: Maddiaa0 <47148561+Maddiaa0@users.noreply.github.com>",
          "timestamp": "2025-03-05T19:06:23Z",
          "tree_id": "6bbddb997146493b60d6945f3e56b4e1d6b315f6",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ec2ce9a37e489aadb8b48d801f6fb70ee6b42003"
        },
        "date": 1741203819479,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18328.167053000016,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16138.502574 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18895.865793999976,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16416.576989 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3905.0991149999845,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3108.4376200000006 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55335.33912,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55335340000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10439.699504,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10439703000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1910055165,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1910055165 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 213230961,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 213230961 ns\nthreads: 1"
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
          "id": "8932dd69bfd9579a3d350fa1557f5bee54616289",
          "message": "chore: Fix MEMORY argument to yarn project test run (#12488)\n\n[Here](https://github.com/AztecProtocol/aztec-packages/pull/12283/files#diff-d4325b1e4d1032ba0c018e993395c3f8ceed45001f4ced5388977b2c90c26618)\nthe argument for setting max memory for a yarn project test was changed\nfrom MEM to MEMORY, which broke tests that dependend on it.\n\nThis PR rolls it back to MEM, for consistency with other scripts.",
          "timestamp": "2025-03-05T19:31:26Z",
          "tree_id": "0225e774dda11dda46090b3c7c95c9d274c44329",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8932dd69bfd9579a3d350fa1557f5bee54616289"
        },
        "date": 1741205245209,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18369.415395000033,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16101.081646 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18884.307804999935,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16526.288998 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3980.6723690001036,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3197.5170560000006 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55492.315007,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55492316000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10609.068629,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10609072000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1921019107,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1921019107 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 232539619,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 232539619 ns\nthreads: 1"
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
          "id": "374a5d5ecaf006b0cdddf69ef581237e9b6add32",
          "message": "fix: read rollup address from registry (#12496)\n\nFix #12492",
          "timestamp": "2025-03-05T14:15:49-05:00",
          "tree_id": "43a6abb7daff45646a1642f426b22aaf5061bdc8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/374a5d5ecaf006b0cdddf69ef581237e9b6add32"
        },
        "date": 1741205578865,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18250.266262999958,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16113.07475 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18546.369420000017,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16249.865657 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3821.3338159998784,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3003.2143410000003 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55228.711019999995,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55228710000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9549.347054,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9549351000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1941240640,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1941240640 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 221839013,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 221839013 ns\nthreads: 1"
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
          "id": "01c9795b96df2f18d9ca60d35f7ec2d2f66396cd",
          "message": "fix: release flow (#12501)",
          "timestamp": "2025-03-05T20:51:35Z",
          "tree_id": "96da42a945521807b7d79e156367a44de5648234",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/01c9795b96df2f18d9ca60d35f7ec2d2f66396cd"
        },
        "date": 1741208689069,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18039.597761999972,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15921.821073000001 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18650.57441099998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16179.880503 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3916.2067769999567,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3088.2144860000003 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54803.65087,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54803650000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10373.775163,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10373778000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1896775800,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1896775800 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 213141836,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 213141836 ns\nthreads: 1"
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
          "id": "ce9c4541d04d6e288ea6bffa18c2621ac23f9079",
          "message": "fix: release part 2 (#12502)",
          "timestamp": "2025-03-05T16:06:20-05:00",
          "tree_id": "d33e6e631a21c509ae0ff929ded7d8358f1fdfc0",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ce9c4541d04d6e288ea6bffa18c2621ac23f9079"
        },
        "date": 1741210694110,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18160.04621900015,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15987.789912 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18654.52214900006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16145.174866000001 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3896.6780520001976,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3088.7552060000003 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55609.260949999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55609262000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11334.431571000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11334434000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1937162839,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1937162839 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 218409756,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 218409756 ns\nthreads: 1"
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
          "id": "b11c2117713bd38028975373b6dc8726f5c4214b",
          "message": "chore: repair release-please PR for 0.77.1\n\nRelease-As: 0.77.1",
          "timestamp": "2025-03-05T21:15:52Z",
          "tree_id": "d9c2f5be94099cddcc67a7197985758ae102871c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/b11c2117713bd38028975373b6dc8726f5c4214b"
        },
        "date": 1741210894080,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18034.433885999988,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16019.332876 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18580.447092999973,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16206.131461000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3822.7982049999127,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3049.343333 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54975.106273000005,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54975107000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10144.30805,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10144325000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1952114979,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1952114979 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 216852817,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 216852817 ns\nthreads: 1"
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
          "id": "0c7d36305895988a6a1a1baab31ed87f1c51da9e",
          "message": "releases: fix txe running with sandbox",
          "timestamp": "2025-03-05T21:33:28Z",
          "tree_id": "30a3a92cf40de56425b01630e06de06ab9cf81ef",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0c7d36305895988a6a1a1baab31ed87f1c51da9e"
        },
        "date": 1741211291955,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18175.115942999924,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16049.057840000003 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18535.199615000012,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16186.707269000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3777.000396999938,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 2988.106441 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54822.014206,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54822013000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10757.124852,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10757131000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1888541803,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1888541803 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 215832819,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 215832819 ns\nthreads: 1"
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
          "id": "ab9e99b2712c96cf272d1236c8675c041196c5c8",
          "message": "chore(master): release 0.77.1 (#12503)\n\n:robot: I have created a new Aztec Packages release\n---\n\n\n##\n[0.77.1](https://github.com/AztecProtocol/aztec-packages/compare/v0.77.0...v0.77.1)\n(2025-03-05)\n\n\n### Features\n\n* Combine group polynomials in translator by interleaving rather than\nconcatenation\n([#12343](https://github.com/AztecProtocol/aztec-packages/issues/12343))\n([c7dc549](https://github.com/AztecProtocol/aztec-packages/commit/c7dc5492c431ad6052a92d7de265f2a2e59af728))\n* Enrich env vars based on network option\n([#12489](https://github.com/AztecProtocol/aztec-packages/issues/12489))\n([6921f46](https://github.com/AztecProtocol/aztec-packages/commit/6921f4674864a1ea8f1e61b96f9c3a4014a555b0))\n* tightly pack logs inside blobs\n([#11752](https://github.com/AztecProtocol/aztec-packages/issues/11752))\n([b6871ce](https://github.com/AztecProtocol/aztec-packages/commit/b6871ce5487f7ab1cc27cf8777fa238028f2dc10))\n* track if spot and sanitise merge queue name\n([#12432](https://github.com/AztecProtocol/aztec-packages/issues/12432))\n([7a307e7](https://github.com/AztecProtocol/aztec-packages/commit/7a307e7348d6a03fc8c25ebd587c924ad370fdeb))\n\n\n### Bug Fixes\n\n* read rollup address from registry\n([#12496](https://github.com/AztecProtocol/aztec-packages/issues/12496))\n([374a5d5](https://github.com/AztecProtocol/aztec-packages/commit/374a5d5ecaf006b0cdddf69ef581237e9b6add32)),\ncloses\n[#12492](https://github.com/AztecProtocol/aztec-packages/issues/12492)\n* release and add nightly tag flow\n([#12493](https://github.com/AztecProtocol/aztec-packages/issues/12493))\n([c1daa11](https://github.com/AztecProtocol/aztec-packages/commit/c1daa11be668d5a85b39a82ce18b81745d2a283e))\n* release flow\n([#12501](https://github.com/AztecProtocol/aztec-packages/issues/12501))\n([01c9795](https://github.com/AztecProtocol/aztec-packages/commit/01c9795b96df2f18d9ca60d35f7ec2d2f66396cd))\n* release part 2\n([#12502](https://github.com/AztecProtocol/aztec-packages/issues/12502))\n([ce9c454](https://github.com/AztecProtocol/aztec-packages/commit/ce9c4541d04d6e288ea6bffa18c2621ac23f9079))\n* update bbup to match new release naming\n([#12495](https://github.com/AztecProtocol/aztec-packages/issues/12495))\n([80c9b4e](https://github.com/AztecProtocol/aztec-packages/commit/80c9b4e2e34e70d423622ea0391a6d0a1785ddf9))\n\n\n### Miscellaneous\n\n* clean env vars\n([#12356](https://github.com/AztecProtocol/aztec-packages/issues/12356))\n([ec2ce9a](https://github.com/AztecProtocol/aztec-packages/commit/ec2ce9a37e489aadb8b48d801f6fb70ee6b42003))\n* fix a bunch of trait import issues\n([#12431](https://github.com/AztecProtocol/aztec-packages/issues/12431))\n([3b981f9](https://github.com/AztecProtocol/aztec-packages/commit/3b981f9217f9b859bdfbcdba2f5c080392c98da6))\n* Fix MEMORY argument to yarn project test run\n([#12488](https://github.com/AztecProtocol/aztec-packages/issues/12488))\n([8932dd6](https://github.com/AztecProtocol/aztec-packages/commit/8932dd69bfd9579a3d350fa1557f5bee54616289))\n* force release-please PR for 0.77.1\n([e22ac0e](https://github.com/AztecProtocol/aztec-packages/commit/e22ac0ebf990381137c659b727e6aac9a1d30df2))\n* parallelise interleaving and remove mentions of concatenation\n([#12373](https://github.com/AztecProtocol/aztec-packages/issues/12373))\n([aaef150](https://github.com/AztecProtocol/aztec-packages/commit/aaef150f70197c9c59fafc06bd54eb7415185541))\n* repair release-please PR for 0.77.1\n([b11c211](https://github.com/AztecProtocol/aztec-packages/commit/b11c2117713bd38028975373b6dc8726f5c4214b))\n\n---\nThis PR was generated with [Release\nPlease](https://github.com/googleapis/release-please). See\n[documentation](https://github.com/googleapis/release-please#release-please).",
          "timestamp": "2025-03-05T16:46:11-05:00",
          "tree_id": "e42b78606e55160f893295b0a150d2d8d81f41a8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ab9e99b2712c96cf272d1236c8675c041196c5c8"
        },
        "date": 1741211932840,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18108.764242000005,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16066.534576999999 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18647.607296000046,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16399.359829 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3847.8005540000595,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3027.815354 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54835.778192,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54835777000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9654.238642999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9654247000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1898703195,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1898703195 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 214564931,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 214564931 ns\nthreads: 1"
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
          "id": "7ab0e1b45773c6bd6ad8c267813fe3a78de7ce81",
          "message": "fix: txe container clash (#12504)",
          "timestamp": "2025-03-05T16:45:56-05:00",
          "tree_id": "48ab4ac7014afad0c74dea00c6c5fd75b8f943d2",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7ab0e1b45773c6bd6ad8c267813fe3a78de7ce81"
        },
        "date": 1741212105574,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18686.171095999955,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15964.530215 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18850.410711999983,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16183.999075000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3816.1899130000165,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3019.177013 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54867.81000699999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54867810000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10012.298660999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10012308000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1918981136,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1918981136 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 227029978,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 227029978 ns\nthreads: 1"
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
          "id": "0c3024e7b0f9475624e9652adce2f64a88b7f923",
          "message": "fix: override bb path in cli-wallet PXE config (#12511)\n\nSet `bbBinaryPath` and `bbWorkingDirectory` only when\n`PXE_PROVER=native`\n\ncli-wallet sets its own bbPath and bbWorkdir when `PXE_PROVER=native`,\nbut PXE also read these values from env even when `PXE_PROVER=none`.\nThis is happening in release image as we now [set these ENVs\n](https://github.com/AztecProtocol/aztec-packages/blob/master/release-image/Dockerfile#L35-L36)in\nDockerfile.\nThis PR overrides the values from ENV and unset them if proving is not\nneeded.\n\n(This is only a patch. Need to refactor later)",
          "timestamp": "2025-03-06T14:55:26+04:00",
          "tree_id": "11b96a665a979ea6da6d61469dd4db0265de193d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0c3024e7b0f9475624e9652adce2f64a88b7f923"
        },
        "date": 1741260590637,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18921.74718799993,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16063.729397 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18984.19788399997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16456.994827 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3943.3864360000825,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3090.0180779999996 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55907.414586,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55907412000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10247.451128999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10247457000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1880520494,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1880520494 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 216057393,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 216057393 ns\nthreads: 1"
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
          "id": "3ee8d517840ea91b2a998cbbb9207e26913a05e4",
          "message": "chore: add yaml aliases in .test_patterns.yml (#12516)\n\nSmall QOL change to this file so that once someone has been made the\nowner of a failing test (and so added to the list) we can easily refer\nto them by name rather than needing to refer to slack.",
          "timestamp": "2025-03-06T12:04:43Z",
          "tree_id": "dc253d81748de8fe46835f49c31489b4cbdbe2d1",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/3ee8d517840ea91b2a998cbbb9207e26913a05e4"
        },
        "date": 1741264732181,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18193.006114999887,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15972.996214000003 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18626.59772799998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16271.035268999998 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3935.781053000028,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3063.742021 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54919.957133,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54919956000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10512.011792,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10512015000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1892620223,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1892620223 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 215384873,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 215384873 ns\nthreads: 1"
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
          "id": "f733879bd5e59a222cc288de6c298eaa8553312c",
          "message": "chore: addressing remaining feedback in PR 12182 (#12494)\n\nResolves #12193",
          "timestamp": "2025-03-06T12:34:17+01:00",
          "tree_id": "1b5e39af3e7025d6ae9ee929233e7b606bae00c7",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f733879bd5e59a222cc288de6c298eaa8553312c"
        },
        "date": 1741264736103,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18290.722733000166,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16155.549143000002 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18655.560426999953,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16290.867965 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3907.450698000048,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3087.845369 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55086.596349,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55086596000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10195.955181999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10195963000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1894737924,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1894737924 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 213166838,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 213166838 ns\nthreads: 1"
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
          "id": "778bfa65d6dc6192c1e79ba0fb371a22dc1b652a",
          "message": "chore(cli): exclude kind smoke test from flake list (#12518)",
          "timestamp": "2025-03-06T12:54:03Z",
          "tree_id": "41a971d4a9fc7c3fd3f4c060faf3798da21e9d9d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/778bfa65d6dc6192c1e79ba0fb371a22dc1b652a"
        },
        "date": 1741267237486,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18101.18253399992,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16042.332942000001 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18657.048921000067,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16364.013318999998 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3824.502331000076,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3076.063856 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55126.594585,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55126594000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9471.981802999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9471984000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1884953403,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1884953403 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 216390726,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 216390726 ns\nthreads: 1"
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
          "id": "b1284ef4ca7c20b2320a92f91b0e33eedb3c95a2",
          "message": "fix(avm): use the correct number of rows in check_interaction (#12519)\n\nIt was wrongly using `polys.size()` which is the number of columns and not rows.",
          "timestamp": "2025-03-06T13:02:10Z",
          "tree_id": "aec3c0bfa8f605fb521acdca13b8c9feb06ac754",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/b1284ef4ca7c20b2320a92f91b0e33eedb3c95a2"
        },
        "date": 1741270271372,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18335.038362999967,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16157.755619 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18665.69404500001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16271.550749 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3844.5542489998843,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3070.304065 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54954.964355000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54954964000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9825.680619000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9825683000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1890354291,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1890354291 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 214437894,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 214437894 ns\nthreads: 1"
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
          "id": "9f57048a90ceb402df128d1033c81ab6f0eb1a51",
          "message": "chore: cleanup committing and masking utility (#12514)\n\nTransfer the masking function to the polynomial class itself and create a `commit_to_witness` function for translator which will implicitly handle masking when ZK is enabled.",
          "timestamp": "2025-03-06T13:34:58Z",
          "tree_id": "dfc05a883c7bfdbf46164d0e79485f30c246bb25",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9f57048a90ceb402df128d1033c81ab6f0eb1a51"
        },
        "date": 1741270836910,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18435.43948300021,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16241.901034000002 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18859.94210700028,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16433.251722 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3932.0303320000676,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3138.2082280000004 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55309.956425000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55309955000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11042.584718999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11042591000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1968549731,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1968549731 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 222007098,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 222007098 ns\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2185.31",
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
          "id": "a38f353f03b0af1bd310edcb899a45fdad874520",
          "message": "fix: Bitwise lookup (#12471)",
          "timestamp": "2025-03-06T14:59:54+01:00",
          "tree_id": "ce523abef124635d10d612ed5277058b9a712b55",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a38f353f03b0af1bd310edcb899a45fdad874520"
        },
        "date": 1741272675772,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18430.199813999934,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16230.833803 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18992.803971000285,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16375.235743000001 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4002.185508999901,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3124.3228499999996 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55591.231958000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55591233000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11221.139098,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11221141000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1904565523,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1904565523 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 215258691,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 215258691 ns\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2185.31",
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
          "id": "2babc5084a3383b798c65119b5ba820f8ab30010",
          "message": "chore: update and lock AVM's lockfile (#12533)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\nline.",
          "timestamp": "2025-03-06T16:16:58Z",
          "tree_id": "bfa537f31fbff68d0a7a8908f15017b391c87fa7",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/2babc5084a3383b798c65119b5ba820f8ab30010"
        },
        "date": 1741279749436,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18448.42186300002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16192.874606 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18729.558502999906,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16557.214565000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3939.682918999779,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3082.7933790000006 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55394.428774,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55394428000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10186.779785,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10186785000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1898154077,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1898154077 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 211547031,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 211547031 ns\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2185.31",
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
          "id": "a69f41609f7ff49204807b58d3889ba3968a4ea8",
          "message": "chore: Cleaner PXE (#12515)\n\n![image](https://github.com/user-attachments/assets/87ca774b-7a4d-466d-9ca2-eea877592b45)",
          "timestamp": "2025-03-06T16:45:58Z",
          "tree_id": "f3653434e0b4222f89ac9d9ebf82cca16fa23431",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a69f41609f7ff49204807b58d3889ba3968a4ea8"
        },
        "date": 1741281849688,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18440.21738399988,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16228.841124000002 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18771.350307000146,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16225.445934 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3902.9926130001513,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3132.439669 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55651.144147000006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55651143000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11528.764418,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11528776000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1909809842,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1909809842 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 231274195,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 231274195 ns\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2185.31",
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
          "id": "ed46a3c69fd4270ab57d6afaaad868696a9c29a2",
          "message": "fix: Revert \"make vk metadata actual witnesses\" (#12534)",
          "timestamp": "2025-03-06T12:08:55-05:00",
          "tree_id": "5b5bdca3ce1e8b9cca91dc91f5f7a61f541be0ec",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ed46a3c69fd4270ab57d6afaaad868696a9c29a2"
        },
        "date": 1741283669214,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18524.59270999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16369.477935000003 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18853.889509000055,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16479.774042 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4020.491953000146,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3106.29264 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55888.988402,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55888988000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10282.892955,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10282901000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1908792907,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1908792907 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 211901901,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 211901901 ns\nthreads: 1"
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
          "id": "2c45fb9a66d4bfba476e8ca3c29207a311b35f1a",
          "message": "chore: More config defaults and forward p2p ports (#12529)\n\nThis PR specifies more network defaults and modifies aztec start to\nforward p2p ports",
          "timestamp": "2025-03-06T17:24:35Z",
          "tree_id": "dc85d7aeb95c6f5bcdc219e0542d7cd05e84ab4a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/2c45fb9a66d4bfba476e8ca3c29207a311b35f1a"
        },
        "date": 1741284061638,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18347.1750650001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16168.707955999998 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18798.600246000206,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16400.570402 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3889.735557999984,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3182.0644020000004 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55407.450774,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55407451000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10717.033823999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10717042000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1916032685,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1916032685 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 221672200,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 221672200 ns\nthreads: 1"
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
          "id": "fb9ada38d49d5cdedf5a9f358ce8b8e56bf5170c",
          "message": "chore: Fix yarn install immutable issues (#12539)\n\nWe introduced two issues in #12125 when adding the immutable patterns to\nyarn install:\n\n- If `immutablePatterns` is set, yarn sets the `immutable` flag even\noutside CI (contradicting its documentation). This is fixed by\nexplicitly setting `--no-immutable` on the non-CI branch of install.\n\n- The glob `**/package.json` inadvertently matched package.json files\nwithin `node_modules`, so installing them created the new files, which\nmeans they were flagged as changed. This is fixed by having a less eager\nglob.\n\nFixes #12538",
          "timestamp": "2025-03-06T18:05:30Z",
          "tree_id": "78ba6f5d77e1216353a5cbbfe43f37ec161db04b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/fb9ada38d49d5cdedf5a9f358ce8b8e56bf5170c"
        },
        "date": 1741286931363,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18233.103634000145,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16126.868903999999 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18758.14135399992,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16363.875466 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3879.4861850001325,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3082.134408 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55729.37016399999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55729369000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9716.030450000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9716033000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1904155558,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1904155558 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 215058238,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 215058238 ns\nthreads: 1"
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
          "id": "ab13d43264d3ae542a386ecfef4cf288d311e8b4",
          "message": "chore: restore bb --version (#12542)\n\nNo need for this churn",
          "timestamp": "2025-03-06T19:54:36Z",
          "tree_id": "1456df595dfd2119f69b9e2741540b2479f9a545",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ab13d43264d3ae542a386ecfef4cf288d311e8b4"
        },
        "date": 1741292997668,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18268.944993000106,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16125.585826999999 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18882.16019699985,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16636.850645 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3887.9748340000333,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3096.168997 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55387.348304,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55387349000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9426.597858,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9426604000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1888714503,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1888714503 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 219760603,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 219760603 ns\nthreads: 1"
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
          "id": "8ede7b12b4d5ad6d5053e41c266ee84595b04f1a",
          "message": "chore(spartan): kind test speedup (#12478)",
          "timestamp": "2025-03-06T15:13:36-05:00",
          "tree_id": "fc3e66a6306aecf396f0eb93ef5dc9fa1fc0ec63",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8ede7b12b4d5ad6d5053e41c266ee84595b04f1a"
        },
        "date": 1741294412750,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18377.78857300009,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16100.642231000002 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18941.064604000076,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16412.338674000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3906.9772339998963,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3088.5597709999993 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55717.611983,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55717611000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10267.444379999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10267447000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1921502769,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1921502769 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 230133692,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 230133692 ns\nthreads: 1"
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
          "id": "1a3c11287ca66bf5189c1ecc58681de4a7af1844",
          "message": "feat: Sync from noir (#12545)\n\nAutomated pull of development from the\n[noir](https://github.com/noir-lang/noir) programming language, a\ndependency of Aztec.\nBEGIN_COMMIT_OVERRIDE\nfix: FunctionDefinition::as_typed_expr didn't work well for trait imp…\n(https://github.com/noir-lang/noir/pull/7611)\nfeat(experimental): Enable ownership syntax\n(https://github.com/noir-lang/noir/pull/7603)\nchore: add underscore parameter documentation\n(https://github.com/noir-lang/noir/pull/7562)\nfix: compare Quoted by expanding interned values\n(https://github.com/noir-lang/noir/pull/7602)\nfix: TokensPrettyPrinter was missing some spaces between tokens\n(https://github.com/noir-lang/noir/pull/7607)\nfix(experimental): Fix execution of match expressions with multiple\nbranches (https://github.com/noir-lang/noir/pull/7570)\nEND_COMMIT_OVERRIDE\n\n---------\n\nCo-authored-by: Tom French <15848336+TomAFrench@users.noreply.github.com>",
          "timestamp": "2025-03-06T20:45:39Z",
          "tree_id": "b1fd2406bffa307e773880ea11739a7b1e153d5a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1a3c11287ca66bf5189c1ecc58681de4a7af1844"
        },
        "date": 1741296410649,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18248.018858999785,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16166.098242 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18797.319371999947,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16453.975092 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3943.9553319998595,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3168.922482 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 56028.81328,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 56028813000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9974.843866,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9974852000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1993982205,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1993982205 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 240383172,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 240383172 ns\nthreads: 1"
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
          "id": "4a1ea352a9abbcfb8044bcba9d5cf31fff03dbc6",
          "message": "chore: various small cleanup issues (#12537)",
          "timestamp": "2025-03-06T16:34:41-05:00",
          "tree_id": "9cc6133ef3c3945e854c4d47b1bc453b3baeae55",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/4a1ea352a9abbcfb8044bcba9d5cf31fff03dbc6"
        },
        "date": 1741299451607,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18455.91873000012,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16222.251518000001 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 19063.689575999888,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16546.188843 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3890.6876189994364,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3048.239348 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55827.253087000005,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55827253000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9857.376232,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9857380000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1907276321,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1907276321 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 213626111,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 213626111 ns\nthreads: 1"
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
          "id": "fac5fb52feefe9a8c2a6faa51bf7108f22d6e6ae",
          "message": "fix: release bb-mac",
          "timestamp": "2025-03-06T22:02:38Z",
          "tree_id": "65239d8279564c0bff3de4646f66d36e97d1f9c5",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/fac5fb52feefe9a8c2a6faa51bf7108f22d6e6ae"
        },
        "date": 1741300726450,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18169.97609100008,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16122.006223 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18680.402192999965,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16312.530753000001 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3746.175788000073,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3005.689575 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54880.481308999995,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54880483000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10063.194684999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10063196000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1902067510,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1902067510 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 215863297,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 215863297 ns\nthreads: 1"
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
          "id": "7e89dfbc6b70bb9a8e226654e391a356f948f7a0",
          "message": "fix: publish-bb-mac.yml version replace (#12554)",
          "timestamp": "2025-03-06T17:47:39-05:00",
          "tree_id": "b136a6c491600e4ccf6da64b47a2eeda3d00ddd9",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7e89dfbc6b70bb9a8e226654e391a356f948f7a0"
        },
        "date": 1741303510146,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18101.733005999904,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15860.258522 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18645.24784299988,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16244.482595999998 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3812.7908740000294,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 2966.7159790000005 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54647.965753000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54647965000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10112.797818,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10112801000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1896470961,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1896470961 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 219973693,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 219973693 ns\nthreads: 1"
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
          "id": "dcba7a49a4fefcbe6db4f28d7bb7e0986e31c30d",
          "message": "feat: nullify just-added notes (#12552)\n\nBack when PXE was a service processing all blocks, we'd remove nullified\nnotes as we saw their nullifiers. This later got changed, and as of\nhttps://github.com/AztecProtocol/aztec-packages/pull/10722 we remove all\nnullified notes whenever we 'sync' notes. However, note syncing is\nbecoming less and less a part of PXE, and as of\nhttps://github.com/AztecProtocol/aztec-packages/pull/12391 we even\ndeliver notes _outside_ of the PXE-led note syncing process (whenever we\ncomplete partial note). This causes problems because we end up adding\nnotes, failing to realize they've been nullified and then returning them\nvia `get_notes` (which is what causes some tests in\nhttps://github.com/AztecProtocol/aztec-packages/pull/12391 to fail). The\nnext time a contract function is run we'll do note syncing again and\nthey'll be then removed, but we did have a full fn call in which they\nwere available.\n\nThis PR makes it so we always check if newly-added notes have been\nnullified, and remove them if so. I also added some explanations re. why\nwe're doing things this way, created some follow-up issues (mostly\n#12550 and\nhttps://github.com/AztecProtocol/aztec-packages/issues/12553), and\ninlined `produceNoteDaos` to have the whole thing happen in a single\nplace. I think it's now more readable but potentially slightly large -\nperhaps this will improve as we split `PxeOracleInterface` in multiple\nfiles or modules.",
          "timestamp": "2025-03-07T02:19:04Z",
          "tree_id": "f9d4217d21979ec659e5b28e9488d6811159a0ea",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/dcba7a49a4fefcbe6db4f28d7bb7e0986e31c30d"
        },
        "date": 1741315569809,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18227.74790700009,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16011.127119999997 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18677.2359229999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16391.866535 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3889.9609000000055,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3105.319923 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55150.87788,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55150878000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11676.987714,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11676991000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1927901363,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1927901363 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 218071212,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 218071212 ns\nthreads: 1"
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
          "id": "ed1dbdc57861a9b346deea2f208f97cd01c0758f",
          "message": "chore: rm unused methods (#12544)\n\nWe got rid of `addNullifiedNote` in\nhttps://github.com/AztecProtocol/aztec-packages/pull/11822, I imagine it\naccidentally came back in the recent refactors.\n\nI also got rid of `addNote` since we always use `addNotes` anyway.",
          "timestamp": "2025-03-07T06:48:01+01:00",
          "tree_id": "53bf67a77fe14c47dba62bece9cda61721bdfddc",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ed1dbdc57861a9b346deea2f208f97cd01c0758f"
        },
        "date": 1741329366304,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18521.546717000092,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16281.611852000002 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18952.38420099986,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16517.416342999997 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3943.3212789999743,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3101.3331209999997 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55307.34542899999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55307348000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9842.743641,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9842749000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1916444944,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1916444944 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 215365549,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 215365549 ns\nthreads: 1"
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
          "id": "866582ed31a9b8e7a0beb342140f82bd5e176c6e",
          "message": "fix: no fast deployments when the boot node needs to restart. (#12557)",
          "timestamp": "2025-03-07T17:32:11+08:00",
          "tree_id": "731ddceeca6f36b2d45a32a298706877797bf6c9",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/866582ed31a9b8e7a0beb342140f82bd5e176c6e"
        },
        "date": 1741341926564,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18217.637163999825,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16026.116362 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18761.123975999908,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16507.813755 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3866.4008710002236,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3026.405039 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55889.599949999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55889599000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9438.540699000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9438544000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1906720690,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1906720690 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 212548312,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 212548312 ns\nthreads: 1"
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
            "email": "miranda@aztecprotocol.com",
            "name": "Miranda Wood",
            "username": "MirandaWood"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "1ead89921d0e8ad8c63e9d3a5d4a6a3deae15b58",
          "message": "fix: fix `assert_split_transformed_value_arrays` conditional access index underflow (#12540)\n\nCloses #10592\n\n## Bug\n\nWe previously commented out the array checks for private logs in tail to\npublic (https://github.com/AztecProtocol/aztec-packages/pull/10593/)\nbecause a constraint was mysteriously failing\n(https://github.com/AztecProtocol/aztec-packages/issues/10530).\n\nIt failed because of an attempted underflow array access e.g. `array[i -\n1]` where `i = 0`. The thing is that the array access shouldn't have\nbeen called because it was wrapped in an if statement.\n\nI don't think this has anything to do with logs, it just so happened\nthat logs were the first tx effect array to have `num_non_revertibles =\n0` in the above bot run.\n\n## Fix\n\nIn this case we had a private log with `.counter() = 8`, `split_counter\n= 3`, and `num_non_revertibles = 0`. However the constraint failure* was\ncoming from `sorted_array[num_non_revertibles - 1]` below:\n```rust\n if num_non_revertibles != 0 {\n        assert(\n            sorted_array[num_non_revertibles - 1].counter() < split_counter,\n            \"counter of last non-revertible item is not less than the split counter\",\n        );\n    }\n```\nI added a hacky fix which prevents the constraint failure by simply\nmultiplying the LHS by zero if the array access will fail:\n```rust\n   if num_non_revertibles != 0 {\n        let is_non_zero = (num_non_revertibles != 0) as u32;\n        assert(\n            sorted_array[num_non_revertibles - 1].counter()*is_non_zero < split_counter,\n            \"counter of last non-revertible item is not less than the split counter\",\n        );\n    }\n```\n\n*(If we had incorrectly entered the if statement and the assertion\nfailed, the error would be `Assertion failed`, but the error was\n`Constraint failure`).\n\n## Repro\n\nI included the `Prover.toml` which came from the above failure - it's\nvalid and should pass. To see the failure remove `is_non_zero` from the\nabove code (in `assert_split_transformed_value_arrays.nr`), then run:\n\n`nargo execute --package private_kernel_tail_to_public`\n\nAdd back the fix and run the same to see it passing.",
          "timestamp": "2025-03-07T09:36:11Z",
          "tree_id": "bea544a9a232b43b63247f53d671d47ec2679125",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1ead89921d0e8ad8c63e9d3a5d4a6a3deae15b58"
        },
        "date": 1741342307219,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18556.139680999877,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16423.819374000002 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18870.68400599992,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16462.685553 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3985.7101890002014,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3113.2222399999996 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55600.984955,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55600985000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9567.782203,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9567785000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1900633180,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1900633180 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 214415760,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 214415760 ns\nthreads: 1"
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
          "id": "b40b90472cf2d2f169bc0b1519a5cf944a73900a",
          "message": "fix: yarn-project e2e bench (#12547)",
          "timestamp": "2025-03-07T11:27:45Z",
          "tree_id": "0b351009c32f5c0557a6bbea983196fe222c054c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/b40b90472cf2d2f169bc0b1519a5cf944a73900a"
        },
        "date": 1741348901588,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18378.352922999966,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16185.911176000001 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18906.31502500014,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16457.073191 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3944.42244999982,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3096.2720700000004 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55410.996117,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55410996000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9631.229277999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9631232000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1936171804,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1936171804 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 224265647,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 224265647 ns\nthreads: 1"
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
          "id": "1407f6f42a8286b0b6202e8445cbe988780780a2",
          "message": "chore(master): release 0.78.0 (#12508)\n\n:robot: I have created a new Aztec Packages release\n---\n\n\n##\n[0.78.0](https://github.com/AztecProtocol/aztec-packages/compare/v0.77.1...v0.78.0)\n(2025-03-07)\n\n\n### ⚠ BREAKING CHANGES\n\n* convert `TraitMethodNotInScope` to error\n(https://github.com/noir-lang/noir/pull/7427)\n* bump bb version to v0.77.0\n(https://github.com/noir-lang/noir/pull/7599)\n* remove merkle module from stdlib\n(https://github.com/noir-lang/noir/pull/7582)\n* remove deprecated hash functions from stdlib\n(https://github.com/noir-lang/noir/pull/7477)\n* **frontend:** Restrict capturing mutable variable in lambdas\n(https://github.com/noir-lang/noir/pull/7488)\n* remove U128 struct from stdlib\n(https://github.com/noir-lang/noir/pull/7529)\n\n### Features\n\n* **barretenberg:** Graph methods for circuit analysis (part 2)\n([#12130](https://github.com/AztecProtocol/aztec-packages/issues/12130))\n([ec4c0c4](https://github.com/AztecProtocol/aztec-packages/commit/ec4c0c408f594a49283bcff1cbe9c931ccd439ac))\n* **cli:** Log and replay oracle transcript\n(https://github.com/noir-lang/noir/pull/7417)\n([f13b729](https://github.com/AztecProtocol/aztec-packages/commit/f13b729d9ddf74387a0adb5be8f15ce4a8ad6898))\n* Compare bincode to CBOR, FlexBuffers and Protobuf - implement best\n(https://github.com/noir-lang/noir/pull/7513)\n([8eb727c](https://github.com/AztecProtocol/aztec-packages/commit/8eb727cb416a0f5f3b787cb8b03129edbf5d3017))\n* **experimental:** Enable ownership syntax\n(https://github.com/noir-lang/noir/pull/7603)\n([1a3c112](https://github.com/AztecProtocol/aztec-packages/commit/1a3c11287ca66bf5189c1ecc58681de4a7af1844))\n* **experimental:** Issue errors for unreachable match branches\n(https://github.com/noir-lang/noir/pull/7556)\n([f13b729](https://github.com/AztecProtocol/aztec-packages/commit/f13b729d9ddf74387a0adb5be8f15ce4a8ad6898))\n* nullify just-added notes\n([#12552](https://github.com/AztecProtocol/aztec-packages/issues/12552))\n([dcba7a4](https://github.com/AztecProtocol/aztec-packages/commit/dcba7a49a4fefcbe6db4f28d7bb7e0986e31c30d))\n* perform constant sha256 compressions at compile-time\n(https://github.com/noir-lang/noir/pull/7566)\n([f13b729](https://github.com/AztecProtocol/aztec-packages/commit/f13b729d9ddf74387a0adb5be8f15ce4a8ad6898))\n* relate errors to macro built-ins errors\n(https://github.com/noir-lang/noir/pull/7609)\n([fbaa634](https://github.com/AztecProtocol/aztec-packages/commit/fbaa63443989f566b8b3b56a1c925e50fe456ecc))\n* simplify simple conditionals for brillig\n(https://github.com/noir-lang/noir/pull/7205)\n([f13b729](https://github.com/AztecProtocol/aztec-packages/commit/f13b729d9ddf74387a0adb5be8f15ce4a8ad6898))\n* Support `&lt;Type as Trait&gt;::method` in expressions\n(https://github.com/noir-lang/noir/pull/7551)\n([f13b729](https://github.com/AztecProtocol/aztec-packages/commit/f13b729d9ddf74387a0adb5be8f15ce4a8ad6898))\n* Sync from aztec-packages (https://github.com/noir-lang/noir/pull/7606)\n([8eb727c](https://github.com/AztecProtocol/aztec-packages/commit/8eb727cb416a0f5f3b787cb8b03129edbf5d3017))\n* teardown in call interface\n([#12499](https://github.com/AztecProtocol/aztec-packages/issues/12499))\n([062df02](https://github.com/AztecProtocol/aztec-packages/commit/062df0284a058e1afa8d1da5185fdae887cb1b8d))\n* translation evaluations with zk\n([#12222](https://github.com/AztecProtocol/aztec-packages/issues/12222))\n([568982d](https://github.com/AztecProtocol/aztec-packages/commit/568982ddb9d73319b05ed77c0b464506db90b2ed))\n\n\n### Bug Fixes\n\n* **avm:** use the correct number of rows in check_interaction\n([#12519](https://github.com/AztecProtocol/aztec-packages/issues/12519))\n([b1284ef](https://github.com/AztecProtocol/aztec-packages/commit/b1284ef4ca7c20b2320a92f91b0e33eedb3c95a2))\n* aztec-up\n([#12509](https://github.com/AztecProtocol/aztec-packages/issues/12509))\n([3ddb6de](https://github.com/AztecProtocol/aztec-packages/commit/3ddb6dea6dae5af612e2270e47fa23004f867162))\n* bbup\n([#12555](https://github.com/AztecProtocol/aztec-packages/issues/12555))\n([e7b5353](https://github.com/AztecProtocol/aztec-packages/commit/e7b5353eb49edaf02af8bba44173e874d43de9c8))\n* Bitwise lookup\n([#12471](https://github.com/AztecProtocol/aztec-packages/issues/12471))\n([a38f353](https://github.com/AztecProtocol/aztec-packages/commit/a38f353f03b0af1bd310edcb899a45fdad874520))\n* **ci:** remove regex - transfer explicitly\n([#12525](https://github.com/AztecProtocol/aztec-packages/issues/12525))\n([352bb1d](https://github.com/AztecProtocol/aztec-packages/commit/352bb1d76f14799e3a2430ce78e0e8558e55c6a9))\n* Cl/fix arm anvil\n([#12565](https://github.com/AztecProtocol/aztec-packages/issues/12565))\n([e4bfbd1](https://github.com/AztecProtocol/aztec-packages/commit/e4bfbd11374d5b5d1a61ac0750d3f42379d03b6d))\n* compare Quoted by expanding interned values\n(https://github.com/noir-lang/noir/pull/7602)\n([1a3c112](https://github.com/AztecProtocol/aztec-packages/commit/1a3c11287ca66bf5189c1ecc58681de4a7af1844))\n* Display causes but not stack trace in CLI error report\n(https://github.com/noir-lang/noir/pull/7584)\n([f13b729](https://github.com/AztecProtocol/aztec-packages/commit/f13b729d9ddf74387a0adb5be8f15ce4a8ad6898))\n* **experimental:** Fix execution of match expressions with multiple\nbranches (https://github.com/noir-lang/noir/pull/7570)\n([1a3c112](https://github.com/AztecProtocol/aztec-packages/commit/1a3c11287ca66bf5189c1ecc58681de4a7af1844))\n* fix a few cases where safety comment wasn't correctly identified\n(https://github.com/noir-lang/noir/pull/7548)\n([f13b729](https://github.com/AztecProtocol/aztec-packages/commit/f13b729d9ddf74387a0adb5be8f15ce4a8ad6898))\n* fix bbup and add CI\n([#12541](https://github.com/AztecProtocol/aztec-packages/issues/12541))\n([1b2604c](https://github.com/AztecProtocol/aztec-packages/commit/1b2604c8e55d06ceacac85913cac46462e9357d6))\n* Fix the config\n([#12513](https://github.com/AztecProtocol/aztec-packages/issues/12513))\n([fb9fac6](https://github.com/AztecProtocol/aztec-packages/commit/fb9fac6f1c5b77f276a8f0ec2a2683e90fd56ac9))\n* **frontend:** Restrict capturing mutable variable in lambdas\n(https://github.com/noir-lang/noir/pull/7488)\n([f13b729](https://github.com/AztecProtocol/aztec-packages/commit/f13b729d9ddf74387a0adb5be8f15ce4a8ad6898))\n* FunctionDefinition::as_typed_expr didn't work well for trait imp…\n(https://github.com/noir-lang/noir/pull/7611)\n([1a3c112](https://github.com/AztecProtocol/aztec-packages/commit/1a3c11287ca66bf5189c1ecc58681de4a7af1844))\n* Log to `stderr` (https://github.com/noir-lang/noir/pull/7585)\n([f13b729](https://github.com/AztecProtocol/aztec-packages/commit/f13b729d9ddf74387a0adb5be8f15ce4a8ad6898))\n* **LSP:** references/rename only when underlying span has the correct…\n(https://github.com/noir-lang/noir/pull/7598)\n([8eb727c](https://github.com/AztecProtocol/aztec-packages/commit/8eb727cb416a0f5f3b787cb8b03129edbf5d3017))\n* make vk metadata actual witnesses\n([#12459](https://github.com/AztecProtocol/aztec-packages/issues/12459))\n([dada06f](https://github.com/AztecProtocol/aztec-packages/commit/dada06f323795da751d0617249b86146cad46378))\n* no fast deployments when the boot node needs to restart.\n([#12557](https://github.com/AztecProtocol/aztec-packages/issues/12557))\n([866582e](https://github.com/AztecProtocol/aztec-packages/commit/866582ed31a9b8e7a0beb342140f82bd5e176c6e))\n* **node:** drop log level of handler not registered\n([#12523](https://github.com/AztecProtocol/aztec-packages/issues/12523))\n([cb7e42d](https://github.com/AztecProtocol/aztec-packages/commit/cb7e42d90f900c679a3da4342de9789143637b97))\n* override bb path in cli-wallet PXE config\n([#12511](https://github.com/AztecProtocol/aztec-packages/issues/12511))\n([0c3024e](https://github.com/AztecProtocol/aztec-packages/commit/0c3024e7b0f9475624e9652adce2f64a88b7f923))\n* publish-bb-mac.yml version replace\n([#12554](https://github.com/AztecProtocol/aztec-packages/issues/12554))\n([7e89dfb](https://github.com/AztecProtocol/aztec-packages/commit/7e89dfbc6b70bb9a8e226654e391a356f948f7a0))\n* release bb-mac\n([fac5fb5](https://github.com/AztecProtocol/aztec-packages/commit/fac5fb52feefe9a8c2a6faa51bf7108f22d6e6ae))\n* Revert \"make vk metadata actual witnesses\"\n([#12534](https://github.com/AztecProtocol/aztec-packages/issues/12534))\n([ed46a3c](https://github.com/AztecProtocol/aztec-packages/commit/ed46a3c69fd4270ab57d6afaaad868696a9c29a2))\n* shift right overflow in ACIR with unknown var now returns zero\n(https://github.com/noir-lang/noir/pull/7509)\n([f13b729](https://github.com/AztecProtocol/aztec-packages/commit/f13b729d9ddf74387a0adb5be8f15ce4a8ad6898))\n* TokensPrettyPrinter was missing some spaces between tokens\n(https://github.com/noir-lang/noir/pull/7607)\n([1a3c112](https://github.com/AztecProtocol/aztec-packages/commit/1a3c11287ca66bf5189c1ecc58681de4a7af1844))\n* yarn-project e2e bench\n([#12547](https://github.com/AztecProtocol/aztec-packages/issues/12547))\n([b40b904](https://github.com/AztecProtocol/aztec-packages/commit/b40b90472cf2d2f169bc0b1519a5cf944a73900a))\n\n\n### Miscellaneous\n\n* add some extra tests (https://github.com/noir-lang/noir/pull/7544)\n([f13b729](https://github.com/AztecProtocol/aztec-packages/commit/f13b729d9ddf74387a0adb5be8f15ce4a8ad6898))\n* add underscore parameter documentation\n(https://github.com/noir-lang/noir/pull/7562)\n([1a3c112](https://github.com/AztecProtocol/aztec-packages/commit/1a3c11287ca66bf5189c1ecc58681de4a7af1844))\n* add yaml aliases in .test_patterns.yml\n([#12516](https://github.com/AztecProtocol/aztec-packages/issues/12516))\n([3ee8d51](https://github.com/AztecProtocol/aztec-packages/commit/3ee8d517840ea91b2a998cbbb9207e26913a05e4))\n* address some frontend tests TODOs\n(https://github.com/noir-lang/noir/pull/7554)\n([f13b729](https://github.com/AztecProtocol/aztec-packages/commit/f13b729d9ddf74387a0adb5be8f15ce4a8ad6898))\n* addressing remaining feedback in PR 12182\n([#12494](https://github.com/AztecProtocol/aztec-packages/issues/12494))\n([f733879](https://github.com/AztecProtocol/aztec-packages/commit/f733879bd5e59a222cc288de6c298eaa8553312c)),\ncloses\n[#12193](https://github.com/AztecProtocol/aztec-packages/issues/12193)\n* bump `light-poseidon` (https://github.com/noir-lang/noir/pull/7568)\n([f13b729](https://github.com/AztecProtocol/aztec-packages/commit/f13b729d9ddf74387a0adb5be8f15ce4a8ad6898))\n* bump bb version to v0.77.0\n(https://github.com/noir-lang/noir/pull/7599)\n([f13b729](https://github.com/AztecProtocol/aztec-packages/commit/f13b729d9ddf74387a0adb5be8f15ce4a8ad6898))\n* bump external pinned commits\n(https://github.com/noir-lang/noir/pull/7561)\n([f13b729](https://github.com/AztecProtocol/aztec-packages/commit/f13b729d9ddf74387a0adb5be8f15ce4a8ad6898))\n* bump external pinned commits\n(https://github.com/noir-lang/noir/pull/7565)\n([f13b729](https://github.com/AztecProtocol/aztec-packages/commit/f13b729d9ddf74387a0adb5be8f15ce4a8ad6898))\n* bump external pinned commits\n(https://github.com/noir-lang/noir/pull/7581)\n([f13b729](https://github.com/AztecProtocol/aztec-packages/commit/f13b729d9ddf74387a0adb5be8f15ce4a8ad6898))\n* bump external pinned commits\n(https://github.com/noir-lang/noir/pull/7601)\n([f13b729](https://github.com/AztecProtocol/aztec-packages/commit/f13b729d9ddf74387a0adb5be8f15ce4a8ad6898))\n* bump external pinned commits\n(https://github.com/noir-lang/noir/pull/7618)\n([fbaa634](https://github.com/AztecProtocol/aztec-packages/commit/fbaa63443989f566b8b3b56a1c925e50fe456ecc))\n* bump ring to address advisory\n(https://github.com/noir-lang/noir/pull/7619)\n([fbaa634](https://github.com/AztecProtocol/aztec-packages/commit/fbaa63443989f566b8b3b56a1c925e50fe456ecc))\n* Cleaner PXE\n([#12515](https://github.com/AztecProtocol/aztec-packages/issues/12515))\n([a69f416](https://github.com/AztecProtocol/aztec-packages/commit/a69f41609f7ff49204807b58d3889ba3968a4ea8))\n* cleanup committing and masking utility\n([#12514](https://github.com/AztecProtocol/aztec-packages/issues/12514))\n([9f57048](https://github.com/AztecProtocol/aztec-packages/commit/9f57048a90ceb402df128d1033c81ab6f0eb1a51))\n* **cli:** exclude kind smoke test from flake list\n([#12518](https://github.com/AztecProtocol/aztec-packages/issues/12518))\n([778bfa6](https://github.com/AztecProtocol/aztec-packages/commit/778bfa65d6dc6192c1e79ba0fb371a22dc1b652a))\n* **cli:** Forward `nargo execute` to `noir_artifact_cli`\n(https://github.com/noir-lang/noir/pull/7406)\n([f13b729](https://github.com/AztecProtocol/aztec-packages/commit/f13b729d9ddf74387a0adb5be8f15ce4a8ad6898))\n* convert `TraitMethodNotInScope` to error\n(https://github.com/noir-lang/noir/pull/7427)\n([fbaa634](https://github.com/AztecProtocol/aztec-packages/commit/fbaa63443989f566b8b3b56a1c925e50fe456ecc))\n* explode aliases when looking up owners in `.test_patterns.yml`\n([#12526](https://github.com/AztecProtocol/aztec-packages/issues/12526))\n([2e0d791](https://github.com/AztecProtocol/aztec-packages/commit/2e0d791d7dcb0a8072d3089a216b1dddd20c4732))\n* fix trait import issues\n([#12500](https://github.com/AztecProtocol/aztec-packages/issues/12500))\n([fd9f145](https://github.com/AztecProtocol/aztec-packages/commit/fd9f1458557f2d67bcf2d58ba4194e000f58600c))\n* Fix yarn install immutable issues\n([#12539](https://github.com/AztecProtocol/aztec-packages/issues/12539))\n([fb9ada3](https://github.com/AztecProtocol/aztec-packages/commit/fb9ada38d49d5cdedf5a9f358ce8b8e56bf5170c)),\ncloses\n[#12538](https://github.com/AztecProtocol/aztec-packages/issues/12538)\n* More config defaults and forward p2p ports\n([#12529](https://github.com/AztecProtocol/aztec-packages/issues/12529))\n([2c45fb9](https://github.com/AztecProtocol/aztec-packages/commit/2c45fb9a66d4bfba476e8ca3c29207a311b35f1a))\n* **node:** return correct node version\n([#12520](https://github.com/AztecProtocol/aztec-packages/issues/12520))\n([5502901](https://github.com/AztecProtocol/aztec-packages/commit/5502901f8780cbbab97f95952d8192c3585b2a5f))\n* **profiler:** Add option to only get the total sample count for the\n`execution-opcodes` command\n(https://github.com/noir-lang/noir/pull/7578)\n([f13b729](https://github.com/AztecProtocol/aztec-packages/commit/f13b729d9ddf74387a0adb5be8f15ce4a8ad6898))\n* put RcTracker as part of the DIE context\n(https://github.com/noir-lang/noir/pull/7309)\n([f13b729](https://github.com/AztecProtocol/aztec-packages/commit/f13b729d9ddf74387a0adb5be8f15ce4a8ad6898))\n* remove deprecated hash functions from stdlib\n(https://github.com/noir-lang/noir/pull/7477)\n([f13b729](https://github.com/AztecProtocol/aztec-packages/commit/f13b729d9ddf74387a0adb5be8f15ce4a8ad6898))\n* remove FileDiagnostic (https://github.com/noir-lang/noir/pull/7546)\n([f13b729](https://github.com/AztecProtocol/aztec-packages/commit/f13b729d9ddf74387a0adb5be8f15ce4a8ad6898))\n* remove merkle module from stdlib\n(https://github.com/noir-lang/noir/pull/7582)\n([f13b729](https://github.com/AztecProtocol/aztec-packages/commit/f13b729d9ddf74387a0adb5be8f15ce4a8ad6898))\n* Remove scope interpolation from env vars\n([#12522](https://github.com/AztecProtocol/aztec-packages/issues/12522))\n([70942e9](https://github.com/AztecProtocol/aztec-packages/commit/70942e9dc66159774dab9aef606b819ab7b7ccc3))\n* remove U128 struct from stdlib\n(https://github.com/noir-lang/noir/pull/7529)\n([f13b729](https://github.com/AztecProtocol/aztec-packages/commit/f13b729d9ddf74387a0adb5be8f15ce4a8ad6898))\n* replace relative paths to noir-protocol-circuits\n([f20c0dd](https://github.com/AztecProtocol/aztec-packages/commit/f20c0dd315ffcd58af76fe9f6f8a61ee8480296b))\n* replace relative paths to noir-protocol-circuits\n([4365064](https://github.com/AztecProtocol/aztec-packages/commit/43650640f69ad00305299b027578c7f7810b8056))\n* restore bb --version\n([#12542](https://github.com/AztecProtocol/aztec-packages/issues/12542))\n([ab13d43](https://github.com/AztecProtocol/aztec-packages/commit/ab13d43264d3ae542a386ecfef4cf288d311e8b4))\n* restore method syntax on `get_storage_slot` calls\n([#12532](https://github.com/AztecProtocol/aztec-packages/issues/12532))\n([8e9f594](https://github.com/AztecProtocol/aztec-packages/commit/8e9f5944ff30440e1b0411e8c2e1ee5b4e4ca264))\n* rm unused methods\n([#12544](https://github.com/AztecProtocol/aztec-packages/issues/12544))\n([ed1dbdc](https://github.com/AztecProtocol/aztec-packages/commit/ed1dbdc57861a9b346deea2f208f97cd01c0758f))\n* some SSA improvements (https://github.com/noir-lang/noir/pull/7588)\n([f13b729](https://github.com/AztecProtocol/aztec-packages/commit/f13b729d9ddf74387a0adb5be8f15ce4a8ad6898))\n* **spartan:** kind test speedup\n([#12478](https://github.com/AztecProtocol/aztec-packages/issues/12478))\n([8ede7b1](https://github.com/AztecProtocol/aztec-packages/commit/8ede7b12b4d5ad6d5053e41c266ee84595b04f1a))\n* **ssa:** Turn the Brillig constraints check back on by default\n(https://github.com/noir-lang/noir/pull/7404)\n([f13b729](https://github.com/AztecProtocol/aztec-packages/commit/f13b729d9ddf74387a0adb5be8f15ce4a8ad6898))\n* track more critical libraries\n(https://github.com/noir-lang/noir/pull/7604)\n([f13b729](https://github.com/AztecProtocol/aztec-packages/commit/f13b729d9ddf74387a0adb5be8f15ce4a8ad6898))\n* update and lock AVM's lockfile\n([#12533](https://github.com/AztecProtocol/aztec-packages/issues/12533))\n([2babc50](https://github.com/AztecProtocol/aztec-packages/commit/2babc5084a3383b798c65119b5ba820f8ab30010))\n\n---\nThis PR was generated with [Release\nPlease](https://github.com/googleapis/release-please). See\n[documentation](https://github.com/googleapis/release-please#release-please).",
          "timestamp": "2025-03-07T12:18:59Z",
          "tree_id": "7be3d14f840df4d6c8ae1de8fbaa7dc54030ae37",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1407f6f42a8286b0b6202e8445cbe988780780a2"
        },
        "date": 1741350692393,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18206.642181999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16111.482251000001 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18652.306229999907,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16242.117391000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3900.1312880000114,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3045.3650490000005 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54989.830527,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54989828000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9691.807384,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9691813000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1901522033,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1901522033 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 213393607,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 213393607 ns\nthreads: 1"
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
          "id": "58cbafe823630678e2cf3998fc4e135bcaefac73",
          "message": "feat: Get blobs from blob archive if not found in blob sink (#12498)\n\nBlob sink now falls back to a blob archive source to fetch a requested\nblob if not in local storage. Blobs are deserialized before storing, so\nwe validate that they correspond to an Aztec tx (though they may not be\nfrom the same L2 chain being served by the blob sink, but I think that's\nacceptable).\n\nFor now we rely on blobscan API for fetching these archives. The\nfallback can be set manually via a `BLOB_SINK_ARCHIVE_API_URL` env var,\nand is set automatically if L1 chain id is mainnet or sepolia.\n\nNote that blobscan sepolia has stopped syncing since the Pectra upgrade\nyesterday, but hopefully they'll be back up soon.",
          "timestamp": "2025-03-07T12:30:59Z",
          "tree_id": "09bb1026c393b6e0f1bc363f1f49af2b93f53df9",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/58cbafe823630678e2cf3998fc4e135bcaefac73"
        },
        "date": 1741352774373,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18440.582222000103,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16337.966802 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18803.20985499998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16320.414021 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3910.54919599992,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3136.1773 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55195.127003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55195127000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9841.223808,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9841227000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1898524318,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1898524318 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 213490389,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 213490389 ns\nthreads: 1"
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
          "id": "910f21df296719b60e1567483bd4597c720e5d58",
          "message": "feat: Generic handling of public inputs components (#12357)\n\nIntroduces the notion of a `PublicInputComponent` which wraps objects\nconforming to a new concept `IsSerializableToAndFromPublicInputs` with\nthe goal of standardizing the handling of objects\nstored/propagated/reconstructed via the public inputs, e.g. commitments,\npairing inputs etc. This sets the precedent that types should own their\nown methods for this public inputs serialization logic rather than\nrelying on free floating methods (as is currently the case in a few\nplaces).\n\nAs a proof of concept I've utilized this new mechanism to simplify the\nimplementation of the `DataBusDepot` which has two main functions:\nsetting databus return_data commitments to public (in order to propagate\nthem to the next layer), and reconstructing those commitments from the\npublic inputs in order to perform commitment consistency checks. All of\nthe setting and reconstructing logic previously residing in this class\nhas been replaced with implementations directly in goblin_element (the\ngoblin analog to biggroup) and its sub components (goblin field and\nbigfield).\n\nNote: By convention we represent the coordinates of a goblin_element\n(goblin fields) using 4 limbs for consistency with bigfield, even though\ngoblin fields are implemented using 2 limbs. This would be easy to\nchange in the future if needed but doesn't seem terribly important.",
          "timestamp": "2025-03-07T07:44:59-07:00",
          "tree_id": "6163249eda35efd091aab89333aeeeec42c8fe2e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/910f21df296719b60e1567483bd4597c720e5d58"
        },
        "date": 1741361148152,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18414.57230800006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16160.918136 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18793.188397999984,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16271.016047000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3930.1161799999136,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3123.7230489999997 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55426.187755,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55426188000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9877.586586,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9877589000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1902274429,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1902274429 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 221063771,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 221063771 ns\nthreads: 1"
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
          "id": "d4ee87129c4a6eae16574c07063963bbca63162f",
          "message": "fix: release fix (#12572)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\nline.",
          "timestamp": "2025-03-07T14:48:21Z",
          "tree_id": "3ab57365f464d9f0966335e85a5c44fe56e6fd99",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d4ee87129c4a6eae16574c07063963bbca63162f"
        },
        "date": 1741362201542,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18378.21616400015,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16183.32882 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18811.711706000096,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16675.693666999996 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3877.9728219997196,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3100.901182 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55526.754161,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55526754000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10391.54102,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10391543000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1903341338,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1903341338 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 214000798,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 214000798 ns\nthreads: 1"
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
          "id": "94ddf80625747d2b3acf9b4d3d1c424ced5a24bd",
          "message": "chore(master): release 0.78.1 (#12569)\n\n:robot: I have created a new Aztec Packages release\n---\n\n\n##\n[0.78.1](https://github.com/AztecProtocol/aztec-packages/compare/v0.78.0...v0.78.1)\n(2025-03-07)\n\n\n### Features\n\n* Generic handling of public inputs components\n([#12357](https://github.com/AztecProtocol/aztec-packages/issues/12357))\n([910f21d](https://github.com/AztecProtocol/aztec-packages/commit/910f21df296719b60e1567483bd4597c720e5d58))\n* Get blobs from blob archive if not found in blob sink\n([#12498](https://github.com/AztecProtocol/aztec-packages/issues/12498))\n([58cbafe](https://github.com/AztecProtocol/aztec-packages/commit/58cbafe823630678e2cf3998fc4e135bcaefac73))\n* remove acir hash\n([#12564](https://github.com/AztecProtocol/aztec-packages/issues/12564))\n([bdc9c2b](https://github.com/AztecProtocol/aztec-packages/commit/bdc9c2b8635ea77a2f8ffb7d805f469982cc3bf7))\n\n\n### Bug Fixes\n\n* release fix\n([#12572](https://github.com/AztecProtocol/aztec-packages/issues/12572))\n([d4ee871](https://github.com/AztecProtocol/aztec-packages/commit/d4ee87129c4a6eae16574c07063963bbca63162f))\n\n---\nThis PR was generated with [Release\nPlease](https://github.com/googleapis/release-please). See\n[documentation](https://github.com/googleapis/release-please#release-please).",
          "timestamp": "2025-03-07T15:24:39Z",
          "tree_id": "9e91cb8dae9d0b7aca68c3c71b5fb2fc7df44b91",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/94ddf80625747d2b3acf9b4d3d1c424ced5a24bd"
        },
        "date": 1741362627695,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18063.59653300001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15824.061342 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18641.622197999935,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16149.274753 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3835.785180000016,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3004.4415940000004 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54737.929753000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54737928000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10080.448690000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10080451000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1883147146,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1883147146 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 218905166,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 218905166 ns\nthreads: 1"
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
          "id": "80a5df2e4ddd33a1c970207f119c984d44d8e191",
          "message": "fix: metrics update (#12571)",
          "timestamp": "2025-03-07T15:48:47Z",
          "tree_id": "299d48a7bde52ca54d46496d3271ef976cab5139",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/80a5df2e4ddd33a1c970207f119c984d44d8e191"
        },
        "date": 1741364407176,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18235.618448999958,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16103.261255 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18791.326002000005,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16418.082014 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3951.583305000213,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3100.8371859999997 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55338.596018,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55338594000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10982.380052,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10982413000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1932709476,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1932709476 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 227074093,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 227074093 ns\nthreads: 1"
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
          "id": "2ea17670b5e7f7cc047a49313bd99032e39323de",
          "message": "feat: provision alerts (#12561)\n\nThis PR updates the in-repo dashboards to the latest version and adds\nalerting rules.\n\nA new secret is added to Gcloud to hold the webhook URL for a Slack\nchannel where we want alerts to fire to.\n\nOne thing that needs to kept in mind if editing the rules is that\nGrafana templates need to be escaped otherwise Helm will try to execute\nthem and fail (use `` {{ ` escaped content {{ $some_grafan_var }} `\n}}``)",
          "timestamp": "2025-03-07T16:24:19Z",
          "tree_id": "c94929d606de5a6eae7ded6674f2fdeb57ad1ad3",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/2ea17670b5e7f7cc047a49313bd99032e39323de"
        },
        "date": 1741366681855,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18210.882255999877,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16011.872736000001 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18796.94469800006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16403.648056 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3912.077887999885,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3111.3191199999997 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55447.94522,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55447946000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9797.035358,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9797037000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1890045844,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1890045844 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 214041745,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 214041745 ns\nthreads: 1"
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
          "id": "283b624d909574ca8cf872448e61dbd748bb94d6",
          "message": "fix: Log overflow handling in reset (#12579)\n\nResolves https://github.com/AztecProtocol/aztec-packages/issues/12295\nWe were handling overflow in note hashes and nullifiers, but not in\nlogs. I have updated the reset handling code to also trigger cleaning up\nnote hashes because that can clean up logs and avoid the overflow",
          "timestamp": "2025-03-07T18:21:26+01:00",
          "tree_id": "a80b6d3f9f5a21d7b8a1626a73cb07b5ec69637f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/283b624d909574ca8cf872448e61dbd748bb94d6"
        },
        "date": 1741369476555,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18261.95046299995,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15960.816711 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18596.165851000023,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16185.222540000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3880.179152999972,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 2996.757742999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55118.078538999995,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55118077000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11917.268122000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11917271000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1890538705,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1890538705 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 215072860,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 215072860 ns\nthreads: 1"
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
          "id": "753cb336cc6503a21eed1ed4e3220d5656be8b96",
          "message": "fix(spartan): setup needs kubectl (#12580)\n\n## Overview\n\n\nmess up in speedup, kubectl is not in the aztec image, otel requires it\nto have the correct version",
          "timestamp": "2025-03-07T17:16:11Z",
          "tree_id": "a20ef621ba9fef8629f6e4db2c5a4a281e90ec42",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/753cb336cc6503a21eed1ed4e3220d5656be8b96"
        },
        "date": 1741369603210,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18196.35012899994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16004.646448 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18702.14399800011,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16231.662127 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3862.365610999859,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3076.413713 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55423.268250999994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55423267000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10804.858243000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10804860000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1899925480,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1899925480 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 215505856,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 215505856 ns\nthreads: 1"
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
          "id": "b4891c14a2e49a8e475c6839840561a074c511cc",
          "message": "feat(p2p): peer manager peer count metrics (#12575)",
          "timestamp": "2025-03-07T17:59:55Z",
          "tree_id": "2dcc6a19b32cee42a8ccc681154cf283074791d7",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/b4891c14a2e49a8e475c6839840561a074c511cc"
        },
        "date": 1741372551619,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18293.44404199992,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16198.692377000001 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18906.065317999946,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16485.478682 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3920.5074030001015,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3134.462611 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55658.072005999995,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55658072000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10188.03485,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10188036000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1910179552,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1910179552 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 213821318,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 213821318 ns\nthreads: 1"
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
          "id": "c89f89c7b8db2ebbcaa1a2cf77e5b105e507d5e2",
          "message": "chore: reactivate acir_test for `regression_5045` (#12548)\n\nThe linked issue has been closed so I'm reactivating this test",
          "timestamp": "2025-03-07T18:09:58Z",
          "tree_id": "c3897cb4d97ddde4787c21aec86e52b369117b8d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c89f89c7b8db2ebbcaa1a2cf77e5b105e507d5e2"
        },
        "date": 1741372961606,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18126.085040999897,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16067.328426 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18711.074745999897,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16322.650054 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3867.3753129999113,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3132.5782470000004 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54851.159754,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54851161000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10795.594678999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10795597000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1908828799,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1908828799 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 217023147,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 217023147 ns\nthreads: 1"
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
          "id": "aacb91a49a7099c93b5953c210c151fe70dad433",
          "message": "chore: turn on masking in eccvm (#12467)\n\n* All ECCVM wires are masked now. \n* Redefined `lagrange_last` in ECCVM to keep it sound. \n* Used `commit_structured` with active ranges to commit to randomized\nwires, as they have a huge 0 region from `real_size` to `circuit_size -\nMASKING_OFFSET`.\n\nIt closes the **translation evaluations** arc: \n* Goblin: `verify_translation` passes when ECCVM wires are masked thanks\nto `ECCVMVerifier` propagating the `translation_masking_term_eval` to\n`TranslatorVerifier`\n\nCloses https://github.com/AztecProtocol/barretenberg/issues/1238",
          "timestamp": "2025-03-07T19:26:53+01:00",
          "tree_id": "e78ffe3cf20a746e2fd2fb96c0342010daf98c2b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/aacb91a49a7099c93b5953c210c151fe70dad433"
        },
        "date": 1741374389067,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18321.74213799999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16211.802812000002 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 19021.914125999956,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16488.884207 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3954.5373650003057,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3142.4520840000005 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55712.91697399999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55712914000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10475.729677000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10475736000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1600050735,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1600050735 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 217583539,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 217583539 ns\nthreads: 1"
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
          "id": "24f04c7092e2adaf2c4e701b42534d045dd9b62f",
          "message": "chore(sandbox): drop cheat-codes log level (#12586)",
          "timestamp": "2025-03-07T20:21:35Z",
          "tree_id": "f4fe42689a5ebf9d2363605ae49c15b8c2f33949",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/24f04c7092e2adaf2c4e701b42534d045dd9b62f"
        },
        "date": 1741381830083,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18534.957013000167,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16282.851213 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 19002.730855999744,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16532.302484000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3910.4426190001504,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3068.5956389999997 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55502.156512,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55502156000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9862.270463,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9862272000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1616468789,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1616468789 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 214378676,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 214378676 ns\nthreads: 1"
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
          "id": "db8ebc64b28cf038afef2fe220c3c26fa21c9ac5",
          "message": "fix(sandbox): query release please manifest for version if in a docker container (#12591)\n\n## Overview\n\nFixes sandbox cli versioning issue",
          "timestamp": "2025-03-08T00:54:15Z",
          "tree_id": "081c3eef5cd98f00ffe0aa9af52522c9adc13256",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/db8ebc64b28cf038afef2fe220c3c26fa21c9ac5"
        },
        "date": 1741397102598,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18383.817019999922,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15997.982788000001 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18801.794479000135,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16321.073056000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3881.7451509999046,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3094.270535 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55601.51113,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55601511000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9584.308328,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9584312000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1628088063,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1628088063 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 216749691,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 216749691 ns\nthreads: 1"
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
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "fc597f4a6462902a345e6e879bf809634c0b83ed",
          "message": "fix: Cl/release fixes 2 (#12595)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\nline.",
          "timestamp": "2025-03-08T08:53:31Z",
          "tree_id": "299f9eff7dd5689cd209adde03b29f347ebd8732",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/fc597f4a6462902a345e6e879bf809634c0b83ed"
        },
        "date": 1741426110349,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18644.787049999875,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16446.13983 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18912.583480999958,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16475.836974 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3998.780221000061,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3070.2482889999997 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55242.998212,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55242999000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9782.445214,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9782452000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1627558617,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1627558617 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 229658662,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 229658662 ns\nthreads: 1"
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