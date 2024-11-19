window.BENCHMARK_DATA = {
  "lastUpdate": 1732041895661,
  "repoUrl": "https://github.com/AztecProtocol/aztec-packages",
  "entries": {
    "C++ Benchmark": [
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
          "id": "1a41d42852ea2d7cdcb9f75387342783e1632b11",
          "message": "feat: Encode static error strings in the ABI (#9552)\n\nAvoids embedding revert string in circuits. Instead, static string\r\nerrors get a specific selector, and they are encoded in the ABI. We use\r\nnoir_abi to resolve those messages in the error case.\r\n\r\n---------\r\n\r\nCo-authored-by: Tom French <15848336+TomAFrench@users.noreply.github.com>",
          "timestamp": "2024-11-04T10:51:26+01:00",
          "tree_id": "b2a643b246444d2efd81eea9d8e149500e4cec7b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1a41d42852ea2d7cdcb9f75387342783e1632b11"
        },
        "date": 1730715464314,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29042.35773900001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27261.634533000004 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5338.293532000009,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4969.760267000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 85756.479286,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 85756482000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15192.176764,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15192176000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2489617799,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2489617799 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 125309097,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 125309097 ns\nthreads: 1"
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
          "id": "dedbe402640c13cfa1ec4198f35caaeb4d27e929",
          "message": "chore: redo typo PR by leopardracer (#9705)\n\nThanks leopardracer for\r\nhttps://github.com/AztecProtocol/aztec-packages/pull/9700. Our policy is\r\nto redo typo changes to dissuade metric farming. This is an automated\r\nscript.\r\n\r\nCo-authored-by: Tom French <tom@tomfren.ch>",
          "timestamp": "2024-11-04T10:49:08Z",
          "tree_id": "dd5f4348fdf079f27420d080506f3637f805380e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/dedbe402640c13cfa1ec4198f35caaeb4d27e929"
        },
        "date": 1730718562470,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29090.758538999977,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27289.702443 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5334.509251000014,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5011.096837 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 86175.94695,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 86175948000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15226.740174999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15226741000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2483381777,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2483381777 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126815731,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126815731 ns\nthreads: 1"
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
          "id": "29724f3f2db5a3b6e399e54a9a84af8686807fb6",
          "message": "feat(avm)!: byte indexed PC (#9582)\n\nThis PR moves the AVM to use byte-indexed PCs\n* Modifies the transpiler to remap brillig PCs\n* Modifies the simulator to use byte indexed PCs\n* Modifies witgen and circuit to use byte indexed PCs\n\nWhy are we doing this?\n* Needed for bytecode decomposition in the circuit.\n* Allow storing other stuff besides code in a contract, and then be able to use it in memory with an opcode \"CODECOPY\" or similar.\n\n---\n\nA note on how PCs are mapped in the transpiler: we do 2 passes. First we translate all instructions and leave brillig location operands as `BRILLIG_LOCATION`. On a second pass, since now we know the structure of the program and the brillig=>AVM pcs, we replace those.\n\nThere are a few big caveats\n1. ~Since the JUMP(I) and INTERNALCALL operands are U16, we cannot jump or call a location bigger than 2^16. This effectively constrains the contract size to 65kB.~ We use 32 bit jumps now.\n2. We can do the transformation in (only) 2 passes because we only have 1 variant of JUMP etc. Suppose we had an 8 bit variant, or a 32 bit variant, then we wouldn't know which one to use until the original PC has been mapped, but that itself can change the size of the instructions and trigger a remapping!\n\nSolutions?\n* For (1) I might propose having relative jumps JUMP(I)R with 8 and 16 bit variants, and an absolute JUMP with 32 bits.\n* For (2) we might just need to remap until there is no change.\n\nPart of #9059.",
          "timestamp": "2024-11-04T15:39:43Z",
          "tree_id": "bcd4ea9a7f7111839762c52d05ad28fb4d0c6db1",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/29724f3f2db5a3b6e399e54a9a84af8686807fb6"
        },
        "date": 1730736364670,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29020.685466000003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27539.080553 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5353.214475999991,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5042.800747 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 85778.77153299999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 85778774000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15085.014893,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15085015000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2495160654,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2495160654 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126926626,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126926626 ns\nthreads: 1"
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
          "id": "76328ebe88fd1d9dbb041be8cc1692516ed7d2d2",
          "message": "feat: track active accumulator rows and leverage in IVC folding (#9599)\n\nIf the IVC accumulator does not make use of the full capacity of a given\r\nblock, there will be some number of unused/empty rows at the end of the\r\nblock. We have a mechanism to skip performing relation work at such rows\r\nbut we sometimes still perform relatively expensive operations like\r\n`get_row()` on them. This additional overhead can become very\r\nsignificant if the total accumulator content is much smaller than the\r\nstructured trace size. We can avoid a lot of unnecessary work on these\r\nempty rows by tracking the \"active ranges\" of the execution trace, i.e.\r\nthe regions of the accumulator which correspond to non-zero relation\r\ncontributions.\r\n\r\nThis PR introduces a class `ExecutionTraceUsageTracker` for tracking the\r\nactive regions of the accumulator and computing efficient distribution\r\nof the execution trace rows according to actual content in the\r\nmultithreading context. This logic is leveraged in the combiner and\r\nperturbator computations but can potentially be introduced in other\r\nplaces as well.\r\n\r\nSome high level numbers for the current benchmark case but with the 2^19\r\ncircuit replaced with another 2^17 circuit (i.e. ~2^17 worth of content\r\nin a 2^19 ambient trace)\r\n\r\nMaster:\r\n```\r\nClientIVCBench/Full/6      27137 ms        23345 ms\r\n\r\ncompute_combiner(t)                     5826   22.12%\r\ncompute_perturbator(t)                  2295    8.71%\r\n```\r\n\r\nBranch:\r\n```\r\nClientIVCBench/Full/6      23247 ms        21532 ms\r\n\r\ncompute_combiner(t)                     2804   12.49%\r\ncompute_perturbator(t)                  1522    6.78%\r\n```",
          "timestamp": "2024-11-04T13:43:50-07:00",
          "tree_id": "fa3e3024a8e97eeb035328d8964d6358912c2efe",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/76328ebe88fd1d9dbb041be8cc1692516ed7d2d2"
        },
        "date": 1730754623864,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28490.763504,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27135.315661 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5322.7271650000175,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4954.578381 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 83361.85947200001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 83361861000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15226.426286999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15226427000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2506871906,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2506871906 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 129457965,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 129457965 ns\nthreads: 1"
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
          "id": "1a935d091cfad0e4861ec840a59372fdf177518d",
          "message": "feat: IPA Accumulation implementation (#9494)\n\nAdds new functions to the IPA class that accumulate two IPA claims in\r\ncircuit, and does prover work to prove new accumulated IPA claim.\r\n\r\nAlso adds new tests for IPA recursion. The new RecursiveSmall test\r\nallowed us to find a subtle bug in IPA where one value was not being\r\nnegated, leading to an incorrect identity. This was not caught\r\npreviously because this value, the evaluation, was always 0 in the\r\nexisting tests, as Shplonk always sets it to 0.",
          "timestamp": "2024-11-04T21:21:42Z",
          "tree_id": "f937b36073a84d8645cdf4f4df3b0a7ec0843ce6",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1a935d091cfad0e4861ec840a59372fdf177518d"
        },
        "date": 1730757644650,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28611.32545799998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27217.204361 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5346.0542790000145,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5044.609014 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 83664.27564600001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 83664278000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15115.154873,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15115154000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2481250970,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2481250970 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 127502136,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 127502136 ns\nthreads: 1"
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
          "id": "1779c42c3dfed9a1d433cd0c6f8400a14612e404",
          "message": "chore(docs): authwit note, not simulating simulations (#9438)\n\nAdds notes to the docs that indicate that authwits only work in single\r\nplayer mode, describes the problems with not simulating simulations, and\r\nupdates the bberg readme install instructions\r\n\r\ncloses https://github.com/AztecProtocol/dev-rel/issues/422\r\ncloses https://github.com/AztecProtocol/dev-rel/issues/433\r\ncloses https://github.com/AztecProtocol/aztec-packages/issues/9256\r\ncloses https://github.com/AztecProtocol/dev-rel/issues/423\r\ncloses https://github.com/AztecProtocol/aztec-packages/issues/6865",
          "timestamp": "2024-11-05T14:53:03Z",
          "tree_id": "00f67e9c21790c0d17ddec54ff723e4c65a5ea40",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1779c42c3dfed9a1d433cd0c6f8400a14612e404"
        },
        "date": 1730820024474,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28622.92541100001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 26978.376987999996 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5414.052170999995,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5119.403296 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 83804.73116899999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 83804734000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15126.040959999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15126040000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2493345289,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2493345289 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 128300439,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 128300439 ns\nthreads: 1"
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
          "id": "d7ee6e5cffba32ef141e717aeaf83f56a9af92b5",
          "message": "feat: recursive verifier for decider and last folding proof (#9626)\n\nConstruct the _hiding_ circuit, which recursively verifies the last\r\nfolding proof and the decider proof in Client IVC and amend the e2e\r\nprover accordingly. The ClientIVC proof becomes a mega proof for the\r\nhiding circuit and a goblin proof which simplifies the work required to\r\ntransform this in a zero knowledge proof.",
          "timestamp": "2024-11-05T17:46:52Z",
          "tree_id": "74adc6396dd0a9021d0d14f5c6d565e7de0dd938",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d7ee6e5cffba32ef141e717aeaf83f56a9af92b5"
        },
        "date": 1730830462829,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29714.081709999988,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27804.966084 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5329.58219599999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4987.222974 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 88247.460294,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 88247463000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15040.724782999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15040725000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3035963802,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3035963802 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 145350192,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 145350192 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "wraitii@users.noreply.github.com",
            "name": "Lancelot de Ferrière",
            "username": "wraitii"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "047a96431f7f34f16fa1ad6cb21e652645378d93",
          "message": "Rename DISABLE_TBB flag and disable on MacOS by default (#9747)\n\nPer #9746 , mac os compilation on ARM fails by default because of\r\n`std::execution::par_unseq`.\r\n\r\nThis PR fixes that by explicitly disabling it on MacOS since apple clang\r\ndoesn't support it. There's probably a better plug somewhere but I'm not\r\nultra-familiar with how you setup the build system, should this be a\r\npreset, should this be based on apple-clang specifically, etc. Can adapt\r\nthe PR as needed.\r\n\r\nI also rename DISABLE_TBB here because it seems to me that this should\r\nbe part of the native C++20 support on other platforms, but I have to\r\nadmit I'm really unfamiliar with the details here and I'm not sure if\r\nintel TBB is needed, or indeed what it does exactly. Can cut this from\r\nthe PR.\r\n\r\nLikewise, this turns parallel algorithms ON by default on the same C++20\r\nassumption, but that could well not work.",
          "timestamp": "2024-11-05T14:14:13-05:00",
          "tree_id": "9a600aa0a879b587fb52cb20fd98819c85f3410f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/047a96431f7f34f16fa1ad6cb21e652645378d93"
        },
        "date": 1730836209872,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29834.218410999994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27822.74104 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5390.001780000006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4985.522631 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 88529.81214400001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 88529814000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15196.312047000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15196313000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3028439701,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3028439701 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 143016636,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 143016636 ns\nthreads: 1"
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
          "id": "c95e5fd5606b7f14b1e2e43ecc770d5f22d294a0",
          "message": "feat: constify eccvm and translator (#9661)\n\nMakes the proof size of ECCVM constant by making the sumcheck gate\r\nchallenges and IPA constant.\r\nFixes the ECCVM recursive verifier size (besides the MSM in the IPA\r\nRecursive verifier) as a result.\r\n\r\nCloses https://github.com/AztecProtocol/barretenberg/issues/1009.",
          "timestamp": "2024-11-07T00:38:15Z",
          "tree_id": "47904449d423103db6c7d9916d08c11be481026d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c95e5fd5606b7f14b1e2e43ecc770d5f22d294a0"
        },
        "date": 1730941845213,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29939.250129999975,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 28122.691898 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5468.394803000009,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5100.773519999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 89269.495561,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 89269498000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15324.819712,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15324820000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3065985947,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3065985947 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 141622772,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 141622772 ns\nthreads: 1"
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
          "id": "f1cdc2d981ef01fda9b14c6803e014e546b71b66",
          "message": "feat: prove openings of masking polynomials in ECCVM and Translator (#9726)\n\nAs a part of ZK-fication of Honk, we have to mask the evaluations of\r\nround univariates that the prover sends to the verifier. The evaluations\r\nwere masked in Sumcheck in PR #7517. However, the logic for proving\r\nevaluations of Libra masking polynomials was missing. This PR fixes this\r\nissue and enables efficient batch opening of these polynomials.\r\n* Added necessary logic to Shplonk Prover, Shplemini Prover, and\r\nShplemini Verifer\r\n* Better handling of the ZKSumcheckData\r\n* Removed methods and reverted changes that became obsolete because of\r\nthe new ZK strategy\r\n* Enabled the opening of Libra masking univariates in ECCVM and\r\nTranslator",
          "timestamp": "2024-11-07T13:49:28+01:00",
          "tree_id": "6db3c13447821efa49b81958acc6d748664aa722",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f1cdc2d981ef01fda9b14c6803e014e546b71b66"
        },
        "date": 1730987662007,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28969.964099000008,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27196.955198 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5355.7751499999995,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5045.276693 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 84466.67342,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 84466675000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15143.665224999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15143665000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3028019317,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3028019317 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 142482395,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 142482395 ns\nthreads: 1"
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
          "id": "ae7cfe72b5c528fb533040c6da62c9b21f542f8b",
          "message": "feat: Constrain App function VKs (#9756)\n\nResolves https://github.com/AztecProtocol/aztec-packages/issues/9592\r\n - Now contract artifacts must have VKs in their private functions\r\n- aztec-nargo inserts the verification keys after public function\r\ntranspilation\r\n - We no longer derive any VK in the TX proving flow\r\n - App VKs are now constrained in the private kernels\r\n - Bootstrap generates VKs for all apps (with s3 caching)\r\n- PXE is currently accepting any VK present in the artifact as valid: we\r\nshould explore the correct interface for this in the future and wether\r\nPXE can use those VKs without rederiving them from ACIR",
          "timestamp": "2024-11-07T15:50:24+01:00",
          "tree_id": "e9edc777ef9b34bdddfdb350b69df91183410e99",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ae7cfe72b5c528fb533040c6da62c9b21f542f8b"
        },
        "date": 1730992603297,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29125.051237000007,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27334.133822000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5407.657706000009,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5114.600949 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 85774.64096400002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 85774642000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15354.471928,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15354472000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3031771018,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3031771018 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 144134174,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 144134174 ns\nthreads: 1"
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
          "id": "d77e473219d1628b2045100a55c4073f9fa32c25",
          "message": "feat: Origin Tags part 3 (Memory) (#9758)\n\nThis PR:\r\n1. Adds Origin Tags for tracking dangerous interactions to all stdlib\r\nmemory primitives\r\n2. Expands  the tests from TwinRomTable\r\n3. Fixes a bug with the use of nonnormalized value.",
          "timestamp": "2024-11-07T17:01:08Z",
          "tree_id": "8e12e5f17236c375fdbaf23660cd5ee3fe7fb500",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d77e473219d1628b2045100a55c4073f9fa32c25"
        },
        "date": 1731000699105,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29103.202828999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27223.105461 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5404.776381000005,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5021.919111000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 84476.774951,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 84476778000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15177.788907000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15177789000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3079377835,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3079377835 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 144600039,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 144600039 ns\nthreads: 1"
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
          "id": "46603810b149ef7f03c220d11d6dfd395cf550e0",
          "message": "feat: introduce avm circuit public inputs (#9759)",
          "timestamp": "2024-11-07T19:14:13Z",
          "tree_id": "45f1042bf52906b72284a9d7eb1935fde8c26dac",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/46603810b149ef7f03c220d11d6dfd395cf550e0"
        },
        "date": 1731008467145,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29188.23021200001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27286.503976000004 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5398.220129999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5037.958326 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 84802.44103599999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 84802443000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15251.909859000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15251910000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3074022966,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3074022966 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 146405492,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 146405492 ns\nthreads: 1"
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
          "id": "0ebd52e5dd326fcbebe38869908dfcb4c2ba2c03",
          "message": "chore: rename aggregation object to pairing point accumulator (#9817)\n\nRenames aggregation object/recursive proof to pairing point accumulator,\r\nso its not confusing with introduction of the IPA accumulator.",
          "timestamp": "2024-11-07T23:39:38-05:00",
          "tree_id": "53ef72e4d45e268458f2ada63576e77c7ff87c00",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0ebd52e5dd326fcbebe38869908dfcb4c2ba2c03"
        },
        "date": 1731042416321,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29056.599215000006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27452.107747 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5378.682103999992,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4964.83385 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 84033.011787,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 84033013000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15202.014919999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15202015000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3055229967,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3055229967 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 144531751,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 144531751 ns\nthreads: 1"
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
          "id": "2096dc236c627cfd802ca05e0c9cb0ea6c441458",
          "message": "feat: mega zk features (#9774)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\r\nline.",
          "timestamp": "2024-11-08T11:02:04Z",
          "tree_id": "a888823ffdf63573a624ef8b4da9fa01c7708dcd",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/2096dc236c627cfd802ca05e0c9cb0ea6c441458"
        },
        "date": 1731065650306,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28950.799380000008,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27114.458366000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5326.826313999987,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5027.111476 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 83631.167586,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 83631169000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15102.462676,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15102463000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3031255832,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3031255832 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 143518782,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 143518782 ns\nthreads: 1"
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
          "id": "9bc5a2f02852d6187a597612e8459ee305f3e198",
          "message": "feat: send G_0 in proof to reduce tube size (#9766)\n\nRemoves the G^0 MSM computation from the recursive verifier and instead\r\nincludes it in the proof.\r\n\r\nAdds test to ensure that IPA recursive verifier is a fixed circuit no\r\nmatter the ECCVM size.\r\n\r\nFor the command: `FLOW=prove_then_verify_tube ./run_acir_tests.sh\r\nfold_basic`, which has 6 circuits:\r\nTube gates before constification and before MSM removal: 7104756\r\nTube gates after: 4172057\r\n\r\nFor the ClientTubeBase test with 8 circuits, we see:\r\nTube before: 10047313\r\nTube gates after: 4172057",
          "timestamp": "2024-11-08T17:19:56Z",
          "tree_id": "07cf9d21739c6b59f9ada7f035a7212c4a667a17",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9bc5a2f02852d6187a597612e8459ee305f3e198"
        },
        "date": 1731088151813,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29085.58440500002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27432.566016000004 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5362.79236,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5051.22747 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 84704.85629000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 84704858000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15168.484659000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15168484000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3061653904,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3061653904 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 143607197,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 143607197 ns\nthreads: 1"
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
          "id": "90696cd0e126d7db3c4ef396ada4bddd3ac0de73",
          "message": "feat: bb.js tests of ClientIVC (#9412)\n\nExtend the ivc-integration-tests suite to execute tests through the\r\nwasm and the browser. When run, these tests give both memory and time logs. We should\r\nmake these easier to read, but for now they're very useful.",
          "timestamp": "2024-11-08T17:44:33Z",
          "tree_id": "5783a8e3d0c33cf1924d0f1e33e34b7048c61f68",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/90696cd0e126d7db3c4ef396ada4bddd3ac0de73"
        },
        "date": 1731090058955,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29166.603784000017,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27448.519479 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5350.589461999988,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5013.155016 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 84217.63666399999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 84217637000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15210.690980000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15210692000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3068862398,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3068862398 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 144145031,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 144145031 ns\nthreads: 1"
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
          "id": "23ff5186a4c8905bd35753c1e6536d3b5504a5f0",
          "message": "feat: zk shplemini (#9830)\n\nWe achieve ZK in Shplemini as follows. Before batching the multilinear\r\nevaluation claims obtained as the sumcheck output, the Gemini prover\r\n* creates a random polynomial M of the circuit size;\r\n* commits to M using KZG/IPA, sends the commitment to the verifier;\r\n* evaluates M at the sumcheck challenge, sends the evaluation to the\r\nverifier.\r\n\r\nThe verifier simply adds this new commitment and the appropriate scalar\r\nmultiplier to the BatchOpeningClaim.",
          "timestamp": "2024-11-08T19:27:30Z",
          "tree_id": "b5a588d61a6a359ca110cade852f5bbac1c781cd",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/23ff5186a4c8905bd35753c1e6536d3b5504a5f0"
        },
        "date": 1731096043211,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29338.99260800001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27494.75631 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5394.35410900002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4997.728759000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 85229.531745,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 85229533000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15295.763227,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15295765000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3143603202,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3143603202 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 146374702,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 146374702 ns\nthreads: 1"
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
          "id": "9978c9742c7b2b27c9ba813ddb66125a0ca57e6b",
          "message": "fix: Fix mac build by calling `count` on durations (#9855)\n\nWe can print `std::chrono` durations our usual PR test builds but not on\r\nmac. Should fix the mac build if this is the only issue.",
          "timestamp": "2024-11-08T14:50:47-05:00",
          "tree_id": "72ff24fcc8bb626ec0b15f2c3caab844d0aa0fe2",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9978c9742c7b2b27c9ba813ddb66125a0ca57e6b"
        },
        "date": 1731097470773,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29200.477396999988,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27328.013704 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5364.017490999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5049.377902000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 85561.04518799999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 85561046000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15278.799444999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15278801000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3103869811,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3103869811 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 145279080,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 145279080 ns\nthreads: 1"
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
          "id": "23c122d36091b3b756084584ecba59b800196d58",
          "message": "fix: tree heights that last past 3 days (#9760)\n\nThe L1-L2 message tree height was a bottleneck running \r\n```\r\npost-mortem of 1-validator network (bot set to 0.05 TPS, 1 private / 2 public transfers per tx)\r\nLasted long, got to block 4091, last tried to propose block 4097\r\nHit issues and did not reorg past them\r\nRoot issue (guess):\r\n2024-11-05 08:32:53.148\tError assembling block: 'Error: Failed to append leaves: Tree is full'\r\n```\r\nAlso updated tree heights with constants proposed by @iAmMichaelConnor\r\nhere (https://github.com/AztecProtocol/aztec-packages/issues/9451)\r\n(thanks for the thoughtful analysis I could lazily steal!\r\nAutomated test is a bit awkward here or I'd write one. It'd either\r\ntrivially pass or have to go through 3-days worth of transactions.",
          "timestamp": "2024-11-08T18:07:54-05:00",
          "tree_id": "717c13b8c0bf4ff4d68f3ea9a779308514765576",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/23c122d36091b3b756084584ecba59b800196d58"
        },
        "date": 1731109316584,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29099.553415000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27115.808192000004 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5365.781077999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5025.194563999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 84549.91017500001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 84549912000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15084.447399000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15084448000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3111354952,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3111354952 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 143330783,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 143330783 ns\nthreads: 1"
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
          "id": "ada3e3aba6141411a8ca931f45cc2b9b7027585e",
          "message": "feat(avm): mem specific range check (#9828)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\r\nline.",
          "timestamp": "2024-11-11T10:57:15Z",
          "tree_id": "b72f2e4182152f6fd5ce013d26d6d63e62606520",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ada3e3aba6141411a8ca931f45cc2b9b7027585e"
        },
        "date": 1731325174204,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29082.425795000006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27200.003416 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5412.617542000006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5057.10957 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 84928.89053900001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 84928892000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15122.277098999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15122278000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3138671870,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3138671870 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 145685610,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 145685610 ns\nthreads: 1"
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
          "id": "b6216033b567e0d743e17c37754a20f9c893aa0e",
          "message": "fix: fix bad merge (#9892)",
          "timestamp": "2024-11-11T17:35:20Z",
          "tree_id": "9fb50fcd79e0e2f100d5a1b67358ed4f592bed71",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/b6216033b567e0d743e17c37754a20f9c893aa0e"
        },
        "date": 1731348859348,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28872.60325699998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27152.669127 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5330.3856,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5042.051134 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 84982.542073,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 84982543000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15149.257878000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15149259000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3110753920,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3110753920 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 144173219,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 144173219 ns\nthreads: 1"
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
          "id": "52ae4e1710d07aca497de723294f7b7c0100b479",
          "message": "feat: Stop with HeapVector (#9810)\n\nUpdates the Brillig stop opcode to return a HeapVector (pointer +\r\ndynamic size). Also changes the transpiler, simulator and witness gen of\r\nthe AVM to support it.",
          "timestamp": "2024-11-12T10:48:00+01:00",
          "tree_id": "803e7af38f86d95af4f08cec3ac224d3ca1c2e33",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/52ae4e1710d07aca497de723294f7b7c0100b479"
        },
        "date": 1731406229347,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29101.755018000007,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27303.958217000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5378.694405000005,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5080.480593000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 85260.90027400001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 85260901000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15206.629582,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15206629000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3121214461,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3121214461 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 143752589,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 143752589 ns\nthreads: 1"
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
          "id": "1a9c5ce385c7db2e488831dcd7dc3bedfc02f74a",
          "message": "feat(avm): gas specific range check (#9874)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\r\nline.",
          "timestamp": "2024-11-12T10:01:24Z",
          "tree_id": "3bf40be615053456e2f14363e1fd7861eb12b7ab",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1a9c5ce385c7db2e488831dcd7dc3bedfc02f74a"
        },
        "date": 1731407722850,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28905.950902,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27187.59208 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5392.083714999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5059.772726 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 84732.686959,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 84732688000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15115.169393,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15115170000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3108480080,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3108480080 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 144336356,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 144336356 ns\nthreads: 1"
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
          "id": "abdd912bd0d3cf9a8e09339a3766c61eea712ede",
          "message": "fix(avm): derive unencrypted log in test (#9813)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\r\nline.",
          "timestamp": "2024-11-12T14:26:53+01:00",
          "tree_id": "8fb30133b6d36748b1d0e6f7f22c3bd685bd9cec",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/abdd912bd0d3cf9a8e09339a3766c61eea712ede"
        },
        "date": 1731419474640,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28854.566656999992,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27154.555409 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5358.253938000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5053.039269 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 84257.61815400001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 84257619000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15180.245385,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15180247000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3096817133,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3096817133 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 143701329,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 143701329 ns\nthreads: 1"
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
          "id": "eac5fb5f30997364bf45262f898cfeedb97b1a71",
          "message": "feat(avm): tag checking, raising errors and stop execution (#9831)\n\nResolves #9745",
          "timestamp": "2024-11-12T15:46:27+01:00",
          "tree_id": "65bd818830207f15b66f08ad5ab50e511d78e099",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/eac5fb5f30997364bf45262f898cfeedb97b1a71"
        },
        "date": 1731424409839,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29011.07705000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27156.790967999998 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5379.714854,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5066.663824999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 84370.02596,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 84370027000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15107.872323999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15107873000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3117518911,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3117518911 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 142316017,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 142316017 ns\nthreads: 1"
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
          "id": "de6564e8374d6d546e0fccbb0429d6c12e828ab3",
          "message": "feat: Add Origin Tags to cycle group (#9879)\n\nAdds Origin Tag support (mechanism for tracking dangerous interactions\r\nof stdlib primitives) to cycle_group",
          "timestamp": "2024-11-12T15:12:53Z",
          "tree_id": "c8af4959a6ed54e2f59eade788d5ca5595c64832",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/de6564e8374d6d546e0fccbb0429d6c12e828ab3"
        },
        "date": 1731426834728,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28845.67156099999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 26976.581123 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5336.046377999992,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5042.269751000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 85162.577345,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 85162578000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15221.214948,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15221216000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3098999696,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3098999696 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 144607377,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 144607377 ns\nthreads: 1"
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
          "id": "e305f488b1502630f299bb03cf169770f2f6af09",
          "message": "chore: Update Barretenberg README with matching nargo versions (#9908)\n\nAdds missing compatible bb, nargo versions",
          "timestamp": "2024-11-12T17:42:24Z",
          "tree_id": "12c6d99f0af5d9939d2cd0cf2fecb748be693718",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e305f488b1502630f299bb03cf169770f2f6af09"
        },
        "date": 1731434717955,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28913.54280500002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27105.450611 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5336.497414999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5008.136576999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 84550.51721500001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 84550517000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15300.120095,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15300122000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3099786662,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3099786662 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 141827384,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 141827384 ns\nthreads: 1"
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
          "id": "8d49e5963092548d31a901a693a1653d3151d114",
          "message": "feat(avm):  hinting merkle trees (#9658)",
          "timestamp": "2024-11-12T20:12:00Z",
          "tree_id": "cf547de568efa8fb12efded2e33adc9c32d76eb7",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8d49e5963092548d31a901a693a1653d3151d114"
        },
        "date": 1731443686250,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28816.5472,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27049.055808 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5356.700153999995,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5024.715005000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 85824.665226,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 85824666000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15250.899986,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15250901000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3117147751,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3117147751 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 143442566,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 143442566 ns\nthreads: 1"
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
          "id": "59376d499278eec3ddf4ee9fbb64ba2c83f9b8df",
          "message": "feat(avm): non-field sized cmp circuit ops (#9895)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\r\nline.",
          "timestamp": "2024-11-12T20:14:40Z",
          "tree_id": "8c82190071ba805f70783475523879906336fdea",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/59376d499278eec3ddf4ee9fbb64ba2c83f9b8df"
        },
        "date": 1731444506523,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28886.034411999986,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27184.511881000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5393.9771349999855,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5088.801480000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 84831.46651599999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 84831467000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15231.197101000003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15231197000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3100509583,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3100509583 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 144427186,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 144427186 ns\nthreads: 1"
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
          "id": "9325f6ff987022da1a4dabb771781cdc999af18e",
          "message": "feat: mock data for IVC (#9893)\n\nIncremental work towards a write_vk flow for kernel circuits. kernel\r\ncircuits are generated from acir via the method\r\n`acir_format::create_kernel_circuit()` which takes as input the raw acir\r\ndata plus a ClientIvc instance containing the proofs to be recursively\r\nverified in that circuit (Oink/PG + merge). In the context of VK\r\ngeneration, those proofs are not yet known, so the IVC state has to be\r\nmocked. This PR adds such functionality but only for the oink case (i.e.\r\nthe state of the IVC after accumulating the first app which only calls\r\nthe pink prover). Equivalent logic for mocking the state after\r\nsubsequent accumulations will be handled in a follow on.",
          "timestamp": "2024-11-12T14:39:30-07:00",
          "tree_id": "ec55eac7301c947e731b20dbf5b80db296cd89e4",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9325f6ff987022da1a4dabb771781cdc999af18e"
        },
        "date": 1731450058671,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28726.523216999994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27126.963959999997 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5342.71464199999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5051.560577 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 84599.24814899999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 84599249000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15201.274542999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15201275000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3102320973,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3102320973 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 142073295,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 142073295 ns\nthreads: 1"
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
          "id": "3889deffe372c94b2a38e465e89f6babbee18fec",
          "message": "chore: add end_gas_used to avm public inputs (#9910)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\r\nline.",
          "timestamp": "2024-11-13T11:20:29Z",
          "tree_id": "395eb4ea9d58948530725fc3af1808c2ab36fc37",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/3889deffe372c94b2a38e465e89f6babbee18fec"
        },
        "date": 1731499550065,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29439.29619399998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27644.541277999997 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5778.846983999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5355.351254 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 85808.149449,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 85808150000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15513.028964000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15513029000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3200887107,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3200887107 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 143113934,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 143113934 ns\nthreads: 1"
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
          "id": "fc27eafaaa471e888805c785066f361f0da15298",
          "message": "feat: naive attempt to bind the honk solidity verifier function to the ts interface (#9432)\n\nAttempts to plumb the honk solidity verifier into the WASM output and\r\nexpose it in the ts API",
          "timestamp": "2024-11-13T14:20:47+01:00",
          "tree_id": "ab344098e7e6e7251738f810ffada0fe0c9e7381",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/fc27eafaaa471e888805c785066f361f0da15298"
        },
        "date": 1731506649834,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28818.745078999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 26819.430010999997 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5344.8635560000075,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4970.529963 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 85111.584661,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 85111586000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15179.080876,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15179081000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3102272849,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3102272849 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 142375069,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 142375069 ns\nthreads: 1"
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
          "id": "d8db656980c09ad219c375e831443bd523100d4b",
          "message": "chore(avm): bugfixing witness generation for add, sub, mul for FF (#9938)",
          "timestamp": "2024-11-13T20:15:38+01:00",
          "tree_id": "cffc65c0ae6d54fd926c67fc0784c29522f23814",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d8db656980c09ad219c375e831443bd523100d4b"
        },
        "date": 1731526741238,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28815.428674000003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27248.134212 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5341.941288000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4998.441659 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 84529.191735,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 84529193000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15179.100264,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15179102000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3087761895,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3087761895 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 144162870,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 144162870 ns\nthreads: 1"
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
          "id": "ca050b837a46aa870fb8850ed0d8aaaad4e758ee",
          "message": "chore: Use stack based recursion instead of function recursion (#9947)\n\nThis PR simply changes the world state writing process to use an\r\niterative approach rather than recursive approach to avoid possible\r\nstack overflow issues.",
          "timestamp": "2024-11-13T19:56:36Z",
          "tree_id": "c336df0d183306c074f22f14b0c95d4610a44735",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ca050b837a46aa870fb8850ed0d8aaaad4e758ee"
        },
        "date": 1731530218565,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28827.431716999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27066.058081 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5351.437112,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5025.352793000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 85015.199939,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 85015201000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15208.927354999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15208928000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3132336499,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3132336499 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 144213471,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 144213471 ns\nthreads: 1"
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
          "id": "f566503377298681ce8f1d9d9b8c3c026825e2a2",
          "message": "feat: change definition of lagrange last (#9916)\n\nUpdate the `lagrange_last` polynomial to take 1 at the idx of the last\r\nactive wire in the execution trace. This effectively translates the\r\nexisting checks in the permutation relation to this index rather than\r\nthe dyadic size and allows the permutation grand product to be computed\r\nonly up to this point. This is a precursor for kernel VKs that are\r\nindependent of the ambient trace size.\r\n\r\n---------\r\n\r\nCo-authored-by: maramihali <mara@aztecprotocol.com>",
          "timestamp": "2024-11-14T09:36:18-07:00",
          "tree_id": "0829325c3fcf718e257c3e7d7b9146e2255214e0",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f566503377298681ce8f1d9d9b8c3c026825e2a2"
        },
        "date": 1731604927055,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29002.258764000006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27013.756824999997 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4945.2317020000155,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4643.803013999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 91594.72820200001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 91594729000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 16645.137584000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16645138000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3110300801,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3110300801 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 136194915,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 136194915 ns\nthreads: 1"
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
          "id": "7e587d6d43cc28174d807c255f5270212a0b1c98",
          "message": "feat: Mega memory benchmarks (#9858)\n\nIt would be better to actually use Google Bench's memory manager\r\nfunctionality and count allocations. We already have something similar\r\nimplemented for Tracy. After striking out with that approach for a bit I\r\nreverted to just manually counting the size of the biggest vectors.\r\n\r\nThe PR uncovered this issue: some trace structures have unusable\r\ncapacity, not just due to using fewer than a dyadic number of gates, but\r\nalso because of coupling of certain gate types\r\nhttps://github.com/AztecProtocol/barretenberg/issues/1149\r\n\r\nSee https://github.com/AztecProtocol/aztec-packages/pull/9858 for logs of benchmarks.",
          "timestamp": "2024-11-14T12:55:05-05:00",
          "tree_id": "01db0a68ecaf92f9c73639b8affcdb42b719c94d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7e587d6d43cc28174d807c255f5270212a0b1c98"
        },
        "date": 1731608966181,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28809.260913000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27054.207663 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5348.5002859999895,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5004.099722 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 85480.902133,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 85480904000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15155.120836,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15155121000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3100063179,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3100063179 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 143841826,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 143841826 ns\nthreads: 1"
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
          "id": "37d7cd784bc6dfe366d1eabc2b7be8cca4359f7b",
          "message": "feat: split up eccvm proof into two proofs (#9914)\n\nSplits the IPA proof from the rest of the ECCVM proof.\r\n\r\nWe want the IPA proof to be separate from the rest of the ECCVM proof so\r\nwe don't have to run IPA accumulation in the tube and base rollup\r\ncircuits.",
          "timestamp": "2024-11-14T17:40:27Z",
          "tree_id": "1fdc1dc6b32ee8e4032cf419348e57dd4d8447b8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/37d7cd784bc6dfe366d1eabc2b7be8cca4359f7b"
        },
        "date": 1731609029749,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28836.814621,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27081.803125000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5359.435134999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4922.5056079999995 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 84297.451539,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 84297452000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15125.039399,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15125041000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3115200669,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3115200669 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 143619617,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 143619617 ns\nthreads: 1"
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
          "id": "e07cac7fee501a752d98ebf749f6cf31a3ff74af",
          "message": "feat: removed redundant scalar muls from the verifiers using shplemini (#9392)\n\n* Reduced the number of scalar multiplications to be performed by the\r\nnative and recursive verifiers running shplemini\r\n* Slightly re-shuffled the entities in Translator and ECCVM, so that\r\nentitied to be shifted and their shifts form contiguous ranges\r\n* This is useful for amortizing the verification costs in the case of ZK\r\nsumcheck\r\n* The Translator recursive verifier circuit is now around 820K gates as\r\nopposed to 1700K. For other Flavors, the numbers are not as dramatic,\r\nbut there's still around -10% in scalar muls and the sizes of recursive\r\nverifiers.",
          "timestamp": "2024-11-14T17:45:51Z",
          "tree_id": "88d95ab9112c5bd711011c3a33009c7926db3dfe",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e07cac7fee501a752d98ebf749f6cf31a3ff74af"
        },
        "date": 1731609326434,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29040.74306000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27278.916879 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5395.3953219999985,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5050.462557999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 85026.08741200001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 85026088000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15187.008895,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15187008000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3097128097,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3097128097 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 145080746,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 145080746 ns\nthreads: 1"
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
          "id": "8e74cd09a8b65c3903c91197d599e722518ab315",
          "message": "feat: IPA Accumulator in Builder (#9846)\n\nAdds IPA claim to builder, pk, vk, so that the verifier knows where to\r\nlook to extract the IPA claim from. Modifies the UltraRecursiveVerifier\r\nto extract out the IPA claim from the public inputs and return it.\r\n\r\nAlso modifies native verifier to check the IPA claim and proof.",
          "timestamp": "2024-11-19T05:21:43Z",
          "tree_id": "e7f5c30fb7982b0176e56d3af079d2894c4638dd",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8e74cd09a8b65c3903c91197d599e722518ab315"
        },
        "date": 1731995201827,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28695.85884200001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 26850.989653000004 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5329.152937999993,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4984.073034 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 85104.049495,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 85104050000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15234.621532999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15234621000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3122458267,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3122458267 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 142403142,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 142403142 ns\nthreads: 1"
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
          "id": "1acf4cfc28c72550f299d97493c7a4b33b4c5d7c",
          "message": "chore: remove public kernels (#10027)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\r\nline.",
          "timestamp": "2024-11-19T11:09:44Z",
          "tree_id": "cfcc2cb85cf45e38b826d94437c1a69a68ab3ed4",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1acf4cfc28c72550f299d97493c7a4b33b4c5d7c"
        },
        "date": 1732015950175,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28655.800502999995,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27119.88433 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5339.22649500002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4954.658189 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 83615.17206699999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 83615172000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15270.78894,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15270790000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3081395668,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3081395668 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 141400666,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 141400666 ns\nthreads: 1"
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
          "id": "30ca68c8435d7edf227206c61dd1ab4551514857",
          "message": "chore: remove duplicate and unused flavor related concepts (#10035)\n\nWe had two duplicate concepts pointing to the same set of types as well\r\nas some unused instantiations (we are not folding Ultra keys).",
          "timestamp": "2024-11-19T15:52:25Z",
          "tree_id": "08b3af492465e753aa4bd930096190e8ccee4039",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/30ca68c8435d7edf227206c61dd1ab4551514857"
        },
        "date": 1732033406905,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28737.781979999992,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27106.053698 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5341.448874000008,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5039.2126370000005 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 85510.94600399998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 85510947000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15357.449016999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15357450000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3058261682,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3058261682 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 139972577,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 139972577 ns\nthreads: 1"
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
          "id": "29a9ae3573fe1da63a2d6494a21266e20bbe22e4",
          "message": "fix: Fix inclusion path (#10034)\n\nThis PR fixes an inclusion path on MAC builds",
          "timestamp": "2024-11-19T17:07:09Z",
          "tree_id": "363c03324518916c161491b7fca83cd2892744e1",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/29a9ae3573fe1da63a2d6494a21266e20bbe22e4"
        },
        "date": 1732037971799,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28772.75939500001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27175.671934 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5524.970291000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5202.089446 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 84955.282194,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 84955283000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15274.521631,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15274522000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3072455707,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3072455707 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 140619437,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 140619437 ns\nthreads: 1"
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
          "id": "fd9e5bb6e6206ba0d6884aa58fa6c0ac814390c6",
          "message": "chore(master): Release 0.63.0",
          "timestamp": "2024-11-19T17:50:21Z",
          "url": "https://github.com/AztecProtocol/aztec-packages/pull/9651/commits/fd9e5bb6e6206ba0d6884aa58fa6c0ac814390c6"
        },
        "date": 1732039550498,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 31889.036616999987,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27323.013380000004 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 6051.361289000013,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5023.210092 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 92921.620828,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 92921621000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 17432.583856000005,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17432584000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3661328457,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3661328457 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 165822695,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 165822695 ns\nthreads: 1"
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
          "id": "ef1b5f19c28e548bf89966baad100335821a5642",
          "message": "chore(master): Release 0.63.0 (#9651)\n\nThis release is too large to preview in the pull request body. View the\r\nfull release notes here:\r\nhttps://github.com/AztecProtocol/aztec-packages/blob/release-please--branches--master--release-notes/release-notes.md",
          "timestamp": "2024-11-19T17:50:16Z",
          "tree_id": "9a55d61cbd85501e400ca1b590bcfb9a5b3e9ccb",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ef1b5f19c28e548bf89966baad100335821a5642"
        },
        "date": 1732040040335,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28790.434902999976,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27037.462185 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5355.348337999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5071.243148 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 85267.31836,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 85267319000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15288.297831,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15288299000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3085267436,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3085267436 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 142485989,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 142485989 ns\nthreads: 1"
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
          "id": "9b10f7f46755814cb8633cf55621faa8e9b37344",
          "message": "chore: Revert \"feat: IPA Accumulator in Builder\" (#10036)\n\nReverts AztecProtocol/aztec-packages#9846 due to a failure in the\r\nprover-full test",
          "timestamp": "2024-11-19T18:11:17Z",
          "tree_id": "012c7b28f2a006125323501e13d42088d13c0537",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9b10f7f46755814cb8633cf55621faa8e9b37344"
        },
        "date": 1732041887710,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28686.36669899999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27100.854763 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5340.372875999989,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5030.757033 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 84108.95021899999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 84108951000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15130.150371,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15130151000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3057516737,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3057516737 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 140582209,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 140582209 ns\nthreads: 1"
          }
        ]
      }
    ]
  }
}