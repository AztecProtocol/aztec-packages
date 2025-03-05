window.BENCHMARK_DATA = {
  "lastUpdate": 1741210701752,
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
          "id": "0e85e24dc034741a3271298ed48e42c33be79e25",
          "message": "feat(avm): drop bytecode-specific hints (#12234)\n\nThis PR removes the `AvmBytecodeHints` and breaks them up into lower level hints. Two of them already existed (ContractInstances and NullifierChecks) but I had to add a new one for ContractClass.\n\nI'm keeping `getBytecode` in the journal for now, but it is now calling other methods _in the journal_, instead of using the DB directly. Therefore, it is indirectly generating hints and tracing things as well. This let us get rid of duplicated code for getting instances (and update hints and membership check hints).\n\nNo shims in this PR, just painful refactoring :)",
          "timestamp": "2025-03-03T13:48:45Z",
          "tree_id": "394995dcef0d3b2e88313662d5348d46616711ee",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0e85e24dc034741a3271298ed48e42c33be79e25"
        },
        "date": 1741012589185,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18654.318951999812,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16352.902756 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18877.078702999825,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16490.921542000004 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3960.217803999967,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3166.4327479999997 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 56054.984183,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 56054983000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10021.033363,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10021039000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1989841216,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1989841216 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 233449064,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 233449064 ns\nthreads: 1"
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
          "id": "540b346eda9b367e500a06887f02dbb7c69c714c",
          "message": "chore(iac): remove mainnet-fork (#12398)",
          "timestamp": "2025-03-03T13:51:27Z",
          "tree_id": "ed10dcaf8ef0f316bb316481a7045ee0d9b03636",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/540b346eda9b367e500a06887f02dbb7c69c714c"
        },
        "date": 1741012628386,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18303.268305000074,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16117.778882999999 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18965.401756999654,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16300.152602 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3963.1619890001275,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3156.8400899999997 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55614.251825,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55614252000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11612.728247,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11612729000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1925537046,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1925537046 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 214530429,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 214530429 ns\nthreads: 1"
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
          "id": "eb00a467eb3804b095d4809382f03ab3aadbfe51",
          "message": "feat(avm): use messagepack + zod for avm inputs serde (#12341)\n\nThis PR uses MP to serialize avm structures to C++, and Zod to (de)serialize avm structures in TS.\n* Zod is \"needed\" to make (de)serialization to the orchestrator and prover-agent work\n* MessagePack is used for serde to C++\n\nMessagePack CANT be used to do TS-TS serde because it loses type information when it serializes. That's what Zod schemas give you back.\n\nPS: Also note that on the C++ side we can deserialize a subset of the structure sent from TS, and that works! That lets us do things iteratively.",
          "timestamp": "2025-03-03T14:23:24Z",
          "tree_id": "5c5fca43d341a851662a5ca7834cb6e67fafad29",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/eb00a467eb3804b095d4809382f03ab3aadbfe51"
        },
        "date": 1741014123863,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18459.872023000116,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16133.820259 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18965.246343000217,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16378.973151 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4029.64044700002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3156.6474909999997 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55489.237926999995,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55489238000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9978.805886,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9978808000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1909006915,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1909006915 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 220134404,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 220134404 ns\nthreads: 1"
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
          "id": "d3495c9fb2e47b43f5c0172881748a175b966b0b",
          "message": "chore: remove usage of deprecated sha256 (#12337)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\nline.",
          "timestamp": "2025-03-03T14:24:25Z",
          "tree_id": "9ee349dffb523b9828218a4e438f23ed60bd5e9d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d3495c9fb2e47b43f5c0172881748a175b966b0b"
        },
        "date": 1741014215382,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18624.74297000017,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16131.800705 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 19047.87715500015,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16462.677465999997 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4036.691927999982,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3226.177521 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55883.828389,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55883829000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11269.261642,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11269266000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1962415122,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1962415122 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 224714531,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 224714531 ns\nthreads: 1"
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
          "id": "cca90e5e655ed9a2d2bb969f034e42ac15f87439",
          "message": "feat: wip (#12412)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\nline.",
          "timestamp": "2025-03-03T14:32:48Z",
          "tree_id": "8f83b4ecd8824c0d0a80bcafca1363d9d7bdc995",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/cca90e5e655ed9a2d2bb969f034e42ac15f87439"
        },
        "date": 1741014382882,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18229.00447799998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16016.226036000002 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18917.62871900005,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16595.152993 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3944.5827040001404,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3150.3194190000004 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55756.742267,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55756742000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9889.165365,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9889169000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1970746881,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1970746881 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 220208118,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 220208118 ns\nthreads: 1"
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
          "id": "a4e1c70ddffb3d590d8289011814fd5fe3857c69",
          "message": "chore(rollup): store genesis state as a struct (#12409)",
          "timestamp": "2025-03-03T14:38:13Z",
          "tree_id": "dd3ea8fa9b5e38fe51723b2971ac2820147683f3",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a4e1c70ddffb3d590d8289011814fd5fe3857c69"
        },
        "date": 1741014786383,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18301.927257999978,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16177.241956 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18907.512532000055,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16372.406395000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4066.6925679997803,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3223.6144250000007 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55412.457905,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55412457000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9997.210421,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9997215000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1956369950,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1956369950 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 231826289,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 231826289 ns\nthreads: 1"
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
          "id": "97993921687c5b4df401deef4aad8a3db380435b",
          "message": "refactor: Simplify port forwarding and process management in kind tests (#12393)\n\nThis change updates the port forwarding utility to dynamically allocate\nports and improve process management across multiple end-to-end tests.\nKey modifications include:\n\n- Removing hardcoded host port configurations\n- Dynamically allocating ports during port forwarding\n- Centralizing process tracking with a `forwardProcesses` array\n- Adding `afterAll` hooks to kill port forward processes\n- Improving error handling and logging in port forward utility\n\nThe root cause was discovered by @spalladino. The time between a port\nbeing assigned in bash and then it being used was causing mismatches:\ntwo different services were trying to use the same port.\n\nAlso, not cleaning up ports behind ourselves was causing there to be an\nartificially low pool of ports to choose from.",
          "timestamp": "2025-03-03T14:44:59Z",
          "tree_id": "24d6ebd9e747df6b9547e7645cb96eebdfcfd96b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/97993921687c5b4df401deef4aad8a3db380435b"
        },
        "date": 1741015428864,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18400.275408000198,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16199.25281 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 19000.19836399997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16361.028867999998 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3960.107959999732,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3191.8414669999993 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55709.694365999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55709694000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9539.020466,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9539025000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1923796353,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1923796353 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 216803305,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 216803305 ns\nthreads: 1"
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
          "id": "0b0127fc0d46f2877367967b2dd4b7c58f593a6f",
          "message": "feat: embed version info in release image (#12401)\n\nThis PR recreates the change to the release image from #12326",
          "timestamp": "2025-03-03T14:53:34Z",
          "tree_id": "63fc619eb471db23202522aa609cf142e21dede5",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0b0127fc0d46f2877367967b2dd4b7c58f593a6f"
        },
        "date": 1741015737297,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18024.274655,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16068.569120999999 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18731.114273000003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16322.295897 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3881.2688030000118,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3046.6070919999993 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55263.394395999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55263393000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11047.036785999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11047040000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1896732387,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1896732387 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 222786134,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 222786134 ns\nthreads: 1"
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
          "id": "f72ccc28641c40dc30ff63929842cb87c3c2a6d4",
          "message": "fix: sepolia deployments (#12329)\n\nFollow-up fixes from merging #11945 & #12076",
          "timestamp": "2025-03-03T10:07:54-05:00",
          "tree_id": "0d30b6be03e1974d3c5f3d66ce31965b7ed65d39",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f72ccc28641c40dc30ff63929842cb87c3c2a6d4"
        },
        "date": 1741016595457,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18185.27984100001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16036.031071999996 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18775.01463700014,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16306.217152999998 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3901.4381120000508,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3079.2829910000005 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55500.453143,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55500450000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11260.855066999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11260857000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1913612156,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1913612156 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 213487782,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 213487782 ns\nthreads: 1"
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
          "id": "8f13fd51d615406c2f43facea444beb0c3affba9",
          "message": "fix(p2p): slashing test + slasher client does not store own state (#12380)",
          "timestamp": "2025-03-03T16:03:47Z",
          "tree_id": "f1ccaf8d1d179e396d3e2bf9467d5a0b003d4e54",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8f13fd51d615406c2f43facea444beb0c3affba9"
        },
        "date": 1741019601422,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18033.1508270001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15859.691937000001 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18736.060855000003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16411.163843000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3861.8076669999937,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3009.341203 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54601.658664999995,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54601659000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9311.083406,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9311087000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1911700340,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1911700340 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 215330860,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 215330860 ns\nthreads: 1"
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
          "id": "6cdb9db2bc38ee3fd5becf9fa8bb8444a3c050ce",
          "message": "chore: remove `ROOTS` arg from unconstrained functions in bloblib (#12418)\n\nSome cleanup\n\nSee: https://github.com/noir-lang/noir/pull/7559#issuecomment-2694800192",
          "timestamp": "2025-03-03T16:13:34Z",
          "tree_id": "7ea6b2de56cdd50febe73a5d7b374b0ef87bf459",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/6cdb9db2bc38ee3fd5becf9fa8bb8444a3c050ce"
        },
        "date": 1741020457869,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18221.681678000095,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16052.980071 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18803.074812999967,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16537.79653 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4016.1445319999984,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3144.127216 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55742.94014,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55742942000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11174.574518000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11174582000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1900406278,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1900406278 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 213410606,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 213410606 ns\nthreads: 1"
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
          "id": "f305ee61175393a1e0c4e8427e2d125697432a85",
          "message": "chore: kv-store flakes. assign alex",
          "timestamp": "2025-03-03T16:50:46Z",
          "tree_id": "ae60cf50f540c2fab076210cd2794c6b6acd5c39",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f305ee61175393a1e0c4e8427e2d125697432a85"
        },
        "date": 1741022543431,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18115.663641999847,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16092.629419999997 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18624.370392999936,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16260.546085999998 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3826.8044640001335,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3036.753875 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55141.689497,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55141689000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9936.471268999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9936475000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1896019384,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1896019384 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 213268707,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 213268707 ns\nthreads: 1"
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
          "id": "edb20f68ec47dfc833403fd3cd36555f3ab1dad1",
          "message": "chore: calculate available memory for noir-projects/bootstrap.sh memsuspend (#12419)\n\n## Overview\n\nFixes hanging in devboxes\n\n\nsee:\nhttps://github.com/AztecProtocol/aztec-packages/pull/12400#issuecomment-2694816001\n\n---------\n\nCo-authored-by: ludamad <domuradical@gmail.com>\nCo-authored-by: ludamad <adam.domurad@gmail.com>",
          "timestamp": "2025-03-03T12:41:57-05:00",
          "tree_id": "cd579e8ba464c79d3474025bdb81d2ec072c88f3",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/edb20f68ec47dfc833403fd3cd36555f3ab1dad1"
        },
        "date": 1741026085460,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18317.22147900018,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16196.263246 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18868.564718000016,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16354.910872000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4005.035388000124,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3245.9105769999996 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 56032.981856,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 56032982000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9745.669614,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9745672000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1903716093,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1903716093 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 215300597,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 215300597 ns\nthreads: 1"
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
          "id": "7cb6328ee6106c2436d1e80e3aeb8c30df7bf831",
          "message": "chore: pull out formatter changes from sync (#12426)\n\nThis PR pulls out a bunch of formatter changes from the noir sync to\nreduce noise",
          "timestamp": "2025-03-03T20:01:51Z",
          "tree_id": "e77adc2e544a8979252d701da7f84ae709116190",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7cb6328ee6106c2436d1e80e3aeb8c30df7bf831"
        },
        "date": 1741033978549,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18293.90081199995,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16206.493926000001 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18686.57101099984,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16310.210768 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3980.5286610001076,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3103.178491 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55514.586755,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55514587000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10980.870231,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10980873000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1915413931,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1915413931 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 223876554,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 223876554 ns\nthreads: 1"
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
          "id": "3bdb886d1cfde30ba044a37f89c702b056a4834d",
          "message": "feat: contract instance/class cache for current tx - ensure that later txs in block cannot wipe out contracts created earlier (#12261)\n\nEnsures that contracts only get wiped out of the cache when they really\nshould.\n\n## What's included\n1. Separates the caches for `ContractDataSourcePublicDB` as follows:\n    ```\n    private blockCache = new TxContractCache();\n    private currentTxNonRevertibleCache = new TxContractCache();\n    private currentTxRevertibleCache = new TxContractCache();\n    private bytecodeCommitmentCache = new Map<string, Fr>();\n    ```\n    - using a new little cache class `TxContractCache`.\n1. Caches non-revertibles before public setup and revertibles before\npublic app logic.\n1. Pushes all new contracts to block-level cache for private-only txs.\n1. Includes some progress towards ensuring that contracts can be called\nafter deployment in same block (including public-processor and e2e\ntests)\n1. Rearranged some things in `simulator/src/public` into subfolders\n1. Created a new suite of deployment tests for public processor.\n\n## Issues\nI discovered during this work, that if you run certain test-cases in\n`deploy_method.test.ts` _on their own_ (without running earlier test\ncases, they fail as follows (happens on master):\n\n![image](https://github.com/user-attachments/assets/7e9b476b-c9f4-48c0-97a4-e2a52de77b69)\n\nThis holds true for the new test. This *might* mean that contracts\ncannot be properly called after deployment in the same block! More\ninvestigation is needed in another ticket/pr.",
          "timestamp": "2025-03-03T20:39:34Z",
          "tree_id": "fddf79a445a74688db1e37ff6f8bd2622a87c365",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/3bdb886d1cfde30ba044a37f89c702b056a4834d"
        },
        "date": 1741036455949,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18455.58466600005,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16246.144482000002 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18843.664178000152,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16339.517242 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3905.0467419997403,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3138.345809 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55633.761479999994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55633762000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9793.011663,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9793015000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1904656968,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1904656968 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 214122665,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 214122665 ns\nthreads: 1"
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
          "id": "035bdb65cdeab264cb01822ea7c6f15c77717d40",
          "message": "feat: add wasm mode for profiler (#12407)\n\n+fix the profiler",
          "timestamp": "2025-03-03T21:29:29Z",
          "tree_id": "7e8193559e0606fce388c729cebc30c4c0582c8a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/035bdb65cdeab264cb01822ea7c6f15c77717d40"
        },
        "date": 1741039314379,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18203.51833399991,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15940.115910999999 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18732.819159999963,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16338.215185 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3926.0127779998584,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3131.5731460000006 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55181.495011,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55181496000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10419.563221,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10419584000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1911060090,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1911060090 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 219538181,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 219538181 ns\nthreads: 1"
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
          "id": "8ade7a52c662db9448c7bf4061aadc703a62c1f1",
          "message": "chore: reenable public teardown in orchestrator test (#12428)",
          "timestamp": "2025-03-03T21:52:43Z",
          "tree_id": "9fb39d52819cb3d4788e089c755235cb8e03688a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8ade7a52c662db9448c7bf4061aadc703a62c1f1"
        },
        "date": 1741040911100,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18286.87829899991,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16156.974230000003 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18828.786402999867,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16398.896422 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3949.9548270002833,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3139.0626099999995 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 56187.975715,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 56187974000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10681.111241999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10681120000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1892216848,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1892216848 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 216417728,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 216417728 ns\nthreads: 1"
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
          "id": "44b03b5e38c1da7a5d4ee97629c419d75bb7b53a",
          "message": "chore: fix ivc gate counts mismatch (#12363)\n\nThe method used to compute client ivc gate counts was missing a builder\ntype template argument leading to wrong gate numbers.\n\n---------\n\nCo-authored-by: saleel <saleel@aztecprotocol.com>",
          "timestamp": "2025-03-04T19:17:42+01:00",
          "tree_id": "eafff28e6eb761b056a22891f115a5799e1dbf1f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/44b03b5e38c1da7a5d4ee97629c419d75bb7b53a"
        },
        "date": 1741115399697,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18330.089017999853,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16166.690091999999 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18819.181392000246,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16653.459256000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3930.753687000106,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3067.0745179999994 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55097.099311,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55097099000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9757.309862,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9757314000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1933435233,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1933435233 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 211327595,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 211327595 ns\nthreads: 1"
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
          "id": "4d5524ce120a658fe3fc5cf37801b24e8caf3ef8",
          "message": "fix: busted grep. (#12456)",
          "timestamp": "2025-03-04T20:40:17Z",
          "tree_id": "9a877a928bde236feaf36995dd22e3edc6d0d131",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/4d5524ce120a658fe3fc5cf37801b24e8caf3ef8"
        },
        "date": 1741122837979,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18197.134698000125,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16038.896902 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18775.03994099993,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16301.512896999999 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3914.271647000078,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3128.1182750000003 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55459.162147,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55459162000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10631.268815,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10631274000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1915972603,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1915972603 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 225709926,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 225709926 ns\nthreads: 1"
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
          "id": "a1550be5a662dddd2807d80ee21b6bafa111569c",
          "message": "feat: sponsored fpc (#12324)\n\n- Create a `SponsoredFPC` contract to pay for fees unconditionally.\n  - Deployed by default in sandbox.\n  - Tested in `e2e_sandbox_example.test.ts`.\n- Export `ProtocolContractAddress` from `aztec.js`.\n- Add a new util `getFeeJuiceBalance(owner: AztecAddress, pxe: PXE)` in\n`aztec.js`.",
          "timestamp": "2025-03-04T21:52:05Z",
          "tree_id": "788d7e7fb5bab50215ea0fd711c25fe39f6e63e3",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a1550be5a662dddd2807d80ee21b6bafa111569c"
        },
        "date": 1741127418027,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18369.12976900021,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16220.178124 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18908.744626999804,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16339.726948000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3954.0302440000232,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3089.927141 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55515.224662,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55515225000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9477.898304,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9477902000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1906135903,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1906135903 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 222061838,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 222061838 ns\nthreads: 1"
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
          "id": "5f141167d16f1450348a4bbe55d94a462b5b62eb",
          "message": "fix: npm release (#12392)",
          "timestamp": "2025-03-04T22:00:37Z",
          "tree_id": "abafec49d4db23f6098e034faf999fe19d6edecc",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5f141167d16f1450348a4bbe55d94a462b5b62eb"
        },
        "date": 1741127922464,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18227.148953000098,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16031.271144999999 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18925.084801999903,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16420.747559000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3989.751381000133,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3181.1068639999994 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55900.528145,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55900529000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10768.713290000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10768717000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1918634058,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1918634058 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 217209294,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 217209294 ns\nthreads: 1"
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
          "id": "a4d57c13dc2acfe9351913c85b212fc7533665fb",
          "message": "fix: run arm64 during tagged releases (#12460)",
          "timestamp": "2025-03-04T17:13:45-05:00",
          "tree_id": "64f886fb3419c823a0bfc2965bd9050870b43be3",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a4d57c13dc2acfe9351913c85b212fc7533665fb"
        },
        "date": 1741128360567,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18236.712387999887,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16092.904704999999 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18565.509663000055,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16277.869119000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3920.1430209998307,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3079.734515 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55116.121166,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55116121000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9627.703233,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9627705000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1906980421,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1906980421 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 210915891,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 210915891 ns\nthreads: 1"
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
          "id": "14b9df8850df3a0b8151a924532bf1a4862822e3",
          "message": "fix: update cli payment method option (#12423)\n\n- Only allow to configure `feePayer` for the `--payment` option of\n`create-account` and `deploy-account`.\n  - If `feePayer` is set for other commands, it will simply be ignored.\n- Add descriptions for the parameters of  the `--payment` option.",
          "timestamp": "2025-03-04T22:18:01Z",
          "tree_id": "969b6a4621fe4038c44217760a08e1773c9d809b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/14b9df8850df3a0b8151a924532bf1a4862822e3"
        },
        "date": 1741128816334,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18296.27789999995,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16086.481404999997 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18901.081848999864,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16474.707217 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3952.021487000138,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3147.5787750000004 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55725.698284000006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55725698000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11259.298213000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11259303000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1905687882,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1905687882 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 218820818,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 218820818 ns\nthreads: 1"
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
          "id": "518e7b9a3a148c7a856c3d5ee24d64aa4e1453af",
          "message": "fix: mass tag push scenario (#12464)\n\nAfter mass-deleting some tags (which is generally not recommended, but I\nthought I'd clean up recent work if possible) I realized that this could\ncause someone to mass re-push the tags, as git doesn't delete them\nlocally after a pull.\n\nInstead, if we are on a git tag starting with 'v', assume we are doing a\nrelease and only allow one to go through.\n\nPS: I recommend this setting if doing manual releases:\n\n```\ngit config fetch.pruneTags true\n```",
          "timestamp": "2025-03-04T20:17:50-05:00",
          "tree_id": "49027dbcee8c1795f1daa705a70e1d1881b22701",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/518e7b9a3a148c7a856c3d5ee24d64aa4e1453af"
        },
        "date": 1741139308260,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18013.557726999807,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15890.925299 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18586.551727999904,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16163.357683 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3840.0458429998707,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3089.607527 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54981.726484000006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54981726000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11069.249169,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11069253000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1896390369,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1896390369 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 220484537,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 220484537 ns\nthreads: 1"
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
          "id": "5733bae7dc79ff1ee9a2867b42aced517f587ddf",
          "message": "chore: update test patterns (#12461)",
          "timestamp": "2025-03-05T08:56:28Z",
          "tree_id": "c13e8e7e9062209e8a13bbbb3b556db9f2e07a43",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5733bae7dc79ff1ee9a2867b42aced517f587ddf"
        },
        "date": 1741166819596,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18044.891452000003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15743.861053000002 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18695.274300000165,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16331.323523 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3923.360935000119,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3096.852577 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55476.926428,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55476926000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11354.655956,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11354660000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1884281259,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1884281259 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 213781947,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 213781947 ns\nthreads: 1"
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
          "id": "e3d8cb7d1fde0382ef93c45cf09e34bc16c100d1",
          "message": "fix: provide unsiloed cc log to rollup (#12448)\n\nHave no idea how this was passing - the incorrect contract class log\npreimages were always being provided to the base rollup circuits\n(whoops). Bit of a janky fix to avoid carrying around an extra field per\nlog on the processed tx/ in block builders.\nShould fix broken 4 epochs test",
          "timestamp": "2025-03-05T09:54:03Z",
          "tree_id": "3177333026591e939a4f4c475066409cdb0f76f5",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e3d8cb7d1fde0382ef93c45cf09e34bc16c100d1"
        },
        "date": 1741170267731,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18185.247892999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15902.771241000002 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18755.6857510001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16297.771827999999 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3924.5166600001085,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3080.063633 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55262.637575,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55262638000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9767.232886,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9767239000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1973142555,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1973142555 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 219381141,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 219381141 ns\nthreads: 1"
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
          "id": "134fef19c8a854e59e3ee82aba8631bb1af47a6a",
          "message": "fix: port forwarding in upgrade rollup test (#12462)\n\nWe were connecting using the old port forward, which only sometimes\nworked.",
          "timestamp": "2025-03-05T10:50:10Z",
          "tree_id": "9269fd71e4f9614cec67db985f98aa44021a4b7d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/134fef19c8a854e59e3ee82aba8631bb1af47a6a"
        },
        "date": 1741173606750,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18304.28308600017,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16144.083842 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18750.79331300003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16333.206273000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3890.204878000077,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3151.493688 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55057.195036,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55057195000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10798.591844,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10798594000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1915786286,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1915786286 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 213890629,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 213890629 ns\nthreads: 1"
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
          "id": "65f8376a5d0f05b76de5154d902348278ba05417",
          "message": "chore: minor zod schema changes (#12480)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this line.",
          "timestamp": "2025-03-05T13:51:31Z",
          "tree_id": "7b10c5dd2417335a9dc61c1ca30406758e46e231",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/65f8376a5d0f05b76de5154d902348278ba05417"
        },
        "date": 1741184613766,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18256.91499200002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16146.779354 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18798.308212999927,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16421.370095000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4031.8057519998547,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3077.3780169999995 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55249.627548,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55249628000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10600.998559000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10601002000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1893003363,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1893003363 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 214945161,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 214945161 ns\nthreads: 1"
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
          "id": "bfdf41ae97bbbc078850eba730df2e57382dd47a",
          "message": "docs: update profiler docs to use wasm method (#12469)",
          "timestamp": "2025-03-05T14:17:11Z",
          "tree_id": "111bd50db5e5b6c04a6f48e7a08a5bce5fbda847",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/bfdf41ae97bbbc078850eba730df2e57382dd47a"
        },
        "date": 1741185035274,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17937.82215200008,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16025.107339999999 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18687.774917000068,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16250.772461 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3818.149253999991,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3086.052161 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54927.171397000006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54927168000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9991.644094,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9991648000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1908369657,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1908369657 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 213185944,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 213185944 ns\nthreads: 1"
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
          "id": "f3743ac7836b6ab97f3f794c5f5d981e10424e71",
          "message": "docs: minor fixes PR (#12362)\n\nWill keep this in draft for a few days adding incidental fixes not\nrelated to active PRs\n\n---------\n\nCo-authored-by: Josh Crites <jc@joshcrites.com>",
          "timestamp": "2025-03-05T14:34:28Z",
          "tree_id": "73e30107baafdc74dabcc1e68cab38c48d15802f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f3743ac7836b6ab97f3f794c5f5d981e10424e71"
        },
        "date": 1741188447739,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17993.58683299988,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15985.471011 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18659.581768999942,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16279.571960000001 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3899.266171999898,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3115.585968 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55125.791807,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55125789000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10950.341891999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10950356000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1886589610,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1886589610 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 214586499,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 214586499 ns\nthreads: 1"
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
          "id": "28b7f8456210a9bc5e9d0deead80469337bda36d",
          "message": "chore: contract class log refactor follow up (#12402)\n\nCloses #12325\n\n- [x] ~Move the hashing of the contract class log to the oracle (as it\nwas previously when we used sha hashing), since we constrain its\ncorrectness in the base rollup.~ (We don't want this!)\n- [x] Rename oracle methods? (I don't know much about oracle best\npractices)\n- [x] Move validate_and_silo_contract_class_log functionality and\npossibly rename.\n- [x] Remove the blob check in data_retrieval now that we have no\ncalldata.\n\n---\nEDIT:\n- [x] Return to full log hash\n\nIn the original PR, I changed the log hash from being defined as the\nhash of emitted fields (i.e. without the padded zeros up to\n`CONTRACT_CLASS_LOG_DATA_SIZE_IN_FIELDS`) to save some computation in\nts. In the circuit it's around the same gates.\n\nHowever @sirasistant pointed out that this leads to an attack vector.\nThe length is not constrained in the registerer so a user can claim a\nlength shorter than the real bytecode:\n\n- Private only hashes the shorter length\n- Base rollup receives the shorter preimage\n- Hashes match\n- We publish incomplete bytecode\n\nThis attack would also be protected against if we constrained the\nlength. However that adds a few thousand extra gates to the registerer,\nwhereas hashing the whole log keeps the gates the same.",
          "timestamp": "2025-03-05T14:21:22Z",
          "tree_id": "8d189ae5b421df99951bc8369ef7eda2d3ea4b94",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/28b7f8456210a9bc5e9d0deead80469337bda36d"
        },
        "date": 1741188465165,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18185.480850999964,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15997.609864000002 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18535.204995000186,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16248.201185999998 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3936.074205000068,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3089.9540750000006 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54870.624906,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54870624000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10268.018194,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10268020000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1900926990,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1900926990 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 213892449,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 213892449 ns\nthreads: 1"
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
          "id": "4398a1e1f7dee6ec4ffcdf89b9eadf09d488e775",
          "message": "chore: Add noinitcheck comment to schnorr account (#12483)\n\nAdds a comment about why `noinitcheck` is used on the Schnorr account\nentrypoint.",
          "timestamp": "2025-03-05T14:24:52Z",
          "tree_id": "2e723a12e89d0935d5c7664866ac67bc7b21e1d0",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/4398a1e1f7dee6ec4ffcdf89b9eadf09d488e775"
        },
        "date": 1741188521511,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18143.28819399998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16018.071110999997 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18589.619825999987,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16251.912734000001 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3919.6743259999494,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3057.9371790000005 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54910.779309000005,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54910780000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9414.542925,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9414544000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1905037586,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1905037586 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 212826846,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 212826846 ns\nthreads: 1"
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
            "email": "rahul.kothari.201@gmail.com",
            "name": "Rahul Kothari",
            "username": "rahul-kothari"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "e83556b2d7cf0f51095c1f3dd6d9be37dc088cba",
          "message": "chore: Update migration_notes.md (#12484)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\nline.",
          "timestamp": "2025-03-05T14:56:32Z",
          "tree_id": "1086973e55aa0a2fc299d6c692bf6e6214d44602",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e83556b2d7cf0f51095c1f3dd6d9be37dc088cba"
        },
        "date": 1741188542364,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18134.41762499997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16043.879504999999 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18602.856753999957,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16269.049112 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3886.152331999938,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3050.883212000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54995.874563,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54995873000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10114.878202,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10114881000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1899956624,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1899956624 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 225459567,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 225459567 ns\nthreads: 1"
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
          "id": "1a96c0f193835d9b423419bc9eada14d3a055033",
          "message": "fix: default DB path in cli-wallet (#12475)",
          "timestamp": "2025-03-05T15:01:10Z",
          "tree_id": "996d7c3417052bd8f1fd7ef0ce961bc34aadf9eb",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1a96c0f193835d9b423419bc9eada14d3a055033"
        },
        "date": 1741188845479,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18159.76303399998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16170.500452000002 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18779.015284000023,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16243.369481999998 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3884.751902000062,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3059.583453 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55472.076508,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55472076000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9513.936944,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9513939000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1931727566,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1931727566 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 223888289,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 223888289 ns\nthreads: 1"
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
          "id": "9f65695bef8e49442df8341ef62cae7fe8aaa7fa",
          "message": "fix: readme markdown (#12465)",
          "timestamp": "2025-03-05T15:20:03Z",
          "tree_id": "5a6592c4cb059418263119d3a8f1fb1543b18cc7",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9f65695bef8e49442df8341ef62cae7fe8aaa7fa"
        },
        "date": 1741189990596,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18093.833926000116,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15927.927822000001 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18673.804052999913,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16156.248969 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4021.2018219999663,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3054.5605829999995 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54726.545305,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54726544000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9417.980901,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9417989000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1899473500,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1899473500 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 214401547,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 214401547 ns\nthreads: 1"
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
          "id": "d041cbcee0047d1a12876e9f43c1d14cf71ac98a",
          "message": "chore(master): Release 0.77.0 (#11985)\n\n:robot: I have created a release *beep* *boop*\n---\n\n\n<details><summary>aztec-package: 0.77.0</summary>\n\n##\n[0.77.0](https://github.com/AztecProtocol/aztec-packages/compare/aztec-package-v0.76.4...aztec-package-v0.77.0)\n(2025-02-14)\n\n\n### Miscellaneous\n\n* **aztec-package:** Synchronize aztec-packages versions\n</details>\n\n<details><summary>barretenberg.js: 0.77.0</summary>\n\n##\n[0.77.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg.js-v0.76.4...barretenberg.js-v0.77.0)\n(2025-02-14)\n\n\n### Miscellaneous\n\n* **barretenberg.js:** Synchronize aztec-packages versions\n</details>\n\n<details><summary>aztec-packages: 0.77.0</summary>\n\n##\n[0.77.0](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.76.4...aztec-packages-v0.77.0)\n(2025-02-14)\n\n\n### ⚠ BREAKING CHANGES\n\n* Only decrement the counter of an array if its address has not changed\n(https://github.com/noir-lang/noir/pull/7297)\n\n### Features\n\n* PIL relations modifications for bc decomposition\n([#11935](https://github.com/AztecProtocol/aztec-packages/issues/11935))\n([6c93058](https://github.com/AztecProtocol/aztec-packages/commit/6c9305897c9c333791d333d332cafa352f9bbe58))\n* Poseidon2 in vm2\n([#11597](https://github.com/AztecProtocol/aztec-packages/issues/11597))\n([2c199d8](https://github.com/AztecProtocol/aztec-packages/commit/2c199d852b316775053751fc67bd5018f35cf61b))\n* Refactor `append_tx_effects_for_blob`\n([#11805](https://github.com/AztecProtocol/aztec-packages/issues/11805))\n([e5a055b](https://github.com/AztecProtocol/aztec-packages/commit/e5a055b8ec927a0006d70b9d31d296035246e97a))\n\n\n### Bug Fixes\n\n* **docs:** Update token bridge diagram\n([#11982](https://github.com/AztecProtocol/aztec-packages/issues/11982))\n([e5da9ed](https://github.com/AztecProtocol/aztec-packages/commit/e5da9ed201804edce680ead59989b9849c32941f))\n* Let LSP read `noirfmt.toml` for formatting files\n(https://github.com/noir-lang/noir/pull/7355)\n([4d35d2f](https://github.com/AztecProtocol/aztec-packages/commit/4d35d2ff4dbfb601a46ab1f2f1fb7f2727af544d))\n* Only decrement the counter of an array if its address has not changed\n(https://github.com/noir-lang/noir/pull/7297)\n([4d35d2f](https://github.com/AztecProtocol/aztec-packages/commit/4d35d2ff4dbfb601a46ab1f2f1fb7f2727af544d))\n* Test more prover agents devnet\n([#11990](https://github.com/AztecProtocol/aztec-packages/issues/11990))\n([f12be5f](https://github.com/AztecProtocol/aztec-packages/commit/f12be5f7d1159aeaed7da3651966c697172edc70))\n\n\n### Miscellaneous\n\n* Avoid u128s in brillig memory\n(https://github.com/noir-lang/noir/pull/7363)\n([4d35d2f](https://github.com/AztecProtocol/aztec-packages/commit/4d35d2ff4dbfb601a46ab1f2f1fb7f2727af544d))\n* **ci:** Downgrade 4epochs test to transfer test\n([#11983](https://github.com/AztecProtocol/aztec-packages/issues/11983))\n([2340aab](https://github.com/AztecProtocol/aztec-packages/commit/2340aab0bd0e17e89d2f95ccaef0a8d826a60d1b))\n* Explanations about skippable\n([#11984](https://github.com/AztecProtocol/aztec-packages/issues/11984))\n([19589bc](https://github.com/AztecProtocol/aztec-packages/commit/19589bc23ccd081e07b750c3e7b6c820ca4bbce1))\n* Op wires index from 0\n([#11986](https://github.com/AztecProtocol/aztec-packages/issues/11986))\n([be1b563](https://github.com/AztecProtocol/aztec-packages/commit/be1b563ffe99689af45c9241a1d94d53de1c4e35))\n* Prep for ci3\n([8edee9e](https://github.com/AztecProtocol/aztec-packages/commit/8edee9e09bf8b663fbcb4207304f318b9e186744))\n* Remove browser test\n([3e570be](https://github.com/AztecProtocol/aztec-packages/commit/3e570bedb4d559335721198b5353e5a54c852229))\n* Replace relative paths to noir-protocol-circuits\n([b8ba716](https://github.com/AztecProtocol/aztec-packages/commit/b8ba7161a92db7af98088f52e011b0cdd15de375))\n* Some polishing on the skippable document\n([#11997](https://github.com/AztecProtocol/aztec-packages/issues/11997))\n([50e0a38](https://github.com/AztecProtocol/aztec-packages/commit/50e0a38201821885869254e5103ca1a137f1bb83))\n* Update docs about integer overflows\n(https://github.com/noir-lang/noir/pull/7370)\n([4d35d2f](https://github.com/AztecProtocol/aztec-packages/commit/4d35d2ff4dbfb601a46ab1f2f1fb7f2727af544d))\n</details>\n\n<details><summary>barretenberg: 0.77.0</summary>\n\n##\n[0.77.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.76.4...barretenberg-v0.77.0)\n(2025-02-14)\n\n\n### Features\n\n* PIL relations modifications for bc decomposition\n([#11935](https://github.com/AztecProtocol/aztec-packages/issues/11935))\n([6c93058](https://github.com/AztecProtocol/aztec-packages/commit/6c9305897c9c333791d333d332cafa352f9bbe58))\n* Poseidon2 in vm2\n([#11597](https://github.com/AztecProtocol/aztec-packages/issues/11597))\n([2c199d8](https://github.com/AztecProtocol/aztec-packages/commit/2c199d852b316775053751fc67bd5018f35cf61b))\n\n\n### Miscellaneous\n\n* Explanations about skippable\n([#11984](https://github.com/AztecProtocol/aztec-packages/issues/11984))\n([19589bc](https://github.com/AztecProtocol/aztec-packages/commit/19589bc23ccd081e07b750c3e7b6c820ca4bbce1))\n* Op wires index from 0\n([#11986](https://github.com/AztecProtocol/aztec-packages/issues/11986))\n([be1b563](https://github.com/AztecProtocol/aztec-packages/commit/be1b563ffe99689af45c9241a1d94d53de1c4e35))\n* Some polishing on the skippable document\n([#11997](https://github.com/AztecProtocol/aztec-packages/issues/11997))\n([50e0a38](https://github.com/AztecProtocol/aztec-packages/commit/50e0a38201821885869254e5103ca1a137f1bb83))\n</details>\n\n---\nThis PR was generated with [Release\nPlease](https://github.com/googleapis/release-please). See\n[documentation](https://github.com/googleapis/release-please#release-please).",
          "timestamp": "2025-03-05T15:25:41Z",
          "tree_id": "7381ff1622e89c8b9d2a08f974eb6916e54e739c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d041cbcee0047d1a12876e9f43c1d14cf71ac98a"
        },
        "date": 1741190284315,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18259.396961999984,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16152.572091 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18653.59626899999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16149.067873 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3869.586735999974,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3110.1558320000004 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55453.911585,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55453910000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10500.077636,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10500080000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1927667136,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1927667136 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 214671129,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 214671129 ns\nthreads: 1"
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
          "id": "f20446ce1ca589c22782d5f6df01d46ca7f4ed6a",
          "message": "fix: patch the kubeconfig in ci for kind cluster (#12481)\n\nSometimes kubeconfigs get generated with 0.0.0.0 as the address for the\n`kind-kind` cluster, which sometimes breaks with the TLS config.",
          "timestamp": "2025-03-05T11:00:18-05:00",
          "tree_id": "46a80a8d1d4f087c111597cd890a87dad0b0097c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f20446ce1ca589c22782d5f6df01d46ca7f4ed6a"
        },
        "date": 1741192912386,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18082.49765300002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15855.656152000001 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18701.43098699987,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16155.161372999999 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3886.5607440000076,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3169.6656860000003 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55625.336186,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55625336000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9934.654520000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9934658000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1947875609,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1947875609 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 222200650,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 222200650 ns\nthreads: 1"
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
          "id": "7a307e7348d6a03fc8c25ebd587c924ad370fdeb",
          "message": "feat: track if spot and sanitise merge queue name (#12432)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\nline.",
          "timestamp": "2025-03-05T16:08:05Z",
          "tree_id": "c2021321a0f8503258fc016a1fb1d6fabe262026",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7a307e7348d6a03fc8c25ebd587c924ad370fdeb"
        },
        "date": 1741192974280,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18264.887159999944,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16099.314505999999 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18750.59051799985,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16293.052408999998 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3880.929208000225,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3082.502516 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55294.147250999995,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55294146000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9550.00404,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9550008000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1942831515,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1942831515 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 216297312,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 216297312 ns\nthreads: 1"
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
          "id": "b6871ce5487f7ab1cc27cf8777fa238028f2dc10",
          "message": "feat: tightly pack logs inside blobs (#11752)\n\nThis PR removes trailing zeroes from logs appended to the blobs to save\non field space.\ne.g. before this PR, a public log would be appended like:\n```rust\n[1, 2, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]\n```\nbut now is appended as:\n```rust\n[1, 2, 3]\n```\nwith a length prefix.\nIn ts, we add back the trailing zeroes when constructing tx effects from\nthe blob, so if they are required there should be no issue.\nAlso, in some logs there are valid zeroes inside the log. The method\ndoes not remove these. e.g. a public log like:\n```rust\n[1, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]\n```\nis appended as:\n```rust\n[1, 0, 3]\n```\nthen reconstructed to the original log once in ts.",
          "timestamp": "2025-03-05T16:41:24Z",
          "tree_id": "8b902567ded2d8645c08792a667de1c1856bd848",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/b6871ce5487f7ab1cc27cf8777fa238028f2dc10"
        },
        "date": 1741195084902,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18310.558331000037,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16201.020712999998 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18907.178333999807,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16361.319737000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3951.323004999722,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3140.8121120000005 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55501.222697000005,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55501227000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11469.875582,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11469877000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1926191800,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1926191800 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 223513178,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 223513178 ns\nthreads: 1"
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
          "id": "c7dc5492c431ad6052a92d7de265f2a2e59af728",
          "message": "feat: Combine group polynomials in translator by interleaving rather than concatenation (#12343)\n\nTo facilitate making the translator ZK, we change the strategy of\ncombining the range constraint polynomials in translator (defined over\nthe `mini_circuit_size`) by interleaving rather than concatenation. This\nway, when blinding the polynomials, all the randomness will be located\nat the end. This PR changes the PCS protocol to handle interleaved\npolynomials and ensures the Translator polynomials are constructed by\ninterleaving (synchronously for now). The changes were integrated in the\nClaimBatcher and PolynomialBatcher\n\nSummary of changes required in the Gemini protocol.\nWith interleaving, the full batched polynomial is defined as A(X) = F(X)\n+ G(X)/X + P(X^s) where s is the size of the group of polynomials to be\ninterleaved, assumed even. Before, the concatenated component was\npartially evaluated as part of A_0+ and A_0-. Now we construct A_0+ and\nA_0- only from the batched shifted and batched unshifted components and\nseparate polynomials P+ and P- for the interleaved components and send\ntwo new opening claims for the evaluation of P+ and P- at r^s: (P+, r^s,\nP(r^s)) and (P-, r^s, P-(r^s). This way we can correctly reconstruct\nA(r) = A_0+(r) + P+(r^s) and A(-r) = A_0-(-r) + P_(r^s). The protocol\nenforces s has to be even so that (-r)^s = r^s",
          "timestamp": "2025-03-05T17:14:51Z",
          "tree_id": "3394b389579ff7c28819214ffcee0556e015fa22",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c7dc5492c431ad6052a92d7de265f2a2e59af728"
        },
        "date": 1741197388970,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18484.309483999823,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16378.714089 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18793.145228999947,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16372.345899999998 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3927.019540999936,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3142.067745 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55822.353125999995,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55822350000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11282.148501999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11282152000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1923768787,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1923768787 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 215499850,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 215499850 ns\nthreads: 1"
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
          "id": "c1daa11be668d5a85b39a82ce18b81745d2a283e",
          "message": "fix: release and add nightly tag flow (#12493)\n\n- resurrect release please workflow with just the portion that creates\nthe tag and release\n- fix use of dist tag in yarn-project\n- add nightly tag flow\n- add issue for moving everything to nightly",
          "timestamp": "2025-03-05T17:33:11Z",
          "tree_id": "5cf4d6672999b6a448d7e9c66da928cf4b5dd390",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c1daa11be668d5a85b39a82ce18b81745d2a283e"
        },
        "date": 1741198182978,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18332.599569999955,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16030.796683000002 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18846.680727999912,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16354.416469 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4021.972594999852,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3113.3686700000003 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54998.825232,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54998826000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10348.066354,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10348068000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1922777682,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1922777682 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 216331240,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 216331240 ns\nthreads: 1"
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
          "id": "6921f4674864a1ea8f1e61b96f9c3a4014a555b0",
          "message": "feat: Enrich env vars based on network option (#12489)\n\nThis PR (re-)introduces the `--network` option to set pre-defined static\nconfiguration\n\n---------\n\nCo-authored-by: Santiago Palladino <santiago@aztecprotocol.com>",
          "timestamp": "2025-03-05T17:41:34Z",
          "tree_id": "2b6e8fe67ae07ff29b39c045b53c0502e427a84c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/6921f4674864a1ea8f1e61b96f9c3a4014a555b0"
        },
        "date": 1741199709891,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18370.58510399993,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16275.857171999998 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18805.190018999838,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16436.874335999997 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3922.511423999822,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3142.011493 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55316.815415,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55316816000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10442.604322000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10442608000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1887050812,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1887050812 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 214128643,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 214128643 ns\nthreads: 1"
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