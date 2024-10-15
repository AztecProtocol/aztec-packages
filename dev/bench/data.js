window.BENCHMARK_DATA = {
  "lastUpdate": 1729014359901,
  "repoUrl": "https://github.com/AztecProtocol/aztec-packages",
  "entries": {
    "C++ Benchmark": [
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
          "id": "7677ca5d9280ac9615a92be36d1958960dbd7353",
          "message": "fix: Revert \"feat: new per-enqueued-call gas limit\" (#9139)\n\nReverts AztecProtocol/aztec-packages#9033\r\n\r\nbroke uniswap tests",
          "timestamp": "2024-10-09T23:07:36+01:00",
          "tree_id": "233ec2721be559d6a711577dfd1b3bfda80ebe96",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7677ca5d9280ac9615a92be36d1958960dbd7353"
        },
        "date": 1728512781845,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 31583.283288000017,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 29331.169152000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5587.834569000009,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5267.126811 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 93094.189992,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 93094191000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15758.464262,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15758464000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8561158678,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8561158678 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 164884510,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 164884510 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6904730928,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6904730928 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 130695234,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 130695234 ns\nthreads: 1"
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
          "id": "662b61e4c20a2d4217980922d4578f4dfeacae6b",
          "message": "chore(docs): rewriting bbup script, refactoring bb readme for clarity (#9073)\n\n## Description\r\n\r\nCloses #8530\r\n\r\nCloses https://github.com/AztecProtocol/aztec-packages/issues/7511\r\nhttps://github.com/AztecProtocol/aztec-packages/issues/7525 as no longer\r\nuseful / relevant\r\n\r\nThis PR updates the Barretenberg README with more information about the\r\nproject, its installation, usage, and development.\r\n\r\nIt also refactors `bbup` with `commander` to match the rest of the\r\nrepository's CLI tooling.\r\n\r\n## Changes\r\n\r\n### bb readme\r\n- Added a project banner and reorganized the README structure\r\n- Expanded usage instructions for UltraHonk and MegaHonk\r\n\r\n### bbup\r\n- Refactored bbup installation script and related files\r\n- Included detailed installation instructions in its README\r\n\r\n## Testing\r\n\r\n`bbup` won't change much so it is deployed manually on `npm`. You can\r\ntry it immediately with:\r\n\r\n```bash\r\ncurl -L bbup.dev | bash\r\nbbup\r\n```\r\n\r\n---------\r\n\r\nCo-authored-by: Savio <72797635+Savio-Sou@users.noreply.github.com>",
          "timestamp": "2024-10-10T11:55:56+02:00",
          "tree_id": "a8da02af2a6c3c0feea6ea807397918d15e92f16",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/662b61e4c20a2d4217980922d4578f4dfeacae6b"
        },
        "date": 1728555860437,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 31416.497950000008,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 28975.102133 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5599.053466000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5265.072284 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 93321.99006000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 93321992000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15678.334770000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15678335000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8386492104,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8386492104 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 152888702,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 152888702 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6806037491,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6806037491 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 125119260,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 125119260 ns\nthreads: 1"
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
          "id": "3138078f0062d8426b3c45ac47646169317ab795",
          "message": "chore: revert deletion of the old bbup (#9146)\n\nThis fixes noir CI as it relies on the old bbup and the new one does not\r\nwork for us.",
          "timestamp": "2024-10-10T11:16:37Z",
          "tree_id": "ab866cb3a5ca9acb841e0183fa8f58a914cd7e0c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/3138078f0062d8426b3c45ac47646169317ab795"
        },
        "date": 1728559790336,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 31162.384701000006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 28831.734995 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5474.239411,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5181.039708 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 92060.516865,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 92060519000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15592.613731999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15592613000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8527533490,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8527533490 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 157813821,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 157813821 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6814238937,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6814238937 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126421676,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126421676 ns\nthreads: 1"
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
          "id": "1323a34c50e7727435129aa31a05ae7bdfb0ca09",
          "message": "feat!: unrevert \"feat: new per-enqueued-call gas limit\" (#9140)\n\nReverts AztecProtocol/aztec-packages#9139\r\n\r\nRealized the title should have the exclamation because this will break\r\napps that use more gas in a public enqueued call.",
          "timestamp": "2024-10-10T13:34:52+01:00",
          "tree_id": "7de6b667c8c8efafbcc2d423de9c0ad838f79950",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1323a34c50e7727435129aa31a05ae7bdfb0ca09"
        },
        "date": 1728565172331,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 31367.66525099999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 28704.635477 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5506.144810999985,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5165.359020000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 93593.718466,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 93593721000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15673.543629000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15673545000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8350091301,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8350091301 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 153455074,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 153455074 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6724415873,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6724415873 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 127649366,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 127649366 ns\nthreads: 1"
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
          "id": "f3ed39bf7be6f08bcfcabf6c04eb570f4d06ed27",
          "message": "refactor(avm): type aliasing for VmPublicInputs (#8884)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\r\nline.",
          "timestamp": "2024-10-10T16:57:58+01:00",
          "tree_id": "fa70179737515348e5ab4a5f7b53908b41113f38",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f3ed39bf7be6f08bcfcabf6c04eb570f4d06ed27"
        },
        "date": 1728578671482,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 31307.940682999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 28826.558692000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5520.298272999995,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5154.237581 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 93398.002216,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 93398004000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15700.834215,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15700833000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8376490456,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8376490456 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 154770442,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 154770442 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6733801322,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6733801322 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 125124576,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 125124576 ns\nthreads: 1"
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
          "id": "f0d45dd8d0c00707cd18989c3a45ff0c3cbc92a6",
          "message": "feat: Browser tests for UltraHonk (#9047)\n\nMake the browser tests use UltraHonk, and we moreover choose the hardest\npath by doing recursive verification. The logs show performance issues\nthat are being investigated.",
          "timestamp": "2024-10-10T18:46:08+01:00",
          "tree_id": "e913a4cae87f4a9d5beb2273357423a46f5a860c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f0d45dd8d0c00707cd18989c3a45ff0c3cbc92a6"
        },
        "date": 1728584272855,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 31336.824066999994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 28971.795926000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5547.228715000003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5185.790086000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 92961.942908,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 92961945000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15505.951526,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15505950000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8465789259,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8465789259 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 161605755,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 161605755 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6798758517,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6798758517 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 129672500,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 129672500 ns\nthreads: 1"
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
          "id": "409b7b8c6b43a91fc1b5be48aee0174d56d914d9",
          "message": "feat!: Brillig with a stack and conditional inlining (#8989)\n\nAdds a stack to brillig by using relative addressing. Also adds\r\nconditional inlining based on a heuristic on function size and callsite\r\nsize. This should succesfully deduplicate any large shared function in\r\nthe program that is not monomorphized.\r\n\r\n---------\r\n\r\nCo-authored-by: fcarreiro <facundo@aztecprotocol.com>\r\nCo-authored-by: Jean M <132435771+jeanmon@users.noreply.github.com>",
          "timestamp": "2024-10-10T20:19:57+01:00",
          "tree_id": "105b9cffb4542f2c77855ba303929c2be8371102",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/409b7b8c6b43a91fc1b5be48aee0174d56d914d9"
        },
        "date": 1728589808498,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 31492.281976000017,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 28991.955277999998 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5578.271837999992,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5244.880307999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 93650.779931,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 93650782000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15618.181896000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15618182000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8500153252,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8500153252 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 163851095,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 163851095 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6856637254,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6856637254 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 128760903,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 128760903 ns\nthreads: 1"
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
          "id": "04f4a7b2ae141b7eee4464e8d2cc91460d0c650a",
          "message": "feat: World State Re-orgs (#9035)\n\nThis PR adds pruning and re-org support to the native world state.\r\n\r\n---------\r\n\r\nCo-authored-by: Alex Gherghisan <alexg@aztecprotocol.com>\r\nCo-authored-by: Alex Gherghisan <alexghr@users.noreply.github.com>",
          "timestamp": "2024-10-11T11:38:30Z",
          "tree_id": "ce8b763c687a00a724a03f1a2edbff53310e2709",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/04f4a7b2ae141b7eee4464e8d2cc91460d0c650a"
        },
        "date": 1728647523779,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 31227.184443999988,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 29081.646035 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5516.137991000008,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5183.656888 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 93811.08007200001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 93811082000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15519.678895999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15519679000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8407476805,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8407476805 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 154554882,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 154554882 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6718460621,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6718460621 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126138227,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126138227 ns\nthreads: 1"
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
          "id": "349f938601f7a4fdbdf83aea62c7b8c244bbe434",
          "message": "feat: use s3 cache in bootstrap fast (#9111)\n\nThis PR switches the cache used by `./bootstrap.sh fast` from\r\nDockerimages built in CircleCI to Earthly artifacts stored in an S3\r\nbucket built during Github Action runs.\r\n\r\nThe new script requires access to the `aws` command and for credentials\r\nto be set up to read from the S3 bucket.\r\n\r\nFix #8929\r\n\r\n---------\r\n\r\nCo-authored-by: ludamad <adam.domurad@gmail.com>",
          "timestamp": "2024-10-11T12:44:40+01:00",
          "tree_id": "21aba598b3170e26fe334caa0391f722977f8fc5",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/349f938601f7a4fdbdf83aea62c7b8c244bbe434"
        },
        "date": 1728648858919,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 31345.172547999995,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 29174.267331000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5523.078627000018,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5226.618743999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 92412.31682499999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 92412318000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15570.241968,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15570242000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8394361972,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8394361972 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 152488024,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 152488024 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6751158424,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6751158424 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126037993,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126037993 ns\nthreads: 1"
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
          "id": "7872d092c359298273d7ab1fc23fa61ae1973f8b",
          "message": "fix: Revert \"feat: use s3 cache in bootstrap fast\" (#9181)",
          "timestamp": "2024-10-11T14:47:45+01:00",
          "tree_id": "d23f55bf87c8c2a0b0c47bfcacff643809368308",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7872d092c359298273d7ab1fc23fa61ae1973f8b"
        },
        "date": 1728656122053,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 31225.41787,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 29055.793897 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5497.206693000009,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5172.367360000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 93032.34833899999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 93032350000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15634.479376,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15634479000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8345559759,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8345559759 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 153053369,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 153053369 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6731858674,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6731858674 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 125927462,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 125927462 ns\nthreads: 1"
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
          "id": "3a01ad93e21e9e6cd27b7a2a4c1e2c9f24d6363e",
          "message": "feat(avm)!: more instr wire format takes u16 (#9174)\n\nMake most instructions take offsets as u16. The ones that were not\nmigrated are expected to change or be removed.\n\nYields ~2% bytecode size improvement in public_dispatch.\n\nPart of #9059.",
          "timestamp": "2024-10-11T16:19:36+01:00",
          "tree_id": "347d549c566408f70a356a2bb33f72a477d3e42e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/3a01ad93e21e9e6cd27b7a2a4c1e2c9f24d6363e"
        },
        "date": 1728660788497,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 31382.160291999993,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 28604.540396 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5542.1403060000075,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5204.132187 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 93639.303629,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 93639305000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15520.793241,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15520794000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8452375385,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8452375385 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 151137904,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 151137904 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6824909103,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6824909103 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 125222938,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 125222938 ns\nthreads: 1"
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
          "id": "4c1163a9e9516d298e55421f1cf0ed81081151dd",
          "message": "chore!: remove keccak256 opcode from ACIR/Brillig (#9104)\n\nThis PR removes the keccak256 opcode as we never emit this now,\r\npreferring keccakf1600. As we have #8989 making a breaking change to\r\nserialisation, this is a good time to do this to avoid an extra\r\nserialisation change.",
          "timestamp": "2024-10-11T15:45:13Z",
          "tree_id": "76aa125674afe1f33ac20cc043568690febd1d72",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/4c1163a9e9516d298e55421f1cf0ed81081151dd"
        },
        "date": 1728663334361,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 31290.522675999993,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 28796.047745 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5527.366165999993,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5136.880841000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 93958.84548300001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 93958847000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15551.484994999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15551486000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 8364026173,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 8364026173 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 164602531,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 164602531 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 6772403891,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 6772403891 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126241974,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126241974 ns\nthreads: 1"
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
          "id": "26f406b0591b3f88cb37c5e8f7cb3cbfc625315e",
          "message": "feat: structured commit (#9027)\n\nAdds two new methods `commit_structured` and\r\n`commit_structured_with_nonzero_complement` designed to commit to wires\r\nand the permutation grand product, respectively. The first handles\r\npolynomials with islands of non-zero values by simply copying the\r\nnonzero inputs into contiguous memory using the known endpoints then\r\nusing the conventional `commit` method. The second assumes blocks of\r\narbitrary values interspersed with blocks of constant values (with the\r\nconstant differing between blocks), i.e. the form of z_perm in the\r\nstructured trace setting. This method uses `commit_structured` to\r\ncompute the contribution from the non-constant regions. The constant\r\nregion contribution is computed by first summing all points sharing a\r\nscalar using batched affine addition (implemented in new class\r\n`BatchedAfffineAddition`), then performing the MSM on the reduced result\r\nwith one mul per constant scalar.\r\n\r\nNote: The core affine addition logic used herein was adapted from my\r\nearlier work on the `MsmSorter` which had additional logic for sorting\r\npolynomials to arrange them in sequences to be added (but was not\r\nmultithreaded). There turns out not to be a use case for this, at least\r\nfor now. I've created an issue to either refactor that method to use the\r\nnew and improved logic in `BatchedAfffineAddition` or to simply delete\r\nit.\r\n\r\nThe relevant before and after number for ClientIvc (total savings\r\n~1.7s):\r\n\r\n```\r\nClientIVCBench/Full/6      33537 ms\r\nCOMMIT::wires(t)                 2217    43.65%\r\nCOMMIT::z_perm(t)                2304    45.36%\r\n```\r\n\r\n```\r\nClientIVCBench/Full/6      31802 ms\r\nCOMMIT::wires(t)                 1720    51.07%\r\nCOMMIT::z_perm(t)                1090    32.37%\r\n```",
          "timestamp": "2024-10-11T10:25:59-07:00",
          "tree_id": "2f6edd64a8a5a7be594b61aee365d6b392e867d8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/26f406b0591b3f88cb37c5e8f7cb3cbfc625315e"
        },
        "date": 1728669377427,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29524.255001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27581.414136000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5556.055346000008,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5266.7690379999995 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 86992.54759500001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 86992549000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15623.592941000003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15623593000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3380550931,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3380550931 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 150839000,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 150839000 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2755803694,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2755803694 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 127113699,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 127113699 ns\nthreads: 1"
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
          "id": "68a7326d9f2d4bd891acac12950289d6e9fbe617",
          "message": "feat(avm)!: remove tags from wire format (#9198)\n\nYields ~5% reduction in bytecode size (public_dispatch).\n\nPart of #9059.",
          "timestamp": "2024-10-11T19:19:45+01:00",
          "tree_id": "0e5b4e4b189f5d8a3f175ddb08f7f755b86d5f0f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/68a7326d9f2d4bd891acac12950289d6e9fbe617"
        },
        "date": 1728672142111,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 30120.525876999993,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 28131.754728 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5916.832653,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5510.864528 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 87604.3213,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 87604323000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15878.614380000003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15878614000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3662358065,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3662358065 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 163505465,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 163505465 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2858087240,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2858087240 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 127226062,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 127226062 ns\nthreads: 1"
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
          "id": "ce3d08a18684da9f5b1289a2b9bdf60a66342590",
          "message": "fix: Revert \"fix: Revert \"feat: use s3 cache in bootstrap fast\"\" (#9182)\n\nReverts AztecProtocol/aztec-packages#9181\r\n\r\n---------\r\n\r\nCo-authored-by: ludamad <adam.domurad@gmail.com>",
          "timestamp": "2024-10-11T23:17:43+01:00",
          "tree_id": "1a2e931d086486fd2230dfd5ebf08c38d597d682",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ce3d08a18684da9f5b1289a2b9bdf60a66342590"
        },
        "date": 1728686369279,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29632.200125999985,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27937.362881999998 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5532.385138999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5229.549459999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 86157.205925,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 86157208000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15578.442138000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15578442000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3384472781,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3384472781 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 152654408,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 152654408 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2731867905,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2731867905 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126439816,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126439816 ns\nthreads: 1"
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
          "id": "2592e50b2bd9e76d35a3c9caac4d7042fe26b9b6",
          "message": "feat(avm): codegen recursive_verifier.cpp (#9204)\n\nResolves #8849",
          "timestamp": "2024-10-11T22:26:12Z",
          "tree_id": "f7d9c66260cb809bb2d39572269812a814997dc5",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/2592e50b2bd9e76d35a3c9caac4d7042fe26b9b6"
        },
        "date": 1728687202554,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29765.132077000006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 28184.672708000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5568.196061000009,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5269.105216000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 86911.57818000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 86911580000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15670.63818,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15670638000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3459573533,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3459573533 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 166582960,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 166582960 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2828994777,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2828994777 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 132125954,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 132125954 ns\nthreads: 1"
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
          "id": "1c008d9a2fad747142e8ca356d6c00cee1663f2c",
          "message": "feat: Tracy time with instrumentation (#9170)\n\nAt scripts for profiling locally with tracy and samply, add\r\ninstrumentation so that tracy profile is pretty complete, and combine\r\nBB_OP_COUNT macros with tracy macros.",
          "timestamp": "2024-10-11T23:11:55Z",
          "tree_id": "73ea0f6f399ec5ae1fd507ab7784445b9a0edea0",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1c008d9a2fad747142e8ca356d6c00cee1663f2c"
        },
        "date": 1728690137382,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29534.589775,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 28072.185873000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5528.562555999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5233.683983000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 86053.945606,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 86053947000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15534.235607999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15534235000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2792561611,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2792561611 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 127901215,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 127901215 ns\nthreads: 1"
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
          "id": "80ea32cfda8c149980938382518c47a6da123e72",
          "message": "fix: mac-build (#9216)\n\nfix mac build issues with emplace back",
          "timestamp": "2024-10-12T15:52:58+01:00",
          "tree_id": "137906381e8599ed68ece91e5ad570a3243d76e9",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/80ea32cfda8c149980938382518c47a6da123e72"
        },
        "date": 1728746167426,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29618.566467000022,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27895.605439 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5518.821794000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5217.721629 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 86548.20175899999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 86548204000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15583.017112000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15583017000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2801559134,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2801559134 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126363947,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126363947 ns\nthreads: 1"
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
          "id": "c857cd9167f696fc237b64ff579952001eba7d40",
          "message": "feat: Replace Zeromorph with Shplemini in ECCVM (#9102)\n\nThis PR switches ECCVM to Shplemini which shaves off ~300k in the tube\r\ncircuit. Now, on the verifier side, we first execute Shplemini, then\r\nreduce the BatchOpeningClaim to a single OpeningClaim by performing the\r\nbatch_mul delayed by Shplemini. Then, we construct the translation\r\nOpeningClaim, and the two are being reduced to a single OpeningClaim by\r\nexecuting a second iteration of Shplonk. Finally, we verify the\r\nOpeningClaim via PCS. This could be further optimised as we currently\r\nperform 4 batch_muls.",
          "timestamp": "2024-10-15T09:47:16+01:00",
          "tree_id": "bb565a572a53cf1ac2db289bcb0be0a8a5c229a0",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c857cd9167f696fc237b64ff579952001eba7d40"
        },
        "date": 1728985025455,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29604.541609999986,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 28114.01506 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5500.81342899999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5204.295326 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 87391.325026,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 87391327000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15521.631061999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15521632000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2843649671,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2843649671 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126839075,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126839075 ns\nthreads: 1"
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
          "id": "a306ea5ffeb13019427a96d8152e5642b717c5f6",
          "message": "fix: Reduce SRS size back to normal (#9098)\n\nResolves https://github.com/AztecProtocol/barretenberg/issues/1097.\r\n\r\nPreviously, we had to bump up SRS sizes to 1.5x the dyadic circuit size\r\nbecause structured polynomials meant that we could commit starting from\r\nthe start_index of the polynomial, but because pippenger likes a power\r\nof 2 points, that meant that we sometimes exceeded the\r\ndyadic_circuit_size during a roundup to a power of 2.\r\n\r\nThis PR fixes this by using PolynomialSpans to store the scalars. Note\r\nthat these scalars do not necessarily represent polynomials anymore, so\r\nmaybe this object can be renamed. The PolynomialSpan allows us to store\r\na start_index with the scalars, where the start_index here means the\r\noffset into the span of points that the scalars start at. For example,\r\nif we are committing to a polynomial which starts at index 13, and has\r\n13 length. The points we will use will now be [10, 26) instead of [13,\r\n29) previously. The start_index here would be 3 because the scalars\r\nstart at 13, which is 3 after the points start.\r\n\r\nThe range for the points is chosen to the be the earliest power of 2\r\nwindow that fits the scalars, meaning we try to shift it as left as\r\npossible. This means that will never exceed the dyadic_circuit_size as a\r\nresult, so we can keep the old (and good) SRS sizes.",
          "timestamp": "2024-10-15T17:17:38Z",
          "tree_id": "ef19d62029020b54fd1da6758cd3f4dc32573a3f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a306ea5ffeb13019427a96d8152e5642b717c5f6"
        },
        "date": 1729014352241,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29513.839836999978,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27760.377947 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5389.744848000007,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5061.229837999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 87124.68346500001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 87124686000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15195.443389000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15195442000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2719181079,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2719181079 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 127244347,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 127244347 ns\nthreads: 1"
          }
        ]
      }
    ]
  }
}