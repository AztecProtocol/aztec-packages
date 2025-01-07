window.BENCHMARK_DATA = {
  "lastUpdate": 1736256428626,
  "repoUrl": "https://github.com/AztecProtocol/aztec-packages",
  "entries": {
    "C++ Benchmark": [
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
          "id": "1ab9e30d339cfd7a80f333e408c367c1f8bf49f8",
          "message": "chore: move decider PK allocation to methods (#10670)\n\nJust moves the poly allocation logic in the DeciderPK into methods to\nmake the constructor a bit easier to digest",
          "timestamp": "2024-12-13T10:10:17-07:00",
          "tree_id": "6ee4e9406d6aa65c99b5930ca899a4022dc4c9c5",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1ab9e30d339cfd7a80f333e408c367c1f8bf49f8"
        },
        "date": 1734111924169,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 24689.301865999994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 22774.397218000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4959.345542999983,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4669.006622999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 86123.74198100001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 86123742000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15252.595772,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15252597000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2826379764,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2826379764 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 143111162,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 143111162 ns\nthreads: 1"
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
          "id": "dd8cc7b93119c0376873a366a8310d2ebd2641de",
          "message": "fix: avm gas and non-member (#10709)\n\nThis PR fixes two things:\n\n1) Non-membership checks weren't properly being handled in the witgen\n(the assertion was too strict)\n2) End gas handling",
          "timestamp": "2024-12-13T12:30:14-05:00",
          "tree_id": "bb46a288641fd41349337325988b3ea32531c227",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/dd8cc7b93119c0376873a366a8310d2ebd2641de"
        },
        "date": 1734113892196,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 24885.552339000016,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 22674.212598000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4988.833784999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4659.767849999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 85769.545945,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 85769546000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15259.417675,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15259419000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2818920693,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2818920693 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 142163165,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 142163165 ns\nthreads: 1"
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
          "id": "e077980f8cce1fc7922c27d368b6dbced956aad2",
          "message": "feat: Note hash management in the AVM (#10666)\n\n- Removes old siloing and nonce application from transitional adapters\n- Handling of note hashes from private: nonrevertibles are inserted in\nsetup and revertibles at the start of app logic both in simulator and\nwitgen\n- Makes unique emitted note hashes from public inside the AVM itself,\nboth in simulator and witgen",
          "timestamp": "2024-12-13T19:31:04+01:00",
          "tree_id": "cd6fe26c8b8d8c54cf0045dc141e4bc31520ade1",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e077980f8cce1fc7922c27d368b6dbced956aad2"
        },
        "date": 1734122807222,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 24927.223591,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 23006.678515 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4994.324048999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4623.70481 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 87041.487295,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 87041487000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15383.449391,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15383449000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2845381257,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2845381257 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 142408584,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 142408584 ns\nthreads: 1"
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
          "id": "9fbcff60a63e0eca14c4e28677aed1fc5e6f2c14",
          "message": "feat: new 17 in 20 IVC bench added to actions (#10777)\n\nAdds an IVC benchmark for the case of size 2^17 circuits in a 2^20\nstructured trace. (Adds tracking to the bench action).",
          "timestamp": "2024-12-16T23:02:05Z",
          "tree_id": "8f363d4ee236d7c58863419ddddf8f2043676d5a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9fbcff60a63e0eca14c4e28677aed1fc5e6f2c14"
        },
        "date": 1734391986802,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 25477.18304600002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19903.286651000002 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 24623.846930000014,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 22525.467117999997 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4678.564453999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4387.705726 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 90482.67207700001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 90482672000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 16532.326059000003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16532326000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2791668686,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2791668686 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 133548634,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 133548634 ns\nthreads: 1"
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
          "id": "abd2226da3a159e7efb7cbef099e41739f665ef1",
          "message": "feat: sumcheck with disabled rows (#10068)\n\nZKFlavors are now running Sumcheck with last 4 rows disabled. To our\r\nknowledge, this is the cheapest approach to mask witness commitments,\r\ntheir evaluations, and, if necessary, the evaluations of their shifts at\r\nthe sumcheck challenge. \r\n\r\n**Note:** The last 4 rows of actual circuits in ECCVM and Translator are becoming\r\nun-constrained. Will be fixed in the follow-up PRs",
          "timestamp": "2024-12-17T10:43:36+01:00",
          "tree_id": "4215e7a77d3a7fcbeecacbe3d11ed4646896a605",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/abd2226da3a159e7efb7cbef099e41739f665ef1"
        },
        "date": 1734431820600,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 25431.55851899999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19831.529317 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 24433.107527999993,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 22535.97772 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4530.41484900001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4261.140504 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 94777.705245,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 94777705000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 16472.460823999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16472462000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2782079198,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2782079198 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 132657232,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 132657232 ns\nthreads: 1"
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
          "id": "923826a9d1bbed6739527a82b34d5610600eca1b",
          "message": "feat: Add tree equality assertions (#10756)\n\nAsserts in the public base that the end tree roots of the AVM equal the\r\ncalculated tree roots in the public base, to check correctness of the\r\nAVM insertions.",
          "timestamp": "2024-12-17T17:05:14+01:00",
          "tree_id": "8ed9a58664e9d107f47e19b8b7558943865043f8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/923826a9d1bbed6739527a82b34d5610600eca1b"
        },
        "date": 1734453257717,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 25364.301028,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19743.115241000003 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 24507.166215000012,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 22465.644397999997 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4533.45861599999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4258.466504 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 89489.743332,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 89489744000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 16500.062938,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16500064000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2795012783,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2795012783 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 133026956,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 133026956 ns\nthreads: 1"
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
          "id": "1516d7f7bd6a2adbb650bd7cdd572b33db98dbfc",
          "message": "feat: better initialization for permutation mapping components (#10750)\n\nConstructing the permutation argument polynomials (sigmas/ids) involves\nconstructing an intermediate object of type `PermutationMapping` which\ncontains information about the copy constraints in the circuit. The\ninitialization of this object was inefficient in two ways: (1) the\ncomponents were zero initialized only to be immediately initialized to\nnon-zero values, and (2) the initialization was not multithreaded. This\nPR introduces a minor refactor of the underlying structures in\n`PermutationMapping` so that the zero initialization can be avoided\naltogether and the initialization to non-zero values can be done in\nparallel. (In particular instead of vectors of a struct with components\n{uint32_t, uint8_t, bool, bool}, we now have shared pointers to arrays\nof the corresponding type {*uint32_t[], *uint8_t[], *bool[], *bool[]}.\nThis structure allows for efficient use of the slab allocator and\nremoves the need to default zero initialize).\n\nBenchmark highlights for the case of 2^17 circuits in a 2^20 trace:\n\nMaster:\n```\nClientIVCBench/Full/6      24684 ms        20203 ms\nDeciderProvingKey(Circuit&)(t)          2365\ncompute_permutation_argument_polynomials(t)=912.772M\n```\n\nBranch:\n```\nClientIVCBench/Full/6      23955 ms        19680 ms\nDeciderProvingKey(Circuit&)(t)          1834     8.02%\ncompute_permutation_argument_polynomials(t)=437.54M\n```",
          "timestamp": "2024-12-17T10:21:30-07:00",
          "tree_id": "94da91aa41fe393a61a6d77a4507307076601ec5",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1516d7f7bd6a2adbb650bd7cdd572b33db98dbfc"
        },
        "date": 1734459325266,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 25351.831096000013,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19706.370672999998 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 24453.681662999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 22160.444612 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4465.00308200001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4184.896727000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 89150.73771,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 89150738000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 16538.883102,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16538884000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2779700237,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2779700237 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 133622421,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 133622421 ns\nthreads: 1"
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
          "id": "a3fba8442fdd62f429054c3367984fd4206bbbeb",
          "message": "feat: Don't store every block number in block indices DB (#10658)\n\nThe block indices DB is what enables clients to query the block number\r\nfor a given index. Where there were blocks of zero size (so multiple\r\nblock numbers against an index) it was storing every block number\r\nagainst that index. This could result in an unbounded values size in the\r\nDB. We now just store the block range in this scenario.",
          "timestamp": "2024-12-17T19:20:05Z",
          "tree_id": "789f2831838abeece429cb22541568eaed2ef8d6",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a3fba8442fdd62f429054c3367984fd4206bbbeb"
        },
        "date": 1734464936521,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 25059.891827,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19444.546301000002 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 24237.424376000006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 22342.148587 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4443.4232689999935,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4172.05496 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 89737.686278,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 89737686000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 16466.044313000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16466045000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2772927441,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2772927441 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 132240337,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 132240337 ns\nthreads: 1"
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
          "id": "4ac13e642c958392ce5606684c044ea014325e26",
          "message": "chore(avm): radix opcode - remove immediates (#10696)\n\nResolves #10371",
          "timestamp": "2024-12-17T16:45:48-05:00",
          "tree_id": "cddaab5cb2ad0941b9e2335627f82703c7efc1ac",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/4ac13e642c958392ce5606684c044ea014325e26"
        },
        "date": 1734475802836,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 25660.944038999987,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19994.639785 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 25013.04731799999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 22815.900613 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4523.916942000028,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4222.090227999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 90880.85256,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 90880852000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 16681.662177,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16681663000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2856760256,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2856760256 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 135708293,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 135708293 ns\nthreads: 1"
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
          "id": "b8bdb529719c1f72244e904ea667462458a43317",
          "message": "fix: AVM witgen track gas for nested calls and external halts (#10731)\n\nResolves https://github.com/AztecProtocol/aztec-packages/issues/10033\nResolves https://github.com/AztecProtocol/aztec-packages/issues/10374\n\nThis PR does the following:\n- Witgen handles out-of-gas errors for all opcodes \n- all halts (return/revert/exceptional) work as follows:\n- charge gas for the problematic instruction as always, adding a row to\nthe gas trace\n    - pop the parent/caller's latest gas from the stack\n- call a helper function on the gas trace to mutate that most recent gas\nrow, returning to the parent's latest gas minus any consumed gas (all\ngas consumed on exceptional halt)\n- `GasTraceEntry` includes a field `is_halt_or_first_row_in_nested_call`\nwhich lets us break gas rules on a halt or when starting a nested call\nbecause in both cases gas will jump.\n- `constrain_gas` returns a bool `out_of_gas` so that opcode\nimplementations can handle out of gas\n- `write_to_memory` now has an option to skip the \"jump back to correct\npc\" which was problematic when halting because the `jump` wouldn't\nresult in a next row with the right pc\n\nExplanation on how gas works for calls:\n- Parent snapshots its gas right before a nested call in\n`ctx.*_gas_left`\n- Nested call is given a `ctx.start_*_gas_left` and the gas trace is\nforced to that same value\n- throughout the nested call, the gas trace operates normally, charging\nper instruction\n- when any halt is encountered, the instruction that halted must have\nits gas charged normally, but then we call a helper function on the gas\ntrace to mutate the most recent row, flagging it to eventually become a\nsort of \"fake\" row that skips some constraints\n- the mutation of the halting row resets the gas to the parents last gas\nbefore the call (minus however much gas was consumed by the nested\ncall... if exceptional halt, that is _all_ allocated gas)\n\n\nFollow-up work\n- properly constrain gas for nested calls, returns, reverts and\nexceptional halts\n- if `jump` exceptionally halts (i.e. out of gas), it should be okay\nthat the next row doesn't have the target pc\n- Handle the edge case when an error is encountered on\nreturn/revert/call, but after the stack has already been modified",
          "timestamp": "2024-12-17T17:14:42-05:00",
          "tree_id": "bd71c7a2e1cb3fc04df137e14dbf7807caa7e2e6",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/b8bdb529719c1f72244e904ea667462458a43317"
        },
        "date": 1734476721724,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 25644.359549,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19862.703634999998 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 24815.773396999986,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 22861.514854999998 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4514.9682639999755,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4231.020416999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 91875.45447,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 91875455000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 16689.201242,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16689202000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2841293749,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2841293749 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 135609740,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 135609740 ns\nthreads: 1"
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
          "id": "113245eb5757ea4fa8dd9fd5faa22ecb43255420",
          "message": "chore(master): Release 0.67.1",
          "timestamp": "2024-12-18T01:03:08Z",
          "url": "https://github.com/AztecProtocol/aztec-packages/pull/10684/commits/113245eb5757ea4fa8dd9fd5faa22ecb43255420"
        },
        "date": 1734484730560,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 26850.193681999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 21104.154198 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 25913.98430199999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 23714.04403 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4813.244138000016,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4466.447006 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 91026.32383299999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 91026323000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 17241.906355000003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17241906000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2877515977,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2877515977 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 138447633,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 138447633 ns\nthreads: 1"
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
          "id": "c90bb16a5880c42752809f383f517181e6f8a53a",
          "message": "chore(master): Release 0.67.1 (#10684)\n\n:robot: I have created a release *beep* *boop*\n---\n\n\n<details><summary>aztec-package: 0.67.1</summary>\n\n##\n[0.67.1](https://github.com/AztecProtocol/aztec-packages/compare/aztec-package-v0.67.0...aztec-package-v0.67.1)\n(2024-12-17)\n\n\n### Miscellaneous\n\n* Granular CLI imports to reduce start time\n([#10778](https://github.com/AztecProtocol/aztec-packages/issues/10778))\n([e2fd046](https://github.com/AztecProtocol/aztec-packages/commit/e2fd046250664cd785269a718b036c0310dfcda7))\n* Split up protocol contract artifacts\n([#10765](https://github.com/AztecProtocol/aztec-packages/issues/10765))\n([5a9ca18](https://github.com/AztecProtocol/aztec-packages/commit/5a9ca18ceee03ca2175605d1029153a7bf228ea9))\n* Trace and handle errors in running promises\n([#10645](https://github.com/AztecProtocol/aztec-packages/issues/10645))\n([4cc0a6d](https://github.com/AztecProtocol/aztec-packages/commit/4cc0a6d832e6ee1c3fcc6876517ed3f743f59d4b))\n</details>\n\n<details><summary>barretenberg.js: 0.67.1</summary>\n\n##\n[0.67.1](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg.js-v0.67.0...barretenberg.js-v0.67.1)\n(2024-12-17)\n\n\n### Features\n\n* PXE browser proving\n([#10704](https://github.com/AztecProtocol/aztec-packages/issues/10704))\n([46da3cc](https://github.com/AztecProtocol/aztec-packages/commit/46da3cc8a9c1c407a8ad2857695eea794e334efd))\n\n\n### Bug Fixes\n\n* **bb.js:** Use globalThis instead of self\n([#10747](https://github.com/AztecProtocol/aztec-packages/issues/10747))\n([309b5f7](https://github.com/AztecProtocol/aztec-packages/commit/309b5f74862089001e3159bdb52cbc8b60c71dc1)),\ncloses\n[#10741](https://github.com/AztecProtocol/aztec-packages/issues/10741)\n* Casting vk to rawbuffer before wasm so it reads from the correct\noffset\n([#10769](https://github.com/AztecProtocol/aztec-packages/issues/10769))\n([6a5bcfd](https://github.com/AztecProtocol/aztec-packages/commit/6a5bcfd2dc1a2bef6df2b93e9afa137a9b4ea315))\n</details>\n\n<details><summary>aztec-packages: 0.67.1</summary>\n\n##\n[0.67.1](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.67.0...aztec-packages-v0.67.1)\n(2024-12-17)\n\n\n### Features\n\n* `nargo test -q` (or `nargo test --format terse`)\n(https://github.com/noir-lang/noir/pull/6776)\n([8956e28](https://github.com/AztecProtocol/aztec-packages/commit/8956e28269a045732e733b5197bdab5e46cdf354))\n* Add `(x | 1)` optimization for booleans\n(https://github.com/noir-lang/noir/pull/6795)\n([8956e28](https://github.com/AztecProtocol/aztec-packages/commit/8956e28269a045732e733b5197bdab5e46cdf354))\n* Add `nargo test --format json`\n(https://github.com/noir-lang/noir/pull/6796)\n([d74d0fc](https://github.com/AztecProtocol/aztec-packages/commit/d74d0fcec24c533abc28320302e027470843e80c))\n* Add tree equality assertions\n([#10756](https://github.com/AztecProtocol/aztec-packages/issues/10756))\n([923826a](https://github.com/AztecProtocol/aztec-packages/commit/923826a9d1bbed6739527a82b34d5610600eca1b))\n* **avm:** Migrate simulator memory to a map\n([#10715](https://github.com/AztecProtocol/aztec-packages/issues/10715))\n([64d5f2b](https://github.com/AztecProtocol/aztec-packages/commit/64d5f2bd0dffe637fbff436ea651eb240256ab2c)),\ncloses\n[#10370](https://github.com/AztecProtocol/aztec-packages/issues/10370)\n* Better initialization for permutation mapping components\n([#10750](https://github.com/AztecProtocol/aztec-packages/issues/10750))\n([1516d7f](https://github.com/AztecProtocol/aztec-packages/commit/1516d7f7bd6a2adbb650bd7cdd572b33db98dbfc))\n* Blobs 2.\n([#10188](https://github.com/AztecProtocol/aztec-packages/issues/10188))\n([d0a4b2f](https://github.com/AztecProtocol/aztec-packages/commit/d0a4b2f011a25e59d5ef077cfefae4490ae1c263))\n* **blobs:** Add consensus client url to config\n([#10059](https://github.com/AztecProtocol/aztec-packages/issues/10059))\n([1e15bf5](https://github.com/AztecProtocol/aztec-packages/commit/1e15bf58390f6c15afc3b430edd89b4c28137c2b))\n* Check max fees per gas\n([#10283](https://github.com/AztecProtocol/aztec-packages/issues/10283))\n([4e59b06](https://github.com/AztecProtocol/aztec-packages/commit/4e59b06cd1956d43bc44a219448603b4bcf58d27))\n* **cli:** Verify `return` against ABI and `Prover.toml`\n(https://github.com/noir-lang/noir/pull/6765)\n([8956e28](https://github.com/AztecProtocol/aztec-packages/commit/8956e28269a045732e733b5197bdab5e46cdf354))\n* Don't store every block number in block indices DB\n([#10658](https://github.com/AztecProtocol/aztec-packages/issues/10658))\n([a3fba84](https://github.com/AztecProtocol/aztec-packages/commit/a3fba8442fdd62f429054c3367984fd4206bbbeb))\n* Json output for get_node_info\n([#10771](https://github.com/AztecProtocol/aztec-packages/issues/10771))\n([b086c52](https://github.com/AztecProtocol/aztec-packages/commit/b086c52110e5bc79a3d8eccbc2bc50cd68b3dc9b))\n* Leaf index requests to the native world state can now be performed as\na batch query\n([#10649](https://github.com/AztecProtocol/aztec-packages/issues/10649))\n([a437e73](https://github.com/AztecProtocol/aztec-packages/commit/a437e73558a936981f3eb3ba022b0770b75d9060))\n* New 17 in 20 IVC bench added to actions\n([#10777](https://github.com/AztecProtocol/aztec-packages/issues/10777))\n([9fbcff6](https://github.com/AztecProtocol/aztec-packages/commit/9fbcff60a63e0eca14c4e28677aed1fc5e6f2c14))\n* Note hash management in the AVM\n([#10666](https://github.com/AztecProtocol/aztec-packages/issues/10666))\n([e077980](https://github.com/AztecProtocol/aztec-packages/commit/e077980f8cce1fc7922c27d368b6dbced956aad2))\n* **p2p:** Activate gossipsub tx validators\n([#10695](https://github.com/AztecProtocol/aztec-packages/issues/10695))\n([9cce2c6](https://github.com/AztecProtocol/aztec-packages/commit/9cce2c6fbae00008451940157690e0b5b99d9e59))\n* **p2p:** Attestation pool persistence\n([#10667](https://github.com/AztecProtocol/aztec-packages/issues/10667))\n([dacef9f](https://github.com/AztecProtocol/aztec-packages/commit/dacef9f7f9f11c8ec35ecd333748a9ae8c24d428))\n* PXE browser proving\n([#10704](https://github.com/AztecProtocol/aztec-packages/issues/10704))\n([46da3cc](https://github.com/AztecProtocol/aztec-packages/commit/46da3cc8a9c1c407a8ad2857695eea794e334efd))\n* **ssa:** Bring back tracking of RC instructions during DIE\n(https://github.com/noir-lang/noir/pull/6783)\n([308c5ce](https://github.com/AztecProtocol/aztec-packages/commit/308c5cef519b68f5951750851124c0bf8f4ba7ee))\n* **ssa:** Hoist MakeArray instructions during loop invariant code\nmotion (https://github.com/noir-lang/noir/pull/6782)\n([8956e28](https://github.com/AztecProtocol/aztec-packages/commit/8956e28269a045732e733b5197bdab5e46cdf354))\n* Sumcheck with disabled rows\n([#10068](https://github.com/AztecProtocol/aztec-packages/issues/10068))\n([abd2226](https://github.com/AztecProtocol/aztec-packages/commit/abd2226da3a159e7efb7cbef099e41739f665ef1))\n* TXE detects duplicate nullifiers\n([#10764](https://github.com/AztecProtocol/aztec-packages/issues/10764))\n([7f70110](https://github.com/AztecProtocol/aztec-packages/commit/7f701105c2ac44df9cafedc834d77d4eabd92710))\n\n\n### Bug Fixes\n\n* Always remove nullified notes\n([#10722](https://github.com/AztecProtocol/aztec-packages/issues/10722))\n([5e4b46d](https://github.com/AztecProtocol/aztec-packages/commit/5e4b46d577ebf63114a5a5a1c5b6d2947d3b2567))\n* Avm gas and non-member\n([#10709](https://github.com/AztecProtocol/aztec-packages/issues/10709))\n([dd8cc7b](https://github.com/AztecProtocol/aztec-packages/commit/dd8cc7b93119c0376873a366a8310d2ebd2641de))\n* AVM witgen track gas for nested calls and external halts\n([#10731](https://github.com/AztecProtocol/aztec-packages/issues/10731))\n([b8bdb52](https://github.com/AztecProtocol/aztec-packages/commit/b8bdb529719c1f72244e904ea667462458a43317))\n* **bb.js:** Use globalThis instead of self\n([#10747](https://github.com/AztecProtocol/aztec-packages/issues/10747))\n([309b5f7](https://github.com/AztecProtocol/aztec-packages/commit/309b5f74862089001e3159bdb52cbc8b60c71dc1)),\ncloses\n[#10741](https://github.com/AztecProtocol/aztec-packages/issues/10741)\n* Block building test timeout\n([#10812](https://github.com/AztecProtocol/aztec-packages/issues/10812))\n([2cad3e5](https://github.com/AztecProtocol/aztec-packages/commit/2cad3e59765a67ed14158ce556433120e9efd809))\n* Cache\n([#10692](https://github.com/AztecProtocol/aztec-packages/issues/10692))\n([1b1306c](https://github.com/AztecProtocol/aztec-packages/commit/1b1306c7dbd9d363181146e02181af4727779b42))\n* Casting vk to rawbuffer before wasm so it reads from the correct\noffset\n([#10769](https://github.com/AztecProtocol/aztec-packages/issues/10769))\n([6a5bcfd](https://github.com/AztecProtocol/aztec-packages/commit/6a5bcfd2dc1a2bef6df2b93e9afa137a9b4ea315))\n* **ci:** Network-test timing\n([#10725](https://github.com/AztecProtocol/aztec-packages/issues/10725))\n([9c9a2dc](https://github.com/AztecProtocol/aztec-packages/commit/9c9a2dcac8f7e14c1c5ec5d54d48a04a80284497))\n* Disable failure persistance in nargo test fuzzing\n(https://github.com/noir-lang/noir/pull/6777)\n([8956e28](https://github.com/AztecProtocol/aztec-packages/commit/8956e28269a045732e733b5197bdab5e46cdf354))\n* Get e2e jobs\n([#10689](https://github.com/AztecProtocol/aztec-packages/issues/10689))\n([37e1999](https://github.com/AztecProtocol/aztec-packages/commit/37e1999f9f96271faa8cba2fda44858276266a0c))\n* Give build:fast a try in build\n([#10702](https://github.com/AztecProtocol/aztec-packages/issues/10702))\n([32095f6](https://github.com/AztecProtocol/aztec-packages/commit/32095f63f4e1585e66251369e234c742aab0fa04))\n* Minimal change to avoid reverting entire PR\n[#6685](https://github.com/AztecProtocol/aztec-packages/issues/6685)\n(https://github.com/noir-lang/noir/pull/6778)\n([8956e28](https://github.com/AztecProtocol/aztec-packages/commit/8956e28269a045732e733b5197bdab5e46cdf354))\n* Optimizer to keep track of changing opcode locations\n(https://github.com/noir-lang/noir/pull/6781)\n([8956e28](https://github.com/AztecProtocol/aztec-packages/commit/8956e28269a045732e733b5197bdab5e46cdf354))\n* Race condition in block stream\n([#10779](https://github.com/AztecProtocol/aztec-packages/issues/10779))\n([64bccd0](https://github.com/AztecProtocol/aztec-packages/commit/64bccd0e3423856aadc58890e6a689db4af08356))\n* Race condition when cleaning epoch proof quotes\n([#10795](https://github.com/AztecProtocol/aztec-packages/issues/10795))\n([f540fbe](https://github.com/AztecProtocol/aztec-packages/commit/f540fbee724c2bfe29e0b0bca7759c721a8aaec8))\n* **testdata:** Relative path calculation\n([#10791](https://github.com/AztecProtocol/aztec-packages/issues/10791))\n([5a530db](https://github.com/AztecProtocol/aztec-packages/commit/5a530db5c42743e6eff846669141527ae1344bfe))\n* Try fix e2e epochs in CI\n([#10804](https://github.com/AztecProtocol/aztec-packages/issues/10804))\n([ba28788](https://github.com/AztecProtocol/aztec-packages/commit/ba28788de22b3209ec324633e91875b3b4b86332))\n* Use correct size for databus_id\n([#10673](https://github.com/AztecProtocol/aztec-packages/issues/10673))\n([95eb658](https://github.com/AztecProtocol/aztec-packages/commit/95eb658f90687c75589b345f95a904d96e2a8e62))\n* Use extension in docs link so it also works on GitHub\n(https://github.com/noir-lang/noir/pull/6787)\n([8956e28](https://github.com/AztecProtocol/aztec-packages/commit/8956e28269a045732e733b5197bdab5e46cdf354))\n* Use throw instead of reject in broker facade\n([#10735](https://github.com/AztecProtocol/aztec-packages/issues/10735))\n([cc6a72b](https://github.com/AztecProtocol/aztec-packages/commit/cc6a72be1c8dd5b133b5d82eac5224eef89d4ede))\n\n\n### Miscellaneous\n\n* `getLogsByTags` request batching in `syncTaggedLogs`\n([#10716](https://github.com/AztecProtocol/aztec-packages/issues/10716))\n([bbbf38b](https://github.com/AztecProtocol/aztec-packages/commit/bbbf38b35c7f04414eeb7991a1ee45b19b16664f))\n* Add `Instruction::map_values_mut`\n(https://github.com/noir-lang/noir/pull/6756)\n([308c5ce](https://github.com/AztecProtocol/aztec-packages/commit/308c5cef519b68f5951750851124c0bf8f4ba7ee))\n* Add errors to abis\n([#10697](https://github.com/AztecProtocol/aztec-packages/issues/10697))\n([5c8e017](https://github.com/AztecProtocol/aztec-packages/commit/5c8e0174aade70c418a2d02cd9dc0ded3baa0745))\n* Add retries for prover node p2p test\n([#10699](https://github.com/AztecProtocol/aztec-packages/issues/10699))\n([4115bf9](https://github.com/AztecProtocol/aztec-packages/commit/4115bf985108e183f8a57aaf76289326251b8c7b))\n* Add spans to proving job\n([#10794](https://github.com/AztecProtocol/aztec-packages/issues/10794))\n([df3c51b](https://github.com/AztecProtocol/aztec-packages/commit/df3c51bfdb9770a95f6223fc85baf8632ca93279))\n* Average alerts across namespace for 1 hour\n([#10827](https://github.com/AztecProtocol/aztec-packages/issues/10827))\n([962a7a2](https://github.com/AztecProtocol/aztec-packages/commit/962a7a25d71d208992b16fcfd21e86874db5ec05))\n* **avm:** Disable fake avm recursive verifier from the public base\nrollup\n([#10690](https://github.com/AztecProtocol/aztec-packages/issues/10690))\n([b6c9c41](https://github.com/AztecProtocol/aztec-packages/commit/b6c9c4141b4ca6b1fc847068d352ee17590dea09))\n* **avm:** Radix opcode - remove immediates\n([#10696](https://github.com/AztecProtocol/aztec-packages/issues/10696))\n([4ac13e6](https://github.com/AztecProtocol/aztec-packages/commit/4ac13e642c958392ce5606684c044ea014325e26)),\ncloses\n[#10371](https://github.com/AztecProtocol/aztec-packages/issues/10371)\n* Better reqresp logging + handle empty responses in snappy\n([#10657](https://github.com/AztecProtocol/aztec-packages/issues/10657))\n([934107f](https://github.com/AztecProtocol/aztec-packages/commit/934107f35c2f2772ad422bfa34357bbd64f5049d))\n* Bump metrics and node pool\n([#10745](https://github.com/AztecProtocol/aztec-packages/issues/10745))\n([9bb88bf](https://github.com/AztecProtocol/aztec-packages/commit/9bb88bf323e68f42f34cba74ec270681d76d9bd4))\n* Change Id to use a u32 (https://github.com/noir-lang/noir/pull/6807)\n([d74d0fc](https://github.com/AztecProtocol/aztec-packages/commit/d74d0fcec24c533abc28320302e027470843e80c))\n* **ci:** Active rollup circuits in compilation report\n(https://github.com/noir-lang/noir/pull/6813)\n([308c5ce](https://github.com/AztecProtocol/aztec-packages/commit/308c5cef519b68f5951750851124c0bf8f4ba7ee))\n* **ci:** Add bloblib to external checks\n(https://github.com/noir-lang/noir/pull/6818)\n([381b0b8](https://github.com/AztecProtocol/aztec-packages/commit/381b0b84d87dd31f8ab5a3e62928f9992837d4c0))\n* Cleanup after e2e tests\n([#10748](https://github.com/AztecProtocol/aztec-packages/issues/10748))\n([284b0a4](https://github.com/AztecProtocol/aztec-packages/commit/284b0a496f42813b956e55fbcd41c864dd278241))\n* Disable ARM CI\n([#10682](https://github.com/AztecProtocol/aztec-packages/issues/10682))\n([b16945b](https://github.com/AztecProtocol/aztec-packages/commit/b16945b9c9e26d8de5502f698d2bd71e22c53807))\n* Do not print entire functions when running debug trace\n(https://github.com/noir-lang/noir/pull/6814)\n([308c5ce](https://github.com/AztecProtocol/aztec-packages/commit/308c5cef519b68f5951750851124c0bf8f4ba7ee))\n* **docs:** Update migration notes\n([#10829](https://github.com/AztecProtocol/aztec-packages/issues/10829))\n([be7cadf](https://github.com/AztecProtocol/aztec-packages/commit/be7cadf12d25042d39e6a500ae32a5002102d3da))\n* **docs:** Workaround (https://github.com/noir-lang/noir/pull/6819)\n([381b0b8](https://github.com/AztecProtocol/aztec-packages/commit/381b0b84d87dd31f8ab5a3e62928f9992837d4c0))\n* Granular CLI imports to reduce start time\n([#10778](https://github.com/AztecProtocol/aztec-packages/issues/10778))\n([e2fd046](https://github.com/AztecProtocol/aztec-packages/commit/e2fd046250664cd785269a718b036c0310dfcda7))\n* Log error in retry module\n([#10719](https://github.com/AztecProtocol/aztec-packages/issues/10719))\n([84ea539](https://github.com/AztecProtocol/aztec-packages/commit/84ea539145173a88bddfdc617051f16a7aba9834))\n* Manage call stacks using a tree\n(https://github.com/noir-lang/noir/pull/6791)\n([381b0b8](https://github.com/AztecProtocol/aztec-packages/commit/381b0b84d87dd31f8ab5a3e62928f9992837d4c0))\n* Move decider PK allocation to methods\n([#10670](https://github.com/AztecProtocol/aztec-packages/issues/10670))\n([1ab9e30](https://github.com/AztecProtocol/aztec-packages/commit/1ab9e30d339cfd7a80f333e408c367c1f8bf49f8))\n* **p2p:** Move services into folders\n([#10694](https://github.com/AztecProtocol/aztec-packages/issues/10694))\n([e28d12a](https://github.com/AztecProtocol/aztec-packages/commit/e28d12a3cdb182c905995a5ece4cc1b3d1d09482))\n* **prover:** Prover node should not gossip attestations\n([#10672](https://github.com/AztecProtocol/aztec-packages/issues/10672))\n([41fc0f0](https://github.com/AztecProtocol/aztec-packages/commit/41fc0f047a6412b824dc33b49cf8fd98c99598aa))\n* Remove default export for noir contracts js\n([#10762](https://github.com/AztecProtocol/aztec-packages/issues/10762))\n([c8e7763](https://github.com/AztecProtocol/aztec-packages/commit/c8e77639bf7f30dffe98ae335d5d1137da838e55))\n* Remove sinon in favor of a date provider\n([#10705](https://github.com/AztecProtocol/aztec-packages/issues/10705))\n([3d3fabb](https://github.com/AztecProtocol/aztec-packages/commit/3d3fabb38b160c7f98636d0f4d7c6d3c22c6227e))\n* Remove spurious echo\n([#10774](https://github.com/AztecProtocol/aztec-packages/issues/10774))\n([5538f8c](https://github.com/AztecProtocol/aztec-packages/commit/5538f8cfc94f617a5604706b53357f9018af1096))\n* Replace relative paths to noir-protocol-circuits\n([f85fa3f](https://github.com/AztecProtocol/aztec-packages/commit/f85fa3f9078fc4f3626c564e06161bf9398e87a4))\n* Replace relative paths to noir-protocol-circuits\n([b19c561](https://github.com/AztecProtocol/aztec-packages/commit/b19c56154d32050affa786620f95459bb5c29a6e))\n* Set max txs in spam test\n([#10717](https://github.com/AztecProtocol/aztec-packages/issues/10717))\n([a50ff6c](https://github.com/AztecProtocol/aztec-packages/commit/a50ff6cf968f459ae09620d0e5b2e955ea56512f))\n* Slack notifications for networks\n([#10784](https://github.com/AztecProtocol/aztec-packages/issues/10784))\n([bab9f85](https://github.com/AztecProtocol/aztec-packages/commit/bab9f852c08f29f022bf526aacb8350732fcf4ac))\n* Split up protocol contract artifacts\n([#10765](https://github.com/AztecProtocol/aztec-packages/issues/10765))\n([5a9ca18](https://github.com/AztecProtocol/aztec-packages/commit/5a9ca18ceee03ca2175605d1029153a7bf228ea9))\n* **ssa:** Activate loop invariant code motion on ACIR functions\n(https://github.com/noir-lang/noir/pull/6785)\n([8956e28](https://github.com/AztecProtocol/aztec-packages/commit/8956e28269a045732e733b5197bdab5e46cdf354))\n* Sync grafana dashboard\n([#10792](https://github.com/AztecProtocol/aztec-packages/issues/10792))\n([421fb65](https://github.com/AztecProtocol/aztec-packages/commit/421fb65d9f14b86df281b0d0dc0934859aa924bc))\n* Tagging cleanup\n([#10675](https://github.com/AztecProtocol/aztec-packages/issues/10675))\n([52b541a](https://github.com/AztecProtocol/aztec-packages/commit/52b541ab4e6295aea199a2181575208f20eaa7fc))\n* Trace and handle errors in running promises\n([#10645](https://github.com/AztecProtocol/aztec-packages/issues/10645))\n([4cc0a6d](https://github.com/AztecProtocol/aztec-packages/commit/4cc0a6d832e6ee1c3fcc6876517ed3f743f59d4b))\n* Update external joiner script for new networks\n([#10810](https://github.com/AztecProtocol/aztec-packages/issues/10810))\n([5f11cf4](https://github.com/AztecProtocol/aztec-packages/commit/5f11cf4bdc51fd21b8bd219ad1e81bf3afe585d9))\n</details>\n\n<details><summary>barretenberg: 0.67.1</summary>\n\n##\n[0.67.1](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.67.0...barretenberg-v0.67.1)\n(2024-12-17)\n\n\n### Features\n\n* Add tree equality assertions\n([#10756](https://github.com/AztecProtocol/aztec-packages/issues/10756))\n([923826a](https://github.com/AztecProtocol/aztec-packages/commit/923826a9d1bbed6739527a82b34d5610600eca1b))\n* Better initialization for permutation mapping components\n([#10750](https://github.com/AztecProtocol/aztec-packages/issues/10750))\n([1516d7f](https://github.com/AztecProtocol/aztec-packages/commit/1516d7f7bd6a2adbb650bd7cdd572b33db98dbfc))\n* Don't store every block number in block indices DB\n([#10658](https://github.com/AztecProtocol/aztec-packages/issues/10658))\n([a3fba84](https://github.com/AztecProtocol/aztec-packages/commit/a3fba8442fdd62f429054c3367984fd4206bbbeb))\n* Leaf index requests to the native world state can now be performed as\na batch query\n([#10649](https://github.com/AztecProtocol/aztec-packages/issues/10649))\n([a437e73](https://github.com/AztecProtocol/aztec-packages/commit/a437e73558a936981f3eb3ba022b0770b75d9060))\n* New 17 in 20 IVC bench added to actions\n([#10777](https://github.com/AztecProtocol/aztec-packages/issues/10777))\n([9fbcff6](https://github.com/AztecProtocol/aztec-packages/commit/9fbcff60a63e0eca14c4e28677aed1fc5e6f2c14))\n* Note hash management in the AVM\n([#10666](https://github.com/AztecProtocol/aztec-packages/issues/10666))\n([e077980](https://github.com/AztecProtocol/aztec-packages/commit/e077980f8cce1fc7922c27d368b6dbced956aad2))\n* Sumcheck with disabled rows\n([#10068](https://github.com/AztecProtocol/aztec-packages/issues/10068))\n([abd2226](https://github.com/AztecProtocol/aztec-packages/commit/abd2226da3a159e7efb7cbef099e41739f665ef1))\n\n\n### Bug Fixes\n\n* Avm gas and non-member\n([#10709](https://github.com/AztecProtocol/aztec-packages/issues/10709))\n([dd8cc7b](https://github.com/AztecProtocol/aztec-packages/commit/dd8cc7b93119c0376873a366a8310d2ebd2641de))\n* AVM witgen track gas for nested calls and external halts\n([#10731](https://github.com/AztecProtocol/aztec-packages/issues/10731))\n([b8bdb52](https://github.com/AztecProtocol/aztec-packages/commit/b8bdb529719c1f72244e904ea667462458a43317))\n* Use correct size for databus_id\n([#10673](https://github.com/AztecProtocol/aztec-packages/issues/10673))\n([95eb658](https://github.com/AztecProtocol/aztec-packages/commit/95eb658f90687c75589b345f95a904d96e2a8e62))\n\n\n### Miscellaneous\n\n* **avm:** Radix opcode - remove immediates\n([#10696](https://github.com/AztecProtocol/aztec-packages/issues/10696))\n([4ac13e6](https://github.com/AztecProtocol/aztec-packages/commit/4ac13e642c958392ce5606684c044ea014325e26)),\ncloses\n[#10371](https://github.com/AztecProtocol/aztec-packages/issues/10371)\n* Move decider PK allocation to methods\n([#10670](https://github.com/AztecProtocol/aztec-packages/issues/10670))\n([1ab9e30](https://github.com/AztecProtocol/aztec-packages/commit/1ab9e30d339cfd7a80f333e408c367c1f8bf49f8))\n</details>\n\n---\nThis PR was generated with [Release\nPlease](https://github.com/googleapis/release-please). See\n[documentation](https://github.com/googleapis/release-please#release-please).",
          "timestamp": "2024-12-17T20:03:03-05:00",
          "tree_id": "817a820d374a1205075784271571b96a6b15a4fc",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c90bb16a5880c42752809f383f517181e6f8a53a"
        },
        "date": 1734485358040,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 25318.23988999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19585.571171999996 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 24424.104675999984,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 22406.304442000004 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4465.57294699997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4166.2908800000005 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 89416.667004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 89416667000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 16582.283358,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16582284000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2789911470,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2789911470 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 133534028,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 133534028 ns\nthreads: 1"
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
          "id": "469476bc73606659da58d492b2640dea4ac924c2",
          "message": "fix: remove table shifts (#10814)\n\nTable shifts have been obsolete since we moved to a log derivative\r\nlookup argument and the table polynomials were still incorrectly\r\nconsidered part of the `to_be_shifted` polynomials set. This PR\r\naddresses the issue and, in turn, the proof size because smaller by 4\r\nfrs. Additionally, this brings some flavor simplifications.",
          "timestamp": "2024-12-18T09:11:20Z",
          "tree_id": "00b64cf7c0a9828cfcd420a2e0bf15558d4fbe71",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/469476bc73606659da58d492b2640dea4ac924c2"
        },
        "date": 1734516024432,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 25358.808219999984,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19374.892241999998 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 24471.55405699999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 22387.463696000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4857.796519000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4533.140636 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 84792.790161,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 84792790000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15074.171436,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15074173000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2839630147,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2839630147 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 142449604,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 142449604 ns\nthreads: 1"
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
          "id": "263eaad065d607d7af2d2c163c5090b8d73216c1",
          "message": "feat: add priority fees to gas settings (#10763)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\r\nline.",
          "timestamp": "2024-12-18T09:38:16Z",
          "tree_id": "3ccfd4f63e1cff372cb93c7920a10620d3940ab6",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/263eaad065d607d7af2d2c163c5090b8d73216c1"
        },
        "date": 1734517915249,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 25560.60757199998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19430.118732 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 24457.996852999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 22280.942353 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4854.384539000022,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4523.057631000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 84604.086341,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 84604086000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15084.434339,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15084435000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2856668744,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2856668744 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 142950195,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 142950195 ns\nthreads: 1"
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
          "id": "e8480cbf1ecdee5d7228b08d1c9608308acdd624",
          "message": "feat: move busread and lookup block construction at the top of the trace (#10707)\n\nConstructing the lookup block and lookup table data at the top of the\r\ntrace removes the dependence of active ranges on the dyadic circuit size\r\nwhich was causing problems for the overflow scenario and also reduces\r\nthe number of active rows to be close to the real size (modulo\r\nhttps://github.com/AztecProtocol/barretenberg/issues/1152 which still\r\nneeds investigation).",
          "timestamp": "2024-12-18T11:15:45Z",
          "tree_id": "7b9e38e07add526aab7d999bf58d7a83a4e7430b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e8480cbf1ecdee5d7228b08d1c9608308acdd624"
        },
        "date": 1734523065330,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 21469.483932999992,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18921.031903 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 24431.404593999985,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 21786.193354000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4968.941267000019,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4642.270874999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 85628.90712,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 85628908000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15079.21652,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15079218000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2838666079,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2838666079 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 142377178,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 142377178 ns\nthreads: 1"
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
          "id": "970ad77966a17fd5c8071a7c3c3a405f83630c5d",
          "message": "fix: toBlock argument in L1 getLogs is inclusive (#10828)\n\nAs @alexghr identified, we got a spurious reorg on a node in the exp1\r\nnetwork. This was caused by the node getting a current\r\n`l1BlockNumber=245`, but then fetching an L2 block mined at 246.\r\n\r\nThis caused the `canPrune` check to fail: \r\n\r\n```\r\nconst canPrune =\r\n      localPendingBlockNumber > provenBlockNumber &&\r\n      (await this.rollup.read.canPruneAtTime([time], { blockNumber: currentL1BlockNumber }));\r\n```\r\n\r\nThe `canPruneAtTime` was evaluated at L1 block number 245, and it\r\ncorrectly returned true, since there had been a reorg shortly before (at\r\n240), and no new L2 block had been mined so the rollup hadn't reset its\r\nstate by then. However, the `localPendingBlockNumber` was incorrectly\r\nincreased due to the block mined at 246, which caused the archiver to\r\nincorrectly reorg it.\r\n\r\nThis PR fixes the L1 event queries so the `toBlock` is inclusive. A\r\nquick test with cast shows that this is the case:\r\n```\r\n$ cast logs -r https://mainnet.infura.io/v3/$INFURA_API_KEY --from-block 0x146eade --to-block 0x146eadf --address 0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48 --json | jq .[].blockNumber | uniq\r\n\"0x146eade\"\r\n\"0x146eadf\"\r\n```\r\n\r\nAnd just for good measure, we also filter the logs returned by the block\r\nrange searched.",
          "timestamp": "2024-12-18T09:11:04-03:00",
          "tree_id": "88fcc9cac8e1e230915fc3ec5831be1d3b43f54b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/970ad77966a17fd5c8071a7c3c3a405f83630c5d"
        },
        "date": 1734525442139,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 21512.632263,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18789.880754 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 24456.08347000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 21644.320863 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4951.82334499998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4605.475333 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 85072.53844,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 85072539000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15053.910278,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15053911000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2831719351,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2831719351 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 142050591,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 142050591 ns\nthreads: 1"
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
          "id": "8820bd5f3004fedd6c286e2dbf5f8b24fc767fd2",
          "message": "fix: handle calls to non-existent contracts in AVM witgen (#10862)\n\nExceptionally halt & consume all gas on a call to a non-existent\ncontract. Should be able to prove.\n\nHacked this to work for top-level/enqueued-calls by adding a dummy row\n(`op_add`) and then raising an exceptional halt.\n\nResolves https://github.com/AztecProtocol/aztec-packages/issues/10373\nResolves https://github.com/AztecProtocol/aztec-packages/issues/10044\n\nFollow-up work:\n- Add tests for bytecode deserialization failures (sim & witgen)",
          "timestamp": "2024-12-19T06:36:48-05:00",
          "tree_id": "895b9543d9e3a2d453c93791371cd2b084e935b1",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8820bd5f3004fedd6c286e2dbf5f8b24fc767fd2"
        },
        "date": 1734609525000,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 21746.67925900002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19073.500444 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 24511.337944000017,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 21797.343171 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5007.585204999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4645.667925 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 84614.78080800001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 84614782000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15131.664287000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15131665000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2853639406,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2853639406 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 141955268,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 141955268 ns\nthreads: 1"
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
          "id": "7a9506c6f400a88cbdbc9fad75d7b2bd35bea2cf",
          "message": "chore(avm): Conditionally enable avm recursion unit tests based on an env variable (#10873)",
          "timestamp": "2024-12-19T12:57:10+01:00",
          "tree_id": "7367ac20097ce413d80f63880e0ea231f9ca6d68",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7a9506c6f400a88cbdbc9fad75d7b2bd35bea2cf"
        },
        "date": 1734610769721,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 21416.303787000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18956.300385 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 24393.417599999964,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 21576.290522999996 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4944.460961999994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4635.3334970000005 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 83881.326274,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 83881397000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15006.525647999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15006526000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2849739376,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2849739376 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 144576089,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 144576089 ns\nthreads: 1"
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
          "id": "ebd6aba915b822711166b4424cc4c81f226ddcfb",
          "message": "feat: add gate count tracking for ivc constraints (#10772)",
          "timestamp": "2024-12-19T17:07:29+04:00",
          "tree_id": "f7976d07836b0f32189891b9f8d041633cf70403",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ebd6aba915b822711166b4424cc4c81f226ddcfb"
        },
        "date": 1734614706266,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20489.601304000018,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17991.324086999997 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 24164.213521000023,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 21199.935229000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4435.946793999989,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4157.363215 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 95397.72463900001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 95397725000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 16469.350387000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16469351000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3643733636,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3643733636 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 165826917,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 165826917 ns\nthreads: 1"
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
          "id": "15475f47bdc2ac02ea5157bdc9d1f5172ff6ed09",
          "message": "feat: added a UnivariateMonomial representation to reduce field ops in protogalaxy+sumcheck (#10401)\n\nSummary:\r\n\r\n`client_ivc_bench.sh` benchmark has been improved by approx 10% (26218ms\r\nvs 29306ms)\r\n\r\nIn both protogalaxy + sumcheck, the basic representation of the edge of\r\nthe boolean hypercube is now a degree-1 monomial instead of a\r\nMAX_RELATION_DEGREE-degree monomial\r\n\r\nThe class UnivariateMonomial can efficiently evaluate low-degree\r\nmonomial relations of up to degree-2. The relations in the `relations`\r\ndirectory have been reworked to perform initial low-degree algebraic\r\ncomputations using UnivariateMonomial, only converting to a full\r\nMonomial object once the UnivariateMonomial would otherwise exceed\r\ndegree-2\r\n\r\nReason why we do all of this:\r\n\r\n1. for MegaFlavor, `extend_edges` was converting every flavour\r\npolynomial into a degree-11 Univariate. This was introducing 9 Fp\r\nadditions * NUM_ALL_ENTITIES per row in the circuit. Given the sparse\r\ntrace structure we are working with, this is a lot of computation that\r\nthis PR makes redundant\r\n2. for each relation, we check if it can be skipped by typically calling\r\n`is_zero` on a selector. The selector poly is in Univariate form\r\n(MegaFlavor = degree-11) which is 11 Fp zero-checks. MegaFlavor has 9\r\nskippable relations which is 99 Fp zero-checks. With the new degree-2\r\nrepresentation this is reduced to only 18 Fp zero-checks\r\n3. The number of raw Fp add and mul operations required to evaluate our\r\nrelations is reduced. For example, in the permutation argument each\r\n`*`/`+` operation in the `accumulate` function was costing us 11 Fp\r\nmuls/adds. It is cheaper to compute low-degree sub-terms in the\r\ncoefficient representation before extend inginto point-evaluation\r\nrepresentation\r\n\r\ne.g. consider (in the protogalaxy case where challenges are degree-1\r\nunivariates) `(w_i + \\beta * S_i + \\gamma)` for `i = 0,1,2,3`. In\r\ncoefficient representation this term can be computed with 8 Fp adds and\r\n3 Fp muls. Extending into a degree-11 point evaluation form costs 18 Fp\r\nadds for a total of 26 Fp adds and 3 Fp muls.\r\n\r\nIn master branch, using Univariate<11> this computation costs us 20 Fp\r\nadds and 10 Fp muls. Assuming an add is 1/3 the cost of a mul, this\r\nmakes the new approach cost 35 Fp add-equivalent operations vs 50 Fp\r\nadd-equivalent\r\n\r\nOverall in the new approach, the number of field operations to compute\r\nthe permutation argument has reduced by 30%",
          "timestamp": "2024-12-19T15:12:09Z",
          "tree_id": "16726762d4bf7492bbfa2f371eae794d8b327586",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/15475f47bdc2ac02ea5157bdc9d1f5172ff6ed09"
        },
        "date": 1734622480904,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19619.226225000006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17172.247299 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21711.567222000012,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19137.342345 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4174.930159000013,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3868.259428 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 84176.988422,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 84176989000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15217.179274000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15217181000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2781235387,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2781235387 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 132331442,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 132331442 ns\nthreads: 1"
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
          "id": "ef247d4d68ce4aadb4c45b1f75d71a411e7102b6",
          "message": "chore(avm): extra column information in lookups (#10905)\n\nNeeded for vm2. This helps derive a lookup class from the settings.",
          "timestamp": "2024-12-20T12:40:40Z",
          "tree_id": "56999a44a08648832134df54a69c7ecfa7b847e8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ef247d4d68ce4aadb4c45b1f75d71a411e7102b6"
        },
        "date": 1734699417335,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20294.08005800002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17774.308369 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21876.17391399999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19281.479867 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4655.666172999986,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4343.510282 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 73152.726453,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 73152726000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14069.454980000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14069455000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3250698225,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3250698225 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 145886537,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 145886537 ns\nthreads: 1"
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
          "id": "9ed43bce2545f908d6351c6d330470b19510d216",
          "message": "chore(master): Release 0.68.0 (#10834)\n\nThis release is too large to preview in the pull request body. View the\nfull release notes here:\nhttps://github.com/AztecProtocol/aztec-packages/blob/release-please--branches--master--release-notes/release-notes.md",
          "timestamp": "2024-12-20T18:20:26Z",
          "tree_id": "b75f467a03f4f7d7156fde301c3cb4f537ff1159",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9ed43bce2545f908d6351c6d330470b19510d216"
        },
        "date": 1734719799818,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20322.919189999993,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17695.727963999998 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21812.926538,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19041.610996 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4630.180110999959,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4317.738614999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 81610.981691,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 81610982000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13894.379013,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13894378000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3352309391,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3352309391 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 142453198,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 142453198 ns\nthreads: 1"
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
          "id": "bf5e294dd31ed860d5b4ce6bf06f7ae4d5f3052a",
          "message": "chore(master): Release 0.68.0",
          "timestamp": "2024-12-20T18:20:30Z",
          "url": "https://github.com/AztecProtocol/aztec-packages/pull/10834/commits/bf5e294dd31ed860d5b4ce6bf06f7ae4d5f3052a"
        },
        "date": 1734719805369,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20448.393573000005,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17879.481030000003 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21785.989263999993,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19094.770102 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4627.763732999994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4282.267201999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 73104.782897,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 73104783000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13925.917256,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13925918000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2869513808,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2869513808 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 141927201,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 141927201 ns\nthreads: 1"
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
          "id": "5da4d1b661cb27b81c657adacf928a74f98c264c",
          "message": "chore: reorganise translator proving key construction (#10853)\n\nTranslator ProverPolynomials were constructed in three different files: \r\n* `permutation_lib.hpp` which was part of the honk target\r\n* the witness was constructed in the `TranslatorProver` class\r\n* some polynomials were constructed in `TranslatorFlavor`\r\n\r\nThis PR introduces a `TranslatorProvingKey` aimed to unify the logic in\r\na manner similar to `DeciderProvingKey`, in an attempt to make\r\nnavigating state less confusing.",
          "timestamp": "2024-12-23T15:58:07+01:00",
          "tree_id": "acb3e4a424141ede7a93de01026623d740b2b2ac",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5da4d1b661cb27b81c657adacf928a74f98c264c"
        },
        "date": 1734967451673,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20232.947851000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17634.279267 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21819.305328000042,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19323.144963 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4625.779651000016,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4276.178236999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 72986.298089,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 72986298000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13980.891083999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13980892000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2850525774,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2850525774 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 147333302,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 147333302 ns\nthreads: 1"
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
          "id": "d340f0b0c2c97b59d2a8830bdae452d85945322c",
          "message": "feat: add limit to unique contract call (#10640)\n\nResolves https://github.com/AztecProtocol/aztec-packages/issues/10369\n\nNote from @dbanks12:\nOnce the limit has been reached for contract calls to unique class IDs,\nyou can still call repeat contract addresses or even other contract\naddresses that reuse an already checked class ID.\n\nI had to change the call-ptr/space-id to just use a counter instead of\nclk because space-id is uint8 and we were getting collisions.\n\nFollow-up work:\n- constrain that user-called address can be derived from the hinted\nclass ID & instance\n\n---------\n\nCo-authored-by: dbanks12 <david@aztecprotocol.com>",
          "timestamp": "2024-12-23T11:31:43-05:00",
          "tree_id": "68a082cb55164e4b8f30b258c0cf7e0827b1dea5",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d340f0b0c2c97b59d2a8830bdae452d85945322c"
        },
        "date": 1734973073087,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20471.22738400003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17957.367361 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21974.129255000036,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19420.415213 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4805.8454459999775,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4480.75968 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 82513.43422000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 82513434000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14027.516520000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14027517000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3056525550,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3056525550 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 144956508,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 144956508 ns\nthreads: 1"
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
          "id": "ab3f31858b09cb6c8afcc3d2f8f361814cbe531c",
          "message": "chore(avm): Check that slice read/write are not out of memory range (#10879)\n\nResolves #7385",
          "timestamp": "2024-12-23T12:55:55-05:00",
          "tree_id": "a04e96a75229aaf1f1619b370f67eb579feaefaf",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ab3f31858b09cb6c8afcc3d2f8f361814cbe531c"
        },
        "date": 1734977631713,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20623.245949999953,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18061.201221 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 22011.64535800001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19314.090194999997 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4753.147948999953,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4413.159777000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 82094.17110699999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 82094172000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14132.730854000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14132732000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3517619210,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3517619210 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 167597621,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 167597621 ns\nthreads: 1"
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
          "id": "febb96c06d3ca51a70cf116d05fa21ad23d733d1",
          "message": "chore(master): Release 0.68.1",
          "timestamp": "2024-12-23T19:14:35Z",
          "url": "https://github.com/AztecProtocol/aztec-packages/pull/10918/commits/febb96c06d3ca51a70cf116d05fa21ad23d733d1"
        },
        "date": 1734981831023,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20349.93410200002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17890.489276 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21881.26345699999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19420.72105 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4623.300760000006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4314.227238000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 73099.897263,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 73099898000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13932.895406,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13932897000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2916163511,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2916163511 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 165929001,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 165929001 ns\nthreads: 1"
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
          "id": "82bc146989f1375bb36b7d2ab47e3068af513f71",
          "message": "feat: Use UltraRollupHonk in rollup (#10342)\n\nUses UltraRollupFlavor and UltraRecursiveRollupFlavor in the rollup.\r\n\r\nModifies UltraRecursiveVerifier tests to also test rollup flavors.\r\n\r\nAdds new test program, `verify_rollup_honk_proof`, and new flows for\r\ntest program.",
          "timestamp": "2024-12-23T21:44:01-05:00",
          "tree_id": "2e914ee49452cfa42859749031266af8861790f3",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/82bc146989f1375bb36b7d2ab47e3068af513f71"
        },
        "date": 1735009269479,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20272.17651000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17720.271271999998 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21821.03502000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19092.446210000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4614.9903919999815,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4236.160359 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 73296.235023,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 73296235000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13932.224051000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13932225000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2864960911,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2864960911 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 142324936,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 142324936 ns\nthreads: 1"
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
          "id": "2274402ef1b67d8f1a88a922d00521a48cf38c08",
          "message": "chore(master): Release 0.68.2 (#10948)\n\n:robot: I have created a release *beep* *boop*\r\n---\r\n\r\n\r\n<details><summary>aztec-package: 0.68.2</summary>\r\n\r\n##\r\n[0.68.2](https://github.com/AztecProtocol/aztec-packages/compare/aztec-package-v0.68.1...aztec-package-v0.68.2)\r\n(2024-12-23)\r\n\r\n\r\n### Miscellaneous\r\n\r\n* **aztec-package:** Synchronize aztec-packages versions\r\n</details>\r\n\r\n<details><summary>barretenberg.js: 0.68.2</summary>\r\n\r\n##\r\n[0.68.2](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg.js-v0.68.1...barretenberg.js-v0.68.2)\r\n(2024-12-23)\r\n\r\n\r\n### Miscellaneous\r\n\r\n* **barretenberg.js:** Synchronize aztec-packages versions\r\n</details>\r\n\r\n<details><summary>aztec-packages: 0.68.2</summary>\r\n\r\n##\r\n[0.68.2](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.68.1...aztec-packages-v0.68.2)\r\n(2024-12-23)\r\n\r\n\r\n### Bug Fixes\r\n\r\n* Fix proverEnabled flag in cli-wallet\r\n([#10945](https://github.com/AztecProtocol/aztec-packages/issues/10945))\r\n([c484e50](https://github.com/AztecProtocol/aztec-packages/commit/c484e50ad990ae50e99a5badc4cec60e679d68e8))\r\n</details>\r\n\r\n<details><summary>barretenberg: 0.68.2</summary>\r\n\r\n##\r\n[0.68.2](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.68.1...barretenberg-v0.68.2)\r\n(2024-12-23)\r\n\r\n\r\n### Miscellaneous\r\n\r\n* **barretenberg:** Synchronize aztec-packages versions\r\n</details>\r\n\r\n---\r\nThis PR was generated with [Release\r\nPlease](https://github.com/googleapis/release-please). See\r\n[documentation](https://github.com/googleapis/release-please#release-please).",
          "timestamp": "2024-12-24T11:39:33+05:30",
          "tree_id": "d42c72b648235bbde664014065e3bdd8a3c89440",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/2274402ef1b67d8f1a88a922d00521a48cf38c08"
        },
        "date": 1735021559356,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20018.349253999986,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17621.63941 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21796.022749999964,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18993.331961 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4624.46975200001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4296.561926 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 72979.099704,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 72979100000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13988.284001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13988284000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2881450982,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2881450982 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 142409439,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 142409439 ns\nthreads: 1"
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
          "id": "0836fabe6bff272133b2befe2d713f194c5df694",
          "message": "chore(master): Release 0.68.2",
          "timestamp": "2024-12-24T06:09:38Z",
          "url": "https://github.com/AztecProtocol/aztec-packages/pull/10948/commits/0836fabe6bff272133b2befe2d713f194c5df694"
        },
        "date": 1735021634984,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20205.64733500001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17739.005098999998 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21751.091279999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19197.790051999997 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4644.332130999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4290.627646 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 81467.184956,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 81467186000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13952.067319999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13952067000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2880935505,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2880935505 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 141464050,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 141464050 ns\nthreads: 1"
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
          "id": "f6fef05119af7714d60f00c52455e52bdfa98288",
          "message": "chore: clean up translator circuit builder function definitions  (#10944)\n\nSome of the core functions in `TranslatorCircuitBuilder` were not\r\nactually defined as part of the class. This PR addresses it, which\r\nremoves the need to resolve the scope of member variables in the class,\r\nwhen used in those functions, and constified / staticfied function\r\nsignatures where appropriate",
          "timestamp": "2024-12-24T16:26:03+01:00",
          "tree_id": "77291f32991c1387bfee815d54b0b9cb33c33f73",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f6fef05119af7714d60f00c52455e52bdfa98288"
        },
        "date": 1735055516004,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20104.694028999973,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17574.052976 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21826.818340999976,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19063.207024999996 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4633.245838000022,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4316.263722000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 72941.80755700001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 72941809000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13911.937908,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13911938000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2884668919,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2884668919 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 146851888,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 146851888 ns\nthreads: 1"
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
          "id": "158afc4cd34a9fc9cb41bcb083b5197eae1ce442",
          "message": "chore: fix mac build (#10963)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\nline.",
          "timestamp": "2024-12-24T14:51:00-05:00",
          "tree_id": "49d4f6a96d23bd029343329ad9ffce272947f029",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/158afc4cd34a9fc9cb41bcb083b5197eae1ce442"
        },
        "date": 1735070915227,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20346.310748000007,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17786.132812999997 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21758.651991999955,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19133.20074 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4606.017660999982,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4288.9733080000005 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 72841.53083700001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 72841531000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13950.229712000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13950231000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2855202326,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2855202326 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 144694268,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 144694268 ns\nthreads: 1"
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
          "id": "49dacc3378a339f8cc36971b630c52952249f60c",
          "message": "chore: Cl/ci3.2 (#10919)\n\nFurther iteration towards full CI3.\r\nTLDR: Working towards ~10m repo test time.\r\n\r\n* Begin to separate out \"building of tests\" (mainly thinking of C++ and\r\nRust). We don't want to do this on a fast bootstrap, but we do want to\r\ndo it if we're going to run the tests. And moving towards the new\r\ntesting model we need to separate building and running of tests.\r\n* Introduce `test-cmds` cmd on bootstrap scripts. Returns a list of\r\ncommands, that if run from repo root, execute individual (usually)\r\ntests.\r\n* Note this also introduces the standard of `./scripts/run_test.sh`\r\nbeing a script that given some succinct arguments, can run a single\r\ntest.\r\n* Introduce `test-all` (eventually to become just `test`) in root\r\nbootstrap.sh. No args runs all tests, or you can give it a list of\r\nfolders to projects with their own bootstrap scripts and it'll run their\r\ntests. Runs in 10m20s. Currently skipping some things (see TODO below).\r\nReports slow tests after run.\r\n* Note this also runs our TS project tests *directly as javascript*.\r\ni.e. it's assumed the tests have all been compiled to the dest folder\r\nand have whatever they need to operate. Hitting yarn + transpiler is\r\njust gruesome use of resources.\r\n* Improve cache script to not deal with env vars, but just args. If the\r\nargs is a file, its treated as a rebuild patterns file, otherwise\r\ntreated as a pattern itself.\r\n* Remove `TEST=0/1` flag. Unnecessary. Normal bootstraps don't run\r\ntests, and If i request to run tests I want them to run. So the \"skip\r\ntests if cache flag exists\" only needs to be applied if `CI=1`.\r\n* Get's rid of all hardcoded srs paths in favour of making function call\r\nto get the path. Will check environment variables first, and fallback on\r\nhardcoded path (now in one place). I ultimately didn't need this like I\r\nthought I would, but it's the right move anyway, and will make the\r\nswitch to the flat crs easier.\r\n* Bit of refactoring to remove \"right drift\" of cache blocks. i.e.\r\nreturn if nothing to do instead of enclosing in an if statement.\r\n* bb.js uses @swc/jest like yarn-projects does.\r\n* Delete `bootstrap` folder. Is was there to help test the bootstrap\r\nscript in CI, but now we use the bootstrap script in CI.\r\n* Add build cache to `boxes`.\r\n* Enable extended globs in CI3 scripts.\r\n* Revert back to default jest reporter, unless running all tests from\r\nroot, then it uses summary reporter.\r\n\r\nTODO:\r\n- [ ] kv-store tests\r\n- [x] TXE for contracts/aztec.nr tests\r\n- [x] noir js packages tests\r\n- [ ] Skipping tests matching `test_caches_open|requests` in noir tests.\r\n- [x] Standardise how tests are skipped so we can see in one place.\r\n\r\n---------\r\n\r\nCo-authored-by: ludamad <adam.domurad@gmail.com>",
          "timestamp": "2025-01-02T12:37:03Z",
          "tree_id": "7d7c340709bc212fa5fa493dc1586a4ddb5c1eb7",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/49dacc3378a339f8cc36971b630c52952249f60c"
        },
        "date": 1735822393862,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20261.802672999976,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17801.997142 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21823.828717000026,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19275.886926 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4613.451245999982,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4301.50535 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 72823.09977500001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 72823100000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13925.252640000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13925253000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2869725092,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2869725092 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 142542608,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 142542608 ns\nthreads: 1"
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
          "id": "2044c58387b5687658f190cf1b4a078a036eabc0",
          "message": "chore: redo typo PR by Anon-im (#11009)\n\nThanks Anon-im for\nhttps://github.com/AztecProtocol/aztec-packages/pull/10955. Our policy\nis to redo typo changes to dissuade metric farming. This is an automated\nscript.",
          "timestamp": "2025-01-02T15:08:02Z",
          "tree_id": "12d5f6b9ca82ea4cc91f7b4c6dcbbd0f7a09d547",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/2044c58387b5687658f190cf1b4a078a036eabc0"
        },
        "date": 1735831416875,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20514.750378,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18044.736857 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 22024.17950700004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19090.315262999997 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4681.815486000005,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4321.173408999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 73860.84801599999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 73860849000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14015.076969000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14015077000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2883417471,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2883417471 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 141694091,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 141694091 ns\nthreads: 1"
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
          "id": "fd5f611aca60c9c906a6440fdb5683794a183d53",
          "message": "feat: Encapsulated UltraHonk Vanilla IVC (#10900)\n\nThis adds a class that does IVC proving via recursion for the UltraHonk\r\nproof system.",
          "timestamp": "2025-01-02T10:11:02-05:00",
          "tree_id": "447a8f6d995a8734379e1a0aebdd3fd538340894",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/fd5f611aca60c9c906a6440fdb5683794a183d53"
        },
        "date": 1735831909812,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20620.885541999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18121.592355 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 24099.804028999984,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19382.768035999998 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4675.295517999984,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4317.527015 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 80794.10385099999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 80794105000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13948.856737,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13948858000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3427319387,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3427319387 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 168614617,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 168614617 ns\nthreads: 1"
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
          "id": "0c6a4bee82c62a522f69756f0d233ec637cd1a7a",
          "message": "chore: redo typo PR by petryshkaCODE (#10993)\n\nThanks petryshkaCODE for\nhttps://github.com/AztecProtocol/aztec-packages/pull/10982. Our policy\nis to redo typo changes to dissuade metric farming. This is an automated\nscript.",
          "timestamp": "2025-01-02T15:38:56Z",
          "tree_id": "0f4a236590bf14aeafdc6fa26dcd5d0831f1d846",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0c6a4bee82c62a522f69756f0d233ec637cd1a7a"
        },
        "date": 1735833763118,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20306.493022000013,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17804.506748 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21891.938364999987,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19106.475278 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4667.638124999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4338.460036999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 72991.96774299999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 72991968000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13953.806374,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13953807000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2893676788,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2893676788 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 142504165,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 142504165 ns\nthreads: 1"
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
          "id": "37095ceba560ad66516467387d186b5afd19a6e0",
          "message": "feat: Use full IPA recursive verifier in root rollup (#10962)\n\nModifies the root rollup circuit to use different recursion proof type,\r\nROOT_ROLLUP_HONK and processing of honk_recursion_constraints, so the\r\nbackend knows to run the full IPA recursive verifier.\r\n\r\nResolves https://github.com/AztecProtocol/barretenberg/issues/1183.",
          "timestamp": "2025-01-02T21:45:58Z",
          "tree_id": "fcf966e3b8c5d404c4ec30b396ed70c37832b480",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/37095ceba560ad66516467387d186b5afd19a6e0"
        },
        "date": 1735855292530,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20245.989401999992,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17751.176918999998 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21845.095571,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19073.680909 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4635.720676000034,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4339.428815 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 73467.872584,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 73467873000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13970.039669,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13970039000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2980474638,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2980474638 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 141687442,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 141687442 ns\nthreads: 1"
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
          "id": "018f11e39266423376b3a56afbc8aaf54b4de31d",
          "message": "chore: redo typo PR by Hack666r (#10992)\n\nThanks Hack666r for\nhttps://github.com/AztecProtocol/aztec-packages/pull/10983. Our policy\nis to redo typo changes to dissuade metric farming. This is an automated\nscript.",
          "timestamp": "2025-01-02T22:09:23Z",
          "tree_id": "0d75dffbb466f62941e3da23fe66e0185876ec0d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/018f11e39266423376b3a56afbc8aaf54b4de31d"
        },
        "date": 1735857180082,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20224.675502999988,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17803.901766000003 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21846.583254999983,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19097.173211 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4612.137423000007,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4300.750187 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 73471.448687,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 73471449000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13943.290162999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13943289000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2862021966,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2862021966 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 141345356,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 141345356 ns\nthreads: 1"
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
          "id": "faca458adda3139e92dcb2709f2c087c85842dd8",
          "message": "chore: redo typo PR by MonkeyKing44 (#10996)\n\nThanks MonkeyKing44 for\r\nhttps://github.com/AztecProtocol/aztec-packages/pull/10985. Our policy\r\nis to redo typo changes to dissuade metric farming. This is an automated\r\nscript.\r\n\r\n---------\r\n\r\nCo-authored-by: Maddiaa <47148561+Maddiaa0@users.noreply.github.com>\r\nCo-authored-by: Tom French <15848336+TomAFrench@users.noreply.github.com>\r\nCo-authored-by: Tom French <tom@tomfren.ch>",
          "timestamp": "2025-01-02T22:09:28Z",
          "tree_id": "a3071b627c68a1f512fab632baffb05730f4b0e1",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/faca458adda3139e92dcb2709f2c087c85842dd8"
        },
        "date": 1735857183298,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20238.16852599998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17806.038097 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21832.961119000003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19078.769716 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4629.983260000017,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4311.801830000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 73161.135687,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 73161136000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13985.842454000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13985843000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2890763261,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2890763261 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 148888180,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 148888180 ns\nthreads: 1"
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
          "id": "2d3805a3b682b27bf6275c547b4b3d68d214eebe",
          "message": "feat: Sync from noir (#10922)\n\nAutomated pull of development from the\n[noir](https://github.com/noir-lang/noir) programming language, a\ndependency of Aztec.\nBEGIN_COMMIT_OVERRIDE\nchore: add `rollup_root` and `rollup_block_merge` to tracked protocol\ncircuits (https://github.com/noir-lang/noir/pull/6903)\nfix: consistent file_id across installation paths\n(https://github.com/noir-lang/noir/pull/6912)\nfix: bigint builtins are foreigns\n(https://github.com/noir-lang/noir/pull/6892)\nfix: remove unnecessary cast in bit-shift\n(https://github.com/noir-lang/noir/pull/6890)\nchore: Release Noir(1.0.0-beta.1)\n(https://github.com/noir-lang/noir/pull/6622)\nchore: Add `Instruction::Noop`\n(https://github.com/noir-lang/noir/pull/6899)\nEND_COMMIT_OVERRIDE\n\n---------\n\nCo-authored-by: Tom French <15848336+TomAFrench@users.noreply.github.com>",
          "timestamp": "2025-01-02T22:19:38Z",
          "tree_id": "f959518d63905f05b879372ef583417ae33ee7b4",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/2d3805a3b682b27bf6275c547b4b3d68d214eebe"
        },
        "date": 1735857750701,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20568.767926000022,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18035.928342000003 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21991.315463000006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19276.388183000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4671.218221000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4317.6563129999995 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 74022.71658800001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 74022717000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13998.589694000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13998590000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2890858706,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2890858706 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 143202427,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 143202427 ns\nthreads: 1"
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
          "id": "156634d992cadbfbdc7ac964ae122b939f8a3b59",
          "message": "chore(master): Release 0.69.0",
          "timestamp": "2025-01-03T11:16:15Z",
          "url": "https://github.com/AztecProtocol/aztec-packages/pull/10956/commits/156634d992cadbfbdc7ac964ae122b939f8a3b59"
        },
        "date": 1735903519381,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20898.40717599998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18431.508804 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 22328.448932000014,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19512.675563 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4704.935141000022,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4315.106790000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 73668.676343,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 73668677000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14196.835392,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14196836000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2991132938,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2991132938 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 142573096,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 142573096 ns\nthreads: 1"
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
          "id": "036496ce7496132b7376c9a6708a9a6ed460771d",
          "message": "fix: add bytecode instances in reverse (#11064)\n\nSince we cache hints from earlier instances, when receiving hints for\ninstances we keep the earliest hints\n\nCo-authored-by: David Banks <47112877+dbanks12@users.noreply.github.com>",
          "timestamp": "2025-01-06T16:47:07Z",
          "tree_id": "cd86891d3d75968515a823602c999dd851ecb5b5",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/036496ce7496132b7376c9a6708a9a6ed460771d"
        },
        "date": 1736182994587,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20233.990393,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17800.597287999997 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21802.06259099998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19189.808848999997 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4602.1164030000255,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4330.8603760000005 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 72813.23902600001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 72813239000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13897.274596000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13897274000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2905436109,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2905436109 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 142471684,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 142471684 ns\nthreads: 1"
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
          "id": "800c83475c2b23ac6cf501c998f7c57b3803ad8f",
          "message": "chore: clean up proof lengths and IPA (#11020)\n\nCloses https://github.com/AztecProtocol/barretenberg/issues/1184.\r\nCloses https://github.com/AztecProtocol/barretenberg/issues/1168.\r\n\r\nCleans up some ugliness by deduplication and refactoring. Also adds new\r\nUltraRollupHonk tests and a new test for checking proof lengths.",
          "timestamp": "2025-01-06T17:57:15Z",
          "tree_id": "2b87b8a5a45e64471a9de9f547e1feff5f9b59be",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/800c83475c2b23ac6cf501c998f7c57b3803ad8f"
        },
        "date": 1736187226769,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20153.86183999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17671.438688 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21766.65838400004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19315.740832000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4603.296634000003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4306.661016 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 72754.874095,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 72754875000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13977.354899999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13977356000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2868605930,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2868605930 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 141858000,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 141858000 ns\nthreads: 1"
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
          "id": "8829f2421238945f042338bac0c9e7342517248b",
          "message": "chore(avm): more column information in permutations (#11070)\n\nNeeded for avm2.",
          "timestamp": "2025-01-06T18:53:41Z",
          "tree_id": "047c6def56d1c591d3119c3077af3a927a925042",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8829f2421238945f042338bac0c9e7342517248b"
        },
        "date": 1736190632742,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20378.588485000022,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17867.288208 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21883.914918000017,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19310.873033 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4636.138843999959,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4247.608365 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 72982.11258399999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 72982114000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13911.442454999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13911443000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2871577157,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2871577157 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 145055566,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 145055566 ns\nthreads: 1"
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
          "id": "a5097a994e7ecc0be2b6c7d7b320bd7bad5a27a0",
          "message": "chore(avm): Handle specific MSM errors (#11068)\n\nResolves #10854",
          "timestamp": "2025-01-06T20:38:03Z",
          "tree_id": "7247289a554be3e4ed63f18e538dd7fc90ff5401",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a5097a994e7ecc0be2b6c7d7b320bd7bad5a27a0"
        },
        "date": 1736197371234,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20363.76701100002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17767.931673 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21858.954770999957,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19229.817922 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4632.139879000022,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4317.807648999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 72888.76763399999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 72888768000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13920.162860999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13920163000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2874988943,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2874988943 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 142345825,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 142345825 ns\nthreads: 1"
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
          "id": "da5e95ffab1694bad22817edd9abdf8e48c992ca",
          "message": "fix: Update requests per call should be less than per tx (#11072)\n\n`MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX` is 63, but\r\n`MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_CALL` was set to 64. This PR\r\nupdates the `PER_CALL` constant to 63.\r\n\r\nUnrelated updates to other constants are probably due to\r\n`remake-constants` not having been run after updating other constants.",
          "timestamp": "2025-01-06T19:05:14-03:00",
          "tree_id": "55f97d783cfcd1966b118f9eda59b0c4d59c757f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/da5e95ffab1694bad22817edd9abdf8e48c992ca"
        },
        "date": 1736202529736,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20165.038914000037,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17636.651336 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21856.21075300003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19283.547567999998 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4634.679065,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4318.763916 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 73227.457503,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 73227459000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13938.672118,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13938673000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2890977578,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2890977578 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 154266954,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 154266954 ns\nthreads: 1"
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
          "id": "7da7f2bb6c26a7c55a5869d21c3a5f546880a001",
          "message": "feat: improve witness generation for cycle_group::batch_mul (#9563)\n\nProblem:\r\n\r\n`cycle_group` has a heavy witness generation cost. Existing code\r\nperforms multiple modular inversions for every cycle_group group\r\noperation in `batch_mul`\r\n\r\nThis was leading to 40% of the Prover time for `cycle_group` operations\r\nbeing raw witness generation.\r\n\r\nBatch inversion techniques are now employed to remove this cost.",
          "timestamp": "2025-01-06T17:08:25-05:00",
          "tree_id": "5221d562f6453310d60bab2d4df959480a161cb1",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7da7f2bb6c26a7c55a5869d21c3a5f546880a001"
        },
        "date": 1736202763823,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19452.477765000025,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17035.208253999997 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21234.543427999994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18605.154755999996 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4621.017558000005,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4249.78584 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 80358.20862199999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 80358209000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13986.053909,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13986054000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3007016102,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3007016102 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 141695438,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 141695438 ns\nthreads: 1"
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
          "id": "9968849f1e3680ad26edb174d81693f0ced0edd4",
          "message": "chore: unify honk verifier contracts (#11067)\n\nIntroduce a BaseHonkVerifier abstract contract that can be inherited by\r\nthe test verifier contracts, in a pattern similar to the Plonk verifier\r\ncontract.",
          "timestamp": "2025-01-07T11:08:39Z",
          "tree_id": "4f58abd34c72b739e5e7b60040d0fe8b383cc62d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9968849f1e3680ad26edb174d81693f0ced0edd4"
        },
        "date": 1736249115766,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19497.574117,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17018.690476000003 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21441.40179499999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18906.637044 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4615.411822999988,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4333.8557980000005 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 71364.75483,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 71364755000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13981.063399,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13981065000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2888447179,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2888447179 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 150275139,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 150275139 ns\nthreads: 1"
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
          "id": "fc48dcca537fa790ed6866ad4e184cb89c2617a2",
          "message": "feat: fix commitments and openings of masking polynomials used in zk sumcheck  (#10773)\n\nWe have updated the approach for committing to Libra masking\r\npolynomials. Instead of committing to them and opening them separately,\r\nwe now utilize the [inner products using KZG with ZK and a linear-time\r\nverifier](https://hackmd.io/xYHn1qqvQjey1yJutcuXdg?both#inner-products-using-KZG-with-zk-and-linear-time-verifier)\r\nprotocol, referred to as **SmallSubgroupIPA**.\r\n\r\n### Key Changes in this PR\r\n-  Addressed ZK issues of the previous approach.\r\n- Reduced the number of scalar multiplications required in our ZK\r\nverifiers over BN254.\r\n-  Finalized the necessary logic for UltraZK.\r\n\r\n### Remark\r\nHowever, the non-native arithmetic required by `ECCVMRecursiveVerifier`\r\nbecomes prohibitively expensive if we continue sending the coefficients\r\nof `SumcheckUnivariates`. To address this, we have implemented a\r\nGrumpkin-based version of **SmallSubgroupIPA**, which assumes sending\r\ncommitments to the `SumcheckRound` univariates. This will be done in a\r\nfollow-up update.",
          "timestamp": "2025-01-07T13:39:20+01:00",
          "tree_id": "e24381f5c2522df6b0354a4f35d8a8c79407fe18",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/fc48dcca537fa790ed6866ad4e184cb89c2617a2"
        },
        "date": 1736254513769,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19629.297726999994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17086.599381 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21314.671893999985,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18662.310964 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4651.158126999973,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4254.621628 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 72078.668879,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 72078669000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13991.375813999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13991376000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2854677686,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2854677686 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 146004416,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 146004416 ns\nthreads: 1"
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
          "id": "1cb7cd78d089fd1e2706d9d5993b6115bcdd6a84",
          "message": "feat: Acir formal proofs (#10973)\n\nThe ACIR formal verification. Combines a test generator in the Noir\r\nrepository with a formal verifier in Barretenberg to mathematically\r\nprove the correctness of ACIR instructions using SMT solving. Verifies\r\nrange of operations including 127-bit arithmetic (addition, subtraction,\r\nmultiplication), 126-bit division, bitwise operations (though currently\r\nlimited to 32-bit for AND/OR/XOR), shift operations, field operations\r\n(ADD, MUL, DIV), and comparison operations",
          "timestamp": "2025-01-07T13:02:00Z",
          "tree_id": "69853ce22187e324099c50b06b7998655253f14e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1cb7cd78d089fd1e2706d9d5993b6115bcdd6a84"
        },
        "date": 1736256421112,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19654.74621499999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17119.365716 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21345.15435100002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18545.349747 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4621.581203999966,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4209.548783000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 71484.080483,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 71484081000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13909.907984000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13909908000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2907780000,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2907780000 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 144538888,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 144538888 ns\nthreads: 1"
          }
        ]
      }
    ]
  }
}