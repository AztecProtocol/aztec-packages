window.BENCHMARK_DATA = {
  "lastUpdate": 1741341933637,
  "repoUrl": "https://github.com/AztecProtocol/aztec-packages",
  "entries": {
    "C++ Benchmark": [
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