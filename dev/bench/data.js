window.BENCHMARK_DATA = {
  "lastUpdate": 1733442141224,
  "repoUrl": "https://github.com/AztecProtocol/aztec-packages",
  "entries": {
    "C++ Benchmark": [
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
          "id": "cc4139a83347b9a726b03bd167bf7e70e6dadda7",
          "message": "chore: Delete stray todos (#10112)\n\nA few `WORKTODO`s were lingering in the code. This is a tag\r\n@ledwards2225 and I use to mark todos that we intend to delete before a\r\nparticular PR merges. Sometimes they get missed.",
          "timestamp": "2024-11-21T13:55:48-05:00",
          "tree_id": "260c50b41d6cfcc43150ad43bd7ef21557b93cf8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/cc4139a83347b9a726b03bd167bf7e70e6dadda7"
        },
        "date": 1732217151017,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28152.36954300002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 26239.051099 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5088.158947000011,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4760.867148 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 84145.571559,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 84145572000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15240.000718,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15240001000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3103457078,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3103457078 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 141167843,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 141167843 ns\nthreads: 1"
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
          "id": "62a6b662f1ef20a603177c55c199de4a79b65b5c",
          "message": "fix: strip wasm debug (#9987)\n\nEnsures wasms are stripped of debug info to reduce size.\r\nGzips them for inlining into the webpack bundle.\r\nBundle is now 6.8MB.",
          "timestamp": "2024-11-22T17:48:45+08:00",
          "tree_id": "42189f3824118e28783bea95323e1acaa75228c2",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/62a6b662f1ef20a603177c55c199de4a79b65b5c"
        },
        "date": 1732271046921,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 27345.619646000003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 25109.661844000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4574.616918000003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4272.097384999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 86175.28333199999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 86175285000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 16347.593065000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16347595000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3022765538,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3022765538 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 132029384,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 132029384 ns\nthreads: 1"
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
          "id": "bbac3d9db1a4cd133c4949c3c25a17a7e39d14a2",
          "message": "fix: Zero index is not always 0  (#10135)\n\nThis pr changes the export method of circuit builders, adding the name\r\n\"zero\" to an appropriate index, which is not always 0.",
          "timestamp": "2024-11-22T14:45:03+03:00",
          "tree_id": "ffef1e4b364a354df2c221473f26c400854ea76f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/bbac3d9db1a4cd133c4949c3c25a17a7e39d14a2"
        },
        "date": 1732280441868,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28123.061358000003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 26365.310018000004 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5023.482313000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4710.622699 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 83940.157753,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 83940158000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15077.373758,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15077375000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3087193005,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3087193005 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 151546125,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 151546125 ns\nthreads: 1"
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
          "id": "c6fdf4bda5c9ef32ca355cda9a5a0c7ed3d1a100",
          "message": "chore(avm): Remove initialization for non-derived polynomials (#10103)\n\nResolves #10096",
          "timestamp": "2024-11-22T15:39:35+01:00",
          "tree_id": "762d362e4b62b12a666505405c126038ef765036",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c6fdf4bda5c9ef32ca355cda9a5a0c7ed3d1a100"
        },
        "date": 1732288662052,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28119.940130000003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 26481.743194 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5020.442826999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4699.382423 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 83835.424783,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 83835424000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15114.793732999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15114794000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3093006529,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3093006529 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 141433643,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 141433643 ns\nthreads: 1"
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
          "id": "ceaeda50d2fd391edda3ee8186b86558b7f092e2",
          "message": "feat(avm): error handling for address resolution (#9994)\n\nResolves #9131",
          "timestamp": "2024-11-22T16:57:02Z",
          "tree_id": "dfd466c092ae6e04c5645da3ac3b5868e417878b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ceaeda50d2fd391edda3ee8186b86558b7f092e2"
        },
        "date": 1732296660880,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28060.623609999995,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 26055.627086 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5004.604775999994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4682.06413 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 83908.31017499999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 83908311000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15134.423071,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15134424000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3092585193,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3092585193 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 142228431,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 142228431 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "name": "just-mitch",
            "username": "just-mitch",
            "email": "68168980+just-mitch@users.noreply.github.com"
          },
          "committer": {
            "name": "GitHub",
            "username": "web-flow",
            "email": "noreply@github.com"
          },
          "id": "dc528dadcf1c68643eb77c3ea4280161dd9ac225",
          "message": "feat: terraform for release deployments (#10091)\n\nsimply run `spartan/terraform/deploy-release/deploy.sh`. Gives a public\r\nnetwork with 3 validators in GCP with proving on.\r\n\r\nFix #10144",
          "timestamp": "2024-11-22T20:35:43Z",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/dc528dadcf1c68643eb77c3ea4280161dd9ac225"
        },
        "date": 1732308198256,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28125.476421000003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 26280.730135 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5014.583509999994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4613.58141 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 84166.82906,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 84166829000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15226.159180999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15226159000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3099154540,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3099154540 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 142222198,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 142222198 ns\nthreads: 1"
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
          "id": "ece1d455548bccd80a3c9660cc32149bcb129562",
          "message": "chore: Remove handling of duplicates from the note hash tree (#10016)\n\nThis PR removes the abilitity to handle duplicates in the note hash\r\ntree. Since #9492, all trees now contain unique leaves only. Removing\r\nthe handling of duplicates reduces the complexity and storage\r\nrequirements of the trees.\r\n\r\n---------\r\n\r\nCo-authored-by: ludamad <adam.domurad@gmail.com>",
          "timestamp": "2024-11-25T11:47:43Z",
          "tree_id": "eb18c3379316afbf90dbf81511da6d4f5457ec95",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ece1d455548bccd80a3c9660cc32149bcb129562"
        },
        "date": 1732537277660,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 27502.335485000003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 25662.363468 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4591.292156999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4280.504266 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 87605.323446,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 87605323000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 16486.247683999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16486249000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3038854989,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3038854989 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 132815854,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 132815854 ns\nthreads: 1"
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
          "id": "c6ab0c9c7a270104fb3e9f6160be50a90ce5e77d",
          "message": "feat: Improved data storage metrics (#10020)\n\nThis PR increases the level of telemetry around all of the node's data\r\nstores. For every LMDB instance it reports the size of the specified\r\nmapping, the actual DB size and the number of items. Additionally, for\r\nthe world state we report the number of leaves for every tree along with\r\nthe pending and proven chain heights.\r\n\r\n---------\r\n\r\nCo-authored-by: ludamad <adam.domurad@gmail.com>",
          "timestamp": "2024-11-25T13:25:16Z",
          "tree_id": "7a592c669bad829556b9ef45ad143aea6b42f156",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c6ab0c9c7a270104fb3e9f6160be50a90ce5e77d"
        },
        "date": 1732542524763,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 27789.318643000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 25821.050672 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4634.288642999991,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4347.551165999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 88953.114798,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 88953115000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 16574.012262000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16574012000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3067835983,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3067835983 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 134914012,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 134914012 ns\nthreads: 1"
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
          "id": "b15979f304ef37a048e750f3316bc8dff7757b25",
          "message": "chore(master): Release 0.64.0",
          "timestamp": "2024-11-25T14:32:21Z",
          "url": "https://github.com/AztecProtocol/aztec-packages/pull/10043/commits/b15979f304ef37a048e750f3316bc8dff7757b25"
        },
        "date": 1732548531065,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 27648.94204500001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 25616.484701 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4580.991006000019,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4297.45949 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 88754.84029,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 88754841000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 16520.440036,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16520440000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3033066330,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3033066330 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 132748213,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 132748213 ns\nthreads: 1"
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
          "id": "12b1daafa121452a1ba2d17228be335b1a45b818",
          "message": "chore(master): Release 0.64.0 (#10043)\n\n:robot: I have created a release *beep* *boop*\r\n---\r\n\r\n\r\n<details><summary>aztec-package: 0.64.0</summary>\r\n\r\n##\r\n[0.64.0](https://github.com/AztecProtocol/aztec-packages/compare/aztec-package-v0.63.1...aztec-package-v0.64.0)\r\n(2024-11-25)\r\n\r\n\r\n### Features\r\n\r\n* Unify anvil versions\r\n([#10143](https://github.com/AztecProtocol/aztec-packages/issues/10143))\r\n([adae143](https://github.com/AztecProtocol/aztec-packages/commit/adae14363c29591e01477ce131578189b82430e8))\r\n\r\n\r\n### Miscellaneous\r\n\r\n* Fast epoch building test\r\n([#10045](https://github.com/AztecProtocol/aztec-packages/issues/10045))\r\n([fb791a2](https://github.com/AztecProtocol/aztec-packages/commit/fb791a2ffc3f477c4526d7e14baf06dbe200144d)),\r\ncloses\r\n[#9809](https://github.com/AztecProtocol/aztec-packages/issues/9809)\r\n</details>\r\n\r\n<details><summary>barretenberg.js: 0.64.0</summary>\r\n\r\n##\r\n[0.64.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg.js-v0.63.1...barretenberg.js-v0.64.0)\r\n(2024-11-25)\r\n\r\n\r\n### Features\r\n\r\n* Single commitment key allocation in CIVC\r\n([#9974](https://github.com/AztecProtocol/aztec-packages/issues/9974))\r\n([a0551ee](https://github.com/AztecProtocol/aztec-packages/commit/a0551ee9fca242a02774fd07bf8156a3a74dae3a))\r\n\r\n\r\n### Bug Fixes\r\n\r\n* Strip wasm debug\r\n([#9987](https://github.com/AztecProtocol/aztec-packages/issues/9987))\r\n([62a6b66](https://github.com/AztecProtocol/aztec-packages/commit/62a6b662f1ef20a603177c55c199de4a79b65b5c))\r\n\r\n\r\n### Documentation\r\n\r\n* Add docs to enable multi-threading in bb.js\r\n([#10064](https://github.com/AztecProtocol/aztec-packages/issues/10064))\r\n([8b4ebd1](https://github.com/AztecProtocol/aztec-packages/commit/8b4ebd1ddf3e8b3bac341c612444f28ea819f6c3))\r\n</details>\r\n\r\n<details><summary>aztec-packages: 0.64.0</summary>\r\n\r\n##\r\n[0.64.0](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.63.1...aztec-packages-v0.64.0)\r\n(2024-11-25)\r\n\r\n\r\n### ⚠ BREAKING CHANGES\r\n\r\n* rename SharedMutable methods\r\n([#10165](https://github.com/AztecProtocol/aztec-packages/issues/10165))\r\n* add AztecAddress.isValid and make random be valid\r\n([#10081](https://github.com/AztecProtocol/aztec-packages/issues/10081))\r\n* Always Check Arithmetic Generics at Monomorphization\r\n(https://github.com/noir-lang/noir/pull/6329)\r\n\r\n### Features\r\n\r\n* Add AztecAddress.isValid and make random be valid\r\n([#10081](https://github.com/AztecProtocol/aztec-packages/issues/10081))\r\n([fbdf6b0](https://github.com/AztecProtocol/aztec-packages/commit/fbdf6b08e1860ca432aa1d8ee8ec2e26055da6c9))\r\n* Always Check Arithmetic Generics at Monomorphization\r\n(https://github.com/noir-lang/noir/pull/6329)\r\n([b8bace9](https://github.com/AztecProtocol/aztec-packages/commit/b8bace9a00c3a8eb93f42682e8cbfa351fc5238c))\r\n* **avm:** Error handling for address resolution\r\n([#9994](https://github.com/AztecProtocol/aztec-packages/issues/9994))\r\n([ceaeda5](https://github.com/AztecProtocol/aztec-packages/commit/ceaeda50d2fd391edda3ee8186b86558b7f092e2)),\r\ncloses\r\n[#9131](https://github.com/AztecProtocol/aztec-packages/issues/9131)\r\n* **avm:** Integrate ephemeral trees\r\n([#9917](https://github.com/AztecProtocol/aztec-packages/issues/9917))\r\n([fbe1128](https://github.com/AztecProtocol/aztec-packages/commit/fbe112842432541dd6b32f2e27dc6f6882808f97))\r\n* **avm:** More efficient low leaf search\r\n([#9870](https://github.com/AztecProtocol/aztec-packages/issues/9870))\r\n([f7bbd83](https://github.com/AztecProtocol/aztec-packages/commit/f7bbd83a589c85c164c2d63215d6e40534e462dc))\r\n* Avoid unnecessary ssa passes while loop unrolling\r\n(https://github.com/noir-lang/noir/pull/6509)\r\n([b8bace9](https://github.com/AztecProtocol/aztec-packages/commit/b8bace9a00c3a8eb93f42682e8cbfa351fc5238c))\r\n* Bb-prover AVM test crafts a test TX & properly plumbs\r\nAvmCircuitPublicInputs to witgen\r\n([#10083](https://github.com/AztecProtocol/aztec-packages/issues/10083))\r\n([55564aa](https://github.com/AztecProtocol/aztec-packages/commit/55564aaca2a8fba46e0704c560a1aef18adef10d))\r\n* Calls to non-existent contracts in the AVM simulator return failure\r\n([#10051](https://github.com/AztecProtocol/aztec-packages/issues/10051))\r\n([133384c](https://github.com/AztecProtocol/aztec-packages/commit/133384c8234c79b11488578c6a1520b3de4fda79))\r\n* Compute base-fee on l1\r\n([#9986](https://github.com/AztecProtocol/aztec-packages/issues/9986))\r\n([4ab46fe](https://github.com/AztecProtocol/aztec-packages/commit/4ab46fed5ba495a33ff53e437a9712170d7ee334))\r\n* Deduplicate instructions across blocks\r\n(https://github.com/noir-lang/noir/pull/6499)\r\n([b8bace9](https://github.com/AztecProtocol/aztec-packages/commit/b8bace9a00c3a8eb93f42682e8cbfa351fc5238c))\r\n* E2e metrics reporting\r\n([#9776](https://github.com/AztecProtocol/aztec-packages/issues/9776))\r\n([9cab121](https://github.com/AztecProtocol/aztec-packages/commit/9cab1212e7040fb4c31db9bbb24f7f43413e8ed1))\r\n* Gating test\r\n([#9918](https://github.com/AztecProtocol/aztec-packages/issues/9918))\r\n([c6b65ab](https://github.com/AztecProtocol/aztec-packages/commit/c6b65abba4927d58b3cd3333c2ad5532beb650a4)),\r\ncloses\r\n[#9883](https://github.com/AztecProtocol/aztec-packages/issues/9883)\r\n* Google Kubernetes Engine - Prover Agent Spot Node Support\r\n([#10031](https://github.com/AztecProtocol/aztec-packages/issues/10031))\r\n([4d6da9b](https://github.com/AztecProtocol/aztec-packages/commit/4d6da9bb629b08312071fc9ffb57c784304acd28))\r\n* Improve trace utilization tracking\r\n([#10008](https://github.com/AztecProtocol/aztec-packages/issues/10008))\r\n([4c560ab](https://github.com/AztecProtocol/aztec-packages/commit/4c560abebcf390ec3ba8ebdc18b287b29f148450))\r\n* Improved data storage metrics\r\n([#10020](https://github.com/AztecProtocol/aztec-packages/issues/10020))\r\n([c6ab0c9](https://github.com/AztecProtocol/aztec-packages/commit/c6ab0c9c7a270104fb3e9f6160be50a90ce5e77d))\r\n* Initial gas oracle\r\n([#9952](https://github.com/AztecProtocol/aztec-packages/issues/9952))\r\n([e740d42](https://github.com/AztecProtocol/aztec-packages/commit/e740d4245e53f6ecc10f317bd5c580bf55e765d2))\r\n* Insert public data tree leaves one by one\r\n([#9989](https://github.com/AztecProtocol/aztec-packages/issues/9989))\r\n([a2c0701](https://github.com/AztecProtocol/aztec-packages/commit/a2c070161d8466c6da61f68b4d97107927f45129))\r\n* Integrate base fee computation into rollup\r\n([#10076](https://github.com/AztecProtocol/aztec-packages/issues/10076))\r\n([3417b22](https://github.com/AztecProtocol/aztec-packages/commit/3417b22eb3f9ea3e21e44ea546494c1bee31f838))\r\n* IPA accumulators setup for Rollup\r\n([#10040](https://github.com/AztecProtocol/aztec-packages/issues/10040))\r\n([4129e27](https://github.com/AztecProtocol/aztec-packages/commit/4129e27e5ed202786ea79da801d5e308d14a5f7d))\r\n* New proving agent\r\n([#9999](https://github.com/AztecProtocol/aztec-packages/issues/9999))\r\n([9ad24dd](https://github.com/AztecProtocol/aztec-packages/commit/9ad24dd7afd4cb83429562cac559ed71800d1aa7))\r\n* **profiler:** Reduce memory in Brillig execution flamegraph\r\n(https://github.com/noir-lang/noir/pull/6538)\r\n([b8bace9](https://github.com/AztecProtocol/aztec-packages/commit/b8bace9a00c3a8eb93f42682e8cbfa351fc5238c))\r\n* Public network deployments\r\n([#10089](https://github.com/AztecProtocol/aztec-packages/issues/10089))\r\n([570f70a](https://github.com/AztecProtocol/aztec-packages/commit/570f70ae158bf59a992058d7c6df01cf1cb80730))\r\n* PXE handles reorgs\r\n([#9913](https://github.com/AztecProtocol/aztec-packages/issues/9913))\r\n([aafef9c](https://github.com/AztecProtocol/aztec-packages/commit/aafef9c1cf7f2cb2aac411736c5c39f673a21b1a))\r\n* Rename SharedMutable methods\r\n([#10165](https://github.com/AztecProtocol/aztec-packages/issues/10165))\r\n([4fd70e8](https://github.com/AztecProtocol/aztec-packages/commit/4fd70e84c051c9cd05125d5ba94dfbe2c09e1cfe))\r\n* Reset pxe indexes\r\n([#10093](https://github.com/AztecProtocol/aztec-packages/issues/10093))\r\n([3848c01](https://github.com/AztecProtocol/aztec-packages/commit/3848c01cb6cdfe7ba0eb36edb0ecc652c78eb4cf))\r\n* Simplify constant MSM calls in SSA\r\n(https://github.com/noir-lang/noir/pull/6547)\r\n([b8bace9](https://github.com/AztecProtocol/aztec-packages/commit/b8bace9a00c3a8eb93f42682e8cbfa351fc5238c))\r\n* Single commitment key allocation in CIVC\r\n([#9974](https://github.com/AztecProtocol/aztec-packages/issues/9974))\r\n([a0551ee](https://github.com/AztecProtocol/aztec-packages/commit/a0551ee9fca242a02774fd07bf8156a3a74dae3a))\r\n* SSA parser (https://github.com/noir-lang/noir/pull/6489)\r\n([b8bace9](https://github.com/AztecProtocol/aztec-packages/commit/b8bace9a00c3a8eb93f42682e8cbfa351fc5238c))\r\n* **ssa:** Unroll small loops in brillig\r\n(https://github.com/noir-lang/noir/pull/6505)\r\n([b8bace9](https://github.com/AztecProtocol/aztec-packages/commit/b8bace9a00c3a8eb93f42682e8cbfa351fc5238c))\r\n* Sync from aztec-packages (https://github.com/noir-lang/noir/pull/6557)\r\n([b8bace9](https://github.com/AztecProtocol/aztec-packages/commit/b8bace9a00c3a8eb93f42682e8cbfa351fc5238c))\r\n* Sync tags as sender\r\n([#10071](https://github.com/AztecProtocol/aztec-packages/issues/10071))\r\n([122d2e4](https://github.com/AztecProtocol/aztec-packages/commit/122d2e49e4ede5ec35e42c8c51e3232f67c6c39b))\r\n* Terraform for release deployments\r\n([#10091](https://github.com/AztecProtocol/aztec-packages/issues/10091))\r\n([dc528da](https://github.com/AztecProtocol/aztec-packages/commit/dc528dadcf1c68643eb77c3ea4280161dd9ac225)),\r\ncloses\r\n[#10144](https://github.com/AztecProtocol/aztec-packages/issues/10144)\r\n* Trait aliases (https://github.com/noir-lang/noir/pull/6431)\r\n([b8bace9](https://github.com/AztecProtocol/aztec-packages/commit/b8bace9a00c3a8eb93f42682e8cbfa351fc5238c))\r\n* Unify anvil versions\r\n([#10143](https://github.com/AztecProtocol/aztec-packages/issues/10143))\r\n([adae143](https://github.com/AztecProtocol/aztec-packages/commit/adae14363c29591e01477ce131578189b82430e8))\r\n* Updating consensus payload\r\n([#10017](https://github.com/AztecProtocol/aztec-packages/issues/10017))\r\n([85c8a3b](https://github.com/AztecProtocol/aztec-packages/commit/85c8a3b29c861e61274cc0e33d47ca4aa89c144d))\r\n* Use a full `BlackBoxFunctionSolver` implementation when execution\r\nbrillig during acirgen (https://github.com/noir-lang/noir/pull/6481)\r\n([b8bace9](https://github.com/AztecProtocol/aztec-packages/commit/b8bace9a00c3a8eb93f42682e8cbfa351fc5238c))\r\n* **val:** Reex\r\n([#9768](https://github.com/AztecProtocol/aztec-packages/issues/9768))\r\n([2e58f0a](https://github.com/AztecProtocol/aztec-packages/commit/2e58f0a315ec037a212d7f33b8c73b1b0c30a2e2))\r\n\r\n\r\n### Bug Fixes\r\n\r\n* Add curl to aztec nargo container\r\n([#10173](https://github.com/AztecProtocol/aztec-packages/issues/10173))\r\n([2add6ae](https://github.com/AztecProtocol/aztec-packages/commit/2add6ae2b1c1011bf61525c2c3c96f5bdeb34f6c))\r\n* Add zod parsing for generated contract artifacts\r\n([#9905](https://github.com/AztecProtocol/aztec-packages/issues/9905))\r\n([e1ef998](https://github.com/AztecProtocol/aztec-packages/commit/e1ef9988a2b4c86afe4f944f52f63e45133c66a8))\r\n* Allow range checks to be performed within the comptime intepreter\r\n(https://github.com/noir-lang/noir/pull/6514)\r\n([b8bace9](https://github.com/AztecProtocol/aztec-packages/commit/b8bace9a00c3a8eb93f42682e8cbfa351fc5238c))\r\n* Allow unwinding multiple empty blocks\r\n([#10084](https://github.com/AztecProtocol/aztec-packages/issues/10084))\r\n([ec34442](https://github.com/AztecProtocol/aztec-packages/commit/ec34442fa3e8df0f8f1ef1e4c88df3f1895fc2dd))\r\n* Boxes\r\n([#10122](https://github.com/AztecProtocol/aztec-packages/issues/10122))\r\n([10df7c5](https://github.com/AztecProtocol/aztec-packages/commit/10df7c552456062e9a71257c2649f8a4d6237b90))\r\n* Check infix expression is valid in program input\r\n(https://github.com/noir-lang/noir/pull/6450)\r\n([b8bace9](https://github.com/AztecProtocol/aztec-packages/commit/b8bace9a00c3a8eb93f42682e8cbfa351fc5238c))\r\n* Disallow `#[test]` on associated functions\r\n(https://github.com/noir-lang/noir/pull/6449)\r\n([b8bace9](https://github.com/AztecProtocol/aztec-packages/commit/b8bace9a00c3a8eb93f42682e8cbfa351fc5238c))\r\n* Disallow contract registration in pxe of contract with duplicate\r\nprivate function selectors\r\n([#9773](https://github.com/AztecProtocol/aztec-packages/issues/9773))\r\n([2587ad5](https://github.com/AztecProtocol/aztec-packages/commit/2587ad591de883e512e0037c5c37de8306e18dd6))\r\n* Discard optimisation that would change execution ordering or that is\r\nrelated to call outputs (https://github.com/noir-lang/noir/pull/6461)\r\n([b8bace9](https://github.com/AztecProtocol/aztec-packages/commit/b8bace9a00c3a8eb93f42682e8cbfa351fc5238c))\r\n* Do a shallow follow_bindings before unification\r\n(https://github.com/noir-lang/noir/pull/6558)\r\n([b8bace9](https://github.com/AztecProtocol/aztec-packages/commit/b8bace9a00c3a8eb93f42682e8cbfa351fc5238c))\r\n* **docs:** Fix broken links in oracles doc\r\n(https://github.com/noir-lang/noir/pull/6488)\r\n([b8bace9](https://github.com/AztecProtocol/aztec-packages/commit/b8bace9a00c3a8eb93f42682e8cbfa351fc5238c))\r\n* Don't crash on AsTraitPath with empty path\r\n(https://github.com/noir-lang/noir/pull/6454)\r\n([b8bace9](https://github.com/AztecProtocol/aztec-packages/commit/b8bace9a00c3a8eb93f42682e8cbfa351fc5238c))\r\n* Fix poor handling of aliased references in flattening pass causing\r\nsome values to be zeroed (https://github.com/noir-lang/noir/pull/6434)\r\n([b8bace9](https://github.com/AztecProtocol/aztec-packages/commit/b8bace9a00c3a8eb93f42682e8cbfa351fc5238c))\r\n* Let formatter respect newlines between comments\r\n(https://github.com/noir-lang/noir/pull/6458)\r\n([b8bace9](https://github.com/AztecProtocol/aztec-packages/commit/b8bace9a00c3a8eb93f42682e8cbfa351fc5238c))\r\n* Make bytecode part of artifact hash preimage again\r\n([#9771](https://github.com/AztecProtocol/aztec-packages/issues/9771))\r\n([cdabd85](https://github.com/AztecProtocol/aztec-packages/commit/cdabd85c07cc301bba7a85d3475600d5d368a903))\r\n* Parse Slice type in SSa (https://github.com/noir-lang/noir/pull/6507)\r\n([b8bace9](https://github.com/AztecProtocol/aztec-packages/commit/b8bace9a00c3a8eb93f42682e8cbfa351fc5238c))\r\n* Perform arithmetic simplification through `CheckedCast`\r\n(https://github.com/noir-lang/noir/pull/6502)\r\n([b8bace9](https://github.com/AztecProtocol/aztec-packages/commit/b8bace9a00c3a8eb93f42682e8cbfa351fc5238c))\r\n* Potential e2e-p2p fix\r\n([#10094](https://github.com/AztecProtocol/aztec-packages/issues/10094))\r\n([820bcc6](https://github.com/AztecProtocol/aztec-packages/commit/820bcc63f5c45399de8d0bfe3729087016e94f5a))\r\n* Prover-agent.yaml syntax\r\n([#10131](https://github.com/AztecProtocol/aztec-packages/issues/10131))\r\n([a238fe6](https://github.com/AztecProtocol/aztec-packages/commit/a238fe654eb5d5c0f3ff09b401ab87a05876eea3))\r\n* Remove src build from doc build flow\r\n([#10127](https://github.com/AztecProtocol/aztec-packages/issues/10127))\r\n([fbfe1b1](https://github.com/AztecProtocol/aztec-packages/commit/fbfe1b113ab8d870f9a72401c07202265aecd7a7))\r\n* Revert \"feat: integrate base fee computation into rollup\"\r\n([#10166](https://github.com/AztecProtocol/aztec-packages/issues/10166))\r\n([1a207f5](https://github.com/AztecProtocol/aztec-packages/commit/1a207f59c76393b949750763b19193cd8b9bd804))\r\n* Right shift is not a regular division\r\n(https://github.com/noir-lang/noir/pull/6400)\r\n([b8bace9](https://github.com/AztecProtocol/aztec-packages/commit/b8bace9a00c3a8eb93f42682e8cbfa351fc5238c))\r\n* **sea:** Mem2reg to treat block input references as alias\r\n(https://github.com/noir-lang/noir/pull/6452)\r\n([b8bace9](https://github.com/AztecProtocol/aztec-packages/commit/b8bace9a00c3a8eb93f42682e8cbfa351fc5238c))\r\n* Set local_module before elaborating each trait\r\n(https://github.com/noir-lang/noir/pull/6506)\r\n([b8bace9](https://github.com/AztecProtocol/aztec-packages/commit/b8bace9a00c3a8eb93f42682e8cbfa351fc5238c))\r\n* Sorting artifact props and members in metadata\r\n([#9772](https://github.com/AztecProtocol/aztec-packages/issues/9772))\r\n([aba568a](https://github.com/AztecProtocol/aztec-packages/commit/aba568a933385a11efcaa6996b11f0fefd99e637))\r\n* **ssa:** Change array_set to not mutate slices coming from function\r\ninputs (https://github.com/noir-lang/noir/pull/6463)\r\n([b8bace9](https://github.com/AztecProtocol/aztec-packages/commit/b8bace9a00c3a8eb93f42682e8cbfa351fc5238c))\r\n* **ssa:** Resolve value IDs in terminator before comparing to array\r\n(https://github.com/noir-lang/noir/pull/6448)\r\n([b8bace9](https://github.com/AztecProtocol/aztec-packages/commit/b8bace9a00c3a8eb93f42682e8cbfa351fc5238c))\r\n* Strip wasm debug\r\n([#9987](https://github.com/AztecProtocol/aztec-packages/issues/9987))\r\n([62a6b66](https://github.com/AztecProtocol/aztec-packages/commit/62a6b662f1ef20a603177c55c199de4a79b65b5c))\r\n* Take blackbox function outputs into account when merging expressions\r\n(https://github.com/noir-lang/noir/pull/6532)\r\n([b8bace9](https://github.com/AztecProtocol/aztec-packages/commit/b8bace9a00c3a8eb93f42682e8cbfa351fc5238c))\r\n* **tests:** Prevent EOF error while running test programs\r\n(https://github.com/noir-lang/noir/pull/6455)\r\n([b8bace9](https://github.com/AztecProtocol/aztec-packages/commit/b8bace9a00c3a8eb93f42682e8cbfa351fc5238c))\r\n* **tests:** Use a file lock as well as a mutex to isolate tests cases\r\n(https://github.com/noir-lang/noir/pull/6508)\r\n([b8bace9](https://github.com/AztecProtocol/aztec-packages/commit/b8bace9a00c3a8eb93f42682e8cbfa351fc5238c))\r\n* Treat all parameters as possible aliases of each other\r\n(https://github.com/noir-lang/noir/pull/6477)\r\n([b8bace9](https://github.com/AztecProtocol/aztec-packages/commit/b8bace9a00c3a8eb93f42682e8cbfa351fc5238c))\r\n* Zero index is not always 0\r\n([#10135](https://github.com/AztecProtocol/aztec-packages/issues/10135))\r\n([bbac3d9](https://github.com/AztecProtocol/aztec-packages/commit/bbac3d9db1a4cd133c4949c3c25a17a7e39d14a2))\r\n\r\n\r\n### Miscellaneous\r\n\r\n* Add `Instruction::MakeArray` to SSA\r\n(https://github.com/noir-lang/noir/pull/6071)\r\n([b8bace9](https://github.com/AztecProtocol/aztec-packages/commit/b8bace9a00c3a8eb93f42682e8cbfa351fc5238c))\r\n* Added test showcasing performance regression\r\n(https://github.com/noir-lang/noir/pull/6566)\r\n([b8bace9](https://github.com/AztecProtocol/aztec-packages/commit/b8bace9a00c3a8eb93f42682e8cbfa351fc5238c))\r\n* **avm:** Remove initialization for non-derived polynomials\r\n([#10103](https://github.com/AztecProtocol/aztec-packages/issues/10103))\r\n([c6fdf4b](https://github.com/AztecProtocol/aztec-packages/commit/c6fdf4bda5c9ef32ca355cda9a5a0c7ed3d1a100)),\r\ncloses\r\n[#10096](https://github.com/AztecProtocol/aztec-packages/issues/10096)\r\n* Bump rust dependencies (https://github.com/noir-lang/noir/pull/6482)\r\n([b8bace9](https://github.com/AztecProtocol/aztec-packages/commit/b8bace9a00c3a8eb93f42682e8cbfa351fc5238c))\r\n* **ci:** Bump mac github runner image to `macos-14`\r\n(https://github.com/noir-lang/noir/pull/6545)\r\n([b8bace9](https://github.com/AztecProtocol/aztec-packages/commit/b8bace9a00c3a8eb93f42682e8cbfa351fc5238c))\r\n* **ci:** Fix cargo deny (https://github.com/noir-lang/noir/pull/6501)\r\n([b8bace9](https://github.com/AztecProtocol/aztec-packages/commit/b8bace9a00c3a8eb93f42682e8cbfa351fc5238c))\r\n* Convert some tests to use SSA parser\r\n(https://github.com/noir-lang/noir/pull/6543)\r\n([b8bace9](https://github.com/AztecProtocol/aztec-packages/commit/b8bace9a00c3a8eb93f42682e8cbfa351fc5238c))\r\n* Delete stray todos\r\n([#10112](https://github.com/AztecProtocol/aztec-packages/issues/10112))\r\n([cc4139a](https://github.com/AztecProtocol/aztec-packages/commit/cc4139a83347b9a726b03bd167bf7e70e6dadda7))\r\n* Do not run e2e-2-pxes along with e2e pxe test\r\n([#10155](https://github.com/AztecProtocol/aztec-packages/issues/10155))\r\n([f0f8d22](https://github.com/AztecProtocol/aztec-packages/commit/f0f8d2277ffec4457cca89feb3795aa74cb43cd3))\r\n* **docs:** Update How to Oracles\r\n(https://github.com/noir-lang/noir/pull/5675)\r\n([b8bace9](https://github.com/AztecProtocol/aztec-packages/commit/b8bace9a00c3a8eb93f42682e8cbfa351fc5238c))\r\n* Embed package name in logs\r\n(https://github.com/noir-lang/noir/pull/6564)\r\n([b8bace9](https://github.com/AztecProtocol/aztec-packages/commit/b8bace9a00c3a8eb93f42682e8cbfa351fc5238c))\r\n* Fast epoch building test\r\n([#10045](https://github.com/AztecProtocol/aztec-packages/issues/10045))\r\n([fb791a2](https://github.com/AztecProtocol/aztec-packages/commit/fb791a2ffc3f477c4526d7e14baf06dbe200144d)),\r\ncloses\r\n[#9809](https://github.com/AztecProtocol/aztec-packages/issues/9809)\r\n* Fix pool metrics\r\n([#9652](https://github.com/AztecProtocol/aztec-packages/issues/9652))\r\n([233b387](https://github.com/AztecProtocol/aztec-packages/commit/233b387495ae9d9161b95a64761246cc43200073))\r\n* Fix spartan deploy script\r\n([#10078](https://github.com/AztecProtocol/aztec-packages/issues/10078))\r\n([368ac8b](https://github.com/AztecProtocol/aztec-packages/commit/368ac8b6e172d380f11f806f5908d138a58cbba2))\r\n* Initial draft of testnet-runbook\r\n([#10085](https://github.com/AztecProtocol/aztec-packages/issues/10085))\r\n([598c1b1](https://github.com/AztecProtocol/aztec-packages/commit/598c1b1645bf802999ea33c3a9f1914ca0adc9be))\r\n* Lower throughput of ebs disks\r\n([#9997](https://github.com/AztecProtocol/aztec-packages/issues/9997))\r\n([698cd3d](https://github.com/AztecProtocol/aztec-packages/commit/698cd3d62680629a3f1bfc0f82604534cedbccf3))\r\n* Make tests not silent if DEBUG set\r\n([#10130](https://github.com/AztecProtocol/aztec-packages/issues/10130))\r\n([95e8406](https://github.com/AztecProtocol/aztec-packages/commit/95e84068824d6b933f0cea3aa6f356b8ddca494a))\r\n* Move tests for arithmetic generics closer to the code\r\n(https://github.com/noir-lang/noir/pull/6497)\r\n([b8bace9](https://github.com/AztecProtocol/aztec-packages/commit/b8bace9a00c3a8eb93f42682e8cbfa351fc5238c))\r\n* Optimise polynomial initialisation\r\n([#10073](https://github.com/AztecProtocol/aztec-packages/issues/10073))\r\n([e608742](https://github.com/AztecProtocol/aztec-packages/commit/e60874245439a47082db9fd0ca82d3798bee092d))\r\n* Parse negatives in SSA parser\r\n(https://github.com/noir-lang/noir/pull/6510)\r\n([b8bace9](https://github.com/AztecProtocol/aztec-packages/commit/b8bace9a00c3a8eb93f42682e8cbfa351fc5238c))\r\n* Proptest for `canonicalize` on infix type expressions\r\n(https://github.com/noir-lang/noir/pull/6269)\r\n([b8bace9](https://github.com/AztecProtocol/aztec-packages/commit/b8bace9a00c3a8eb93f42682e8cbfa351fc5238c))\r\n* Pull across\r\nnoir-lang/noir[#6558](https://github.com/AztecProtocol/aztec-packages/issues/6558)\r\n([#10037](https://github.com/AztecProtocol/aztec-packages/issues/10037))\r\n([3014a69](https://github.com/AztecProtocol/aztec-packages/commit/3014a69bd9d5331550005ac219a774361483fc9a))\r\n* Pull out sync changes\r\n([#10072](https://github.com/AztecProtocol/aztec-packages/issues/10072))\r\n([06ef61e](https://github.com/AztecProtocol/aztec-packages/commit/06ef61e4f1778851b95798394aaa7899ddfda47f))\r\n* Release Noir(0.38.0) (https://github.com/noir-lang/noir/pull/6422)\r\n([b8bace9](https://github.com/AztecProtocol/aztec-packages/commit/b8bace9a00c3a8eb93f42682e8cbfa351fc5238c))\r\n* Release Noir(0.39.0) (https://github.com/noir-lang/noir/pull/6484)\r\n([b8bace9](https://github.com/AztecProtocol/aztec-packages/commit/b8bace9a00c3a8eb93f42682e8cbfa351fc5238c))\r\n* Remove handling of duplicates from the note hash tree\r\n([#10016](https://github.com/AztecProtocol/aztec-packages/issues/10016))\r\n([ece1d45](https://github.com/AztecProtocol/aztec-packages/commit/ece1d455548bccd80a3c9660cc32149bcb129562))\r\n* Remove PublicExecutor\r\n([#10028](https://github.com/AztecProtocol/aztec-packages/issues/10028))\r\n([9643dcd](https://github.com/AztecProtocol/aztec-packages/commit/9643dcde07db4cc668bc99fe992fe08764f64c3f))\r\n* Remove separate acvm versioning\r\n(https://github.com/noir-lang/noir/pull/6561)\r\n([b8bace9](https://github.com/AztecProtocol/aztec-packages/commit/b8bace9a00c3a8eb93f42682e8cbfa351fc5238c))\r\n* Remove some `_else_condition` tech debt\r\n(https://github.com/noir-lang/noir/pull/6522)\r\n([b8bace9](https://github.com/AztecProtocol/aztec-packages/commit/b8bace9a00c3a8eb93f42682e8cbfa351fc5238c))\r\n* Remove some unnecessary clones\r\n([#10049](https://github.com/AztecProtocol/aztec-packages/issues/10049))\r\n([8628b32](https://github.com/AztecProtocol/aztec-packages/commit/8628b32b3ee39063230899d26f2b8382c18fe02b))\r\n* Remove unused imports\r\n([#10134](https://github.com/AztecProtocol/aztec-packages/issues/10134))\r\n([8dbeda0](https://github.com/AztecProtocol/aztec-packages/commit/8dbeda0c87399090e88ff723f732e4e6a4d9d01c))\r\n* Remove unused methods from implicit numeric generics\r\n(https://github.com/noir-lang/noir/pull/6541)\r\n([b8bace9](https://github.com/AztecProtocol/aztec-packages/commit/b8bace9a00c3a8eb93f42682e8cbfa351fc5238c))\r\n* Replace relative paths to noir-protocol-circuits\r\n([ccf6695](https://github.com/AztecProtocol/aztec-packages/commit/ccf6695e9f81190e7da7bad657ca814822b33cd7))\r\n* Replace relative paths to noir-protocol-circuits\r\n([fa225a2](https://github.com/AztecProtocol/aztec-packages/commit/fa225a256fefedfa30e3da4aca02f33e3636b254))\r\n* Replace relative paths to noir-protocol-circuits\r\n([98387b8](https://github.com/AztecProtocol/aztec-packages/commit/98387b8820a21242cc62c18119c999c516776046))\r\n* Replace relative paths to noir-protocol-circuits\r\n([94753d4](https://github.com/AztecProtocol/aztec-packages/commit/94753d492892c7f3f37b3852b2894c15ed2c394a))\r\n* Restructure `noirc_evaluator` crate\r\n(https://github.com/noir-lang/noir/pull/6534)\r\n([b8bace9](https://github.com/AztecProtocol/aztec-packages/commit/b8bace9a00c3a8eb93f42682e8cbfa351fc5238c))\r\n* Revamp attributes (https://github.com/noir-lang/noir/pull/6424)\r\n([b8bace9](https://github.com/AztecProtocol/aztec-packages/commit/b8bace9a00c3a8eb93f42682e8cbfa351fc5238c))\r\n* Reverse ssa parser diff order\r\n(https://github.com/noir-lang/noir/pull/6511)\r\n([b8bace9](https://github.com/AztecProtocol/aztec-packages/commit/b8bace9a00c3a8eb93f42682e8cbfa351fc5238c))\r\n* Revert\r\n[#6375](https://github.com/AztecProtocol/aztec-packages/issues/6375)\r\n(https://github.com/noir-lang/noir/pull/6552)\r\n([b8bace9](https://github.com/AztecProtocol/aztec-packages/commit/b8bace9a00c3a8eb93f42682e8cbfa351fc5238c))\r\n* Skip emitting public bytecode\r\n([#10009](https://github.com/AztecProtocol/aztec-packages/issues/10009))\r\n([280d169](https://github.com/AztecProtocol/aztec-packages/commit/280d169e5b5b92867bb6c0807ec802aa048840af))\r\n* Split path and import lookups\r\n(https://github.com/noir-lang/noir/pull/6430)\r\n([b8bace9](https://github.com/AztecProtocol/aztec-packages/commit/b8bace9a00c3a8eb93f42682e8cbfa351fc5238c))\r\n* **ssa:** Skip array_set pass for Brillig functions\r\n(https://github.com/noir-lang/noir/pull/6513)\r\n([b8bace9](https://github.com/AztecProtocol/aztec-packages/commit/b8bace9a00c3a8eb93f42682e8cbfa351fc5238c))\r\n* Switch to 1.0.0-beta versioning\r\n(https://github.com/noir-lang/noir/pull/6503)\r\n([b8bace9](https://github.com/AztecProtocol/aztec-packages/commit/b8bace9a00c3a8eb93f42682e8cbfa351fc5238c))\r\n* **test:** More descriptive labels in test matrix\r\n(https://github.com/noir-lang/noir/pull/6542)\r\n([b8bace9](https://github.com/AztecProtocol/aztec-packages/commit/b8bace9a00c3a8eb93f42682e8cbfa351fc5238c))\r\n* **test:** Remove duplicate brillig tests\r\n(https://github.com/noir-lang/noir/pull/6523)\r\n([b8bace9](https://github.com/AztecProtocol/aztec-packages/commit/b8bace9a00c3a8eb93f42682e8cbfa351fc5238c))\r\n* **test:** Run test matrix on test_programs\r\n(https://github.com/noir-lang/noir/pull/6429)\r\n([b8bace9](https://github.com/AztecProtocol/aztec-packages/commit/b8bace9a00c3a8eb93f42682e8cbfa351fc5238c))\r\n* Update example to show how to split public inputs in bash\r\n(https://github.com/noir-lang/noir/pull/6472)\r\n([b8bace9](https://github.com/AztecProtocol/aztec-packages/commit/b8bace9a00c3a8eb93f42682e8cbfa351fc5238c))\r\n\r\n\r\n### Documentation\r\n\r\n* Add docs to enable multi-threading in bb.js\r\n([#10064](https://github.com/AztecProtocol/aztec-packages/issues/10064))\r\n([8b4ebd1](https://github.com/AztecProtocol/aztec-packages/commit/8b4ebd1ddf3e8b3bac341c612444f28ea819f6c3))\r\n* Re-arrange references section\r\n([#10070](https://github.com/AztecProtocol/aztec-packages/issues/10070))\r\n([375482f](https://github.com/AztecProtocol/aztec-packages/commit/375482f08f8da53330e9874e23a07ade9d2eb701))\r\n</details>\r\n\r\n<details><summary>barretenberg: 0.64.0</summary>\r\n\r\n##\r\n[0.64.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.63.1...barretenberg-v0.64.0)\r\n(2024-11-25)\r\n\r\n\r\n### Features\r\n\r\n* **avm:** Error handling for address resolution\r\n([#9994](https://github.com/AztecProtocol/aztec-packages/issues/9994))\r\n([ceaeda5](https://github.com/AztecProtocol/aztec-packages/commit/ceaeda50d2fd391edda3ee8186b86558b7f092e2)),\r\ncloses\r\n[#9131](https://github.com/AztecProtocol/aztec-packages/issues/9131)\r\n* Improve trace utilization tracking\r\n([#10008](https://github.com/AztecProtocol/aztec-packages/issues/10008))\r\n([4c560ab](https://github.com/AztecProtocol/aztec-packages/commit/4c560abebcf390ec3ba8ebdc18b287b29f148450))\r\n* Improved data storage metrics\r\n([#10020](https://github.com/AztecProtocol/aztec-packages/issues/10020))\r\n([c6ab0c9](https://github.com/AztecProtocol/aztec-packages/commit/c6ab0c9c7a270104fb3e9f6160be50a90ce5e77d))\r\n* Insert public data tree leaves one by one\r\n([#9989](https://github.com/AztecProtocol/aztec-packages/issues/9989))\r\n([a2c0701](https://github.com/AztecProtocol/aztec-packages/commit/a2c070161d8466c6da61f68b4d97107927f45129))\r\n* IPA accumulators setup for Rollup\r\n([#10040](https://github.com/AztecProtocol/aztec-packages/issues/10040))\r\n([4129e27](https://github.com/AztecProtocol/aztec-packages/commit/4129e27e5ed202786ea79da801d5e308d14a5f7d))\r\n* Single commitment key allocation in CIVC\r\n([#9974](https://github.com/AztecProtocol/aztec-packages/issues/9974))\r\n([a0551ee](https://github.com/AztecProtocol/aztec-packages/commit/a0551ee9fca242a02774fd07bf8156a3a74dae3a))\r\n\r\n\r\n### Bug Fixes\r\n\r\n* Strip wasm debug\r\n([#9987](https://github.com/AztecProtocol/aztec-packages/issues/9987))\r\n([62a6b66](https://github.com/AztecProtocol/aztec-packages/commit/62a6b662f1ef20a603177c55c199de4a79b65b5c))\r\n* Zero index is not always 0\r\n([#10135](https://github.com/AztecProtocol/aztec-packages/issues/10135))\r\n([bbac3d9](https://github.com/AztecProtocol/aztec-packages/commit/bbac3d9db1a4cd133c4949c3c25a17a7e39d14a2))\r\n\r\n\r\n### Miscellaneous\r\n\r\n* **avm:** Remove initialization for non-derived polynomials\r\n([#10103](https://github.com/AztecProtocol/aztec-packages/issues/10103))\r\n([c6fdf4b](https://github.com/AztecProtocol/aztec-packages/commit/c6fdf4bda5c9ef32ca355cda9a5a0c7ed3d1a100)),\r\ncloses\r\n[#10096](https://github.com/AztecProtocol/aztec-packages/issues/10096)\r\n* Delete stray todos\r\n([#10112](https://github.com/AztecProtocol/aztec-packages/issues/10112))\r\n([cc4139a](https://github.com/AztecProtocol/aztec-packages/commit/cc4139a83347b9a726b03bd167bf7e70e6dadda7))\r\n* Optimise polynomial initialisation\r\n([#10073](https://github.com/AztecProtocol/aztec-packages/issues/10073))\r\n([e608742](https://github.com/AztecProtocol/aztec-packages/commit/e60874245439a47082db9fd0ca82d3798bee092d))\r\n* Remove handling of duplicates from the note hash tree\r\n([#10016](https://github.com/AztecProtocol/aztec-packages/issues/10016))\r\n([ece1d45](https://github.com/AztecProtocol/aztec-packages/commit/ece1d455548bccd80a3c9660cc32149bcb129562))\r\n</details>\r\n\r\n---\r\nThis PR was generated with [Release\r\nPlease](https://github.com/googleapis/release-please). See\r\n[documentation](https://github.com/googleapis/release-please#release-please).",
          "timestamp": "2024-11-25T10:12:43-05:00",
          "tree_id": "f8a40615719583a27ada90912f7ac72608a4253a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/12b1daafa121452a1ba2d17228be335b1a45b818"
        },
        "date": 1732549266939,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28629.34498300001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 26584.121091 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4792.856170999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4445.736632 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 91515.56306,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 91515564000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 16943.45302,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16943453000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3115110139,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3115110139 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 136838091,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 136838091 ns\nthreads: 1"
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
          "id": "4418ef2a5768e0f627160b86e8dc8735d4bf00e7",
          "message": "feat: UltraRollupRecursiveFlavor (#10088)\n\nCreates new recursive flavor. The recursive verifier with this flavor\r\nwill extract the IPA claim from the public inputs and return it as part\r\nof its output. Modifies the ClientTubeBase test to use this new flavor.",
          "timestamp": "2024-11-25T16:28:43Z",
          "tree_id": "d9f87e8e3ee744dfe84c16dbdc8ee9d4e7034762",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/4418ef2a5768e0f627160b86e8dc8735d4bf00e7"
        },
        "date": 1732553697413,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 27295.253331999986,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 25269.634658 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4592.153176000011,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4286.763849999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 86860.485455,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 86860485000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 16630.894746,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16630895000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3016161929,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3016161929 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 133867340,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 133867340 ns\nthreads: 1"
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
          "id": "69bdf4f0341cbd95908e5e632b71a57da5df1433",
          "message": "chore(avm): operands reordering (#10182)\n\nResolves #10136",
          "timestamp": "2024-11-25T17:45:53Z",
          "tree_id": "041b0b7027aecfc95854f1d45682e3f772f1d3a3",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/69bdf4f0341cbd95908e5e632b71a57da5df1433"
        },
        "date": 1732559657018,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 30281.088646,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 28138.751164999998 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5165.641212000011,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4821.159165 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 95685.394308,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 95685394000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 18117.187870999995,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18117189000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3330448468,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3330448468 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 140059104,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 140059104 ns\nthreads: 1"
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
          "id": "c8696b165425ee6dd7a2398f4b90b29f24d762f4",
          "message": "feat: Origin tags implemented in biggroup (#10002)\n\nThis PR extends the origin tag mechanism in stdlib to the biggroup class",
          "timestamp": "2024-11-25T23:51:05Z",
          "tree_id": "0183fc157a4f83b1919ea8ef42cd04705795c0d7",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c8696b165425ee6dd7a2398f4b90b29f24d762f4"
        },
        "date": 1732580755818,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 27974.56422899998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 26305.712638000005 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5027.516215999995,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4689.802588000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 83726.369612,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 83726370000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15156.556863999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15156557000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3067694500,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3067694500 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 139752377,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 139752377 ns\nthreads: 1"
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
          "id": "ac8f13e4cd9a3f6b23d53ce5b06cc436324d5f7b",
          "message": "feat(avm): new public inputs witgen (#10179)\n\nThis PR does a few things\r\n1) Disconnects the kernel trace constraints (but keeps the file for\r\nfuture reference when we re-constrain public inputs)\r\n2) Replaces the old public inputs with the new ones from\r\n`AvmCircuitPublicInputs`, however unconstrained\r\n3) All merkle checks are now performed in witgen\r\n\r\nIt's still a bit brittle and probably needs a refactor to clean it up\r\nbut will suffice for now as we are getting all the pieces together",
          "timestamp": "2024-11-26T17:32:01Z",
          "tree_id": "3b1ba55793a8e448ae76d46da5fc76e23bff9f50",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ac8f13e4cd9a3f6b23d53ce5b06cc436324d5f7b"
        },
        "date": 1732643826259,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 27992.62294100001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 26233.630974 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5071.872057999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4614.937978 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 83867.52895200001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 83867529000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15158.972065,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15158973000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3078155659,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3078155659 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 140013160,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 140013160 ns\nthreads: 1"
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
          "id": "903bcb0a42f7fd83fb7da97a13b763cf761336bd",
          "message": "chore(master): Release 0.65.0 (#10181)\n\n:robot: I have created a release *beep* *boop*\r\n---\r\n\r\n\r\n<details><summary>aztec-package: 0.65.0</summary>\r\n\r\n##\r\n[0.65.0](https://github.com/AztecProtocol/aztec-packages/compare/aztec-package-v0.64.0...aztec-package-v0.65.0)\r\n(2024-11-26)\r\n\r\n\r\n### Features\r\n\r\n* **avm:** New public inputs witgen\r\n([#10179](https://github.com/AztecProtocol/aztec-packages/issues/10179))\r\n([ac8f13e](https://github.com/AztecProtocol/aztec-packages/commit/ac8f13e4cd9a3f6b23d53ce5b06cc436324d5f7b))\r\n</details>\r\n\r\n<details><summary>barretenberg.js: 0.65.0</summary>\r\n\r\n##\r\n[0.65.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg.js-v0.64.0...barretenberg.js-v0.65.0)\r\n(2024-11-26)\r\n\r\n\r\n### Bug Fixes\r\n\r\n* **bb.js:** Don't minify bb.js - webpack config\r\n([#10170](https://github.com/AztecProtocol/aztec-packages/issues/10170))\r\n([6e7fae7](https://github.com/AztecProtocol/aztec-packages/commit/6e7fae7c78496b0b2241e2061b35ab22a3b3b186))\r\n</details>\r\n\r\n<details><summary>aztec-packages: 0.65.0</summary>\r\n\r\n##\r\n[0.65.0](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.64.0...aztec-packages-v0.65.0)\r\n(2024-11-26)\r\n\r\n\r\n### ⚠ BREAKING CHANGES\r\n\r\n* remove SharedImmutable\r\n([#10183](https://github.com/AztecProtocol/aztec-packages/issues/10183))\r\n* rename sharedimmutable methods\r\n([#10164](https://github.com/AztecProtocol/aztec-packages/issues/10164))\r\n\r\n### Features\r\n\r\n* **avm:** New public inputs witgen\r\n([#10179](https://github.com/AztecProtocol/aztec-packages/issues/10179))\r\n([ac8f13e](https://github.com/AztecProtocol/aztec-packages/commit/ac8f13e4cd9a3f6b23d53ce5b06cc436324d5f7b))\r\n* Blobs.\r\n([#9302](https://github.com/AztecProtocol/aztec-packages/issues/9302))\r\n([03b7e0e](https://github.com/AztecProtocol/aztec-packages/commit/03b7e0eee49680e18fafa5b78199b24e8b60fd5d))\r\n* One liner for nodes to join rough-rhino\r\n([#10168](https://github.com/AztecProtocol/aztec-packages/issues/10168))\r\n([3a425e9](https://github.com/AztecProtocol/aztec-packages/commit/3a425e9faa9d1c13f28fb61279eb9f842897f516))\r\n* Origin tags implemented in biggroup\r\n([#10002](https://github.com/AztecProtocol/aztec-packages/issues/10002))\r\n([c8696b1](https://github.com/AztecProtocol/aztec-packages/commit/c8696b165425ee6dd7a2398f4b90b29f24d762f4))\r\n* Remove SharedImmutable\r\n([#10183](https://github.com/AztecProtocol/aztec-packages/issues/10183))\r\n([a9f3b5f](https://github.com/AztecProtocol/aztec-packages/commit/a9f3b5f6e7e5bc9d4bc9c0600b492a5e0cd2c1d9))\r\n* Rename sharedimmutable methods\r\n([#10164](https://github.com/AztecProtocol/aztec-packages/issues/10164))\r\n([ef7cd86](https://github.com/AztecProtocol/aztec-packages/commit/ef7cd861c180b73000f7dab5807200ccdd5f1680))\r\n* UltraRollupRecursiveFlavor\r\n([#10088](https://github.com/AztecProtocol/aztec-packages/issues/10088))\r\n([4418ef2](https://github.com/AztecProtocol/aztec-packages/commit/4418ef2a5768e0f627160b86e8dc8735d4bf00e7))\r\n\r\n\r\n### Bug Fixes\r\n\r\n* Aztec-nargo curl in the earthfile also\r\n([#10199](https://github.com/AztecProtocol/aztec-packages/issues/10199))\r\n([985a678](https://github.com/AztecProtocol/aztec-packages/commit/985a678dcc4ae5112edd81dabbce314568e8fe36))\r\n* **bb.js:** Don't minify bb.js - webpack config\r\n([#10170](https://github.com/AztecProtocol/aztec-packages/issues/10170))\r\n([6e7fae7](https://github.com/AztecProtocol/aztec-packages/commit/6e7fae7c78496b0b2241e2061b35ab22a3b3b186))\r\n* Docker compose aztec up fix\r\n([#10197](https://github.com/AztecProtocol/aztec-packages/issues/10197))\r\n([d7ae959](https://github.com/AztecProtocol/aztec-packages/commit/d7ae95908f14693e18fb6aefc50702ec4857f51a))\r\n* Increase test timeouts\r\n([#10205](https://github.com/AztecProtocol/aztec-packages/issues/10205))\r\n([195aa3d](https://github.com/AztecProtocol/aztec-packages/commit/195aa3d6a708a7e676416745552416d1f69aa6c3))\r\n* Release l1-contracts\r\n([#10095](https://github.com/AztecProtocol/aztec-packages/issues/10095))\r\n([29f0d7a](https://github.com/AztecProtocol/aztec-packages/commit/29f0d7af38f8663f49e9522120725992dc9975e5))\r\n* Revert \"feat: blobs.\r\n([#9302](https://github.com/AztecProtocol/aztec-packages/issues/9302))\"\r\n([#10187](https://github.com/AztecProtocol/aztec-packages/issues/10187))\r\n([a415f65](https://github.com/AztecProtocol/aztec-packages/commit/a415f6552ae9893699747b4d1fc799553e9a9a7e))\r\n\r\n\r\n### Miscellaneous\r\n\r\n* Added ref to env variables\r\n([#10193](https://github.com/AztecProtocol/aztec-packages/issues/10193))\r\n([b51fc43](https://github.com/AztecProtocol/aztec-packages/commit/b51fc43a6fbd07eb89faae5bd518246182fa9d0f))\r\n* **avm:** Operands reordering\r\n([#10182](https://github.com/AztecProtocol/aztec-packages/issues/10182))\r\n([69bdf4f](https://github.com/AztecProtocol/aztec-packages/commit/69bdf4f0341cbd95908e5e632b71a57da5df1433)),\r\ncloses\r\n[#10136](https://github.com/AztecProtocol/aztec-packages/issues/10136)\r\n* Fix devbox\r\n([#10201](https://github.com/AztecProtocol/aztec-packages/issues/10201))\r\n([323eaee](https://github.com/AztecProtocol/aztec-packages/commit/323eaee1128b64c0e9749823e9e10a5b246375d4))\r\n* Misc cleanup\r\n([#10194](https://github.com/AztecProtocol/aztec-packages/issues/10194))\r\n([dd01417](https://github.com/AztecProtocol/aztec-packages/commit/dd014178f927fcd18f5dcacab5655ca01ff18629))\r\n* Reinstate docs-preview, fix doc publish\r\n([#10213](https://github.com/AztecProtocol/aztec-packages/issues/10213))\r\n([ed9a0e3](https://github.com/AztecProtocol/aztec-packages/commit/ed9a0e36827fc5e60e85ded7f21115b5725430b1))\r\n* Replace relative paths to noir-protocol-circuits\r\n([1650446](https://github.com/AztecProtocol/aztec-packages/commit/1650446e62b696b90857f12d264b8cf61b265113))\r\n</details>\r\n\r\n<details><summary>barretenberg: 0.65.0</summary>\r\n\r\n##\r\n[0.65.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.64.0...barretenberg-v0.65.0)\r\n(2024-11-26)\r\n\r\n\r\n### Features\r\n\r\n* **avm:** New public inputs witgen\r\n([#10179](https://github.com/AztecProtocol/aztec-packages/issues/10179))\r\n([ac8f13e](https://github.com/AztecProtocol/aztec-packages/commit/ac8f13e4cd9a3f6b23d53ce5b06cc436324d5f7b))\r\n* Origin tags implemented in biggroup\r\n([#10002](https://github.com/AztecProtocol/aztec-packages/issues/10002))\r\n([c8696b1](https://github.com/AztecProtocol/aztec-packages/commit/c8696b165425ee6dd7a2398f4b90b29f24d762f4))\r\n* UltraRollupRecursiveFlavor\r\n([#10088](https://github.com/AztecProtocol/aztec-packages/issues/10088))\r\n([4418ef2](https://github.com/AztecProtocol/aztec-packages/commit/4418ef2a5768e0f627160b86e8dc8735d4bf00e7))\r\n\r\n\r\n### Miscellaneous\r\n\r\n* **avm:** Operands reordering\r\n([#10182](https://github.com/AztecProtocol/aztec-packages/issues/10182))\r\n([69bdf4f](https://github.com/AztecProtocol/aztec-packages/commit/69bdf4f0341cbd95908e5e632b71a57da5df1433)),\r\ncloses\r\n[#10136](https://github.com/AztecProtocol/aztec-packages/issues/10136)\r\n</details>\r\n\r\n---\r\nThis PR was generated with [Release\r\nPlease](https://github.com/googleapis/release-please). See\r\n[documentation](https://github.com/googleapis/release-please#release-please).",
          "timestamp": "2024-11-26T18:28:07Z",
          "tree_id": "a2e7345eef62604bd58c1f51e5fc31291e28ea8c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/903bcb0a42f7fd83fb7da97a13b763cf761336bd"
        },
        "date": 1732647179225,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28039.125632999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 26301.874291999997 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5040.955634,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4695.913222 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 83984.24756899998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 83984248000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15145.753545,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15145753000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3081757142,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3081757142 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 139953245,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 139953245 ns\nthreads: 1"
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
          "id": "bb129da78e0a2b6618a1e1dd7254dd50749bd579",
          "message": "chore(master): Release 0.65.0",
          "timestamp": "2024-11-26T18:28:12Z",
          "url": "https://github.com/AztecProtocol/aztec-packages/pull/10181/commits/bb129da78e0a2b6618a1e1dd7254dd50749bd579"
        },
        "date": 1732647623320,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28069.189948000003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 26255.860148 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5041.241341000003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4759.589463 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 83467.13336,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 83467134000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15382.445153000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15382445000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3109579409,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3109579409 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 141708192,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 141708192 ns\nthreads: 1"
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
          "id": "da265b6b7d61a0d991fa23bd044f711513a0e86c",
          "message": "feat: Speed up transaction execution (#10172)\n\nThis PR make a number of optimisation related to the speed up of\r\ntransaction execution. Namely:\r\n\r\n1. We don't re-initialise the instruction set mapping with each\r\ninstruction decode.\r\n2. We now compute public bytecode commitments at the point of receiving\r\na contract and persist them, meaning they don't need to be computed at\r\nthe point of execution.\r\n3. We only store and iterate opcode and program counter tally\r\ninformation when in debug.\r\n4. Function names are also cached at the point contract artifacts are\r\nshared with the node.\r\n5. World state status summary and previous block archive roots are\r\ncached to reduce the impact on the world state DB whilst execution is\r\ntaking place.",
          "timestamp": "2024-11-26T20:01:54Z",
          "tree_id": "a366fb8e89dec841f0a838e327e8b9c49f3f9dd6",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/da265b6b7d61a0d991fa23bd044f711513a0e86c"
        },
        "date": 1732653336019,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28053.537981999994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 26512.373425 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5051.639926999982,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4669.6807739999995 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 83771.467434,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 83771467000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15206.716956999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15206717000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3085343907,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3085343907 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 141354712,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 141354712 ns\nthreads: 1"
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
          "id": "49b4a6c07f39711ad2a0477e1fad11e11b8ee23c",
          "message": "fix(avm): execution test ordering (#10226)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\r\nline.",
          "timestamp": "2024-11-27T09:25:56+01:00",
          "tree_id": "37d40864577e3c23a3144ff5eb98428442fec2ab",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/49b4a6c07f39711ad2a0477e1fad11e11b8ee23c"
        },
        "date": 1732697639757,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28120.199366999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 26140.301912000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4719.945643000003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4411.052086 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 89607.03012099999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 89607031000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 16946.585014,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16946585000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3093128141,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3093128141 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 135609158,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 135609158 ns\nthreads: 1"
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
          "id": "0c7c4c9bb0c01067abe57ccd06962d71c7279aa0",
          "message": "chore(avm): Zero initialization in avm public inputs and execution test fixes (#10238)\n\nThe uninitialized members of the public inputs created some segmentation\r\nfault in AvmExecutionTests.basicAddReturn and other unit test failures\r\nin AvmExecutionTests.l2GasLeft and AvmExecutionTests.daGasLeft tests.",
          "timestamp": "2024-11-27T11:42:09+01:00",
          "tree_id": "36209f313f7d39598559df90c8a67ebe44fadf62",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0c7c4c9bb0c01067abe57ccd06962d71c7279aa0"
        },
        "date": 1732705847641,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 27997.618216999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 26153.281726 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5067.496634999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4721.5265420000005 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 83883.747371,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 83883747000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15148.538003999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15148538000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3067410312,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3067410312 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 139718631,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 139718631 ns\nthreads: 1"
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
          "id": "3c623fc2d857d6792b557dc7d1ccb929274046bb",
          "message": "chore(avm): handle parsing error (#10203)\n\nResolves #9770",
          "timestamp": "2024-11-27T13:04:12+01:00",
          "tree_id": "8cf2229061d78958037909454687cde993c7944b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/3c623fc2d857d6792b557dc7d1ccb929274046bb"
        },
        "date": 1732710455451,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 27941.419922000023,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 26430.950191 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5009.569832999986,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4718.313627 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 83357.143512,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 83357144000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15094.282844000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15094283000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3081481499,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3081481499 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 140805101,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 140805101 ns\nthreads: 1"
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
          "id": "2478d1909db2d79cc0cdd3063dc2ac4e1eaedce3",
          "message": "feat: add total mana used to header (#9868)",
          "timestamp": "2024-11-27T12:07:49Z",
          "tree_id": "b3c11e6f0fb9738613f2b83ab18af2bfddbf0515",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/2478d1909db2d79cc0cdd3063dc2ac4e1eaedce3"
        },
        "date": 1732711856728,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 27952.32514700001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 26364.348791 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5070.9309070000045,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4691.0921960000005 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 83981.92701,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 83981927000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15207.205348000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15207207000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3071058241,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3071058241 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 140635164,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 140635164 ns\nthreads: 1"
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
          "id": "01eb392f15995f344e40aa8f8e41a28f6f5b825d",
          "message": "feat: Configure world state block history (#10216)\n\nThis PR introduces a new configuration option `WS_NUM_HISTORIC_BLOCKS`\r\nwhich determines how much history the world state stores. Blocks beyond\r\nthis history are pruned.",
          "timestamp": "2024-11-27T13:02:58Z",
          "tree_id": "2116e41c11b8f4c072a38d845aeba49a0977ae0d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/01eb392f15995f344e40aa8f8e41a28f6f5b825d"
        },
        "date": 1732714607614,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 27921.283971000008,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 26447.057706 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5014.060822999994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4701.979388000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 83542.874923,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 83542875000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15134.962835999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15134963000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3085038257,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3085038257 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 140448213,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 140448213 ns\nthreads: 1"
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
          "id": "1bfc15e08873a1f0f3743e259f418b70426b3f25",
          "message": "chore: pull out some sync changes (#10245)\n\nThis pulls out some of the lower-risk changes from the sync.",
          "timestamp": "2024-11-27T15:15:39Z",
          "tree_id": "3db46d454d22850f12c69f1921beac70c0564618",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1bfc15e08873a1f0f3743e259f418b70426b3f25"
        },
        "date": 1732721967526,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28006.621101000008,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 26281.337176999998 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5011.699031999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4641.308725 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 84203.719131,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 84203720000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15147.367450000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15147369000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3058870092,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3058870092 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 139729064,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 139729064 ns\nthreads: 1"
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
          "id": "089c34cc3e9fb5cb493096246525c2205e646204",
          "message": "refactor: CIVC VK (#10223)\n\nAs a step toward a consistent API, we add to `ClientIVC`\r\n```\r\n    struct VerificationKey {\r\n        std::shared_ptr<MegaVerificationKey> mega;\r\n        std::shared_ptr<ECCVMVerificationKey> eccvm;\r\n        std::shared_ptr<TranslatorVerificationKey> translator;\r\n\r\n        MSGPACK_FIELDS(mega, eccvm, translator);\r\n    };\r\n```\r\n\r\nClientIVC API before;\r\n```\r\n    static bool verify(const Proof& proof,\r\n                       const std::shared_ptr<MegaVerificationKey>& mega_vk,\r\n                       const std::shared_ptr<ClientIVC::ECCVMVerificationKey>& eccvm_vk,\r\n                       const std::shared_ptr<ClientIVC::TranslatorVerificationKey>& translator_vk);\r\n```\r\n(three vk paths need to be provided to CLI)\r\n\r\nClientIVC API after: \r\n```\r\n    static bool verify(const Proof& proof, const VerificationKey& vk);`\r\n```\r\n(and one vk path needs to be provided to CLI)",
          "timestamp": "2024-11-27T10:46:11-05:00",
          "tree_id": "15bb5742f4af493ce0e60e3e6fe1989266ad1597",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/089c34cc3e9fb5cb493096246525c2205e646204"
        },
        "date": 1732724330465,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28005.986659000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 26315.656614 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5032.924441999995,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4713.488985 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 83547.696289,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 83547697000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15144.496462,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15144496000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3052192836,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3052192836 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 140263845,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 140263845 ns\nthreads: 1"
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
          "id": "b5783d3945959056d24aa3d988e9ca9efd3ec224",
          "message": "feat: Full IPA Recursive Verifier (#10189)\n\nAdds back the full IPA recursive verifier implementation in preparation\r\nof adding it to the root rollup circuit. Creates new tests for the full\r\nverification and also new tests for accumulation with different sizes.",
          "timestamp": "2024-11-27T17:22:55Z",
          "tree_id": "ca246934d508be7b0a599d5eee83596e3c6d305e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/b5783d3945959056d24aa3d988e9ca9efd3ec224"
        },
        "date": 1732730447339,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 27930.91603800002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 26331.796415 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5056.760932999992,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4728.927258 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 83513.182727,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 83513183000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15173.696832000003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15173697000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3060561275,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3060561275 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 140253105,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 140253105 ns\nthreads: 1"
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
          "id": "569edf1d5e3200ecd42eb2777eb2f57120fcf0e7",
          "message": "chore(master): Release 0.65.1",
          "timestamp": "2024-11-27T19:04:37Z",
          "url": "https://github.com/AztecProtocol/aztec-packages/pull/10219/commits/569edf1d5e3200ecd42eb2777eb2f57120fcf0e7"
        },
        "date": 1732735215788,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 27910.29672600001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 26112.701827 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5023.950282000015,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4684.277552 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 83833.78808099999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 83833788000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15117.710857,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15117711000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3051434015,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3051434015 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 139566333,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 139566333 ns\nthreads: 1"
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
          "id": "62fc9175019cb5f3fabca1a5f5ff9e04d708695e",
          "message": "chore(master): Release 0.65.1 (#10219)\n\n:robot: I have created a release *beep* *boop*\r\n---\r\n\r\n\r\n<details><summary>aztec-package: 0.65.1</summary>\r\n\r\n##\r\n[0.65.1](https://github.com/AztecProtocol/aztec-packages/compare/aztec-package-v0.65.0...aztec-package-v0.65.1)\r\n(2024-11-27)\r\n\r\n\r\n### Miscellaneous\r\n\r\n* Delete old serialization methods\r\n([#9951](https://github.com/AztecProtocol/aztec-packages/issues/9951))\r\n([10d3f6f](https://github.com/AztecProtocol/aztec-packages/commit/10d3f6fe851dc73f5f12edec26b028fe526f0be6))\r\n</details>\r\n\r\n<details><summary>barretenberg.js: 0.65.1</summary>\r\n\r\n##\r\n[0.65.1](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg.js-v0.65.0...barretenberg.js-v0.65.1)\r\n(2024-11-27)\r\n\r\n\r\n### Features\r\n\r\n* Speed up transaction execution\r\n([#10172](https://github.com/AztecProtocol/aztec-packages/issues/10172))\r\n([da265b6](https://github.com/AztecProtocol/aztec-packages/commit/da265b6b7d61a0d991fa23bd044f711513a0e86c))\r\n\r\n\r\n### Bug Fixes\r\n\r\n* Add pako as a dependency in bb.js\r\n([#10186](https://github.com/AztecProtocol/aztec-packages/issues/10186))\r\n([b773c14](https://github.com/AztecProtocol/aztec-packages/commit/b773c14a8fe8bf425dc755b3a156e500e9924c1e))\r\n</details>\r\n\r\n<details><summary>aztec-packages: 0.65.1</summary>\r\n\r\n##\r\n[0.65.1](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.65.0...aztec-packages-v0.65.1)\r\n(2024-11-27)\r\n\r\n\r\n### Features\r\n\r\n* Add total mana used to header\r\n([#9868](https://github.com/AztecProtocol/aztec-packages/issues/9868))\r\n([2478d19](https://github.com/AztecProtocol/aztec-packages/commit/2478d1909db2d79cc0cdd3063dc2ac4e1eaedce3))\r\n* Assert metrics in network tests\r\n([#10215](https://github.com/AztecProtocol/aztec-packages/issues/10215))\r\n([9380c0f](https://github.com/AztecProtocol/aztec-packages/commit/9380c0f68bc01722b60539034a9f064606e1b119))\r\n* Avm inserts nullifiers from private\r\n([#10129](https://github.com/AztecProtocol/aztec-packages/issues/10129))\r\n([3fc0c7c](https://github.com/AztecProtocol/aztec-packages/commit/3fc0c7c7d4b6b4052d185dbb795a7fe3d724f09f))\r\n* Burn congestion fee\r\n([#10231](https://github.com/AztecProtocol/aztec-packages/issues/10231))\r\n([20a33f2](https://github.com/AztecProtocol/aztec-packages/commit/20a33f2d097d7fd3bd67eabf2d2254b43d5723d0))\r\n* Configure world state block history\r\n([#10216](https://github.com/AztecProtocol/aztec-packages/issues/10216))\r\n([01eb392](https://github.com/AztecProtocol/aztec-packages/commit/01eb392f15995f344e40aa8f8e41a28f6f5b825d))\r\n* Integrate fee into rollup\r\n([#10176](https://github.com/AztecProtocol/aztec-packages/issues/10176))\r\n([12744d6](https://github.com/AztecProtocol/aztec-packages/commit/12744d6bd9ca6f4c4c1ef43ddd919e81cffb7a17))\r\n* Speed up transaction execution\r\n([#10172](https://github.com/AztecProtocol/aztec-packages/issues/10172))\r\n([da265b6](https://github.com/AztecProtocol/aztec-packages/commit/da265b6b7d61a0d991fa23bd044f711513a0e86c))\r\n* Using current gas prices in cli-wallet\r\n([#10105](https://github.com/AztecProtocol/aztec-packages/issues/10105))\r\n([15ffeea](https://github.com/AztecProtocol/aztec-packages/commit/15ffeea8ef47b619f9922793be7e3380964297a3))\r\n\r\n\r\n### Bug Fixes\r\n\r\n* Add pako as a dependency in bb.js\r\n([#10186](https://github.com/AztecProtocol/aztec-packages/issues/10186))\r\n([b773c14](https://github.com/AztecProtocol/aztec-packages/commit/b773c14a8fe8bf425dc755b3a156e500e9924c1e))\r\n* **avm:** Execution test ordering\r\n([#10226](https://github.com/AztecProtocol/aztec-packages/issues/10226))\r\n([49b4a6c](https://github.com/AztecProtocol/aztec-packages/commit/49b4a6c07f39711ad2a0477e1fad11e11b8ee23c))\r\n* Deploy preview master\r\n([#10227](https://github.com/AztecProtocol/aztec-packages/issues/10227))\r\n([321a175](https://github.com/AztecProtocol/aztec-packages/commit/321a17531eb5d440f2726ff32bc6e157a732a8ed))\r\n* Use current base fee for public fee payment\r\n([#10230](https://github.com/AztecProtocol/aztec-packages/issues/10230))\r\n([f081d80](https://github.com/AztecProtocol/aztec-packages/commit/f081d8013ce37a2109750424d1ed615411d9056a))\r\n\r\n\r\n### Miscellaneous\r\n\r\n* Add traces and histograms to avm simulator\r\n([#10233](https://github.com/AztecProtocol/aztec-packages/issues/10233))\r\n([e83726d](https://github.com/AztecProtocol/aztec-packages/commit/e83726dddbc7ea98c86b99a7439e39f076a63b25)),\r\ncloses\r\n[#10146](https://github.com/AztecProtocol/aztec-packages/issues/10146)\r\n* Avm-proving and avm-integration tests do not require simulator to\r\nexport function with jest mocks\r\n([#10228](https://github.com/AztecProtocol/aztec-packages/issues/10228))\r\n([f28fcdb](https://github.com/AztecProtocol/aztec-packages/commit/f28fcdb1e41aa353f0fdc2233ea66ae51ef745a4))\r\n* **avm:** Handle parsing error\r\n([#10203](https://github.com/AztecProtocol/aztec-packages/issues/10203))\r\n([3c623fc](https://github.com/AztecProtocol/aztec-packages/commit/3c623fc2d857d6792b557dc7d1ccb929274046bb)),\r\ncloses\r\n[#9770](https://github.com/AztecProtocol/aztec-packages/issues/9770)\r\n* **avm:** Zero initialization in avm public inputs and execution test\r\nfixes\r\n([#10238](https://github.com/AztecProtocol/aztec-packages/issues/10238))\r\n([0c7c4c9](https://github.com/AztecProtocol/aztec-packages/commit/0c7c4c9bb0c01067abe57ccd06962d71c7279aa0))\r\n* Bump timeout for after-hook for data store test again\r\n([#10240](https://github.com/AztecProtocol/aztec-packages/issues/10240))\r\n([52047f0](https://github.com/AztecProtocol/aztec-packages/commit/52047f05495ef95a778e8669fc4e115cacb590a0))\r\n* CIVC VK\r\n([#10223](https://github.com/AztecProtocol/aztec-packages/issues/10223))\r\n([089c34c](https://github.com/AztecProtocol/aztec-packages/commit/089c34cc3e9fb5cb493096246525c2205e646204))\r\n* Declare global types\r\n([#10206](https://github.com/AztecProtocol/aztec-packages/issues/10206))\r\n([7b2e343](https://github.com/AztecProtocol/aztec-packages/commit/7b2e343a61eb9c74f365758530deca87b40891d0))\r\n* Delete old serialization methods\r\n([#9951](https://github.com/AztecProtocol/aztec-packages/issues/9951))\r\n([10d3f6f](https://github.com/AztecProtocol/aztec-packages/commit/10d3f6fe851dc73f5f12edec26b028fe526f0be6))\r\n* Fix migration notes\r\n([#10252](https://github.com/AztecProtocol/aztec-packages/issues/10252))\r\n([05bdcd5](https://github.com/AztecProtocol/aztec-packages/commit/05bdcd51d45f35a3ed683c1a90bb8e9370533fb0))\r\n* Pull out some sync changes\r\n([#10245](https://github.com/AztecProtocol/aztec-packages/issues/10245))\r\n([1bfc15e](https://github.com/AztecProtocol/aztec-packages/commit/1bfc15e08873a1f0f3743e259f418b70426b3f25))\r\n* Remove docs from sync\r\n([#10241](https://github.com/AztecProtocol/aztec-packages/issues/10241))\r\n([eeea0aa](https://github.com/AztecProtocol/aztec-packages/commit/eeea0aade045bfba73ee1e6458d5815163f55dd6))\r\n* Replace relative paths to noir-protocol-circuits\r\n([e7690ca](https://github.com/AztecProtocol/aztec-packages/commit/e7690ca2e441ca71f8a02d39ed5fb2c7e9ba533d))\r\n</details>\r\n\r\n<details><summary>barretenberg: 0.65.1</summary>\r\n\r\n##\r\n[0.65.1](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.65.0...barretenberg-v0.65.1)\r\n(2024-11-27)\r\n\r\n\r\n### Features\r\n\r\n* Add total mana used to header\r\n([#9868](https://github.com/AztecProtocol/aztec-packages/issues/9868))\r\n([2478d19](https://github.com/AztecProtocol/aztec-packages/commit/2478d1909db2d79cc0cdd3063dc2ac4e1eaedce3))\r\n* Configure world state block history\r\n([#10216](https://github.com/AztecProtocol/aztec-packages/issues/10216))\r\n([01eb392](https://github.com/AztecProtocol/aztec-packages/commit/01eb392f15995f344e40aa8f8e41a28f6f5b825d))\r\n* Speed up transaction execution\r\n([#10172](https://github.com/AztecProtocol/aztec-packages/issues/10172))\r\n([da265b6](https://github.com/AztecProtocol/aztec-packages/commit/da265b6b7d61a0d991fa23bd044f711513a0e86c))\r\n\r\n\r\n### Bug Fixes\r\n\r\n* **avm:** Execution test ordering\r\n([#10226](https://github.com/AztecProtocol/aztec-packages/issues/10226))\r\n([49b4a6c](https://github.com/AztecProtocol/aztec-packages/commit/49b4a6c07f39711ad2a0477e1fad11e11b8ee23c))\r\n\r\n\r\n### Miscellaneous\r\n\r\n* **avm:** Handle parsing error\r\n([#10203](https://github.com/AztecProtocol/aztec-packages/issues/10203))\r\n([3c623fc](https://github.com/AztecProtocol/aztec-packages/commit/3c623fc2d857d6792b557dc7d1ccb929274046bb)),\r\ncloses\r\n[#9770](https://github.com/AztecProtocol/aztec-packages/issues/9770)\r\n* **avm:** Zero initialization in avm public inputs and execution test\r\nfixes\r\n([#10238](https://github.com/AztecProtocol/aztec-packages/issues/10238))\r\n([0c7c4c9](https://github.com/AztecProtocol/aztec-packages/commit/0c7c4c9bb0c01067abe57ccd06962d71c7279aa0))\r\n* CIVC VK\r\n([#10223](https://github.com/AztecProtocol/aztec-packages/issues/10223))\r\n([089c34c](https://github.com/AztecProtocol/aztec-packages/commit/089c34cc3e9fb5cb493096246525c2205e646204))\r\n* Pull out some sync changes\r\n([#10245](https://github.com/AztecProtocol/aztec-packages/issues/10245))\r\n([1bfc15e](https://github.com/AztecProtocol/aztec-packages/commit/1bfc15e08873a1f0f3743e259f418b70426b3f25))\r\n</details>\r\n\r\n---\r\nThis PR was generated with [Release\r\nPlease](https://github.com/googleapis/release-please). See\r\n[documentation](https://github.com/googleapis/release-please#release-please).",
          "timestamp": "2024-11-27T19:04:31Z",
          "tree_id": "d0e12206481bc20e591a5652787494c76c862622",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/62fc9175019cb5f3fabca1a5f5ff9e04d708695e"
        },
        "date": 1732735724917,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 27854.885658,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 26376.737892 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5002.223991000008,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4700.498326000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 83821.16596299999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 83821166000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15131.392319999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15131392000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3072156120,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3072156120 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 140666464,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 140666464 ns\nthreads: 1"
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
          "id": "b7b282cd0fb306abbe3951a55a1a4f4d42ed7f8e",
          "message": "feat: swap polys to facilitate dynamic trace overflow (#9976)\n\nUpdate PG/ClientIvc so that during accumulation we can handle a circuit\r\nthat overflows the nominal structured trace (and potentially increases\r\nthe dyadic size of the accumulator) without knowing about the size of\r\nthe overflow in advance. (A previous PR makes it possible to overflow\r\narbitrarily as long as ClientIvc is initialized with the proper overflow\r\ncapacity). Ensure the ExecutionTraceTracker is updated correctly when\r\nencountering a circuit that overflows and also ensure that the tracker\r\nis used appropriately in Protogalaxy.\r\n\r\n---------\r\n\r\nCo-authored-by: maramihali <mara@aztecprotocol.com>",
          "timestamp": "2024-11-27T15:22:09-05:00",
          "tree_id": "eca71991eb4839e20ba88bebde59fac32583d695",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/b7b282cd0fb306abbe3951a55a1a4f4d42ed7f8e"
        },
        "date": 1732741468619,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28225.632292000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 26587.677380999998 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5020.246728000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4673.310028999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 84009.54356300001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 84009544000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15132.574935999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15132576000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3076078674,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3076078674 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 139484576,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 139484576 ns\nthreads: 1"
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
          "id": "3392629818e6d51c01ca4c75c1ad916bb4b4fdb1",
          "message": "chore: pull value merger code from sync (#10080)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\r\nline.",
          "timestamp": "2024-11-28T00:50:04+01:00",
          "tree_id": "63bc4ce36fecc25022468f8af611f5da4fa1bdef",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/3392629818e6d51c01ca4c75c1ad916bb4b4fdb1"
        },
        "date": 1732752846095,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28363.431515000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 26635.272279999997 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5137.387709999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4756.1121969999995 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 84213.797103,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 84213798000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15233.782082000003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15233783000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3104842302,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3104842302 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 140566137,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 140566137 ns\nthreads: 1"
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
          "id": "bfd9fa68be4147acb3e3feeaf83ed3c9247761be",
          "message": "feat: Sequential insertion in indexed trees (#10111)\n\n- Adds sequential (no subtree) insertion in indexed trees\r\n- If witnesses are requested, the response includes 2*N witnesses, N for\r\nthe low leaves and N for the insertions\r\n   - If no witness is requested, it directly does sparse_batch_update\r\n   - Updating an item multiple times in the same call is allowed\r\n- Uses sequential insertion with witnesses to avoid doing N batch\r\nupdates of 1 item for the base rollup\r\n- Uses sequential insertion without witnesses for syncing the public\r\ndata tree, to avoid doing 1 batch insertion per TX in the block",
          "timestamp": "2024-11-28T14:02:54Z",
          "tree_id": "defc9c4f062e912d3f8eb7ab58ae7482928cce54",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/bfd9fa68be4147acb3e3feeaf83ed3c9247761be"
        },
        "date": 1732804028018,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28153.127274000013,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 26537.149002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5038.755413000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4631.034165 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 84192.29212700001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 84192293000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15156.366907,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15156368000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3080859077,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3080859077 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 139642057,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 139642057 ns\nthreads: 1"
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
          "id": "c22be8b23e6d16cf4a60509494b979c3edfdba9b",
          "message": "fix: Don't store indices of zero leaves. (#10270)\n\nThis PR ensures we don't store indices of zero leaves as this could be\r\nmisleading. Requesting the index of a zero leaf is deemed invalid.\r\n\r\nIt also adds tests that ensure we can unwind blocks of zero leaves",
          "timestamp": "2024-11-28T14:22:54Z",
          "tree_id": "e2e218a7dde2adc2d1a8f08c848f0235e80a1b93",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c22be8b23e6d16cf4a60509494b979c3edfdba9b"
        },
        "date": 1732805781859,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28077.81052499999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 26478.350335 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4994.416454999992,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4641.7432229999995 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 83494.305385,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 83494306000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15162.920884,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15162922000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3065184537,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3065184537 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 139364858,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 139364858 ns\nthreads: 1"
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
          "id": "34372f13c6083befb1dfd07a2d99ea07b166b398",
          "message": "chore(master): Release 0.65.2",
          "timestamp": "2024-11-28T15:22:57Z",
          "url": "https://github.com/AztecProtocol/aztec-packages/pull/10258/commits/34372f13c6083befb1dfd07a2d99ea07b166b398"
        },
        "date": 1732808602046,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28226.71693699999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 26671.284782000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5122.234616,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4757.604875999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 84324.61404100001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 84324615000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15235.193823,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15235195000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3096213748,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3096213748 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 140131794,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 140131794 ns\nthreads: 1"
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
          "id": "10754db0e6626047d4fc59cd0d7bbb320606152a",
          "message": "chore(master): Release 0.65.2 (#10258)\n\n:robot: I have created a release *beep* *boop*\r\n---\r\n\r\n\r\n<details><summary>aztec-package: 0.65.2</summary>\r\n\r\n##\r\n[0.65.2](https://github.com/AztecProtocol/aztec-packages/compare/aztec-package-v0.65.1...aztec-package-v0.65.2)\r\n(2024-11-28)\r\n\r\n\r\n### Features\r\n\r\n* New proving broker\r\n([#10174](https://github.com/AztecProtocol/aztec-packages/issues/10174))\r\n([6fd5fc1](https://github.com/AztecProtocol/aztec-packages/commit/6fd5fc18bd973b539fb9edfb372181fbe4617f75))\r\n</details>\r\n\r\n<details><summary>barretenberg.js: 0.65.2</summary>\r\n\r\n##\r\n[0.65.2](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg.js-v0.65.1...barretenberg.js-v0.65.2)\r\n(2024-11-28)\r\n\r\n\r\n### Miscellaneous\r\n\r\n* **barretenberg.js:** Synchronize aztec-packages versions\r\n</details>\r\n\r\n<details><summary>aztec-packages: 0.65.2</summary>\r\n\r\n##\r\n[0.65.2](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.65.1...aztec-packages-v0.65.2)\r\n(2024-11-28)\r\n\r\n\r\n### Features\r\n\r\n* Fee foresight support\r\n([#10262](https://github.com/AztecProtocol/aztec-packages/issues/10262))\r\n([9e19244](https://github.com/AztecProtocol/aztec-packages/commit/9e19244c01440ce7900ba91c0557567e57f017a0))\r\n* New proving broker\r\n([#10174](https://github.com/AztecProtocol/aztec-packages/issues/10174))\r\n([6fd5fc1](https://github.com/AztecProtocol/aztec-packages/commit/6fd5fc18bd973b539fb9edfb372181fbe4617f75))\r\n* Sequential insertion in indexed trees\r\n([#10111](https://github.com/AztecProtocol/aztec-packages/issues/10111))\r\n([bfd9fa6](https://github.com/AztecProtocol/aztec-packages/commit/bfd9fa68be4147acb3e3feeaf83ed3c9247761be))\r\n* Swap polys to facilitate dynamic trace overflow\r\n([#9976](https://github.com/AztecProtocol/aztec-packages/issues/9976))\r\n([b7b282c](https://github.com/AztecProtocol/aztec-packages/commit/b7b282cd0fb306abbe3951a55a1a4f4d42ed7f8e))\r\n\r\n\r\n### Bug Fixes\r\n\r\n* Don't store indices of zero leaves.\r\n([#10270](https://github.com/AztecProtocol/aztec-packages/issues/10270))\r\n([c22be8b](https://github.com/AztecProtocol/aztec-packages/commit/c22be8b23e6d16cf4a60509494b979c3edfdba9b))\r\n* Expect proper duplicate nullifier error patterns in e2e tests\r\n([#10256](https://github.com/AztecProtocol/aztec-packages/issues/10256))\r\n([4ee8344](https://github.com/AztecProtocol/aztec-packages/commit/4ee83448a24be1944ca8c71d42ae8aa15049af10))\r\n\r\n\r\n### Miscellaneous\r\n\r\n* Check artifact consistency\r\n([#10271](https://github.com/AztecProtocol/aztec-packages/issues/10271))\r\n([6a49405](https://github.com/AztecProtocol/aztec-packages/commit/6a494050f85510c18870117f376280d8e10ed486))\r\n* Dont import things that themselves import jest in imported functions\r\n([#10260](https://github.com/AztecProtocol/aztec-packages/issues/10260))\r\n([9440c1c](https://github.com/AztecProtocol/aztec-packages/commit/9440c1cf3834eea380014d55eef6e81cff8ffee8))\r\n* Fix bad merge in integration l1 publisher\r\n([#10272](https://github.com/AztecProtocol/aztec-packages/issues/10272))\r\n([b5a6aa4](https://github.com/AztecProtocol/aztec-packages/commit/b5a6aa4ce51a27b220162d48ba065a0077b9fcd8))\r\n* Fixing sol warnings\r\n([#10276](https://github.com/AztecProtocol/aztec-packages/issues/10276))\r\n([3d113b2](https://github.com/AztecProtocol/aztec-packages/commit/3d113b212b4641b2a97e6b2b0b4835908f3957c8))\r\n* Pull out sync changes\r\n([#10274](https://github.com/AztecProtocol/aztec-packages/issues/10274))\r\n([391a6b7](https://github.com/AztecProtocol/aztec-packages/commit/391a6b7377a5253f2c47fa5ec949f255b284da00))\r\n* Pull value merger code from sync\r\n([#10080](https://github.com/AztecProtocol/aztec-packages/issues/10080))\r\n([3392629](https://github.com/AztecProtocol/aztec-packages/commit/3392629818e6d51c01ca4c75c1ad916bb4b4fdb1))\r\n* Remove default gas settings\r\n([#10163](https://github.com/AztecProtocol/aztec-packages/issues/10163))\r\n([c9a4d88](https://github.com/AztecProtocol/aztec-packages/commit/c9a4d88b15c320e6cc6d79e0721d0f4062d2d840))\r\n* Replace relative paths to noir-protocol-circuits\r\n([654d801](https://github.com/AztecProtocol/aztec-packages/commit/654d801dc762ce69589a300ef6a2d8fe590527a8))\r\n* Teardown context in prover coordination test\r\n([#10257](https://github.com/AztecProtocol/aztec-packages/issues/10257))\r\n([7ea3888](https://github.com/AztecProtocol/aztec-packages/commit/7ea38887e514a4bbdc7ff847efe19bd2d1b74baf))\r\n</details>\r\n\r\n<details><summary>barretenberg: 0.65.2</summary>\r\n\r\n##\r\n[0.65.2](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.65.1...barretenberg-v0.65.2)\r\n(2024-11-28)\r\n\r\n\r\n### Features\r\n\r\n* Sequential insertion in indexed trees\r\n([#10111](https://github.com/AztecProtocol/aztec-packages/issues/10111))\r\n([bfd9fa6](https://github.com/AztecProtocol/aztec-packages/commit/bfd9fa68be4147acb3e3feeaf83ed3c9247761be))\r\n* Swap polys to facilitate dynamic trace overflow\r\n([#9976](https://github.com/AztecProtocol/aztec-packages/issues/9976))\r\n([b7b282c](https://github.com/AztecProtocol/aztec-packages/commit/b7b282cd0fb306abbe3951a55a1a4f4d42ed7f8e))\r\n\r\n\r\n### Bug Fixes\r\n\r\n* Don't store indices of zero leaves.\r\n([#10270](https://github.com/AztecProtocol/aztec-packages/issues/10270))\r\n([c22be8b](https://github.com/AztecProtocol/aztec-packages/commit/c22be8b23e6d16cf4a60509494b979c3edfdba9b))\r\n\r\n\r\n### Miscellaneous\r\n\r\n* Pull value merger code from sync\r\n([#10080](https://github.com/AztecProtocol/aztec-packages/issues/10080))\r\n([3392629](https://github.com/AztecProtocol/aztec-packages/commit/3392629818e6d51c01ca4c75c1ad916bb4b4fdb1))\r\n</details>\r\n\r\n---\r\nThis PR was generated with [Release\r\nPlease](https://github.com/googleapis/release-please). See\r\n[documentation](https://github.com/googleapis/release-please#release-please).",
          "timestamp": "2024-11-28T10:22:53-05:00",
          "tree_id": "75a12e8a612674cd7cbd7c42119371605cd4124e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/10754db0e6626047d4fc59cd0d7bbb320606152a"
        },
        "date": 1732808740469,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28274.836461999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 26665.580315 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5034.530501999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4673.489594999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 84250.902544,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 84250903000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15184.186199,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15184187000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3057541936,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3057541936 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 140326283,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 140326283 ns\nthreads: 1"
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
          "id": "0311bf333acb2def3be1373b36514b99b132623a",
          "message": "chore: Public inputs in unit tests with proving were incorrectly set (#10300)",
          "timestamp": "2024-11-29T13:19:48Z",
          "tree_id": "819212f2a4a91c49009daf55447970a26ad28fb5",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0311bf333acb2def3be1373b36514b99b132623a"
        },
        "date": 1732888868492,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 27269.089281000022,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 25231.633902999998 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4584.776615999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4298.010478 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 87862.19409100001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 87862194000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 16499.810913,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16499812000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3040071696,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3040071696 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 134229535,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 134229535 ns\nthreads: 1"
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
          "id": "ba335bdff645398d20241ce7baab02f63b20f55c",
          "message": "chore: Parallelise construction of perturbator coefficients at each level (#10304)\n\nWhen constructing the perturbator via the tree technique we can\r\nparallelise the construction of the coefficients at each level which is\r\none of the culprits of performance degrading when using an ambient trace\r\nof size 2^20. We see a ~1s improvement in performance doing this.\r\n\r\n2^20 trace (`EXAMPLE_20`) in master for `ClientIVCBench/Full/6` was\r\n`38114 ms` and is now `37310 ms`. For the defacto\r\n`CLIENT_IVC_BENCH_STRUCTURE` which gives 2^19 finalised circuits we go\r\nfrom `29496ms` to `29188 ms` so not as impactful but also the\r\nperformance doesn't degrade.\r\n\r\nI have also benchmarked the actual computation of coefficients and it is\r\nneglegible regardless of the ambient trace size (2^20 vs 2^19) .",
          "timestamp": "2024-11-29T13:31:09Z",
          "tree_id": "1610bbe9ced2c2d5867cb228187bec0aefc3960f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ba335bdff645398d20241ce7baab02f63b20f55c"
        },
        "date": 1732889932004,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28024.471804,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 26021.440359 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4687.344296999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4385.659062000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 95384.399199,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 95384400000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 16740.872949,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16740873000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3091390860,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3091390860 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 136304615,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 136304615 ns\nthreads: 1"
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
          "id": "5a04ca880ae2a0f285b6a5a110286ba10bc4a6c3",
          "message": "feat: Avoid inserting an empty leaf in indexed trees on update (#10281)\n\nPreviously, we were always appending an empty leaf when we encountered\r\nan update in the public data tree. After this PR public data tree\r\ninsertions don't add an empty leaf when the write is an update.",
          "timestamp": "2024-11-29T17:45:39+01:00",
          "tree_id": "2f47d10fb913d917be8d1325613d967cc661325a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5a04ca880ae2a0f285b6a5a110286ba10bc4a6c3"
        },
        "date": 1732900908817,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 27109.017248000015,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 25232.662169 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4595.447338,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4294.366223999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 91516.73673100001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 91516736000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 16542.535683000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16542537000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3038863907,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3038863907 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 133489523,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 133489523 ns\nthreads: 1"
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
          "id": "887c01103255ea4cbbb6cb33c8771d47123b3bff",
          "message": "fix: Revert \"feat: Avoid inserting an empty leaf in indexed trees on update\" (#10319)\n\nBroke kind tests. Reverts AztecProtocol/aztec-packages#10281",
          "timestamp": "2024-11-29T14:49:44-05:00",
          "tree_id": "78051fac3fcc61be957804da1d2efd108f6cc97a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/887c01103255ea4cbbb6cb33c8771d47123b3bff"
        },
        "date": 1732912388360,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 27083.93215999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 25000.168543999996 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4583.430852999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4313.663856 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 92685.02027400001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 92685021000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 16496.052567,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16496053000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3032242338,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3032242338 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 133738848,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 133738848 ns\nthreads: 1"
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
          "id": "cf05a7a346ea11853e940d5e9ac105ef0d629d35",
          "message": "feat: Allow querying block number for tree indices (#10332)\n\nThis PR make the following changes.\r\n\r\n1. Captures and propagates more of the errors generated in the merkle\r\ntrees out to the TS interface.\r\n2. Introduces the `block_number_t` typedef within the native world\r\nstate.\r\n3. Introduces a new DB in the native world state. This DB maps block\r\nnumbers to the size of the tree at that block. It then uses this DB to\r\nfulfill queries looking to identify which block given notes were\r\nincluded within.",
          "timestamp": "2024-12-02T14:27:20Z",
          "tree_id": "c8522bb2cc4539932198c8940c2fa75549ec551e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/cf05a7a346ea11853e940d5e9ac105ef0d629d35"
        },
        "date": 1733151370444,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28045.361946000015,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 26377.061908 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5038.110503999988,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4704.827921 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 85570.86460399999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 85570865000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15154.101198999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15154102000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3062933694,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3062933694 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 140911800,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 140911800 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "159419107+DanielKotov@users.noreply.github.com",
            "name": "DanielKotov",
            "username": "DanielKotov"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "4a38edfc1580aa1cb5113993ff8a2e5574076226",
          "message": "fix: witness changes in file sponge.hpp (#10345)\n\nStatic analyzer found that initial values in cache and state arrays\r\nweren't properly constrained. Initially state fill in 0 + iv value, but\r\nthese values weren't constrained as witnesses.\r\n\r\nWe replaced witness_t constructor with function create_constant_witness\r\nfrom class witness_t in file sponge.hpp.\r\n\r\nAll tests for poseidon2s passed after fix.",
          "timestamp": "2024-12-02T20:44:53+03:00",
          "tree_id": "d0444278f60e51a3c5ef6cedd929b8c3404e4878",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/4a38edfc1580aa1cb5113993ff8a2e5574076226"
        },
        "date": 1733165442826,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28206.610216,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 26382.913040000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5030.539386000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4615.324457 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 85472.53586,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 85472536000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15179.204237999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15179205000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3074885816,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3074885816 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 140784160,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 140784160 ns\nthreads: 1"
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
          "id": "c53f4cf84c60b8d81cc62d5827ec4408da88cc4e",
          "message": "feat: ultra rollup flows (#10162)\n\nAdds new flows to bb main for UltraRollupFlavor. Modifies honk recursion\r\nconstraint to be able to extract IPA claims and call accumulate on them.\r\n\r\ncloses https://github.com/AztecProtocol/barretenberg/issues/1153",
          "timestamp": "2024-12-02T12:53:55-05:00",
          "tree_id": "ad071125ed40edacc4aba31401d375fcf57cf9d2",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c53f4cf84c60b8d81cc62d5827ec4408da88cc4e"
        },
        "date": 1733166526793,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28043.348758999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 26374.351862 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5012.645554999992,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4664.723404 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 86346.74977799998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 86346750000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15139.722934000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15139723000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3053741206,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3053741206 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 141150427,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 141150427 ns\nthreads: 1"
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
          "id": "80fad4544a4d8c1b488f8b4b4f86fe508ed1f4cc",
          "message": "feat: Avoid inserting an empty leaf in indexed trees on update (#10334)\n\nFix network kind tests",
          "timestamp": "2024-12-03T10:18:02Z",
          "tree_id": "a6a0b0906d50a085855638493b15343206c6b4cb",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/80fad4544a4d8c1b488f8b4b4f86fe508ed1f4cc"
        },
        "date": 1733222571121,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28319.304727999992,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 26620.616363 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5016.4591000000055,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4730.0535740000005 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 87602.68474099999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 87602685000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15222.555528,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15222556000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3061636169,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3061636169 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 140433347,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 140433347 ns\nthreads: 1"
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
          "id": "0d1b722ef7fdc501ca78cfca8f46009a29504c8f",
          "message": "chore: redo typo PR by leopardracer (#10363)\n\nThanks leopardracer for\r\nhttps://github.com/AztecProtocol/aztec-packages/pull/9697. Our policy is\r\nto redo typo changes to dissuade metric farming. This is an automated\r\nscript.",
          "timestamp": "2024-12-03T11:37:48Z",
          "tree_id": "f187950692b5c8c78fb7f0eb455ddb107298f2d3",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0d1b722ef7fdc501ca78cfca8f46009a29504c8f"
        },
        "date": 1733227262865,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28199.36169500002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 26392.883146 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5038.348471999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4743.176674000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 85801.383808,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 85801384000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15111.3174,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15111318000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3054275815,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3054275815 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 140973381,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 140973381 ns\nthreads: 1"
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
          "id": "cc54a1e1ef75b29d160a02d03cf9b29e28d3e4ca",
          "message": "feat: Client IVC API (#10217)\n\n- Establish API in purely virtual class\r\n- This is just a first pass. I will continue to work on this before\r\nshowing dev rel and others to get buy-in.\r\n- Implement some API functions for ClientIVC: prove, verify,\r\nprove_and_verify\r\n- Support for constructing CIVC proof for input a single circuit\r\n  - This is interpreted as a \"compiletime stack\"\r\n- Produces ECCVM and Translator proofs from dummy/empty data; future\r\noptimization could avoid.\r\n- Add `one_circuit` to CIVC to encode whether the MH part of the CIVC\r\nproof should be a hiding circuit (which takes a folding proof) or a\r\nproof for the single circuit.\r\n- Run almost all ACIR tests against ClientIVC\r\n- Previously only ran MegaHonk tests, which are not totally meaningful.\r\n- Four are skipped because they fail. These failures are expected to be\r\nsuperficial (see\r\nhttps://github.com/AztecProtocol/barretenberg/issues/1164 and the\r\nreferences to it in the PR's new code).\r\n- fold_and_verify and mega honk flows go away in bb, but remain until\r\nbb.js alignment.\r\n- Delete large log file that should not be track (accounts for big\r\nnegative diff).",
          "timestamp": "2024-12-03T09:18:40-05:00",
          "tree_id": "fd1f89f19c186899ac0b6dff4a4554775b7c33c4",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/cc54a1e1ef75b29d160a02d03cf9b29e28d3e4ca"
        },
        "date": 1733237970951,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28037.81463200002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 26323.953417999997 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5009.527340000005,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4690.045214000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 86074.169488,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 86074170000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15090.203081,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15090204000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3046228577,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3046228577 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 140944710,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 140944710 ns\nthreads: 1"
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
          "id": "da809c58290f9590836f45ec59376cbf04d3c4ce",
          "message": "chore: redo typo PR by Dimitrolito (#10364)\n\nThanks Dimitrolito for\r\nhttps://github.com/AztecProtocol/aztec-packages/pull/10171. Our policy\r\nis to redo typo changes to dissuade metric farming. This is an automated\r\nscript.",
          "timestamp": "2024-12-03T15:44:23Z",
          "tree_id": "658c8b5666b1ec68d21e7a99d246ba086817a1e9",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/da809c58290f9590836f45ec59376cbf04d3c4ce"
        },
        "date": 1733242479351,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28077.23477799999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 26508.392528 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5041.33717900001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4700.703569000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 86147.2139,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 86147214000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15199.769935000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15199770000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3063815423,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3063815423 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 140592705,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 140592705 ns\nthreads: 1"
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
          "id": "ac7c0da38ff05d6f11c4d6a6244c4526ac00232e",
          "message": "feat: mock IVC state from arbitrary acir IVC recursion constraints (#10314)\n\nGenerating a bberg kernel circuit from a noir kernel program represented\r\nas acir requires an IVC instance containing certain state including a\r\nverifier accumulator and verification queue containing proofs/VKs for\r\ninput to recursive verifiers. In the context of a write_vk flow, this\r\ndata is not known and must be mocked so that the recursive verifiers in\r\nthe kernel can be constructed properly. (Similar to how we construct a\r\ndummy proof to generate a Honk recursive verifier).\r\n\r\nThe main method in this PR is `create_mock_ivc_from_constraints()` which\r\nconstructs an IVC instance with mocked state based on the IVC recursion\r\nconstraints present in the acir data. For example, if there are two PG\r\nrecursive verifications in the constraint system, we must generate two\r\nmocked PG proofs plus some other auxiliary data.\r\n\r\nSo no actual write_vk flow exists but the logic is tested though the\r\n`IvcRecursionConstraintTest` suite which constructs VKs from programs\r\ncontaining each of the 3 different possible combinations of IVC\r\nrecursion constraints that appear in Aztec kernel circuits. (These are:\r\n(a) 1 Oink recursive verification (init kernel), (b) 1 PG recursive\r\nverification (reset or tail kernel), and (c) 2 PG recursive\r\nverifications (inner kernel)).",
          "timestamp": "2024-12-03T11:50:53-07:00",
          "tree_id": "9835e31dcba1d81f93920cded826facf31b0cea1",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ac7c0da38ff05d6f11c4d6a6244c4526ac00232e"
        },
        "date": 1733254346529,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28276.316141999985,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 26358.961927 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5117.060768000016,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4738.289079 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 86761.711741,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 86761713000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15287.610942,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15287611000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3122349811,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3122349811 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 143279314,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 143279314 ns\nthreads: 1"
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
          "id": "93cd323e493118ce91097934216a364855a991db",
          "message": "chore!: remove SchnorrVerify opcode (#9897)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\r\nline.",
          "timestamp": "2024-12-03T18:59:53Z",
          "tree_id": "797ce26600894a36e5f454a0505359e4346927be",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/93cd323e493118ce91097934216a364855a991db"
        },
        "date": 1733255434404,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28255.152562000007,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 26595.755121 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5089.471339000013,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4706.901985000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 85745.93753099999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 85745937000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15183.608444,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15183609000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3071871459,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3071871459 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 141991981,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 141991981 ns\nthreads: 1"
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
          "id": "a1e5966ffe98351d848bfa47608a2f22c381acfb",
          "message": "chore(avm): Fake verification routine for avm recursion in public base rollup (#10382)\n\nResolves #10243",
          "timestamp": "2024-12-04T15:14:40+01:00",
          "tree_id": "df55ccdacab4a5a11448ba0c2a7f24f034773e7d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a1e5966ffe98351d848bfa47608a2f22c381acfb"
        },
        "date": 1733323524506,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28253.117745999985,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 26532.772844 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5041.187059999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4715.030212000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 86911.401326,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 86911402000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15144.797168000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15144798000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3151999153,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3151999153 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 140944261,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 140944261 ns\nthreads: 1"
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
          "id": "427cf594ec9ca4b472ec5d4a249c7b49805c78e2",
          "message": "chore: parallelise inverse polynomial construction for lookup relations (#10413)\n\nBenchmark were showing that oink is the second most expensive round in\r\nPG after combiner. On top of that one component where we see\r\ndiscrepancies when increasing the ambient trace size is logderivative\r\ninverses construction. A step towards improving this is parallelising\r\nthe construction of inverse polynomials (which is linear). Also the\r\ninverses can be committed to with `commit_sparse` which shows a slight\r\nimprovement as well.\r\nBEFORE\r\n```\r\nCLIENT_IVC_BENCH_STRUCTURE(2^19)\r\n\r\nClientIVCBench/Full/6      29146 ms        27299 ms\r\nProtogalaxyProver::prove(t)            16265    58.29%\r\nProtogalaxyProver_::run_oink_prover_on_each_incomplete_key(t)    5624    34.58%\r\n\r\n\r\nEXAMPLE_20(2^20)\r\n\r\nClientIVCBench/Full/6      37145 ms        34235 ms\r\nProtogalaxyProver::prove(t)            21283    60.75%\r\nProtogalaxyProver_::run_oink_prover_on_each_incomplete_key(t)    8818    41.43%\r\nCOMMIT::lookup_inverses(t)        406     9.82%\r\n```\r\n\r\nAFTER\r\n```\r\nCLIENT_IVC_BENCH_STRUCTURE(2^19)\r\n\r\nClientIVCBench/Full/6      27351 ms        25477 ms \r\nProtogalaxyProver::prove(t)            14627    55.72%\r\nProtogalaxyProver_::run_oink_prover_on_each_incomplete_key(t)    4030    27.55%\r\n\r\n\r\nEXAMPLE_20(2^20)\r\nClientIVCBench/Full/6      33852 ms        30893 ms   \r\nProtogalaxyProver::prove(t)            18250    56.97%\r\nProtogalaxyProver_::run_oink_prover_on_each_incomplete_key(t)    5526    30.28%\r\nCOMMIT::lookup_inverses(t)        301     7.43%\r\n```",
          "timestamp": "2024-12-05T12:15:35Z",
          "tree_id": "1e148d2fba9c8aea7b0a4ace84927fd45f915316",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/427cf594ec9ca4b472ec5d4a249c7b49805c78e2"
        },
        "date": 1733404399309,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 25513.040267999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 23644.438496 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4582.814206000009,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4319.2583030000005 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 91484.2179,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 91484218000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 16490.637163,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16490638000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2819528647,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2819528647 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 136637592,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 136637592 ns\nthreads: 1"
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
          "id": "7ed89aaa9d0968af6334c1c8abf6c06a42754c52",
          "message": "feat: Integrate verify_proof calls in mock protocol circuits (#9253)\n\nIntegrates `verify_proof` calls into the mock kernels in the IVC\r\nintegration suite. VKs are computed using a new `write_vk_for_ivc` flow.\r\n\r\n---------\r\n\r\nCo-authored-by: ledwards2225 <l.edwards.d@gmail.com>",
          "timestamp": "2024-12-05T07:29:08-07:00",
          "tree_id": "797ebc8d7c7d86b831bcdb0f59ce6ee3573716ed",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7ed89aaa9d0968af6334c1c8abf6c06a42754c52"
        },
        "date": 1733411987048,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 25636.434116000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 23776.302220999998 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4626.7122279999885,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4309.831836 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 89467.156511,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 89467158000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 16541.559909,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16541561000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2841648049,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2841648049 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 136619531,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 136619531 ns\nthreads: 1"
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
          "id": "c00ebdd60373aa579587b03eeb4b44ada0bb1155",
          "message": "chore: Don't generate proofs of verifier circuits in test (#10405)\n\nTo test circuit logic we don't need to generate proofs. Running the\r\ncircuit checker is much faster and more memory efficient.",
          "timestamp": "2024-12-05T17:57:13-05:00",
          "tree_id": "e94aaf1fa39980a216322498a3bdbbd07e09f686",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c00ebdd60373aa579587b03eeb4b44ada0bb1155"
        },
        "date": 1733442134012,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 26150.069204999993,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 23990.022216 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5112.618403999988,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4769.290175 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 86459.831842,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 86459832000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15274.610086999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15274610000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2907878008,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2907878008 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 147869487,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 147869487 ns\nthreads: 1"
          }
        ]
      }
    ]
  }
}