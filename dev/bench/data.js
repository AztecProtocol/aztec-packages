window.BENCHMARK_DATA = {
  "lastUpdate": 1730190742984,
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
          "id": "8b2d7d9c962c975592e17424f4d0b70f9ca7acd4",
          "message": "fix(s3-cache): link extracted preset-release-world-state (#9252)",
          "timestamp": "2024-10-16T11:14:16Z",
          "tree_id": "84f0bf5b2af72bbf6f1b09852492ee7b1955f021",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8b2d7d9c962c975592e17424f4d0b70f9ca7acd4"
        },
        "date": 1729078812582,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29695.218789000024,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27958.715777 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5422.575045000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5048.906808 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 86870.473682,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 86870475000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15351.412733000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15351412000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2744479692,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2744479692 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 125757008,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 125757008 ns\nthreads: 1"
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
          "id": "df3710477fc7d2e7c44e62b116bea74d4e14f930",
          "message": "fix: bb bootstrap_cache.sh (#9254)",
          "timestamp": "2024-10-16T11:58:23Z",
          "tree_id": "abdfc7f3ab1e038b4155f0c5814f67b5ba4adfb2",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/df3710477fc7d2e7c44e62b116bea74d4e14f930"
        },
        "date": 1729081509305,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29615.027320999987,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27705.862782 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5423.02547700001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5089.955362 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 87651.414865,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 87651417000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15165.702234999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15165702000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2742838117,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2742838117 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 127327948,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 127327948 ns\nthreads: 1"
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
          "id": "5861d4e5e8a72161dac910e0bc8e635e0d332793",
          "message": "feat!: Brillig and AVM default all uninitialized memory cells to Field 0 (#9057)\n\nResolves (at least partially)\r\nhttps://github.com/AztecProtocol/aztec-packages/issues/7341\r\n\r\n---------\r\n\r\nCo-authored-by: TomAFrench <tom@tomfren.ch>\r\nCo-authored-by: Tom French <15848336+TomAFrench@users.noreply.github.com>",
          "timestamp": "2024-10-17T18:47:04+01:00",
          "tree_id": "330b326523492992e2b19350574c8fcbfcea3ec6",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5861d4e5e8a72161dac910e0bc8e635e0d332793"
        },
        "date": 1729189838219,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29460.31076700001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27434.260087 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5353.530108000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5020.622063 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 87407.416633,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 87407419000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15324.423383,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15324423000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2719566163,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2719566163 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 127038151,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 127038151 ns\nthreads: 1"
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
          "id": "17c612740dc3563321bf69c1760de1ef88b22124",
          "message": "feat: modify contract instance to include public keys (#9153)\n\nIn this PR we are doing the ground work for the new address scheme by\r\nmodifying the contract instance to include the full public keys instead\r\nof only the public keys hash. We need the full public keys because we\r\nneed to verify the preimage of the new address, which requires the ivpk,\r\nand we need to verify the ivpk's correctness by manually computing the\r\npublic keys hash.",
          "timestamp": "2024-10-17T16:45:12-05:00",
          "tree_id": "a808d71f357d7561b5ca75018984dab4d7d850c1",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/17c612740dc3563321bf69c1760de1ef88b22124"
        },
        "date": 1729203069176,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29588.701966,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 28107.555924 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5420.065596000015,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5075.373547000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 87251.83216800001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 87251834000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15297.473012,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15297474000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2726524051,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2726524051 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126683570,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126683570 ns\nthreads: 1"
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
          "id": "1f0538f00cadcf4325d2aa17bdb098d11ca3840f",
          "message": "chore!: remove pedersen hash opcode (#9245)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\r\nline.",
          "timestamp": "2024-10-18T05:38:11-04:00",
          "tree_id": "d6fc7e9d951892750575baf0b68ef208cab4e08e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1f0538f00cadcf4325d2aa17bdb098d11ca3840f"
        },
        "date": 1729247542017,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29509.603806999992,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27869.237587 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5334.4843959999935,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4990.720297999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 87065.722212,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 87065724000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15141.100145,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15141100000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2693538079,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2693538079 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 128809704,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 128809704 ns\nthreads: 1"
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
          "id": "1823bde2b486827f33a87899074594f811cfbef4",
          "message": "chore!: remove pedersen commitment (#9107)\n\nThis PR removes the pedersen hash opcode as it's not currently possible\r\nto emit these from noir code.",
          "timestamp": "2024-10-18T11:06:13Z",
          "tree_id": "eedcded7ae80b859d3211ed13e00140dd0abc132",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1823bde2b486827f33a87899074594f811cfbef4"
        },
        "date": 1729252055172,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29434.572143999987,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27923.794405999997 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5336.685785000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5015.803135 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 86898.329668,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 86898332000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15260.194918999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15260195000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2712013465,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2712013465 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 125696237,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 125696237 ns\nthreads: 1"
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
          "id": "ab0c80d7493e6bdbc58dcd517b248de6ddd6fd67",
          "message": "chore(master): Release 0.58.0 (#9068)\n\n:robot: I have created a release *beep* *boop*\r\n---\r\n\r\n\r\n<details><summary>aztec-package: 0.58.0</summary>\r\n\r\n##\r\n[0.58.0](https://github.com/AztecProtocol/aztec-packages/compare/aztec-package-v0.57.0...aztec-package-v0.58.0)\r\n(2024-10-18)\r\n\r\n\r\n### ⚠ BREAKING CHANGES\r\n\r\n* protocol contracts\r\n([#9025](https://github.com/AztecProtocol/aztec-packages/issues/9025))\r\n\r\n### Features\r\n\r\n* Modify contract instance to include public keys\r\n([#9153](https://github.com/AztecProtocol/aztec-packages/issues/9153))\r\n([17c6127](https://github.com/AztecProtocol/aztec-packages/commit/17c612740dc3563321bf69c1760de1ef88b22124))\r\n* Native tmux-based network e2e\r\n([#9036](https://github.com/AztecProtocol/aztec-packages/issues/9036))\r\n([f9fc73a](https://github.com/AztecProtocol/aztec-packages/commit/f9fc73a40f5b9d11ad92a6cee3e29d3fcc80425e))\r\n* Protocol contracts\r\n([#9025](https://github.com/AztecProtocol/aztec-packages/issues/9025))\r\n([f3bcff0](https://github.com/AztecProtocol/aztec-packages/commit/f3bcff0c0943d190261de366301ed8f9267543f3))\r\n* World state synchronizer reorgs\r\n([#9091](https://github.com/AztecProtocol/aztec-packages/issues/9091))\r\n([ba63b43](https://github.com/AztecProtocol/aztec-packages/commit/ba63b43c6e5c09ecda0ed94bdd3b875546400d27))\r\n\r\n\r\n### Miscellaneous\r\n\r\n* Added healthcheck and startup check\r\n([#9112](https://github.com/AztecProtocol/aztec-packages/issues/9112))\r\n([ffa012f](https://github.com/AztecProtocol/aztec-packages/commit/ffa012ffb1d0e72ddab68c066ca9e923bd1c0c2b))\r\n* Default logging level to debug if debug set\r\n([#9173](https://github.com/AztecProtocol/aztec-packages/issues/9173))\r\n([febf744](https://github.com/AztecProtocol/aztec-packages/commit/febf7449c80ffe44eaadb88c088e35fa419ed443))\r\n* Rename some prover env vars\r\n([#9032](https://github.com/AztecProtocol/aztec-packages/issues/9032))\r\n([e27ead8](https://github.com/AztecProtocol/aztec-packages/commit/e27ead85403d3f21ebc406e7d1a7e18190085603))\r\n</details>\r\n\r\n<details><summary>barretenberg.js: 0.58.0</summary>\r\n\r\n##\r\n[0.58.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg.js-v0.57.0...barretenberg.js-v0.58.0)\r\n(2024-10-18)\r\n\r\n\r\n### Features\r\n\r\n* Browser tests for UltraHonk\r\n([#9047](https://github.com/AztecProtocol/aztec-packages/issues/9047))\r\n([f0d45dd](https://github.com/AztecProtocol/aztec-packages/commit/f0d45dd8d0c00707cd18989c3a45ff0c3cbc92a6))\r\n* Docker_fast.sh\r\n([#9273](https://github.com/AztecProtocol/aztec-packages/issues/9273))\r\n([57e792e](https://github.com/AztecProtocol/aztec-packages/commit/57e792e6baaa2dfaef7af4c84d4ab75804c9d3de))\r\n* Use s3 cache in bootstrap fast\r\n([#9111](https://github.com/AztecProtocol/aztec-packages/issues/9111))\r\n([349f938](https://github.com/AztecProtocol/aztec-packages/commit/349f938601f7a4fdbdf83aea62c7b8c244bbe434))\r\n\r\n\r\n### Bug Fixes\r\n\r\n* Limit number of bb.js threads to 32\r\n([#9070](https://github.com/AztecProtocol/aztec-packages/issues/9070))\r\n([97e4b9b](https://github.com/AztecProtocol/aztec-packages/commit/97e4b9b2e0d37575b6b5e4c7a22f85b60d1f418b))\r\n* Make gate counting functions less confusing and avoid estimations\r\n([#9046](https://github.com/AztecProtocol/aztec-packages/issues/9046))\r\n([0bda0a4](https://github.com/AztecProtocol/aztec-packages/commit/0bda0a4d71ae0fb4352de0746f7d96b63b787888))\r\n* Reduce SRS size back to normal\r\n([#9098](https://github.com/AztecProtocol/aztec-packages/issues/9098))\r\n([a306ea5](https://github.com/AztecProtocol/aztec-packages/commit/a306ea5ffeb13019427a96d8152e5642b717c5f6))\r\n* Revert \"feat: use s3 cache in bootstrap fast\"\r\n([#9181](https://github.com/AztecProtocol/aztec-packages/issues/9181))\r\n([7872d09](https://github.com/AztecProtocol/aztec-packages/commit/7872d092c359298273d7ab1fc23fa61ae1973f8b))\r\n* Revert \"fix: Revert \"feat: use s3 cache in bootstrap fast\"\"\r\n([#9182](https://github.com/AztecProtocol/aztec-packages/issues/9182))\r\n([ce3d08a](https://github.com/AztecProtocol/aztec-packages/commit/ce3d08a18684da9f5b1289a2b9bdf60a66342590))\r\n</details>\r\n\r\n<details><summary>aztec-packages: 0.58.0</summary>\r\n\r\n##\r\n[0.58.0](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.57.0...aztec-packages-v0.58.0)\r\n(2024-10-18)\r\n\r\n\r\n### ⚠ BREAKING CHANGES\r\n\r\n* remove pedersen commitment\r\n([#9107](https://github.com/AztecProtocol/aztec-packages/issues/9107))\r\n* remove pedersen hash opcode\r\n([#9245](https://github.com/AztecProtocol/aztec-packages/issues/9245))\r\n* Brillig and AVM default all uninitialized memory cells to Field 0\r\n([#9057](https://github.com/AztecProtocol/aztec-packages/issues/9057))\r\n* Integer division is not the inverse of integer multiplication\r\n(https://github.com/noir-lang/noir/pull/6243)\r\n* kind size checks (https://github.com/noir-lang/noir/pull/6137)\r\n* Change tag attributes to require a ' prefix\r\n(https://github.com/noir-lang/noir/pull/6235)\r\n* **avm:** remove tags from wire format\r\n([#9198](https://github.com/AztecProtocol/aztec-packages/issues/9198))\r\n* remove keccak256 opcode from ACIR/Brillig\r\n([#9104](https://github.com/AztecProtocol/aztec-packages/issues/9104))\r\n* **avm:** more instr wire format takes u16\r\n([#9174](https://github.com/AztecProtocol/aztec-packages/issues/9174))\r\n* Brillig with a stack and conditional inlining\r\n([#8989](https://github.com/AztecProtocol/aztec-packages/issues/8989))\r\n* unrevert \"feat: new per-enqueued-call gas limit\"\r\n([#9140](https://github.com/AztecProtocol/aztec-packages/issues/9140))\r\n* protocol contracts\r\n([#9025](https://github.com/AztecProtocol/aztec-packages/issues/9025))\r\n\r\n### Features\r\n\r\n* Add `checked_transmute` (https://github.com/noir-lang/noir/pull/6262)\r\n([5a3a8cc](https://github.com/AztecProtocol/aztec-packages/commit/5a3a8ccd0286a16b93c95a1de21676250926456a))\r\n* Add insturmentation to attestation and epoch quote mem pools\r\n([#9055](https://github.com/AztecProtocol/aztec-packages/issues/9055))\r\n([7dfa295](https://github.com/AztecProtocol/aztec-packages/commit/7dfa2951d4116b104744704901d143b55dd275eb))\r\n* Add more `Type` and `UnresolvedType` methods\r\n(https://github.com/noir-lang/noir/pull/5994)\r\n([26185f0](https://github.com/AztecProtocol/aztec-packages/commit/26185f0e23d54e2f122ae07de573b77b2974e7c1))\r\n* Add sequencer address to metrics\r\n([#9145](https://github.com/AztecProtocol/aztec-packages/issues/9145))\r\n([c33d38b](https://github.com/AztecProtocol/aztec-packages/commit/c33d38b68a8c109e138a2809b530f7fdb1abb122))\r\n* Add validator address to logs\r\n([#9143](https://github.com/AztecProtocol/aztec-packages/issues/9143))\r\n([e245f83](https://github.com/AztecProtocol/aztec-packages/commit/e245f833e56b05cf11850cb8537d9dbba01de746))\r\n* Allow `unconstrained` after visibility\r\n(https://github.com/noir-lang/noir/pull/6246)\r\n([5a3a8cc](https://github.com/AztecProtocol/aztec-packages/commit/5a3a8ccd0286a16b93c95a1de21676250926456a))\r\n* **avm:** Codegen recursive_verifier.cpp\r\n([#9204](https://github.com/AztecProtocol/aztec-packages/issues/9204))\r\n([2592e50](https://github.com/AztecProtocol/aztec-packages/commit/2592e50b2bd9e76d35a3c9caac4d7042fe26b9b6)),\r\ncloses\r\n[#8849](https://github.com/AztecProtocol/aztec-packages/issues/8849)\r\n* **avm:** Constrain start and end l2/da gas\r\n([#9031](https://github.com/AztecProtocol/aztec-packages/issues/9031))\r\n([308c03b](https://github.com/AztecProtocol/aztec-packages/commit/308c03b9ad45001570e6232f88403de8cc7d3cfb)),\r\ncloses\r\n[#9001](https://github.com/AztecProtocol/aztec-packages/issues/9001)\r\n* **avm:** More instr wire format takes u16\r\n([#9174](https://github.com/AztecProtocol/aztec-packages/issues/9174))\r\n([3a01ad9](https://github.com/AztecProtocol/aztec-packages/commit/3a01ad93e21e9e6cd27b7a2a4c1e2c9f24d6363e))\r\n* **avm:** Remove tags from wire format\r\n([#9198](https://github.com/AztecProtocol/aztec-packages/issues/9198))\r\n([68a7326](https://github.com/AztecProtocol/aztec-packages/commit/68a7326d9f2d4bd891acac12950289d6e9fbe617))\r\n* Better tracing/metrics in validator and archiver\r\n([#9108](https://github.com/AztecProtocol/aztec-packages/issues/9108))\r\n([1801f5b](https://github.com/AztecProtocol/aztec-packages/commit/1801f5b49fb3b153817a1596c6fd568f1c762fe5))\r\n* Brillig and AVM default all uninitialized memory cells to Field 0\r\n([#9057](https://github.com/AztecProtocol/aztec-packages/issues/9057))\r\n([5861d4e](https://github.com/AztecProtocol/aztec-packages/commit/5861d4e5e8a72161dac910e0bc8e635e0d332793))\r\n* Brillig with a stack and conditional inlining\r\n([#8989](https://github.com/AztecProtocol/aztec-packages/issues/8989))\r\n([409b7b8](https://github.com/AztecProtocol/aztec-packages/commit/409b7b8c6b43a91fc1b5be48aee0174d56d914d9))\r\n* Browser tests for UltraHonk\r\n([#9047](https://github.com/AztecProtocol/aztec-packages/issues/9047))\r\n([f0d45dd](https://github.com/AztecProtocol/aztec-packages/commit/f0d45dd8d0c00707cd18989c3a45ff0c3cbc92a6))\r\n* Chaos mesh\r\n([#9196](https://github.com/AztecProtocol/aztec-packages/issues/9196))\r\n([134bef8](https://github.com/AztecProtocol/aztec-packages/commit/134bef8c3820fbf8ed08c7b44cbf5636d9342d99))\r\n* Docker_fast.sh\r\n([#9273](https://github.com/AztecProtocol/aztec-packages/issues/9273))\r\n([57e792e](https://github.com/AztecProtocol/aztec-packages/commit/57e792e6baaa2dfaef7af4c84d4ab75804c9d3de))\r\n* Don't crash LSP when there are errors resolving the workspace\r\n(https://github.com/noir-lang/noir/pull/6257)\r\n([5a3a8cc](https://github.com/AztecProtocol/aztec-packages/commit/5a3a8ccd0286a16b93c95a1de21676250926456a))\r\n* Don't suggest private struct fields in LSP\r\n(https://github.com/noir-lang/noir/pull/6256)\r\n([5a3a8cc](https://github.com/AztecProtocol/aztec-packages/commit/5a3a8ccd0286a16b93c95a1de21676250926456a))\r\n* Drop epoch duration / block times\r\n([#9149](https://github.com/AztecProtocol/aztec-packages/issues/9149))\r\n([c3e859b](https://github.com/AztecProtocol/aztec-packages/commit/c3e859b86ce66d42ed04dfd1b3d82995490f74ae))\r\n* Externally accessible spartan deployment\r\n([#9171](https://github.com/AztecProtocol/aztec-packages/issues/9171))\r\n([26edb4d](https://github.com/AztecProtocol/aztec-packages/commit/26edb4dd0b47df5d079fa8af7d20adef26da8ad7))\r\n* Fix encoding of public keys\r\n([#9158](https://github.com/AztecProtocol/aztec-packages/issues/9158))\r\n([35c66c9](https://github.com/AztecProtocol/aztec-packages/commit/35c66c9875c6515d719ff4633236e4e11d1b54a1))\r\n* Handwritten parser (https://github.com/noir-lang/noir/pull/6180)\r\n([26185f0](https://github.com/AztecProtocol/aztec-packages/commit/26185f0e23d54e2f122ae07de573b77b2974e7c1))\r\n* **improve:** Remove scan through globals\r\n(https://github.com/noir-lang/noir/pull/6282)\r\n([5a3a8cc](https://github.com/AztecProtocol/aztec-packages/commit/5a3a8ccd0286a16b93c95a1de21676250926456a))\r\n* Integrate databus in the private kernels\r\n([#9028](https://github.com/AztecProtocol/aztec-packages/issues/9028))\r\n([1798b1c](https://github.com/AztecProtocol/aztec-packages/commit/1798b1cc701824dd268ed0e49e592febf01a1687))\r\n* Kind size checks (https://github.com/noir-lang/noir/pull/6137)\r\n([5a3a8cc](https://github.com/AztecProtocol/aztec-packages/commit/5a3a8ccd0286a16b93c95a1de21676250926456a))\r\n* Make index in inbox global\r\n([#9110](https://github.com/AztecProtocol/aztec-packages/issues/9110))\r\n([375c017](https://github.com/AztecProtocol/aztec-packages/commit/375c017ac130a20f9cc20be11e5199327641013e)),\r\ncloses\r\n[#9085](https://github.com/AztecProtocol/aztec-packages/issues/9085)\r\n* Modify contract instance to include public keys\r\n([#9153](https://github.com/AztecProtocol/aztec-packages/issues/9153))\r\n([17c6127](https://github.com/AztecProtocol/aztec-packages/commit/17c612740dc3563321bf69c1760de1ef88b22124))\r\n* Native testnet helper script\r\n([#9260](https://github.com/AztecProtocol/aztec-packages/issues/9260))\r\n([1613c0f](https://github.com/AztecProtocol/aztec-packages/commit/1613c0f0e13101bfa152a6a6fac3a07cf7604ef0))\r\n* Native tmux-based network e2e\r\n([#9036](https://github.com/AztecProtocol/aztec-packages/issues/9036))\r\n([f9fc73a](https://github.com/AztecProtocol/aztec-packages/commit/f9fc73a40f5b9d11ad92a6cee3e29d3fcc80425e))\r\n* New per-enqueued-call gas limit\r\n([#9033](https://github.com/AztecProtocol/aztec-packages/issues/9033))\r\n([6ef0895](https://github.com/AztecProtocol/aztec-packages/commit/6ef0895ed9788c533b0caf2d2c30839552dabbcc))\r\n* New world state\r\n([#8776](https://github.com/AztecProtocol/aztec-packages/issues/8776))\r\n([41f3934](https://github.com/AztecProtocol/aztec-packages/commit/41f393443396cae77e09a09df07d42e6d5ff5618))\r\n* Nomismatokopio\r\n([#8940](https://github.com/AztecProtocol/aztec-packages/issues/8940))\r\n([1f53957](https://github.com/AztecProtocol/aztec-packages/commit/1f53957ffea720fc008a80623d0fb1da8a3cb302))\r\n* Optimize `Quoted::as_expr` by parsing just once\r\n(https://github.com/noir-lang/noir/pull/6237)\r\n([5a3a8cc](https://github.com/AztecProtocol/aztec-packages/commit/5a3a8ccd0286a16b93c95a1de21676250926456a))\r\n* Optimize reading a workspace's files\r\n(https://github.com/noir-lang/noir/pull/6281)\r\n([5a3a8cc](https://github.com/AztecProtocol/aztec-packages/commit/5a3a8ccd0286a16b93c95a1de21676250926456a))\r\n* Parameterize circuit epoch duration\r\n([#9050](https://github.com/AztecProtocol/aztec-packages/issues/9050))\r\n([1b902f6](https://github.com/AztecProtocol/aztec-packages/commit/1b902f663349198aa8f9b3a22663b5c8adc0d442))\r\n* **perf:** Flamegraphs for test program execution benchmarks\r\n(https://github.com/noir-lang/noir/pull/6253)\r\n([5a3a8cc](https://github.com/AztecProtocol/aztec-packages/commit/5a3a8ccd0286a16b93c95a1de21676250926456a))\r\n* **perf:** Follow array sets backwards in array set from get\r\noptimization (https://github.com/noir-lang/noir/pull/6208)\r\n([26185f0](https://github.com/AztecProtocol/aztec-packages/commit/26185f0e23d54e2f122ae07de573b77b2974e7c1))\r\n* Persistent storage edit for anvil node\r\n([#9089](https://github.com/AztecProtocol/aztec-packages/issues/9089))\r\n([9b72a69](https://github.com/AztecProtocol/aztec-packages/commit/9b72a69940d2d601256dbb88f59c39af2af0f182))\r\n* Protocol contracts\r\n([#9025](https://github.com/AztecProtocol/aztec-packages/issues/9025))\r\n([f3bcff0](https://github.com/AztecProtocol/aztec-packages/commit/f3bcff0c0943d190261de366301ed8f9267543f3))\r\n* Recover from '=' instead of ':' in struct constructor/pattern\r\n(https://github.com/noir-lang/noir/pull/6236)\r\n([5a3a8cc](https://github.com/AztecProtocol/aztec-packages/commit/5a3a8ccd0286a16b93c95a1de21676250926456a))\r\n* Remove byte decomposition in `compute_decomposition`\r\n(https://github.com/noir-lang/noir/pull/6159)\r\n([5a3a8cc](https://github.com/AztecProtocol/aztec-packages/commit/5a3a8ccd0286a16b93c95a1de21676250926456a))\r\n* Replace Zeromorph with Shplemini in ECCVM\r\n([#9102](https://github.com/AztecProtocol/aztec-packages/issues/9102))\r\n([c857cd9](https://github.com/AztecProtocol/aztec-packages/commit/c857cd9167f696fc237b64ff579952001eba7d40))\r\n* Restore VK tree\r\n([#9156](https://github.com/AztecProtocol/aztec-packages/issues/9156))\r\n([440e729](https://github.com/AztecProtocol/aztec-packages/commit/440e729758c3be99558cd36d4af3f10c324debb7))\r\n* Show LSP diagnostic related information\r\n(https://github.com/noir-lang/noir/pull/6277)\r\n([5a3a8cc](https://github.com/AztecProtocol/aztec-packages/commit/5a3a8ccd0286a16b93c95a1de21676250926456a))\r\n* Slightly improve \"unexpected token\" error message\r\n(https://github.com/noir-lang/noir/pull/6279)\r\n([5a3a8cc](https://github.com/AztecProtocol/aztec-packages/commit/5a3a8ccd0286a16b93c95a1de21676250926456a))\r\n* Stable deployments for spartan\r\n([#9147](https://github.com/AztecProtocol/aztec-packages/issues/9147))\r\n([3e1c02e](https://github.com/AztecProtocol/aztec-packages/commit/3e1c02efed2bc10b5f88f3017f9940eb68533510))\r\n* Structured commit\r\n([#9027](https://github.com/AztecProtocol/aztec-packages/issues/9027))\r\n([26f406b](https://github.com/AztecProtocol/aztec-packages/commit/26f406b0591b3f88cb37c5e8f7cb3cbfc625315e))\r\n* Sysstia\r\n([#8941](https://github.com/AztecProtocol/aztec-packages/issues/8941))\r\n([2da2fe2](https://github.com/AztecProtocol/aztec-packages/commit/2da2fe2655ad57ab2bc19d589768b2b84ee8e393))\r\n* **test:** Fuzz poseidon hases against an external library\r\n(https://github.com/noir-lang/noir/pull/6273)\r\n([5a3a8cc](https://github.com/AztecProtocol/aztec-packages/commit/5a3a8ccd0286a16b93c95a1de21676250926456a))\r\n* **test:** Fuzz test poseidon2 hash equivalence\r\n(https://github.com/noir-lang/noir/pull/6265)\r\n([5a3a8cc](https://github.com/AztecProtocol/aztec-packages/commit/5a3a8ccd0286a16b93c95a1de21676250926456a))\r\n* **test:** Fuzz test stdlib hash functions\r\n(https://github.com/noir-lang/noir/pull/6233)\r\n([26185f0](https://github.com/AztecProtocol/aztec-packages/commit/26185f0e23d54e2f122ae07de573b77b2974e7c1))\r\n* **test:** Include the PoseidonHasher in the fuzzing\r\n(https://github.com/noir-lang/noir/pull/6280)\r\n([5a3a8cc](https://github.com/AztecProtocol/aztec-packages/commit/5a3a8ccd0286a16b93c95a1de21676250926456a))\r\n* Tracy time with instrumentation\r\n([#9170](https://github.com/AztecProtocol/aztec-packages/issues/9170))\r\n([1c008d9](https://github.com/AztecProtocol/aztec-packages/commit/1c008d9a2fad747142e8ca356d6c00cee1663f2c))\r\n* Trait inheritance (https://github.com/noir-lang/noir/pull/6252)\r\n([5a3a8cc](https://github.com/AztecProtocol/aztec-packages/commit/5a3a8ccd0286a16b93c95a1de21676250926456a))\r\n* Unrevert \"feat: new per-enqueued-call gas limit\"\r\n([#9140](https://github.com/AztecProtocol/aztec-packages/issues/9140))\r\n([1323a34](https://github.com/AztecProtocol/aztec-packages/commit/1323a34c50e7727435129aa31a05ae7bdfb0ca09))\r\n* Use s3 cache in bootstrap fast\r\n([#9111](https://github.com/AztecProtocol/aztec-packages/issues/9111))\r\n([349f938](https://github.com/AztecProtocol/aztec-packages/commit/349f938601f7a4fdbdf83aea62c7b8c244bbe434))\r\n* Visibility for struct fields\r\n(https://github.com/noir-lang/noir/pull/6221)\r\n([5a3a8cc](https://github.com/AztecProtocol/aztec-packages/commit/5a3a8ccd0286a16b93c95a1de21676250926456a))\r\n* World State Re-orgs\r\n([#9035](https://github.com/AztecProtocol/aztec-packages/issues/9035))\r\n([04f4a7b](https://github.com/AztecProtocol/aztec-packages/commit/04f4a7b2ae141b7eee4464e8d2cc91460d0c650a))\r\n* World state synchronizer reorgs\r\n([#9091](https://github.com/AztecProtocol/aztec-packages/issues/9091))\r\n([ba63b43](https://github.com/AztecProtocol/aztec-packages/commit/ba63b43c6e5c09ecda0ed94bdd3b875546400d27))\r\n\r\n\r\n### Bug Fixes\r\n\r\n* Accidental e2e inclusion\r\n([6e651de](https://github.com/AztecProtocol/aztec-packages/commit/6e651de0d37b925900d2109a9c1b1f67f25005c1))\r\n* Address inactive public key check in `verify_signature_noir`\r\n(https://github.com/noir-lang/noir/pull/6270)\r\n([5a3a8cc](https://github.com/AztecProtocol/aztec-packages/commit/5a3a8ccd0286a16b93c95a1de21676250926456a))\r\n* Allow passing rayon threads when building aztec images\r\n([#9096](https://github.com/AztecProtocol/aztec-packages/issues/9096))\r\n([05de539](https://github.com/AztecProtocol/aztec-packages/commit/05de539d3a1a9dbfb2885b5b0d6d06e6109bbc77))\r\n* Assert block header matches\r\n([#9172](https://github.com/AztecProtocol/aztec-packages/issues/9172))\r\n([3e0504d](https://github.com/AztecProtocol/aztec-packages/commit/3e0504dc781878578d0e97450593f4628b6a57b0))\r\n* Avoid huge compilation times in base rollup\r\n([#9113](https://github.com/AztecProtocol/aztec-packages/issues/9113))\r\n([6eb43b6](https://github.com/AztecProtocol/aztec-packages/commit/6eb43b64cb13d97ecf8f8025a6d7e622d81b5db6))\r\n* Bb bootstrap_cache.sh\r\n([#9254](https://github.com/AztecProtocol/aztec-packages/issues/9254))\r\n([df37104](https://github.com/AztecProtocol/aztec-packages/commit/df3710477fc7d2e7c44e62b116bea74d4e14f930))\r\n* Better handle async timings in test\r\n([#9178](https://github.com/AztecProtocol/aztec-packages/issues/9178))\r\n([fb35151](https://github.com/AztecProtocol/aztec-packages/commit/fb35151c0d5e08f56b263eb15e0ddfc1565d4b17))\r\n* Buffer instanceof usage\r\n([#9235](https://github.com/AztecProtocol/aztec-packages/issues/9235))\r\n([8e66ef9](https://github.com/AztecProtocol/aztec-packages/commit/8e66ef97b133b3d57d5b3742e0acf2b3792433f7))\r\n* Build error around bb config in cli cmd\r\n([#9134](https://github.com/AztecProtocol/aztec-packages/issues/9134))\r\n([a5b677c](https://github.com/AztecProtocol/aztec-packages/commit/a5b677ca4aec3ace39924869c9517a256749c588))\r\n* Call correct method on fee juice contract\r\n([#9137](https://github.com/AztecProtocol/aztec-packages/issues/9137))\r\n([2dff976](https://github.com/AztecProtocol/aztec-packages/commit/2dff976202022cc474fdcc67bdcd3bc72e61dc70))\r\n* Change tag attributes to require a ' prefix\r\n(https://github.com/noir-lang/noir/pull/6235)\r\n([5a3a8cc](https://github.com/AztecProtocol/aztec-packages/commit/5a3a8ccd0286a16b93c95a1de21676250926456a))\r\n* Check for Schnorr null signature\r\n(https://github.com/noir-lang/noir/pull/6226)\r\n([26185f0](https://github.com/AztecProtocol/aztec-packages/commit/26185f0e23d54e2f122ae07de573b77b2974e7c1))\r\n* **ci:** Don't report for now on kind-network-test\r\n([#9163](https://github.com/AztecProtocol/aztec-packages/issues/9163))\r\n([c59d693](https://github.com/AztecProtocol/aztec-packages/commit/c59d6936ea46296359abbd3cbf0823d44e64da90))\r\n* Dockerized vk build\r\n([#9078](https://github.com/AztecProtocol/aztec-packages/issues/9078))\r\n([2aac1fb](https://github.com/AztecProtocol/aztec-packages/commit/2aac1fb78790eb4472529146ab5ef562abe1d0fc))\r\n* Docs pdf generation\r\n([#9114](https://github.com/AztecProtocol/aztec-packages/issues/9114))\r\n([2f9c4e9](https://github.com/AztecProtocol/aztec-packages/commit/2f9c4e9883d3081fc9d6bf73bc2305ae197a61e8))\r\n* Don't warn on unuse global if it has an abi annotation\r\n(https://github.com/noir-lang/noir/pull/6258)\r\n([5a3a8cc](https://github.com/AztecProtocol/aztec-packages/commit/5a3a8ccd0286a16b93c95a1de21676250926456a))\r\n* Don't warn on unused struct that has an abi annotation\r\n(https://github.com/noir-lang/noir/pull/6254)\r\n([5a3a8cc](https://github.com/AztecProtocol/aztec-packages/commit/5a3a8ccd0286a16b93c95a1de21676250926456a))\r\n* E2e bot follows pending chain\r\n([#9115](https://github.com/AztecProtocol/aztec-packages/issues/9115))\r\n([9afd190](https://github.com/AztecProtocol/aztec-packages/commit/9afd190fc234b1df64b53293434f1a1ab5e0dc94))\r\n* E2e-p2p attestation timeout\r\n([#9154](https://github.com/AztecProtocol/aztec-packages/issues/9154))\r\n([25bd47b](https://github.com/AztecProtocol/aztec-packages/commit/25bd47bb4faad24822d4671ee524fd6f1a50ff49))\r\n* **frontend:** Do not warn when a nested struct is provided as input to\r\nmain (https://github.com/noir-lang/noir/pull/6239)\r\n([5a3a8cc](https://github.com/AztecProtocol/aztec-packages/commit/5a3a8ccd0286a16b93c95a1de21676250926456a))\r\n* Handle dfg databus in SSA normalization\r\n(https://github.com/noir-lang/noir/pull/6249)\r\n([5a3a8cc](https://github.com/AztecProtocol/aztec-packages/commit/5a3a8ccd0286a16b93c95a1de21676250926456a))\r\n* Handle nested arrays in calldata\r\n(https://github.com/noir-lang/noir/pull/6232)\r\n([26185f0](https://github.com/AztecProtocol/aztec-packages/commit/26185f0e23d54e2f122ae07de573b77b2974e7c1))\r\n* Homogeneous input points for EC ADD\r\n(https://github.com/noir-lang/noir/pull/6241)\r\n([5a3a8cc](https://github.com/AztecProtocol/aztec-packages/commit/5a3a8ccd0286a16b93c95a1de21676250926456a))\r\n* Increase l1 propose gas estimate\r\n([#9071](https://github.com/AztecProtocol/aztec-packages/issues/9071))\r\n([9d28414](https://github.com/AztecProtocol/aztec-packages/commit/9d284140bd58a9485fdbc3db52c08496adf1f7d1))\r\n* Integer division is not the inverse of integer multiplication\r\n(https://github.com/noir-lang/noir/pull/6243)\r\n([5a3a8cc](https://github.com/AztecProtocol/aztec-packages/commit/5a3a8ccd0286a16b93c95a1de21676250926456a))\r\n* K8s peer discovery\r\n([#9274](https://github.com/AztecProtocol/aztec-packages/issues/9274))\r\n([61e4d12](https://github.com/AztecProtocol/aztec-packages/commit/61e4d1290a9d019f3a2c54d504d9560fead4c6fa))\r\n* Limit number of bb.js threads to 32\r\n([#9070](https://github.com/AztecProtocol/aztec-packages/issues/9070))\r\n([97e4b9b](https://github.com/AztecProtocol/aztec-packages/commit/97e4b9b2e0d37575b6b5e4c7a22f85b60d1f418b))\r\n* Limit number of threads\r\n([#9135](https://github.com/AztecProtocol/aztec-packages/issues/9135))\r\n([19d2620](https://github.com/AztecProtocol/aztec-packages/commit/19d2620e7536dfe99eaea901da647aaf78478f2e))\r\n* Mac-build\r\n([#9216](https://github.com/AztecProtocol/aztec-packages/issues/9216))\r\n([80ea32c](https://github.com/AztecProtocol/aztec-packages/commit/80ea32cfda8c149980938382518c47a6da123e72))\r\n* Make gate counting functions less confusing and avoid estimations\r\n([#9046](https://github.com/AztecProtocol/aztec-packages/issues/9046))\r\n([0bda0a4](https://github.com/AztecProtocol/aztec-packages/commit/0bda0a4d71ae0fb4352de0746f7d96b63b787888))\r\n* Native_world_state_instance.ts\r\n([#9136](https://github.com/AztecProtocol/aztec-packages/issues/9136))\r\n([4a204c1](https://github.com/AztecProtocol/aztec-packages/commit/4a204c12c8dab688848a1aa2d65fcde7d3ee4982))\r\n* Panic on composite types within databus\r\n(https://github.com/noir-lang/noir/pull/6225)\r\n([26185f0](https://github.com/AztecProtocol/aztec-packages/commit/26185f0e23d54e2f122ae07de573b77b2974e7c1))\r\n* Prevent compiler panic when popping from empty slices\r\n(https://github.com/noir-lang/noir/pull/6274)\r\n([5a3a8cc](https://github.com/AztecProtocol/aztec-packages/commit/5a3a8ccd0286a16b93c95a1de21676250926456a))\r\n* Prometheus metrics\r\n([#9226](https://github.com/AztecProtocol/aztec-packages/issues/9226))\r\n([9445a4f](https://github.com/AztecProtocol/aztec-packages/commit/9445a4fba8e3092c3948ffe9d5eaf5f679fce89c))\r\n* Publish-aztec-packages.yml\r\n([#9229](https://github.com/AztecProtocol/aztec-packages/issues/9229))\r\n([4bfeb83](https://github.com/AztecProtocol/aztec-packages/commit/4bfeb830ffc421386f4f9f8b4a23e2bc7fbf832d)),\r\ncloses\r\n[#9220](https://github.com/AztecProtocol/aztec-packages/issues/9220)\r\n* Reduce SRS size back to normal\r\n([#9098](https://github.com/AztecProtocol/aztec-packages/issues/9098))\r\n([a306ea5](https://github.com/AztecProtocol/aztec-packages/commit/a306ea5ffeb13019427a96d8152e5642b717c5f6))\r\n* Reject invalid expression with in CLI parser\r\n(https://github.com/noir-lang/noir/pull/6287)\r\n([70fb8fa](https://github.com/AztecProtocol/aztec-packages/commit/70fb8fa97ab0d2484cb49126271df7aa18432f3e))\r\n* Release `master` dockerhub images\r\n([#9117](https://github.com/AztecProtocol/aztec-packages/issues/9117))\r\n([6662fba](https://github.com/AztecProtocol/aztec-packages/commit/6662fbae99808d6d4de9f39db6ef587bb455156c))\r\n* Remove need for duplicate attributes on each function\r\n([#9244](https://github.com/AztecProtocol/aztec-packages/issues/9244))\r\n([ed933ee](https://github.com/AztecProtocol/aztec-packages/commit/ed933eefc2aab4b616dca94fee9a02837aec7fb9)),\r\ncloses\r\n[#9243](https://github.com/AztecProtocol/aztec-packages/issues/9243)\r\n* Revert \"feat: new per-enqueued-call gas limit\"\r\n([#9139](https://github.com/AztecProtocol/aztec-packages/issues/9139))\r\n([7677ca5](https://github.com/AztecProtocol/aztec-packages/commit/7677ca5d9280ac9615a92be36d1958960dbd7353))\r\n* Revert \"feat: use s3 cache in bootstrap fast\"\r\n([#9181](https://github.com/AztecProtocol/aztec-packages/issues/9181))\r\n([7872d09](https://github.com/AztecProtocol/aztec-packages/commit/7872d092c359298273d7ab1fc23fa61ae1973f8b))\r\n* Revert \"fix: Revert \"feat: use s3 cache in bootstrap fast\"\"\r\n([#9182](https://github.com/AztecProtocol/aztec-packages/issues/9182))\r\n([ce3d08a](https://github.com/AztecProtocol/aztec-packages/commit/ce3d08a18684da9f5b1289a2b9bdf60a66342590))\r\n* **s3-cache:** Link extracted preset-release-world-state\r\n([#9252](https://github.com/AztecProtocol/aztec-packages/issues/9252))\r\n([8b2d7d9](https://github.com/AztecProtocol/aztec-packages/commit/8b2d7d9c962c975592e17424f4d0b70f9ca7acd4))\r\n* Setup fee juice for e2e tests\r\n([#9094](https://github.com/AztecProtocol/aztec-packages/issues/9094))\r\n([a8ec91a](https://github.com/AztecProtocol/aztec-packages/commit/a8ec91a32d8fee3d309c855ed9d43a6c025c487b))\r\n* Spartan account pre-funding\r\n([#9161](https://github.com/AztecProtocol/aztec-packages/issues/9161))\r\n([f4754f7](https://github.com/AztecProtocol/aztec-packages/commit/f4754f7ea9587edbe8367c49539f65d25e251e23))\r\n* Transaction bot proper configuration\r\n([#9106](https://github.com/AztecProtocol/aztec-packages/issues/9106))\r\n([666fc38](https://github.com/AztecProtocol/aztec-packages/commit/666fc382fba1235ec0bca9a6cd027734e49eb182))\r\n* Unrevert \"feat: trace AVM side effects per enqueued call\"\"\r\n([#9095](https://github.com/AztecProtocol/aztec-packages/issues/9095))\r\n([72e4867](https://github.com/AztecProtocol/aztec-packages/commit/72e4867fc0c429563f7c54092470010d1e6553a9))\r\n* Visibility for impl methods\r\n(https://github.com/noir-lang/noir/pull/6261)\r\n([5a3a8cc](https://github.com/AztecProtocol/aztec-packages/commit/5a3a8ccd0286a16b93c95a1de21676250926456a))\r\n\r\n\r\n### Miscellaneous\r\n\r\n* Activate peer scoring for other p2p topics\r\n([#9097](https://github.com/AztecProtocol/aztec-packages/issues/9097))\r\n([18d24fb](https://github.com/AztecProtocol/aztec-packages/commit/18d24fbd1083c22507cd7b421976c7c63f11d140))\r\n* Add regression test for\r\n[#5756](https://github.com/AztecProtocol/aztec-packages/issues/5756)\r\n(https://github.com/noir-lang/noir/pull/5770)\r\n([5a3a8cc](https://github.com/AztecProtocol/aztec-packages/commit/5a3a8ccd0286a16b93c95a1de21676250926456a))\r\n* Add world_state_napi to bootstrap fast\r\n([#9079](https://github.com/AztecProtocol/aztec-packages/issues/9079))\r\n([e827056](https://github.com/AztecProtocol/aztec-packages/commit/e827056e652a4789c91a617587945d57163fa7ff))\r\n* Added healthcheck and startup check\r\n([#9112](https://github.com/AztecProtocol/aztec-packages/issues/9112))\r\n([ffa012f](https://github.com/AztecProtocol/aztec-packages/commit/ffa012ffb1d0e72ddab68c066ca9e923bd1c0c2b))\r\n* Adjust debug level of received attestations\r\n([#9087](https://github.com/AztecProtocol/aztec-packages/issues/9087))\r\n([eb67dd4](https://github.com/AztecProtocol/aztec-packages/commit/eb67dd4ab47755cd8e1445be3fb1b75a4d6c3f21))\r\n* **avm:** Revert 9080 - re-introducing start/end gas constraining\r\n([#9109](https://github.com/AztecProtocol/aztec-packages/issues/9109))\r\n([763e9b8](https://github.com/AztecProtocol/aztec-packages/commit/763e9b8a98981545b68f96e5b49a0726fc3c80b3))\r\n* **avm:** Type aliasing for VmPublicInputs\r\n([#8884](https://github.com/AztecProtocol/aztec-packages/issues/8884))\r\n([f3ed39b](https://github.com/AztecProtocol/aztec-packages/commit/f3ed39bf7be6f08bcfcabf6c04eb570f4d06ed27))\r\n* **ci:** Disable gossip_network.test.ts\r\n([#9165](https://github.com/AztecProtocol/aztec-packages/issues/9165))\r\n([5e7ab1d](https://github.com/AztecProtocol/aztec-packages/commit/5e7ab1de0a9b4da56ff84381cf3dea44837bd79d))\r\n* **ci:** Parallelise CI for acir-test flows\r\n([#9238](https://github.com/AztecProtocol/aztec-packages/issues/9238))\r\n([73a7c23](https://github.com/AztecProtocol/aztec-packages/commit/73a7c231193d56fdbf2e1160be5ea8d58f5596bb))\r\n* **ci:** Parallelise noir-projects CI\r\n([#9270](https://github.com/AztecProtocol/aztec-packages/issues/9270))\r\n([44ad5e5](https://github.com/AztecProtocol/aztec-packages/commit/44ad5e595c09639eac0913be3b653d32eb4accac))\r\n* **ci:** Try to offload compute burden when merging\r\n([#9213](https://github.com/AztecProtocol/aztec-packages/issues/9213))\r\n([c8dc016](https://github.com/AztecProtocol/aztec-packages/commit/c8dc016a2bfc5b41899c32e3bf2b2d3ffb855140))\r\n* Configure trees instead of duplicating constants\r\n([#9088](https://github.com/AztecProtocol/aztec-packages/issues/9088))\r\n([c1150c9](https://github.com/AztecProtocol/aztec-packages/commit/c1150c9b28581985686b13ba97eb7f0066736652))\r\n* Default logging level to debug if debug set\r\n([#9173](https://github.com/AztecProtocol/aztec-packages/issues/9173))\r\n([febf744](https://github.com/AztecProtocol/aztec-packages/commit/febf7449c80ffe44eaadb88c088e35fa419ed443))\r\n* **deployments:** Native network test\r\n([#9138](https://github.com/AztecProtocol/aztec-packages/issues/9138))\r\n([975ea36](https://github.com/AztecProtocol/aztec-packages/commit/975ea3617d9cddc2d2c35aa56c8e7b1f5d5069ab))\r\n* Different metrics values for production and local\r\n([#9124](https://github.com/AztecProtocol/aztec-packages/issues/9124))\r\n([6888d70](https://github.com/AztecProtocol/aztec-packages/commit/6888d70be014b4d541c1e584248ae6eca8562a04))\r\n* Disable e2e-p2p completely\r\n([#9219](https://github.com/AztecProtocol/aztec-packages/issues/9219))\r\n([286d617](https://github.com/AztecProtocol/aztec-packages/commit/286d617e3f06395ee5c88339b8d57170aad00213))\r\n* Disable flakey rediscovery.test.ts\r\n([#9217](https://github.com/AztecProtocol/aztec-packages/issues/9217))\r\n([14e73e2](https://github.com/AztecProtocol/aztec-packages/commit/14e73e29a784a3b6131b464b40058dcf8bb53a86))\r\n* **docs:** Rewriting bbup script, refactoring bb readme for clarity\r\n([#9073](https://github.com/AztecProtocol/aztec-packages/issues/9073))\r\n([662b61e](https://github.com/AztecProtocol/aztec-packages/commit/662b61e4c20a2d4217980922d4578f4dfeacae6b))\r\n* Eccvm transcript builder\r\n([#9026](https://github.com/AztecProtocol/aztec-packages/issues/9026))\r\n([d2c9ae2](https://github.com/AztecProtocol/aztec-packages/commit/d2c9ae2853bb75cd736583406a57e96645bd2e88))\r\n* Expose util func to convert field compressed string back to string in\r\naztec js\r\n([#9239](https://github.com/AztecProtocol/aztec-packages/issues/9239))\r\n([ce7e687](https://github.com/AztecProtocol/aztec-packages/commit/ce7e687506104828ddc96f66fd30845bda6494fc)),\r\ncloses\r\n[#9233](https://github.com/AztecProtocol/aztec-packages/issues/9233)\r\n* Fix missing migrations to immutable contract fn interaction\r\n([#9053](https://github.com/AztecProtocol/aztec-packages/issues/9053))\r\n([41c496f](https://github.com/AztecProtocol/aztec-packages/commit/41c496f9271ebe3d53fbb6d988a7306617ee7e38))\r\n* Format noir stuff\r\n([#9202](https://github.com/AztecProtocol/aztec-packages/issues/9202))\r\n([2b09709](https://github.com/AztecProtocol/aztec-packages/commit/2b09709932885b8a0de4bf2b91fb381d39baf6b2))\r\n* Goodbye circleci\r\n([#9259](https://github.com/AztecProtocol/aztec-packages/issues/9259))\r\n([dab2a93](https://github.com/AztecProtocol/aztec-packages/commit/dab2a933128a3b42c6a62152a51a46c5e7a3d09d))\r\n* Improve setup_local_k8s.sh to focus kind\r\n([#9228](https://github.com/AztecProtocol/aztec-packages/issues/9228))\r\n([8efdb47](https://github.com/AztecProtocol/aztec-packages/commit/8efdb474611730320ca2aadd87ff6238d464c2c9))\r\n* Increase tx bot delay\r\n([9e0ab97](https://github.com/AztecProtocol/aztec-packages/commit/9e0ab97194b8338e4b4292229c9bf911c7446dcc))\r\n* Log revert reason on publish to L1\r\n([#9067](https://github.com/AztecProtocol/aztec-packages/issues/9067))\r\n([814b6d0](https://github.com/AztecProtocol/aztec-packages/commit/814b6d09d1e4750c5b3277cebde523f17af5f85e))\r\n* Modify note processors and synchronizers to use complete address\r\n([#9152](https://github.com/AztecProtocol/aztec-packages/issues/9152))\r\n([730d90f](https://github.com/AztecProtocol/aztec-packages/commit/730d90fcfdc65c00a1867420fdc8211a72293cd9))\r\n* Move contract stuff from types into circuits.js\r\n([#9151](https://github.com/AztecProtocol/aztec-packages/issues/9151))\r\n([d8131bc](https://github.com/AztecProtocol/aztec-packages/commit/d8131bc5c1b4d47d20c3312598296bfb89cecf11))\r\n* Move public keys to protocol circuits\r\n([#9074](https://github.com/AztecProtocol/aztec-packages/issues/9074))\r\n([8adbdd5](https://github.com/AztecProtocol/aztec-packages/commit/8adbdd5827a81cf7b34bc06883367d0dc47a47a2))\r\n* Offsite network stuff\r\n([#9231](https://github.com/AztecProtocol/aztec-packages/issues/9231))\r\n([155b40b](https://github.com/AztecProtocol/aztec-packages/commit/155b40b67616387f183dcb05d6ab08e9e4c3ab72))\r\n* **p2p:** Refactor pools\r\n([#9065](https://github.com/AztecProtocol/aztec-packages/issues/9065))\r\n([b62235e](https://github.com/AztecProtocol/aztec-packages/commit/b62235ed75b55f79fd84a5ebf1a1f5af28fa289a))\r\n* **p2p:** Store received epoch quotes\r\n([#9064](https://github.com/AztecProtocol/aztec-packages/issues/9064))\r\n([e3b467f](https://github.com/AztecProtocol/aztec-packages/commit/e3b467f70ca1d41bd27ac7231e257f1329ed0896))\r\n* Pass by const reference\r\n([#9083](https://github.com/AztecProtocol/aztec-packages/issues/9083))\r\n([764bba4](https://github.com/AztecProtocol/aztec-packages/commit/764bba4dd8a016d45b201562ec82f9a12de65c2d))\r\n* Pre-initialise validators in cluster\r\n([#9048](https://github.com/AztecProtocol/aztec-packages/issues/9048))\r\n([e2d32a1](https://github.com/AztecProtocol/aztec-packages/commit/e2d32a113ca279ee205a666c24061199e34e1e7b))\r\n* Quieter cache-download.sh\r\n([#9176](https://github.com/AztecProtocol/aztec-packages/issues/9176))\r\n([b75d4c8](https://github.com/AztecProtocol/aztec-packages/commit/b75d4c85531ab149e142b79749eca9320baacf1a))\r\n* Reenable sync test\r\n([#9160](https://github.com/AztecProtocol/aztec-packages/issues/9160))\r\n([a71642f](https://github.com/AztecProtocol/aztec-packages/commit/a71642f052e89f601c30f082b83c372d6e68f9ee))\r\n* Regression test for\r\n[#5462](https://github.com/AztecProtocol/aztec-packages/issues/5462)\r\n(https://github.com/noir-lang/noir/pull/6286)\r\n([5a3a8cc](https://github.com/AztecProtocol/aztec-packages/commit/5a3a8ccd0286a16b93c95a1de21676250926456a))\r\n* Remove AvmVerificationKeyData and tube specific types\r\n([#8569](https://github.com/AztecProtocol/aztec-packages/issues/8569))\r\n([da6c579](https://github.com/AztecProtocol/aztec-packages/commit/da6c579975112d8d629e64834465b6a52b04eb6a))\r\n* Remove end-to-end from circleci\r\n([#9116](https://github.com/AztecProtocol/aztec-packages/issues/9116))\r\n([4d1f7d8](https://github.com/AztecProtocol/aztec-packages/commit/4d1f7d83f9d14b1df70a26c99f696aebd0416ebd))\r\n* Remove keccak256 opcode from ACIR/Brillig\r\n([#9104](https://github.com/AztecProtocol/aztec-packages/issues/9104))\r\n([4c1163a](https://github.com/AztecProtocol/aztec-packages/commit/4c1163a9e9516d298e55421f1cf0ed81081151dd))\r\n* Remove pedersen commitment\r\n([#9107](https://github.com/AztecProtocol/aztec-packages/issues/9107))\r\n([1823bde](https://github.com/AztecProtocol/aztec-packages/commit/1823bde2b486827f33a87899074594f811cfbef4))\r\n* Remove pedersen hash opcode\r\n([#9245](https://github.com/AztecProtocol/aztec-packages/issues/9245))\r\n([1f0538f](https://github.com/AztecProtocol/aztec-packages/commit/1f0538f00cadcf4325d2aa17bdb098d11ca3840f))\r\n* Rename some prover env vars\r\n([#9032](https://github.com/AztecProtocol/aztec-packages/issues/9032))\r\n([e27ead8](https://github.com/AztecProtocol/aztec-packages/commit/e27ead85403d3f21ebc406e7d1a7e18190085603))\r\n* Replace relative paths to noir-protocol-circuits\r\n([424afba](https://github.com/AztecProtocol/aztec-packages/commit/424afbae1b1d4a9a8e01dfe4cca141407bf1bc44))\r\n* Replace relative paths to noir-protocol-circuits\r\n([bef3907](https://github.com/AztecProtocol/aztec-packages/commit/bef39073e2a380bf7ae815053dc6d5e4665aa13a))\r\n* Replace relative paths to noir-protocol-circuits\r\n([1b21a31](https://github.com/AztecProtocol/aztec-packages/commit/1b21a317209be12453d805e29a3112e47cfcf394))\r\n* Replace relative paths to noir-protocol-circuits\r\n([5285348](https://github.com/AztecProtocol/aztec-packages/commit/52853488488b68dde602f9facb5c5d42d5609c8c))\r\n* Replace relative paths to noir-protocol-circuits\r\n([7934d39](https://github.com/AztecProtocol/aztec-packages/commit/7934d3946c856ecbc194be0e59f7a4023fdf66e2))\r\n* Replace relative paths to noir-protocol-circuits\r\n([b787722](https://github.com/AztecProtocol/aztec-packages/commit/b787722d72068160ca57440807edc1939dbb1cfe))\r\n* Replace relative paths to noir-protocol-circuits\r\n([21cb2b1](https://github.com/AztecProtocol/aztec-packages/commit/21cb2b1e68befc5c0cbb051d4521ea39b10cfb48))\r\n* Replace relative paths to noir-protocol-circuits\r\n([facf462](https://github.com/AztecProtocol/aztec-packages/commit/facf4625e7bc4d5506464f4e1d331d1b6ad48bc8))\r\n* Replace relative paths to noir-protocol-circuits\r\n([45a72af](https://github.com/AztecProtocol/aztec-packages/commit/45a72afac98b3be090cf517aaa8948d72015462f))\r\n* Reproduce AVM ecadd bug\r\n([#9019](https://github.com/AztecProtocol/aztec-packages/issues/9019))\r\n([757ccef](https://github.com/AztecProtocol/aztec-packages/commit/757ccefd280a0798d1f6fc5cb62efafe86764bee))\r\n* Revert \"feat(avm): constrain start and end l2/da gas\r\n([#9031](https://github.com/AztecProtocol/aztec-packages/issues/9031))\"\r\n([#9080](https://github.com/AztecProtocol/aztec-packages/issues/9080))\r\n([07e4c95](https://github.com/AztecProtocol/aztec-packages/commit/07e4c956494154685970849bc4dda60c25af31bc))\r\n* Revert deletion of the old bbup\r\n([#9146](https://github.com/AztecProtocol/aztec-packages/issues/9146))\r\n([3138078](https://github.com/AztecProtocol/aztec-packages/commit/3138078f0062d8426b3c45ac47646169317ab795))\r\n* Script for deploying the spartan network\r\n([#9167](https://github.com/AztecProtocol/aztec-packages/issues/9167))\r\n([4660cec](https://github.com/AztecProtocol/aztec-packages/commit/4660cec92802d0e165a2a1ddff08c6756348b527))\r\n* Swap `pub` and `unconstrained` in function signatures\r\n([#9237](https://github.com/AztecProtocol/aztec-packages/issues/9237))\r\n([1c7e627](https://github.com/AztecProtocol/aztec-packages/commit/1c7e627e28eeabe0cbf9ccae45e107d66b0953b0))\r\n* Update palla/update-env-vars-prover to add new env var to spartan\r\n([#9069](https://github.com/AztecProtocol/aztec-packages/issues/9069))\r\n([077a01c](https://github.com/AztecProtocol/aztec-packages/commit/077a01c9a10d5a30c85e881d4a786eed7e25c492))\r\n* Update validator management policy to be parallel\r\n([#9086](https://github.com/AztecProtocol/aztec-packages/issues/9086))\r\n([f8267f2](https://github.com/AztecProtocol/aztec-packages/commit/f8267f292b9aabfa29e3e056cb42f56d5ad0f163))\r\n* Wire bb skip cleanup for bb prover\r\n([#9100](https://github.com/AztecProtocol/aztec-packages/issues/9100))\r\n([bba5674](https://github.com/AztecProtocol/aztec-packages/commit/bba56743ece19986f8259c4cf5bfdd7573207054))\r\n\r\n\r\n### Documentation\r\n\r\n* Initial pass on node guide\r\n([#9192](https://github.com/AztecProtocol/aztec-packages/issues/9192))\r\n([0fa1423](https://github.com/AztecProtocol/aztec-packages/commit/0fa14238fa83e8ad3939db8d4afd664e179fa887))\r\n</details>\r\n\r\n<details><summary>barretenberg: 0.58.0</summary>\r\n\r\n##\r\n[0.58.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.57.0...barretenberg-v0.58.0)\r\n(2024-10-18)\r\n\r\n\r\n### ⚠ BREAKING CHANGES\r\n\r\n* remove pedersen commitment\r\n([#9107](https://github.com/AztecProtocol/aztec-packages/issues/9107))\r\n* remove pedersen hash opcode\r\n([#9245](https://github.com/AztecProtocol/aztec-packages/issues/9245))\r\n* Brillig and AVM default all uninitialized memory cells to Field 0\r\n([#9057](https://github.com/AztecProtocol/aztec-packages/issues/9057))\r\n* **avm:** remove tags from wire format\r\n([#9198](https://github.com/AztecProtocol/aztec-packages/issues/9198))\r\n* remove keccak256 opcode from ACIR/Brillig\r\n([#9104](https://github.com/AztecProtocol/aztec-packages/issues/9104))\r\n* **avm:** more instr wire format takes u16\r\n([#9174](https://github.com/AztecProtocol/aztec-packages/issues/9174))\r\n* Brillig with a stack and conditional inlining\r\n([#8989](https://github.com/AztecProtocol/aztec-packages/issues/8989))\r\n* unrevert \"feat: new per-enqueued-call gas limit\"\r\n([#9140](https://github.com/AztecProtocol/aztec-packages/issues/9140))\r\n\r\n### Features\r\n\r\n* **avm:** Codegen recursive_verifier.cpp\r\n([#9204](https://github.com/AztecProtocol/aztec-packages/issues/9204))\r\n([2592e50](https://github.com/AztecProtocol/aztec-packages/commit/2592e50b2bd9e76d35a3c9caac4d7042fe26b9b6)),\r\ncloses\r\n[#8849](https://github.com/AztecProtocol/aztec-packages/issues/8849)\r\n* **avm:** Constrain start and end l2/da gas\r\n([#9031](https://github.com/AztecProtocol/aztec-packages/issues/9031))\r\n([308c03b](https://github.com/AztecProtocol/aztec-packages/commit/308c03b9ad45001570e6232f88403de8cc7d3cfb)),\r\ncloses\r\n[#9001](https://github.com/AztecProtocol/aztec-packages/issues/9001)\r\n* **avm:** More instr wire format takes u16\r\n([#9174](https://github.com/AztecProtocol/aztec-packages/issues/9174))\r\n([3a01ad9](https://github.com/AztecProtocol/aztec-packages/commit/3a01ad93e21e9e6cd27b7a2a4c1e2c9f24d6363e))\r\n* **avm:** Remove tags from wire format\r\n([#9198](https://github.com/AztecProtocol/aztec-packages/issues/9198))\r\n([68a7326](https://github.com/AztecProtocol/aztec-packages/commit/68a7326d9f2d4bd891acac12950289d6e9fbe617))\r\n* Brillig and AVM default all uninitialized memory cells to Field 0\r\n([#9057](https://github.com/AztecProtocol/aztec-packages/issues/9057))\r\n([5861d4e](https://github.com/AztecProtocol/aztec-packages/commit/5861d4e5e8a72161dac910e0bc8e635e0d332793))\r\n* Brillig with a stack and conditional inlining\r\n([#8989](https://github.com/AztecProtocol/aztec-packages/issues/8989))\r\n([409b7b8](https://github.com/AztecProtocol/aztec-packages/commit/409b7b8c6b43a91fc1b5be48aee0174d56d914d9))\r\n* Browser tests for UltraHonk\r\n([#9047](https://github.com/AztecProtocol/aztec-packages/issues/9047))\r\n([f0d45dd](https://github.com/AztecProtocol/aztec-packages/commit/f0d45dd8d0c00707cd18989c3a45ff0c3cbc92a6))\r\n* Integrate databus in the private kernels\r\n([#9028](https://github.com/AztecProtocol/aztec-packages/issues/9028))\r\n([1798b1c](https://github.com/AztecProtocol/aztec-packages/commit/1798b1cc701824dd268ed0e49e592febf01a1687))\r\n* Modify contract instance to include public keys\r\n([#9153](https://github.com/AztecProtocol/aztec-packages/issues/9153))\r\n([17c6127](https://github.com/AztecProtocol/aztec-packages/commit/17c612740dc3563321bf69c1760de1ef88b22124))\r\n* New per-enqueued-call gas limit\r\n([#9033](https://github.com/AztecProtocol/aztec-packages/issues/9033))\r\n([6ef0895](https://github.com/AztecProtocol/aztec-packages/commit/6ef0895ed9788c533b0caf2d2c30839552dabbcc))\r\n* New world state\r\n([#8776](https://github.com/AztecProtocol/aztec-packages/issues/8776))\r\n([41f3934](https://github.com/AztecProtocol/aztec-packages/commit/41f393443396cae77e09a09df07d42e6d5ff5618))\r\n* Replace Zeromorph with Shplemini in ECCVM\r\n([#9102](https://github.com/AztecProtocol/aztec-packages/issues/9102))\r\n([c857cd9](https://github.com/AztecProtocol/aztec-packages/commit/c857cd9167f696fc237b64ff579952001eba7d40))\r\n* Structured commit\r\n([#9027](https://github.com/AztecProtocol/aztec-packages/issues/9027))\r\n([26f406b](https://github.com/AztecProtocol/aztec-packages/commit/26f406b0591b3f88cb37c5e8f7cb3cbfc625315e))\r\n* Tracy time with instrumentation\r\n([#9170](https://github.com/AztecProtocol/aztec-packages/issues/9170))\r\n([1c008d9](https://github.com/AztecProtocol/aztec-packages/commit/1c008d9a2fad747142e8ca356d6c00cee1663f2c))\r\n* Unrevert \"feat: new per-enqueued-call gas limit\"\r\n([#9140](https://github.com/AztecProtocol/aztec-packages/issues/9140))\r\n([1323a34](https://github.com/AztecProtocol/aztec-packages/commit/1323a34c50e7727435129aa31a05ae7bdfb0ca09))\r\n* Use s3 cache in bootstrap fast\r\n([#9111](https://github.com/AztecProtocol/aztec-packages/issues/9111))\r\n([349f938](https://github.com/AztecProtocol/aztec-packages/commit/349f938601f7a4fdbdf83aea62c7b8c244bbe434))\r\n* World State Re-orgs\r\n([#9035](https://github.com/AztecProtocol/aztec-packages/issues/9035))\r\n([04f4a7b](https://github.com/AztecProtocol/aztec-packages/commit/04f4a7b2ae141b7eee4464e8d2cc91460d0c650a))\r\n\r\n\r\n### Bug Fixes\r\n\r\n* Bb bootstrap_cache.sh\r\n([#9254](https://github.com/AztecProtocol/aztec-packages/issues/9254))\r\n([df37104](https://github.com/AztecProtocol/aztec-packages/commit/df3710477fc7d2e7c44e62b116bea74d4e14f930))\r\n* Limit number of bb.js threads to 32\r\n([#9070](https://github.com/AztecProtocol/aztec-packages/issues/9070))\r\n([97e4b9b](https://github.com/AztecProtocol/aztec-packages/commit/97e4b9b2e0d37575b6b5e4c7a22f85b60d1f418b))\r\n* Mac-build\r\n([#9216](https://github.com/AztecProtocol/aztec-packages/issues/9216))\r\n([80ea32c](https://github.com/AztecProtocol/aztec-packages/commit/80ea32cfda8c149980938382518c47a6da123e72))\r\n* Make gate counting functions less confusing and avoid estimations\r\n([#9046](https://github.com/AztecProtocol/aztec-packages/issues/9046))\r\n([0bda0a4](https://github.com/AztecProtocol/aztec-packages/commit/0bda0a4d71ae0fb4352de0746f7d96b63b787888))\r\n* Reduce SRS size back to normal\r\n([#9098](https://github.com/AztecProtocol/aztec-packages/issues/9098))\r\n([a306ea5](https://github.com/AztecProtocol/aztec-packages/commit/a306ea5ffeb13019427a96d8152e5642b717c5f6))\r\n* Revert \"feat: new per-enqueued-call gas limit\"\r\n([#9139](https://github.com/AztecProtocol/aztec-packages/issues/9139))\r\n([7677ca5](https://github.com/AztecProtocol/aztec-packages/commit/7677ca5d9280ac9615a92be36d1958960dbd7353))\r\n* Revert \"feat: use s3 cache in bootstrap fast\"\r\n([#9181](https://github.com/AztecProtocol/aztec-packages/issues/9181))\r\n([7872d09](https://github.com/AztecProtocol/aztec-packages/commit/7872d092c359298273d7ab1fc23fa61ae1973f8b))\r\n* Revert \"fix: Revert \"feat: use s3 cache in bootstrap fast\"\"\r\n([#9182](https://github.com/AztecProtocol/aztec-packages/issues/9182))\r\n([ce3d08a](https://github.com/AztecProtocol/aztec-packages/commit/ce3d08a18684da9f5b1289a2b9bdf60a66342590))\r\n* **s3-cache:** Link extracted preset-release-world-state\r\n([#9252](https://github.com/AztecProtocol/aztec-packages/issues/9252))\r\n([8b2d7d9](https://github.com/AztecProtocol/aztec-packages/commit/8b2d7d9c962c975592e17424f4d0b70f9ca7acd4))\r\n\r\n\r\n### Miscellaneous\r\n\r\n* Add world_state_napi to bootstrap fast\r\n([#9079](https://github.com/AztecProtocol/aztec-packages/issues/9079))\r\n([e827056](https://github.com/AztecProtocol/aztec-packages/commit/e827056e652a4789c91a617587945d57163fa7ff))\r\n* **avm:** Revert 9080 - re-introducing start/end gas constraining\r\n([#9109](https://github.com/AztecProtocol/aztec-packages/issues/9109))\r\n([763e9b8](https://github.com/AztecProtocol/aztec-packages/commit/763e9b8a98981545b68f96e5b49a0726fc3c80b3))\r\n* **avm:** Type aliasing for VmPublicInputs\r\n([#8884](https://github.com/AztecProtocol/aztec-packages/issues/8884))\r\n([f3ed39b](https://github.com/AztecProtocol/aztec-packages/commit/f3ed39bf7be6f08bcfcabf6c04eb570f4d06ed27))\r\n* **ci:** Parallelise CI for acir-test flows\r\n([#9238](https://github.com/AztecProtocol/aztec-packages/issues/9238))\r\n([73a7c23](https://github.com/AztecProtocol/aztec-packages/commit/73a7c231193d56fdbf2e1160be5ea8d58f5596bb))\r\n* Configure trees instead of duplicating constants\r\n([#9088](https://github.com/AztecProtocol/aztec-packages/issues/9088))\r\n([c1150c9](https://github.com/AztecProtocol/aztec-packages/commit/c1150c9b28581985686b13ba97eb7f0066736652))\r\n* **docs:** Rewriting bbup script, refactoring bb readme for clarity\r\n([#9073](https://github.com/AztecProtocol/aztec-packages/issues/9073))\r\n([662b61e](https://github.com/AztecProtocol/aztec-packages/commit/662b61e4c20a2d4217980922d4578f4dfeacae6b))\r\n* Eccvm transcript builder\r\n([#9026](https://github.com/AztecProtocol/aztec-packages/issues/9026))\r\n([d2c9ae2](https://github.com/AztecProtocol/aztec-packages/commit/d2c9ae2853bb75cd736583406a57e96645bd2e88))\r\n* Pass by const reference\r\n([#9083](https://github.com/AztecProtocol/aztec-packages/issues/9083))\r\n([764bba4](https://github.com/AztecProtocol/aztec-packages/commit/764bba4dd8a016d45b201562ec82f9a12de65c2d))\r\n* Remove keccak256 opcode from ACIR/Brillig\r\n([#9104](https://github.com/AztecProtocol/aztec-packages/issues/9104))\r\n([4c1163a](https://github.com/AztecProtocol/aztec-packages/commit/4c1163a9e9516d298e55421f1cf0ed81081151dd))\r\n* Remove pedersen commitment\r\n([#9107](https://github.com/AztecProtocol/aztec-packages/issues/9107))\r\n([1823bde](https://github.com/AztecProtocol/aztec-packages/commit/1823bde2b486827f33a87899074594f811cfbef4))\r\n* Remove pedersen hash opcode\r\n([#9245](https://github.com/AztecProtocol/aztec-packages/issues/9245))\r\n([1f0538f](https://github.com/AztecProtocol/aztec-packages/commit/1f0538f00cadcf4325d2aa17bdb098d11ca3840f))\r\n* Revert \"feat(avm): constrain start and end l2/da gas\r\n([#9031](https://github.com/AztecProtocol/aztec-packages/issues/9031))\"\r\n([#9080](https://github.com/AztecProtocol/aztec-packages/issues/9080))\r\n([07e4c95](https://github.com/AztecProtocol/aztec-packages/commit/07e4c956494154685970849bc4dda60c25af31bc))\r\n* Revert deletion of the old bbup\r\n([#9146](https://github.com/AztecProtocol/aztec-packages/issues/9146))\r\n([3138078](https://github.com/AztecProtocol/aztec-packages/commit/3138078f0062d8426b3c45ac47646169317ab795))\r\n</details>\r\n\r\n---\r\nThis PR was generated with [Release\r\nPlease](https://github.com/googleapis/release-please). See\r\n[documentation](https://github.com/googleapis/release-please#release-please).",
          "timestamp": "2024-10-18T14:33:50+01:00",
          "tree_id": "7d106bcfa54adb07689f24f01d28acfb256af236",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ab0c80d7493e6bdbc58dcd517b248de6ddd6fd67"
        },
        "date": 1729260875780,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29570.52335999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27792.735537 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5347.198416999987,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5046.412398 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 86872.24220400001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 86872244000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15149.806839,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15149808000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2733243711,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2733243711 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 126371290,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 126371290 ns\nthreads: 1"
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
          "id": "6ce20e95c1cc24b6da37cd93f4417e473a3656e5",
          "message": "chore(master): Release 0.59.0 (#9281)\n\n:robot: I have created a release *beep* *boop*\r\n---\r\n\r\n\r\n<details><summary>aztec-package: 0.59.0</summary>\r\n\r\n##\r\n[0.59.0](https://github.com/AztecProtocol/aztec-packages/compare/aztec-package-v0.58.0...aztec-package-v0.59.0)\r\n(2024-10-21)\r\n\r\n\r\n### ⚠ BREAKING CHANGES\r\n\r\n* **seq:** disable sequencer and disable validator as one env var,\r\nupdate p2p listen port names\r\n([#9266](https://github.com/AztecProtocol/aztec-packages/issues/9266))\r\n\r\n### Miscellaneous\r\n\r\n* **seq:** Disable sequencer and disable validator as one env var,\r\nupdate p2p listen port names\r\n([#9266](https://github.com/AztecProtocol/aztec-packages/issues/9266))\r\n([367c38c](https://github.com/AztecProtocol/aztec-packages/commit/367c38c02b6cda494e9d3c64ea27a1cf3465f082))\r\n</details>\r\n\r\n<details><summary>barretenberg.js: 0.59.0</summary>\r\n\r\n##\r\n[0.59.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg.js-v0.58.0...barretenberg.js-v0.59.0)\r\n(2024-10-21)\r\n\r\n\r\n### Bug Fixes\r\n\r\n* Publish readme on bb.js NPM package\r\n([#9303](https://github.com/AztecProtocol/aztec-packages/issues/9303))\r\n([1d860a8](https://github.com/AztecProtocol/aztec-packages/commit/1d860a82c290d820b0fcc55b61ef68f5501f7c1b))\r\n</details>\r\n\r\n<details><summary>aztec-packages: 0.59.0</summary>\r\n\r\n##\r\n[0.59.0](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.58.0...aztec-packages-v0.59.0)\r\n(2024-10-21)\r\n\r\n\r\n### ⚠ BREAKING CHANGES\r\n\r\n* **seq:** disable sequencer and disable validator as one env var,\r\nupdate p2p listen port names\r\n([#9266](https://github.com/AztecProtocol/aztec-packages/issues/9266))\r\n\r\n### Bug Fixes\r\n\r\n* **docs:** Dapp tutorial edits\r\n([#8695](https://github.com/AztecProtocol/aztec-packages/issues/8695))\r\n([f95bcff](https://github.com/AztecProtocol/aztec-packages/commit/f95bcff9902b7e28bffcf96fbd7159b2da88e89c))\r\n* **docs:** Update debugging docs\r\n([#9200](https://github.com/AztecProtocol/aztec-packages/issues/9200))\r\n([2a4188c](https://github.com/AztecProtocol/aztec-packages/commit/2a4188ca91a1341a3dca1d052a842b730b50fd91))\r\n* Publish readme on bb.js NPM package\r\n([#9303](https://github.com/AztecProtocol/aztec-packages/issues/9303))\r\n([1d860a8](https://github.com/AztecProtocol/aztec-packages/commit/1d860a82c290d820b0fcc55b61ef68f5501f7c1b))\r\n\r\n\r\n### Miscellaneous\r\n\r\n* Re-enable test fixed by Native World State\r\n([#9289](https://github.com/AztecProtocol/aztec-packages/issues/9289))\r\n([3fd1802](https://github.com/AztecProtocol/aztec-packages/commit/3fd18028a84f1eae6e7e9d2858d5875a6e47595f)),\r\ncloses\r\n[#8306](https://github.com/AztecProtocol/aztec-packages/issues/8306)\r\n* Replace relative paths to noir-protocol-circuits\r\n([ceeab4e](https://github.com/AztecProtocol/aztec-packages/commit/ceeab4e08240884e84f08e94b32f5350c3def606))\r\n* **seq:** Disable sequencer and disable validator as one env var,\r\nupdate p2p listen port names\r\n([#9266](https://github.com/AztecProtocol/aztec-packages/issues/9266))\r\n([367c38c](https://github.com/AztecProtocol/aztec-packages/commit/367c38c02b6cda494e9d3c64ea27a1cf3465f082))\r\n</details>\r\n\r\n<details><summary>barretenberg: 0.59.0</summary>\r\n\r\n##\r\n[0.59.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.58.0...barretenberg-v0.59.0)\r\n(2024-10-21)\r\n\r\n\r\n### Miscellaneous\r\n\r\n* **barretenberg:** Synchronize aztec-packages versions\r\n</details>\r\n\r\n---\r\nThis PR was generated with [Release\r\nPlease](https://github.com/googleapis/release-please). See\r\n[documentation](https://github.com/googleapis/release-please#release-please).",
          "timestamp": "2024-10-21T15:25:03Z",
          "tree_id": "4a76a126734ed0ebb0187002c959710545efe00f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/6ce20e95c1cc24b6da37cd93f4417e473a3656e5"
        },
        "date": 1729526840684,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29716.861042999994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27509.373063000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5347.117353999991,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5061.225337000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 87341.657137,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 87341658000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15151.157868000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15151157000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2696792989,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2696792989 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 125200296,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 125200296 ns\nthreads: 1"
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
          "id": "523aa231acd22228fa6414fc8241cebdfa21eafa",
          "message": "chore(avm): some cleaning in avm prover (#9311)\n\nThe AvmProver constructor body can be replaced by calling the\r\nconstructor for prover_polynomials.\r\nFurthermore, in execute_log_derivative_inverse_round() some temporary\r\nprover_polynomials are superfluous.",
          "timestamp": "2024-10-21T20:14:50+02:00",
          "tree_id": "559157c046becc07fed9ab368a0770a5f98e0e49",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/523aa231acd22228fa6414fc8241cebdfa21eafa"
        },
        "date": 1729535913375,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 29460.341072999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 27942.879940000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5324.454023000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 5027.491238 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 87471.383593,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 87471385000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15299.117164,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15299117000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2709088876,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2709088876 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 128532386,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 128532386 ns\nthreads: 1"
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
      }
    ]
  }
}