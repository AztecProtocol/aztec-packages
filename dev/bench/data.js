window.BENCHMARK_DATA = {
  "lastUpdate": 1728509902429,
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
          "id": "779e10499cfe668506ba8a199342cf86fae258a7",
          "message": "feat: Add initial integration of databus (#8710)\n\nStart integrating the databus in the mock circuits to uncover any\r\nintegration issues.",
          "timestamp": "2024-09-24T11:59:47+02:00",
          "tree_id": "45e94b46e1c067d6ea5252869674791c36624bb7",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/779e10499cfe668506ba8a199342cf86fae258a7"
        },
        "date": 1727172956418,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 35553.722244,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 33087.20223499999 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5169.344846999991,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4760.806305 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 100156.344996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 100156345000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14605.634111000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14605634000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8534019750,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8534019750 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 154077591,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 154077591 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6933192631,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6933192631 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 128985101,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 128985101 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "47281315+guipublic@users.noreply.github.com",
            "name": "guipublic",
            "username": "guipublic"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "aabd2d85d4f3f35d67d53421b47214aa8904c505",
          "message": "chore!: change ec_add to unsafe implementation (but much better perf) (#8374)\n\nUse `unconditional_add` for ec_add ACIR opcode.\r\nThis improves a lot the performance of the opcode, but also makes it\r\nunsafe.\r\n~~I keep the PR as draft until aztec packages are sync with Noir PR\r\nhttps://github.com/noir-lang/noir/pull/5858 which adds the checks in the\r\nstdlib function.~~\r\nThe unsafe version can then be used when we know the inputs are valid\r\n(for instance if they come from a previous add).\r\nn.b.: the real performance boost will happen when we will be able to use\r\nthe unsafe version.\r\n\r\nCo-authored-by: Tom French <15848336+TomAFrench@users.noreply.github.com>",
          "timestamp": "2024-09-24T12:13:40+01:00",
          "tree_id": "dc62adfd4a2d1e35bf56eec16f05d9572fdaefc9",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/aabd2d85d4f3f35d67d53421b47214aa8904c505"
        },
        "date": 1727177606332,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 35610.394039,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 33019.866771 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5094.009241000009,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4638.731148999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 100171.561547,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 100171562000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14652.519745000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14652520000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8508471892,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8508471892 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 152141245,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 152141245 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6909657651,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6909657651 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 128889651,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 128889651 ns\nthreads: 1"
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
          "id": "9a1b5b5fdd3194f4e7833aacbca4f48aadafbd74",
          "message": "fix(revert): \"chore!: change ec_add to unsafe implementation (but much better perf)\" (#8722)\n\nReverts AztecProtocol/aztec-packages#8374 as it broke prover tests",
          "timestamp": "2024-09-24T08:37:00-04:00",
          "tree_id": "10c8a69b787e8cfdd48946fc63b3674435e027e9",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9a1b5b5fdd3194f4e7833aacbca4f48aadafbd74"
        },
        "date": 1727182671783,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 35543.60957000003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 32833.647735 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5075.156475000029,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4671.670881000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 100104.16768400001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 100104168000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14586.569835,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14586569000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8946052540,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8946052540 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 155268581,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 155268581 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6928716998,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6928716998 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 127391888,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 127391888 ns\nthreads: 1"
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
          "id": "82b60ebbdb18400363248b80986c993df1b7e4af",
          "message": "feat: Make UltraKeccak work with Shplemini at bb-level (#8646)\n\nIn this PR:\r\n- make UltraKeccak flavor inherit from Ultra\r\n- make a Shplemini Prover\r\n- run UltraKeccak Honk with Shplemini but with variable size proof for\r\nnow in c++ tests\r\n- only send proof up to sumcheck to smart contract tests",
          "timestamp": "2024-09-24T13:37:07Z",
          "tree_id": "890eced6334948dd669128cd0fbe792671331e08",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/82b60ebbdb18400363248b80986c993df1b7e4af"
        },
        "date": 1727186565476,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 36062.58769800002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 33579.66793199999 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5350.434732000011,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4904.183241 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 109223.14233699998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 109223143000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14950.469641,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14950470000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8662511335,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8662511335 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 163672632,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 163672632 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8589236127,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8589236127 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 155233205,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 155233205 ns\nthreads: 1"
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
          "id": "d5f16cc41bc077f24947fc92af2767630e928ed8",
          "message": "chore: gas premiums for AVM side effects, DA gas in AVM (#8632)",
          "timestamp": "2024-09-24T15:14:29Z",
          "tree_id": "20a996b2debcd38ec46edf11bbd83122fcbd3448",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d5f16cc41bc077f24947fc92af2767630e928ed8"
        },
        "date": 1727192078978,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 35576.865808999995,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 33394.66969 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5074.520644999992,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4697.325694 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 109804.60372300001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 109804605000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14673.233361999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14673233000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8633977977,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8633977977 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 159119559,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 159119559 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8475880655,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8475880655 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 149702573,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 149702573 ns\nthreads: 1"
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
          "id": "251db7be2d7541852de314a13a85205b4b3a0418",
          "message": "chore: Skip some tests in CI (#8738)\n\nIntroduce a string for filtering Barretenberg tests run by ctest and\r\napply it to biggroup, bigfield, and stdlib Plonk verifier tests. These\r\nno longer run in CI!",
          "timestamp": "2024-09-24T13:59:50-04:00",
          "tree_id": "7df6759d59cb53cc94842b949ae4c23fbe9ead4e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/251db7be2d7541852de314a13a85205b4b3a0418"
        },
        "date": 1727202066886,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 35597.270968000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 32999.882486 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5077.077724999981,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4708.875560999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 100170.500261,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 100170501000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14645.022856000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14645023000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8522271578,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8522271578 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 152270596,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 152270596 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6948645268,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6948645268 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126854021,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126854021 ns\nthreads: 1"
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
          "id": "3fa9e83c0fac460f586572fe2866823fe7f740d2",
          "message": "feat: aggregate honk and avm recursion constraints together (#8696)\n\nCloses https://github.com/AztecProtocol/barretenberg/issues/1095.\r\n\r\nWe should aggregate the aggregation objects generated by the Honk and\r\nAVM recursion constraints. Previously, we were creating 2 separate ones\r\nand adding them to the builder, which would've triggered an assert\r\nfailure. This work should allow for circuits (like the public kernel) to\r\nhave both Honk and AVM recursion constraints.",
          "timestamp": "2024-09-24T18:47:37Z",
          "tree_id": "a8f6f36ba4d6704dae44663000f228dbc8922b0c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/3fa9e83c0fac460f586572fe2866823fe7f740d2"
        },
        "date": 1727204691403,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 35740.66671,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 32821.736080999995 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5091.436273999989,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4666.109576999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 100956.19081000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 100956190000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14706.530304,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14706531000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8599888747,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8599888747 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 151599410,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 151599410 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6983788651,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6983788651 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 128864754,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 128864754 ns\nthreads: 1"
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
          "id": "18e2697d8791b4533e042ec04526e32922b608bc",
          "message": "chore: Reinstate skipped tests (#8743)\n\nThese are quite stable but ofc it's better not to skip them...",
          "timestamp": "2024-09-24T15:20:56-04:00",
          "tree_id": "27407237d2bd57fed3773bcc29ba0460973e8e1d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/18e2697d8791b4533e042ec04526e32922b608bc"
        },
        "date": 1727206722216,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 36047.63246600001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 33034.232616 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5098.743770000013,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4634.337874000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 100527.65451000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 100527654000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14616.245246999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14616244000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8739989012,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8739989012 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 154709847,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 154709847 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6931342943,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6931342943 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 125271446,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 125271446 ns\nthreads: 1"
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
          "id": "21277fe4c29ea1fa36a1f36d0bce2c93b5734e85",
          "message": "chore(master): Release 0.56.0",
          "timestamp": "2024-09-25T15:19:57Z",
          "url": "https://github.com/AztecProtocol/aztec-packages/pull/8597/commits/21277fe4c29ea1fa36a1f36d0bce2c93b5734e85"
        },
        "date": 1727278623635,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 35567.05756899998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 32960.62841700001 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5071.335064999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4682.359494000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 99952.717225,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 99952718000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14608.651055,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14608651000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8540171919,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8540171919 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 155569260,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 155569260 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6941929160,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6941929160 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126783596,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126783596 ns\nthreads: 1"
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
          "id": "8f72bc17ab95a93f42255658abe2823b27681aad",
          "message": "chore(master): Release 0.56.0 (#8597)\n\n:robot: I have created a release *beep* *boop*\r\n---\r\n\r\n\r\n<details><summary>aztec-package: 0.56.0</summary>\r\n\r\n##\r\n[0.56.0](https://github.com/AztecProtocol/aztec-packages/compare/aztec-package-v0.55.1...aztec-package-v0.56.0)\r\n(2024-09-25)\r\n\r\n\r\n### ⚠ BREAKING CHANGES\r\n\r\n* remove key registry\r\n([#8613](https://github.com/AztecProtocol/aztec-packages/issues/8613))\r\n\r\n### Features\r\n\r\n* Remove key registry\r\n([#8613](https://github.com/AztecProtocol/aztec-packages/issues/8613))\r\n([a668506](https://github.com/AztecProtocol/aztec-packages/commit/a6685067a0a5d17cbbc4cbfed4e78e364864ff51))\r\n* Update rollup storage to hold pending/proven tips\r\n([#8583](https://github.com/AztecProtocol/aztec-packages/issues/8583))\r\n([38e3051](https://github.com/AztecProtocol/aztec-packages/commit/38e3051d60f9f8a80e33fab4e0f7f3ec3cde2ee2))\r\n</details>\r\n\r\n<details><summary>barretenberg.js: 0.56.0</summary>\r\n\r\n##\r\n[0.56.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg.js-v0.55.1...barretenberg.js-v0.56.0)\r\n(2024-09-25)\r\n\r\n\r\n### Features\r\n\r\n* Use new IVC scheme\r\n([#8480](https://github.com/AztecProtocol/aztec-packages/issues/8480))\r\n([1c7b06d](https://github.com/AztecProtocol/aztec-packages/commit/1c7b06d6621d9873f84147b2b7f1f22bf21bbacb))\r\n\r\n\r\n### Bug Fixes\r\n\r\n* Skip G1 SRS download if numPoints is zero\r\n([#8717](https://github.com/AztecProtocol/aztec-packages/issues/8717))\r\n([753cdf8](https://github.com/AztecProtocol/aztec-packages/commit/753cdf8b047365b6280c0306fdc6f59f824f740b))\r\n\r\n\r\n### Miscellaneous\r\n\r\n* Migrate higher-level APIs for barretenberg to bb.js\r\n([#8677](https://github.com/AztecProtocol/aztec-packages/issues/8677))\r\n([0237a20](https://github.com/AztecProtocol/aztec-packages/commit/0237a20c989f2b37a64ee18b41c1da361363a81f))\r\n</details>\r\n\r\n<details><summary>aztec-packages: 0.56.0</summary>\r\n\r\n##\r\n[0.56.0](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.55.1...aztec-packages-v0.56.0)\r\n(2024-09-25)\r\n\r\n\r\n### ⚠ BREAKING CHANGES\r\n\r\n* make compute_nullifier_without_context unconstrained\r\n([#8742](https://github.com/AztecProtocol/aztec-packages/issues/8742))\r\n* remove PublicContextInputs\r\n([#8770](https://github.com/AztecProtocol/aztec-packages/issues/8770))\r\n* make TestEnvironment be unconstrained\r\n([#8747](https://github.com/AztecProtocol/aztec-packages/issues/8747))\r\n* change ec_add to unsafe implementation (but much better perf)\r\n([#8374](https://github.com/AztecProtocol/aztec-packages/issues/8374))\r\n* `aztec_macros` are dead, long live `aztec::macros`\r\n([#8438](https://github.com/AztecProtocol/aztec-packages/issues/8438))\r\n* **avm:** GETENVVAR + ISSTATICCALL\r\n([#8692](https://github.com/AztecProtocol/aztec-packages/issues/8692))\r\n* remove sha256 opcode\r\n([#4571](https://github.com/AztecProtocol/aztec-packages/issues/4571))\r\n* removing implicit numeric generics\r\n(https://github.com/noir-lang/noir/pull/5837)\r\n* Infer globals to be u32 when used in a type\r\n(https://github.com/noir-lang/noir/pull/6083)\r\n* add support for u1 in the avm, ToRadix's radix arg is a memory addr\r\n([#8570](https://github.com/AztecProtocol/aztec-packages/issues/8570))\r\n* remove key registry\r\n([#8613](https://github.com/AztecProtocol/aztec-packages/issues/8613))\r\n* **avm:** dont compress public bytecode\r\n([#8623](https://github.com/AztecProtocol/aztec-packages/issues/8623))\r\n* **avm:** remove tag in NOT\r\n([#8606](https://github.com/AztecProtocol/aztec-packages/issues/8606))\r\n\r\n### Features\r\n\r\n* (LSP) if in runtime code, always suggest functions that return Quoted\r\nas macro calls (https://github.com/noir-lang/noir/pull/6098)\r\n([7fb2a45](https://github.com/AztecProtocol/aztec-packages/commit/7fb2a454531db8cef757b5ec2028d97e823bef5f))\r\n* (LSP) remove unused imports\r\n(https://github.com/noir-lang/noir/pull/6129)\r\n([4522c4f](https://github.com/AztecProtocol/aztec-packages/commit/4522c4f428b288825013d7c38c5a4cbc5b8c8f58))\r\n* (LSP) show global value on hover\r\n(https://github.com/noir-lang/noir/pull/6097)\r\n([7fb2a45](https://github.com/AztecProtocol/aztec-packages/commit/7fb2a454531db8cef757b5ec2028d97e823bef5f))\r\n* (LSP) suggest $vars inside `quote { ... }`\r\n(https://github.com/noir-lang/noir/pull/6114)\r\n([7a87314](https://github.com/AztecProtocol/aztec-packages/commit/7a873147444ef03bc1df88e0fdca3cf6fc124725))\r\n* `aztec_macros` are dead, long live `aztec::macros`\r\n([#8438](https://github.com/AztecProtocol/aztec-packages/issues/8438))\r\n([7cbabd6](https://github.com/AztecProtocol/aztec-packages/commit/7cbabd6840ee8127c12a51a2342ef634f1d58954))\r\n* Add `Expr::as_constructor`\r\n(https://github.com/noir-lang/noir/pull/5980)\r\n([7ea4709](https://github.com/AztecProtocol/aztec-packages/commit/7ea4709743aaaf2768d35d92cad3fbd4a8404fb0))\r\n* Add `Expr::as_for` and `Expr::as_for_range`\r\n(https://github.com/noir-lang/noir/pull/6039)\r\n([7ea4709](https://github.com/AztecProtocol/aztec-packages/commit/7ea4709743aaaf2768d35d92cad3fbd4a8404fb0))\r\n* Add `Expr::as_lambda` (https://github.com/noir-lang/noir/pull/6048)\r\n([7ea4709](https://github.com/AztecProtocol/aztec-packages/commit/7ea4709743aaaf2768d35d92cad3fbd4a8404fb0))\r\n* Add Aztec Bot to helm testnet package\r\n([#8702](https://github.com/AztecProtocol/aztec-packages/issues/8702))\r\n([982a04e](https://github.com/AztecProtocol/aztec-packages/commit/982a04e8021ec88b178ea05fdebb7193998cde38))\r\n* Add epochs to existing orchestrator\r\n([#8675](https://github.com/AztecProtocol/aztec-packages/issues/8675))\r\n([0337fe9](https://github.com/AztecProtocol/aztec-packages/commit/0337fe9c2a7ac9f19fe8f695c7c072102dae9ec2))\r\n* Add epochs to existing orchestrator v2\r\n([#8732](https://github.com/AztecProtocol/aztec-packages/issues/8732))\r\n([cec4d3f](https://github.com/AztecProtocol/aztec-packages/commit/cec4d3fedd5483cece5e53c0c1682d7a0b26f5fd))\r\n* Add initial integration of databus\r\n([#8710](https://github.com/AztecProtocol/aztec-packages/issues/8710))\r\n([779e104](https://github.com/AztecProtocol/aztec-packages/commit/779e10499cfe668506ba8a199342cf86fae258a7))\r\n* Add peer scoring to req resp rate limits\r\n([#8633](https://github.com/AztecProtocol/aztec-packages/issues/8633))\r\n([b015a79](https://github.com/AztecProtocol/aztec-packages/commit/b015a79560133d4bf842834066eb88bffba7cb7f))\r\n* Add separate report for public function bytecode sizes\r\n([#8750](https://github.com/AztecProtocol/aztec-packages/issues/8750))\r\n([d3c102f](https://github.com/AztecProtocol/aztec-packages/commit/d3c102f3c055e29c2beeb5ed81ac7b76b7135d25))\r\n* Add support for u1 in the avm, ToRadix's radix arg is a memory addr\r\n([#8570](https://github.com/AztecProtocol/aztec-packages/issues/8570))\r\n([1785737](https://github.com/AztecProtocol/aztec-packages/commit/178573738731e2e74e4119a035f913da39675d85))\r\n* Add validation to request / response interactions + adjust scoring\r\nappropiately\r\n([#8641](https://github.com/AztecProtocol/aztec-packages/issues/8641))\r\n([8dfdebc](https://github.com/AztecProtocol/aztec-packages/commit/8dfdebc7055ca89861a3727ea2d419fde98d6cf7))\r\n* Aggregate honk and avm recursion constraints together\r\n([#8696](https://github.com/AztecProtocol/aztec-packages/issues/8696))\r\n([3fa9e83](https://github.com/AztecProtocol/aztec-packages/commit/3fa9e83c0fac460f586572fe2866823fe7f740d2))\r\n* Allow visibility modifiers in struct definitions\r\n(https://github.com/noir-lang/noir/pull/6054)\r\n([7ea4709](https://github.com/AztecProtocol/aztec-packages/commit/7ea4709743aaaf2768d35d92cad3fbd4a8404fb0))\r\n* **avm:** Avm recursive TS/Noir integration\r\n([#8531](https://github.com/AztecProtocol/aztec-packages/issues/8531))\r\n([dd09f05](https://github.com/AztecProtocol/aztec-packages/commit/dd09f057e97ac1bba7b3fbf29b50737ebe5ca76f)),\r\ncloses\r\n[#7791](https://github.com/AztecProtocol/aztec-packages/issues/7791)\r\n* **avm:** Avm recursive TS/Noir integration\r\n([#8611](https://github.com/AztecProtocol/aztec-packages/issues/8611))\r\n([e417231](https://github.com/AztecProtocol/aztec-packages/commit/e4172318af81ac2ac8535c89d3e5afc72d33ba29))\r\n* **avm:** Bounded mle implementation\r\n([#8668](https://github.com/AztecProtocol/aztec-packages/issues/8668))\r\n([aa85f2a](https://github.com/AztecProtocol/aztec-packages/commit/aa85f2a781223f067291b5702f2e47baced865fd)),\r\ncloses\r\n[#8651](https://github.com/AztecProtocol/aztec-packages/issues/8651)\r\n* **avm:** GETENVVAR + ISSTATICCALL\r\n([#8692](https://github.com/AztecProtocol/aztec-packages/issues/8692))\r\n([02cff0b](https://github.com/AztecProtocol/aztec-packages/commit/02cff0b525d9d6b1c854219f06713a8b94a8e9f5))\r\n* **avm:** Opcode STATICCALL - stubbed\r\n([#8601](https://github.com/AztecProtocol/aztec-packages/issues/8601))\r\n([facff7f](https://github.com/AztecProtocol/aztec-packages/commit/facff7fd0b6ea57e91f7d3e3863435655d8b48ea)),\r\ncloses\r\n[#8596](https://github.com/AztecProtocol/aztec-packages/issues/8596)\r\n* **avm:** Remove tag in NOT\r\n([#8606](https://github.com/AztecProtocol/aztec-packages/issues/8606))\r\n([d5695fc](https://github.com/AztecProtocol/aztec-packages/commit/d5695fcde93cbfda3e45bfa03988a9e72f2dcb59))\r\n* **avm:** Return oracle\r\n([#8629](https://github.com/AztecProtocol/aztec-packages/issues/8629))\r\n([b6bc7c3](https://github.com/AztecProtocol/aztec-packages/commit/b6bc7c3f5064255480e3d4443471c2c50007d0ca))\r\n* **avm:** Set avm circuit subgroup size\r\n([#8537](https://github.com/AztecProtocol/aztec-packages/issues/8537))\r\n([3b78058](https://github.com/AztecProtocol/aztec-packages/commit/3b78058288edbbe18a2eb8c81de5576c8a9478ab))\r\n* Benchmark compute_row_evaluations and update analysis script\r\n([#8673](https://github.com/AztecProtocol/aztec-packages/issues/8673))\r\n([c738c47](https://github.com/AztecProtocol/aztec-packages/commit/c738c47bd13875ba1649d808e7abd2908fa29e07))\r\n* Check unconstrained trait impl method matches\r\n(https://github.com/noir-lang/noir/pull/6057)\r\n([3e0067a](https://github.com/AztecProtocol/aztec-packages/commit/3e0067a11935d4f2ead9579458d3c00c2f27f1ef))\r\n* Compute args hash with comptime length\r\n([#8736](https://github.com/AztecProtocol/aztec-packages/issues/8736))\r\n([dae82d8](https://github.com/AztecProtocol/aztec-packages/commit/dae82d84f95242ad7da1bf8e0c7e5063a35b1fef))\r\n* Constant sized PG proofs and const sized PG rec verifier\r\n([#8605](https://github.com/AztecProtocol/aztec-packages/issues/8605))\r\n([09e2f44](https://github.com/AztecProtocol/aztec-packages/commit/09e2f447b003ed4c77b12069893785851a2c6258))\r\n* Do not double error on import with error\r\n(https://github.com/noir-lang/noir/pull/6131)\r\n([0d9f547](https://github.com/AztecProtocol/aztec-packages/commit/0d9f547d4e470a1e5383c1fff4c0c6125169de19))\r\n* **docs:** Getting started, portals page, some other nits\r\n([#8515](https://github.com/AztecProtocol/aztec-packages/issues/8515))\r\n([9632e0d](https://github.com/AztecProtocol/aztec-packages/commit/9632e0dcf3c5b8966be0e1d02fa7ea9a5677af97))\r\n* **docs:** Some small custom note stuff\r\n([#8518](https://github.com/AztecProtocol/aztec-packages/issues/8518))\r\n([a098d41](https://github.com/AztecProtocol/aztec-packages/commit/a098d41ef0ba91beaf8b22a353bccd8e78bae5f5))\r\n* EpochProofQuote implementation in TS\r\n([#8689](https://github.com/AztecProtocol/aztec-packages/issues/8689))\r\n([1aad110](https://github.com/AztecProtocol/aztec-packages/commit/1aad110ba582599a69216dc0491f19b0df6dafea))\r\n* Faster LSP by caching file managers\r\n(https://github.com/noir-lang/noir/pull/6047)\r\n([7ea4709](https://github.com/AztecProtocol/aztec-packages/commit/7ea4709743aaaf2768d35d92cad3fbd4a8404fb0))\r\n* Implement `to_be_radix` in the comptime interpreter\r\n(https://github.com/noir-lang/noir/pull/6043)\r\n([7ea4709](https://github.com/AztecProtocol/aztec-packages/commit/7ea4709743aaaf2768d35d92cad3fbd4a8404fb0))\r\n* Implement solver for mov_registers_to_registers\r\n(https://github.com/noir-lang/noir/pull/6089)\r\n([03b9e71](https://github.com/AztecProtocol/aztec-packages/commit/03b9e71e5ebb3d46827671b2197697b5d294d04e))\r\n* Implement type paths (https://github.com/noir-lang/noir/pull/6093)\r\n([b330e87](https://github.com/AztecProtocol/aztec-packages/commit/b330e874dc11235eb9730aca7c936299378c9ce8))\r\n* Let LSP suggest macro calls too\r\n(https://github.com/noir-lang/noir/pull/6090)\r\n([b330e87](https://github.com/AztecProtocol/aztec-packages/commit/b330e874dc11235eb9730aca7c936299378c9ce8))\r\n* Light block builder\r\n([#8662](https://github.com/AztecProtocol/aztec-packages/issues/8662))\r\n([1e922a5](https://github.com/AztecProtocol/aztec-packages/commit/1e922a5a13bf3105e1317eda6d5536aa44a84b54))\r\n* LSP autocompletion for `TypePath`\r\n(https://github.com/noir-lang/noir/pull/6117)\r\n([7a87314](https://github.com/AztecProtocol/aztec-packages/commit/7a873147444ef03bc1df88e0fdca3cf6fc124725))\r\n* Make compute_nullifier_without_context unconstrained\r\n([#8742](https://github.com/AztecProtocol/aztec-packages/issues/8742))\r\n([e30a743](https://github.com/AztecProtocol/aztec-packages/commit/e30a743d01ab190a1f7a677d2ae667f15c83d97f))\r\n* Make TestEnvironment be unconstrained\r\n([#8747](https://github.com/AztecProtocol/aztec-packages/issues/8747))\r\n([b9a1f59](https://github.com/AztecProtocol/aztec-packages/commit/b9a1f59a5343c8fa7caa957a5ebc3eb533a21c9c))\r\n* Make UltraKeccak work with Shplemini at bb-level\r\n([#8646](https://github.com/AztecProtocol/aztec-packages/issues/8646))\r\n([82b60eb](https://github.com/AztecProtocol/aztec-packages/commit/82b60ebbdb18400363248b80986c993df1b7e4af))\r\n* **metaprogramming:** Add `#[use_callers_scope]`\r\n(https://github.com/noir-lang/noir/pull/6050)\r\n([7ea4709](https://github.com/AztecProtocol/aztec-packages/commit/7ea4709743aaaf2768d35d92cad3fbd4a8404fb0))\r\n* More robust recursion input generator\r\n([#8634](https://github.com/AztecProtocol/aztec-packages/issues/8634))\r\n([020d4fd](https://github.com/AztecProtocol/aztec-packages/commit/020d4fd0cf4137e21f55b1c41e9e381a27191d84))\r\n* Only download non-pruned blocks\r\n([#8578](https://github.com/AztecProtocol/aztec-packages/issues/8578))\r\n([ae26474](https://github.com/AztecProtocol/aztec-packages/commit/ae26474709e28116a38fd2c2773de39dfb6816ad))\r\n* Optimize constraints in sha256\r\n(https://github.com/noir-lang/noir/pull/6145)\r\n([0d9f547](https://github.com/AztecProtocol/aztec-packages/commit/0d9f547d4e470a1e5383c1fff4c0c6125169de19))\r\n* Partial notes log encoding\r\n([#8538](https://github.com/AztecProtocol/aztec-packages/issues/8538))\r\n([5f5ec20](https://github.com/AztecProtocol/aztec-packages/commit/5f5ec2099782a64160c7b06ce2021d28c264e7e9))\r\n* **perf:** Allow array set last uses optimization in return block of\r\nBrillig functions (https://github.com/noir-lang/noir/pull/6119)\r\n([7a87314](https://github.com/AztecProtocol/aztec-packages/commit/7a873147444ef03bc1df88e0fdca3cf6fc124725))\r\n* **perf:** Remove unused loads in mem2reg and last stores per function\r\n(https://github.com/noir-lang/noir/pull/5925)\r\n([3e0067a](https://github.com/AztecProtocol/aztec-packages/commit/3e0067a11935d4f2ead9579458d3c00c2f27f1ef))\r\n* Pretty print Quoted token stream\r\n(https://github.com/noir-lang/noir/pull/6111)\r\n([7a87314](https://github.com/AztecProtocol/aztec-packages/commit/7a873147444ef03bc1df88e0fdca3cf6fc124725))\r\n* Prune if needed\r\n([#8617](https://github.com/AztecProtocol/aztec-packages/issues/8617))\r\n([49b17d0](https://github.com/AztecProtocol/aztec-packages/commit/49b17d0924fc3b11d0b2202cfc01d3dd4c18617a)),\r\ncloses\r\n[#8608](https://github.com/AztecProtocol/aztec-packages/issues/8608)\r\n* Public kernel handles enqueued calls\r\n([#8523](https://github.com/AztecProtocol/aztec-packages/issues/8523))\r\n([6303b4a](https://github.com/AztecProtocol/aztec-packages/commit/6303b4afbc39715e92d5ca7ae5100c60f6398686))\r\n* Reduce max memory in translator by freeing accumulator and eccvm\r\n([#8253](https://github.com/AztecProtocol/aztec-packages/issues/8253))\r\n([7247ddb](https://github.com/AztecProtocol/aztec-packages/commit/7247ddba274e691a7c5220848caf1fa9d6aa911e))\r\n* Remove aztec macros (https://github.com/noir-lang/noir/pull/6087)\r\n([0d9f547](https://github.com/AztecProtocol/aztec-packages/commit/0d9f547d4e470a1e5383c1fff4c0c6125169de19))\r\n* Remove key registry\r\n([#8613](https://github.com/AztecProtocol/aztec-packages/issues/8613))\r\n([a668506](https://github.com/AztecProtocol/aztec-packages/commit/a6685067a0a5d17cbbc4cbfed4e78e364864ff51))\r\n* Remove sha256 opcode\r\n([#4571](https://github.com/AztecProtocol/aztec-packages/issues/4571))\r\n([4b4a0bf](https://github.com/AztecProtocol/aztec-packages/commit/4b4a0bf17050893f913b3db10bc70a584b7aaa5e))\r\n* Remove unnecessary branching in keccak impl\r\n(https://github.com/noir-lang/noir/pull/6133)\r\n([0d9f547](https://github.com/AztecProtocol/aztec-packages/commit/0d9f547d4e470a1e5383c1fff4c0c6125169de19))\r\n* Represent assertions more similarly to function calls\r\n(https://github.com/noir-lang/noir/pull/6103)\r\n([7a87314](https://github.com/AztecProtocol/aztec-packages/commit/7a873147444ef03bc1df88e0fdca3cf6fc124725))\r\n* Show test output when running via LSP\r\n(https://github.com/noir-lang/noir/pull/6049)\r\n([7ea4709](https://github.com/AztecProtocol/aztec-packages/commit/7ea4709743aaaf2768d35d92cad3fbd4a8404fb0))\r\n* Swap endianness in-place in keccak implementation\r\n(https://github.com/noir-lang/noir/pull/6128)\r\n([4522c4f](https://github.com/AztecProtocol/aztec-packages/commit/4522c4f428b288825013d7c38c5a4cbc5b8c8f58))\r\n* Update rollup storage to hold pending/proven tips\r\n([#8583](https://github.com/AztecProtocol/aztec-packages/issues/8583))\r\n([38e3051](https://github.com/AztecProtocol/aztec-packages/commit/38e3051d60f9f8a80e33fab4e0f7f3ec3cde2ee2))\r\n* Use new IVC scheme\r\n([#8480](https://github.com/AztecProtocol/aztec-packages/issues/8480))\r\n([1c7b06d](https://github.com/AztecProtocol/aztec-packages/commit/1c7b06d6621d9873f84147b2b7f1f22bf21bbacb))\r\n* **vc:** Remove viem signers from validator client\r\n([#8517](https://github.com/AztecProtocol/aztec-packages/issues/8517))\r\n([8244fa2](https://github.com/AztecProtocol/aztec-packages/commit/8244fa2d496975bb8bcc032690e0eab1b8c9548f))\r\n* Visibility for traits (https://github.com/noir-lang/noir/pull/6056)\r\n([7ea4709](https://github.com/AztecProtocol/aztec-packages/commit/7ea4709743aaaf2768d35d92cad3fbd4a8404fb0))\r\n\r\n\r\n### Bug Fixes\r\n\r\n* Address a bunch of issues with generics\r\n([#8625](https://github.com/AztecProtocol/aztec-packages/issues/8625))\r\n([94718f1](https://github.com/AztecProtocol/aztec-packages/commit/94718f1fbc26b165107872b2e32ba5412ba3b7fd))\r\n* Allow macros to change types on each iteration of a comptime loop\r\n(https://github.com/noir-lang/noir/pull/6105)\r\n([03b9e71](https://github.com/AztecProtocol/aztec-packages/commit/03b9e71e5ebb3d46827671b2197697b5d294d04e))\r\n* Allow providing default implementations of unconstrained trait methods\r\n(https://github.com/noir-lang/noir/pull/6138)\r\n([0d9f547](https://github.com/AztecProtocol/aztec-packages/commit/0d9f547d4e470a1e5383c1fff4c0c6125169de19))\r\n* Always parse all tokens from quoted token streams\r\n(https://github.com/noir-lang/noir/pull/6064)\r\n([3e0067a](https://github.com/AztecProtocol/aztec-packages/commit/3e0067a11935d4f2ead9579458d3c00c2f27f1ef))\r\n* **avm:** Fix tests under proving\r\n([#8640](https://github.com/AztecProtocol/aztec-packages/issues/8640))\r\n([8bfc769](https://github.com/AztecProtocol/aztec-packages/commit/8bfc769d7cbd6f88bfa7926c051a329ee0fd3468))\r\n* Be more lenient with semicolons on interned expressions\r\n(https://github.com/noir-lang/noir/pull/6062)\r\n([3e0067a](https://github.com/AztecProtocol/aztec-packages/commit/3e0067a11935d4f2ead9579458d3c00c2f27f1ef))\r\n* Boomerang variable in sha256 hash function\r\n([#8581](https://github.com/AztecProtocol/aztec-packages/issues/8581))\r\n([f2a1330](https://github.com/AztecProtocol/aztec-packages/commit/f2a13309f544bbd83b593e6a6207d49d9ef48b74))\r\n* **ci:** Rerun.yml should not trigger if a commit has been pushed\r\n([#8735](https://github.com/AztecProtocol/aztec-packages/issues/8735))\r\n([39fbf92](https://github.com/AztecProtocol/aztec-packages/commit/39fbf92a068be5f746b7cc379910c6af85f5e064))\r\n* Consider constants as used values to keep their rc ops\r\n(https://github.com/noir-lang/noir/pull/6122)\r\n([4522c4f](https://github.com/AztecProtocol/aztec-packages/commit/4522c4f428b288825013d7c38c5a4cbc5b8c8f58))\r\n* Correct stack trace order in comptime assertion failures\r\n(https://github.com/noir-lang/noir/pull/6066)\r\n([3e0067a](https://github.com/AztecProtocol/aztec-packages/commit/3e0067a11935d4f2ead9579458d3c00c2f27f1ef))\r\n* Decode databus return values\r\n(https://github.com/noir-lang/noir/pull/6095)\r\n([7a87314](https://github.com/AztecProtocol/aztec-packages/commit/7a873147444ef03bc1df88e0fdca3cf6fc124725))\r\n* Delete database file from disk on db.delete\r\n([#8693](https://github.com/AztecProtocol/aztec-packages/issues/8693))\r\n([07d43ea](https://github.com/AztecProtocol/aztec-packages/commit/07d43ea77b57aba5d6edba56fe873b7dafd17e50))\r\n* Delete temp lmdb stores + close db connection\r\n([#8778](https://github.com/AztecProtocol/aztec-packages/issues/8778))\r\n([9321cbc](https://github.com/AztecProtocol/aztec-packages/commit/9321cbcf022994e5f8d41798d8c765490ab96824))\r\n* Disambiguate field or int static trait method call\r\n(https://github.com/noir-lang/noir/pull/6112)\r\n([7a87314](https://github.com/AztecProtocol/aztec-packages/commit/7a873147444ef03bc1df88e0fdca3cf6fc124725))\r\n* Do not prune if we are behind the assumed proven block\r\n([#8744](https://github.com/AztecProtocol/aztec-packages/issues/8744))\r\n([e85bee5](https://github.com/AztecProtocol/aztec-packages/commit/e85bee5fb32057c8315593027417853cb4dfdcd5))\r\n* **docs:** Simplify home page\r\n([#8630](https://github.com/AztecProtocol/aztec-packages/issues/8630))\r\n([87e0a17](https://github.com/AztecProtocol/aztec-packages/commit/87e0a17db6c89a3a6e23fca3369c3bc5fe84ad3d))\r\n* Don't crash on untyped global used as array length\r\n(https://github.com/noir-lang/noir/pull/6076)\r\n([3e0067a](https://github.com/AztecProtocol/aztec-packages/commit/3e0067a11935d4f2ead9579458d3c00c2f27f1ef))\r\n* Don't prune while proposing or proving.\r\n([#8739](https://github.com/AztecProtocol/aztec-packages/issues/8739))\r\n([5854879](https://github.com/AztecProtocol/aztec-packages/commit/5854879f46f0f777dd986f1ba6adf6aa24abc683))\r\n* Error on `&mut x` when `x` is not mutable\r\n(https://github.com/noir-lang/noir/pull/6037)\r\n([7ea4709](https://github.com/AztecProtocol/aztec-packages/commit/7ea4709743aaaf2768d35d92cad3fbd4a8404fb0))\r\n* Fix canonicalization bug (https://github.com/noir-lang/noir/pull/6033)\r\n([7ea4709](https://github.com/AztecProtocol/aztec-packages/commit/7ea4709743aaaf2768d35d92cad3fbd4a8404fb0))\r\n* Fix comptime type formatting\r\n(https://github.com/noir-lang/noir/pull/6079)\r\n([3e0067a](https://github.com/AztecProtocol/aztec-packages/commit/3e0067a11935d4f2ead9579458d3c00c2f27f1ef))\r\n* Fixes mapTuple typing\r\n([#8615](https://github.com/AztecProtocol/aztec-packages/issues/8615))\r\n([25d5805](https://github.com/AztecProtocol/aztec-packages/commit/25d5805db1a2ccd0f06f14ab9a11a3fa455e5b69))\r\n* Handle multi-byte utf8 characters in formatter\r\n(https://github.com/noir-lang/noir/pull/6118)\r\n([0d9f547](https://github.com/AztecProtocol/aztec-packages/commit/0d9f547d4e470a1e5383c1fff4c0c6125169de19))\r\n* Handle parenthesized expressions in array length\r\n(https://github.com/noir-lang/noir/pull/6132)\r\n([4522c4f](https://github.com/AztecProtocol/aztec-packages/commit/4522c4f428b288825013d7c38c5a4cbc5b8c8f58))\r\n* Infer globals to be u32 when used in a type\r\n(https://github.com/noir-lang/noir/pull/6083)\r\n([3e0067a](https://github.com/AztecProtocol/aztec-packages/commit/3e0067a11935d4f2ead9579458d3c00c2f27f1ef))\r\n* Initialise databus using return values\r\n(https://github.com/noir-lang/noir/pull/6074)\r\n([b330e87](https://github.com/AztecProtocol/aztec-packages/commit/b330e874dc11235eb9730aca7c936299378c9ce8))\r\n* Let LSP suggest fields and methods in LValue chains\r\n(https://github.com/noir-lang/noir/pull/6051)\r\n([7ea4709](https://github.com/AztecProtocol/aztec-packages/commit/7ea4709743aaaf2768d35d92cad3fbd4a8404fb0))\r\n* Let token pretty printer handle `+=` and similar token sequences\r\n(https://github.com/noir-lang/noir/pull/6135)\r\n([0d9f547](https://github.com/AztecProtocol/aztec-packages/commit/0d9f547d4e470a1e5383c1fff4c0c6125169de19))\r\n* **mem2reg:** Remove possibility of underflow\r\n(https://github.com/noir-lang/noir/pull/6107)\r\n([7a87314](https://github.com/AztecProtocol/aztec-packages/commit/7a873147444ef03bc1df88e0fdca3cf6fc124725))\r\n* New commit_sparse bug and new tests\r\n([#8649](https://github.com/AztecProtocol/aztec-packages/issues/8649))\r\n([5818018](https://github.com/AztecProtocol/aztec-packages/commit/581801863529cd2b437cb51b041ada17a96949e0))\r\n* Parse a statement as an expression\r\n(https://github.com/noir-lang/noir/pull/6040)\r\n([7ea4709](https://github.com/AztecProtocol/aztec-packages/commit/7ea4709743aaaf2768d35d92cad3fbd4a8404fb0))\r\n* Preserve generic kind on trait methods\r\n(https://github.com/noir-lang/noir/pull/6099)\r\n([7fb2a45](https://github.com/AztecProtocol/aztec-packages/commit/7fb2a454531db8cef757b5ec2028d97e823bef5f))\r\n* Prevent check_can_mutate crashing on undefined variable\r\n(https://github.com/noir-lang/noir/pull/6044)\r\n([7ea4709](https://github.com/AztecProtocol/aztec-packages/commit/7ea4709743aaaf2768d35d92cad3fbd4a8404fb0))\r\n* Quick TXE after public executor changes\r\n([#8661](https://github.com/AztecProtocol/aztec-packages/issues/8661))\r\n([48a715b](https://github.com/AztecProtocol/aztec-packages/commit/48a715b6a11a07af7f9adce7a1049cf5e81a933d))\r\n* **revert:** \"chore!: change ec_add to unsafe implementation (but much\r\nbetter perf)\"\r\n([#8722](https://github.com/AztecProtocol/aztec-packages/issues/8722))\r\n([9a1b5b5](https://github.com/AztecProtocol/aztec-packages/commit/9a1b5b5fdd3194f4e7833aacbca4f48aadafbd74))\r\n* **revert:** \"feat: Add epochs to existing orchestrator\"\r\n([#8727](https://github.com/AztecProtocol/aztec-packages/issues/8727))\r\n([ff8e1ed](https://github.com/AztecProtocol/aztec-packages/commit/ff8e1edc5eae5d5a18d36cb960eb3d98afa1cfa6))\r\n* Skip G1 SRS download if numPoints is zero\r\n([#8717](https://github.com/AztecProtocol/aztec-packages/issues/8717))\r\n([753cdf8](https://github.com/AztecProtocol/aztec-packages/commit/753cdf8b047365b6280c0306fdc6f59f824f740b))\r\n* **ssa:** RC correctness issue\r\n(https://github.com/noir-lang/noir/pull/6134)\r\n([0d9f547](https://github.com/AztecProtocol/aztec-packages/commit/0d9f547d4e470a1e5383c1fff4c0c6125169de19))\r\n* Unencryptedlogs witgen\r\n([#8669](https://github.com/AztecProtocol/aztec-packages/issues/8669))\r\n([aee4c2d](https://github.com/AztecProtocol/aztec-packages/commit/aee4c2dde7576fad1c47e407ee0dca43dac2b1b4))\r\n* Unify macro result type with actual type\r\n(https://github.com/noir-lang/noir/pull/6086)\r\n([b330e87](https://github.com/AztecProtocol/aztec-packages/commit/b330e874dc11235eb9730aca7c936299378c9ce8))\r\n* Update databus in flattening\r\n(https://github.com/noir-lang/noir/pull/6063)\r\n([3e0067a](https://github.com/AztecProtocol/aztec-packages/commit/3e0067a11935d4f2ead9579458d3c00c2f27f1ef))\r\n* **world_state:** Fix race conditions in WorldState and IndexedTree\r\n([#8612](https://github.com/AztecProtocol/aztec-packages/issues/8612))\r\n([6797525](https://github.com/AztecProtocol/aztec-packages/commit/679752542edf1667d58e8839aca05d2b9fcc7da6))\r\n\r\n\r\n### Miscellaneous\r\n\r\n* Add more cases for assert_equal conversion\r\n([#8446](https://github.com/AztecProtocol/aztec-packages/issues/8446))\r\n([e3ea298](https://github.com/AztecProtocol/aztec-packages/commit/e3ea298fd1f7326199e6e35b3523aadb2b12a925))\r\n* Archiver cleanup\r\n([#8599](https://github.com/AztecProtocol/aztec-packages/issues/8599))\r\n([184cc88](https://github.com/AztecProtocol/aztec-packages/commit/184cc882b3f1b90d74f149e46100474263a3665d))\r\n* **avm:** Dont compress public bytecode\r\n([#8623](https://github.com/AztecProtocol/aztec-packages/issues/8623))\r\n([353da3f](https://github.com/AztecProtocol/aztec-packages/commit/353da3f65e34783058d3ec7187dbe876f737b044))\r\n* **avm:** Simplify bb-prover and other AVM tests\r\n([#8627](https://github.com/AztecProtocol/aztec-packages/issues/8627))\r\n([0d75363](https://github.com/AztecProtocol/aztec-packages/commit/0d7536395f2406a22a76f15d01114730c84edc18))\r\n* **avm:** Smaller skippable test\r\n([#8664](https://github.com/AztecProtocol/aztec-packages/issues/8664))\r\n([2418977](https://github.com/AztecProtocol/aztec-packages/commit/241897733fe0a5e2ccdf322449debd367f458086))\r\n* **bb readme:** Document how to Honk Noir programs\r\n([#7638](https://github.com/AztecProtocol/aztec-packages/issues/7638))\r\n([cd46ddd](https://github.com/AztecProtocol/aztec-packages/commit/cd46ddd96539f2db466d1116dabdb838d2a807e7))\r\n* Bye bye Zeromorph in Solidity\r\n([#8678](https://github.com/AztecProtocol/aztec-packages/issues/8678))\r\n([74182c4](https://github.com/AztecProtocol/aztec-packages/commit/74182c40e152e988ee8590f39c51d00150ef01ca))\r\n* Change ec_add to unsafe implementation (but much better perf)\r\n([#8374](https://github.com/AztecProtocol/aztec-packages/issues/8374))\r\n([aabd2d8](https://github.com/AztecProtocol/aztec-packages/commit/aabd2d85d4f3f35d67d53421b47214aa8904c505))\r\n* **ci:** Bump noir compile tests\r\n([#8705](https://github.com/AztecProtocol/aztec-packages/issues/8705))\r\n([4121ef3](https://github.com/AztecProtocol/aztec-packages/commit/4121ef32d28ea8bf08b10f1bf1508daeef77e1a9))\r\n* **ci:** Make boxes only run on master\r\n([#8604](https://github.com/AztecProtocol/aztec-packages/issues/8604))\r\n([07e6a7e](https://github.com/AztecProtocol/aztec-packages/commit/07e6a7e36626f51f987fff1962903c86df34eb5b))\r\n* **ci:** More lenient recovery\r\n([#8462](https://github.com/AztecProtocol/aztec-packages/issues/8462))\r\n([5d9a2fe](https://github.com/AztecProtocol/aztec-packages/commit/5d9a2fee16b1229987f66070239196235dc10a83))\r\n* **ci:** Reinstate a bunch of tests in e2e list\r\n([#8737](https://github.com/AztecProtocol/aztec-packages/issues/8737))\r\n([226f311](https://github.com/AztecProtocol/aztec-packages/commit/226f31103b5e92017732bc1477733cd634dc1e9c))\r\n* **ci:** Remove deleted e2e\r\n([#8600](https://github.com/AztecProtocol/aztec-packages/issues/8600))\r\n([03127b2](https://github.com/AztecProtocol/aztec-packages/commit/03127b29c9bcad21ff35c14aecf9b2402faa20a5))\r\n* **ci:** Remove e2e-prover-full from default set\r\n([#8697](https://github.com/AztecProtocol/aztec-packages/issues/8697))\r\n([8dcc3bd](https://github.com/AztecProtocol/aztec-packages/commit/8dcc3bd3a678239b14a01da4d99f7c2e44030875))\r\n* **ci:** Run noir-projects on txe changes\r\n([#8660](https://github.com/AztecProtocol/aztec-packages/issues/8660))\r\n([22f6084](https://github.com/AztecProtocol/aztec-packages/commit/22f6084d6a5ff5693b72d2e08ac758472bb73e29))\r\n* **ci:** Scriptify local earthfile\r\n([#8709](https://github.com/AztecProtocol/aztec-packages/issues/8709))\r\n([aacd238](https://github.com/AztecProtocol/aztec-packages/commit/aacd2389d82ce8dfbd0604ecb095c95a400a1150))\r\n* **ci:** Slightly safer default e2e jobs\r\n([#8729](https://github.com/AztecProtocol/aztec-packages/issues/8729))\r\n([80acfd9](https://github.com/AztecProtocol/aztec-packages/commit/80acfd943ac3cd42b548043824f530018ac07a2d))\r\n* Consolidate aztec node configurations (helm refactor)\r\n([#8731](https://github.com/AztecProtocol/aztec-packages/issues/8731))\r\n([9d248a2](https://github.com/AztecProtocol/aztec-packages/commit/9d248a24091cfbf1c4d09b49227136883e6118f0))\r\n* Create a Gemini prover\r\n([#8622](https://github.com/AztecProtocol/aztec-packages/issues/8622))\r\n([94339fb](https://github.com/AztecProtocol/aztec-packages/commit/94339fbfc7c0c822dc1497c113d48f74a89f1bad))\r\n* Delete .gitattributes in aztec-nr\r\n([#8670](https://github.com/AztecProtocol/aztec-packages/issues/8670))\r\n([bc6d7ee](https://github.com/AztecProtocol/aztec-packages/commit/bc6d7ee9d6bc6f89100e52efd6cb6cc71664d12a))\r\n* Delete duplicated test (https://github.com/noir-lang/noir/pull/6113)\r\n([7a87314](https://github.com/AztecProtocol/aztec-packages/commit/7a873147444ef03bc1df88e0fdca3cf6fc124725))\r\n* Delete eth-log-hander\r\n([#8598](https://github.com/AztecProtocol/aztec-packages/issues/8598))\r\n([4064e90](https://github.com/AztecProtocol/aztec-packages/commit/4064e90c7455d1f06590635678f0588706bce328))\r\n* Delete poseidon2 from `bn254_blackbox_solver`\r\n([#8741](https://github.com/AztecProtocol/aztec-packages/issues/8741))\r\n([02fea6a](https://github.com/AztecProtocol/aztec-packages/commit/02fea6abe8637b9fb8f9535d1709b367d5e1da5c))\r\n* **docs:** Fix migration notes\r\n([#8713](https://github.com/AztecProtocol/aztec-packages/issues/8713))\r\n([d5fd155](https://github.com/AztecProtocol/aztec-packages/commit/d5fd155ed14e2c9f7e889f519e7be791561a0e71))\r\n* **docs:** Protocol-specs typos\r\n([#8706](https://github.com/AztecProtocol/aztec-packages/issues/8706))\r\n([48de163](https://github.com/AztecProtocol/aztec-packages/commit/48de163a55bf792acca51a0df745fee44c7decf1))\r\n* **docs:** Removing old versions\r\n(https://github.com/noir-lang/noir/pull/6075)\r\n([7a87314](https://github.com/AztecProtocol/aztec-packages/commit/7a873147444ef03bc1df88e0fdca3cf6fc124725))\r\n* Document array methods (https://github.com/noir-lang/noir/pull/6034)\r\n([7ea4709](https://github.com/AztecProtocol/aztec-packages/commit/7ea4709743aaaf2768d35d92cad3fbd4a8404fb0))\r\n* Ec addition for non-zero points\r\n(https://github.com/noir-lang/noir/pull/5858)\r\n([7a87314](https://github.com/AztecProtocol/aztec-packages/commit/7a873147444ef03bc1df88e0fdca3cf6fc124725))\r\n* Fix broken formatting on master\r\n(https://github.com/noir-lang/noir/pull/6096)\r\n([7fb2a45](https://github.com/AztecProtocol/aztec-packages/commit/7fb2a454531db8cef757b5ec2028d97e823bef5f))\r\n* Fix docs (https://github.com/noir-lang/noir/pull/6035)\r\n([7ea4709](https://github.com/AztecProtocol/aztec-packages/commit/7ea4709743aaaf2768d35d92cad3fbd4a8404fb0))\r\n* Fixing MacOS build - static_cast from field issue\r\n([#8642](https://github.com/AztecProtocol/aztec-packages/issues/8642))\r\n([14ff3cf](https://github.com/AztecProtocol/aztec-packages/commit/14ff3cfb4291c288113695a3f2245340587fc8e9))\r\n* Gas premiums for AVM side effects, DA gas in AVM\r\n([#8632](https://github.com/AztecProtocol/aztec-packages/issues/8632))\r\n([d5f16cc](https://github.com/AztecProtocol/aztec-packages/commit/d5f16cc41bc077f24947fc92af2767630e928ed8))\r\n* Make structs pub\r\n([#8760](https://github.com/AztecProtocol/aztec-packages/issues/8760))\r\n([7bb2a38](https://github.com/AztecProtocol/aztec-packages/commit/7bb2a382e83bf422f90b3b144ae5c1d4e7adf227))\r\n* Migrate higher-level APIs for barretenberg to bb.js\r\n([#8677](https://github.com/AztecProtocol/aztec-packages/issues/8677))\r\n([0237a20](https://github.com/AztecProtocol/aztec-packages/commit/0237a20c989f2b37a64ee18b41c1da361363a81f))\r\n* Misc cleanup\r\n([#8748](https://github.com/AztecProtocol/aztec-packages/issues/8748))\r\n([e92da1f](https://github.com/AztecProtocol/aztec-packages/commit/e92da1f89974f8a51d491a0facc857fe774bf2fb))\r\n* Protogalaxy recursive verifier matches native verifier\r\n([#8568](https://github.com/AztecProtocol/aztec-packages/issues/8568))\r\n([a4f61b3](https://github.com/AztecProtocol/aztec-packages/commit/a4f61b39c39bf01a1071b52bbf042408f29d5564))\r\n* Re-add blob library to CI\r\n([#8734](https://github.com/AztecProtocol/aztec-packages/issues/8734))\r\n([4615fcc](https://github.com/AztecProtocol/aztec-packages/commit/4615fcc1c8b66d4ea71e0cd9c840656b152d05eb))\r\n* Reduce redundant event fetching\r\n([#8628](https://github.com/AztecProtocol/aztec-packages/issues/8628))\r\n([6903291](https://github.com/AztecProtocol/aztec-packages/commit/690329113876129fcdde52daf9f59f3dcad6949d))\r\n* Reinstate skipped tests\r\n([#8743](https://github.com/AztecProtocol/aztec-packages/issues/8743))\r\n([18e2697](https://github.com/AztecProtocol/aztec-packages/commit/18e2697d8791b4533e042ec04526e32922b608bc))\r\n* Remove bubble_up_constrains\r\n(https://github.com/noir-lang/noir/pull/6127)\r\n([4522c4f](https://github.com/AztecProtocol/aztec-packages/commit/4522c4f428b288825013d7c38c5a4cbc5b8c8f58))\r\n* Remove creation of extra toml file in recursion inputs flow\r\n([#8700](https://github.com/AztecProtocol/aztec-packages/issues/8700))\r\n([014bacc](https://github.com/AztecProtocol/aztec-packages/commit/014bacc0b2f1d56f416a3ab939b8aa5ad90656dd))\r\n* Remove empty file\r\n([#8724](https://github.com/AztecProtocol/aztec-packages/issues/8724))\r\n([d5b91b8](https://github.com/AztecProtocol/aztec-packages/commit/d5b91b8992c4c087991e824c9b3618476f83f13c))\r\n* Remove key rotation from the key store\r\n([#8645](https://github.com/AztecProtocol/aztec-packages/issues/8645))\r\n([d8bcb9f](https://github.com/AztecProtocol/aztec-packages/commit/d8bcb9f16537d5ec9c8f7a7f48efa3e6e767fa28))\r\n* Remove multiple public dbs\r\n([#8585](https://github.com/AztecProtocol/aztec-packages/issues/8585))\r\n([75b7b60](https://github.com/AztecProtocol/aztec-packages/commit/75b7b60456ded2c18f493aaa12306b49cc64ec21))\r\n* Remove PublicContextInputs\r\n([#8770](https://github.com/AztecProtocol/aztec-packages/issues/8770))\r\n([1507762](https://github.com/AztecProtocol/aztec-packages/commit/150776269b557703552826f90915c85adb639137))\r\n* Remove special sync behaviour of `verify_honk_proof`\r\n([#8676](https://github.com/AztecProtocol/aztec-packages/issues/8676))\r\n([a9e412b](https://github.com/AztecProtocol/aztec-packages/commit/a9e412bd49a8f0071906102eef07dd3248303443))\r\n* Remove unnecessary `Prover.toml`s\r\n(https://github.com/noir-lang/noir/pull/6140)\r\n([0d9f547](https://github.com/AztecProtocol/aztec-packages/commit/0d9f547d4e470a1e5383c1fff4c0c6125169de19))\r\n* Remove unused imports\r\n([#8766](https://github.com/AztecProtocol/aztec-packages/issues/8766))\r\n([420dd64](https://github.com/AztecProtocol/aztec-packages/commit/420dd642a4860e08b33b61e6bdd28efdc453ee6f))\r\n* Remove unused TypeVariableKind::Constant\r\n(https://github.com/noir-lang/noir/pull/6053)\r\n([3e0067a](https://github.com/AztecProtocol/aztec-packages/commit/3e0067a11935d4f2ead9579458d3c00c2f27f1ef))\r\n* Removing implicit numeric generics\r\n(https://github.com/noir-lang/noir/pull/5837)\r\n([3e0067a](https://github.com/AztecProtocol/aztec-packages/commit/3e0067a11935d4f2ead9579458d3c00c2f27f1ef))\r\n* Rename CustomAtrribute to CustomAttribute\r\n(https://github.com/noir-lang/noir/pull/6038)\r\n([7ea4709](https://github.com/AztecProtocol/aztec-packages/commit/7ea4709743aaaf2768d35d92cad3fbd4a8404fb0))\r\n* Replace relative paths to noir-protocol-circuits\r\n([00b1e61](https://github.com/AztecProtocol/aztec-packages/commit/00b1e61e4bda15aa456675f09129cd502438f823))\r\n* Replace relative paths to noir-protocol-circuits\r\n([d031f8f](https://github.com/AztecProtocol/aztec-packages/commit/d031f8fec1197b7abda8cfed07ed0797bee891d7))\r\n* Replace relative paths to noir-protocol-circuits\r\n([0f5dd09](https://github.com/AztecProtocol/aztec-packages/commit/0f5dd09b80cb5c6b5e7332520a0451863bc0e28a))\r\n* Replace relative paths to noir-protocol-circuits\r\n([755f484](https://github.com/AztecProtocol/aztec-packages/commit/755f48433df9f940ef472fc923be39576d3a8cfe))\r\n* Replace relative paths to noir-protocol-circuits\r\n([3d4e79a](https://github.com/AztecProtocol/aztec-packages/commit/3d4e79a3cad83b09f55d9ab503ab6b789892a66e))\r\n* Replace relative paths to noir-protocol-circuits\r\n([1bd828f](https://github.com/AztecProtocol/aztec-packages/commit/1bd828f57fea834d8a04e9261c92b2378c5c0fd5))\r\n* Schnorr signature verification in Noir\r\n(https://github.com/noir-lang/noir/pull/5437)\r\n([03b9e71](https://github.com/AztecProtocol/aztec-packages/commit/03b9e71e5ebb3d46827671b2197697b5d294d04e))\r\n* Skip p2p integration\r\n([#8779](https://github.com/AztecProtocol/aztec-packages/issues/8779))\r\n([48de45d](https://github.com/AztecProtocol/aztec-packages/commit/48de45de03b840e8c663f65af2ea866353eabb9b))\r\n* Skip some tests in CI\r\n([#8738](https://github.com/AztecProtocol/aztec-packages/issues/8738))\r\n([251db7b](https://github.com/AztecProtocol/aztec-packages/commit/251db7be2d7541852de314a13a85205b4b3a0418))\r\n* Split `noirc_frontend/src/tests.rs` into submodules\r\n(https://github.com/noir-lang/noir/pull/6139)\r\n([0d9f547](https://github.com/AztecProtocol/aztec-packages/commit/0d9f547d4e470a1e5383c1fff4c0c6125169de19))\r\n* Use config object to make phase manager less noisy\r\n([#8586](https://github.com/AztecProtocol/aztec-packages/issues/8586))\r\n([5a5f2b2](https://github.com/AztecProtocol/aztec-packages/commit/5a5f2b25c00aadd3fa014a81f21b5d01e83e360d))\r\n* Use panic instead of assert\r\n([#8703](https://github.com/AztecProtocol/aztec-packages/issues/8703))\r\n([c96d923](https://github.com/AztecProtocol/aztec-packages/commit/c96d923cd94503fc4c408fde3366c55778e37e82))\r\n* Use random ports in p2p_client tests\r\n([#8624](https://github.com/AztecProtocol/aztec-packages/issues/8624))\r\n([650a241](https://github.com/AztecProtocol/aztec-packages/commit/650a241faee7d2c9be5d0ea071b26b275fb09b39))\r\n</details>\r\n\r\n<details><summary>barretenberg: 0.56.0</summary>\r\n\r\n##\r\n[0.56.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.55.1...barretenberg-v0.56.0)\r\n(2024-09-25)\r\n\r\n\r\n### ⚠ BREAKING CHANGES\r\n\r\n* change ec_add to unsafe implementation (but much better perf)\r\n([#8374](https://github.com/AztecProtocol/aztec-packages/issues/8374))\r\n* **avm:** GETENVVAR + ISSTATICCALL\r\n([#8692](https://github.com/AztecProtocol/aztec-packages/issues/8692))\r\n* remove sha256 opcode\r\n([#4571](https://github.com/AztecProtocol/aztec-packages/issues/4571))\r\n* add support for u1 in the avm, ToRadix's radix arg is a memory addr\r\n([#8570](https://github.com/AztecProtocol/aztec-packages/issues/8570))\r\n* **avm:** remove tag in NOT\r\n([#8606](https://github.com/AztecProtocol/aztec-packages/issues/8606))\r\n\r\n### Features\r\n\r\n* (LSP) suggest $vars inside `quote { ... }`\r\n(https://github.com/noir-lang/noir/pull/6114)\r\n([7a87314](https://github.com/AztecProtocol/aztec-packages/commit/7a873147444ef03bc1df88e0fdca3cf6fc124725))\r\n* Add initial integration of databus\r\n([#8710](https://github.com/AztecProtocol/aztec-packages/issues/8710))\r\n([779e104](https://github.com/AztecProtocol/aztec-packages/commit/779e10499cfe668506ba8a199342cf86fae258a7))\r\n* Add support for u1 in the avm, ToRadix's radix arg is a memory addr\r\n([#8570](https://github.com/AztecProtocol/aztec-packages/issues/8570))\r\n([1785737](https://github.com/AztecProtocol/aztec-packages/commit/178573738731e2e74e4119a035f913da39675d85))\r\n* Aggregate honk and avm recursion constraints together\r\n([#8696](https://github.com/AztecProtocol/aztec-packages/issues/8696))\r\n([3fa9e83](https://github.com/AztecProtocol/aztec-packages/commit/3fa9e83c0fac460f586572fe2866823fe7f740d2))\r\n* **avm:** Avm recursive TS/Noir integration\r\n([#8531](https://github.com/AztecProtocol/aztec-packages/issues/8531))\r\n([dd09f05](https://github.com/AztecProtocol/aztec-packages/commit/dd09f057e97ac1bba7b3fbf29b50737ebe5ca76f)),\r\ncloses\r\n[#7791](https://github.com/AztecProtocol/aztec-packages/issues/7791)\r\n* **avm:** Avm recursive TS/Noir integration\r\n([#8611](https://github.com/AztecProtocol/aztec-packages/issues/8611))\r\n([e417231](https://github.com/AztecProtocol/aztec-packages/commit/e4172318af81ac2ac8535c89d3e5afc72d33ba29))\r\n* **avm:** Bounded mle implementation\r\n([#8668](https://github.com/AztecProtocol/aztec-packages/issues/8668))\r\n([aa85f2a](https://github.com/AztecProtocol/aztec-packages/commit/aa85f2a781223f067291b5702f2e47baced865fd)),\r\ncloses\r\n[#8651](https://github.com/AztecProtocol/aztec-packages/issues/8651)\r\n* **avm:** GETENVVAR + ISSTATICCALL\r\n([#8692](https://github.com/AztecProtocol/aztec-packages/issues/8692))\r\n([02cff0b](https://github.com/AztecProtocol/aztec-packages/commit/02cff0b525d9d6b1c854219f06713a8b94a8e9f5))\r\n* **avm:** Opcode STATICCALL - stubbed\r\n([#8601](https://github.com/AztecProtocol/aztec-packages/issues/8601))\r\n([facff7f](https://github.com/AztecProtocol/aztec-packages/commit/facff7fd0b6ea57e91f7d3e3863435655d8b48ea)),\r\ncloses\r\n[#8596](https://github.com/AztecProtocol/aztec-packages/issues/8596)\r\n* **avm:** Remove tag in NOT\r\n([#8606](https://github.com/AztecProtocol/aztec-packages/issues/8606))\r\n([d5695fc](https://github.com/AztecProtocol/aztec-packages/commit/d5695fcde93cbfda3e45bfa03988a9e72f2dcb59))\r\n* **avm:** Set avm circuit subgroup size\r\n([#8537](https://github.com/AztecProtocol/aztec-packages/issues/8537))\r\n([3b78058](https://github.com/AztecProtocol/aztec-packages/commit/3b78058288edbbe18a2eb8c81de5576c8a9478ab))\r\n* Benchmark compute_row_evaluations and update analysis script\r\n([#8673](https://github.com/AztecProtocol/aztec-packages/issues/8673))\r\n([c738c47](https://github.com/AztecProtocol/aztec-packages/commit/c738c47bd13875ba1649d808e7abd2908fa29e07))\r\n* Constant sized PG proofs and const sized PG rec verifier\r\n([#8605](https://github.com/AztecProtocol/aztec-packages/issues/8605))\r\n([09e2f44](https://github.com/AztecProtocol/aztec-packages/commit/09e2f447b003ed4c77b12069893785851a2c6258))\r\n* LSP autocompletion for `TypePath`\r\n(https://github.com/noir-lang/noir/pull/6117)\r\n([7a87314](https://github.com/AztecProtocol/aztec-packages/commit/7a873147444ef03bc1df88e0fdca3cf6fc124725))\r\n* Make UltraKeccak work with Shplemini at bb-level\r\n([#8646](https://github.com/AztecProtocol/aztec-packages/issues/8646))\r\n([82b60eb](https://github.com/AztecProtocol/aztec-packages/commit/82b60ebbdb18400363248b80986c993df1b7e4af))\r\n* More robust recursion input generator\r\n([#8634](https://github.com/AztecProtocol/aztec-packages/issues/8634))\r\n([020d4fd](https://github.com/AztecProtocol/aztec-packages/commit/020d4fd0cf4137e21f55b1c41e9e381a27191d84))\r\n* **perf:** Allow array set last uses optimization in return block of\r\nBrillig functions (https://github.com/noir-lang/noir/pull/6119)\r\n([7a87314](https://github.com/AztecProtocol/aztec-packages/commit/7a873147444ef03bc1df88e0fdca3cf6fc124725))\r\n* Pretty print Quoted token stream\r\n(https://github.com/noir-lang/noir/pull/6111)\r\n([7a87314](https://github.com/AztecProtocol/aztec-packages/commit/7a873147444ef03bc1df88e0fdca3cf6fc124725))\r\n* Public kernel handles enqueued calls\r\n([#8523](https://github.com/AztecProtocol/aztec-packages/issues/8523))\r\n([6303b4a](https://github.com/AztecProtocol/aztec-packages/commit/6303b4afbc39715e92d5ca7ae5100c60f6398686))\r\n* Reduce max memory in translator by freeing accumulator and eccvm\r\n([#8253](https://github.com/AztecProtocol/aztec-packages/issues/8253))\r\n([7247ddb](https://github.com/AztecProtocol/aztec-packages/commit/7247ddba274e691a7c5220848caf1fa9d6aa911e))\r\n* Remove sha256 opcode\r\n([#4571](https://github.com/AztecProtocol/aztec-packages/issues/4571))\r\n([4b4a0bf](https://github.com/AztecProtocol/aztec-packages/commit/4b4a0bf17050893f913b3db10bc70a584b7aaa5e))\r\n* Represent assertions more similarly to function calls\r\n(https://github.com/noir-lang/noir/pull/6103)\r\n([7a87314](https://github.com/AztecProtocol/aztec-packages/commit/7a873147444ef03bc1df88e0fdca3cf6fc124725))\r\n* Use new IVC scheme\r\n([#8480](https://github.com/AztecProtocol/aztec-packages/issues/8480))\r\n([1c7b06d](https://github.com/AztecProtocol/aztec-packages/commit/1c7b06d6621d9873f84147b2b7f1f22bf21bbacb))\r\n\r\n\r\n### Bug Fixes\r\n\r\n* **avm:** Fix tests under proving\r\n([#8640](https://github.com/AztecProtocol/aztec-packages/issues/8640))\r\n([8bfc769](https://github.com/AztecProtocol/aztec-packages/commit/8bfc769d7cbd6f88bfa7926c051a329ee0fd3468))\r\n* Boomerang variable in sha256 hash function\r\n([#8581](https://github.com/AztecProtocol/aztec-packages/issues/8581))\r\n([f2a1330](https://github.com/AztecProtocol/aztec-packages/commit/f2a13309f544bbd83b593e6a6207d49d9ef48b74))\r\n* Decode databus return values\r\n(https://github.com/noir-lang/noir/pull/6095)\r\n([7a87314](https://github.com/AztecProtocol/aztec-packages/commit/7a873147444ef03bc1df88e0fdca3cf6fc124725))\r\n* Disambiguate field or int static trait method call\r\n(https://github.com/noir-lang/noir/pull/6112)\r\n([7a87314](https://github.com/AztecProtocol/aztec-packages/commit/7a873147444ef03bc1df88e0fdca3cf6fc124725))\r\n* **mem2reg:** Remove possibility of underflow\r\n(https://github.com/noir-lang/noir/pull/6107)\r\n([7a87314](https://github.com/AztecProtocol/aztec-packages/commit/7a873147444ef03bc1df88e0fdca3cf6fc124725))\r\n* New commit_sparse bug and new tests\r\n([#8649](https://github.com/AztecProtocol/aztec-packages/issues/8649))\r\n([5818018](https://github.com/AztecProtocol/aztec-packages/commit/581801863529cd2b437cb51b041ada17a96949e0))\r\n* **revert:** \"chore!: change ec_add to unsafe implementation (but much\r\nbetter perf)\"\r\n([#8722](https://github.com/AztecProtocol/aztec-packages/issues/8722))\r\n([9a1b5b5](https://github.com/AztecProtocol/aztec-packages/commit/9a1b5b5fdd3194f4e7833aacbca4f48aadafbd74))\r\n* Unencryptedlogs witgen\r\n([#8669](https://github.com/AztecProtocol/aztec-packages/issues/8669))\r\n([aee4c2d](https://github.com/AztecProtocol/aztec-packages/commit/aee4c2dde7576fad1c47e407ee0dca43dac2b1b4))\r\n* **world_state:** Fix race conditions in WorldState and IndexedTree\r\n([#8612](https://github.com/AztecProtocol/aztec-packages/issues/8612))\r\n([6797525](https://github.com/AztecProtocol/aztec-packages/commit/679752542edf1667d58e8839aca05d2b9fcc7da6))\r\n\r\n\r\n### Miscellaneous\r\n\r\n* Add more cases for assert_equal conversion\r\n([#8446](https://github.com/AztecProtocol/aztec-packages/issues/8446))\r\n([e3ea298](https://github.com/AztecProtocol/aztec-packages/commit/e3ea298fd1f7326199e6e35b3523aadb2b12a925))\r\n* **avm:** Simplify bb-prover and other AVM tests\r\n([#8627](https://github.com/AztecProtocol/aztec-packages/issues/8627))\r\n([0d75363](https://github.com/AztecProtocol/aztec-packages/commit/0d7536395f2406a22a76f15d01114730c84edc18))\r\n* **avm:** Smaller skippable test\r\n([#8664](https://github.com/AztecProtocol/aztec-packages/issues/8664))\r\n([2418977](https://github.com/AztecProtocol/aztec-packages/commit/241897733fe0a5e2ccdf322449debd367f458086))\r\n* **bb readme:** Document how to Honk Noir programs\r\n([#7638](https://github.com/AztecProtocol/aztec-packages/issues/7638))\r\n([cd46ddd](https://github.com/AztecProtocol/aztec-packages/commit/cd46ddd96539f2db466d1116dabdb838d2a807e7))\r\n* Bye bye Zeromorph in Solidity\r\n([#8678](https://github.com/AztecProtocol/aztec-packages/issues/8678))\r\n([74182c4](https://github.com/AztecProtocol/aztec-packages/commit/74182c40e152e988ee8590f39c51d00150ef01ca))\r\n* Change ec_add to unsafe implementation (but much better perf)\r\n([#8374](https://github.com/AztecProtocol/aztec-packages/issues/8374))\r\n([aabd2d8](https://github.com/AztecProtocol/aztec-packages/commit/aabd2d85d4f3f35d67d53421b47214aa8904c505))\r\n* Create a Gemini prover\r\n([#8622](https://github.com/AztecProtocol/aztec-packages/issues/8622))\r\n([94339fb](https://github.com/AztecProtocol/aztec-packages/commit/94339fbfc7c0c822dc1497c113d48f74a89f1bad))\r\n* Delete duplicated test (https://github.com/noir-lang/noir/pull/6113)\r\n([7a87314](https://github.com/AztecProtocol/aztec-packages/commit/7a873147444ef03bc1df88e0fdca3cf6fc124725))\r\n* **docs:** Removing old versions\r\n(https://github.com/noir-lang/noir/pull/6075)\r\n([7a87314](https://github.com/AztecProtocol/aztec-packages/commit/7a873147444ef03bc1df88e0fdca3cf6fc124725))\r\n* Ec addition for non-zero points\r\n(https://github.com/noir-lang/noir/pull/5858)\r\n([7a87314](https://github.com/AztecProtocol/aztec-packages/commit/7a873147444ef03bc1df88e0fdca3cf6fc124725))\r\n* Fixing MacOS build - static_cast from field issue\r\n([#8642](https://github.com/AztecProtocol/aztec-packages/issues/8642))\r\n([14ff3cf](https://github.com/AztecProtocol/aztec-packages/commit/14ff3cfb4291c288113695a3f2245340587fc8e9))\r\n* Gas premiums for AVM side effects, DA gas in AVM\r\n([#8632](https://github.com/AztecProtocol/aztec-packages/issues/8632))\r\n([d5f16cc](https://github.com/AztecProtocol/aztec-packages/commit/d5f16cc41bc077f24947fc92af2767630e928ed8))\r\n* Migrate higher-level APIs for barretenberg to bb.js\r\n([#8677](https://github.com/AztecProtocol/aztec-packages/issues/8677))\r\n([0237a20](https://github.com/AztecProtocol/aztec-packages/commit/0237a20c989f2b37a64ee18b41c1da361363a81f))\r\n* Protogalaxy recursive verifier matches native verifier\r\n([#8568](https://github.com/AztecProtocol/aztec-packages/issues/8568))\r\n([a4f61b3](https://github.com/AztecProtocol/aztec-packages/commit/a4f61b39c39bf01a1071b52bbf042408f29d5564))\r\n* Reinstate skipped tests\r\n([#8743](https://github.com/AztecProtocol/aztec-packages/issues/8743))\r\n([18e2697](https://github.com/AztecProtocol/aztec-packages/commit/18e2697d8791b4533e042ec04526e32922b608bc))\r\n* Remove creation of extra toml file in recursion inputs flow\r\n([#8700](https://github.com/AztecProtocol/aztec-packages/issues/8700))\r\n([014bacc](https://github.com/AztecProtocol/aztec-packages/commit/014bacc0b2f1d56f416a3ab939b8aa5ad90656dd))\r\n* Skip some tests in CI\r\n([#8738](https://github.com/AztecProtocol/aztec-packages/issues/8738))\r\n([251db7b](https://github.com/AztecProtocol/aztec-packages/commit/251db7be2d7541852de314a13a85205b4b3a0418))\r\n</details>\r\n\r\n---\r\nThis PR was generated with [Release\r\nPlease](https://github.com/googleapis/release-please). See\r\n[documentation](https://github.com/googleapis/release-please#release-please).",
          "timestamp": "2024-09-25T15:19:52Z",
          "tree_id": "cb6d3f0297f051e1d60e3b222ca64acb376b1998",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8f72bc17ab95a93f42255658abe2823b27681aad"
        },
        "date": 1727279052621,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 35919.30272799999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 33121.84034 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5142.553958000008,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4661.995045000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 100198.73401999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 100198734000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14671.383478000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14671384000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8638956193,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8638956193 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 152612408,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 152612408 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 7029780621,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 7029780621 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 128493472,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 128493472 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "105737703+iakovenkos@users.noreply.github.com",
            "name": "iakovenkos",
            "username": "iakovenkos"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "5e4cfa7b0159f66e59365f14c02fe8bbf4a73935",
          "message": "chore: removing hack commitment from eccvm (#8825)\n\n* removed hack commitment from eccvm",
          "timestamp": "2024-09-26T16:35:42Z",
          "tree_id": "158d893ab12cef4060ec5c03f11b8eef79e64393",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5e4cfa7b0159f66e59365f14c02fe8bbf4a73935"
        },
        "date": 1727369650358,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 35445.53959999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 32776.589634 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5067.9524929999925,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4607.685734000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 99689.706864,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 99689706000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14570.950128000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14570950000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8499629290,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8499629290 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 151259793,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 151259793 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6918585715,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6918585715 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 128861311,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 128861311 ns\nthreads: 1"
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
          "id": "c8cbc3388c2bbe9a0ba8a95717e1b71c602d58e3",
          "message": "feat: make shplemini proof constant (#8826)\n\nMake Shplemini proofs constant using the same approach as in other\r\nplaces, add relevant github issues for handling the dummy rounds\r\nproperly, make the shplemini recursion test do full verification and\r\nensure recursive shplemini verifiers actually stay constant.",
          "timestamp": "2024-09-26T16:57:42Z",
          "tree_id": "a3df21904c8e5c17ed0b60a2f55eeea9bb0987c6",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c8cbc3388c2bbe9a0ba8a95717e1b71c602d58e3"
        },
        "date": 1727371323146,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 35536.94134400001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 33244.83370999999 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5060.799519,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4656.218495 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 100064.39638500001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 100064396000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14638.624699000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14638625000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8529050715,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8529050715 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 152994515,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 152994515 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6939897215,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6939897215 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126063488,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126063488 ns\nthreads: 1"
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
          "id": "68ba5d443a79c06d972019abe39faaf851bb3247",
          "message": "chore(bb.js): strip wasm-threads again (#8833)\n\nper community request, closes #941",
          "timestamp": "2024-09-26T14:59:29-04:00",
          "tree_id": "52510dbcb108b5e0cb59e2207755051fdb8c9f06",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/68ba5d443a79c06d972019abe39faaf851bb3247"
        },
        "date": 1727378930010,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 35545.45031699999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 32994.146046 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5067.817661999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4642.186872000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 99927.02935000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 99927030000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14595.011742,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14595012000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8534346218,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8534346218 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 154415404,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 154415404 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6933373917,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6933373917 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 125647041,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 125647041 ns\nthreads: 1"
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
          "id": "59e3dd93a70398e828269dbf13d8c4b9b38227ea",
          "message": "feat: Use structured polys to reduce prover memory (#8587)\n\nWe use the new structured polynomial class to reduce the amount of\r\nmemory used by the Prover. For ClientIVCBench, this results in a\r\nreduction of 36.5%, going from 2377.99MiB to 1511.34MiB.\r\n\r\nThis is due to a restricting polynomials down to smaller sizes. For\r\nlagrange_first and last, we only allocate 1 element. For the gate\r\nselectors, we only allocate the fixed block size for each one, cutting\r\nthe 8 gate selectors into almost 1 selector (caveat is that the\r\narithmetic selector spans the aux block for now). For the 5 ecc_op\r\npolynomials, we restrict them to just the ecc_op block. For 9 of the 10\r\ndatabus polynomials, we restrict them to MAX_DATABUS_SIZE. For the 4\r\ntable polynomials and the lookup read counts and read tag polynomials,\r\nwe restrict them to MAX_LOOKUP_TABLES_SIZE. We also restrict the inverse\r\npolynomials, but this is complicated to explain.\r\n\r\nOverall, this essentially allows us to cut down on 28 of the 54 total\r\npolynomials, which leads to the drop of 867MiB.\r\n\r\nThere's more juice to be squeezed here, but this is a massive reduction\r\nthat should basically get us there.\r\n\r\nBefore:\r\n<img width=\"1331\" alt=\"Screenshot 2024-09-20 at 5 00 27 PM\"\r\nsrc=\"https://github.com/user-attachments/assets/7572a5d2-4fa9-4b4f-af1d-7885260d6756\">\r\nAfter:\r\n<img width=\"1363\" alt=\"Screenshot 2024-09-26 at 10 03 54 AM\"\r\nsrc=\"https://github.com/user-attachments/assets/aed64b1d-862c-4a21-9e32-160993d1f5c3\">\r\n\r\nFor one instance, we cut down memory by 97MiB. \r\n\r\nAnd timing benchmark:\r\n```\r\n--------------------------------------------------------------------------------\r\nBenchmark                      Time             CPU   Iterations UserCounters...\r\n--------------------------------------------------------------------------------\r\nClientIVCBench/Full/6      33216 ms        30637 ms            1 Arithmetic::accumulate=3.89126M Arithmetic::accumulate(t)=7.32768G Auxiliary::accumulate=1.98134M Auxiliary::accumulate(t)=13.4156G COMMIT::databus=108 COMMIT::databus(t)=8.50634M COMMIT::databus_inverses=36 COMMIT::databus_inverses(t)=11.8267M COMMIT::ecc_op_wires=48 COMMIT::ecc_op_wires(t)=38.2178M COMMIT::lookup_counts_tags=12 COMMIT::lookup_counts_tags(t)=107.571M COMMIT::lookup_inverses=12 COMMIT::lookup_inverses(t)=257.772M COMMIT::wires=24 COMMIT::wires(t)=2.23405G COMMIT::z_perm=12 COMMIT::z_perm(t)=2.31578G DatabusRead::accumulate=447 DatabusRead::accumulate(t)=1.72333M Decider::construct_proof=1 Decider::construct_proof(t)=1.57152G DeciderProvingKey(Circuit&)=12 DeciderProvingKey(Circuit&)(t)=2.63528G DeltaRange::accumulate=1.87876M DeltaRange::accumulate(t)=4.27884G ECCVMProver(CircuitBuilder&)=1 ECCVMProver(CircuitBuilder&)(t)=228.84M ECCVMProver::construct_proof=1 ECCVMProver::construct_proof(t)=2.59672G Elliptic::accumulate=183.692k Elliptic::accumulate(t)=451.988M Goblin::merge=23 Goblin::merge(t)=116.924M Lookup::accumulate=1.66363M Lookup::accumulate(t)=3.74588G MegaFlavor::get_row=6.18564M MegaFlavor::get_row(t)=4.44329G OinkProver::execute_grand_product_computation_round=12 OinkProver::execute_grand_product_computation_round(t)=3.59852G OinkProver::execute_log_derivative_inverse_round=12 OinkProver::execute_log_derivative_inverse_round(t)=2.4985G OinkProver::execute_preamble_round=12 OinkProver::execute_preamble_round(t)=178.858k OinkProver::execute_sorted_list_accumulator_round=12 OinkProver::execute_sorted_list_accumulator_round(t)=683.402M OinkProver::execute_wire_commitments_round=12 OinkProver::execute_wire_commitments_round(t)=1.71268G OinkProver::generate_alphas_round=12 OinkProver::generate_alphas_round(t)=3.50247M Permutation::accumulate=10.6427M Permutation::accumulate(t)=40.1379G PoseidonExt::accumulate=30.452k PoseidonExt::accumulate(t)=76.6116M PoseidonInt::accumulate=210.454k PoseidonInt::accumulate(t)=365.722M ProtogalaxyProver::prove=11 ProtogalaxyProver::prove(t)=19.9675G ProtogalaxyProver_::combiner_quotient_round=11 ProtogalaxyProver_::combiner_quotient_round(t)=8.76403G ProtogalaxyProver_::compute_row_evaluations=11 ProtogalaxyProver_::compute_row_evaluations(t)=1.9728G ProtogalaxyProver_::perturbator_round=11 ProtogalaxyProver_::perturbator_round(t)=2.86884G ProtogalaxyProver_::run_oink_prover_on_each_incomplete_key=11 ProtogalaxyProver_::run_oink_prover_on_each_incomplete_key(t)=7.66211G ProtogalaxyProver_::update_target_sum_and_fold=11 ProtogalaxyProver_::update_target_sum_and_fold(t)=672.424M TranslatorCircuitBuilder::constructor=1 TranslatorCircuitBuilder::constructor(t)=32.9044M TranslatorProver=1 TranslatorProver(t)=43.1984M TranslatorProver::construct_proof=1 TranslatorProver::construct_proof(t)=832.913M batch_mul_with_endomorphism=16 batch_mul_with_endomorphism(t)=408.881M commit=543 commit(t)=6.5699G commit_sparse=36 commit_sparse(t)=11.813M compute_combiner=11 compute_combiner(t)=8.32169G compute_perturbator=11 compute_perturbator(t)=2.86857G compute_univariate=51 compute_univariate(t)=2.20204G construct_circuits=12 construct_circuits(t)=4.30706G pippenger=215 pippenger(t)=102.025M pippenger_unsafe_optimized_for_non_dyadic_polys=543 pippenger_unsafe_optimized_for_non_dyadic_polys(t)=6.56543G\r\nBenchmarking lock deleted.\r\nclient_ivc_bench.json                                                                                                                                                                                                                  100% 6930   190.2KB/s   00:00    \r\nfunction                                  ms     % sum\r\nconstruct_circuits(t)                   4307    13.35%\r\nDeciderProvingKey(Circuit&)(t)          2635     8.17%\r\nProtogalaxyProver::prove(t)            19967    61.90%\r\nDecider::construct_proof(t)             1572     4.87%\r\nECCVMProver(CircuitBuilder&)(t)          229     0.71%\r\nECCVMProver::construct_proof(t)         2597     8.05%\r\nTranslatorProver::construct_proof(t)     833     2.58%\r\nGoblin::merge(t)                         117     0.36%\r\n\r\nTotal time accounted for: 32257ms/33216ms = 97.11%\r\n\r\nMajor contributors:\r\nfunction                                  ms    % sum\r\ncommit(t)                               6570   20.37%\r\ncompute_combiner(t)                     8322   25.80%\r\ncompute_perturbator(t)                  2869    8.89%\r\ncompute_univariate(t)                   2202    6.83%\r\n\r\nBreakdown of ProtogalaxyProver::prove:\r\nProtogalaxyProver_::run_oink_prover_on_each_incomplete_key(t)    7662    38.37%\r\nProtogalaxyProver_::perturbator_round(t)                         2869    14.37%\r\nProtogalaxyProver_::combiner_quotient_round(t)                   8764    43.89%\r\nProtogalaxyProver_::update_target_sum_and_fold(t)                 672     3.37%\r\n\r\nRelation contributions (times to be interpreted relatively):\r\nTotal time accounted for (ms):    69802\r\noperation                       ms     % sum\r\nArithmetic::accumulate(t)     7328    10.50%\r\nPermutation::accumulate(t)   40138    57.50%\r\nLookup::accumulate(t)         3746     5.37%\r\nDeltaRange::accumulate(t)     4279     6.13%\r\nElliptic::accumulate(t)        452     0.65%\r\nAuxiliary::accumulate(t)     13416    19.22%\r\nEccOp::accumulate(t)             0     0.00%\r\nDatabusRead::accumulate(t)       2     0.00%\r\nPoseidonExt::accumulate(t)      77     0.11%\r\nPoseidonInt::accumulate(t)     366     0.52%\r\n\r\nCommitment contributions:\r\nTotal time accounted for (ms):     4974\r\noperation                          ms     % sum\r\nCOMMIT::wires(t)                 2234    44.92%\r\nCOMMIT::z_perm(t)                2316    46.56%\r\nCOMMIT::databus(t)                  9     0.17%\r\nCOMMIT::ecc_op_wires(t)            38     0.77%\r\nCOMMIT::lookup_inverses(t)        258     5.18%\r\nCOMMIT::databus_inverses(t)        12     0.24%\r\nCOMMIT::lookup_counts_tags(t)     108     2.16%\r\n```\r\n\r\nCompared to master, the notable differences are:\r\n`DeciderProvingKey(Circuit&)` was at 8043ms and now is 2635ms. \r\n`ProtogalaxyProver::prove` was 20953ms and now is 19967ms. Unclear if\r\nthis is expected or not.\r\n`commit` was 7033ms and is now 6570ms.",
          "timestamp": "2024-09-26T22:41:27Z",
          "tree_id": "f518bc5ff49fe54b3fddf811b27cac106ad7a30b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/59e3dd93a70398e828269dbf13d8c4b9b38227ea"
        },
        "date": 1727391452432,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 31207.888286000012,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 29021.836501999995 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4981.507071999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4614.328141999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 91602.233407,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 91602234000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14359.246843,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14359247000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8071548889,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8071548889 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 152176551,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 152176551 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 7000035319,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 7000035319 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 130370977,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 130370977 ns\nthreads: 1"
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
          "id": "06be26e2b5dfd4b1fa35f57231e15ebffbe410a7",
          "message": "feat: CI/local S3 build cache (#8802)\n\nWhat this PR achieves: Optional S3 caching in Earthly files with a 2nd\r\nlayer of file caching (except in C). A future step would be to use this\r\ncache locally for fast bootstrapping. Currently implemented for\r\nbarretenberg and noir.\r\n\r\nIf AWS credentials are available with this script, S3 will be used as a\r\ndownload source. Otherwise, just the local minio cache will be used. If\r\nboth are used, minio will act like a pull-through cache for S3 and\r\nprovide a two-tiered caching solution good for when earthly is being\r\nreally forgetful and you are using artifacts that have not changed in a\r\nwhile.\r\n\r\nUSAGE NOTE: After this PR, you will want to run on\r\nscripts/setup-earthly-local.sh or equivalent if not using zsh. This will\r\ncreate an alias for earthly as earthly-local in the repo, which sets up\r\nscripts and starts the (currently always on) file server.\r\n\r\nUSAGE NOTE: Because we use git to reliably make content hashes that\r\naren't prone to changing due to temporary files, we require all changes\r\nto be committed before we content hashes will be used. The cache will\r\nnot be used at all if there are staged changes. Taking feedback on this.\r\n\r\nI recommend doing something like `git commit -am 'sync' && earthly ...`\r\nif changing files in a loop (possibly with --amend). Remember to `git\r\nadd` new wanted files or you may get old cache.\r\n\r\nUSAGE NOTE: If you do not want AWS secrets in the env for every program\r\nyou can figure out your own wrapper alias, perhaps reading from files\r\n\r\nEARTHFILE DEV NOTE: There is a little bit of a dance to grab rebuild\r\npatterns and run with the git context on the local machine. To enable\r\nthis, WORKDIR needs to match the repo layout, some adjustments thusly\r\n\r\nBundled:\r\n- Just make build the root of the dependency tree in github. This should\r\nfix a lot of contention issues\r\n\r\nFollowups:\r\n- Cache protocol circuits and verification keys",
          "timestamp": "2024-09-27T13:21:09-04:00",
          "tree_id": "875973d039d2862163fece6af14a95659f7c8fda",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/06be26e2b5dfd4b1fa35f57231e15ebffbe410a7"
        },
        "date": 1727459645949,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 31386.048491999987,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 29089.141487999997 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4980.701887999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4655.577018 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 91437.90183799999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 91437901000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14356.946732,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14356946000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8067045587,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8067045587 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 152190005,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 152190005 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6555190176,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6555190176 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126340341,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126340341 ns\nthreads: 1"
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
          "id": "d8d0541bde1d98d6b7ae3c3bb2a38068383f802b",
          "message": "fix: bb.js acir tests (#8862)\n\nSomehow due to WASM strip. very odd",
          "timestamp": "2024-09-27T18:02:37-04:00",
          "tree_id": "96e408dc61647bbc6c736e7fd6859a494fd8a5ad",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d8d0541bde1d98d6b7ae3c3bb2a38068383f802b"
        },
        "date": 1727476053313,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 31287.410728,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 28373.634976999998 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4971.721653999993,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4687.3783969999995 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 91571.197438,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 91571198000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14383.331421,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14383332000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8041844227,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8041844227 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 151989324,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 151989324 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6583337060,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6583337060 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126726177,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126726177 ns\nthreads: 1"
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
          "id": "4354ae030b5b7e365ff0361e88cd74cd95d71e04",
          "message": "feat(avm): Integrate public inputs in AVM recursive verifier (#8846)\n\nResolves #8714",
          "timestamp": "2024-09-28T10:17:08Z",
          "tree_id": "bfb114f17a65fb9eeaf618715763a4dce20d01a4",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/4354ae030b5b7e365ff0361e88cd74cd95d71e04"
        },
        "date": 1727519881257,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 31237.94903199999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 28751.546442000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4981.9948709999835,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4673.422072 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 91525.805055,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 91525805000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14497.779775999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14497780000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8041327740,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8041327740 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 151726334,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 151726334 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6780932091,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6780932091 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 128536533,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 128536533 ns\nthreads: 1"
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
          "id": "fad3d6e41765c774696ecc98d45a27851c7c4442",
          "message": "feat: Faster CIV benching with mocked VKs (#8843)\n\nRather than going through a whole separate (and more expensive) CIVC\r\nprover flow to get vks, we just use random group elements. In order to\r\nget assurance that the benchmark is still a good reflection of\r\nperformance, we refactor the functions used in the benchmark to create\r\nan equivalent test.",
          "timestamp": "2024-09-30T03:44:01Z",
          "tree_id": "af576d80388a276e60020c87ec0dfd06a0dd81cb",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/fad3d6e41765c774696ecc98d45a27851c7c4442"
        },
        "date": 1727669036792,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 31708.77826999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 29374.254102000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5067.799370999993,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4770.776283 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 96144.082579,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 96144084000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14558.825446,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14558826000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8260900741,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8260900741 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 152813824,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 152813824 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6723423607,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6723423607 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 125016510,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 125016510 ns\nthreads: 1"
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
          "id": "ed1e23edff04ea026a94ffc22b29b6ef520cdf55",
          "message": "feat: Origin Tags part 1 (#8787)\n\nCreates the Origin Tag mechanism and implements it for the bool and\r\nfield stdlib primitives with tests.\r\nThe mechanism preserves the origin of a particular element, which will\r\nallow us to detect bad interactions of transcript elements",
          "timestamp": "2024-09-30T13:59:09Z",
          "tree_id": "52b8c2358d5972510b9f831cb314ad28164b9ca5",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ed1e23edff04ea026a94ffc22b29b6ef520cdf55"
        },
        "date": 1727706002836,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 31438.24954099999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 29138.560251000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4993.152302999988,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4687.819371 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 93209.18359199999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 93209185000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14526.573803999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14526574000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8182467376,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8182467376 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 153491092,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 153491092 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6653015305,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6653015305 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126591970,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126591970 ns\nthreads: 1"
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
          "id": "d8d04f6f0b9ca0aa36008dc53dde2562dc3afa63",
          "message": "feat: ultra honk on Shplemini (#8886)\n\nSwitch UltraHonk to Shplemini, ensure recursive verifier are entirely\r\nthe same by resolving `conditional_assign` usage that was causing\r\ndifferent sigma polynomials for different circuit sizes, update\r\nnecessary constants and Prover.toml file for e2e.\r\n\r\nProof size goes from 439 to 463 Frs (Zeromorph had 28 + 1 commitments as\r\npart of the proof, each representing 4 Frs, Shplemini has 27 commitments\r\nand 28 evaluations from Gemini and 1 commitment from Shplonk)\r\n\r\nUltraHonk recursive verifier size goes from 1370662 to 953211 with\r\nconstant proofs",
          "timestamp": "2024-10-01T13:03:43Z",
          "tree_id": "4bcbc3c7d6893e754ffe18af5e5c906805b5bf82",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d8d04f6f0b9ca0aa36008dc53dde2562dc3afa63"
        },
        "date": 1727789406322,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 31138.485177999995,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 28706.887753 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5381.946073999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5011.4008189999995 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 92495.310726,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 92495313000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15208.748772999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15208749000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8279163612,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8279163612 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 151756802,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 151756802 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6782291979,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6782291979 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126219431,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126219431 ns\nthreads: 1"
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
          "id": "784d483b592cb80da143634c07d330ba2f2c9ab7",
          "message": "fix(avm): kernel out full proving fix (#8873)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\r\nline.\r\n\r\n---------\r\n\r\nCo-authored-by: ludamad <adam.domurad@gmail.com>",
          "timestamp": "2024-10-02T09:56:03+02:00",
          "tree_id": "923c4234878f57bfe4ba8faaee4c1d9c53a8b92b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/784d483b592cb80da143634c07d330ba2f2c9ab7"
        },
        "date": 1727857384075,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 31084.297706,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 28612.352788000004 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5381.433342999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5050.473868 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 93925.751948,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 93925754000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15165.491071999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15165490000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8315417410,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8315417410 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 154544510,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 154544510 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6863039304,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6863039304 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126870562,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126870562 ns\nthreads: 1"
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
          "id": "dd3a27e5dc66fc47c34c077ca8124efe6fbea900",
          "message": "chore: reduce number of gates in stdlib/sha256 hash function (#8905)\n\nWe can reduce number of gates for round variables a and e in sha256.\r\n\r\nAt the start of the round variables a and e were converted in maj and ch\r\nform respectively. But after that their .sparse form was replaced in\r\nfunctions majority and choose with the same values, and this procedure\r\nadded some unnecessary gates.\r\n\r\nWe can fix this by just initializing a and e using default constructors\r\nand put in .normal part values of h_init[0] and h_init[4]. After that\r\nfunctions majority and choose will add in .sparse values of lookup\r\nautomatically\r\n\r\nAll tests for stdlib/sha256 have passed after this patch. As a result,\r\nnumber of gates from sha256_nist_vector_five were reduced from 65194 to\r\n65104.\r\n\r\n---------\r\n\r\nCo-authored-by: Rumata888 <isennovskiy@gmail.com>",
          "timestamp": "2024-10-02T12:02:06+01:00",
          "tree_id": "2b60cc2771c13cca401901df52d87709677d8451",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/dd3a27e5dc66fc47c34c077ca8124efe6fbea900"
        },
        "date": 1727869366814,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 31232.096049000007,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 28858.022785 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5350.360688000009,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4960.595332000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 94521.820242,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 94521822000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15177.618943,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15177619000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8295380391,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8295380391 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 151970561,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 151970561 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6749013898,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6749013898 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126724228,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126724228 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "105737703+iakovenkos@users.noreply.github.com",
            "name": "iakovenkos",
            "username": "iakovenkos"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "b8d87f12224ac7e1c4e0bf0e353ddc902bf82fd4",
          "message": "chore: Protogalaxy only instantiated with Mega (#8949)\n\n* removed instantiations of Protogalaxy with Ultra\r\n* fixed CombinerOn2Keys test: now it's working with Mega",
          "timestamp": "2024-10-02T10:52:33-04:00",
          "tree_id": "99daafc05d93c052f012c026e37f0a4ff745ce8e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/b8d87f12224ac7e1c4e0bf0e353ddc902bf82fd4"
        },
        "date": 1727882304444,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 31250.15423800002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 28750.195759000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5356.254743999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5045.897765999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 93412.843842,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 93412846000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15156.574219000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15156575000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8249261053,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8249261053 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 152354623,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 152354623 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6712830579,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6712830579 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 128639205,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 128639205 ns\nthreads: 1"
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
          "id": "670af8a158633d106a3f1df82dbd28ef9a9e4ceb",
          "message": "chore!: keccak_ultra -> ultra_keccak (#8878)\n\nIn main.cpp there are instances that list ultra_keccak and some that\r\nlist keccak_ultra, for the sake of consistency\r\nthis pr replaces keccak_ultra with the more frequently occuring\r\nultra_keccak",
          "timestamp": "2024-10-02T21:34:22+01:00",
          "tree_id": "80640c15e22130f500368cdf8206fdb081202f9c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/670af8a158633d106a3f1df82dbd28ef9a9e4ceb"
        },
        "date": 1727903376500,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 31047.319907,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 29119.374086 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5305.789994999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4992.055525 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 94290.529824,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 94290532000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15115.077844999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15115078000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8310842082,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8310842082 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 156216831,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 156216831 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6791256500,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6791256500 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 127630377,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 127630377 ns\nthreads: 1"
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
          "id": "0be9f253238cc1453d07385ece565f946d4212a3",
          "message": "feat: handle consecutive kernels in IVC (#8924)\n\nPrior to this PR, the IVC scheme made the assumption that every other\r\ncircuit was a kernel, i.e. app, kernel, app, kernel, ... etc. In\r\npractice, however, it will be common to have two or more consecutive\r\nkernels without a corresponding app, e.g. an inner kernel followed\r\nimmediately by a reset kernel. This PR updates the IVC so that whether\r\nor not a circuit is treated as a kernel is determined by the the already\r\nexisting tag `circuit.databus_propagation_data.is_kernel`.\r\n\r\nWhen constructing circuits from noir programs, the above flag is set to\r\ntrue if and only if the circuit has calldata (which apps never do). This\r\nallows us to reinstate the full set of circuits in the ivc integration\r\ntest suite which contains 3 consecutive kernels (inner, reset, tail).\r\n\r\nIn accordance with this change I had to add explicit setting of\r\n`is_kernel` to various test suites and flows which previously utilized\r\nthe default assumption that every other circuit was a kernel. (Many of\r\nthese cases will soon go away once we are ready to do away with the\r\n`auto_verify_mode` version of IVC which exists for testing convenience\r\nand does not have any practical use case).\r\n\r\nCloses https://github.com/AztecProtocol/barretenberg/issues/1111",
          "timestamp": "2024-10-02T17:37:47-07:00",
          "tree_id": "aff8bc75474670514ae549ec06fe1bd011eee530",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0be9f253238cc1453d07385ece565f946d4212a3"
        },
        "date": 1727917436050,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 31229.453952,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 28577.314629 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5390.564364,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5042.72941 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 93358.21393,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 93358216000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15252.08557,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15252086000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8346032354,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8346032354 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 157999174,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 157999174 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6847211625,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6847211625 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 127829117,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 127829117 ns\nthreads: 1"
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
          "id": "9b66a3e3d1a38b31cdad29f9fd9aee05738b066c",
          "message": "chore: Remove unused methods and small state cleanup (#8968)\n\nTranslator flavor had several unused getters that have been removed.\r\nAdditionally, the PrecomputedEntities included methods operating on\r\npolynomials and modifying state which should be done as part of the\r\nProvingKey.",
          "timestamp": "2024-10-03T10:28:29Z",
          "tree_id": "1124e394fa866a9d3cb77011448c1a9aca2530db",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9b66a3e3d1a38b31cdad29f9fd9aee05738b066c"
        },
        "date": 1727953429283,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 31016.19104000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 28496.999767999998 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5297.659741000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4939.838331000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 93251.570847,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 93251572000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15123.134489000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15123134000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8249008516,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8249008516 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 151501096,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 151501096 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6753285387,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6753285387 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126546252,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126546252 ns\nthreads: 1"
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
          "id": "818325ae35ce0260d88e097261d173f4dc326cbe",
          "message": "feat(avm): Skip gas accounting for fake rows (#8944)\n\nResolves #8903",
          "timestamp": "2024-10-03T16:19:32+02:00",
          "tree_id": "093c9694009ba7279afa14af252df16c6406c9ed",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/818325ae35ce0260d88e097261d173f4dc326cbe"
        },
        "date": 1727966596930,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 30920.868972999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 28387.48912 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5275.641407000009,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4916.093936 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 92742.06545499999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 92742067000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15142.595252,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15142595000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8265688094,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8265688094 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 150745432,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 150745432 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6688807263,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6688807263 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 125984275,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 125984275 ns\nthreads: 1"
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
          "id": "39b9e78d008b0a3d8be89f4bc6837ac4e3c28b4f",
          "message": "chore(avm)!: make indirects big enough for relative addressing (#9000)",
          "timestamp": "2024-10-03T16:14:37+01:00",
          "tree_id": "fdcec2ad5aa2a39a6368f3329e4f6ab4140b1aab",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/39b9e78d008b0a3d8be89f4bc6837ac4e3c28b4f"
        },
        "date": 1727970771897,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 30967.540216999994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 28871.093901999997 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5335.790830999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5007.60569 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 92874.988202,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 92874990000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15180.05199,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15180051000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8256579763,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8256579763 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 151584365,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 151584365 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6761104404,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6761104404 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 125831618,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 125831618 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "47281315+guipublic@users.noreply.github.com",
            "name": "guipublic",
            "username": "guipublic"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "3e05e22d8d9fc73c1225570342392dda5661403f",
          "message": "feat: Add support for unlimited width in ACIR (#8960)\n\nHandle ACIR AssertZero opcodes of any width, by creating intermediate\r\nquad gates using w4_omega.\r\n'fixes' https://github.com/noir-lang/noir/issues/6085, but we still need\r\nto have Noir using the unlimited width.",
          "timestamp": "2024-10-03T16:58:53Z",
          "tree_id": "59ad40e91ce1a2f7e8ca3ae7cc62c7c7a77939c2",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/3e05e22d8d9fc73c1225570342392dda5661403f"
        },
        "date": 1727976070191,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 31273.527811000007,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 28827.375152 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5368.7198460000045,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5072.3152740000005 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 94026.864928,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 94026867000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15200.187321,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15200188000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8339660556,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8339660556 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 153342757,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 153342757 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6805550519,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6805550519 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126467280,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126467280 ns\nthreads: 1"
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
          "id": "4f1af9a0baf9e342d0de41ebd58fed24a0c4f615",
          "message": "feat: Connect the public inputs but not the proof in ivc recursion constraints (#8973)\n\nThe inputs to an ACIR ivc recursion constraint include the VK, the\r\npublic inputs, and the proof (without public inputs). The VK and public\r\ninputs are expected to be used in aztec-y logic directly in the noir\r\nprotocol programs, but the proof is not. Previously, we connected the\r\nwitnesses for all three of these components to the counterpart used in\r\nthe backend recursive verifier. This requires knowledge of the proof\r\nsize, could be misleading and is unnecessary. With this PR, we only\r\ncreate and connect witnesses for the VK and public inputs and not the\r\nproof when constructing an ivc recursion constraint.",
          "timestamp": "2024-10-04T06:14:42-07:00",
          "tree_id": "4c913fbc511d4ce4b40393e08ad234682e1b142a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/4f1af9a0baf9e342d0de41ebd58fed24a0c4f615"
        },
        "date": 1728049829761,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 30970.01555700001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 28572.233294 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5279.562808999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4918.253441999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 92781.62136500001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 92781623000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15126.09295,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15126092000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8283827805,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8283827805 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 150734572,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 150734572 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6704496235,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6704496235 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 127632281,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 127632281 ns\nthreads: 1"
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
          "id": "ec9dfdf9ba36d9bb2e3829a8cdd5b0ed94cbc3fb",
          "message": "refactor(avm)!: remove CMOV opcode (#9030)\n\nIt's not emitted by Noir, and it needs special casing in the AVM\ncircuit. We discussed with Alvaro that we'd remove it.",
          "timestamp": "2024-10-04T23:38:37+01:00",
          "tree_id": "5aac8113e3cf0b1581a0d0310f9195373f9f95cd",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ec9dfdf9ba36d9bb2e3829a8cdd5b0ed94cbc3fb"
        },
        "date": 1728082781739,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 31207.998299999985,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 28825.623207000004 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5449.064601000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5082.764854 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 94071.196319,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 94071198000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15212.738652999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15212739000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8361160955,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8361160955 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 152576280,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 152576280 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6782398642,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6782398642 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 125519994,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 125519994 ns\nthreads: 1"
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
          "id": "527d820fcadc24105e43b819da1ad9d848b755ca",
          "message": "feat: lazy commitment key allocation for better memory (#9017)\n\nResolves https://github.com/AztecProtocol/barretenberg/issues/1121.\r\n\r\nWe currently create the commitment key at the beginning, when we create\r\nthe proving key. However, we do not have to do this and should not do\r\nthis because the commitment key ends up being a huge portion of memory,\r\nat around 930MB for 2^20 circuits. We instead just create it when we\r\nneed to. For UltraHonk, that ends up being during Oink and during\r\nGemini. For ClientIVC, we allocate and free a commitment key for each\r\noink we do, and also for the final decider.\r\n\r\nUltraHonk on a 2^20 circuit peak memory drops from 2420MiB to 1786MiB:\r\n\r\n<img width=\"1016\" alt=\"Screenshot 2024-10-04 at 5 33 25 PM\"\r\nsrc=\"https://github.com/user-attachments/assets/8f5760f8-e2b8-4b86-a0db-1ed68e0acf9f\">\r\n\r\nClientIVC memory stays mostly unchanged because need to keep the\r\ncommitment key mostly throughout all of the folding parts.\r\n\r\nI expect the bench timing for UltraHonk to be slightly worse given that\r\nwe reallocate the commitment key. ClientIVCBench should also be worse\r\nbecause we do more commitment key allocations.\r\n\r\n```\r\n--------------------------------------------------------------------------------\r\nBenchmark                      Time             CPU   Iterations UserCounters...\r\n--------------------------------------------------------------------------------\r\nClientIVCBench/Full/6      33391 ms        30977 ms            1 Arithmetic::accumulate=3.89126M Arithmetic::accumulate(t)=7.33056G Auxiliary::accumulate=1.98134M Auxiliary::accumulate(t)=13.0892G COMMIT::databus=108 COMMIT::databus(t)=8.88751M COMMIT::databus_inverses=36 COMMIT::databus_inverses(t)=11.2725M COMMIT::ecc_op_wires=48 COMMIT::ecc_op_wires(t)=38.6915M COMMIT::lookup_counts_tags=12 COMMIT::lookup_counts_tags(t)=193.353M COMMIT::lookup_inverses=12 COMMIT::lookup_inverses(t)=255.969M COMMIT::wires=24 COMMIT::wires(t)=2.21199G COMMIT::z_perm=12 COMMIT::z_perm(t)=2.32652G DatabusRead::accumulate=447 DatabusRead::accumulate(t)=1.53355M Decider::construct_proof=1 Decider::construct_proof(t)=1.68437G DeciderProvingKey(Circuit&)=12 DeciderProvingKey(Circuit&)(t)=2.86109G DeltaRange::accumulate=1.87876M DeltaRange::accumulate(t)=4.1979G ECCVMProver(CircuitBuilder&)=1 ECCVMProver(CircuitBuilder&)(t)=229.598M ECCVMProver::construct_proof=1 ECCVMProver::construct_proof(t)=2.57466G Elliptic::accumulate=183.692k Elliptic::accumulate(t)=452.417M Goblin::merge=23 Goblin::merge(t)=117.072M Lookup::accumulate=1.66365M Lookup::accumulate(t)=3.69193G MegaFlavor::get_row=6.18565M MegaFlavor::get_row(t)=4.20034G OinkProver::execute_grand_product_computation_round=12 OinkProver::execute_grand_product_computation_round(t)=3.59544G OinkProver::execute_log_derivative_inverse_round=12 OinkProver::execute_log_derivative_inverse_round(t)=2.48433G OinkProver::execute_preamble_round=12 OinkProver::execute_preamble_round(t)=274.895k OinkProver::execute_sorted_list_accumulator_round=12 OinkProver::execute_sorted_list_accumulator_round(t)=772.217M OinkProver::execute_wire_commitments_round=12 OinkProver::execute_wire_commitments_round(t)=1.68854G OinkProver::generate_alphas_round=12 OinkProver::generate_alphas_round(t)=3.58973M Permutation::accumulate=10.6427M Permutation::accumulate(t)=40.3554G PoseidonExt::accumulate=30.452k PoseidonExt::accumulate(t)=76.5906M PoseidonInt::accumulate=210.454k PoseidonInt::accumulate(t)=371.576M ProtogalaxyProver::prove=11 ProtogalaxyProver::prove(t)=19.5665G ProtogalaxyProver_::combiner_quotient_round=11 ProtogalaxyProver_::combiner_quotient_round(t)=8.3951G ProtogalaxyProver_::compute_row_evaluations=11 ProtogalaxyProver_::compute_row_evaluations(t)=1.72459G ProtogalaxyProver_::perturbator_round=11 ProtogalaxyProver_::perturbator_round(t)=2.61146G ProtogalaxyProver_::run_oink_prover_on_each_incomplete_key=11 ProtogalaxyProver_::run_oink_prover_on_each_incomplete_key(t)=7.8871G ProtogalaxyProver_::update_target_sum_and_fold=11 ProtogalaxyProver_::update_target_sum_and_fold(t)=672.681M TranslatorCircuitBuilder::constructor=1 TranslatorCircuitBuilder::constructor(t)=32.7314M TranslatorProver=1 TranslatorProver(t)=46.9982M TranslatorProver::construct_proof=1 TranslatorProver::construct_proof(t)=843.494M batch_mul_with_endomorphism=16 batch_mul_with_endomorphism(t)=405.64M commit=542 commit(t)=6.73009G commit_sparse=36 commit_sparse(t)=11.2568M compute_combiner=11 compute_combiner(t)=7.9922G compute_perturbator=11 compute_perturbator(t)=2.61115G compute_univariate=51 compute_univariate(t)=2.16081G construct_circuits=12 construct_circuits(t)=4.36072G pippenger=214 pippenger(t)=100.623M pippenger_unsafe_optimized_for_non_dyadic_polys=542 pippenger_unsafe_optimized_for_non_dyadic_polys(t)=6.6333G\r\nBenchmarking lock deleted.\r\nclient_ivc_bench.json                 100% 6936   183.4KB/s   00:00    \r\nfunction                                  ms     % sum\r\nconstruct_circuits(t)                   4361    13.53%\r\nDeciderProvingKey(Circuit&)(t)          2861     8.88%\r\nProtogalaxyProver::prove(t)            19566    60.69%\r\nDecider::construct_proof(t)             1684     5.22%\r\nECCVMProver(CircuitBuilder&)(t)          230     0.71%\r\nECCVMProver::construct_proof(t)         2575     7.99%\r\nTranslatorProver::construct_proof(t)     843     2.62%\r\nGoblin::merge(t)                         117     0.36%\r\n\r\nTotal time accounted for: 32237ms/33391ms = 96.55%\r\n\r\nMajor contributors:\r\nfunction                                  ms    % sum\r\ncommit(t)                               6730   20.88%\r\ncompute_combiner(t)                     7992   24.79%\r\ncompute_perturbator(t)                  2611    8.10%\r\ncompute_univariate(t)                   2161    6.70%\r\n\r\nBreakdown of ProtogalaxyProver::prove:\r\nProtogalaxyProver_::run_oink_prover_on_each_incomplete_key(t)    7887    40.31%\r\nProtogalaxyProver_::perturbator_round(t)                         2611    13.35%\r\nProtogalaxyProver_::combiner_quotient_round(t)                   8395    42.91%\r\nProtogalaxyProver_::update_target_sum_and_fold(t)                 673     3.44%\r\n\r\nRelation contributions (times to be interpreted relatively):\r\nTotal time accounted for (ms):    69567\r\noperation                       ms     % sum\r\nArithmetic::accumulate(t)     7331    10.54%\r\nPermutation::accumulate(t)   40355    58.01%\r\nLookup::accumulate(t)         3692     5.31%\r\nDeltaRange::accumulate(t)     4198     6.03%\r\nElliptic::accumulate(t)        452     0.65%\r\nAuxiliary::accumulate(t)     13089    18.82%\r\nEccOp::accumulate(t)             0     0.00%\r\nDatabusRead::accumulate(t)       2     0.00%\r\nPoseidonExt::accumulate(t)      77     0.11%\r\nPoseidonInt::accumulate(t)     372     0.53%\r\n\r\nCommitment contributions:\r\nTotal time accounted for (ms):     5047\r\noperation                          ms     % sum\r\nCOMMIT::wires(t)                 2212    43.83%\r\nCOMMIT::z_perm(t)                2327    46.10%\r\nCOMMIT::databus(t)                  9     0.18%\r\nCOMMIT::ecc_op_wires(t)            39     0.77%\r\nCOMMIT::lookup_inverses(t)        256     5.07%\r\nCOMMIT::databus_inverses(t)        11     0.22%\r\nCOMMIT::lookup_counts_tags(t)     193     3.83%\r\n```",
          "timestamp": "2024-10-07T09:36:52+01:00",
          "tree_id": "f24ea9d3f7611e14f4cf2575baeae982448bf022",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/527d820fcadc24105e43b819da1ad9d848b755ca"
        },
        "date": 1728292623113,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 31365.980160999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 29165.816042 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5548.407053999995,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5198.47903 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 93286.967249,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 93286970000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15681.361652000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15681362000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8254268335,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8254268335 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 152138066,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 152138066 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6752561988,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6752561988 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126479378,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126479378 ns\nthreads: 1"
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
          "id": "9c9c385b2d8d3d8284d981a7393500a04fd78d38",
          "message": "chore(ci): finally isolate bb-native-tests (#9039)\n\nThis has been spilling over too often, let's make sure it only affects\r\nan isolated runner",
          "timestamp": "2024-10-07T11:10:57Z",
          "tree_id": "e53ee880ff5239d7c33c9ab7dffab27ad91875c0",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9c9c385b2d8d3d8284d981a7393500a04fd78d38"
        },
        "date": 1728300552065,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 31485.173594000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 29325.629146 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5551.114627999994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5214.800816 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 92740.762223,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 92740765000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15727.797608,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15727797000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8279679011,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8279679011 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 152106973,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 152106973 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6764292153,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6764292153 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126175319,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126175319 ns\nthreads: 1"
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
          "id": "77c05f5469bad85e1394c05e1878791bac084559",
          "message": "feat: Origin Tags Part 2 (#8936)\n\nThis PR extends the Origin Tags ( a taint mechanism for stdlib\r\nprimitives) to:\r\n1) bigfield\r\n2) byte_array\r\n3) safe_uint\r\n\r\nAnd extends tests with checks that the tags are preserved or merged\r\ncorrectly",
          "timestamp": "2024-10-07T12:23:50Z",
          "tree_id": "4485a23b7695ab303133bf69e61a89d36399727f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/77c05f5469bad85e1394c05e1878791bac084559"
        },
        "date": 1728304889141,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 31389.185714000007,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 29118.732181 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5499.343877000016,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5211.185672 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 93480.270636,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 93480273000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15623.004671000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15623004000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8202521167,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8202521167 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 152825139,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 152825139 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6694137785,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6694137785 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 124890961,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 124890961 ns\nthreads: 1"
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
          "id": "62f6b8aeb92bfb266a0df647a0dd33cfdb021f5f",
          "message": "chore: prove_then_verify_ultra_honk on all  existing acir tests (#9042)\n\nCloses https://github.com/AztecProtocol/barretenberg/issues/1124.\n\nEnsure all acir tests are configured to run with UH as a precursor to the full switch and add `double_verify_honk_proof` and `double_verify_honk_proof_recursive` Noir programs to be tested as part of the acir tests. In Plonk, we also have `double_verify_nested_proof`, which aggregates two recursive proof (produced with `double_verify_proof_recursive`). That is because those proofs will have 16  additional frs representing the public inputs' indices of the recursive proof. Unlike this, we don't have different proof sizes when we handle recursive proofs for Honk but instead parse an initial default aggregation object in case the proof isn't produced from recursively verifying another proof.",
          "timestamp": "2024-10-07T15:34:46+01:00",
          "tree_id": "42a8268d4928a6fd2bb02758179ef6c51abe3622",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/62f6b8aeb92bfb266a0df647a0dd33cfdb021f5f"
        },
        "date": 1728314389845,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 31442.99158800001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 29064.737737 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5559.153756000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5234.710751 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 93679.89475800001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 93679897000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15718.389173999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15718389000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8275903175,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8275903175 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 151350961,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 151350961 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6729221848,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6729221848 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 127134992,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 127134992 ns\nthreads: 1"
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
          "id": "fe11d9a3a1b96454999ae627c902d8b362805172",
          "message": "fix: assign one_idx in the same place as zero_idx in `UltraCircuitBuilder` (#9029)\n\nThis used to be done only at circuit finalisation time.",
          "timestamp": "2024-10-07T15:38:58+01:00",
          "tree_id": "3037fb7a65c01e9f97f42de7db94a7a546b1d255",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/fe11d9a3a1b96454999ae627c902d8b362805172"
        },
        "date": 1728314583125,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 31320.49792500001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 29216.704874 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5486.9323119999935,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5209.44776 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 93510.65701899999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 93510659000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15586.790093000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15586790000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8326506387,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8326506387 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 152769599,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 152769599 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6709399963,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6709399963 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126218674,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126218674 ns\nthreads: 1"
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
          "id": "ebb6a2da62c9d99f448b0da9cf1d14fd64a59b9f",
          "message": "chore: Revert \"fix: assign one_idx in the same place as zero_idx in `UltraCircuitBuilder`\" (#9049)\n\nReverts AztecProtocol/aztec-packages#9029",
          "timestamp": "2024-10-07T18:47:12+01:00",
          "tree_id": "5d9f812d16d795fb10355fa8df7dd610e55c4886",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ebb6a2da62c9d99f448b0da9cf1d14fd64a59b9f"
        },
        "date": 1728325466720,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 31426.800437000013,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 29096.102687 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5566.447597000007,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5250.057188999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 92912.80866200001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 92912811000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15831.179216999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15831179000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8289902320,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8289902320 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 151126082,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 151126082 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6745484693,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6745484693 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 125731731,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 125731731 ns\nthreads: 1"
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
          "id": "2c28dda02e568fddbff5e6e0337f374925445b65",
          "message": "chore(master): Release 0.57.0 (#8788)\n\n:robot: I have created a release *beep* *boop*\r\n---\r\n\r\n\r\n<details><summary>aztec-package: 0.57.0</summary>\r\n\r\n##\r\n[0.57.0](https://github.com/AztecProtocol/aztec-packages/compare/aztec-package-v0.56.0...aztec-package-v0.57.0)\r\n(2024-10-07)\r\n\r\n\r\n### Features\r\n\r\n* Consolidate spartan metrics\r\n([#9037](https://github.com/AztecProtocol/aztec-packages/issues/9037))\r\n([0cff28b](https://github.com/AztecProtocol/aztec-packages/commit/0cff28b7582c0bccde453c86e05af23121011dfe))\r\n* Proposers claim proving rights\r\n([#8832](https://github.com/AztecProtocol/aztec-packages/issues/8832))\r\n([f8b0802](https://github.com/AztecProtocol/aztec-packages/commit/f8b0802b72d7db864d55ed12939f63670e46d71f))\r\n* Prover escrow and 712-signed quotes\r\n([#8877](https://github.com/AztecProtocol/aztec-packages/issues/8877))\r\n([2f1d19a](https://github.com/AztecProtocol/aztec-packages/commit/2f1d19ac3baa35800ac941f0941461addad7ab66))\r\n* Prover node sends quotes on new epochs\r\n([#8864](https://github.com/AztecProtocol/aztec-packages/issues/8864))\r\n([4adf860](https://github.com/AztecProtocol/aztec-packages/commit/4adf8600dab5b7e177b84b6920674024c01b4e25)),\r\ncloses\r\n[#8684](https://github.com/AztecProtocol/aztec-packages/issues/8684)\r\n[#8683](https://github.com/AztecProtocol/aztec-packages/issues/8683)\r\n* Prover node stakes to escrow contract\r\n([#8975](https://github.com/AztecProtocol/aztec-packages/issues/8975))\r\n([9eb8815](https://github.com/AztecProtocol/aztec-packages/commit/9eb8815dc00641d6568e952b336e6f7348728054))\r\n\r\n\r\n### Bug Fixes\r\n\r\n* L1 request intervals\r\n([#8997](https://github.com/AztecProtocol/aztec-packages/issues/8997))\r\n([780fd62](https://github.com/AztecProtocol/aztec-packages/commit/780fd6210d0b1f8fc386135082ef443b449b3cdf))\r\n\r\n\r\n### Miscellaneous\r\n\r\n* Add memoize decorator\r\n([#8976](https://github.com/AztecProtocol/aztec-packages/issues/8976))\r\n([1d9711b](https://github.com/AztecProtocol/aztec-packages/commit/1d9711b0a145f47bfe6d4d64b6837873e2725d2f))\r\n* Bump foundry\r\n([#8868](https://github.com/AztecProtocol/aztec-packages/issues/8868))\r\n([bfd0b8e](https://github.com/AztecProtocol/aztec-packages/commit/bfd0b8e6932c2b2fdf6e1c35c3c324edec92118a))\r\n* Fix the transfer test we run in kind clusters\r\n([#8796](https://github.com/AztecProtocol/aztec-packages/issues/8796))\r\n([7c42ef0](https://github.com/AztecProtocol/aztec-packages/commit/7c42ef09bfc006c1d9725ac89e315d9a84c430fc))\r\n* Remove mock proof commitment escrow\r\n([#9011](https://github.com/AztecProtocol/aztec-packages/issues/9011))\r\n([4873c7b](https://github.com/AztecProtocol/aztec-packages/commit/4873c7bc850092e2962fcaf747ec60f19e89ba92))\r\n</details>\r\n\r\n<details><summary>barretenberg.js: 0.57.0</summary>\r\n\r\n##\r\n[0.57.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg.js-v0.56.0...barretenberg.js-v0.57.0)\r\n(2024-10-07)\r\n\r\n\r\n### Features\r\n\r\n* Add crsPath to BackendOptions\r\n([#8775](https://github.com/AztecProtocol/aztec-packages/issues/8775))\r\n([78fa676](https://github.com/AztecProtocol/aztec-packages/commit/78fa676eda1c6b35fe843e72347a77f9f6d89fa4))\r\n* CI/local S3 build cache\r\n([#8802](https://github.com/AztecProtocol/aztec-packages/issues/8802))\r\n([06be26e](https://github.com/AztecProtocol/aztec-packages/commit/06be26e2b5dfd4b1fa35f57231e15ebffbe410a7))\r\n* Use structured polys to reduce prover memory\r\n([#8587](https://github.com/AztecProtocol/aztec-packages/issues/8587))\r\n([59e3dd9](https://github.com/AztecProtocol/aztec-packages/commit/59e3dd93a70398e828269dbf13d8c4b9b38227ea))\r\n\r\n\r\n### Bug Fixes\r\n\r\n* **avm:** Kernel out full proving fix\r\n([#8873](https://github.com/AztecProtocol/aztec-packages/issues/8873))\r\n([784d483](https://github.com/AztecProtocol/aztec-packages/commit/784d483b592cb80da143634c07d330ba2f2c9ab7))\r\n* **CI:** Yarn-project publish_npm script\r\n([#8996](https://github.com/AztecProtocol/aztec-packages/issues/8996))\r\n([dc87b0e](https://github.com/AztecProtocol/aztec-packages/commit/dc87b0e9c33d59924368341f765c7a5fedf420d2))\r\n\r\n\r\n### Miscellaneous\r\n\r\n* Publish bb.js in github action\r\n([#8959](https://github.com/AztecProtocol/aztec-packages/issues/8959))\r\n([a21ab89](https://github.com/AztecProtocol/aztec-packages/commit/a21ab8915937b3c3f98551fb078c9874f2ed1547))\r\n* Push proof splitting helpers into bb.js\r\n([#8795](https://github.com/AztecProtocol/aztec-packages/issues/8795))\r\n([951ce6d](https://github.com/AztecProtocol/aztec-packages/commit/951ce6d974504f0453ad2816d10c358d8ef02ce5))\r\n</details>\r\n\r\n<details><summary>aztec-packages: 0.57.0</summary>\r\n\r\n##\r\n[0.57.0](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.56.0...aztec-packages-v0.57.0)\r\n(2024-10-07)\r\n\r\n\r\n### ⚠ BREAKING CHANGES\r\n\r\n* refactor contract interaction pt.1\r\n([#8938](https://github.com/AztecProtocol/aztec-packages/issues/8938))\r\n* **avm:** remove CMOV opcode\r\n([#9030](https://github.com/AztecProtocol/aztec-packages/issues/9030))\r\n* **public:** only deploy/register public_dispatch\r\n([#8988](https://github.com/AztecProtocol/aztec-packages/issues/8988))\r\n* Syncing TypeVariableKind with Kind\r\n(https://github.com/noir-lang/noir/pull/6094)\r\n* **public:** reroute public calls to dispatch function\r\n([#8972](https://github.com/AztecProtocol/aztec-packages/issues/8972))\r\n* **avm:** make indirects big enough for relative addressing\r\n([#9000](https://github.com/AztecProtocol/aztec-packages/issues/9000))\r\n* keccak_ultra -> ultra_keccak\r\n([#8878](https://github.com/AztecProtocol/aztec-packages/issues/8878))\r\n* rename unsafe_rand, misc log unsafe changes\r\n([#8844](https://github.com/AztecProtocol/aztec-packages/issues/8844))\r\n* switch slot derivation to poseidon2 instead of pedersen\r\n([#8801](https://github.com/AztecProtocol/aztec-packages/issues/8801))\r\n* fix storage layout export\r\n([#8880](https://github.com/AztecProtocol/aztec-packages/issues/8880))\r\n* remove SharedMutablePrivateGetter\r\n([#8749](https://github.com/AztecProtocol/aztec-packages/issues/8749))\r\n\r\n### Features\r\n\r\n* Add CLI command to advance epoch\r\n([#9014](https://github.com/AztecProtocol/aztec-packages/issues/9014))\r\n([36f6187](https://github.com/AztecProtocol/aztec-packages/commit/36f6187eb8cd9aea804b1404d7b5baf8945133bc))\r\n* Add crsPath to BackendOptions\r\n([#8775](https://github.com/AztecProtocol/aztec-packages/issues/8775))\r\n([78fa676](https://github.com/AztecProtocol/aztec-packages/commit/78fa676eda1c6b35fe843e72347a77f9f6d89fa4))\r\n* Add support for unlimited width in ACIR\r\n([#8960](https://github.com/AztecProtocol/aztec-packages/issues/8960))\r\n([3e05e22](https://github.com/AztecProtocol/aztec-packages/commit/3e05e22d8d9fc73c1225570342392dda5661403f))\r\n* Adding CPU / RAM configurations to helm network deployments\r\n([#8786](https://github.com/AztecProtocol/aztec-packages/issues/8786))\r\n([7790ede](https://github.com/AztecProtocol/aztec-packages/commit/7790ede48933d2f831089be4375fd62081d72d77))\r\n* Allow silencing an unused variable defined via `let`\r\n(https://github.com/noir-lang/noir/pull/6149)\r\n([6bd5b7e](https://github.com/AztecProtocol/aztec-packages/commit/6bd5b7e2491ed0b20f1ba1cf8f1b6b7504cca085))\r\n* **avm:** Integrate public inputs in AVM recursive verifier\r\n([#8846](https://github.com/AztecProtocol/aztec-packages/issues/8846))\r\n([4354ae0](https://github.com/AztecProtocol/aztec-packages/commit/4354ae030b5b7e365ff0361e88cd74cd95d71e04)),\r\ncloses\r\n[#8714](https://github.com/AztecProtocol/aztec-packages/issues/8714)\r\n* **avm:** Simulator relative addr\r\n([#8837](https://github.com/AztecProtocol/aztec-packages/issues/8837))\r\n([dda528a](https://github.com/AztecProtocol/aztec-packages/commit/dda528a2f1ca1a52ce08f6175b594f6567fc370e))\r\n* **avm:** Skip gas accounting for fake rows\r\n([#8944](https://github.com/AztecProtocol/aztec-packages/issues/8944))\r\n([818325a](https://github.com/AztecProtocol/aztec-packages/commit/818325ae35ce0260d88e097261d173f4dc326cbe)),\r\ncloses\r\n[#8903](https://github.com/AztecProtocol/aztec-packages/issues/8903)\r\n* **aztec-nr/public:** Dispatch function\r\n([#8821](https://github.com/AztecProtocol/aztec-packages/issues/8821))\r\n([3af2381](https://github.com/AztecProtocol/aztec-packages/commit/3af238177ef273bec36c1faccad80ccc9cfed192))\r\n* CI/local S3 build cache\r\n([#8802](https://github.com/AztecProtocol/aztec-packages/issues/8802))\r\n([06be26e](https://github.com/AztecProtocol/aztec-packages/commit/06be26e2b5dfd4b1fa35f57231e15ebffbe410a7))\r\n* Connect the public inputs but not the proof in ivc recursion\r\nconstraints\r\n([#8973](https://github.com/AztecProtocol/aztec-packages/issues/8973))\r\n([4f1af9a](https://github.com/AztecProtocol/aztec-packages/commit/4f1af9a0baf9e342d0de41ebd58fed24a0c4f615))\r\n* Consolidate spartan metrics\r\n([#9037](https://github.com/AztecProtocol/aztec-packages/issues/9037))\r\n([0cff28b](https://github.com/AztecProtocol/aztec-packages/commit/0cff28b7582c0bccde453c86e05af23121011dfe))\r\n* Delivering partial fields via unencrypted logs\r\n([#8725](https://github.com/AztecProtocol/aztec-packages/issues/8725))\r\n([8a59b17](https://github.com/AztecProtocol/aztec-packages/commit/8a59b176545ba6d0eed434cba50c9d5c745cfd25))\r\n* Detect unconstructed structs\r\n(https://github.com/noir-lang/noir/pull/6061)\r\n([6bd5b7e](https://github.com/AztecProtocol/aztec-packages/commit/6bd5b7e2491ed0b20f1ba1cf8f1b6b7504cca085))\r\n* Documenting note macros\r\n([#9009](https://github.com/AztecProtocol/aztec-packages/issues/9009))\r\n([623b1dd](https://github.com/AztecProtocol/aztec-packages/commit/623b1dd7130360c2dde5e221fc560e80973daa52))\r\n* Empty block root circuit\r\n([#8805](https://github.com/AztecProtocol/aztec-packages/issues/8805))\r\n([b5fc91c](https://github.com/AztecProtocol/aztec-packages/commit/b5fc91c305bf0ea8935faa2e754a5d390d4f40a1))\r\n* Enforce limits for each side effect type in AVM\r\n([#8889](https://github.com/AztecProtocol/aztec-packages/issues/8889))\r\n([57d5cfd](https://github.com/AztecProtocol/aztec-packages/commit/57d5cfd1e6936066a72dad312dfea6032ebd4e72))\r\n* Expose `derived_generators` and `pedersen_commitment_with_separator`\r\nfrom the stdlib (https://github.com/noir-lang/noir/pull/6154)\r\n([6bd5b7e](https://github.com/AztecProtocol/aztec-packages/commit/6bd5b7e2491ed0b20f1ba1cf8f1b6b7504cca085))\r\n* Faster CIV benching with mocked VKs\r\n([#8843](https://github.com/AztecProtocol/aztec-packages/issues/8843))\r\n([fad3d6e](https://github.com/AztecProtocol/aztec-packages/commit/fad3d6e41765c774696ecc98d45a27851c7c4442))\r\n* Handle consecutive kernels in IVC\r\n([#8924](https://github.com/AztecProtocol/aztec-packages/issues/8924))\r\n([0be9f25](https://github.com/AztecProtocol/aztec-packages/commit/0be9f253238cc1453d07385ece565f946d4212a3))\r\n* Handle epoch proofs on L1\r\n([#8704](https://github.com/AztecProtocol/aztec-packages/issues/8704))\r\n([730f23c](https://github.com/AztecProtocol/aztec-packages/commit/730f23c4965d5aed266654f9fbad3269542fb186))\r\n* Hoist constant allocation outside of loops\r\n(https://github.com/noir-lang/noir/pull/6158)\r\n([6bd5b7e](https://github.com/AztecProtocol/aztec-packages/commit/6bd5b7e2491ed0b20f1ba1cf8f1b6b7504cca085))\r\n* Inclusive for loop (https://github.com/noir-lang/noir/pull/6200)\r\n([0d5b116](https://github.com/AztecProtocol/aztec-packages/commit/0d5b116bf988a018cf9da4fed36c283b254a9a2b))\r\n* Lazy commitment key allocation for better memory\r\n([#9017](https://github.com/AztecProtocol/aztec-packages/issues/9017))\r\n([527d820](https://github.com/AztecProtocol/aztec-packages/commit/527d820fcadc24105e43b819da1ad9d848b755ca))\r\n* Let `Module::functions` and `Module::structs` return them in\r\ndefinition order (https://github.com/noir-lang/noir/pull/6178)\r\n([2e6340b](https://github.com/AztecProtocol/aztec-packages/commit/2e6340b09b46052d64bd2be239b0d512f59cdfb7))\r\n* Make shplemini proof constant\r\n([#8826](https://github.com/AztecProtocol/aztec-packages/issues/8826))\r\n([c8cbc33](https://github.com/AztecProtocol/aztec-packages/commit/c8cbc3388c2bbe9a0ba8a95717e1b71c602d58e3))\r\n* New Tracy Time preset and more efficient univariate extension\r\n([#8789](https://github.com/AztecProtocol/aztec-packages/issues/8789))\r\n([ead4649](https://github.com/AztecProtocol/aztec-packages/commit/ead4649b0c21a98534c36e7755edac68052b3c26))\r\n* Note fields in TS artifact\r\n([#8906](https://github.com/AztecProtocol/aztec-packages/issues/8906))\r\n([7f40411](https://github.com/AztecProtocol/aztec-packages/commit/7f404118af0e81233b4c4b546260ed6fb59c1f3c))\r\n* Nullable note fields info in ABI\r\n([#8901](https://github.com/AztecProtocol/aztec-packages/issues/8901))\r\n([e0d5e06](https://github.com/AztecProtocol/aztec-packages/commit/e0d5e06d8fc30cbdda7e4102dbf3412808382377))\r\n* Origin Tags part 1\r\n([#8787](https://github.com/AztecProtocol/aztec-packages/issues/8787))\r\n([ed1e23e](https://github.com/AztecProtocol/aztec-packages/commit/ed1e23edff04ea026a94ffc22b29b6ef520cdf55))\r\n* Origin Tags Part 2\r\n([#8936](https://github.com/AztecProtocol/aztec-packages/issues/8936))\r\n([77c05f5](https://github.com/AztecProtocol/aztec-packages/commit/77c05f5469bad85e1394c05e1878791bac084559))\r\n* Partial note log support in macros\r\n([#8951](https://github.com/AztecProtocol/aztec-packages/issues/8951))\r\n([f3c1eaa](https://github.com/AztecProtocol/aztec-packages/commit/f3c1eaa8212ef0c8cf41e8fa7d0b41a666143bb4))\r\n* **perf:** Handle array set optimization across blocks for Brillig\r\nfunctions (https://github.com/noir-lang/noir/pull/6153)\r\n([6bd5b7e](https://github.com/AztecProtocol/aztec-packages/commit/6bd5b7e2491ed0b20f1ba1cf8f1b6b7504cca085))\r\n* **perf:** Optimize array set from get\r\n(https://github.com/noir-lang/noir/pull/6207)\r\n([0d5b116](https://github.com/AztecProtocol/aztec-packages/commit/0d5b116bf988a018cf9da4fed36c283b254a9a2b))\r\n* **perf:** Remove inc_rc instructions for arrays which are never\r\nmutably borrowed (https://github.com/noir-lang/noir/pull/6168)\r\n([2e6340b](https://github.com/AztecProtocol/aztec-packages/commit/2e6340b09b46052d64bd2be239b0d512f59cdfb7))\r\n* **perf:** Remove redundant inc rc without instructions between\r\n(https://github.com/noir-lang/noir/pull/6183)\r\n([2e6340b](https://github.com/AztecProtocol/aztec-packages/commit/2e6340b09b46052d64bd2be239b0d512f59cdfb7))\r\n* **perf:** Remove useless paired RC instructions within a block during\r\nDIE (https://github.com/noir-lang/noir/pull/6160)\r\n([6bd5b7e](https://github.com/AztecProtocol/aztec-packages/commit/6bd5b7e2491ed0b20f1ba1cf8f1b6b7504cca085))\r\n* **perf:** Simplify the cfg after DIE\r\n(https://github.com/noir-lang/noir/pull/6184)\r\n([0d5b116](https://github.com/AztecProtocol/aztec-packages/commit/0d5b116bf988a018cf9da4fed36c283b254a9a2b))\r\n* Proposers claim proving rights\r\n([#8832](https://github.com/AztecProtocol/aztec-packages/issues/8832))\r\n([f8b0802](https://github.com/AztecProtocol/aztec-packages/commit/f8b0802b72d7db864d55ed12939f63670e46d71f))\r\n* Prover escrow and 712-signed quotes\r\n([#8877](https://github.com/AztecProtocol/aztec-packages/issues/8877))\r\n([2f1d19a](https://github.com/AztecProtocol/aztec-packages/commit/2f1d19ac3baa35800ac941f0941461addad7ab66))\r\n* Prover node sends quotes on new epochs\r\n([#8864](https://github.com/AztecProtocol/aztec-packages/issues/8864))\r\n([4adf860](https://github.com/AztecProtocol/aztec-packages/commit/4adf8600dab5b7e177b84b6920674024c01b4e25)),\r\ncloses\r\n[#8684](https://github.com/AztecProtocol/aztec-packages/issues/8684)\r\n[#8683](https://github.com/AztecProtocol/aztec-packages/issues/8683)\r\n* Prover node stakes to escrow contract\r\n([#8975](https://github.com/AztecProtocol/aztec-packages/issues/8975))\r\n([9eb8815](https://github.com/AztecProtocol/aztec-packages/commit/9eb8815dc00641d6568e952b336e6f7348728054))\r\n* Prover node submits epoch proofs\r\n([#8794](https://github.com/AztecProtocol/aztec-packages/issues/8794))\r\n([1612909](https://github.com/AztecProtocol/aztec-packages/commit/161290925978fdcb6321a7d0b6c5d5b2ca6fd837))\r\n* **public:** Only deploy/register public_dispatch\r\n([#8988](https://github.com/AztecProtocol/aztec-packages/issues/8988))\r\n([6c30453](https://github.com/AztecProtocol/aztec-packages/commit/6c3045332ea44cf16b04918d321e8dcda28c0adf))\r\n* **public:** Reroute public calls to dispatch function\r\n([#8972](https://github.com/AztecProtocol/aztec-packages/issues/8972))\r\n([c4297ce](https://github.com/AztecProtocol/aztec-packages/commit/c4297ced66b977eab3ba52707ef45ddea3f19ee4))\r\n* Refactor contract interaction pt.1\r\n([#8938](https://github.com/AztecProtocol/aztec-packages/issues/8938))\r\n([62963f9](https://github.com/AztecProtocol/aztec-packages/commit/62963f9cb30fc6e0187e79ad4e7d49653a937b80))\r\n* Refactor SSA passes to run on individual functions\r\n(https://github.com/noir-lang/noir/pull/6072)\r\n([0d5b116](https://github.com/AztecProtocol/aztec-packages/commit/0d5b116bf988a018cf9da4fed36c283b254a9a2b))\r\n* Remote quote provider\r\n([#8946](https://github.com/AztecProtocol/aztec-packages/issues/8946))\r\n([1c3cb63](https://github.com/AztecProtocol/aztec-packages/commit/1c3cb63c45f5ee6605911ecc0cc2524aef67391c))\r\n* Remove orphaned blocks from cfg to improve `simplify_cfg` pass.\r\n(https://github.com/noir-lang/noir/pull/6198)\r\n([0d5b116](https://github.com/AztecProtocol/aztec-packages/commit/0d5b116bf988a018cf9da4fed36c283b254a9a2b))\r\n* Remove SharedMutablePrivateGetter\r\n([#8749](https://github.com/AztecProtocol/aztec-packages/issues/8749))\r\n([154d396](https://github.com/AztecProtocol/aztec-packages/commit/154d396b5344ef5a032bdfe11858c8f0e69ce2bb))\r\n* Rename unsafe_rand, misc log unsafe changes\r\n([#8844](https://github.com/AztecProtocol/aztec-packages/issues/8844))\r\n([81a4d74](https://github.com/AztecProtocol/aztec-packages/commit/81a4d74c3200823cdb41125b8c98964dc3fdc1e8))\r\n* Reset circuit variants\r\n([#8876](https://github.com/AztecProtocol/aztec-packages/issues/8876))\r\n([415d78f](https://github.com/AztecProtocol/aztec-packages/commit/415d78f80ebd65b9a824dfc9958788de426e805a))\r\n* Simplify sha256 implementation\r\n(https://github.com/noir-lang/noir/pull/6142)\r\n([6bd5b7e](https://github.com/AztecProtocol/aztec-packages/commit/6bd5b7e2491ed0b20f1ba1cf8f1b6b7504cca085))\r\n* Skip `remove_enable_side_effects` pass on brillig functions\r\n(https://github.com/noir-lang/noir/pull/6199)\r\n([0d5b116](https://github.com/AztecProtocol/aztec-packages/commit/0d5b116bf988a018cf9da4fed36c283b254a9a2b))\r\n* Snapshotting for e2e p2p tests\r\n([#8896](https://github.com/AztecProtocol/aztec-packages/issues/8896))\r\n([ebb86b7](https://github.com/AztecProtocol/aztec-packages/commit/ebb86b7f453315afc3116fbf9aeecca8ff39961c))\r\n* **sol:** Add shplemini transcript\r\n([#8865](https://github.com/AztecProtocol/aztec-packages/issues/8865))\r\n([089dbad](https://github.com/AztecProtocol/aztec-packages/commit/089dbadd9e9ca304004c38e01d3703d923b257ec))\r\n* **sol:** Shplemini verification\r\n([#8866](https://github.com/AztecProtocol/aztec-packages/issues/8866))\r\n([989eb08](https://github.com/AztecProtocol/aztec-packages/commit/989eb08256db49e65e2d5e8a91790f941761d08f))\r\n* **ssa:** Simplify signed casts\r\n(https://github.com/noir-lang/noir/pull/6166)\r\n([2e6340b](https://github.com/AztecProtocol/aztec-packages/commit/2e6340b09b46052d64bd2be239b0d512f59cdfb7))\r\n* Stronger typing in L1 contracts\r\n([#8841](https://github.com/AztecProtocol/aztec-packages/issues/8841))\r\n([0b5aaea](https://github.com/AztecProtocol/aztec-packages/commit/0b5aaea7f28061abdae77e2de8e6a10c1b887a7e))\r\n* Switch slot derivation to poseidon2 instead of pedersen\r\n([#8801](https://github.com/AztecProtocol/aztec-packages/issues/8801))\r\n([e3e0b6f](https://github.com/AztecProtocol/aztec-packages/commit/e3e0b6f196afc7fd9c4ed1f5d65cabb634258dcd))\r\n* Sync from aztec-packages (https://github.com/noir-lang/noir/pull/6151)\r\n([6bd5b7e](https://github.com/AztecProtocol/aztec-packages/commit/6bd5b7e2491ed0b20f1ba1cf8f1b6b7504cca085))\r\n* Sync from aztec-packages (https://github.com/noir-lang/noir/pull/6210)\r\n([0d5b116](https://github.com/AztecProtocol/aztec-packages/commit/0d5b116bf988a018cf9da4fed36c283b254a9a2b))\r\n* Syncing TypeVariableKind with Kind\r\n(https://github.com/noir-lang/noir/pull/6094)\r\n([0d5b116](https://github.com/AztecProtocol/aztec-packages/commit/0d5b116bf988a018cf9da4fed36c283b254a9a2b))\r\n* Trace AVM side effects per enqueued call\r\n([#8918](https://github.com/AztecProtocol/aztec-packages/issues/8918))\r\n([c1a95db](https://github.com/AztecProtocol/aztec-packages/commit/c1a95db2aa3e692f8fb767b251f18572a8fd81cc))\r\n* Ultra honk on Shplemini\r\n([#8886](https://github.com/AztecProtocol/aztec-packages/issues/8886))\r\n([d8d04f6](https://github.com/AztecProtocol/aztec-packages/commit/d8d04f6f0b9ca0aa36008dc53dde2562dc3afa63))\r\n* Use structured polys to reduce prover memory\r\n([#8587](https://github.com/AztecProtocol/aztec-packages/issues/8587))\r\n([59e3dd9](https://github.com/AztecProtocol/aztec-packages/commit/59e3dd93a70398e828269dbf13d8c4b9b38227ea))\r\n* Visibility for globals (https://github.com/noir-lang/noir/pull/6161)\r\n([6bd5b7e](https://github.com/AztecProtocol/aztec-packages/commit/6bd5b7e2491ed0b20f1ba1cf8f1b6b7504cca085))\r\n* Visibility for impl functions\r\n(https://github.com/noir-lang/noir/pull/6179)\r\n([0d5b116](https://github.com/AztecProtocol/aztec-packages/commit/0d5b116bf988a018cf9da4fed36c283b254a9a2b))\r\n* Visibility for modules (https://github.com/noir-lang/noir/pull/6165)\r\n([2e6340b](https://github.com/AztecProtocol/aztec-packages/commit/2e6340b09b46052d64bd2be239b0d512f59cdfb7))\r\n* Visibility for type aliases\r\n(https://github.com/noir-lang/noir/pull/6058)\r\n([6bd5b7e](https://github.com/AztecProtocol/aztec-packages/commit/6bd5b7e2491ed0b20f1ba1cf8f1b6b7504cca085))\r\n\r\n\r\n### Bug Fixes\r\n\r\n* (LSP) make goto and hover work well for attributes\r\n(https://github.com/noir-lang/noir/pull/6152)\r\n([6bd5b7e](https://github.com/AztecProtocol/aztec-packages/commit/6bd5b7e2491ed0b20f1ba1cf8f1b6b7504cca085))\r\n* Add epoch proof quote to json rpc serialization\r\n([#9013](https://github.com/AztecProtocol/aztec-packages/issues/9013))\r\n([da2106f](https://github.com/AztecProtocol/aztec-packages/commit/da2106f1d7dab24f4b6e34bcb7c884e61e1e98c0))\r\n* Add missing visibility for auto-import names\r\n(https://github.com/noir-lang/noir/pull/6205)\r\n([0d5b116](https://github.com/AztecProtocol/aztec-packages/commit/0d5b116bf988a018cf9da4fed36c283b254a9a2b))\r\n* Add persistent storage for aztec nodes in the spartan cluster\r\n([#8923](https://github.com/AztecProtocol/aztec-packages/issues/8923))\r\n([23786be](https://github.com/AztecProtocol/aztec-packages/commit/23786be68cdb6f35b6919cde5af57ab70f9741ad))\r\n* Add values file as an arg to the earthly command\r\n([#8857](https://github.com/AztecProtocol/aztec-packages/issues/8857))\r\n([3c15da3](https://github.com/AztecProtocol/aztec-packages/commit/3c15da3132b6605cf0ad451b79ac3e688e18d938))\r\n* Archiver getBlocksForEpoch and EpochProvingJob on block 1\r\n([#9016](https://github.com/AztecProtocol/aztec-packages/issues/9016))\r\n([9669db0](https://github.com/AztecProtocol/aztec-packages/commit/9669db07392b9feeca2789aca181aec58dddcfec))\r\n* Arm build\r\n([#8870](https://github.com/AztecProtocol/aztec-packages/issues/8870))\r\n([e4c5be8](https://github.com/AztecProtocol/aztec-packages/commit/e4c5be890049a897a3b1dddc95ed910b847f16b7))\r\n* Assign one_idx in the same place as zero_idx in `UltraCircuitBuilder`\r\n([#9029](https://github.com/AztecProtocol/aztec-packages/issues/9029))\r\n([fe11d9a](https://github.com/AztecProtocol/aztec-packages/commit/fe11d9a3a1b96454999ae627c902d8b362805172))\r\n* Attestation pool\r\n([#8854](https://github.com/AztecProtocol/aztec-packages/issues/8854))\r\n([ffbad35](https://github.com/AztecProtocol/aztec-packages/commit/ffbad355381f9db85a8dbb339af1b190e0ced3aa))\r\n* Attestations are requested based on their proposal not just slot\r\n([#8442](https://github.com/AztecProtocol/aztec-packages/issues/8442))\r\n([08d8578](https://github.com/AztecProtocol/aztec-packages/commit/08d8578d3f36a809fa415ab745f65e61ba575be1))\r\n* **avm:** CALL operand resolution\r\n([#9018](https://github.com/AztecProtocol/aztec-packages/issues/9018))\r\n([7f2e29f](https://github.com/AztecProtocol/aztec-packages/commit/7f2e29fd0042d7644e629dfe660533c681bf71a8))\r\n* **avm:** Kernel out full proving fix\r\n([#8873](https://github.com/AztecProtocol/aztec-packages/issues/8873))\r\n([784d483](https://github.com/AztecProtocol/aztec-packages/commit/784d483b592cb80da143634c07d330ba2f2c9ab7))\r\n* **avm:** MSM not including enough operands\r\n([#9004](https://github.com/AztecProtocol/aztec-packages/issues/9004))\r\n([830c6ab](https://github.com/AztecProtocol/aztec-packages/commit/830c6ab464d3e2ccd36d010072b89cb0b4ebdb16))\r\n* Bb.js acir tests\r\n([#8862](https://github.com/AztecProtocol/aztec-packages/issues/8862))\r\n([d8d0541](https://github.com/AztecProtocol/aztec-packages/commit/d8d0541bde1d98d6b7ae3c3bb2a38068383f802b))\r\n* Bug in slot to timestamp conversion\r\n([#8839](https://github.com/AztecProtocol/aztec-packages/issues/8839))\r\n([d9baebe](https://github.com/AztecProtocol/aztec-packages/commit/d9baebe9cf343bc47da5b99abc17cef2f76d875f))\r\n* Call generate-variants on noir-projects bootstrap fast\r\n([#8956](https://github.com/AztecProtocol/aztec-packages/issues/8956))\r\n([2570b59](https://github.com/AztecProtocol/aztec-packages/commit/2570b59aee921a23841e135bde9b85fd67b442e6))\r\n* **ci:** Do not post public functions report when empty\r\n([#8790](https://github.com/AztecProtocol/aztec-packages/issues/8790))\r\n([507710f](https://github.com/AztecProtocol/aztec-packages/commit/507710f3a77e0277b1c17ed7341715bc023f8c5d))\r\n* Circleci\r\n([#9056](https://github.com/AztecProtocol/aztec-packages/issues/9056))\r\n([5c77c4f](https://github.com/AztecProtocol/aztec-packages/commit/5c77c4f63b2d69c5e28feade2056facafe859e03))\r\n* **CI:** Yarn-project publish_npm script\r\n([#8996](https://github.com/AztecProtocol/aztec-packages/issues/8996))\r\n([dc87b0e](https://github.com/AztecProtocol/aztec-packages/commit/dc87b0e9c33d59924368341f765c7a5fedf420d2))\r\n* Databus panic for fns with empty params\r\n([#8847](https://github.com/AztecProtocol/aztec-packages/issues/8847))\r\n([6a13290](https://github.com/AztecProtocol/aztec-packages/commit/6a132906ec8653cec7f30af2e008c8881d42db46))\r\n* Disable flakey test\r\n([#8927](https://github.com/AztecProtocol/aztec-packages/issues/8927))\r\n([151bb79](https://github.com/AztecProtocol/aztec-packages/commit/151bb79add3dfff059ccadee7c0bc25cc9059440))\r\n* Do not assume blocks as proven in e2e-prover tests\r\n([#8848](https://github.com/AztecProtocol/aztec-packages/issues/8848))\r\n([2d5ae66](https://github.com/AztecProtocol/aztec-packages/commit/2d5ae664964b66c4b617965fe85488e95706a8d3))\r\n* Do not duplicate constant arrays in brillig\r\n(https://github.com/noir-lang/noir/pull/6155)\r\n([6bd5b7e](https://github.com/AztecProtocol/aztec-packages/commit/6bd5b7e2491ed0b20f1ba1cf8f1b6b7504cca085))\r\n* Do not start block root rollup proof before block is built\r\n([#8952](https://github.com/AztecProtocol/aztec-packages/issues/8952))\r\n([af1a6af](https://github.com/AztecProtocol/aztec-packages/commit/af1a6af29cc9af8c24df964bcfde83b4064db7ac))\r\n* **docs:** Rename recursion.md to recursion.mdx\r\n(https://github.com/noir-lang/noir/pull/6195)\r\n([0d5b116](https://github.com/AztecProtocol/aztec-packages/commit/0d5b116bf988a018cf9da4fed36c283b254a9a2b))\r\n* **docs:** Update private_voting_contract.md\r\n([#9010](https://github.com/AztecProtocol/aztec-packages/issues/9010))\r\n([86afa81](https://github.com/AztecProtocol/aztec-packages/commit/86afa81d744bcf0c3ffd732663a24234b26e8aa8))\r\n* Don't warn twice when referring to private item\r\n(https://github.com/noir-lang/noir/pull/6216)\r\n([0d5b116](https://github.com/AztecProtocol/aztec-packages/commit/0d5b116bf988a018cf9da4fed36c283b254a9a2b))\r\n* Earthly-local\r\n([#8915](https://github.com/AztecProtocol/aztec-packages/issues/8915))\r\n([9b3da97](https://github.com/AztecProtocol/aztec-packages/commit/9b3da97668209b89af4a04343ccc5f4b512c4127))\r\n* Earthly-script output\r\n([#8871](https://github.com/AztecProtocol/aztec-packages/issues/8871))\r\n([a02370c](https://github.com/AztecProtocol/aztec-packages/commit/a02370c1738c70ea8c6300c43a396f310cd2e017))\r\n* Ensure to_bytes returns the canonical decomposition\r\n(https://github.com/noir-lang/noir/pull/6084)\r\n([0d5b116](https://github.com/AztecProtocol/aztec-packages/commit/0d5b116bf988a018cf9da4fed36c283b254a9a2b))\r\n* **external PR, twt--:** Remove quotes $artifacts_to_transpile in the\r\nfor loop list of compile_then_transpile.sh\r\n([#8932](https://github.com/AztecProtocol/aztec-packages/issues/8932))\r\n([95cb977](https://github.com/AztecProtocol/aztec-packages/commit/95cb97755e7efa549930c47e2eb6f9fb5ba4020f))\r\n* **external PR, twt--:** Un-nest docker compose variable substitution\r\nin sandbox config\r\n([#8930](https://github.com/AztecProtocol/aztec-packages/issues/8930))\r\n([12b8526](https://github.com/AztecProtocol/aztec-packages/commit/12b852683334f74683f69d1114e7d8562a289d39))\r\n* **external PR, twt--:** Update .aztec-run to run in non-interactive\r\nmode if NON_INTERACTIVE is set to non-zero\r\n([#8931](https://github.com/AztecProtocol/aztec-packages/issues/8931))\r\n([d85a66d](https://github.com/AztecProtocol/aztec-packages/commit/d85a66d4b0a610a3704a7f7f83dead507af6b586))\r\n* Fix storage layout export\r\n([#8880](https://github.com/AztecProtocol/aztec-packages/issues/8880))\r\n([c8f43b3](https://github.com/AztecProtocol/aztec-packages/commit/c8f43b3b3ea37c015a284868a06bebc1422bb34b))\r\n* Flaky e2e sample dapp and quick start\r\n([#8768](https://github.com/AztecProtocol/aztec-packages/issues/8768))\r\n([48914ba](https://github.com/AztecProtocol/aztec-packages/commit/48914ba71039f18d7cea9fca65997c2a6e263b25))\r\n* Handle more types in size_in_fields, and panic on unexpected type\r\n([#8887](https://github.com/AztecProtocol/aztec-packages/issues/8887))\r\n([03280e9](https://github.com/AztecProtocol/aztec-packages/commit/03280e9d78eaf395bb3f3c514c794bd0fa0af240))\r\n* Ignore compression of blocks after msg.len in sha256_var\r\n(https://github.com/noir-lang/noir/pull/6206)\r\n([0d5b116](https://github.com/AztecProtocol/aztec-packages/commit/0d5b116bf988a018cf9da4fed36c283b254a9a2b))\r\n* L1 request intervals\r\n([#8997](https://github.com/AztecProtocol/aztec-packages/issues/8997))\r\n([780fd62](https://github.com/AztecProtocol/aztec-packages/commit/780fd6210d0b1f8fc386135082ef443b449b3cdf))\r\n* Nightly-kind-test.yml\r\n([#8899](https://github.com/AztecProtocol/aztec-packages/issues/8899))\r\n([2bb9ca6](https://github.com/AztecProtocol/aztec-packages/commit/2bb9ca6f4ef43e2e405934c748831dc5e81a58c8))\r\n* Pass radix directly to the blackbox\r\n(https://github.com/noir-lang/noir/pull/6164)\r\n([6bd5b7e](https://github.com/AztecProtocol/aztec-packages/commit/6bd5b7e2491ed0b20f1ba1cf8f1b6b7504cca085))\r\n* **public:** Stack trace short term hack\r\n([#9024](https://github.com/AztecProtocol/aztec-packages/issues/9024))\r\n([f2ea42c](https://github.com/AztecProtocol/aztec-packages/commit/f2ea42cbdb1a1f57f407874f8598129886c88494))\r\n* Reenable CI reruns on master\r\n([#8907](https://github.com/AztecProtocol/aztec-packages/issues/8907))\r\n([124307d](https://github.com/AztecProtocol/aztec-packages/commit/124307df3b8252913bcafed897050e2dbb00c331))\r\n* Remove extra `crate::`\r\n([#8909](https://github.com/AztecProtocol/aztec-packages/issues/8909))\r\n([fd0e945](https://github.com/AztecProtocol/aztec-packages/commit/fd0e9455ac667366f060a3b9d955b075adb8c5da))\r\n* Rerun.yml\r\n([#8913](https://github.com/AztecProtocol/aztec-packages/issues/8913))\r\n([b363738](https://github.com/AztecProtocol/aztec-packages/commit/b363738bfa040a8381b754bdf6a8754280532ea2))\r\n* Setup publish action\r\n([#8992](https://github.com/AztecProtocol/aztec-packages/issues/8992))\r\n([65f7e9f](https://github.com/AztecProtocol/aztec-packages/commit/65f7e9f84c28e49cbf2eff29a0b6090974509145))\r\n* Spartan kubernetes cluster IaC\r\n([#8893](https://github.com/AztecProtocol/aztec-packages/issues/8893))\r\n([7f5ff5e](https://github.com/AztecProtocol/aztec-packages/commit/7f5ff5e629f708a73a9d78f45c8fa195c6fca6dd))\r\n* Specify correct env var in prover node helm\r\n([#8916](https://github.com/AztecProtocol/aztec-packages/issues/8916))\r\n([6e855a4](https://github.com/AztecProtocol/aztec-packages/commit/6e855a47f900a207fdb015d322d5e4e61116df15))\r\n* **ssa:** Check if result of array set is used in value of another\r\narray set (https://github.com/noir-lang/noir/pull/6197)\r\n([0d5b116](https://github.com/AztecProtocol/aztec-packages/commit/0d5b116bf988a018cf9da4fed36c283b254a9a2b))\r\n* Temporarily disable problematic test\r\n([#9051](https://github.com/AztecProtocol/aztec-packages/issues/9051))\r\n([7ee7f55](https://github.com/AztecProtocol/aztec-packages/commit/7ee7f55b23982f44b9c86b622eacc7ed820900c5))\r\n* Type variables by default should have Any kind\r\n(https://github.com/noir-lang/noir/pull/6203)\r\n([0d5b116](https://github.com/AztecProtocol/aztec-packages/commit/0d5b116bf988a018cf9da4fed36c283b254a9a2b))\r\n* Use different rust toolchain for foundry builds\r\n([#8869](https://github.com/AztecProtocol/aztec-packages/issues/8869))\r\n([096a0b2](https://github.com/AztecProtocol/aztec-packages/commit/096a0b265f25c843cb7268c0dff25848ae0dabb9))\r\n* Use properly sized p2p id\r\n([#9040](https://github.com/AztecProtocol/aztec-packages/issues/9040))\r\n([9fe7436](https://github.com/AztecProtocol/aztec-packages/commit/9fe74367d05d3d6fc9006ed4341a39cbe1327c54))\r\n* Use tree calculator in world state synchronizer\r\n([#8902](https://github.com/AztecProtocol/aztec-packages/issues/8902))\r\n([2fd4be9](https://github.com/AztecProtocol/aztec-packages/commit/2fd4be918dd6be82c140250bb5b2479e201813b4))\r\n\r\n\r\n### Miscellaneous\r\n\r\n* Add comments to log oracles\r\n([#8981](https://github.com/AztecProtocol/aztec-packages/issues/8981))\r\n([8efa7ac](https://github.com/AztecProtocol/aztec-packages/commit/8efa7ac9d30d84f76e61b5915e25d6b4619d46a9))\r\n* Add memoize decorator\r\n([#8976](https://github.com/AztecProtocol/aztec-packages/issues/8976))\r\n([1d9711b](https://github.com/AztecProtocol/aztec-packages/commit/1d9711b0a145f47bfe6d4d64b6837873e2725d2f))\r\n* Archiver identifies prune\r\n([#8666](https://github.com/AztecProtocol/aztec-packages/issues/8666))\r\n([4cf0f70](https://github.com/AztecProtocol/aztec-packages/commit/4cf0f70681d05e258bcc368e4f6b0880ab86dbe4))\r\n* Autumn cleaning\r\n([#8818](https://github.com/AztecProtocol/aztec-packages/issues/8818))\r\n([c1a9c6b](https://github.com/AztecProtocol/aztec-packages/commit/c1a9c6b05c1825a1d6276eaa398de4497b76f76f))\r\n* **avm:** Make indirects big enough for relative addressing\r\n([#9000](https://github.com/AztecProtocol/aztec-packages/issues/9000))\r\n([39b9e78](https://github.com/AztecProtocol/aztec-packages/commit/39b9e78d008b0a3d8be89f4bc6837ac4e3c28b4f))\r\n* **avm:** Remove CMOV opcode\r\n([#9030](https://github.com/AztecProtocol/aztec-packages/issues/9030))\r\n([ec9dfdf](https://github.com/AztecProtocol/aztec-packages/commit/ec9dfdf9ba36d9bb2e3829a8cdd5b0ed94cbc3fb))\r\n* **avm:** Remove mem accounting from gas\r\n([#8904](https://github.com/AztecProtocol/aztec-packages/issues/8904))\r\n([38b485e](https://github.com/AztecProtocol/aztec-packages/commit/38b485e4e8bf75453491d41a590f92afa25d4831))\r\n* **bb.js:** Strip wasm-threads again\r\n([#8833](https://github.com/AztecProtocol/aztec-packages/issues/8833))\r\n([68ba5d4](https://github.com/AztecProtocol/aztec-packages/commit/68ba5d443a79c06d972019abe39faaf851bb3247))\r\n* Big synching case + stability\r\n([#9022](https://github.com/AztecProtocol/aztec-packages/issues/9022))\r\n([931c59b](https://github.com/AztecProtocol/aztec-packages/commit/931c59b639577e755ccff0f9c9b9e2a3c88f558c))\r\n* Bump foundry\r\n([#8868](https://github.com/AztecProtocol/aztec-packages/issues/8868))\r\n([bfd0b8e](https://github.com/AztecProtocol/aztec-packages/commit/bfd0b8e6932c2b2fdf6e1c35c3c324edec92118a))\r\n* **ci:** Another earthly corruption retry case\r\n([#8799](https://github.com/AztecProtocol/aztec-packages/issues/8799))\r\n([c78b2cb](https://github.com/AztecProtocol/aztec-packages/commit/c78b2cb8d1d70c946a8ebeeed6c6618e98f9f542))\r\n* **ci:** Finally isolate bb-native-tests\r\n([#9039](https://github.com/AztecProtocol/aztec-packages/issues/9039))\r\n([9c9c385](https://github.com/AztecProtocol/aztec-packages/commit/9c9c385b2d8d3d8284d981a7393500a04fd78d38))\r\n* **ci:** Increase timeout for ARM build\r\n([#9041](https://github.com/AztecProtocol/aztec-packages/issues/9041))\r\n([c505b02](https://github.com/AztecProtocol/aztec-packages/commit/c505b02d10cdf52230b5af0e3c88642a8a3316e8))\r\n* **ci:** Turn on S3 caching for all PRs\r\n([#8898](https://github.com/AztecProtocol/aztec-packages/issues/8898))\r\n([c68a5ef](https://github.com/AztecProtocol/aztec-packages/commit/c68a5eff1f438860f2aa85d59c48ba9f85fc3d0d))\r\n* **ci:** Update gates diff action to not post Brillig sizes report with\r\nno changes (https://github.com/noir-lang/noir/pull/6157)\r\n([6bd5b7e](https://github.com/AztecProtocol/aztec-packages/commit/6bd5b7e2491ed0b20f1ba1cf8f1b6b7504cca085))\r\n* Cleanup of `Aztec.nr` encryption code\r\n([#8780](https://github.com/AztecProtocol/aztec-packages/issues/8780))\r\n([0bfcbba](https://github.com/AztecProtocol/aztec-packages/commit/0bfcbbaa74ae8a80d9586bd5049ec9fbe0480a7d))\r\n* Delay proof quote collection\r\n([#8967](https://github.com/AztecProtocol/aztec-packages/issues/8967))\r\n([640b661](https://github.com/AztecProtocol/aztec-packages/commit/640b66103eb111b5f2c5a4245a66559f9f5e0f84))\r\n* **deploy:** Use docker run instead of helm test, metrics dashboard\r\nscripts\r\n([#8926](https://github.com/AztecProtocol/aztec-packages/issues/8926))\r\n([797d0ca](https://github.com/AztecProtocol/aztec-packages/commit/797d0ca4abb396b6325a8159ca3be248c16c6b97))\r\n* Deprecate various items in stdlib\r\n(https://github.com/noir-lang/noir/pull/6156)\r\n([6bd5b7e](https://github.com/AztecProtocol/aztec-packages/commit/6bd5b7e2491ed0b20f1ba1cf8f1b6b7504cca085))\r\n* Disable block building e2e\r\n([#8895](https://github.com/AztecProtocol/aztec-packages/issues/8895))\r\n([ada6220](https://github.com/AztecProtocol/aztec-packages/commit/ada62205b127c61c2ca81ee74310d089ec560ccb))\r\n* Disable e2e-fees-failure\r\n([#8784](https://github.com/AztecProtocol/aztec-packages/issues/8784))\r\n([10b87d1](https://github.com/AztecProtocol/aztec-packages/commit/10b87d109e0b02f0b879df91456ffdc95d9a5fe6))\r\n* Do not start prover node in e2e tests if not needed\r\n([#9008](https://github.com/AztecProtocol/aztec-packages/issues/9008))\r\n([a2d3f8a](https://github.com/AztecProtocol/aztec-packages/commit/a2d3f8a2bf559b7a024e181a61ed3c1bbc6ff02b))\r\n* **docs:** Add link to more info about proving backend to Solidity\r\nverifier page (https://github.com/noir-lang/noir/pull/5754)\r\n([2e6340b](https://github.com/AztecProtocol/aztec-packages/commit/2e6340b09b46052d64bd2be239b0d512f59cdfb7))\r\n* Enable tests on aztec-nr and contracts\r\n(https://github.com/noir-lang/noir/pull/6162)\r\n([6bd5b7e](https://github.com/AztecProtocol/aztec-packages/commit/6bd5b7e2491ed0b20f1ba1cf8f1b6b7504cca085))\r\n* Event encryption funcs working as note ones\r\n([#8819](https://github.com/AztecProtocol/aztec-packages/issues/8819))\r\n([77636f0](https://github.com/AztecProtocol/aztec-packages/commit/77636f053526a8690016f9a47b5a3f625aff5fcf))\r\n* Final partial notes related cleanup\r\n([#8987](https://github.com/AztecProtocol/aztec-packages/issues/8987))\r\n([880c45f](https://github.com/AztecProtocol/aztec-packages/commit/880c45f4a73e54c60ba8d887ae5f3515e6efd5ad)),\r\ncloses\r\n[#8238](https://github.com/AztecProtocol/aztec-packages/issues/8238)\r\n* Fix flakey e2e fees failures test\r\n([#8807](https://github.com/AztecProtocol/aztec-packages/issues/8807))\r\n([99bac95](https://github.com/AztecProtocol/aztec-packages/commit/99bac950f3c057ee1c25ea61fa6fe4834b348e24))\r\n* Fix some more imports\r\n([#8804](https://github.com/AztecProtocol/aztec-packages/issues/8804))\r\n([ffe70ec](https://github.com/AztecProtocol/aztec-packages/commit/ffe70ecac593a4b9e2cbb61bc9db4a280c6d917e))\r\n* Fix the transfer test we run in kind clusters\r\n([#8796](https://github.com/AztecProtocol/aztec-packages/issues/8796))\r\n([7c42ef0](https://github.com/AztecProtocol/aztec-packages/commit/7c42ef09bfc006c1d9725ac89e315d9a84c430fc))\r\n* Fix typo in code snippet (https://github.com/noir-lang/noir/pull/6211)\r\n([0d5b116](https://github.com/AztecProtocol/aztec-packages/commit/0d5b116bf988a018cf9da4fed36c283b254a9a2b))\r\n* Have prover-node self-mint L1 fee juice\r\n([#9007](https://github.com/AztecProtocol/aztec-packages/issues/9007))\r\n([9f1e73a](https://github.com/AztecProtocol/aztec-packages/commit/9f1e73a3a1b746678215f04ea3f5496d6e90be97))\r\n* Increase timeout of AVM full tests job to 75 minutes\r\n([#8883](https://github.com/AztecProtocol/aztec-packages/issues/8883))\r\n([b70a728](https://github.com/AztecProtocol/aztec-packages/commit/b70a728a8adee13a6b572bb2594d933498bfb70c))\r\n* Keccak_ultra -&gt; ultra_keccak\r\n([#8878](https://github.com/AztecProtocol/aztec-packages/issues/8878))\r\n([670af8a](https://github.com/AztecProtocol/aztec-packages/commit/670af8a158633d106a3f1df82dbd28ef9a9e4ceb))\r\n* Minor archiver refactor\r\n([#8715](https://github.com/AztecProtocol/aztec-packages/issues/8715))\r\n([b0d1bab](https://github.com/AztecProtocol/aztec-packages/commit/b0d1bab1f02819e7efbe0db73c3c805b5927b66a))\r\n* Misc unsafe improvements\r\n([#8803](https://github.com/AztecProtocol/aztec-packages/issues/8803))\r\n([cfe907c](https://github.com/AztecProtocol/aztec-packages/commit/cfe907cc3279a138c8db97b19f359740e0470f9b))\r\n* Move governance out of core\r\n([#8823](https://github.com/AztecProtocol/aztec-packages/issues/8823))\r\n([7411acc](https://github.com/AztecProtocol/aztec-packages/commit/7411acc0f79c4100d0311555bbcf6bacd072024f))\r\n* Nuking `encode_and_encrypt_note(...)`\r\n([#8815](https://github.com/AztecProtocol/aztec-packages/issues/8815))\r\n([2da9695](https://github.com/AztecProtocol/aztec-packages/commit/2da9695224e799abe317069af443f0b55ef2e007))\r\n* Nuking `log_traits.nr`\r\n([#8797](https://github.com/AztecProtocol/aztec-packages/issues/8797))\r\n([5d4accf](https://github.com/AztecProtocol/aztec-packages/commit/5d4accf47cdcd5e760616689c859a4d99824b530))\r\n* Nuking encryption oracles\r\n([#8817](https://github.com/AztecProtocol/aztec-packages/issues/8817))\r\n([8c98757](https://github.com/AztecProtocol/aztec-packages/commit/8c9875712e0b935947e753836148026fad7508fa))\r\n* Nuking L2Block.fromFields\r\n([#8882](https://github.com/AztecProtocol/aztec-packages/issues/8882))\r\n([b6551a9](https://github.com/AztecProtocol/aztec-packages/commit/b6551a96cabfb9c511fc60bb9aca2fe57afe7237))\r\n* Optimise l1 to l2 message fetching\r\n([#8672](https://github.com/AztecProtocol/aztec-packages/issues/8672))\r\n([7b1fb45](https://github.com/AztecProtocol/aztec-packages/commit/7b1fb457023fc60f55d6f9b91f513138082d98bd))\r\n* Partial notes macros\r\n([#8993](https://github.com/AztecProtocol/aztec-packages/issues/8993))\r\n([567e9a8](https://github.com/AztecProtocol/aztec-packages/commit/567e9a8ecc3666dc5140c3868b21f7a856a34f68))\r\n* Protogalaxy only instantiated with Mega\r\n([#8949](https://github.com/AztecProtocol/aztec-packages/issues/8949))\r\n([b8d87f1](https://github.com/AztecProtocol/aztec-packages/commit/b8d87f12224ac7e1c4e0bf0e353ddc902bf82fd4))\r\n* Prove_then_verify_ultra_honk on all existing acir tests\r\n([#9042](https://github.com/AztecProtocol/aztec-packages/issues/9042))\r\n([62f6b8a](https://github.com/AztecProtocol/aztec-packages/commit/62f6b8aeb92bfb266a0df647a0dd33cfdb021f5f))\r\n* Publish bb.js in github action\r\n([#8959](https://github.com/AztecProtocol/aztec-packages/issues/8959))\r\n([a21ab89](https://github.com/AztecProtocol/aztec-packages/commit/a21ab8915937b3c3f98551fb078c9874f2ed1547))\r\n* Push proof splitting helpers into bb.js\r\n([#8795](https://github.com/AztecProtocol/aztec-packages/issues/8795))\r\n([951ce6d](https://github.com/AztecProtocol/aztec-packages/commit/951ce6d974504f0453ad2816d10c358d8ef02ce5))\r\n* Rebuild fixtures\r\n([#8995](https://github.com/AztecProtocol/aztec-packages/issues/8995))\r\n([96b6cfc](https://github.com/AztecProtocol/aztec-packages/commit/96b6cfcc084da7a3012d2125daa067a33edfed16))\r\n* Redo typo PR by bravesasha\r\n([#9003](https://github.com/AztecProtocol/aztec-packages/issues/9003))\r\n([b516d3a](https://github.com/AztecProtocol/aztec-packages/commit/b516d3a07c53f431a0554657780343a25715409a))\r\n* Redo typo PR by sfyll\r\n([#9002](https://github.com/AztecProtocol/aztec-packages/issues/9002))\r\n([c970ced](https://github.com/AztecProtocol/aztec-packages/commit/c970ced462fff400afbbcafdcd9cb795891de339))\r\n* Redo typo PR by skaunov\r\n([#8933](https://github.com/AztecProtocol/aztec-packages/issues/8933))\r\n([7ef1643](https://github.com/AztecProtocol/aztec-packages/commit/7ef1643218356d22d09601269f346927694e22d7))\r\n* Reduce number of gates in stdlib/sha256 hash function\r\n([#8905](https://github.com/AztecProtocol/aztec-packages/issues/8905))\r\n([dd3a27e](https://github.com/AztecProtocol/aztec-packages/commit/dd3a27e5dc66fc47c34c077ca8124efe6fbea900))\r\n* Reexport `CrateName` through `nargo`\r\n(https://github.com/noir-lang/noir/pull/6177)\r\n([2e6340b](https://github.com/AztecProtocol/aztec-packages/commit/2e6340b09b46052d64bd2be239b0d512f59cdfb7))\r\n* **refactor:** Array set optimization context struct for analysis\r\n(https://github.com/noir-lang/noir/pull/6204)\r\n([0d5b116](https://github.com/AztecProtocol/aztec-packages/commit/0d5b116bf988a018cf9da4fed36c283b254a9a2b))\r\n* Release from Github Actions\r\n([#8820](https://github.com/AztecProtocol/aztec-packages/issues/8820))\r\n([0354706](https://github.com/AztecProtocol/aztec-packages/commit/03547062bf79f1940275393d6e9080e92f83a768))\r\n* Release Noir(0.35.0) (https://github.com/noir-lang/noir/pull/6030)\r\n([0d5b116](https://github.com/AztecProtocol/aztec-packages/commit/0d5b116bf988a018cf9da4fed36c283b254a9a2b))\r\n* Remove `DefCollectorErrorKind::MacroError`\r\n(https://github.com/noir-lang/noir/pull/6174)\r\n([2e6340b](https://github.com/AztecProtocol/aztec-packages/commit/2e6340b09b46052d64bd2be239b0d512f59cdfb7))\r\n* Remove copy from `compute_row_evaluations`\r\n([#8875](https://github.com/AztecProtocol/aztec-packages/issues/8875))\r\n([9cd450e](https://github.com/AztecProtocol/aztec-packages/commit/9cd450e79870e00fb7c4c574a1e7f55de2e7b8ff))\r\n* Remove macros_api module (https://github.com/noir-lang/noir/pull/6190)\r\n([0d5b116](https://github.com/AztecProtocol/aztec-packages/commit/0d5b116bf988a018cf9da4fed36c283b254a9a2b))\r\n* Remove mock proof commitment escrow\r\n([#9011](https://github.com/AztecProtocol/aztec-packages/issues/9011))\r\n([4873c7b](https://github.com/AztecProtocol/aztec-packages/commit/4873c7bc850092e2962fcaf747ec60f19e89ba92))\r\n* Remove single block proving\r\n([#8856](https://github.com/AztecProtocol/aztec-packages/issues/8856))\r\n([aadd9d5](https://github.com/AztecProtocol/aztec-packages/commit/aadd9d5029ace4097a7af51fdfcb5437737b28c5))\r\n* Remove unused header in public executor\r\n([#8990](https://github.com/AztecProtocol/aztec-packages/issues/8990))\r\n([8e35125](https://github.com/AztecProtocol/aztec-packages/commit/8e35125e45c8e882b388f70bc4c30208a9fbb866))\r\n* Remove unused import\r\n([#8835](https://github.com/AztecProtocol/aztec-packages/issues/8835))\r\n([dbf2c13](https://github.com/AztecProtocol/aztec-packages/commit/dbf2c13bdbfbe2957eb8a6e2716d9feab6e0ea6d))\r\n* Remove unused methods and small state cleanup\r\n([#8968](https://github.com/AztecProtocol/aztec-packages/issues/8968))\r\n([9b66a3e](https://github.com/AztecProtocol/aztec-packages/commit/9b66a3e3d1a38b31cdad29f9fd9aee05738b066c))\r\n* Removing hack commitment from eccvm\r\n([#8825](https://github.com/AztecProtocol/aztec-packages/issues/8825))\r\n([5e4cfa7](https://github.com/AztecProtocol/aztec-packages/commit/5e4cfa7b0159f66e59365f14c02fe8bbf4a73935))\r\n* Rename `DefinitionKind::GenericType`\r\n(https://github.com/noir-lang/noir/pull/6182)\r\n([0d5b116](https://github.com/AztecProtocol/aztec-packages/commit/0d5b116bf988a018cf9da4fed36c283b254a9a2b))\r\n* Replace relative paths to noir-protocol-circuits\r\n([e062c5b](https://github.com/AztecProtocol/aztec-packages/commit/e062c5be333f6429e19fba92a8e97ba498936ab2))\r\n* Replace relative paths to noir-protocol-circuits\r\n([a0ce8cc](https://github.com/AztecProtocol/aztec-packages/commit/a0ce8cc923c3f7e431781990c5f3119777370254))\r\n* Replace relative paths to noir-protocol-circuits\r\n([240f408](https://github.com/AztecProtocol/aztec-packages/commit/240f408750da2ff6d8cb8095872d1869c78cc377))\r\n* Replace relative paths to noir-protocol-circuits\r\n([4589b79](https://github.com/AztecProtocol/aztec-packages/commit/4589b79b57711e015bbd0fb98e998048b04b3b63))\r\n* Replace relative paths to noir-protocol-circuits\r\n([42d4dde](https://github.com/AztecProtocol/aztec-packages/commit/42d4dde927a4ca9da556cdd7efd5d21d7900c70e))\r\n* Replace relative paths to noir-protocol-circuits\r\n([8cd9eee](https://github.com/AztecProtocol/aztec-packages/commit/8cd9eee5e72a1444170113ae5248c8334560c9d8))\r\n* Replace relative paths to noir-protocol-circuits\r\n([a79bbdd](https://github.com/AztecProtocol/aztec-packages/commit/a79bbdd9fef9f13d084fc875f520629439ba2407))\r\n* Replace relative paths to noir-protocol-circuits\r\n([fd693fe](https://github.com/AztecProtocol/aztec-packages/commit/fd693fee62486ff698e78cc6bb82aa11c2fa38af))\r\n* Replace relative paths to noir-protocol-circuits\r\n([c93bb8f](https://github.com/AztecProtocol/aztec-packages/commit/c93bb8f9ad1cc7f17d66ca9ff7298bb6d8ab6d44))\r\n* Revert \"feat: partial notes log encoding\r\n([#8538](https://github.com/AztecProtocol/aztec-packages/issues/8538))\"\r\n([#8712](https://github.com/AztecProtocol/aztec-packages/issues/8712))\r\n([ef1a41e](https://github.com/AztecProtocol/aztec-packages/commit/ef1a41eb838b7bdb108b0218a5e51929bfcf8acc))\r\n* Revert \"fix: assign one_idx in the same place as zero_idx in\r\n`UltraCircuitBuilder`\"\r\n([#9049](https://github.com/AztecProtocol/aztec-packages/issues/9049))\r\n([ebb6a2d](https://github.com/AztecProtocol/aztec-packages/commit/ebb6a2da62c9d99f448b0da9cf1d14fd64a59b9f))\r\n* Revert mistaken stack size change\r\n(https://github.com/noir-lang/noir/pull/6212)\r\n([0d5b116](https://github.com/AztecProtocol/aztec-packages/commit/0d5b116bf988a018cf9da4fed36c283b254a9a2b))\r\n* Set assume proven in e2e\r\n([#8830](https://github.com/AztecProtocol/aztec-packages/issues/8830))\r\n([f4453ce](https://github.com/AztecProtocol/aztec-packages/commit/f4453cec8a4e8060950c35d26cb09330c03ec08c))\r\n* Shared mutable slots use poseidon2 with separator\r\n([#8919](https://github.com/AztecProtocol/aztec-packages/issues/8919))\r\n([36431d7](https://github.com/AztecProtocol/aztec-packages/commit/36431d78a811294856f011dbf37ac3b36bcdc3c2))\r\n* Small cleanup\r\n([#8965](https://github.com/AztecProtocol/aztec-packages/issues/8965))\r\n([8031ef4](https://github.com/AztecProtocol/aztec-packages/commit/8031ef45fc02f8897336729e7c41925ecae7c2e2))\r\n* Spartan kubernetes documentation\r\n([#9012](https://github.com/AztecProtocol/aztec-packages/issues/9012))\r\n([75efafc](https://github.com/AztecProtocol/aztec-packages/commit/75efafc9ff25c2ce2480547c97dc59fb87a168a5))\r\n* Split `test_program`s into modules\r\n(https://github.com/noir-lang/noir/pull/6101)\r\n([2e6340b](https://github.com/AztecProtocol/aztec-packages/commit/2e6340b09b46052d64bd2be239b0d512f59cdfb7))\r\n* Untangled TS encryption functionality\r\n([#8827](https://github.com/AztecProtocol/aztec-packages/issues/8827))\r\n([048a848](https://github.com/AztecProtocol/aztec-packages/commit/048a8480ea81d669f730cc604b5b85b2a3c84325))\r\n* Update migration notes with version #\r\n([#9045](https://github.com/AztecProtocol/aztec-packages/issues/9045))\r\n([02a0bc1](https://github.com/AztecProtocol/aztec-packages/commit/02a0bc1449202a7dbe9ad5d6fea7b6e1a4025e4f))\r\n* Use Noir implementation of pedersen in public (uses MSM instead of\r\npedersen BBs)\r\n([#8798](https://github.com/AztecProtocol/aztec-packages/issues/8798))\r\n([02821d0](https://github.com/AztecProtocol/aztec-packages/commit/02821d0fb3000537aa8001a00d93c74af3003cc2))\r\n* Use require(predicate, custom_error)\r\n([#8859](https://github.com/AztecProtocol/aztec-packages/issues/8859))\r\n([84e5e0c](https://github.com/AztecProtocol/aztec-packages/commit/84e5e0ccda7766d205803ca35e0a307a262a96b5))\r\n</details>\r\n\r\n<details><summary>barretenberg: 0.57.0</summary>\r\n\r\n##\r\n[0.57.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.56.0...barretenberg-v0.57.0)\r\n(2024-10-07)\r\n\r\n\r\n### ⚠ BREAKING CHANGES\r\n\r\n* **avm:** remove CMOV opcode\r\n([#9030](https://github.com/AztecProtocol/aztec-packages/issues/9030))\r\n* **avm:** make indirects big enough for relative addressing\r\n([#9000](https://github.com/AztecProtocol/aztec-packages/issues/9000))\r\n* keccak_ultra -> ultra_keccak\r\n([#8878](https://github.com/AztecProtocol/aztec-packages/issues/8878))\r\n\r\n### Features\r\n\r\n* Add support for unlimited width in ACIR\r\n([#8960](https://github.com/AztecProtocol/aztec-packages/issues/8960))\r\n([3e05e22](https://github.com/AztecProtocol/aztec-packages/commit/3e05e22d8d9fc73c1225570342392dda5661403f))\r\n* **avm:** Integrate public inputs in AVM recursive verifier\r\n([#8846](https://github.com/AztecProtocol/aztec-packages/issues/8846))\r\n([4354ae0](https://github.com/AztecProtocol/aztec-packages/commit/4354ae030b5b7e365ff0361e88cd74cd95d71e04)),\r\ncloses\r\n[#8714](https://github.com/AztecProtocol/aztec-packages/issues/8714)\r\n* **avm:** Skip gas accounting for fake rows\r\n([#8944](https://github.com/AztecProtocol/aztec-packages/issues/8944))\r\n([818325a](https://github.com/AztecProtocol/aztec-packages/commit/818325ae35ce0260d88e097261d173f4dc326cbe)),\r\ncloses\r\n[#8903](https://github.com/AztecProtocol/aztec-packages/issues/8903)\r\n* CI/local S3 build cache\r\n([#8802](https://github.com/AztecProtocol/aztec-packages/issues/8802))\r\n([06be26e](https://github.com/AztecProtocol/aztec-packages/commit/06be26e2b5dfd4b1fa35f57231e15ebffbe410a7))\r\n* Connect the public inputs but not the proof in ivc recursion\r\nconstraints\r\n([#8973](https://github.com/AztecProtocol/aztec-packages/issues/8973))\r\n([4f1af9a](https://github.com/AztecProtocol/aztec-packages/commit/4f1af9a0baf9e342d0de41ebd58fed24a0c4f615))\r\n* Faster CIV benching with mocked VKs\r\n([#8843](https://github.com/AztecProtocol/aztec-packages/issues/8843))\r\n([fad3d6e](https://github.com/AztecProtocol/aztec-packages/commit/fad3d6e41765c774696ecc98d45a27851c7c4442))\r\n* Handle consecutive kernels in IVC\r\n([#8924](https://github.com/AztecProtocol/aztec-packages/issues/8924))\r\n([0be9f25](https://github.com/AztecProtocol/aztec-packages/commit/0be9f253238cc1453d07385ece565f946d4212a3))\r\n* Lazy commitment key allocation for better memory\r\n([#9017](https://github.com/AztecProtocol/aztec-packages/issues/9017))\r\n([527d820](https://github.com/AztecProtocol/aztec-packages/commit/527d820fcadc24105e43b819da1ad9d848b755ca))\r\n* Make shplemini proof constant\r\n([#8826](https://github.com/AztecProtocol/aztec-packages/issues/8826))\r\n([c8cbc33](https://github.com/AztecProtocol/aztec-packages/commit/c8cbc3388c2bbe9a0ba8a95717e1b71c602d58e3))\r\n* New Tracy Time preset and more efficient univariate extension\r\n([#8789](https://github.com/AztecProtocol/aztec-packages/issues/8789))\r\n([ead4649](https://github.com/AztecProtocol/aztec-packages/commit/ead4649b0c21a98534c36e7755edac68052b3c26))\r\n* Origin Tags part 1\r\n([#8787](https://github.com/AztecProtocol/aztec-packages/issues/8787))\r\n([ed1e23e](https://github.com/AztecProtocol/aztec-packages/commit/ed1e23edff04ea026a94ffc22b29b6ef520cdf55))\r\n* Origin Tags Part 2\r\n([#8936](https://github.com/AztecProtocol/aztec-packages/issues/8936))\r\n([77c05f5](https://github.com/AztecProtocol/aztec-packages/commit/77c05f5469bad85e1394c05e1878791bac084559))\r\n* **sol:** Add shplemini transcript\r\n([#8865](https://github.com/AztecProtocol/aztec-packages/issues/8865))\r\n([089dbad](https://github.com/AztecProtocol/aztec-packages/commit/089dbadd9e9ca304004c38e01d3703d923b257ec))\r\n* **sol:** Shplemini verification\r\n([#8866](https://github.com/AztecProtocol/aztec-packages/issues/8866))\r\n([989eb08](https://github.com/AztecProtocol/aztec-packages/commit/989eb08256db49e65e2d5e8a91790f941761d08f))\r\n* Ultra honk on Shplemini\r\n([#8886](https://github.com/AztecProtocol/aztec-packages/issues/8886))\r\n([d8d04f6](https://github.com/AztecProtocol/aztec-packages/commit/d8d04f6f0b9ca0aa36008dc53dde2562dc3afa63))\r\n* Use structured polys to reduce prover memory\r\n([#8587](https://github.com/AztecProtocol/aztec-packages/issues/8587))\r\n([59e3dd9](https://github.com/AztecProtocol/aztec-packages/commit/59e3dd93a70398e828269dbf13d8c4b9b38227ea))\r\n\r\n\r\n### Bug Fixes\r\n\r\n* Assign one_idx in the same place as zero_idx in `UltraCircuitBuilder`\r\n([#9029](https://github.com/AztecProtocol/aztec-packages/issues/9029))\r\n([fe11d9a](https://github.com/AztecProtocol/aztec-packages/commit/fe11d9a3a1b96454999ae627c902d8b362805172))\r\n* **avm:** Kernel out full proving fix\r\n([#8873](https://github.com/AztecProtocol/aztec-packages/issues/8873))\r\n([784d483](https://github.com/AztecProtocol/aztec-packages/commit/784d483b592cb80da143634c07d330ba2f2c9ab7))\r\n* Bb.js acir tests\r\n([#8862](https://github.com/AztecProtocol/aztec-packages/issues/8862))\r\n([d8d0541](https://github.com/AztecProtocol/aztec-packages/commit/d8d0541bde1d98d6b7ae3c3bb2a38068383f802b))\r\n\r\n\r\n### Miscellaneous\r\n\r\n* **avm:** Make indirects big enough for relative addressing\r\n([#9000](https://github.com/AztecProtocol/aztec-packages/issues/9000))\r\n([39b9e78](https://github.com/AztecProtocol/aztec-packages/commit/39b9e78d008b0a3d8be89f4bc6837ac4e3c28b4f))\r\n* **avm:** Remove CMOV opcode\r\n([#9030](https://github.com/AztecProtocol/aztec-packages/issues/9030))\r\n([ec9dfdf](https://github.com/AztecProtocol/aztec-packages/commit/ec9dfdf9ba36d9bb2e3829a8cdd5b0ed94cbc3fb))\r\n* **bb.js:** Strip wasm-threads again\r\n([#8833](https://github.com/AztecProtocol/aztec-packages/issues/8833))\r\n([68ba5d4](https://github.com/AztecProtocol/aztec-packages/commit/68ba5d443a79c06d972019abe39faaf851bb3247))\r\n* Bump foundry\r\n([#8868](https://github.com/AztecProtocol/aztec-packages/issues/8868))\r\n([bfd0b8e](https://github.com/AztecProtocol/aztec-packages/commit/bfd0b8e6932c2b2fdf6e1c35c3c324edec92118a))\r\n* **ci:** Finally isolate bb-native-tests\r\n([#9039](https://github.com/AztecProtocol/aztec-packages/issues/9039))\r\n([9c9c385](https://github.com/AztecProtocol/aztec-packages/commit/9c9c385b2d8d3d8284d981a7393500a04fd78d38))\r\n* Keccak_ultra -&gt; ultra_keccak\r\n([#8878](https://github.com/AztecProtocol/aztec-packages/issues/8878))\r\n([670af8a](https://github.com/AztecProtocol/aztec-packages/commit/670af8a158633d106a3f1df82dbd28ef9a9e4ceb))\r\n* Protogalaxy only instantiated with Mega\r\n([#8949](https://github.com/AztecProtocol/aztec-packages/issues/8949))\r\n([b8d87f1](https://github.com/AztecProtocol/aztec-packages/commit/b8d87f12224ac7e1c4e0bf0e353ddc902bf82fd4))\r\n* Prove_then_verify_ultra_honk on all existing acir tests\r\n([#9042](https://github.com/AztecProtocol/aztec-packages/issues/9042))\r\n([62f6b8a](https://github.com/AztecProtocol/aztec-packages/commit/62f6b8aeb92bfb266a0df647a0dd33cfdb021f5f))\r\n* Reduce number of gates in stdlib/sha256 hash function\r\n([#8905](https://github.com/AztecProtocol/aztec-packages/issues/8905))\r\n([dd3a27e](https://github.com/AztecProtocol/aztec-packages/commit/dd3a27e5dc66fc47c34c077ca8124efe6fbea900))\r\n* Remove copy from `compute_row_evaluations`\r\n([#8875](https://github.com/AztecProtocol/aztec-packages/issues/8875))\r\n([9cd450e](https://github.com/AztecProtocol/aztec-packages/commit/9cd450e79870e00fb7c4c574a1e7f55de2e7b8ff))\r\n* Remove unused methods and small state cleanup\r\n([#8968](https://github.com/AztecProtocol/aztec-packages/issues/8968))\r\n([9b66a3e](https://github.com/AztecProtocol/aztec-packages/commit/9b66a3e3d1a38b31cdad29f9fd9aee05738b066c))\r\n* Removing hack commitment from eccvm\r\n([#8825](https://github.com/AztecProtocol/aztec-packages/issues/8825))\r\n([5e4cfa7](https://github.com/AztecProtocol/aztec-packages/commit/5e4cfa7b0159f66e59365f14c02fe8bbf4a73935))\r\n* Revert \"fix: assign one_idx in the same place as zero_idx in\r\n`UltraCircuitBuilder`\"\r\n([#9049](https://github.com/AztecProtocol/aztec-packages/issues/9049))\r\n([ebb6a2d](https://github.com/AztecProtocol/aztec-packages/commit/ebb6a2da62c9d99f448b0da9cf1d14fd64a59b9f))\r\n</details>\r\n\r\n---\r\nThis PR was generated with [Release\r\nPlease](https://github.com/googleapis/release-please). See\r\n[documentation](https://github.com/googleapis/release-please#release-please).",
          "timestamp": "2024-10-08T10:32:59+01:00",
          "tree_id": "a2374a6dcdd8f86b8878958ff21016d650fd1f54",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/2c28dda02e568fddbff5e6e0337f374925445b65"
        },
        "date": 1728382106476,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 31390.322186999994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 29291.555469 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5523.273623999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5216.534577999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 93370.227911,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 93370230000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15678.83756,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15678838000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8225280056,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8225280056 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 153630585,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 153630585 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6724747743,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6724747743 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 125198813,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 125198813 ns\nthreads: 1"
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
          "id": "a239865a98bd32fcde3f53e0834df0bc7575b0ee",
          "message": "chore(master): Release 0.57.0",
          "timestamp": "2024-10-08T09:33:04Z",
          "url": "https://github.com/AztecProtocol/aztec-packages/pull/8788/commits/a239865a98bd32fcde3f53e0834df0bc7575b0ee"
        },
        "date": 1728382114733,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 31416.616177000007,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 29361.243734000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5549.348579999986,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5247.957131000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 92872.524948,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 92872527000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15633.363484,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15633364000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8220286368,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8220286368 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 151246902,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 151246902 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6737942735,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6737942735 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 127725021,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 127725021 ns\nthreads: 1"
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
          "id": "41f393443396cae77e09a09df07d42e6d5ff5618",
          "message": "feat: new world state (#8776)\n\nThis PR enables a new WorldState implementation written in C++. This\r\nbrings huge performance benefits.\r\n\r\n---------\r\n\r\nCo-authored-by: PhilWindle <philip.windle@gmail.com>",
          "timestamp": "2024-10-08T11:50:50+01:00",
          "tree_id": "81c7e61087f1df3ef47219e0aca4ff67e0a91808",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/41f393443396cae77e09a09df07d42e6d5ff5618"
        },
        "date": 1728387132138,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 31434.155544999994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 29005.590862999998 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5543.888069000005,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5170.902692000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 93094.40584200001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 93094408000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15820.047713000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15820048000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8283113151,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8283113151 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 153126336,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 153126336 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6728643109,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6728643109 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126046456,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126046456 ns\nthreads: 1"
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
          "id": "308c03b9ad45001570e6232f88403de8cc7d3cfb",
          "message": "feat(avm): constrain start and end l2/da gas (#9031)\n\nResolves #9001",
          "timestamp": "2024-10-08T14:56:07+02:00",
          "tree_id": "84ac671708211276d43e4de4d41ad0d91a07802e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/308c03b9ad45001570e6232f88403de8cc7d3cfb"
        },
        "date": 1728393399361,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 31422.571731000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 29295.898729 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5532.853782000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5224.152205 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 93023.84082900001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 93023842000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15698.015697,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15698016000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8283767237,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8283767237 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 152294394,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 152294394 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6737066833,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6737066833 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126164321,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126164321 ns\nthreads: 1"
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
          "id": "1798b1cc701824dd268ed0e49e592febf01a1687",
          "message": "feat: Integrate databus in the private kernels (#9028)\n\nIntegrates the databus in the private kernels. We do this by annotating\r\nwith call_data(0) for previous kernel public inputs and call_data(1) for\r\napp public inputs. Kernels and apps expose their own public inputs as\r\nreturn_data except the tail kernel who does it via the traditional\r\npublic inputs mechanism for the tube.",
          "timestamp": "2024-10-08T15:49:49+02:00",
          "tree_id": "f4d0a63910cc9513d4976febf0270eca4d21f50c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1798b1cc701824dd268ed0e49e592febf01a1687"
        },
        "date": 1728398857690,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 31445.828130999984,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 29235.102244 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5522.198032000006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5155.774105999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 93141.111719,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 93141114000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15803.426605000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15803426000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8315489819,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8315489819 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 151066956,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 151066956 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6762357502,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6762357502 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126014718,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126014718 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "105737703+iakovenkos@users.noreply.github.com",
            "name": "iakovenkos",
            "username": "iakovenkos"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "d2c9ae2853bb75cd736583406a57e96645bd2e88",
          "message": "refactor: eccvm transcript builder (#9026)\n\n* improved the structure of the main method compute_rows\r\n* cleaned up logic without modifying it\r\n* improved code sharing \r\n* added docs (not very detailed but should be helpful)\r\n\r\n* added the point at infinity test to ECCVMCircuitBuilderTests. this\r\ntest passing means that we are not handling point at infinity correctly",
          "timestamp": "2024-10-08T15:32:43+01:00",
          "tree_id": "9e84ebadb5e5ae0745b8f78095c4b0ea11c90064",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d2c9ae2853bb75cd736583406a57e96645bd2e88"
        },
        "date": 1728400506127,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 31344.235303000005,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 29034.491273 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5526.763727000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5214.549549 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 93590.01770899999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 93590019000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15709.828442,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15709829000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8314204894,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8314204894 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 151597464,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 151597464 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6743186490,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6743186490 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126461114,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126461114 ns\nthreads: 1"
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
          "id": "e827056e652a4789c91a617587945d57163fa7ff",
          "message": "chore: add world_state_napi to bootstrap fast (#9079)\n\n😳",
          "timestamp": "2024-10-08T15:41:17+01:00",
          "tree_id": "43f6d3beff07fd340922dd605c82744785c7da02",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e827056e652a4789c91a617587945d57163fa7ff"
        },
        "date": 1728400521975,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 31483.792483,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 29055.359390999998 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5532.321727999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5258.928586 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 92780.14958099999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 92780151000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15859.853535,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15859852000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8341823694,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8341823694 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 150737962,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 150737962 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6747754251,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6747754251 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 125610452,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 125610452 ns\nthreads: 1"
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
          "id": "07e4c956494154685970849bc4dda60c25af31bc",
          "message": "chore: Revert \"feat(avm): constrain start and end l2/da gas (#9031)\" (#9080)\n\nThis reverts commit 308c03b9ad45001570e6232f88403de8cc7d3cfb.\r\n\r\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\r\nline.",
          "timestamp": "2024-10-08T16:10:26Z",
          "tree_id": "6482a306f598473b8a266c6cbe452b3adb448a70",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/07e4c956494154685970849bc4dda60c25af31bc"
        },
        "date": 1728405905581,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 31468.289316999984,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 29355.360567 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5512.053488000007,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5216.996002999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 93558.897723,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 93558900000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15646.910401,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15646911000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8368279159,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8368279159 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 152963425,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 152963425 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6743323211,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6743323211 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 125816942,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 125816942 ns\nthreads: 1"
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
          "id": "764bba4dd8a016d45b201562ec82f9a12de65c2d",
          "message": "refactor: pass by const reference (#9083)\n\nUses const references for all complex parameters",
          "timestamp": "2024-10-08T17:58:01+01:00",
          "tree_id": "b04118cb4edf7b05f1e4a91f7afea87ec742702e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/764bba4dd8a016d45b201562ec82f9a12de65c2d"
        },
        "date": 1728408898340,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 31424.884931999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 28932.486869 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5524.144463999988,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5188.529791999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 93151.006665,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 93151009000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15743.945422999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15743945000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8346405451,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8346405451 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 151015272,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 151015272 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6792160190,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6792160190 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126547462,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126547462 ns\nthreads: 1"
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
          "id": "0bda0a4d71ae0fb4352de0746f7d96b63b787888",
          "message": "fix: make gate counting functions less confusing and avoid estimations (#9046)\n\nRemoves unnecessary gate counting in Honk flows in main.cpp and instead\r\ninits the SRS based on the actual finalized gate count taken from the\r\nProver.\r\n\r\nRenames get_num_gates to get_estimated_num_finalized_gates, renames a\r\nfew other functions to add \"estimated\" to their names to reflect their\r\nactual functionality and avoid misuse.\r\n\r\nReplace estimating functions used in main.cpp and in c_bind.cpp with\r\nfunctions that return the actual finalized gate count.\r\n\r\nFixes a bug in an earlier PR\r\nhttps://github.com/AztecProtocol/aztec-packages/pull/9042, which forgot\r\nthe ensure_nonzero = true argument to finalize_circuit(), and\r\nundercounted the number of gates in the circuit, leading a smaller than\r\nneeded SRS.",
          "timestamp": "2024-10-09T00:04:38Z",
          "tree_id": "428c0b0471861fd81c6b9ef1243a79b6e4f9d56a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0bda0a4d71ae0fb4352de0746f7d96b63b787888"
        },
        "date": 1728433132418,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 31370.552290000007,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 29170.556771 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5551.436401000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5186.710443 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 93008.236066,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 93008238000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15692.112062,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15692112000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8362320497,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8362320497 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 151305067,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 151305067 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6818517083,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6818517083 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126589291,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126589291 ns\nthreads: 1"
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
          "id": "c1150c9b28581985686b13ba97eb7f0066736652",
          "message": "refactor: configure trees instead of duplicating constants (#9088)\n\nThis PR undoes the changes to `aztec_constants.hpp` instead opting to\r\ntake those values via parameters to the constructor",
          "timestamp": "2024-10-09T10:37:05+01:00",
          "tree_id": "a75759a7cf987be3f63cdab20d532b7b84d4f3dd",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c1150c9b28581985686b13ba97eb7f0066736652"
        },
        "date": 1728468363869,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 31366.89035099998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 28873.886896000004 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5528.521012000013,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5157.667679 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 93713.801295,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 93713803000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15680.559068,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15680559000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8376498651,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8376498651 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 153025379,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 153025379 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6751547501,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6751547501 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 125810476,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 125810476 ns\nthreads: 1"
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
          "id": "763e9b8a98981545b68f96e5b49a0726fc3c80b3",
          "message": "chore(avm): revert 9080 - re-introducing start/end gas constraining (#9109)",
          "timestamp": "2024-10-09T16:43:12Z",
          "tree_id": "eba57f65fc61b9b7f3e2bbde069b6e90da9a8efc",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/763e9b8a98981545b68f96e5b49a0726fc3c80b3"
        },
        "date": 1728493108249,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 31548.665419,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 29281.294337000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5628.818852000009,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5302.446061000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 94873.560665,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 94873563000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15809.774476999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15809774000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8411821109,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8411821109 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 158216867,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 158216867 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6805404769,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6805404769 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 127240379,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 127240379 ns\nthreads: 1"
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
          "id": "6ef0895ed9788c533b0caf2d2c30839552dabbcc",
          "message": "feat: new per-enqueued-call gas limit (#9033)\n\nIt is not trivial to implement \"startup conditions\" in the AVM circuit\r\nthat are not standard part of any execution. So, for now we think it'd\r\nbe much easier to enforce our \"max gas\" in the kernel. The simulator and\r\nwitgen will check the startup gas and error if its too much, but the AVM\r\ncircuit will not include constraints for this.\r\n\r\nNote that this is an important constraint (whether in the kernel or AVM)\r\nbecause for now this gas limit also serves to ensure that the AVM\r\ncircuit's trace never fills up.",
          "timestamp": "2024-10-09T21:23:48Z",
          "tree_id": "08978444664ee37e923bb9e3c6e2d3341fb36681",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/6ef0895ed9788c533b0caf2d2c30839552dabbcc"
        },
        "date": 1728509894156,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 31321.665307999978,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 28882.341134 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5537.085727000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5243.292273999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 94970.49075699999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 94970493000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15652.720294000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15652720000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8406353168,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8406353168 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 150599368,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 150599368 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6777457456,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6777457456 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 125549974,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 125549974 ns\nthreads: 1"
          }
        ]
      }
    ]
  }
}