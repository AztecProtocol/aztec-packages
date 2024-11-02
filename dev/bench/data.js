window.BENCHMARK_DATA = {
  "lastUpdate": 1730513547188,
  "repoUrl": "https://github.com/AztecProtocol/aztec-packages",
  "entries": {
    "C++ Benchmark": [
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
          "id": "8d75dd4a6730c1af27b23bc786ed9db8eb199e6f",
          "message": "chore: Copying world state binary to yarn project is on generate (#9194)\n\nCopy native build artifacts in a separate \"generate\" step.\r\n\r\n---------\r\n\r\nCo-authored-by: Alex Gherghisan <alexghr@users.noreply.github.com>\r\nCo-authored-by: Alex Gherghisan <alexg@aztecprotocol.com>",
          "timestamp": "2024-10-22T07:49:26+01:00",
          "tree_id": "25941015c728282c475f49a7970ae30757d1e74b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8d75dd4a6730c1af27b23bc786ed9db8eb199e6f"
        },
        "date": 1729581245374,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29582.404536000013,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27901.889957000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5454.81932300001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5112.049809 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 87331.435856,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 87331438000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15156.12526,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15156126000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2743106061,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2743106061 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 130181963,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 130181963 ns\nthreads: 1"
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
          "id": "42e5221dda3fc28dc7fcce3607af756132b4e314",
          "message": "fix(avm): public dispatch in proving tests (#9331)\n\nfixes a bug in the poseidon2_permutation, where we were using the space\r\nid from the main trace incorrectly. keccakF also missing an operand for\r\naddressing",
          "timestamp": "2024-10-22T16:26:33+01:00",
          "tree_id": "c92b9020a0c8d7d84def639ce170052d51f328fd",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/42e5221dda3fc28dc7fcce3607af756132b4e314"
        },
        "date": 1729612324780,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29649.34950099999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 28056.735666 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5406.272170000008,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5082.340565 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 94252.168168,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 94252170000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15295.167253000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15295167000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2847390422,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2847390422 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 133721808,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 133721808 ns\nthreads: 1"
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
          "id": "465f88e9e89ac7af2ec8d4b061722dc3b776301e",
          "message": "chore!: remove delegate call and storage address (#9330)",
          "timestamp": "2024-10-22T17:15:13+01:00",
          "tree_id": "3a03ae9083ca7d9711721dd483f6b4c141030486",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/465f88e9e89ac7af2ec8d4b061722dc3b776301e"
        },
        "date": 1729616616621,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29670.64808500001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 28299.233221 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5436.464221000008,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5093.963801 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 88675.14667799999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 88675149000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15300.989161,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15300989000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2754464118,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2754464118 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 129922436,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 129922436 ns\nthreads: 1"
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
          "id": "e6db535b69e6769fa3f2c85a0685640c92ac147b",
          "message": "feat!: remove hash opcodes from AVM (#9209)\n\nResolves #9208",
          "timestamp": "2024-10-22T16:43:02Z",
          "tree_id": "46e09f3b8ff4df9ecb50bd78a98dc4bff4245ae0",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e6db535b69e6769fa3f2c85a0685640c92ac147b"
        },
        "date": 1729618021699,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29478.750808,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27826.209185 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5341.426827000007,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4968.409257 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 87413.57943499999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 87413581000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15183.024077,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15183025000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2730711344,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2730711344 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126629136,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126629136 ns\nthreads: 1"
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
          "id": "d4dea162322eab233ed733aa318040e681cf5c70",
          "message": "feat: Handle reorgs on sequencer (#9201)\n\nTweaks the archiver so it can detect when a prune _will_ happen and can\r\nstart unwinding blocks then. This is then leveraged by the sequencer, so\r\nit builds the next block accounting for a reorg to happen. This also\r\nrequired tweaks on the L1 rollup contract so validations and checks\r\naccount for pruning.\r\n\r\n---------\r\n\r\nCo-authored-by: PhilWindle <philip.windle@gmail.com>",
          "timestamp": "2024-10-21T21:03:34+01:00",
          "tree_id": "af7f04d456631f296d89be53da8559fec4bb3cd3",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d4dea162322eab233ed733aa318040e681cf5c70"
        },
        "date": 1729621665166,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29427.816224,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27878.38883 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5323.348326000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4986.687327000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 87900.35084099999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 87900353000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15168.970961,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15168971000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2714667506,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2714667506 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 128287349,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 128287349 ns\nthreads: 1"
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
          "id": "21fa3cf054cf1a3652c8a27ddf042c1c48b47039",
          "message": "feat: translator on Shplemini (#9329)\n\nIn this PR:\r\n* implement concatenation trick (to work for both Gemini and Shplemini),\r\ntry to document it and fix some other documentation in Shplemini\r\n* switch Translator to Shplemini\r\n\r\nThe Translator VM works on many many small polynomials (whose length is\r\ndetermined by a \"minicircuit size\"). To avoid the permutation relation\r\nhaving a very high degree, these small polynomials are split into\r\ngroups, and each group is concatenated into a single polynomial. We want\r\nthe prover to avoid having to commit to these extra concatenation\r\npolynomials (as they will likely not be sparse at all) but rather reuse\r\nthe commitments to the polynomials in its corresponding concatenation\r\ngroup, also showing they are correctly related in the opening protocol.\r\nBriefly, in Gemini, this is achieved by adding the contributibution to\r\nthe batched concatenated polynomials when computing the fold polynomials\r\n(A_0, A_1, ..., A_(logn -1)) but computing A_0- and A_0+ using the\r\npolyinomials in the batched concatenated groups. As the verifier only\r\nreceives commitments to A_1, .., A_(logn-1) and has to compute the\r\ncommitments to A_0- and A_0+ , it can then do this using the commitments\r\nof the polynomials in concatenation groups.",
          "timestamp": "2024-10-23T11:22:47Z",
          "tree_id": "4639acdc86297b1588f007e095b7030c66c14e85",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/21fa3cf054cf1a3652c8a27ddf042c1c48b47039"
        },
        "date": 1729683875837,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29591.349123000015,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27832.53973 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5362.287860999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5049.772502 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 87483.151404,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 87483154000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15087.907137000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15087907000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2717487451,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2717487451 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126614481,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126614481 ns\nthreads: 1"
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
          "id": "eae75872fdd813ed07f70c1e5d41c7b9f399ab72",
          "message": "feat(avm): full poseidon2 (#9141)\n\nPoseidon2 implementation for internal use by the avm in bytecode hashing\r\n/ address derivation etc",
          "timestamp": "2024-10-23T15:31:44+01:00",
          "tree_id": "46d9e08177347621b7945380bb4ae6e92095d765",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/eae75872fdd813ed07f70c1e5d41c7b9f399ab72"
        },
        "date": 1729695874735,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29660.227812000016,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 28078.50849 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5373.452680999975,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4987.6560850000005 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 88532.326814,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 88532329000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15146.219340999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15146219000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2717120688,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2717120688 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126919086,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126919086 ns\nthreads: 1"
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
          "id": "cb58490eed9cc46a7b2039d93645a9456ee9c834",
          "message": "chore!: replace usage of vector in keccakf1600 input with array (#9350)\n\nWe're currently using a vector to represent the state array for\r\nkeccakf1600 opcodes in brillig. This is unnecessary as it's only defined\r\nfor inputs of size 25 so we should use an array.\r\n\r\n@dbanks12 This impacts AVM as you're also using a vector here. We should\r\nbe able to remove this extra operand from the AVM bytecode but I'm not\r\nsure how to propagate this through the rest of the AVM stack.\r\n\r\n---------\r\n\r\nCo-authored-by: dbanks12 <david@aztecprotocol.com>",
          "timestamp": "2024-10-23T19:39:12-04:00",
          "tree_id": "dc4514e5f732806049406587c599edea9c41689f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/cb58490eed9cc46a7b2039d93645a9456ee9c834"
        },
        "date": 1729728391410,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29626.658018000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27963.268034999997 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5378.266448999966,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5056.678763999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 87461.171806,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 87461173000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15172.533287999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15172534000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2717145852,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2717145852 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126259638,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126259638 ns\nthreads: 1"
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
          "id": "c7d4572b49b33ee309f9238f3cec245878e6c295",
          "message": "feat: eccvm translator zk sumcheck (#9199)\n\nTurned on ZK Sumcheck in ECCVM and Translator Flavors.\r\n\r\nBenching `ClientIvc` with ZK sumcheck turned on in ECCVM and Translator:\r\n\r\n\r\n| Benchmark | without ZK | with ZK (best result) |with ZK | with ZK\r\n(worst result) | Overhead of Worst zk over non-ZK |\r\n\r\n|--------------------------|-------------|----------------|---------------|--------------|-----------------------------|\r\n| **ClientIVCBench/Full/2** | 12,039 ms | 12,512 ms | 12,658 ms | 12,778\r\nms | 6.14% |\r\n| **ClientIVCBench/Full/6** | 33,258 ms | 34,830 ms | 35,038 ms | 35,452\r\nms | 6.60% |\r\n\r\n\r\n**Using non-optimized ZK Sumcheck*",
          "timestamp": "2024-10-24T15:59:38+02:00",
          "tree_id": "5f72cbd64e9204880bf816fd6538cf289692a935",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c7d4572b49b33ee309f9238f3cec245878e6c295"
        },
        "date": 1729780781551,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 30909.597624000013,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 29134.861133000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5355.720123000012,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5051.7466190000005 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 92142.76948700001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 92142771000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15180.410025,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15180410000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2749052284,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2749052284 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126181819,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126181819 ns\nthreads: 1"
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
          "id": "09c9ad894ad64f44c25c191004273ae2828186d5",
          "message": "chore(master): Release 0.60.0 (#9310)\n\n:robot: I have created a release *beep* *boop*\r\n---\r\n\r\n\r\n<details><summary>aztec-package: 0.60.0</summary>\r\n\r\n##\r\n[0.60.0](https://github.com/AztecProtocol/aztec-packages/compare/aztec-package-v0.59.0...aztec-package-v0.60.0)\r\n(2024-10-24)\r\n\r\n\r\n### Features\r\n\r\n* Introduce default public keys and replace empty public keys\r\n([#9277](https://github.com/AztecProtocol/aztec-packages/issues/9277))\r\n([47718ea](https://github.com/AztecProtocol/aztec-packages/commit/47718ea3a52468f5341a1203f70f48730faf9f7d))\r\n* Sequencer cast votes\r\n([#9247](https://github.com/AztecProtocol/aztec-packages/issues/9247))\r\n([bd05d87](https://github.com/AztecProtocol/aztec-packages/commit/bd05d87891b9df0d0d537c4c1efcdf7d128a6a6f))\r\n</details>\r\n\r\n<details><summary>barretenberg.js: 0.60.0</summary>\r\n\r\n##\r\n[0.60.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg.js-v0.59.0...barretenberg.js-v0.60.0)\r\n(2024-10-24)\r\n\r\n\r\n### Features\r\n\r\n* Eccvm translator zk sumcheck\r\n([#9199](https://github.com/AztecProtocol/aztec-packages/issues/9199))\r\n([c7d4572](https://github.com/AztecProtocol/aztec-packages/commit/c7d4572b49b33ee309f9238f3cec245878e6c295))\r\n\r\n\r\n### Miscellaneous\r\n\r\n* Remove noir_js_backend_barretenberg\r\n([#9338](https://github.com/AztecProtocol/aztec-packages/issues/9338))\r\n([cefe3d9](https://github.com/AztecProtocol/aztec-packages/commit/cefe3d901731d3b05de503ce93c97a3badf91363))\r\n</details>\r\n\r\n<details><summary>aztec-packages: 0.60.0</summary>\r\n\r\n##\r\n[0.60.0](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.59.0...aztec-packages-v0.60.0)\r\n(2024-10-24)\r\n\r\n\r\n### ⚠ BREAKING CHANGES\r\n\r\n* replace usage of vector in keccakf1600 input with array\r\n([#9350](https://github.com/AztecProtocol/aztec-packages/issues/9350))\r\n* TXE single execution env\r\n([#9183](https://github.com/AztecProtocol/aztec-packages/issues/9183))\r\n* remove hash opcodes from AVM\r\n([#9209](https://github.com/AztecProtocol/aztec-packages/issues/9209))\r\n* remove delegate call and storage address\r\n([#9330](https://github.com/AztecProtocol/aztec-packages/issues/9330))\r\n\r\n### Features\r\n\r\n* Apella\r\n([#9084](https://github.com/AztecProtocol/aztec-packages/issues/9084))\r\n([205ce69](https://github.com/AztecProtocol/aztec-packages/commit/205ce69c0bd6a727d7472b5fec0e4fd5709e8ec1))\r\n* **avm:** Full poseidon2\r\n([#9141](https://github.com/AztecProtocol/aztec-packages/issues/9141))\r\n([eae7587](https://github.com/AztecProtocol/aztec-packages/commit/eae75872fdd813ed07f70c1e5d41c7b9f399ab72))\r\n* Bytes to fields and back\r\n([#8590](https://github.com/AztecProtocol/aztec-packages/issues/8590))\r\n([65b8493](https://github.com/AztecProtocol/aztec-packages/commit/65b849396173b8b1b0d0c66395352bf08f95914b))\r\n* Constrain protocol VK hashing\r\n([#9304](https://github.com/AztecProtocol/aztec-packages/issues/9304))\r\n([3d17e13](https://github.com/AztecProtocol/aztec-packages/commit/3d17e13260ae4dae36b803de4ee1d50d231b2e59))\r\n* **docs:** Nits\r\n([#8948](https://github.com/AztecProtocol/aztec-packages/issues/8948))\r\n([008fdd1](https://github.com/AztecProtocol/aztec-packages/commit/008fdd156ce212c65f8c83bef407eff0e30cb18e))\r\n* Eccvm translator zk sumcheck\r\n([#9199](https://github.com/AztecProtocol/aztec-packages/issues/9199))\r\n([c7d4572](https://github.com/AztecProtocol/aztec-packages/commit/c7d4572b49b33ee309f9238f3cec245878e6c295))\r\n* Gerousia\r\n([#8942](https://github.com/AztecProtocol/aztec-packages/issues/8942))\r\n([54b5ba2](https://github.com/AztecProtocol/aztec-packages/commit/54b5ba2aacf852f4f9454e67814d94322e88506b))\r\n* Get logs by tags\r\n([#9353](https://github.com/AztecProtocol/aztec-packages/issues/9353))\r\n([719c33e](https://github.com/AztecProtocol/aztec-packages/commit/719c33eec6bbcdf23926722518887de4d2cca8e3))\r\n* Handle reorgs on sequencer\r\n([#9201](https://github.com/AztecProtocol/aztec-packages/issues/9201))\r\n([d4dea16](https://github.com/AztecProtocol/aztec-packages/commit/d4dea162322eab233ed733aa318040e681cf5c70))\r\n* **interpreter:** Comptime derive generators\r\n(https://github.com/noir-lang/noir/pull/6303)\r\n([a166203](https://github.com/AztecProtocol/aztec-packages/commit/a166203a06c3e74096a9bc39000c4ee1615f85b8))\r\n* Introduce default public keys and replace empty public keys\r\n([#9277](https://github.com/AztecProtocol/aztec-packages/issues/9277))\r\n([47718ea](https://github.com/AztecProtocol/aztec-packages/commit/47718ea3a52468f5341a1203f70f48730faf9f7d))\r\n* Modify private calldata to use public keys\r\n([#9276](https://github.com/AztecProtocol/aztec-packages/issues/9276))\r\n([e42e219](https://github.com/AztecProtocol/aztec-packages/commit/e42e219d2ae0f0ee481ab9220023eb5a0f6a41bb))\r\n* New formatter (https://github.com/noir-lang/noir/pull/6300)\r\n([a166203](https://github.com/AztecProtocol/aztec-packages/commit/a166203a06c3e74096a9bc39000c4ee1615f85b8))\r\n* **nr:** Serde for signed ints\r\n([#9211](https://github.com/AztecProtocol/aztec-packages/issues/9211))\r\n([66f31c7](https://github.com/AztecProtocol/aztec-packages/commit/66f31c7b9d436405cd65072442a7c3da3674f340))\r\n* Publicly accessible bootstrap cache\r\n([#9335](https://github.com/AztecProtocol/aztec-packages/issues/9335))\r\n([28392d5](https://github.com/AztecProtocol/aztec-packages/commit/28392d5d4fe224aa1f10d526f2efcf2de97313ed))\r\n* Remove hash opcodes from AVM\r\n([#9209](https://github.com/AztecProtocol/aztec-packages/issues/9209))\r\n([e6db535](https://github.com/AztecProtocol/aztec-packages/commit/e6db535b69e6769fa3f2c85a0685640c92ac147b)),\r\ncloses\r\n[#9208](https://github.com/AztecProtocol/aztec-packages/issues/9208)\r\n* Sequencer cast votes\r\n([#9247](https://github.com/AztecProtocol/aztec-packages/issues/9247))\r\n([bd05d87](https://github.com/AztecProtocol/aztec-packages/commit/bd05d87891b9df0d0d537c4c1efcdf7d128a6a6f))\r\n* Sha256 refactoring and benchmark with longer input\r\n(https://github.com/noir-lang/noir/pull/6318)\r\n([a166203](https://github.com/AztecProtocol/aztec-packages/commit/a166203a06c3e74096a9bc39000c4ee1615f85b8))\r\n* **ssa:** Various mem2reg reverts to reduce memory and compilation time\r\n(https://github.com/noir-lang/noir/pull/6307)\r\n([a166203](https://github.com/AztecProtocol/aztec-packages/commit/a166203a06c3e74096a9bc39000c4ee1615f85b8))\r\n* Sync from aztec-packages (https://github.com/noir-lang/noir/pull/6301)\r\n([a166203](https://github.com/AztecProtocol/aztec-packages/commit/a166203a06c3e74096a9bc39000c4ee1615f85b8))\r\n* Translator on Shplemini\r\n([#9329](https://github.com/AztecProtocol/aztec-packages/issues/9329))\r\n([21fa3cf](https://github.com/AztecProtocol/aztec-packages/commit/21fa3cf054cf1a3652c8a27ddf042c1c48b47039))\r\n* TXE single execution env\r\n([#9183](https://github.com/AztecProtocol/aztec-packages/issues/9183))\r\n([1d1d76d](https://github.com/AztecProtocol/aztec-packages/commit/1d1d76d7a0ae6fb67825e3d82c59539438defc7c))\r\n* Warn about private types leaking in public functions and struct fields\r\n(https://github.com/noir-lang/noir/pull/6296)\r\n([a166203](https://github.com/AztecProtocol/aztec-packages/commit/a166203a06c3e74096a9bc39000c4ee1615f85b8))\r\n\r\n\r\n### Bug Fixes\r\n\r\n* 4epochs kind test et al\r\n([#9358](https://github.com/AztecProtocol/aztec-packages/issues/9358))\r\n([e480e6b](https://github.com/AztecProtocol/aztec-packages/commit/e480e6b9a2e81ec19cbd0391a65bb3954771656f))\r\n* Allow array map on empty arrays\r\n(https://github.com/noir-lang/noir/pull/6305)\r\n([a166203](https://github.com/AztecProtocol/aztec-packages/commit/a166203a06c3e74096a9bc39000c4ee1615f85b8))\r\n* **avm:** Public dispatch in proving tests\r\n([#9331](https://github.com/AztecProtocol/aztec-packages/issues/9331))\r\n([42e5221](https://github.com/AztecProtocol/aztec-packages/commit/42e5221dda3fc28dc7fcce3607af756132b4e314))\r\n* Barretenberg readme scare warning\r\n([#9313](https://github.com/AztecProtocol/aztec-packages/issues/9313))\r\n([f759d55](https://github.com/AztecProtocol/aztec-packages/commit/f759d55d956fc0133ddec0db284de12b552b4c89))\r\n* Broken constants gen\r\n([#9387](https://github.com/AztecProtocol/aztec-packages/issues/9387))\r\n([eb7bc6b](https://github.com/AztecProtocol/aztec-packages/commit/eb7bc6b934e6d150daa4ad3315bcac33598e3650))\r\n* Ci github clone edge case\r\n([#9320](https://github.com/AztecProtocol/aztec-packages/issues/9320))\r\n([15abe6f](https://github.com/AztecProtocol/aztec-packages/commit/15abe6fe2f12450b7f40d859a394dec966132b0b))\r\n* **ci:** Report 4 epochs true\r\n([#9346](https://github.com/AztecProtocol/aztec-packages/issues/9346))\r\n([1ce0fa5](https://github.com/AztecProtocol/aztec-packages/commit/1ce0fa58d14c6b9b5f26f3cd3bda3589dd85b4e5))\r\n* Display function name and body when inlining recursion limit hit\r\n(https://github.com/noir-lang/noir/pull/6291)\r\n([a166203](https://github.com/AztecProtocol/aztec-packages/commit/a166203a06c3e74096a9bc39000c4ee1615f85b8))\r\n* Do not warn on unused self in traits\r\n(https://github.com/noir-lang/noir/pull/6298)\r\n([a166203](https://github.com/AztecProtocol/aztec-packages/commit/a166203a06c3e74096a9bc39000c4ee1615f85b8))\r\n* Enforce correctness of decompositions performed at compile time\r\n(https://github.com/noir-lang/noir/pull/6278)\r\n([a166203](https://github.com/AztecProtocol/aztec-packages/commit/a166203a06c3e74096a9bc39000c4ee1615f85b8))\r\n* Reject invalid expression with in CLI parser\r\n(https://github.com/noir-lang/noir/pull/6287)\r\n([a166203](https://github.com/AztecProtocol/aztec-packages/commit/a166203a06c3e74096a9bc39000c4ee1615f85b8))\r\n* Remove reliance on invalid decompositions in selector calculation\r\n([#9337](https://github.com/AztecProtocol/aztec-packages/issues/9337))\r\n([c8e4260](https://github.com/AztecProtocol/aztec-packages/commit/c8e4260efdd7f8a24b189800dcacedeb5e257562))\r\n* Support empty epochs\r\n([#9341](https://github.com/AztecProtocol/aztec-packages/issues/9341))\r\n([9dda91e](https://github.com/AztecProtocol/aztec-packages/commit/9dda91e59c4eba8e9b197617dc076d46e3e74459))\r\n* Use github.actor on publish workflow dispatch\r\n([#9324](https://github.com/AztecProtocol/aztec-packages/issues/9324))\r\n([5fa660d](https://github.com/AztecProtocol/aztec-packages/commit/5fa660d48ecd711a7445fa365ac6b677aeac93bf))\r\n\r\n\r\n### Miscellaneous\r\n\r\n* **avm:** Some cleaning in avm prover\r\n([#9311](https://github.com/AztecProtocol/aztec-packages/issues/9311))\r\n([523aa23](https://github.com/AztecProtocol/aztec-packages/commit/523aa231acd22228fa6414fc8241cebdfa21eafa))\r\n* Bump node types\r\n([#9397](https://github.com/AztecProtocol/aztec-packages/issues/9397))\r\n([763d5b1](https://github.com/AztecProtocol/aztec-packages/commit/763d5b1652e68290127a25e106fb3093a4325067))\r\n* Copying world state binary to yarn project is on generate\r\n([#9194](https://github.com/AztecProtocol/aztec-packages/issues/9194))\r\n([8d75dd4](https://github.com/AztecProtocol/aztec-packages/commit/8d75dd4a6730c1af27b23bc786ed9db8eb199e6f))\r\n* Disable bench-process-history\r\n([#9360](https://github.com/AztecProtocol/aztec-packages/issues/9360))\r\n([8e6734e](https://github.com/AztecProtocol/aztec-packages/commit/8e6734e0ba10f37d37a74c5bab9a35a7b515beb5))\r\n* **docs:** Refactoring guides and some other nits\r\n(https://github.com/noir-lang/noir/pull/6175)\r\n([a166203](https://github.com/AztecProtocol/aztec-packages/commit/a166203a06c3e74096a9bc39000c4ee1615f85b8))\r\n* Fix and re-enable prover coordination e2e test\r\n([#9344](https://github.com/AztecProtocol/aztec-packages/issues/9344))\r\n([3a1a62c](https://github.com/AztecProtocol/aztec-packages/commit/3a1a62cb84dc9457b58104e01ac358a2820159cb))\r\n* Implement Fq add\r\n([#9354](https://github.com/AztecProtocol/aztec-packages/issues/9354))\r\n([1711fac](https://github.com/AztecProtocol/aztec-packages/commit/1711fac844edabb02e71b5cc0b691742a19f85fd))\r\n* Minor test cleanup\r\n([#9339](https://github.com/AztecProtocol/aztec-packages/issues/9339))\r\n([a2ed567](https://github.com/AztecProtocol/aztec-packages/commit/a2ed567ad42b237088c110ce12ce8212d5099da2))\r\n* Print out gas at start and end of each enqueued call\r\n([#9377](https://github.com/AztecProtocol/aztec-packages/issues/9377))\r\n([29c0b95](https://github.com/AztecProtocol/aztec-packages/commit/29c0b956ae20b7c954cd514dfbf33753dfc0a53c))\r\n* Quick account manager refactor\r\n([#9357](https://github.com/AztecProtocol/aztec-packages/issues/9357))\r\n([648d043](https://github.com/AztecProtocol/aztec-packages/commit/648d043952f76ad0c2b7c536da2a59a7642a2cc2))\r\n* Quick keystore refactor\r\n([#9355](https://github.com/AztecProtocol/aztec-packages/issues/9355))\r\n([31b9999](https://github.com/AztecProtocol/aztec-packages/commit/31b9999cd8f533d262b5729229e0468550072ef9))\r\n* Redo typo PR by pucedoteth\r\n([#9385](https://github.com/AztecProtocol/aztec-packages/issues/9385))\r\n([fd1a0d1](https://github.com/AztecProtocol/aztec-packages/commit/fd1a0d1bdd64f69a08e39202658b46956e9a5254))\r\n* Release Noir(0.36.0) (https://github.com/noir-lang/noir/pull/6213)\r\n([a166203](https://github.com/AztecProtocol/aztec-packages/commit/a166203a06c3e74096a9bc39000c4ee1615f85b8))\r\n* Remove dead function (https://github.com/noir-lang/noir/pull/6308)\r\n([a166203](https://github.com/AztecProtocol/aztec-packages/commit/a166203a06c3e74096a9bc39000c4ee1615f85b8))\r\n* Remove delegate call and storage address\r\n([#9330](https://github.com/AztecProtocol/aztec-packages/issues/9330))\r\n([465f88e](https://github.com/AztecProtocol/aztec-packages/commit/465f88e9e89ac7af2ec8d4b061722dc3b776301e))\r\n* Remove noir_js_backend_barretenberg\r\n([#9338](https://github.com/AztecProtocol/aztec-packages/issues/9338))\r\n([cefe3d9](https://github.com/AztecProtocol/aztec-packages/commit/cefe3d901731d3b05de503ce93c97a3badf91363))\r\n* Remove unnecessary `is_integral_bit_size` function\r\n([#9352](https://github.com/AztecProtocol/aztec-packages/issues/9352))\r\n([ac8e6d7](https://github.com/AztecProtocol/aztec-packages/commit/ac8e6d707a13e1da7cf62f4922756ab674db6b07))\r\n* Remove usage of slices in pedersen hash\r\n(https://github.com/noir-lang/noir/pull/6295)\r\n([a166203](https://github.com/AztecProtocol/aztec-packages/commit/a166203a06c3e74096a9bc39000c4ee1615f85b8))\r\n* Replace relative paths to noir-protocol-circuits\r\n([32bd7b9](https://github.com/AztecProtocol/aztec-packages/commit/32bd7b9f334ce71bef0ee9a5e821be2b577d981e))\r\n* Replace relative paths to noir-protocol-circuits\r\n([add4605](https://github.com/AztecProtocol/aztec-packages/commit/add460559f90b020c01cb62fa52e91524e9b47b2))\r\n* Replace relative paths to noir-protocol-circuits\r\n([8cb89af](https://github.com/AztecProtocol/aztec-packages/commit/8cb89af84c0ab51b21892ecb021aadc001267674))\r\n* Replace usage of vector in keccakf1600 input with array\r\n([#9350](https://github.com/AztecProtocol/aztec-packages/issues/9350))\r\n([cb58490](https://github.com/AztecProtocol/aztec-packages/commit/cb58490eed9cc46a7b2039d93645a9456ee9c834))\r\n* Scenario for upgrading gerousia\r\n([#9246](https://github.com/AztecProtocol/aztec-packages/issues/9246))\r\n([66f59d6](https://github.com/AztecProtocol/aztec-packages/commit/66f59d64dfd52a57817ef887f8931d0c0aec4a2a))\r\n* Silence cache-download.sh\r\n([#9317](https://github.com/AztecProtocol/aztec-packages/issues/9317))\r\n([314d9d2](https://github.com/AztecProtocol/aztec-packages/commit/314d9d26ba00ce7efc3df0e040d612aacd5264b3))\r\n* Test 4epochs in native-network\r\n([#9309](https://github.com/AztecProtocol/aztec-packages/issues/9309))\r\n([ddb312a](https://github.com/AztecProtocol/aztec-packages/commit/ddb312ac266ef629280fe768ac5247eceea0f7a7))\r\n* Unstake the bond when the proof lands\r\n([#9363](https://github.com/AztecProtocol/aztec-packages/issues/9363))\r\n([b25b913](https://github.com/AztecProtocol/aztec-packages/commit/b25b9138da7d2a97b5e14934fb4edb911bc7fa22))\r\n* Update `noir-edwards` repo to point at `noir-lang` org\r\n(https://github.com/noir-lang/noir/pull/6323)\r\n([a166203](https://github.com/AztecProtocol/aztec-packages/commit/a166203a06c3e74096a9bc39000c4ee1615f85b8))\r\n* Updated NFT flows\r\n([#9150](https://github.com/AztecProtocol/aztec-packages/issues/9150))\r\n([407f8b4](https://github.com/AztecProtocol/aztec-packages/commit/407f8b448b0209e219afd83efe38a8e6b6cded06))\r\n</details>\r\n\r\n<details><summary>barretenberg: 0.60.0</summary>\r\n\r\n##\r\n[0.60.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.59.0...barretenberg-v0.60.0)\r\n(2024-10-24)\r\n\r\n\r\n### ⚠ BREAKING CHANGES\r\n\r\n* replace usage of vector in keccakf1600 input with array\r\n([#9350](https://github.com/AztecProtocol/aztec-packages/issues/9350))\r\n* remove hash opcodes from AVM\r\n([#9209](https://github.com/AztecProtocol/aztec-packages/issues/9209))\r\n* remove delegate call and storage address\r\n([#9330](https://github.com/AztecProtocol/aztec-packages/issues/9330))\r\n\r\n### Features\r\n\r\n* **avm:** Full poseidon2\r\n([#9141](https://github.com/AztecProtocol/aztec-packages/issues/9141))\r\n([eae7587](https://github.com/AztecProtocol/aztec-packages/commit/eae75872fdd813ed07f70c1e5d41c7b9f399ab72))\r\n* Eccvm translator zk sumcheck\r\n([#9199](https://github.com/AztecProtocol/aztec-packages/issues/9199))\r\n([c7d4572](https://github.com/AztecProtocol/aztec-packages/commit/c7d4572b49b33ee309f9238f3cec245878e6c295))\r\n* Remove hash opcodes from AVM\r\n([#9209](https://github.com/AztecProtocol/aztec-packages/issues/9209))\r\n([e6db535](https://github.com/AztecProtocol/aztec-packages/commit/e6db535b69e6769fa3f2c85a0685640c92ac147b)),\r\ncloses\r\n[#9208](https://github.com/AztecProtocol/aztec-packages/issues/9208)\r\n* Translator on Shplemini\r\n([#9329](https://github.com/AztecProtocol/aztec-packages/issues/9329))\r\n([21fa3cf](https://github.com/AztecProtocol/aztec-packages/commit/21fa3cf054cf1a3652c8a27ddf042c1c48b47039))\r\n\r\n\r\n### Bug Fixes\r\n\r\n* **avm:** Public dispatch in proving tests\r\n([#9331](https://github.com/AztecProtocol/aztec-packages/issues/9331))\r\n([42e5221](https://github.com/AztecProtocol/aztec-packages/commit/42e5221dda3fc28dc7fcce3607af756132b4e314))\r\n* Barretenberg readme scare warning\r\n([#9313](https://github.com/AztecProtocol/aztec-packages/issues/9313))\r\n([f759d55](https://github.com/AztecProtocol/aztec-packages/commit/f759d55d956fc0133ddec0db284de12b552b4c89))\r\n\r\n\r\n### Miscellaneous\r\n\r\n* **avm:** Some cleaning in avm prover\r\n([#9311](https://github.com/AztecProtocol/aztec-packages/issues/9311))\r\n([523aa23](https://github.com/AztecProtocol/aztec-packages/commit/523aa231acd22228fa6414fc8241cebdfa21eafa))\r\n* Copying world state binary to yarn project is on generate\r\n([#9194](https://github.com/AztecProtocol/aztec-packages/issues/9194))\r\n([8d75dd4](https://github.com/AztecProtocol/aztec-packages/commit/8d75dd4a6730c1af27b23bc786ed9db8eb199e6f))\r\n* Remove delegate call and storage address\r\n([#9330](https://github.com/AztecProtocol/aztec-packages/issues/9330))\r\n([465f88e](https://github.com/AztecProtocol/aztec-packages/commit/465f88e9e89ac7af2ec8d4b061722dc3b776301e))\r\n* Remove noir_js_backend_barretenberg\r\n([#9338](https://github.com/AztecProtocol/aztec-packages/issues/9338))\r\n([cefe3d9](https://github.com/AztecProtocol/aztec-packages/commit/cefe3d901731d3b05de503ce93c97a3badf91363))\r\n* Replace usage of vector in keccakf1600 input with array\r\n([#9350](https://github.com/AztecProtocol/aztec-packages/issues/9350))\r\n([cb58490](https://github.com/AztecProtocol/aztec-packages/commit/cb58490eed9cc46a7b2039d93645a9456ee9c834))\r\n</details>\r\n\r\n---\r\nThis PR was generated with [Release\r\nPlease](https://github.com/googleapis/release-please). See\r\n[documentation](https://github.com/googleapis/release-please#release-please).",
          "timestamp": "2024-10-24T13:43:34-04:00",
          "tree_id": "66874c95e290de7d015ab045990d0ddd84f32869",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/09c9ad894ad64f44c25c191004273ae2828186d5"
        },
        "date": 1729793466999,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 30774.666844000025,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 29319.524564000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5333.8974930000095,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4982.736344 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 92699.23295699999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 92699235000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15136.644877000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15136644000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2711363678,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2711363678 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 127090385,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 127090385 ns\nthreads: 1"
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
          "id": "07d6dc29db2eb04154b8f0c66bd1efa74c0e8b9d",
          "message": "feat(avm): avm replace zeromorph pcs by shplemini (#9389)\n\nResolves #9349 \r\n\r\nNative proving and verification time did not change significantly on\r\nbulk tests. Before and after this PR, we get\r\n\r\n- pcs step proving time: 2.1 sec\r\n- pcs verification step time: 50 ms\r\n\r\nRecursive verifier num of gates decreased of about 6.5%:\r\n5312325 --> 4971289",
          "timestamp": "2024-10-24T20:53:32+02:00",
          "tree_id": "0b0d18b47d6f02dbceba7e49cf9e2928a2c8f8fa",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/07d6dc29db2eb04154b8f0c66bd1efa74c0e8b9d"
        },
        "date": 1729798484431,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 30889.758760000008,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 29138.890123 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5377.372792000003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5064.886341 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 92767.986846,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 92767988000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15213.389192,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15213388000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2705592999,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2705592999 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126087037,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126087037 ns\nthreads: 1"
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
          "id": "84fdc526f73027a3450bcdcc78b826fc9da8df88",
          "message": "feat: Print finalized size and log dyadic size during Ultra proof construction (#9411)\n\nYou can now see the circuit sizes in the e2e full prover test.",
          "timestamp": "2024-10-24T17:47:24-04:00",
          "tree_id": "8675acf321f92640b1831bb006457a0e8b411c25",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/84fdc526f73027a3450bcdcc78b826fc9da8df88"
        },
        "date": 1729808116794,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 30847.066788999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 29225.964655000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5372.882576000009,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5038.989699000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 94092.438965,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 94092441000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15161.680561,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15161680000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2717535451,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2717535451 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126186669,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126186669 ns\nthreads: 1"
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
          "id": "2bb09e59f648e6182f1097d283451afd3c488d27",
          "message": "feat: bytecode hashing init (#8535)\n\nThis adds proper computation of the public bytecode commitment (i.e.\r\npair-wise poseidon hashing of the public bytecode). This hash is also\r\ncomputed in the witgen although the circuit remains unconstrained.\r\n\r\nFollow up PRs will handle:\r\n1) Deriving class id, including tracing and hinting the artifact hash,\r\netc\r\n2) Deriving the address, including tracing and hinting the contract\r\ninstance\r\n3) Merkle path hinting and verification in the AVM",
          "timestamp": "2024-10-25T15:13:41+01:00",
          "tree_id": "d531be1b3de5d89fef81d95a0648210ccf98db24",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/2bb09e59f648e6182f1097d283451afd3c488d27"
        },
        "date": 1729867261557,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 30828.311361999993,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 28952.089779 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5348.9558649999935,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5002.027076 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 93254.62796800002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 93254630000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15220.061291,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15220061000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2715364570,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2715364570 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 128242637,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 128242637 ns\nthreads: 1"
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
          "id": "84205d872067345239913914a84b708d05d8364c",
          "message": "feat(avm): trace contract class and contract instance (#8840)\n\nThis PR is centred around tracing and passing contract class & instance\r\nduring simulator execution and passing it to circuit. We store each\r\ncontract class & instance whenever the `simulator` calls `getBytecode`.\r\n\r\nThis changes the input interface to the bb binary - we no longer take in\r\na specific bytecode to execute. Instead we get a vector of\r\n`{contract_class, contract_instance, bytecode}` which define all the\r\n(deduplicated) contract bytecode that will be executed during this\r\n\"one-enqueued call\" (actual implementation of 1-enqueued call tbd).\r\n\r\nThis doesnt do any derivation of id or address yet",
          "timestamp": "2024-10-25T15:53:25+01:00",
          "tree_id": "b2cb91e82c38f735658e88c9d312338fdd07b567",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/84205d872067345239913914a84b708d05d8364c"
        },
        "date": 1729870683281,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 30824.063572999876,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 28977.064539 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5357.160063000038,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5041.958132999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 90897.220161,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 90897222000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15185.878856999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15185879000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2702632818,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2702632818 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126158558,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126158558 ns\nthreads: 1"
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
          "id": "1bbd724eab39c193c1db1d89570eab9358563fe2",
          "message": "feat(avm/brillig)!: revert/rethrow oracle (#9408)\n\nThis PR introduces a revert oracle to be used when (and only when) rethrowing revertdata in public. The major difference with just doing `assert(false, data)` is that the latter will also add an error selector to the revertdata, which is not something we want when rethrowing.\n\n* Creates a revert oracle to be used for rethrowing.\n* Changes TRAP/REVERT to have a runtime size.",
          "timestamp": "2024-10-25T17:49:12+01:00",
          "tree_id": "a8b966ca306aeb646254cf62ceac303f6e24ed2f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1bbd724eab39c193c1db1d89570eab9358563fe2"
        },
        "date": 1729877432315,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 30762.430378999994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 28925.057473 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5337.910193999988,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4996.069336 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 92085.686835,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 92085688000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15183.141846,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15183141000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2704906561,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2704906561 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126613305,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126613305 ns\nthreads: 1"
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
          "id": "a67d0e2122945998119a8643a4fb4e74fccc7f34",
          "message": "chore(avm): Allocate memory for unshifted polynomials according to their trace col size (#9345)\n\nSome measurements on bulk test showed that resident memory during\r\nproving went from 33.1 GB to 28.4 GB.",
          "timestamp": "2024-10-25T20:12:45+02:00",
          "tree_id": "30e462f146708fab2680cc20bd1656dd762dde12",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a67d0e2122945998119a8643a4fb4e74fccc7f34"
        },
        "date": 1729881445642,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 30837.070517,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 29067.204898 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5345.56532500001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5017.449989 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 91926.988729,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 91926991000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15167.119286,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15167119000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2699587404,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2699587404 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126754976,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126754976 ns\nthreads: 1"
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
          "id": "91c50dd6c52bc95aab4748d022516fc1b5fd5fe6",
          "message": "chore: bumping L2 gas and public reads constants (#9431)",
          "timestamp": "2024-10-25T14:15:13-04:00",
          "tree_id": "af82cf552f2aa75d985e2a8eb15a1cca8e939709",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/91c50dd6c52bc95aab4748d022516fc1b5fd5fe6"
        },
        "date": 1729882346645,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 30777.122819,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 28831.392146 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5355.669605999992,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5031.694933 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 91979.21608299999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 91979217000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15098.008913000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15098010000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2730645173,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2730645173 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 128342368,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 128342368 ns\nthreads: 1"
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
          "id": "2ebe3611ad3826443b31e5626a4e08cdd90f0f2a",
          "message": "feat: derive address and class id in avm (#8897)\n\nthis PR adds tracing of the class id and contract instance when\r\n`getBytecode` (indicating a new context execution is happening in the\r\nsimulator) is executed.\r\n\r\nWe now derive the class id and the contract address in witgen, plus\r\nbuild the (unconstrained) circuit for:\r\n\r\n1. the raw bytecode bytes, \r\n2. the field encoded version\r\n3. the bytecode hash derivation\r\n\r\nThe circuit elements of the contract class id and address will be done\r\nin a follow up based on how we tackle nullifier request",
          "timestamp": "2024-10-26T18:26:04-04:00",
          "tree_id": "f4513cd797fd8196c605a219cff91b00a1e98364",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/2ebe3611ad3826443b31e5626a4e08cdd90f0f2a"
        },
        "date": 1729983285888,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 30830.65084100002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 28893.521361 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5360.253768999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5060.213106 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 92563.331494,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 92563333000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15140.094836,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15140095000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2710663305,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2710663305 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 127831682,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 127831682 ns\nthreads: 1"
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
          "id": "a85f92a24f4ec988a4d472651a0e2827bf9381b2",
          "message": "fix(avm): address bytecode hashing comments (#9436)\n\nFixing up some earlier comments in PRs",
          "timestamp": "2024-10-27T11:02:14-04:00",
          "tree_id": "f761e5c091bdc9b4cc03392f11c26094006ff8b9",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a85f92a24f4ec988a4d472651a0e2827bf9381b2"
        },
        "date": 1730042864242,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 30814.117400000014,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 29016.342338 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5391.582382999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5046.063061 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 92493.65878499999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 92493662000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15181.880702999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15181880000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2712424423,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2712424423 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126163766,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126163766 ns\nthreads: 1"
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
          "id": "29b692f9e81e1ee809e37274cf6ac2ab0ca526ce",
          "message": "feat!: getcontractinstance instruction returns only a specified member (#9300)\n\n`GETCONTRACTINSTANCE` now takes member enum as immediate operand and\r\nwrites/returns a single field from the contract instance. Also\r\nwrites/returns a u1/bool for \"exists\".\r\n\r\nChanged the trace to accept (separately) address, exists,\r\ncontractInstance since the trace generally operates on lower-level\r\ntypes, not structs.\r\n\r\nNoir has a different oracle for each enum value (similar to the `GETENV`\r\nvariations).",
          "timestamp": "2024-10-27T17:49:52Z",
          "tree_id": "69a14d67e1ace06d7ce342a0e15e9de6b1e95f95",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/29b692f9e81e1ee809e37274cf6ac2ab0ca526ce"
        },
        "date": 1730053034899,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 30826.452797,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 29056.790563 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5341.396951999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4997.648776 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 91744.004195,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 91744007000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15110.163371,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15110162000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2707414199,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2707414199 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 124794973,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 124794973 ns\nthreads: 1"
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
          "id": "8e07de8233929d40a433a80064ceec30a69c1360",
          "message": "chore(avm:): Fix execution tests in proving mode (#9466)\n\nThis will fix failures in:\r\nhttps://github.com/AztecProtocol/aztec-packages/actions/runs/11547299961",
          "timestamp": "2024-10-28T09:49:39Z",
          "tree_id": "3ef5a856fd0482bb8b368b6951520fe99f8bee35",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8e07de8233929d40a433a80064ceec30a69c1360"
        },
        "date": 1730110862785,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 30765.77651100001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 28825.568314999997 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5365.104804000012,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5064.249232 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 92651.39496100001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 92651397000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15148.522228999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15148523000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2715504396,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2715504396 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 127042197,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 127042197 ns\nthreads: 1"
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
          "id": "d52b616a91224c25f24a00b76b984f059c103dcb",
          "message": "feat(avm): merkle tree gadget (#9205)\n\nResolves https://github.com/AztecProtocol/aztec-packages/issues/9458",
          "timestamp": "2024-10-28T10:43:35Z",
          "tree_id": "9c45bacaefc8b266b166fa5a3cca66d6f65c47d1",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d52b616a91224c25f24a00b76b984f059c103dcb"
        },
        "date": 1730114617498,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 30795.84886699999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 29016.224961000004 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5332.517873000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5015.26463 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 91700.982917,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 91700985000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15115.508313999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15115507000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2712728625,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2712728625 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 125876914,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 125876914 ns\nthreads: 1"
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
          "id": "8658abd46612d3fdf8c8b54902c201c790a52345",
          "message": "feat: fixed number of pub inputs for databus commitment propagation (#9336)\n\nThis work is motivated by the need to have a \"write vk\" method for\r\nkernel circuits that depends only on acir constraints (no witness data\r\nor historical data about the previously accumulated circuits). This is\r\nmade difficult by the inter-circuit databus consistency check mechanism\r\nwhich, until now, added structure to a present circuit based on the\r\nstructure of previous circuits. This PR makes updates to the mechanism\r\nso that the constraints associated with the databus consistency checks\r\nare consistent across all kernel circuits. There are two components to\r\nthis:\r\n\r\n(1) Every kernel propagates 2 commitments worth of data (one for app\r\nreturn data, one for kernel return data) on its public inputs.\r\n(Previously this was allowed to be 0, 1 or 2 depending on the number of\r\nrecursive verifications performed by the kernel). If data does not exist\r\nfor either of these (e.g. if the kernel is only verifying a proof of one\r\nor the other), a default value is propagated. (This value is set to\r\nmatch the commitment to the \"empty\" calldata that will correspond to the\r\nmissing return data).\r\n\r\n(2) Every kernel performs two commitment consistency checks: one that\r\nchecks that the app `return_data` is equal to the `secondary_calldata`\r\nand one that checks that the previous kernel `return_data` is equal to\r\nthe `calldata`. (Previously there could be 0, 1, or 2 such checks\r\ndepending on the data propagated on the public inputs of the kernel\r\nbeing recursively verified - hence the need for knowledge of history /\r\nwitness data).\r\n\r\nCloses https://github.com/AztecProtocol/barretenberg/issues/1125 (had to\r\ndo with dynamically determining the number of public inputs associated\r\nwith databus commitments which is now fixed in size to 16).",
          "timestamp": "2024-10-28T07:42:16-07:00",
          "tree_id": "ba603d89606afceb8d617f12a28cec086931da61",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8658abd46612d3fdf8c8b54902c201c790a52345"
        },
        "date": 1730128864710,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 30866.215102000013,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 29142.921290000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5351.697946000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5064.016449999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 91351.84189,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 91351844000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15169.656309999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15169656000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2686004829,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2686004829 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 125664065,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 125664065 ns\nthreads: 1"
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
          "id": "1c0275db18510fd7d55b400e4a910447859f4acc",
          "message": "feat: sol shplemini in acir tests + contract_gen (#8874)",
          "timestamp": "2024-10-29T06:22:55Z",
          "tree_id": "7956c29b8160ef536a438df9b558251d3bba5887",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1c0275db18510fd7d55b400e4a910447859f4acc"
        },
        "date": 1730184662283,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 30877.837845999977,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 29177.465247 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5347.561196000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5005.999544 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 92530.160855,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 92530163000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15157.737312,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15157738000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2709076827,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2709076827 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 127908149,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 127908149 ns\nthreads: 1"
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
          "id": "7c2d67a7c63a2b05d8f8d48b1690c87e8bacfc49",
          "message": "chore: align debug logging between AVM sim & witgen (#9498)",
          "timestamp": "2024-10-29T08:51:47+01:00",
          "tree_id": "1b58bf437fc3645ee06c3612ee2e354ecb1b2a34",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7c2d67a7c63a2b05d8f8d48b1690c87e8bacfc49"
        },
        "date": 1730190735237,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 31000.684504999983,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 29207.877119 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5385.0720280000105,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5059.5087650000005 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 93101.393078,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 93101395000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15322.41921,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15322419000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2695476910,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2695476910 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126755173,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126755173 ns\nthreads: 1"
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
          "id": "3351217a7e7f1848c43e14d19427e1cd789c78fc",
          "message": "fix: revert \"feat: sol shplemini in acir tests + contract_gen\" (#9505)\n\nReverts AztecProtocol/aztec-packages#8874\r\n\r\nSeems to break the prover e2e, i cannot reproduce locally rn.",
          "timestamp": "2024-10-29T10:36:20Z",
          "tree_id": "83482401c6321e5e1b8f8c6228896f53fa20f2ee",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/3351217a7e7f1848c43e14d19427e1cd789c78fc"
        },
        "date": 1730202573358,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 30977.778160999977,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 29478.607825 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5449.805523999984,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5062.474743 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 91872.966094,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 91872968000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15214.672032,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15214673000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2708818197,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2708818197 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126782918,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126782918 ns\nthreads: 1"
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
          "id": "0fe64dfabe6b4413943204ec17a5d0dca3c2d011",
          "message": "fix(avm): re-enable sha256 in bulk test, fix bug in AVM SHL/SHR (#9496)\n\nReverts AztecProtocol/aztec-packages#9482",
          "timestamp": "2024-10-29T11:31:46Z",
          "tree_id": "0321d157249aa227efa6a264398299d4965078e5",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0fe64dfabe6b4413943204ec17a5d0dca3c2d011"
        },
        "date": 1730203134976,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 31009.145664000018,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 29276.36729 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5417.303787999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5041.500788 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 93704.152491,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 93704155000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15233.801043000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15233800000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2741048070,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2741048070 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 129529235,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 129529235 ns\nthreads: 1"
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
          "id": "bc9828e03ba0924c2cfdaffb4b7455c8eebf01e9",
          "message": "test: use big endian in sha  (#9471)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\r\nline.\r\n\r\n---------\r\n\r\nCo-authored-by: dbanks12 <david@aztecprotocol.com>\r\nCo-authored-by: David Banks <47112877+dbanks12@users.noreply.github.com>",
          "timestamp": "2024-10-29T08:02:10-04:00",
          "tree_id": "03a10da0621bde861d5d4d0c4505632a5e0004f9",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/bc9828e03ba0924c2cfdaffb4b7455c8eebf01e9"
        },
        "date": 1730205575584,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 30912.58440300001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 29276.702808 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5365.898195,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5017.569630999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 91530.44902100001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 91530451000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15167.330012999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15167330000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2698848147,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2698848147 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126757929,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126757929 ns\nthreads: 1"
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
          "id": "8f710068a10e09fad9c159306c19c555bb3b5bb6",
          "message": "feat(avm)!: returndatasize + returndatacopy (#9475)\n\nThis PR\n* Introduces RETURNDATASIZE and RETURNDATACOPY (also copies revert data if reverted)\n* Fixes a bug in CALL in witgen\n* Changes the public context to return slices when calling public functions. This was partly done because templated functions would always be inlined and I wanted to avoid that blowup\n\nNote that the rethrowing hack is still present in the simulator, so the rethrowing branch in the public context is still not used. I will make this change once @sirasistant finishes the string encoding changes.\n\nIn a later PR we can remove the returndata from CALL.\n\nPart of #9061.",
          "timestamp": "2024-10-29T17:01:39Z",
          "tree_id": "9f9846d0222e5df93ed550c21885ea9804ef68fe",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8f710068a10e09fad9c159306c19c555bb3b5bb6"
        },
        "date": 1730222912212,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 30950.335728,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 29371.197408 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5397.899536000012,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5075.965949999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 91805.27016700001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 91805272000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15174.790125999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15174790000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2712315314,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2712315314 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126647434,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126647434 ns\nthreads: 1"
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
          "id": "468c100558f181408ad59b528ad4e43aaa7e7f3a",
          "message": "fix: honk shplemini acir artifacts (#9550)\n\nReverts AztecProtocol/aztec-packages#9505",
          "timestamp": "2024-10-29T17:05:57Z",
          "tree_id": "c55f49a97ae6f1acfdaf9bcbe7f719976093a478",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/468c100558f181408ad59b528ad4e43aaa7e7f3a"
        },
        "date": 1730224036380,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 30946.971482999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 29203.644255 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5341.377541,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4998.010596999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 92943.086677,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 92943089000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15250.972099,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15250972000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2694299760,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2694299760 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126126358,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126126358 ns\nthreads: 1"
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
          "id": "26adc55771a204f96e8594f6defde2a4872c88d2",
          "message": "feat(avm)!: cleanup CALL (#9551)\n\n* (Static)CALL now returns just the success bit\n* Properly returns U1 instead of U8\n* Removed FunctionSelector\n\nFixes #8998. Part of #9061.",
          "timestamp": "2024-10-29T17:57:21Z",
          "tree_id": "1fba5264a5faefaa4166f84df6ded362598266a8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/26adc55771a204f96e8594f6defde2a4872c88d2"
        },
        "date": 1730227064645,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 30850.779605000014,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 29019.381799 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5349.200418000009,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5004.156865999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 92386.64418,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 92386646000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15173.086461,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15173086000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2704267986,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2704267986 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 127341546,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 127341546 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "blorktronics@gmail.com",
            "name": "Zachary James Williamson",
            "username": "zac-williamson"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "a4bd3e14f6cde05f4d59bc48142e9ef4bc78f0ae",
          "message": "feat: 20-30% cost reduction in recursive ipa algorithm (#9420)\n\neccvm_recursive_verifier_test measurements (size-512 eccvm recursive\r\nverification)\r\n\r\nOld: 876,214\r\nNew: 678,751\r\n\r\nThe relative performance delta should be much greater for large eccvm\r\ninstances as this PR removes an nlogn algorithm.\r\n\r\nThis PR resolves issue\r\n[#857](https://github.com/AztecProtocol/barretenberg/issues/857) and\r\nissue [#1023](https://github.com/AztecProtocol/barretenberg/issues/1023)\r\n(single batch mul in IPA)\r\n\r\nRe: [#1023](https://github.com/AztecProtocol/barretenberg/issues/1023).\r\nThe code still performs 2 batch muls, but all additional * operator\r\ncalls have been combined into the batch muls.\r\n\r\nIt is not worth combining both batch muls, as it would require a\r\nmultiplication operation on a large number of scalar multipliers. In the\r\nrecursive setting the scalars are bigfield elements - the extra\r\nbigfield::operator* cost is not worth combining both batch_mul calls.\r\n\r\nAdditional improvements:\r\n\r\nremoved unneccessary uses of `pow` operator in ipa - in the recursive\r\nsetting these were stdlib::bigfield::pow calls and very expensive\r\n\r\nremoved the number of distinct multiplication calls in\r\nipa::reduce_verify_internal\r\n\r\ncycle_scalar::cycle_scalar(stdlib::bigfield) constructor now more\r\noptimally constructs a cycle_scalar out of a bigfield element. New\r\nmethod leverages the fact that `scalar.lo` and `scalar.hi` are\r\nimplicitly range-constrained to remove reundant bigfield constructor\r\ncalls and arithmetic calls, and the process of performing a scalar\r\nmultiplication applies a modular reduction to the imput, which makes the\r\nexplicit call to `validate_scalar_is_in_field` unneccessary\r\n\r\n---------\r\nCo-authored-by: lucasxia01 <lucasxia01@gmail.com>",
          "timestamp": "2024-10-29T19:33:43Z",
          "tree_id": "5bfa9fcb50af6a23b007b7468c9bddb518c11ac9",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a4bd3e14f6cde05f4d59bc48142e9ef4bc78f0ae"
        },
        "date": 1730232804114,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 30870.16600800001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 29020.958751000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5343.219687000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4971.285772 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 92672.39028,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 92672392000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15116.009784999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15116010000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2712001183,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2712001183 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126471477,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126471477 ns\nthreads: 1"
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
          "id": "10874f402c48c0721491f0db8bc0266653193d9b",
          "message": "feat: reorder blocks for efficiency (#9560)\n\nReorders blocks (Mega only) so that data bus reads are close to the top\r\nof the trace and lookups are at the bottom. This helps minimize both the\r\nmemory required to store the log-deriv inverse polynomials as well as\r\nthe \"active\" region of the trace by minimizing the distance (maximizing\r\nthe overlap) of the various lookup gates with the data from which they\r\nread. (Note: tables are constructed at the bottom of the trace).",
          "timestamp": "2024-10-29T15:16:31-07:00",
          "tree_id": "dd55b09c26fe5ba1cdec96dbadeb75b468fad307",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/10874f402c48c0721491f0db8bc0266653193d9b"
        },
        "date": 1730242391172,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 30572.905143000015,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 28699.815508 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5352.307101000022,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5051.848772 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 91708.771418,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 91708773000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15118.753338999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15118753000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2664636702,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2664636702 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126149529,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126149529 ns\nthreads: 1"
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
          "id": "0da8757413e3c4fbe84ffebb6ece518c4ea203ed",
          "message": "chore(master): Release 0.61.0",
          "timestamp": "2024-10-30T12:19:08Z",
          "url": "https://github.com/AztecProtocol/aztec-packages/pull/9414/commits/0da8757413e3c4fbe84ffebb6ece518c4ea203ed"
        },
        "date": 1730291834749,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 30544.335655000024,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 28465.549108 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5347.279317999991,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5036.7202879999995 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 90779.498035,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 90779500000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15148.100232,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15148102000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2677340961,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2677340961 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 127262415,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 127262415 ns\nthreads: 1"
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
          "id": "d9de430e4a01d6908a9b1fe5e6ede9309aa8a10d",
          "message": "chore(master): Release 0.61.0 (#9414)\n\n:robot: I have created a release *beep* *boop*\r\n---\r\n\r\n\r\n<details><summary>aztec-package: 0.61.0</summary>\r\n\r\n##\r\n[0.61.0](https://github.com/AztecProtocol/aztec-packages/compare/aztec-package-v0.60.0...aztec-package-v0.61.0)\r\n(2024-10-30)\r\n\r\n\r\n### Miscellaneous\r\n\r\n* **aztec-package:** Synchronize aztec-packages versions\r\n</details>\r\n\r\n<details><summary>barretenberg.js: 0.61.0</summary>\r\n\r\n##\r\n[0.61.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg.js-v0.60.0...barretenberg.js-v0.61.0)\r\n(2024-10-30)\r\n\r\n\r\n### Miscellaneous\r\n\r\n* **barretenberg.js:** Synchronize aztec-packages versions\r\n</details>\r\n\r\n<details><summary>aztec-packages: 0.61.0</summary>\r\n\r\n##\r\n[0.61.0](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.60.0...aztec-packages-v0.61.0)\r\n(2024-10-30)\r\n\r\n\r\n### ⚠ BREAKING CHANGES\r\n\r\n* **avm:** cleanup CALL\r\n([#9551](https://github.com/AztecProtocol/aztec-packages/issues/9551))\r\n* **avm:** returndatasize + returndatacopy\r\n([#9475](https://github.com/AztecProtocol/aztec-packages/issues/9475))\r\n* use Brillig opcode when possible for less-than operations on fields\r\n([#9416](https://github.com/AztecProtocol/aztec-packages/issues/9416))\r\n* **profiler:** New flamegraph command that profiles the opcodes\r\nexecuted (https://github.com/noir-lang/noir/pull/6327)\r\n* split base rollup and remove public kernel proving\r\n([#9434](https://github.com/AztecProtocol/aztec-packages/issues/9434))\r\n* getcontractinstance instruction returns only a specified member\r\n([#9300](https://github.com/AztecProtocol/aztec-packages/issues/9300))\r\n* **avm/brillig:** revert/rethrow oracle\r\n([#9408](https://github.com/AztecProtocol/aztec-packages/issues/9408))\r\n\r\n### Features\r\n\r\n* `bytes_to_fields` requiring only 1 generic param\r\n([#9417](https://github.com/AztecProtocol/aztec-packages/issues/9417))\r\n([2217da6](https://github.com/AztecProtocol/aztec-packages/commit/2217da6b46cc98a2c671b270e46d91ddfbc8d812))\r\n* 20-30% cost reduction in recursive ipa algorithm\r\n([#9420](https://github.com/AztecProtocol/aztec-packages/issues/9420))\r\n([a4bd3e1](https://github.com/AztecProtocol/aztec-packages/commit/a4bd3e14f6cde05f4d59bc48142e9ef4bc78f0ae))\r\n* Add capacities to brillig vectors and use them in slice ops\r\n(https://github.com/noir-lang/noir/pull/6332)\r\n([b82f3d1](https://github.com/AztecProtocol/aztec-packages/commit/b82f3d1109a7c15517e9da8613fa90a4699cad83))\r\n* Added indexes and a way to store/retrieve tagged secrets\r\n([#9468](https://github.com/AztecProtocol/aztec-packages/issues/9468))\r\n([1c685b1](https://github.com/AztecProtocol/aztec-packages/commit/1c685b1dd3e7749e6f4570773ecc64ab245d8a0b))\r\n* **avm/brillig:** Revert/rethrow oracle\r\n([#9408](https://github.com/AztecProtocol/aztec-packages/issues/9408))\r\n([1bbd724](https://github.com/AztecProtocol/aztec-packages/commit/1bbd724eab39c193c1db1d89570eab9358563fe2))\r\n* **avm:** Avm replace zeromorph pcs by shplemini\r\n([#9389](https://github.com/AztecProtocol/aztec-packages/issues/9389))\r\n([07d6dc2](https://github.com/AztecProtocol/aztec-packages/commit/07d6dc29db2eb04154b8f0c66bd1efa74c0e8b9d))\r\n* **avm:** Cleanup CALL\r\n([#9551](https://github.com/AztecProtocol/aztec-packages/issues/9551))\r\n([26adc55](https://github.com/AztecProtocol/aztec-packages/commit/26adc55771a204f96e8594f6defde2a4872c88d2))\r\n* **avm:** Merkle tree gadget\r\n([#9205](https://github.com/AztecProtocol/aztec-packages/issues/9205))\r\n([d52b616](https://github.com/AztecProtocol/aztec-packages/commit/d52b616a91224c25f24a00b76b984f059c103dcb))\r\n* **avm:** Returndatasize + returndatacopy\r\n([#9475](https://github.com/AztecProtocol/aztec-packages/issues/9475))\r\n([8f71006](https://github.com/AztecProtocol/aztec-packages/commit/8f710068a10e09fad9c159306c19c555bb3b5bb6))\r\n* **avm:** Trace contract class and contract instance\r\n([#8840](https://github.com/AztecProtocol/aztec-packages/issues/8840))\r\n([84205d8](https://github.com/AztecProtocol/aztec-packages/commit/84205d872067345239913914a84b708d05d8364c))\r\n* Better LSP hover for functions\r\n(https://github.com/noir-lang/noir/pull/6376)\r\n([b82f3d1](https://github.com/AztecProtocol/aztec-packages/commit/b82f3d1109a7c15517e9da8613fa90a4699cad83))\r\n* Bytecode hashing init\r\n([#8535](https://github.com/AztecProtocol/aztec-packages/issues/8535))\r\n([2bb09e5](https://github.com/AztecProtocol/aztec-packages/commit/2bb09e59f648e6182f1097d283451afd3c488d27))\r\n* Check trait where clause (https://github.com/noir-lang/noir/pull/6325)\r\n([d67381b](https://github.com/AztecProtocol/aztec-packages/commit/d67381b3116159e1ffdd6e1e94ac68eb3d8e25de))\r\n* Comptime deriving generators in macros\r\n([#9195](https://github.com/AztecProtocol/aztec-packages/issues/9195))\r\n([c4b629c](https://github.com/AztecProtocol/aztec-packages/commit/c4b629c446eb7d8043d1eaa3eb57ff788268fc2a))\r\n* Derive address and class id in avm\r\n([#8897](https://github.com/AztecProtocol/aztec-packages/issues/8897))\r\n([2ebe361](https://github.com/AztecProtocol/aztec-packages/commit/2ebe3611ad3826443b31e5626a4e08cdd90f0f2a))\r\n* Do not increment reference counts on arrays through references\r\n(https://github.com/noir-lang/noir/pull/6375)\r\n([f386612](https://github.com/AztecProtocol/aztec-packages/commit/f3866129d467da23224865232a67f6ca20c21151))\r\n* **docs:** Function transforms (hidden macros)\r\n([#7784](https://github.com/AztecProtocol/aztec-packages/issues/7784))\r\n([831cc66](https://github.com/AztecProtocol/aztec-packages/commit/831cc66bab9dd8063caac2ecc4022192a5460e13))\r\n* Fee pricing to 0 for old instances\r\n([#9296](https://github.com/AztecProtocol/aztec-packages/issues/9296))\r\n([7bc3a21](https://github.com/AztecProtocol/aztec-packages/commit/7bc3a2136a2d9b1818434a86ace28a05bba32efc))\r\n* Fixed number of pub inputs for databus commitment propagation\r\n([#9336](https://github.com/AztecProtocol/aztec-packages/issues/9336))\r\n([8658abd](https://github.com/AztecProtocol/aztec-packages/commit/8658abd46612d3fdf8c8b54902c201c790a52345))\r\n* Getcontractinstance instruction returns only a specified member\r\n([#9300](https://github.com/AztecProtocol/aztec-packages/issues/9300))\r\n([29b692f](https://github.com/AztecProtocol/aztec-packages/commit/29b692f9e81e1ee809e37274cf6ac2ab0ca526ce))\r\n* Implement encryption to an address point and decryption from an\r\naddress secret\r\n([#9272](https://github.com/AztecProtocol/aztec-packages/issues/9272))\r\n([6d77dd0](https://github.com/AztecProtocol/aztec-packages/commit/6d77dd0000c66659dbcde3930fb052605ba6af05))\r\n* Initial block reward + external libraries\r\n([#9297](https://github.com/AztecProtocol/aztec-packages/issues/9297))\r\n([240e9b5](https://github.com/AztecProtocol/aztec-packages/commit/240e9b562ef18d9b98ccc407ac95ec92f5a9bd58))\r\n* Let LSP suggest traits in trait bounds\r\n(https://github.com/noir-lang/noir/pull/6370)\r\n([f386612](https://github.com/AztecProtocol/aztec-packages/commit/f3866129d467da23224865232a67f6ca20c21151))\r\n* Let the formatter remove lambda block braces for single-statement\r\nblocks (https://github.com/noir-lang/noir/pull/6335)\r\n([d67381b](https://github.com/AztecProtocol/aztec-packages/commit/d67381b3116159e1ffdd6e1e94ac68eb3d8e25de))\r\n* Let the LSP import code action insert into existing use statements\r\n(https://github.com/noir-lang/noir/pull/6358)\r\n([f386612](https://github.com/AztecProtocol/aztec-packages/commit/f3866129d467da23224865232a67f6ca20c21151))\r\n* Let the LSP import code action insert into existing use statements\r\n(https://github.com/noir-lang/noir/pull/6358)\r\n([d67381b](https://github.com/AztecProtocol/aztec-packages/commit/d67381b3116159e1ffdd6e1e94ac68eb3d8e25de))\r\n* LSP auto-import will try to add to existing use statements\r\n(https://github.com/noir-lang/noir/pull/6354)\r\n([f386612](https://github.com/AztecProtocol/aztec-packages/commit/f3866129d467da23224865232a67f6ca20c21151))\r\n* LSP auto-import will try to add to existing use statements\r\n(https://github.com/noir-lang/noir/pull/6354)\r\n([d67381b](https://github.com/AztecProtocol/aztec-packages/commit/d67381b3116159e1ffdd6e1e94ac68eb3d8e25de))\r\n* Merge and sort imports (https://github.com/noir-lang/noir/pull/6322)\r\n([b4db379](https://github.com/AztecProtocol/aztec-packages/commit/b4db37908d452ca86399baded392d5e3e86c7bc8))\r\n* Note tagging oracle\r\n([#9429](https://github.com/AztecProtocol/aztec-packages/issues/9429))\r\n([cec6306](https://github.com/AztecProtocol/aztec-packages/commit/cec63061cf8daa6d83b2634d74da8cc473598994))\r\n* Ownable sysstia\r\n([#9398](https://github.com/AztecProtocol/aztec-packages/issues/9398))\r\n([30314ec](https://github.com/AztecProtocol/aztec-packages/commit/30314ecc5148262a4af3a5ac1cee3bb7403bc806)),\r\ncloses\r\n[#9351](https://github.com/AztecProtocol/aztec-packages/issues/9351)\r\n* **perf:** Use [u32;16] for message block in sha256\r\n(https://github.com/noir-lang/noir/pull/6324)\r\n([d67381b](https://github.com/AztecProtocol/aztec-packages/commit/d67381b3116159e1ffdd6e1e94ac68eb3d8e25de))\r\n* Print finalized size and log dyadic size during Ultra proof\r\nconstruction\r\n([#9411](https://github.com/AztecProtocol/aztec-packages/issues/9411))\r\n([84fdc52](https://github.com/AztecProtocol/aztec-packages/commit/84fdc526f73027a3450bcdcc78b826fc9da8df88))\r\n* **profiler:** New flamegraph command that profiles the opcodes\r\nexecuted (https://github.com/noir-lang/noir/pull/6327)\r\n([d67381b](https://github.com/AztecProtocol/aztec-packages/commit/d67381b3116159e1ffdd6e1e94ac68eb3d8e25de))\r\n* Prover coordination test with a reorg\r\n([#9405](https://github.com/AztecProtocol/aztec-packages/issues/9405))\r\n([9efe288](https://github.com/AztecProtocol/aztec-packages/commit/9efe288cae945cec1e025fd7cd0bde220aff4b8d))\r\n* **prover:** Perform prover coordination via p2p layer\r\n([#9325](https://github.com/AztecProtocol/aztec-packages/issues/9325))\r\n([2132bc2](https://github.com/AztecProtocol/aztec-packages/commit/2132bc254ef3dbeaec27be98acb85a98b20385bb)),\r\ncloses\r\n[#9264](https://github.com/AztecProtocol/aztec-packages/issues/9264)\r\n* Reject programs with unconditional recursion\r\n(https://github.com/noir-lang/noir/pull/6292)\r\n([b4db379](https://github.com/AztecProtocol/aztec-packages/commit/b4db37908d452ca86399baded392d5e3e86c7bc8))\r\n* Remove 'single use' intermediate variables\r\n(https://github.com/noir-lang/noir/pull/6268)\r\n([d67381b](https://github.com/AztecProtocol/aztec-packages/commit/d67381b3116159e1ffdd6e1e94ac68eb3d8e25de))\r\n* Reorder blocks for efficiency\r\n([#9560](https://github.com/AztecProtocol/aztec-packages/issues/9560))\r\n([10874f4](https://github.com/AztecProtocol/aztec-packages/commit/10874f402c48c0721491f0db8bc0266653193d9b))\r\n* Simulate latency with network chaos\r\n([#9469](https://github.com/AztecProtocol/aztec-packages/issues/9469))\r\n([10aefbb](https://github.com/AztecProtocol/aztec-packages/commit/10aefbbfe9f741c197900fffe2858127f1dafad8))\r\n* Sol shplemini in acir tests + contract_gen\r\n([#8874](https://github.com/AztecProtocol/aztec-packages/issues/8874))\r\n([1c0275d](https://github.com/AztecProtocol/aztec-packages/commit/1c0275db18510fd7d55b400e4a910447859f4acc))\r\n* Suggest removing `!` from macro call that doesn't return Quoted\r\n(https://github.com/noir-lang/noir/pull/6384)\r\n([b82f3d1](https://github.com/AztecProtocol/aztec-packages/commit/b82f3d1109a7c15517e9da8613fa90a4699cad83))\r\n* Support specifying generics on a struct when calling an associated\r\nfunction (https://github.com/noir-lang/noir/pull/6306)\r\n([b82f3d1](https://github.com/AztecProtocol/aztec-packages/commit/b82f3d1109a7c15517e9da8613fa90a4699cad83))\r\n* Sync from aztec-packages (https://github.com/noir-lang/noir/pull/6345)\r\n([d67381b](https://github.com/AztecProtocol/aztec-packages/commit/d67381b3116159e1ffdd6e1e94ac68eb3d8e25de))\r\n* Tally AVM opcodes executed in simulator\r\n([#9473](https://github.com/AztecProtocol/aztec-packages/issues/9473))\r\n([9a06ada](https://github.com/AztecProtocol/aztec-packages/commit/9a06ada30c936cf5e7d10af49abe4b7274667ee2))\r\n* **test:** Run test matrix on stdlib tests\r\n(https://github.com/noir-lang/noir/pull/6352)\r\n([f386612](https://github.com/AztecProtocol/aztec-packages/commit/f3866129d467da23224865232a67f6ca20c21151))\r\n* **test:** Run test matrix on stdlib tests\r\n(https://github.com/noir-lang/noir/pull/6352)\r\n([d67381b](https://github.com/AztecProtocol/aztec-packages/commit/d67381b3116159e1ffdd6e1e94ac68eb3d8e25de))\r\n\r\n\r\n### Bug Fixes\r\n\r\n* (formatter) correctly format quote delimiters\r\n(https://github.com/noir-lang/noir/pull/6377)\r\n([b82f3d1](https://github.com/AztecProtocol/aztec-packages/commit/b82f3d1109a7c15517e9da8613fa90a4699cad83))\r\n* (formatter) indent after infix lhs\r\n(https://github.com/noir-lang/noir/pull/6331)\r\n([b4db379](https://github.com/AztecProtocol/aztec-packages/commit/b4db37908d452ca86399baded392d5e3e86c7bc8))\r\n* (LSP) check visibility of module that re-exports item, if any\r\n(https://github.com/noir-lang/noir/pull/6371)\r\n([f386612](https://github.com/AztecProtocol/aztec-packages/commit/f3866129d467da23224865232a67f6ca20c21151))\r\n* Add native verification test to honk keccak\r\n([#9501](https://github.com/AztecProtocol/aztec-packages/issues/9501))\r\n([59810e0](https://github.com/AztecProtocol/aztec-packages/commit/59810e070e57fa8e250928608b39c66eaae39a84))\r\n* Allow globals in format strings\r\n(https://github.com/noir-lang/noir/pull/6382)\r\n([b82f3d1](https://github.com/AztecProtocol/aztec-packages/commit/b82f3d1109a7c15517e9da8613fa90a4699cad83))\r\n* Allow more resources for 4epochs tests\r\n([#9418](https://github.com/AztecProtocol/aztec-packages/issues/9418))\r\n([74a8ad1](https://github.com/AztecProtocol/aztec-packages/commit/74a8ad196988dd1d880b6510c7947ee27e5f4abb))\r\n* Allow type aliases in let patterns\r\n(https://github.com/noir-lang/noir/pull/6356)\r\n([f386612](https://github.com/AztecProtocol/aztec-packages/commit/f3866129d467da23224865232a67f6ca20c21151))\r\n* Allow type aliases in let patterns\r\n(https://github.com/noir-lang/noir/pull/6356)\r\n([d67381b](https://github.com/AztecProtocol/aztec-packages/commit/d67381b3116159e1ffdd6e1e94ac68eb3d8e25de))\r\n* Always inline `derive_generators`\r\n(https://github.com/noir-lang/noir/pull/6350)\r\n([f386612](https://github.com/AztecProtocol/aztec-packages/commit/f3866129d467da23224865232a67f6ca20c21151))\r\n* Always inline `derive_generators`\r\n(https://github.com/noir-lang/noir/pull/6350)\r\n([d67381b](https://github.com/AztecProtocol/aztec-packages/commit/d67381b3116159e1ffdd6e1e94ac68eb3d8e25de))\r\n* **avm:** Address bytecode hashing comments\r\n([#9436](https://github.com/AztecProtocol/aztec-packages/issues/9436))\r\n([a85f92a](https://github.com/AztecProtocol/aztec-packages/commit/a85f92a24f4ec988a4d472651a0e2827bf9381b2))\r\n* **avm:** Disable sha256 in bulk test until we debug it\r\n([#9482](https://github.com/AztecProtocol/aztec-packages/issues/9482))\r\n([078c318](https://github.com/AztecProtocol/aztec-packages/commit/078c318f9671566500c472553d88990076a8c32a))\r\n* **avm:** Re-enable sha256 in bulk test, fix bug in AVM SHL/SHR\r\n([#9496](https://github.com/AztecProtocol/aztec-packages/issues/9496))\r\n([0fe64df](https://github.com/AztecProtocol/aztec-packages/commit/0fe64dfabe6b4413943204ec17a5d0dca3c2d011))\r\n* Bb-only-change fix e2e build instability\r\n([#9441](https://github.com/AztecProtocol/aztec-packages/issues/9441))\r\n([ca3abaa](https://github.com/AztecProtocol/aztec-packages/commit/ca3abaa572395db3d1f3ed21493ae017d4ca13eb))\r\n* Better formatting of leading/trailing line/block comments in\r\nexpression lists (https://github.com/noir-lang/noir/pull/6338)\r\n([d67381b](https://github.com/AztecProtocol/aztec-packages/commit/d67381b3116159e1ffdd6e1e94ac68eb3d8e25de))\r\n* Cleanup of janky encryption apis\r\n([#9390](https://github.com/AztecProtocol/aztec-packages/issues/9390))\r\n([9e3e536](https://github.com/AztecProtocol/aztec-packages/commit/9e3e5361cd43f016ce0a8c7abcaba0d418707da5))\r\n* Deploy & version aztec-up scripts\r\n([#9435](https://github.com/AztecProtocol/aztec-packages/issues/9435))\r\n([ad80169](https://github.com/AztecProtocol/aztec-packages/commit/ad801693592df3263b8a621a081c7616948524da))\r\n* Display every bit in integer tokens\r\n(https://github.com/noir-lang/noir/pull/6360)\r\n([b82f3d1](https://github.com/AztecProtocol/aztec-packages/commit/b82f3d1109a7c15517e9da8613fa90a4699cad83))\r\n* Docker fast\r\n([#9467](https://github.com/AztecProtocol/aztec-packages/issues/9467))\r\n([34e6dd0](https://github.com/AztecProtocol/aztec-packages/commit/34e6dd02718131265510c49f61a1e68271f36b88))\r\n* **docs:** Update getting started docs\r\n([#9426](https://github.com/AztecProtocol/aztec-packages/issues/9426))\r\n([985190b](https://github.com/AztecProtocol/aztec-packages/commit/985190b263016038c4c5814b03c891b46e3b3f56))\r\n* Fix panic in comptime code\r\n(https://github.com/noir-lang/noir/pull/6361)\r\n([f386612](https://github.com/AztecProtocol/aztec-packages/commit/f3866129d467da23224865232a67f6ca20c21151))\r\n* Fix panic in comptime code\r\n(https://github.com/noir-lang/noir/pull/6361)\r\n([d67381b](https://github.com/AztecProtocol/aztec-packages/commit/d67381b3116159e1ffdd6e1e94ac68eb3d8e25de))\r\n* Formatter didn't format `&gt;>=` well\r\n(https://github.com/noir-lang/noir/pull/6337)\r\n([b4db379](https://github.com/AztecProtocol/aztec-packages/commit/b4db37908d452ca86399baded392d5e3e86c7bc8))\r\n* Honk shplemini acir artifacts\r\n([#9550](https://github.com/AztecProtocol/aztec-packages/issues/9550))\r\n([468c100](https://github.com/AztecProtocol/aztec-packages/commit/468c100558f181408ad59b528ad4e43aaa7e7f3a))\r\n* Issue in partial notes API\r\n([#9555](https://github.com/AztecProtocol/aztec-packages/issues/9555))\r\n([9d66c1a](https://github.com/AztecProtocol/aztec-packages/commit/9d66c1abca1af9ddb0715627fad87c2efc612a1d))\r\n* LSP auto-import would import public item inside private module\r\n(https://github.com/noir-lang/noir/pull/6366)\r\n([f386612](https://github.com/AztecProtocol/aztec-packages/commit/f3866129d467da23224865232a67f6ca20c21151))\r\n* Make keccak256 work with input lengths greater than 136 bytes\r\n(https://github.com/noir-lang/noir/pull/6393)\r\n([b82f3d1](https://github.com/AztecProtocol/aztec-packages/commit/b82f3d1109a7c15517e9da8613fa90a4699cad83))\r\n* Make sure kind tests run every master commit\r\n([#9478](https://github.com/AztecProtocol/aztec-packages/issues/9478))\r\n([78de316](https://github.com/AztecProtocol/aztec-packages/commit/78de3166ee6499670d7eff99892306d19d86481d))\r\n* Mutable global pattern didn't have a span\r\n(https://github.com/noir-lang/noir/pull/6328)\r\n([b4db379](https://github.com/AztecProtocol/aztec-packages/commit/b4db37908d452ca86399baded392d5e3e86c7bc8))\r\n* Remove assumed parent traits\r\n(https://github.com/noir-lang/noir/pull/6365)\r\n([f386612](https://github.com/AztecProtocol/aztec-packages/commit/f3866129d467da23224865232a67f6ca20c21151))\r\n* Remove unnecessary ivpk's from aztec-nr\r\n([#9460](https://github.com/AztecProtocol/aztec-packages/issues/9460))\r\n([c6437cc](https://github.com/AztecProtocol/aztec-packages/commit/c6437cc98c0c0bb5ed779f7680c54a4304c9e406))\r\n* Replace npk_m_hash with addresses\r\n([#9461](https://github.com/AztecProtocol/aztec-packages/issues/9461))\r\n([f4ed55b](https://github.com/AztecProtocol/aztec-packages/commit/f4ed55b264ff92979e6e655508b8f8fac826086e))\r\n* Revert \"feat: sol shplemini in acir tests + contract_gen\"\r\n([#9505](https://github.com/AztecProtocol/aztec-packages/issues/9505))\r\n([3351217](https://github.com/AztecProtocol/aztec-packages/commit/3351217a7e7f1848c43e14d19427e1cd789c78fc))\r\n* Slightly better formatting of empty blocks with comments\r\n(https://github.com/noir-lang/noir/pull/6367)\r\n([f386612](https://github.com/AztecProtocol/aztec-packages/commit/f3866129d467da23224865232a67f6ca20c21151))\r\n* Spot_strategy passing\r\n([#9428](https://github.com/AztecProtocol/aztec-packages/issues/9428))\r\n([1e38d3e](https://github.com/AztecProtocol/aztec-packages/commit/1e38d3e865fa8fb2b9ba142b5bc5ca59b4c04945))\r\n* **ssa:** Do not mark an array from a parameter mutable\r\n(https://github.com/noir-lang/noir/pull/6355)\r\n([f386612](https://github.com/AztecProtocol/aztec-packages/commit/f3866129d467da23224865232a67f6ca20c21151))\r\n* **ssa:** Do not mark an array from a parameter mutable\r\n(https://github.com/noir-lang/noir/pull/6355)\r\n([d67381b](https://github.com/AztecProtocol/aztec-packages/commit/d67381b3116159e1ffdd6e1e94ac68eb3d8e25de))\r\n* Yarn build:fast\r\n([#9464](https://github.com/AztecProtocol/aztec-packages/issues/9464))\r\n([bbe6d06](https://github.com/AztecProtocol/aztec-packages/commit/bbe6d06e04330bd158d1c6f6a328ccdf7d1f3a88))\r\n* Yarn project bootstrap fast\r\n([#9440](https://github.com/AztecProtocol/aztec-packages/issues/9440))\r\n([c1ebed5](https://github.com/AztecProtocol/aztec-packages/commit/c1ebed5ee199246db51461bb84541a104e8abee9))\r\n\r\n\r\n### Miscellaneous\r\n\r\n* Add serdes and eq for address note\r\n([#9544](https://github.com/AztecProtocol/aztec-packages/issues/9544))\r\n([74bcfab](https://github.com/AztecProtocol/aztec-packages/commit/74bcfabb2d6d9e2580d2114276c9731d67183021))\r\n* Add some tests for type aliases\r\n([d67381b](https://github.com/AztecProtocol/aztec-packages/commit/d67381b3116159e1ffdd6e1e94ac68eb3d8e25de))\r\n* Add test to check that duplicate definitions generated from macros\r\nthrows error (https://github.com/noir-lang/noir/pull/6351)\r\n([f386612](https://github.com/AztecProtocol/aztec-packages/commit/f3866129d467da23224865232a67f6ca20c21151))\r\n* Add test to check that duplicate definitions generated from macros\r\nthrows error (https://github.com/noir-lang/noir/pull/6351)\r\n([d67381b](https://github.com/AztecProtocol/aztec-packages/commit/d67381b3116159e1ffdd6e1e94ac68eb3d8e25de))\r\n* Align debug logging between AVM sim & witgen\r\n([#9498](https://github.com/AztecProtocol/aztec-packages/issues/9498))\r\n([7c2d67a](https://github.com/AztecProtocol/aztec-packages/commit/7c2d67a7c63a2b05d8f8d48b1690c87e8bacfc49))\r\n* **avm::** Fix execution tests in proving mode\r\n([#9466](https://github.com/AztecProtocol/aztec-packages/issues/9466))\r\n([8e07de8](https://github.com/AztecProtocol/aztec-packages/commit/8e07de8233929d40a433a80064ceec30a69c1360))\r\n* **avm:** Allocate memory for unshifted polynomials according to their\r\ntrace col size\r\n([#9345](https://github.com/AztecProtocol/aztec-packages/issues/9345))\r\n([a67d0e2](https://github.com/AztecProtocol/aztec-packages/commit/a67d0e2122945998119a8643a4fb4e74fccc7f34))\r\n* Bumping L2 gas and public reads constants\r\n([#9431](https://github.com/AztecProtocol/aztec-packages/issues/9431))\r\n([91c50dd](https://github.com/AztecProtocol/aztec-packages/commit/91c50dd6c52bc95aab4748d022516fc1b5fd5fe6))\r\n* **CI:** Remove end-to-end/Earthfile\r\n([#9364](https://github.com/AztecProtocol/aztec-packages/issues/9364))\r\n([2823cbb](https://github.com/AztecProtocol/aztec-packages/commit/2823cbbef0eb03c40a2bdf4ad587b79cd8e9bbb2)),\r\ncloses\r\n[#9221](https://github.com/AztecProtocol/aztec-packages/issues/9221)\r\n* Clean up note processor after changes due to address\r\n([#9401](https://github.com/AztecProtocol/aztec-packages/issues/9401))\r\n([d33c988](https://github.com/AztecProtocol/aztec-packages/commit/d33c988b60d0c76d16921fdb985ac7f4919423a8))\r\n* Disable e2e_fees_dapp_subscription\r\n([#9489](https://github.com/AztecProtocol/aztec-packages/issues/9489))\r\n([26416b6](https://github.com/AztecProtocol/aztec-packages/commit/26416b6193bd352f91ebf1f97d9c1dfa5fda4616))\r\n* Disable flakey e2e_synching.test.ts\r\n([#9439](https://github.com/AztecProtocol/aztec-packages/issues/9439))\r\n([01147a5](https://github.com/AztecProtocol/aztec-packages/commit/01147a59bb67a6aec1a9d41d06f97c7bafb23ac6))\r\n* Dont show aws creds in docker fast\r\n([#9465](https://github.com/AztecProtocol/aztec-packages/issues/9465))\r\n([a6d8f48](https://github.com/AztecProtocol/aztec-packages/commit/a6d8f488b1dba07efa5bf7a68eed3c49b1918f97))\r\n* Fix sync scripts\r\n([#9423](https://github.com/AztecProtocol/aztec-packages/issues/9423))\r\n([7766c8e](https://github.com/AztecProtocol/aztec-packages/commit/7766c8e714185d6e8b9fa392d7f371fb30da8f1a))\r\n* Have 'aztec' honour the 'DEBUG' env var\r\n([#9413](https://github.com/AztecProtocol/aztec-packages/issues/9413))\r\n([771a2ac](https://github.com/AztecProtocol/aztec-packages/commit/771a2ac6c834509f7eee9f0ae485147f4a045773))\r\n* Minor tweaks to comptime doc\r\n(https://github.com/noir-lang/noir/pull/6357)\r\n([f386612](https://github.com/AztecProtocol/aztec-packages/commit/f3866129d467da23224865232a67f6ca20c21151))\r\n* Minor tweaks to comptime doc\r\n(https://github.com/noir-lang/noir/pull/6357)\r\n([d67381b](https://github.com/AztecProtocol/aztec-packages/commit/d67381b3116159e1ffdd6e1e94ac68eb3d8e25de))\r\n* Minting only private or public balance in Token TXE tests\r\n([#9491](https://github.com/AztecProtocol/aztec-packages/issues/9491))\r\n([b8c015b](https://github.com/AztecProtocol/aztec-packages/commit/b8c015b2875b3945bf105443e607b04a94d28180))\r\n* Node follow prune and extend chain\r\n([#9328](https://github.com/AztecProtocol/aztec-packages/issues/9328))\r\n([a653fd3](https://github.com/AztecProtocol/aztec-packages/commit/a653fd3a11b47862b5f6cac646296bff3d2ac8f4))\r\n* Noir bug workaround\r\n([#9443](https://github.com/AztecProtocol/aztec-packages/issues/9443))\r\n([f619687](https://github.com/AztecProtocol/aztec-packages/commit/f61968767e6160eaf52edf62b8a4f7df663b5a68))\r\n* Passing partial note logs through transient storage\r\n([#9356](https://github.com/AztecProtocol/aztec-packages/issues/9356))\r\n([8835b31](https://github.com/AztecProtocol/aztec-packages/commit/8835b31d76b2f7c45416eaf67a748d8df9dbc753))\r\n* Redo typo PR by defitricks\r\n([#9571](https://github.com/AztecProtocol/aztec-packages/issues/9571))\r\n([9a5dce3](https://github.com/AztecProtocol/aztec-packages/commit/9a5dce37983a70e82527e3a9e2f9846a8a266c5a))\r\n* Remove ovpk as param in boxes contracts\r\n([#9495](https://github.com/AztecProtocol/aztec-packages/issues/9495))\r\n([2b24b98](https://github.com/AztecProtocol/aztec-packages/commit/2b24b986e72467946cc230df534f21b3d352abd4))\r\n* Remove unnecessary trait\r\n([#9437](https://github.com/AztecProtocol/aztec-packages/issues/9437))\r\n([1db2eec](https://github.com/AztecProtocol/aztec-packages/commit/1db2eececfba1b8d619ddee195a70b934f9f0d3b))\r\n* Rename private function in L2 block stream\r\n([#9481](https://github.com/AztecProtocol/aztec-packages/issues/9481))\r\n([a34d4aa](https://github.com/AztecProtocol/aztec-packages/commit/a34d4aae20600f682835f5bcd43bd866461b239a)),\r\ncloses\r\n[#9314](https://github.com/AztecProtocol/aztec-packages/issues/9314)\r\n* Replace relative paths to noir-protocol-circuits\r\n([4f2d67c](https://github.com/AztecProtocol/aztec-packages/commit/4f2d67c26d7996b297cfb0b82c0b0ec59ba12d68))\r\n* Replace relative paths to noir-protocol-circuits\r\n([33f2151](https://github.com/AztecProtocol/aztec-packages/commit/33f21518e4693ca579d94eeb06e127d7a726e80a))\r\n* Replace relative paths to noir-protocol-circuits\r\n([5247be2](https://github.com/AztecProtocol/aztec-packages/commit/5247be27868e9cee7f0cbc423560fc3685f66422))\r\n* Replace relative paths to noir-protocol-circuits\r\n([49467ba](https://github.com/AztecProtocol/aztec-packages/commit/49467bade09f1d28cc4ae874e190a9d0613f4ac0))\r\n* Replace relative paths to noir-protocol-circuits\r\n([f6d714f](https://github.com/AztecProtocol/aztec-packages/commit/f6d714f954e599a07e7d1e6f18138f9fd7b85d60))\r\n* Replace relative paths to noir-protocol-circuits\r\n([b4841ad](https://github.com/AztecProtocol/aztec-packages/commit/b4841ad84b58d5b11c261b4fd412e66c1b017d37))\r\n* Replace token note with uint note\r\n([#8143](https://github.com/AztecProtocol/aztec-packages/issues/8143))\r\n([493a3f3](https://github.com/AztecProtocol/aztec-packages/commit/493a3f3ff25725026800f8fa116b41ea4b5760ed))\r\n* Run tests in metaprogramming.rs\r\n(https://github.com/noir-lang/noir/pull/6339)\r\n([d67381b](https://github.com/AztecProtocol/aztec-packages/commit/d67381b3116159e1ffdd6e1e94ac68eb3d8e25de))\r\n* Split base rollup and remove public kernel proving\r\n([#9434](https://github.com/AztecProtocol/aztec-packages/issues/9434))\r\n([4316242](https://github.com/AztecProtocol/aztec-packages/commit/43162420776a14e39eae8462cf50833cf7ba067c))\r\n* Switch to btreeset for deterministic ordering\r\n(https://github.com/noir-lang/noir/pull/6348)\r\n([d67381b](https://github.com/AztecProtocol/aztec-packages/commit/d67381b3116159e1ffdd6e1e94ac68eb3d8e25de))\r\n* Update title from feedback\r\n(https://github.com/noir-lang/noir/pull/6334)\r\n([b4db379](https://github.com/AztecProtocol/aztec-packages/commit/b4db37908d452ca86399baded392d5e3e86c7bc8))\r\n* Use array instead of Vec in keccak256\r\n(https://github.com/noir-lang/noir/pull/6395)\r\n([b82f3d1](https://github.com/AztecProtocol/aztec-packages/commit/b82f3d1109a7c15517e9da8613fa90a4699cad83))\r\n* Use big endian in sha\r\n([#9471](https://github.com/AztecProtocol/aztec-packages/issues/9471))\r\n([bc9828e](https://github.com/AztecProtocol/aztec-packages/commit/bc9828e03ba0924c2cfdaffb4b7455c8eebf01e9))\r\n* Use Brillig opcode when possible for less-than operations on fields\r\n([#9416](https://github.com/AztecProtocol/aztec-packages/issues/9416))\r\n([e50303d](https://github.com/AztecProtocol/aztec-packages/commit/e50303d4bbdce78dadb6f4239408aa02a3bc0235))\r\n\r\n\r\n### Documentation\r\n\r\n* Clean up docker messaging\r\n([#9419](https://github.com/AztecProtocol/aztec-packages/issues/9419))\r\n([4c4974f](https://github.com/AztecProtocol/aztec-packages/commit/4c4974f0d49ed3623accf78b292b58beb73e6a0e))\r\n</details>\r\n\r\n<details><summary>barretenberg: 0.61.0</summary>\r\n\r\n##\r\n[0.61.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.60.0...barretenberg-v0.61.0)\r\n(2024-10-30)\r\n\r\n\r\n### ⚠ BREAKING CHANGES\r\n\r\n* **avm:** cleanup CALL\r\n([#9551](https://github.com/AztecProtocol/aztec-packages/issues/9551))\r\n* **avm:** returndatasize + returndatacopy\r\n([#9475](https://github.com/AztecProtocol/aztec-packages/issues/9475))\r\n* getcontractinstance instruction returns only a specified member\r\n([#9300](https://github.com/AztecProtocol/aztec-packages/issues/9300))\r\n* **avm/brillig:** revert/rethrow oracle\r\n([#9408](https://github.com/AztecProtocol/aztec-packages/issues/9408))\r\n\r\n### Features\r\n\r\n* 20-30% cost reduction in recursive ipa algorithm\r\n([#9420](https://github.com/AztecProtocol/aztec-packages/issues/9420))\r\n([a4bd3e1](https://github.com/AztecProtocol/aztec-packages/commit/a4bd3e14f6cde05f4d59bc48142e9ef4bc78f0ae))\r\n* **avm/brillig:** Revert/rethrow oracle\r\n([#9408](https://github.com/AztecProtocol/aztec-packages/issues/9408))\r\n([1bbd724](https://github.com/AztecProtocol/aztec-packages/commit/1bbd724eab39c193c1db1d89570eab9358563fe2))\r\n* **avm:** Avm replace zeromorph pcs by shplemini\r\n([#9389](https://github.com/AztecProtocol/aztec-packages/issues/9389))\r\n([07d6dc2](https://github.com/AztecProtocol/aztec-packages/commit/07d6dc29db2eb04154b8f0c66bd1efa74c0e8b9d))\r\n* **avm:** Cleanup CALL\r\n([#9551](https://github.com/AztecProtocol/aztec-packages/issues/9551))\r\n([26adc55](https://github.com/AztecProtocol/aztec-packages/commit/26adc55771a204f96e8594f6defde2a4872c88d2))\r\n* **avm:** Merkle tree gadget\r\n([#9205](https://github.com/AztecProtocol/aztec-packages/issues/9205))\r\n([d52b616](https://github.com/AztecProtocol/aztec-packages/commit/d52b616a91224c25f24a00b76b984f059c103dcb))\r\n* **avm:** Returndatasize + returndatacopy\r\n([#9475](https://github.com/AztecProtocol/aztec-packages/issues/9475))\r\n([8f71006](https://github.com/AztecProtocol/aztec-packages/commit/8f710068a10e09fad9c159306c19c555bb3b5bb6))\r\n* **avm:** Trace contract class and contract instance\r\n([#8840](https://github.com/AztecProtocol/aztec-packages/issues/8840))\r\n([84205d8](https://github.com/AztecProtocol/aztec-packages/commit/84205d872067345239913914a84b708d05d8364c))\r\n* Bytecode hashing init\r\n([#8535](https://github.com/AztecProtocol/aztec-packages/issues/8535))\r\n([2bb09e5](https://github.com/AztecProtocol/aztec-packages/commit/2bb09e59f648e6182f1097d283451afd3c488d27))\r\n* Derive address and class id in avm\r\n([#8897](https://github.com/AztecProtocol/aztec-packages/issues/8897))\r\n([2ebe361](https://github.com/AztecProtocol/aztec-packages/commit/2ebe3611ad3826443b31e5626a4e08cdd90f0f2a))\r\n* Fixed number of pub inputs for databus commitment propagation\r\n([#9336](https://github.com/AztecProtocol/aztec-packages/issues/9336))\r\n([8658abd](https://github.com/AztecProtocol/aztec-packages/commit/8658abd46612d3fdf8c8b54902c201c790a52345))\r\n* Getcontractinstance instruction returns only a specified member\r\n([#9300](https://github.com/AztecProtocol/aztec-packages/issues/9300))\r\n([29b692f](https://github.com/AztecProtocol/aztec-packages/commit/29b692f9e81e1ee809e37274cf6ac2ab0ca526ce))\r\n* Print finalized size and log dyadic size during Ultra proof\r\nconstruction\r\n([#9411](https://github.com/AztecProtocol/aztec-packages/issues/9411))\r\n([84fdc52](https://github.com/AztecProtocol/aztec-packages/commit/84fdc526f73027a3450bcdcc78b826fc9da8df88))\r\n* Reorder blocks for efficiency\r\n([#9560](https://github.com/AztecProtocol/aztec-packages/issues/9560))\r\n([10874f4](https://github.com/AztecProtocol/aztec-packages/commit/10874f402c48c0721491f0db8bc0266653193d9b))\r\n* Sol shplemini in acir tests + contract_gen\r\n([#8874](https://github.com/AztecProtocol/aztec-packages/issues/8874))\r\n([1c0275d](https://github.com/AztecProtocol/aztec-packages/commit/1c0275db18510fd7d55b400e4a910447859f4acc))\r\n\r\n\r\n### Bug Fixes\r\n\r\n* Add native verification test to honk keccak\r\n([#9501](https://github.com/AztecProtocol/aztec-packages/issues/9501))\r\n([59810e0](https://github.com/AztecProtocol/aztec-packages/commit/59810e070e57fa8e250928608b39c66eaae39a84))\r\n* **avm:** Address bytecode hashing comments\r\n([#9436](https://github.com/AztecProtocol/aztec-packages/issues/9436))\r\n([a85f92a](https://github.com/AztecProtocol/aztec-packages/commit/a85f92a24f4ec988a4d472651a0e2827bf9381b2))\r\n* **avm:** Re-enable sha256 in bulk test, fix bug in AVM SHL/SHR\r\n([#9496](https://github.com/AztecProtocol/aztec-packages/issues/9496))\r\n([0fe64df](https://github.com/AztecProtocol/aztec-packages/commit/0fe64dfabe6b4413943204ec17a5d0dca3c2d011))\r\n* Honk shplemini acir artifacts\r\n([#9550](https://github.com/AztecProtocol/aztec-packages/issues/9550))\r\n([468c100](https://github.com/AztecProtocol/aztec-packages/commit/468c100558f181408ad59b528ad4e43aaa7e7f3a))\r\n* Revert \"feat: sol shplemini in acir tests + contract_gen\"\r\n([#9505](https://github.com/AztecProtocol/aztec-packages/issues/9505))\r\n([3351217](https://github.com/AztecProtocol/aztec-packages/commit/3351217a7e7f1848c43e14d19427e1cd789c78fc))\r\n\r\n\r\n### Miscellaneous\r\n\r\n* Align debug logging between AVM sim & witgen\r\n([#9498](https://github.com/AztecProtocol/aztec-packages/issues/9498))\r\n([7c2d67a](https://github.com/AztecProtocol/aztec-packages/commit/7c2d67a7c63a2b05d8f8d48b1690c87e8bacfc49))\r\n* **avm::** Fix execution tests in proving mode\r\n([#9466](https://github.com/AztecProtocol/aztec-packages/issues/9466))\r\n([8e07de8](https://github.com/AztecProtocol/aztec-packages/commit/8e07de8233929d40a433a80064ceec30a69c1360))\r\n* **avm:** Allocate memory for unshifted polynomials according to their\r\ntrace col size\r\n([#9345](https://github.com/AztecProtocol/aztec-packages/issues/9345))\r\n([a67d0e2](https://github.com/AztecProtocol/aztec-packages/commit/a67d0e2122945998119a8643a4fb4e74fccc7f34))\r\n* Bumping L2 gas and public reads constants\r\n([#9431](https://github.com/AztecProtocol/aztec-packages/issues/9431))\r\n([91c50dd](https://github.com/AztecProtocol/aztec-packages/commit/91c50dd6c52bc95aab4748d022516fc1b5fd5fe6))\r\n* Use big endian in sha\r\n([#9471](https://github.com/AztecProtocol/aztec-packages/issues/9471))\r\n([bc9828e](https://github.com/AztecProtocol/aztec-packages/commit/bc9828e03ba0924c2cfdaffb4b7455c8eebf01e9))\r\n</details>\r\n\r\n---\r\nThis PR was generated with [Release\r\nPlease](https://github.com/googleapis/release-please). See\r\n[documentation](https://github.com/googleapis/release-please#release-please).",
          "timestamp": "2024-10-30T12:19:02Z",
          "tree_id": "bdffa0d5dd08dac38884b7b5c2bd20c8b09e4eaf",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d9de430e4a01d6908a9b1fe5e6ede9309aa8a10d"
        },
        "date": 1730292271889,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 30568.734113000006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 28522.855007000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5351.957244000019,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5039.629615999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 91820.37951800002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 91820381000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15169.424408999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15169424000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2677113021,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2677113021 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 124772316,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 124772316 ns\nthreads: 1"
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
          "id": "5f386963b06752087c2600949cbb4bb2910b25ef",
          "message": "feat(avm)!: use 32 bit locations (#9596)\n\nContrary to what was expected months ago, we have to support contracts > 65 kB. So we need 32 bit locations in the upcoming move to byte-indexed PCs. This increseases bytecode ~8% in the short term. In the longer term, we might introduce relative jumps with 8 and 16 bit variants. That would likely leave us in an even better place than where we are today.\r\n\r\nPart of #9059.",
          "timestamp": "2024-10-30T17:06:17Z",
          "tree_id": "d69b174f994341af74ea4b06a9a284e4a18f829a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5f386963b06752087c2600949cbb4bb2910b25ef"
        },
        "date": 1730309688154,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 30537.163948,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 28830.413115000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5378.605791999988,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5081.097699 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 90934.590223,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 90934592000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15165.98959,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15165989000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2706576734,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2706576734 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126468834,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126468834 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "blorktronics@gmail.com",
            "name": "Zachary James Williamson",
            "username": "zac-williamson"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "9211d8afbd0fe31043ea593675ce5a72c1dc7e4e",
          "message": "feat: biggroup_goblin handles points at infinity + 1.8x reduction in ECCVM size (#9366)\n\nThis PR adds support for biggroup_goblin handling elliptic curve points\r\nat infinity\r\n\r\nThis feature is used to optimize the ECCVM instructions created when\r\nrunning a recursive protogalaxy verifier.\r\n\r\nInstead of performing size-2 scalar multiplications for every\r\nwitness/commitment, additional random challenges are generated in order\r\nto evaluate two large batch multiplications.\r\n\r\nThe technique implemented is described in\r\nhttps://hackmd.io/T1239dufTgO1v8Ie7EExlQ?view\r\n\r\nIn the case of ClientIVCRecursionTests.ClientTubeBase where the number\r\nof circuits is set to four, this reduces the size of the ECCVM execution\r\ntrace size by 45%, which is good enough to reduce the log dyadic size of\r\nthe ClientIVCVerifier by 1/2.",
          "timestamp": "2024-10-30T15:51:29-04:00",
          "tree_id": "7ee95de7b97c8ef0dba2446e00440f68d104ccc8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9211d8afbd0fe31043ea593675ce5a72c1dc7e4e"
        },
        "date": 1730320299950,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29271.485224000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27417.830350000004 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5419.456435000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5083.737690000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 86281.51837499999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 86281520000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15209.479228999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15209479000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2516740076,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2516740076 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126019837,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126019837 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "blorktronics@gmail.com",
            "name": "Zachary James Williamson",
            "username": "zac-williamson"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "722ec5c3dfdc2a5e467528ed94a25677f8800087",
          "message": "feat: faster square roots (#2694)\n\nWe use the Tonelli-Shanks square root algorithm to perform square roots,\r\nrequired for deriving generators on the Grumpkin curve.\r\n\r\nOur existing implementation uses a slow algorithm that requires ~1,000\r\nfield multiplications per square root.\r\n\r\nThis PR implements a newer algorithm by Bernstein that uses precomputed\r\nlookup tables to increase performance\r\n\r\nhttps://cr.yp.to/papers/sqroot-20011123-retypeset20220327.pdf",
          "timestamp": "2024-10-30T17:54:29-04:00",
          "tree_id": "9dfa0c8467e712b8f4a9bdfe6b6bde11d20f9510",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/722ec5c3dfdc2a5e467528ed94a25677f8800087"
        },
        "date": 1730327613020,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29168.44631999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27502.004968999998 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5384.818256000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5045.767242 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 86206.17749599999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 86206180000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15132.977390999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15132977000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2498302551,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2498302551 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 127878727,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 127878727 ns\nthreads: 1"
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
          "id": "747bff1acbca3d263a765db82baa6ef9ca58c372",
          "message": "chore: bb sanitizers on master (#9564)\n\nThis is free QA, though sanitizers likely aren't clean. Let's enable\r\nthis and turn off what breaks",
          "timestamp": "2024-10-31T00:13:29Z",
          "tree_id": "d21944a326cc7b2b789c4892ad7ef89b77650e43",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/747bff1acbca3d263a765db82baa6ef9ca58c372"
        },
        "date": 1730335205935,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29072.96704999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27302.109651 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5341.850662999988,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5014.940085 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 86621.50410800001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 86621506000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15083.171796,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15083171000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2507322254,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2507322254 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 125933660,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 125933660 ns\nthreads: 1"
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
          "id": "feace70727f9e5a971809955030a8ea88ce84f4a",
          "message": "fix: Resolution of bugs from bigfield audits (#9547)\n\nThis PR resolves Critical, High, Medium, Low and some informational\r\nissues from the bigfield test audits by ZKSecurity, Zellic and Spearbit\r\n\r\n---------\r\n\r\nCo-authored-by: Sarkoxed <sarkoxed2013@yandex.ru>",
          "timestamp": "2024-10-31T14:44:03Z",
          "tree_id": "2df25d38969cc420b856f5ccb5b6245bd9a4742a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/feace70727f9e5a971809955030a8ea88ce84f4a"
        },
        "date": 1730388104836,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29017.037254999992,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27310.968871 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5355.483168000006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5035.9659329999995 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 86797.26345600002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 86797266000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15083.60771,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15083608000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2492365482,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2492365482 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 127741613,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 127741613 ns\nthreads: 1"
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
          "id": "392114a0a66bd580175ff7a07b0c6d899d69be8f",
          "message": "feat: spartan proving (#9584)\n\nThis PR adds K8s config to deploy a network with proving enabled\r\n\r\n---------\r\n\r\nCo-authored-by: PhilWindle <60546371+PhilWindle@users.noreply.github.com>\r\nCo-authored-by: ludamad <adam.domurad@gmail.com>",
          "timestamp": "2024-10-31T14:43:45Z",
          "tree_id": "2a9a733215cc671ab7f19b5bee59bc9baca1d9a5",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/392114a0a66bd580175ff7a07b0c6d899d69be8f"
        },
        "date": 1730388117187,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29038.40440899998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27588.387776999996 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5345.783819000005,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5038.791959 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 86221.087194,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 86221089000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15038.765556,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15038766000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2486578167,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2486578167 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 127340470,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 127340470 ns\nthreads: 1"
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
          "id": "04dd2c4c959d5d80e527be9c71504c051e3c5929",
          "message": "fix: Ensuring translator range constraint polynomials are zeroes outside of minicircuit (#9251)\n\nWhen Translator was built, there was expectation on using ZM's degree\r\nchecks for minicircuit polynomials later. ZM is dead, so we have to\r\nenforce those in another way so there is no soundness issue during\r\npolynomial concatenation. This PR adds relations to ensure\r\nrange_constraint polynomials are zero outside of minicircuit\r\n\r\nClientIVC before:\r\n\r\n![image](https://github.com/user-attachments/assets/6299f04b-41de-4f41-90e4-45e49bf42470)\r\nClientIVC after:\r\n\r\n![image](https://github.com/user-attachments/assets/5b0c8677-ee3f-4195-898e-892ef38e9eef)\r\n\r\nFixes https://github.com/AztecProtocol/barretenberg/issues/1128",
          "timestamp": "2024-10-31T16:07:52Z",
          "tree_id": "d1c72b41fc5ce364658ef2a000c861f00c2c347e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/04dd2c4c959d5d80e527be9c71504c051e3c5929"
        },
        "date": 1730392913622,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28973.78177799999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27509.533153 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5348.173583000005,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4992.931622 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 85819.50574000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 85819508000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15070.684988,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15070684000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2490302991,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2490302991 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 125831171,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 125831171 ns\nthreads: 1"
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
          "id": "3ed5ad0aee288ce4230aa9b36196c0422610c39b",
          "message": "chore(master): Release 0.62.0",
          "timestamp": "2024-11-01T13:15:45Z",
          "url": "https://github.com/AztecProtocol/aztec-packages/pull/9583/commits/3ed5ad0aee288ce4230aa9b36196c0422610c39b"
        },
        "date": 1730468067957,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29034.472476000017,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27483.012807 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5318.654448999993,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4999.423937 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 85530.823754,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 85530826000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15092.66903,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15092669000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2488625534,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2488625534 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 129744730,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 129744730 ns\nthreads: 1"
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
          "id": "edf6389a783250e5684c5ddd3ec3757623b5b770",
          "message": "chore(master): Release 0.62.0 (#9583)\n\n:robot: I have created a release *beep* *boop*\r\n---\r\n\r\n\r\n<details><summary>aztec-package: 0.62.0</summary>\r\n\r\n##\r\n[0.62.0](https://github.com/AztecProtocol/aztec-packages/compare/aztec-package-v0.61.0...aztec-package-v0.62.0)\r\n(2024-11-01)\r\n\r\n\r\n### Features\r\n\r\n* Token private mint optimization\r\n([#9606](https://github.com/AztecProtocol/aztec-packages/issues/9606))\r\n([e8fadc7](https://github.com/AztecProtocol/aztec-packages/commit/e8fadc799d015046016b16eeadbb55be929d20c2))\r\n\r\n\r\n### Bug Fixes\r\n\r\n* **k8s:** Boot node long sync\r\n([#9610](https://github.com/AztecProtocol/aztec-packages/issues/9610))\r\n([1b85840](https://github.com/AztecProtocol/aztec-packages/commit/1b85840cf52442e920f4c25bf67e6bd2066606bc))\r\n* Multi-node metrics working\r\n([#9486](https://github.com/AztecProtocol/aztec-packages/issues/9486))\r\n([fd974e1](https://github.com/AztecProtocol/aztec-packages/commit/fd974e1ba91e01910751ed87da6dbeb068faba4f))\r\n* Stop bot in case of tx errors\r\n([#9421](https://github.com/AztecProtocol/aztec-packages/issues/9421))\r\n([6650641](https://github.com/AztecProtocol/aztec-packages/commit/6650641e5711ed9746ccc846a0efc0c68aeafdc3))\r\n\r\n\r\n### Miscellaneous\r\n\r\n* Replacing unshield naming with transfer_to_public\r\n([#9608](https://github.com/AztecProtocol/aztec-packages/issues/9608))\r\n([247e9eb](https://github.com/AztecProtocol/aztec-packages/commit/247e9eb28e931874e98781addebe9a343ba7afe1))\r\n* Token partial notes refactor pt. 1\r\n([#9490](https://github.com/AztecProtocol/aztec-packages/issues/9490))\r\n([3d631f5](https://github.com/AztecProtocol/aztec-packages/commit/3d631f5e98439554443483520011c1c21d18f993))\r\n</details>\r\n\r\n<details><summary>barretenberg.js: 0.62.0</summary>\r\n\r\n##\r\n[0.62.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg.js-v0.61.0...barretenberg.js-v0.62.0)\r\n(2024-11-01)\r\n\r\n\r\n### Features\r\n\r\n* Faster square roots\r\n([#2694](https://github.com/AztecProtocol/aztec-packages/issues/2694))\r\n([722ec5c](https://github.com/AztecProtocol/aztec-packages/commit/722ec5c3dfdc2a5e467528ed94a25677f8800087))\r\n</details>\r\n\r\n<details><summary>aztec-packages: 0.62.0</summary>\r\n\r\n##\r\n[0.62.0](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.61.0...aztec-packages-v0.62.0)\r\n(2024-11-01)\r\n\r\n\r\n### ⚠ BREAKING CHANGES\r\n\r\n* **avm:** use 32 bit locations\r\n([#9596](https://github.com/AztecProtocol/aztec-packages/issues/9596))\r\n* Unique L1 to L2 messages\r\n([#9492](https://github.com/AztecProtocol/aztec-packages/issues/9492))\r\n\r\n### Features\r\n\r\n* Add increment secret oracles\r\n([#9573](https://github.com/AztecProtocol/aztec-packages/issues/9573))\r\n([97a4c0c](https://github.com/AztecProtocol/aztec-packages/commit/97a4c0c4452f31e5c0dc776812242d2444348406))\r\n* **avm:** Use 32 bit locations\r\n([#9596](https://github.com/AztecProtocol/aztec-packages/issues/9596))\r\n([5f38696](https://github.com/AztecProtocol/aztec-packages/commit/5f386963b06752087c2600949cbb4bb2910b25ef))\r\n* Barebones addressbook for tagging\r\n([#9572](https://github.com/AztecProtocol/aztec-packages/issues/9572))\r\n([6526069](https://github.com/AztecProtocol/aztec-packages/commit/6526069b4faabf1a3b6834da9c290e077715a496))\r\n* Biggroup_goblin handles points at infinity + 1.8x reduction in ECCVM\r\nsize\r\n([#9366](https://github.com/AztecProtocol/aztec-packages/issues/9366))\r\n([9211d8a](https://github.com/AztecProtocol/aztec-packages/commit/9211d8afbd0fe31043ea593675ce5a72c1dc7e4e))\r\n* Faster square roots\r\n([#2694](https://github.com/AztecProtocol/aztec-packages/issues/2694))\r\n([722ec5c](https://github.com/AztecProtocol/aztec-packages/commit/722ec5c3dfdc2a5e467528ed94a25677f8800087))\r\n* Fixed private log size\r\n([#9585](https://github.com/AztecProtocol/aztec-packages/issues/9585))\r\n([755c70a](https://github.com/AztecProtocol/aztec-packages/commit/755c70ab55c768681349179e777bb0391c381420))\r\n* Removing register recipient in e2e tests as it is unnecessary now !\r\n([#9499](https://github.com/AztecProtocol/aztec-packages/issues/9499))\r\n([9f52cbb](https://github.com/AztecProtocol/aztec-packages/commit/9f52cbb5df8821f46d88116eedbe10a74f32e75e))\r\n* Reorg test\r\n([#9607](https://github.com/AztecProtocol/aztec-packages/issues/9607))\r\n([54488b3](https://github.com/AztecProtocol/aztec-packages/commit/54488b33ea6ae0cb517639c60dbe7e7aeaf9b5dd))\r\n* Simulate validateEpochProofQuoteHeader in the future\r\n([#9641](https://github.com/AztecProtocol/aztec-packages/issues/9641))\r\n([284c8f8](https://github.com/AztecProtocol/aztec-packages/commit/284c8f8e4504ff8e8d633dc291c20111a0406273))\r\n* Spartan proving\r\n([#9584](https://github.com/AztecProtocol/aztec-packages/issues/9584))\r\n([392114a](https://github.com/AztecProtocol/aztec-packages/commit/392114a0a66bd580175ff7a07b0c6d899d69be8f))\r\n* Sync tagged logs\r\n([#9595](https://github.com/AztecProtocol/aztec-packages/issues/9595))\r\n([0cc4a48](https://github.com/AztecProtocol/aztec-packages/commit/0cc4a4881ea3d61d4ab0bad7594da4f610746f4f))\r\n* Token private mint optimization\r\n([#9606](https://github.com/AztecProtocol/aztec-packages/issues/9606))\r\n([e8fadc7](https://github.com/AztecProtocol/aztec-packages/commit/e8fadc799d015046016b16eeadbb55be929d20c2))\r\n* Unique L1 to L2 messages\r\n([#9492](https://github.com/AztecProtocol/aztec-packages/issues/9492))\r\n([4e5ae95](https://github.com/AztecProtocol/aztec-packages/commit/4e5ae9538ebba834b3c4407cf0597c3a432a2d4e)),\r\ncloses\r\n[#9450](https://github.com/AztecProtocol/aztec-packages/issues/9450)\r\n\r\n\r\n### Bug Fixes\r\n\r\n* E2e event logs test\r\n([#9621](https://github.com/AztecProtocol/aztec-packages/issues/9621))\r\n([737c573](https://github.com/AztecProtocol/aztec-packages/commit/737c5732165b9fc339ab6a15838029481dcfdbf2))\r\n* E2e labels\r\n([#9609](https://github.com/AztecProtocol/aztec-packages/issues/9609))\r\n([ed1deb9](https://github.com/AztecProtocol/aztec-packages/commit/ed1deb9afbc7746fe1668fe35978cb159a02dedf))\r\n* Ensuring translator range constraint polynomials are zeroes outside of\r\nminicircuit\r\n([#9251](https://github.com/AztecProtocol/aztec-packages/issues/9251))\r\n([04dd2c4](https://github.com/AztecProtocol/aztec-packages/commit/04dd2c4c959d5d80e527be9c71504c051e3c5929))\r\n* EventMetadata class implementation for serialisation\r\n([#9574](https://github.com/AztecProtocol/aztec-packages/issues/9574))\r\n([bdff73a](https://github.com/AztecProtocol/aztec-packages/commit/bdff73af3f8043f82ebc3bf7ed1f764a941091c4))\r\n* Force bb-sanitizers true\r\n([#9614](https://github.com/AztecProtocol/aztec-packages/issues/9614))\r\n([39cda86](https://github.com/AztecProtocol/aztec-packages/commit/39cda86c3576c5cb94a7beb123b875a2ba37c26b))\r\n* **k8s:** Boot node long sync\r\n([#9610](https://github.com/AztecProtocol/aztec-packages/issues/9610))\r\n([1b85840](https://github.com/AztecProtocol/aztec-packages/commit/1b85840cf52442e920f4c25bf67e6bd2066606bc))\r\n* Multi-node metrics working\r\n([#9486](https://github.com/AztecProtocol/aztec-packages/issues/9486))\r\n([fd974e1](https://github.com/AztecProtocol/aztec-packages/commit/fd974e1ba91e01910751ed87da6dbeb068faba4f))\r\n* Remove all register recipient functionality in ts\r\n([#9548](https://github.com/AztecProtocol/aztec-packages/issues/9548))\r\n([2f7127b](https://github.com/AztecProtocol/aztec-packages/commit/2f7127be39f97873d3b3bc55d1a20d6de82f583f))\r\n* Remove unnecessary ivpk references in ts\r\n([#9463](https://github.com/AztecProtocol/aztec-packages/issues/9463))\r\n([0c5121f](https://github.com/AztecProtocol/aztec-packages/commit/0c5121ffc0f7b5073a57d04d38f304ef1b33fe7b))\r\n* Resolution of bugs from bigfield audits\r\n([#9547](https://github.com/AztecProtocol/aztec-packages/issues/9547))\r\n([feace70](https://github.com/AztecProtocol/aztec-packages/commit/feace70727f9e5a971809955030a8ea88ce84f4a))\r\n* Stop bot in case of tx errors\r\n([#9421](https://github.com/AztecProtocol/aztec-packages/issues/9421))\r\n([6650641](https://github.com/AztecProtocol/aztec-packages/commit/6650641e5711ed9746ccc846a0efc0c68aeafdc3))\r\n* Typing of artifacts\r\n([#9581](https://github.com/AztecProtocol/aztec-packages/issues/9581))\r\n([c71645f](https://github.com/AztecProtocol/aztec-packages/commit/c71645f4cc9754d99eb3ac77ff8063495caa264d))\r\n\r\n\r\n### Miscellaneous\r\n\r\n* Add guides to get_e2e_jobs.sh\r\n([#9624](https://github.com/AztecProtocol/aztec-packages/issues/9624))\r\n([8891ead](https://github.com/AztecProtocol/aztec-packages/commit/8891ead6c20da220316c6a6fea1e8f2f0bf954b5))\r\n* Add sender to encode and encrypt\r\n([#9562](https://github.com/AztecProtocol/aztec-packages/issues/9562))\r\n([8ce6834](https://github.com/AztecProtocol/aztec-packages/commit/8ce6834ddcfe48aa672632012c48d5d679c8687c))\r\n* Add signed int deserialization to decoder\r\n([#9557](https://github.com/AztecProtocol/aztec-packages/issues/9557))\r\n([0435d00](https://github.com/AztecProtocol/aztec-packages/commit/0435d00671d7f6b6960a685e3e5b76db574c56da))\r\n* Bb sanitizers on master\r\n([#9564](https://github.com/AztecProtocol/aztec-packages/issues/9564))\r\n([747bff1](https://github.com/AztecProtocol/aztec-packages/commit/747bff1acbca3d263a765db82baa6ef9ca58c372))\r\n* Cleaning up token test utils\r\n([#9633](https://github.com/AztecProtocol/aztec-packages/issues/9633))\r\n([325bdb0](https://github.com/AztecProtocol/aztec-packages/commit/325bdb021f05c82a3abfa1fa0acd8d24635cbd10))\r\n* Disable breaking e2e_event_logs test\r\n([#9602](https://github.com/AztecProtocol/aztec-packages/issues/9602))\r\n([cf2ca2e](https://github.com/AztecProtocol/aztec-packages/commit/cf2ca2ed452a398e0bbfd7a4f079c35484f52884))\r\n* Dont generate vks for simulated circuits\r\n([#9625](https://github.com/AztecProtocol/aztec-packages/issues/9625))\r\n([366eff3](https://github.com/AztecProtocol/aztec-packages/commit/366eff3bfa237fbe0e06bed39eeeefd36f8f95d6))\r\n* Fixing broken sample-dapp tests\r\n([#9597](https://github.com/AztecProtocol/aztec-packages/issues/9597))\r\n([5e52900](https://github.com/AztecProtocol/aztec-packages/commit/5e52900b245a167a9e5697c7b6b25e1d8df42be9))\r\n* Nuking `Token::privately_mint_private_note(...)`\r\n([#9616](https://github.com/AztecProtocol/aztec-packages/issues/9616))\r\n([bf53f5e](https://github.com/AztecProtocol/aztec-packages/commit/bf53f5e0b792e00a45013a16adb72a952e527cb9))\r\n* Pass on docker_fast.sh\r\n([#9615](https://github.com/AztecProtocol/aztec-packages/issues/9615))\r\n([1c53459](https://github.com/AztecProtocol/aztec-packages/commit/1c53459ff31b50ba808e204c532885c9b0f69e39))\r\n* Remove outgoing tagging field in logs\r\n([#9502](https://github.com/AztecProtocol/aztec-packages/issues/9502))\r\n([c473380](https://github.com/AztecProtocol/aztec-packages/commit/c473380026e2a8eafff91c4f57e9c2ec8f2718f0))\r\n* Replace relative paths to noir-protocol-circuits\r\n([288099b](https://github.com/AztecProtocol/aztec-packages/commit/288099b89dea0911adb04dd48af531c7a56daf21))\r\n* Replacing unshield naming with transfer_to_public\r\n([#9608](https://github.com/AztecProtocol/aztec-packages/issues/9608))\r\n([247e9eb](https://github.com/AztecProtocol/aztec-packages/commit/247e9eb28e931874e98781addebe9a343ba7afe1))\r\n* Token partial notes refactor pt. 1\r\n([#9490](https://github.com/AztecProtocol/aztec-packages/issues/9490))\r\n([3d631f5](https://github.com/AztecProtocol/aztec-packages/commit/3d631f5e98439554443483520011c1c21d18f993))\r\n</details>\r\n\r\n<details><summary>barretenberg: 0.62.0</summary>\r\n\r\n##\r\n[0.62.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.61.0...barretenberg-v0.62.0)\r\n(2024-11-01)\r\n\r\n\r\n### ⚠ BREAKING CHANGES\r\n\r\n* **avm:** use 32 bit locations\r\n([#9596](https://github.com/AztecProtocol/aztec-packages/issues/9596))\r\n\r\n### Features\r\n\r\n* **avm:** Use 32 bit locations\r\n([#9596](https://github.com/AztecProtocol/aztec-packages/issues/9596))\r\n([5f38696](https://github.com/AztecProtocol/aztec-packages/commit/5f386963b06752087c2600949cbb4bb2910b25ef))\r\n* Biggroup_goblin handles points at infinity + 1.8x reduction in ECCVM\r\nsize\r\n([#9366](https://github.com/AztecProtocol/aztec-packages/issues/9366))\r\n([9211d8a](https://github.com/AztecProtocol/aztec-packages/commit/9211d8afbd0fe31043ea593675ce5a72c1dc7e4e))\r\n* Faster square roots\r\n([#2694](https://github.com/AztecProtocol/aztec-packages/issues/2694))\r\n([722ec5c](https://github.com/AztecProtocol/aztec-packages/commit/722ec5c3dfdc2a5e467528ed94a25677f8800087))\r\n* Spartan proving\r\n([#9584](https://github.com/AztecProtocol/aztec-packages/issues/9584))\r\n([392114a](https://github.com/AztecProtocol/aztec-packages/commit/392114a0a66bd580175ff7a07b0c6d899d69be8f))\r\n\r\n\r\n### Bug Fixes\r\n\r\n* Ensuring translator range constraint polynomials are zeroes outside of\r\nminicircuit\r\n([#9251](https://github.com/AztecProtocol/aztec-packages/issues/9251))\r\n([04dd2c4](https://github.com/AztecProtocol/aztec-packages/commit/04dd2c4c959d5d80e527be9c71504c051e3c5929))\r\n* Resolution of bugs from bigfield audits\r\n([#9547](https://github.com/AztecProtocol/aztec-packages/issues/9547))\r\n([feace70](https://github.com/AztecProtocol/aztec-packages/commit/feace70727f9e5a971809955030a8ea88ce84f4a))\r\n\r\n\r\n### Miscellaneous\r\n\r\n* Bb sanitizers on master\r\n([#9564](https://github.com/AztecProtocol/aztec-packages/issues/9564))\r\n([747bff1](https://github.com/AztecProtocol/aztec-packages/commit/747bff1acbca3d263a765db82baa6ef9ca58c372))\r\n* Pass on docker_fast.sh\r\n([#9615](https://github.com/AztecProtocol/aztec-packages/issues/9615))\r\n([1c53459](https://github.com/AztecProtocol/aztec-packages/commit/1c53459ff31b50ba808e204c532885c9b0f69e39))\r\n</details>\r\n\r\n---\r\nThis PR was generated with [Release\r\nPlease](https://github.com/googleapis/release-please). See\r\n[documentation](https://github.com/googleapis/release-please#release-please).",
          "timestamp": "2024-11-01T13:15:40Z",
          "tree_id": "75aca90499f75bb6e0e9c64422b073b9332c3874",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/edf6389a783250e5684c5ddd3ec3757623b5b770"
        },
        "date": 1730468548182,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29214.508819999992,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27311.776846999997 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5386.216499,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5007.354811 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 86212.955758,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 86212958000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15172.894134,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15172894000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2498947591,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2498947591 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 127818611,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 127818611 ns\nthreads: 1"
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
          "id": "b98e93f4befb985c72e8768f378face2dcc79810",
          "message": "feat: Faster randomness sampling for field elements (#9627)\n\nChanges the algorithm for converting uint512_ts to fields. The result is\r\nequivalent (we can make an even faster version, but without the\r\nequivalence). 1.5x faster on the mainframe, 5x in wasm\r\nBefore. Native\r\n\r\n![image](https://github.com/user-attachments/assets/6314999c-b32e-402a-a2f4-a6829c08be59)\r\nAfter. Native:\r\n\r\n![image](https://github.com/user-attachments/assets/5a3d46ee-2a36-4a2d-8f4c-109dcd4eb496)\r\n\r\nBefore. Wasm:\r\n\r\n![image](https://github.com/user-attachments/assets/e7cf2c94-0a79-4dfb-9141-6d73c061c269)\r\n\r\n\r\nAfter. Wasm:\r\n\r\n![image](https://github.com/user-attachments/assets/06c05002-d3fc-4b22-ac93-68f8939708db)",
          "timestamp": "2024-11-01T13:25:27Z",
          "tree_id": "3668edf9f1ea19e95f1971033e3467cc1fe92952",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/b98e93f4befb985c72e8768f378face2dcc79810"
        },
        "date": 1730470245386,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29061.564850999985,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27692.211099 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5354.980000999987,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5062.612838999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 86240.890573,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 86240893000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15165.42334,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15165424000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2506227079,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2506227079 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 127307488,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 127307488 ns\nthreads: 1"
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
          "id": "d2a84c405291b5a04576c133b0e74327d9092db1",
          "message": "chore!: Remove `recursive` from ACIR format; add them to API and CLI (#9479)\n\nResolves https://github.com/noir-lang/noir/issues/6185\r\n\r\n* Remove the `recursive` field from ACIR formats and the `Circuit`\r\ndefinition\r\n* Add `--recursive` to `bb` CLI\r\n* Add `recursive` to `main.ts`, the backend API and Wasm\r\n\r\nThis is effectively undoing a lot of what was done\r\n[here](https://github.com/AztecProtocol/aztec-packages/commit/9c965a7c9e652dfeaba2f09152e5db287407473d#diff-2b9fe3a6f248b96aefc37782cc4c321567eed5dd10ab24472620a68c0fb4506bR29).\r\nInterestingly there many more Wasm methods that need the `recursive`\r\nparameter now: whereas previously only `acir_create_proof` and\r\n`acir_verify_proof` used it, now anything that calls `create_circuit`\r\nneeds it because circuit creation builds all the constraints already,\r\nwhich depend on this.\r\n\r\nTODO:\r\n- [x] Remove the `#[recursive]` attribute from Noir\r\n- [x] Should the \"prove and verify\" methods that return nothing have a\r\nrecursive parameter?\r\n- [x] Remove `#[recursive]` from `noir-protocol-circuits`\r\n- [x] Update `bb-prover` where it uses uses `noir-protocol-circuits` to\r\nuse the correct `recursive` flag\r\n- [x] Add `--recursive` to `cli.ts` under `bb-prover`\r\n- [x] Check all calls to `executeBB` and pass `--recursive` if it calls\r\na `bb` command that needs it\r\n\r\n---------\r\n\r\nCo-authored-by: Tom French <15848336+TomAFrench@users.noreply.github.com>\r\nCo-authored-by: Tom French <tom@tomfren.ch>",
          "timestamp": "2024-11-01T19:58:00Z",
          "tree_id": "9be19d37b0941b763219f85bcd53ec9b720ce4d1",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d2a84c405291b5a04576c133b0e74327d9092db1"
        },
        "date": 1730492756523,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29166.27423700001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27761.464621000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5401.584049999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5093.1545510000005 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 86413.061053,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 86413063000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15172.872389999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15172872000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2509396337,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2509396337 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 128267024,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 128267024 ns\nthreads: 1"
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
          "id": "969a3f0b2d5bbce95126685b1a056f378a4c4d78",
          "message": "feat: Faster random sampling (#9655)\n\n169x in Native, 35x in wasm sampling of field elements",
          "timestamp": "2024-11-01T21:18:09Z",
          "tree_id": "d0d66f79949e4ea071fe1e8e7f914d1beace9ff0",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/969a3f0b2d5bbce95126685b1a056f378a4c4d78"
        },
        "date": 1730498290411,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28879.06431800002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27395.250540999998 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5334.507876000003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5000.309511 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 86901.005033,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 86901007000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15096.093248,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15096093000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2489300549,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2489300549 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 129009344,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 129009344 ns\nthreads: 1"
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
          "id": "eeea55a39e9e1a417ddf79e44575420e5efcdfcf",
          "message": "feat: Graph methods for circuit analysis (part 1) (#7948)\n\nBoomerang value detection in ultra circuits not using poseidon and auxiliary gates",
          "timestamp": "2024-11-01T22:12:40Z",
          "tree_id": "d84eca74b446d7955ac985a9ce2d2a7657516eb6",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/eeea55a39e9e1a417ddf79e44575420e5efcdfcf"
        },
        "date": 1730501487330,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29098.635255000005,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27514.23919 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5416.658995000006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5028.363216 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 86395.639096,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 86395641000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15122.528201000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15122529000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2508856167,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2508856167 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 128820449,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 128820449 ns\nthreads: 1"
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
          "id": "bf5d62d4332548ac7798085eb98cedea88131d9d",
          "message": "fix: Fix random for Mac users  (#9670)\n\nmac doesn't have the getrandom function, but should have getentropy",
          "timestamp": "2024-11-01T23:55:39Z",
          "tree_id": "c743ec86ba0ce09eedfe24bdf922234d562612e8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/bf5d62d4332548ac7798085eb98cedea88131d9d"
        },
        "date": 1730507657103,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29116.83140400001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27660.086187 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5356.66767299999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5019.157957 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 86168.13288199999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 86168135000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15138.582226999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15138581000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2504777062,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2504777062 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126619204,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126619204 ns\nthreads: 1"
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
          "id": "4fc6f8b44b7e58d982151732fa6d9691e73635bc",
          "message": "chore: redo typo PR by dsarfed (#9667)\n\nThanks dsarfed for\r\nhttps://github.com/AztecProtocol/aztec-packages/pull/9654. Our policy is\r\nto redo typo changes to dissuade metric farming. This is an automated\r\nscript.\r\n\r\n---------\r\n\r\nCo-authored-by: dsarfed <d.p.casm@gmail.com>\r\nCo-authored-by: ludamad <adam.domurad@gmail.com>",
          "timestamp": "2024-11-01T21:49:23-04:00",
          "tree_id": "25759109fb10f8dc26073c8f383dd6d756aa3a42",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/4fc6f8b44b7e58d982151732fa6d9691e73635bc"
        },
        "date": 1730513539522,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29066.328510000007,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27184.776768 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5357.084838999981,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5046.455019 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 85041.12944699998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 85041132000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15206.350716,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15206351000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2494562742,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2494562742 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 127477506,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 127477506 ns\nthreads: 1"
          }
        ]
      }
    ]
  }
}