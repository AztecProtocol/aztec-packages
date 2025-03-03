window.BENCHMARK_DATA = {
  "lastUpdate": 1741012596378,
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
          "id": "6749596f41f45b566bedf58c9c5f5a5fdca2ac11",
          "message": "feat: prepend based merge (#12093)\n\nReorganize the existing merge protocol to establish the _pre_-pending of\nsubtables of ecc ops from each circuit, rather than appending. This is\nfacilitated by classes `UltraEccOpsTable` and `EccvmOpsTable`\n(implemented in a previous PR) that handle the storage and virtual\npre-pending of subtables.\n\nThe merge protocol proceeds by opening univariate polynomials T_j,\nT_{j,prev}, and t_j (columns of full table, previous full table, and\ncurrent subtable respectively) and checking the identity T_j(x) = t_j(x)\n+ x^k * T_{j,prev}(x) at a single challenge point. (Polynomials t_j are\nexplicitly degree checked in main protocol via a relation that checks\nthat they are zero beyond idx k-1).\n\nNote: Missing pieces in the merge are (1) connecting [t] from the main\nprotocol to [t] in the merge and (2) connecting [T] from step i-1 to\n[T_prev] at step i. These will be handled in follow ons.",
          "timestamp": "2025-02-26T11:01:31-07:00",
          "tree_id": "d25cf6fad7b3b5b413f7e8a87456044865c3d14a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/6749596f41f45b566bedf58c9c5f5a5fdca2ac11"
        },
        "date": 1740595387740,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18296.289300999888,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16247.807529 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18891.91436300007,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16501.721402000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4009.243207000054,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3167.3543530000006 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55190.336882,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55190337000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10988.607329,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10988610000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1902961206,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1902961206 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 222074163,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 222074163 ns\nthreads: 1"
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
          "id": "cc0130ab2626421ef537da0069fcac72a8291cce",
          "message": "chore: enabling `e2e_contract_updates` in CI + nuking irrelevant test (#12293)",
          "timestamp": "2025-02-26T18:12:00Z",
          "tree_id": "4336394ad3dbd91cb0609a8c368d88e35b087b4a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/cc0130ab2626421ef537da0069fcac72a8291cce"
        },
        "date": 1740595482773,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18553.241402000138,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16325.891835 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18768.78591400009,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16348.242003000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4018.8767839999855,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3143.8382229999993 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54914.925358,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54914926000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9962.699479,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9962710000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1920207300,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1920207300 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 222058131,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 222058131 ns\nthreads: 1"
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
          "id": "e200f8bec616608557bfc170732e126fa4866472",
          "message": "feat: Sync from noir (#12298)\n\nAutomated pull of development from the\n[noir](https://github.com/noir-lang/noir) programming language, a\ndependency of Aztec.\nBEGIN_COMMIT_OVERRIDE\nchore!: bump msrv to 1.85.0\n(https://github.com/noir-lang/noir/pull/7530)\nfix: No longer error on INT_MIN globals\n(https://github.com/noir-lang/noir/pull/7519)\nfix: correctly format trait function with multiple where clauses\n(https://github.com/noir-lang/noir/pull/7531)\nchore(ssa): Do not run passes on Brillig functions post Brillig gen\n(https://github.com/noir-lang/noir/pull/7527)\nEND_COMMIT_OVERRIDE\n\n---------\n\nCo-authored-by: guipublic <guipublic@gmail.com>\nCo-authored-by: guipublic <47281315+guipublic@users.noreply.github.com>",
          "timestamp": "2025-02-26T18:30:44Z",
          "tree_id": "f92b615b79884a0cd9e8c6aeb900d95a8486a23d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e200f8bec616608557bfc170732e126fa4866472"
        },
        "date": 1740596524330,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18104.259960000036,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15971.020394000001 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18823.434158000055,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16333.626006999999 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3968.3651579998696,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3158.376714 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55146.739344,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55146740000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10563.580955000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10563585000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1901821191,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1901821191 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 216192054,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 216192054 ns\nthreads: 1"
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
          "id": "2e7b2da5e501bc53c6e5b7d2b7e1ebcf8b24bb57",
          "message": "fix(e2e): p2p_reqresp (#12297)",
          "timestamp": "2025-02-26T19:05:13Z",
          "tree_id": "210d9d8fdf8dd792fd4e69f1a3eaa569edd6f10c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/2e7b2da5e501bc53c6e5b7d2b7e1ebcf8b24bb57"
        },
        "date": 1740598513957,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18251.62955199994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16108.402033 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18708.35237899996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16398.936315 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4043.4944029998405,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3155.3163900000004 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55270.374791999995,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55270375000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10111.255833000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10111262000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1898839111,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1898839111 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 223448150,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 223448150 ns\nthreads: 1"
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
          "id": "f59f91e450e481981b374e9209304789f54d6d22",
          "message": "chore: Do not set CI_FULL outside CI (#12300)\n\nDo not set the CI_FULL env var if running outside CI",
          "timestamp": "2025-02-26T16:26:10-03:00",
          "tree_id": "bad4bd99d2f608711361c5d7d47bdce1a6c69a49",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f59f91e450e481981b374e9209304789f54d6d22"
        },
        "date": 1740599593294,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18188.986916999966,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16187.990658 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18748.61619300009,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16406.915736 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4084.0826060002655,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3098.577419 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55281.217712,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55281213000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11351.215530000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11351218000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1920878002,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1920878002 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 222799485,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 222799485 ns\nthreads: 1"
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
          "id": "fcf6278d376e9393d242d6c68f4df5d738ce75ab",
          "message": "chore!: enable multiple L1 nodes to be used (#11945)\n\n- Updates `ETHEREUM_HOST` env var to `ETHEREUM_HOSTS`. Using a single\nhost should still work as it did before\n- Single `ViemWalletClient` & `ViemPublicClient`\n\nBREAKING CHANGE:\n- env var `ETHEREUM_HOST` -> `ETHEREUM_HOSTS`\n- CLI arg `--l1-rpc-url` -> `--l1-rpc-urls`\n- TypeScript configs with `l1RpcUrl` -> `l1RpcUrls`\n- aztec.js functions with `l1RpcUrl` -> `l1RpcUrls`\n- `DeployL1Contracts` (type) -> `DeployL1ContractsReturnType`\n\nFixes #11790 \n\nFollow-up #12254",
          "timestamp": "2025-02-26T19:23:15Z",
          "tree_id": "41392dcf4b4e30c692d15e1c644bad2d97ebda3c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/fcf6278d376e9393d242d6c68f4df5d738ce75ab"
        },
        "date": 1740599599402,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18306.747417,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15949.069419 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18811.581847999834,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16396.840817 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3932.524032999936,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3172.3505649999997 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55308.658141,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55308658000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11126.477631999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11126481000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1898424441,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1898424441 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 226836388,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 226836388 ns\nthreads: 1"
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
          "id": "62faad5cf843bcc0655ac98f2dec8e7bc2378e29",
          "message": "chore: new mnemonic deployments on sepolia (#12076)\n\nFixes #11765 \nUpdating how we make sepolia deployments on k8s. \nInstead of fixed pre-funded addresses, we have a single private key that\nfunds new addresses for each new deployment.\nAlso fixes setting up the transaction bot for sepolia deployments",
          "timestamp": "2025-02-26T19:23:51Z",
          "tree_id": "e87c326d376181a2bdf364965ff06562e04c82a6",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/62faad5cf843bcc0655ac98f2dec8e7bc2378e29"
        },
        "date": 1740599612708,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18408.850437999943,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16101.926566 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18735.460719000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16350.875583000001 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3988.0140329998994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3182.173379 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55356.050455000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55356050000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9688.407573,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9688412000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1896751537,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1896751537 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 213749965,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 213749965 ns\nthreads: 1"
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
          "id": "894273fdbd8e29caa2b0d76dd556ef97d117c8a1",
          "message": "chore: Reenable dapp subscription test (#12304)\n\nFixes #12296\nFixes #6651",
          "timestamp": "2025-02-26T19:47:00Z",
          "tree_id": "092b227b4e163dc24c443a41ca98d77612e66364",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/894273fdbd8e29caa2b0d76dd556ef97d117c8a1"
        },
        "date": 1740600990026,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18275.02492799999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15981.279989999999 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18781.566085000122,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16392.794237000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4013.656114999776,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3126.2238079999997 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55048.995983999994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55048994000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11622.939715999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11622951000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1887216217,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1887216217 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 214004504,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 214004504 ns\nthreads: 1"
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
          "id": "3cb6920eae9814919e135d8715ef445f3c5cc8e0",
          "message": "chore: Lazy loading artifacts everywhere (#12285)\n\nThis PR adds the *option* to lazily load JSON artifacts in all the\npackages that were missing that functionality, further improving bundle\nsizes for the browser and allowing us to finally put limits on our\nexample apps bundle sizes:\n\n* `noir-protocol-circuits-types/vks`: now allow vk lazy imports via the\n`LazyArtifactProvider` in the `/client` export, while maintaining the\nbundled version for the server under `/server/vks`\n* `accounts`: Now all exports provide a lazy version, e.g:\n`@aztec/accounts/schnorr/lazy`. This has proven to be complicated due to\nthe testing import leaking into the browser (where type assertions are\nnot widely supported). Now there's also `/testing/lazy`. This testing\npackage is needed in the browser for the prefunded accounts.\n* `protocol-contracts`: Now with a lazy version and exporting\n`ProtocolContractProviders` so that PXE can be configured with bundled\nand lazy versions.\n\n\nBesides the type assertion issue, we absolutely want to keep bundled and\nlazy versions because some environments don't play well with `await\nimport` (namely service workers in firefox)\n\n---------\n\nCo-authored-by: esau <152162806+sklppy88@users.noreply.github.com>",
          "timestamp": "2025-02-26T19:56:40Z",
          "tree_id": "63024bdc8fea5767ee221e8d0791de57da85da45",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/3cb6920eae9814919e135d8715ef445f3c5cc8e0"
        },
        "date": 1740601561469,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18271.652731000133,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16225.018531 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18769.05979000003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16323.808413000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3963.6365950000254,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3162.7365649999992 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55260.706969,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55260707000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10194.521936,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10194525000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1910639338,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1910639338 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 217566535,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 217566535 ns\nthreads: 1"
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
          "id": "31c80347245f030ee6be4313e187cf000861556e",
          "message": "feat!: rename compute_nullifier_without_context (#12308)\n\nFollow up from #12240. This aligns both compute nullifier functions.\nWith the new metadata bits calling this is quite simple, and it's very\nclear that we're only using it for note discovery. Some macros were\nsimplified a bit as a result as well.",
          "timestamp": "2025-02-26T21:24:38Z",
          "tree_id": "654efb8f4f3a2d6ce25a22700ee689b5f2e91474",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/31c80347245f030ee6be4313e187cf000861556e"
        },
        "date": 1740607075371,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17980.09371099988,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15937.175013999999 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18543.606648999914,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16239.573944 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3917.8687190001256,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3071.3308740000007 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54764.119191,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54764115000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10786.79508,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10786797000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1912813568,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1912813568 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 213166604,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 213166604 ns\nthreads: 1"
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
            "email": "santiago@aztecprotocol.com",
            "name": "Santiago Palladino",
            "username": "spalladino"
          },
          "distinct": true,
          "id": "46ef22b9c0a2532aebe63c9b9fa2bf47cd4e2f56",
          "message": "revert: \"chore: Fix and reenable fees-settings test (#12302)\"\n\nThis reverts commit dbcb2b10ab1b85b675d83613aa527ca088964bd4.",
          "timestamp": "2025-02-26T19:17:27-03:00",
          "tree_id": "01d7b6451214a3eb54b68c5af730391f878988be",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/46ef22b9c0a2532aebe63c9b9fa2bf47cd4e2f56"
        },
        "date": 1740609244663,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18137.420160999965,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15986.934587999998 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18508.27914100006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16207.515645000001 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3885.8780129999673,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3041.6197289999996 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55340.671415000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55340670000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11588.661279,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11588665000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1921714664,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1921714664 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 213529522,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 213529522 ns\nthreads: 1"
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
          "id": "44748dd058d9fb162bdd9fa2e365e626ad437201",
          "message": "fix: slack notify was broken by quoted commit titles",
          "timestamp": "2025-02-26T15:50:54-07:00",
          "tree_id": "d7999ddd0f0847055a4b53f7f47a636db482c7a9",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/44748dd058d9fb162bdd9fa2e365e626ad437201"
        },
        "date": 1740611223485,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18138.099802999932,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16132.673616000002 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18538.52034199997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16108.854083999997 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3887.927434000062,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3040.731724 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54761.61181,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54761612000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9493.100714,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9493103000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1902488144,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1902488144 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 219882276,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 219882276 ns\nthreads: 1"
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
          "id": "e83fe03b8fb93c990f332d3fb31ebc35cf9a1d19",
          "message": "feat: Slack message to ci channel tagging owners on flakes. (#12284)\n\n* .test_skip_patterns is now .test_patterns.yml and assigns owners to\ntests.\n* If in CI and a matching test fails, it doesnt fail the build but\nslacks the log to the owner.\n* Some additional denoise header metadata.\n* We still \"fail fast\" when doing a test run locally.",
          "timestamp": "2025-02-26T22:52:21Z",
          "tree_id": "4e461dc26b6f38542403a08ef9a318631b1345d9",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e83fe03b8fb93c990f332d3fb31ebc35cf9a1d19"
        },
        "date": 1740612120092,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18413.378018999992,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16299.849970000001 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18763.52351200012,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16369.790009999999 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4001.129346000198,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3150.7979550000005 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55032.740424,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55032741000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9293.240442999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9293242000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1912368646,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1912368646 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 212168083,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 212168083 ns\nthreads: 1"
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
          "id": "f9f598d0692dd22471b563dbc95d0a1f2c3eb8af",
          "message": "chore: flakes. for lasse. (#12316)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\nline.",
          "timestamp": "2025-02-26T23:54:46Z",
          "tree_id": "38ad3c2ed1c6a3503196916cf9b3270c94a5a88e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f9f598d0692dd22471b563dbc95d0a1f2c3eb8af"
        },
        "date": 1740615639650,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18344.22951300007,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16226.207793 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18803.769282000074,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16294.932283000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4007.930801999919,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3203.6870959999997 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55156.586070000005,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55156587000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11084.904166,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11084907000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1900256770,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1900256770 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 214513016,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 214513016 ns\nthreads: 1"
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
          "id": "26195f7c43e781ddcc400e69a8d4d8820fdae85c",
          "message": "yolo e2e default reporter",
          "timestamp": "2025-02-27T09:28:10Z",
          "tree_id": "d32767a8697bb1459c2489fc159274994931d0b7",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/26195f7c43e781ddcc400e69a8d4d8820fdae85c"
        },
        "date": 1740651545760,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18176.63603899996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15970.775173 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18889.10868800008,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16396.421225 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4033.7630009998975,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3235.5141030000004 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55362.870863000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55362869000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11260.997604,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11261009000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1924542377,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1924542377 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 214893156,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 214893156 ns\nthreads: 1"
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
          "id": "107c41ca3586d5bba0d56be436a2b11af3721c76",
          "message": "yolo extend timeout on test-local",
          "timestamp": "2025-02-27T09:51:57Z",
          "tree_id": "d4f29e4ff0fd86a75827303e8441f97b9c8159e7",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/107c41ca3586d5bba0d56be436a2b11af3721c76"
        },
        "date": 1740651688791,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18230.892638000114,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16218.469577 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18838.092953000116,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16369.30958 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4050.763841999924,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3143.0653839999995 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55393.655284,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55393655000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11214.694132,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11214701000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1928175767,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1928175767 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 211582741,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 211582741 ns\nthreads: 1"
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
          "id": "a36334092980138bbe2e9f6e90aefd8489108e6a",
          "message": "docs: Fee concepts page (#12281)\n\nCloses: https://github.com/AztecProtocol/aztec-packages/issues/9619",
          "timestamp": "2025-02-27T10:11:42Z",
          "tree_id": "573882f9c281c6008b6bd37e37fef97e762d3254",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a36334092980138bbe2e9f6e90aefd8489108e6a"
        },
        "date": 1740652925490,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18003.203812000036,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15873.714796 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18552.717323000026,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16222.006871000001 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3863.161099000081,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3083.643147 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54631.362506000005,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54631364000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10960.663953000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10960671000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1910422777,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1910422777 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 215281950,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 215281950 ns\nthreads: 1"
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
          "id": "350e31cd53414f36066f5beb59cb25468f558d33",
          "message": "feat(avm): Scalar mul (#12255)\n\nImplement scalar mul gadget\n\n---------\n\nCo-authored-by: fcarreiro <facundo@aztecprotocol.com>",
          "timestamp": "2025-02-27T11:14:13+01:00",
          "tree_id": "8729721583669c556d45dc55511dac650db91e85",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/350e31cd53414f36066f5beb59cb25468f558d33"
        },
        "date": 1740653820925,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18301.66582999982,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16279.794327000001 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18784.85827500026,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16465.014841000004 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4048.8585950001834,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3227.9421199999997 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55294.992741,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55294993000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10851.714457,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10851715000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1885870961,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1885870961 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 213160237,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 213160237 ns\nthreads: 1"
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
            "email": "5764343+charlielye@users.noreply.github.com",
            "name": "Charlie Lye",
            "username": "charlielye"
          },
          "distinct": true,
          "id": "fd5623ff6400e72f1c1d44a79e74b32cb75d3ced",
          "message": "skip test-local as currently straight broken",
          "timestamp": "2025-02-27T11:06:46Z",
          "tree_id": "88c71c510d2c35ebb71fa90009c46f7de29d6633",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/fd5623ff6400e72f1c1d44a79e74b32cb75d3ced"
        },
        "date": 1740655548700,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17866.746497999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15770.071739 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18498.92563600008,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16011.8173 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3937.0831370000587,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3097.0220990000003 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54746.462700000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54746465000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11366.09799,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11366105000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1892177735,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1892177735 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 214794050,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 214794050 ns\nthreads: 1"
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
          "id": "e632bd7e58e31b19d5f85cb461d5b7ca80ece697",
          "message": "feat: expose bb_wasm_path in foundation and bb-prover (#12330)\n\nAllows alternative `.wasms` file to be loaded into `bb.js` from both\n`foundation` (and thus, `aztec.js`) and `bb-prover`.\n\nThis is useful in itself, but the aim of this PR is solving\nhttps://github.com/AztecProtocol/aztec-packages/issues/11963 by allowing\nbypassing the lazy loading of bb wasms (disguised as js files)\n\nThis PR also prepares boxes and playground for strict size limits by\nensuring no artifacts are included in main bundles.",
          "timestamp": "2025-02-27T13:18:24+01:00",
          "tree_id": "ac256f9679b19ed42fdbd61fe6f13a6f9fbcf961",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e632bd7e58e31b19d5f85cb461d5b7ca80ece697"
        },
        "date": 1740660719907,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18293.629009999902,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15995.684612 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18681.593179999938,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16476.041547 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3942.440311000155,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3161.642472 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55190.936725,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55190939000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10067.836023,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10067838000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1897233898,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1897233898 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 212535250,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 212535250 ns\nthreads: 1"
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
          "id": "2b94e626ed48195c2bf0a3b718751347699e827d",
          "message": "feat: add gates command for client_ivc in new cli (#12323)\n\n- Add --scheme flag for gates command in the new bb cli + implement for\nclient_ivc (use existing method)\n- Update usages in flamegraph and profiler (this was already broken as\nprevious `gates_for_ivc` command was moved under OLD_API flag)",
          "timestamp": "2025-02-27T12:42:28Z",
          "tree_id": "0b52941f50252a37745e84b5920ef8cd21b9360b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/2b94e626ed48195c2bf0a3b718751347699e827d"
        },
        "date": 1740662187935,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18278.924999000083,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15978.519194999999 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18875.075554999967,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16549.545395999998 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3936.8078879999757,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3154.7347390000004 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55604.984584,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55604985000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10837.111183,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10837118000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1911647599,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1911647599 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 215596943,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 215596943 ns\nthreads: 1"
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
          "id": "7b7ef154eb6bbe802bce89518a15d4aaed194565",
          "message": "refactor: run separate anvils for the l1 cheatcode tests (#12334)",
          "timestamp": "2025-02-27T12:55:00Z",
          "tree_id": "7b168d4ba6899627cd59b43759cb1ef61b148022",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7b7ef154eb6bbe802bce89518a15d4aaed194565"
        },
        "date": 1740662764057,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18270.141677000083,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16127.697770999997 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18777.5182219998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16372.404836999998 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3967.964168000208,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3198.9219090000006 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55022.847493,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55022852000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10283.098544000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10283104000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1911372272,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1911372272 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 220355679,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 220355679 ns\nthreads: 1"
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
            "email": "mvezenov@gmail.com",
            "name": "Maxim Vezenov",
            "username": "vezenovm"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "ed3249904bf113ff2818499eff15069a5192c455",
          "message": "fix(aztec-nr): Use mutable ref when mutating variable in closure (#12311)\n\nPost https://github.com/noir-lang/noir/pull/7488 aztec-nr is going to\nfail to compile as we now explicitly error when attempting to use a\ncapture mutably (lambda captures are meant to be entirely immutable).\nThe current code only worked because it was done at comptime.",
          "timestamp": "2025-02-27T13:29:23Z",
          "tree_id": "66e68fc5570f89932425f42620c86cc7b3b815ac",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ed3249904bf113ff2818499eff15069a5192c455"
        },
        "date": 1740665206187,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18330.625191999843,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16158.300750000002 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18840.65656300004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16430.807674 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3994.051480000053,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3193.1216780000004 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55007.640242999994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55007640000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9571.853281000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9571861000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1902591005,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1902591005 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 215236958,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 215236958 ns\nthreads: 1"
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
          "id": "393a2df61356b90fc3c89a9af2423e1739bea733",
          "message": "chore: bump time to notice prune to 1s in slasher_client test (#12336)",
          "timestamp": "2025-02-27T14:32:34Z",
          "tree_id": "af073b02cefc08458fe7db044de36c07c06e8ebc",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/393a2df61356b90fc3c89a9af2423e1739bea733"
        },
        "date": 1740668952189,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18286.027038000157,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16164.096849 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18765.74957899993,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16296.859296 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3928.9755610000157,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3120.13758 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54903.084396,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54903085000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9981.935817,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9981938000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1898653585,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1898653585 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 212950689,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 212950689 ns\nthreads: 1"
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
          "id": "8181149877386eca54ee7a8b578a68ccb0c9585e",
          "message": "fix: make block number in txe make sense (#11807)\n\nRight now `env.block_number()` returns the block number that is\ncurrently being built, as per an arbitrary choice when creating the TXe.\n\nBut this has a strange side effect of the current block (from the\nheader) and `env.block_number()` not matching up. The current header has\n`env.block_number() - 1` because the current header reflects the state\nof the last committed block.\n\nBefore this mattered less because we couldn't do historical proofs, and\nbecause we had less of a notion of \"correctness\" in blocks but now due\nto the changes this makes sense to change.\n\n---------\n\nCo-authored-by: benesjan <janbenes1234@gmail.com>",
          "timestamp": "2025-02-28T00:56:52+09:00",
          "tree_id": "a0f65e9c893095731465799cf250fd107b397440",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8181149877386eca54ee7a8b578a68ccb0c9585e"
        },
        "date": 1740674081232,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18267.676931000096,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16197.836061 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18783.73483900009,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16513.480575 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3955.0182509997285,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3178.1439890000006 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55000.963178,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55000964000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9752.227081,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9752233000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1942346365,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1942346365 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 213344019,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 213344019 ns\nthreads: 1"
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
          "id": "40a6a6f264f49887730ecc25798c1abd1d7ae8cb",
          "message": "chore: remove issue tag 9887 (#12340)\n\nIssue was closed, just doing some cleanup",
          "timestamp": "2025-02-27T16:37:01Z",
          "tree_id": "4d521a63564e4a6ad18388a153eaf6c78e4404c1",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/40a6a6f264f49887730ecc25798c1abd1d7ae8cb"
        },
        "date": 1740676479066,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18117.174863999935,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15897.971957 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18668.417956999976,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16208.047050000001 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3869.366413000307,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3024.8840609999993 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54856.294204,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54856296000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10916.905830000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10916909000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1926222863,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1926222863 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 212989622,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 212989622 ns\nthreads: 1"
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
          "id": "1a62148a0195a29ab4917aa57a295af3f9c323fe",
          "message": "fix: yoinked from 02-19-kind_upgrade_test (#12331)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\nline.\n\n---------\n\nCo-authored-by: Mitch <mitchell@aztecprotocol.com>",
          "timestamp": "2025-02-27T16:48:09Z",
          "tree_id": "931ec3982c7920210df3e6d5232851687f00ea79",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1a62148a0195a29ab4917aa57a295af3f9c323fe"
        },
        "date": 1740676960234,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18369.290391999813,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16105.906621000002 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18805.469405000167,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16230.685159 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3959.882074999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3165.6275080000005 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54992.765916,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54992766000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9495.19599,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9495201000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1905883630,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1905883630 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 213635600,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 213635600 ns\nthreads: 1"
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
            "email": "5764343+charlielye@users.noreply.github.com",
            "name": "Charlie Lye",
            "username": "charlielye"
          },
          "distinct": true,
          "id": "1693c5fa368a4eca930d6bc35cefa01cb448e25d",
          "message": "yolo bold refname",
          "timestamp": "2025-02-27T16:49:28Z",
          "tree_id": "624bd70324fc51986d12686fb991704d01c84fb2",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1693c5fa368a4eca930d6bc35cefa01cb448e25d"
        },
        "date": 1740677019719,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18400.16199899992,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16249.362062 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18812.089658999867,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16577.572062000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3948.0537649999405,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3190.4476199999995 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55143.911405,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55143913000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10189.345286,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10189351000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1935976556,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1935976556 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 213131868,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 213131868 ns\nthreads: 1"
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
          "id": "a0c2ccdf5352f719f60c911a873cdd7cb6364e13",
          "message": "fix(p2p): reduce bench output (#12342)",
          "timestamp": "2025-02-27T17:18:33Z",
          "tree_id": "70fdf5a488c49e77162d57c68f3f74bd1a8a14e2",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a0c2ccdf5352f719f60c911a873cdd7cb6364e13"
        },
        "date": 1740678746392,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18321.154445000047,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16172.117588 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18701.161700000055,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16435.236086 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4020.086952999918,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3167.2661500000004 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54817.694911,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54817696000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10259.079995999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10259084000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1908146964,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1908146964 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 214570290,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 214570290 ns\nthreads: 1"
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
          "id": "01b535cd08e1ebf6013d17f315eba8b2dc77ca8c",
          "message": "chore: delete proof verifier (#12327)\n\n## Overview\n\nNo longer used",
          "timestamp": "2025-02-27T12:20:26-05:00",
          "tree_id": "768d7b8140bab593041c0320234e95fcaffed22f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/01b535cd08e1ebf6013d17f315eba8b2dc77ca8c"
        },
        "date": 1740679086036,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18127.841511000042,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16019.904981 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18726.024791999862,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16349.011328999999 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3926.8199529999492,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3132.8231480000004 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55122.558227,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55122559000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10977.931411,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10977939000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1919578780,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1919578780 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 213281869,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 213281869 ns\nthreads: 1"
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
          "id": "ac5de42427674f8edd9b54c2e7c4d258b0085574",
          "message": "fix: Revert \"fix: assert import type in lazt artifact imports\" (#12349)\n\nReverts AztecProtocol/aztec-packages#12344",
          "timestamp": "2025-02-27T19:43:34+01:00",
          "tree_id": "768d7b8140bab593041c0320234e95fcaffed22f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ac5de42427674f8edd9b54c2e7c4d258b0085574"
        },
        "date": 1740683221506,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18075.414656999896,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15902.417598 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18621.892554000056,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16186.176175 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3843.656913000018,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3051.711703 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54601.38200700001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54601384000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9396.401094999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9396404000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1890682487,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1890682487 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 212073533,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 212073533 ns\nthreads: 1"
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
          "id": "a301f72494f7ba97e4e8cbc5b03795e2a144b95c",
          "message": "feat: add historical library tests and remove old inclusion proof contract / related tests (#12215)\n\nAdding txe tests to the historical apis, and removing inclusion proofs\ncontract with corresponding (flaky) e2e test\n\n---------\n\nCo-authored-by: Jan Beneš <janbenes1234@gmail.com>",
          "timestamp": "2025-02-28T03:44:07+09:00",
          "tree_id": "af66c14a8dbb109a663725f6e8179d06bb05c283",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a301f72494f7ba97e4e8cbc5b03795e2a144b95c"
        },
        "date": 1740684104494,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18316.923787999942,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16078.906003 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18673.907032999978,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16451.053546999996 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3949.4590720000815,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3173.9207450000004 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55042.11381499999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55042117000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10461.254940000003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10461263000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1916752954,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1916752954 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 213265579,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 213265579 ns\nthreads: 1"
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
          "id": "061189d9e11d021f75a4df3ab6df2aea2ffe6981",
          "message": "feat: Cycle Group Fuzzer (#12154)\n\nThis pr introduces a fuzzer for `stdlib::primitives::cycle_group`",
          "timestamp": "2025-02-27T22:05:02+03:00",
          "tree_id": "26d992d96f800b37be499a6b39d8f6b6a9604e4b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/061189d9e11d021f75a4df3ab6df2aea2ffe6981"
        },
        "date": 1740685613621,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18288.63474600007,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16241.590959 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18888.022007000018,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16484.931487 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4049.845265000158,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3139.0568969999995 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55108.338433,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55108340000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10887.047397,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10887048000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1902091044,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1902091044 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 218172628,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 218172628 ns\nthreads: 1"
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
          "id": "c98276379ad51267d446ef549bde34cfc032f648",
          "message": "chore(avm): disconnect VM1 (#12346)\n\n![unnamed-1.png](https://graphite-user-uploaded-assets-prod.s3.amazonaws.com/mO08Q17TCoHzVKYudUJh/bb553009-1c23-4bc3-a5de-bcf2b886652a.png)\n\nWe are currently working on VM2 and having to maintain backwards compatibility with VM1 has reached a tipping point. This PR disconnects VM1 from the native BB binary and makes it always report success.\n\nAs a result\n* `bb-prover` tests don't mean a thing (except the v2 one)\n* the proving part of e2e_full_proving becomes meaningless\n* **We will not be proving in any dev/testnet until we connect vm2!**\n* This doesn't change recursive verification in the base rollup because we were already not doing that (too expensive until Goblinized).\n\nHowever, this should let us move faster and we should be able to connect vm2 \"soon\".\n\nHaving VM1 connected is currently blocking work on changing the hinting schema etc.",
          "timestamp": "2025-02-27T19:15:24Z",
          "tree_id": "1040fcd862e2de16a93c3cc699f07728342d13a4",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c98276379ad51267d446ef549bde34cfc032f648"
        },
        "date": 1740686555112,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18349.109392000173,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16237.156244999998 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18796.796684000128,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16479.866185000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3993.165429000328,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3176.4081870000005 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55149.917870000005,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55149920000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11816.434522,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11816437000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1884382079,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1884382079 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 212636124,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 212636124 ns\nthreads: 1"
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
          "id": "b1dc585d59066b3ee80ac67611f8aef9cc7034f4",
          "message": "fix: just give the thing a different namespace (#12353)",
          "timestamp": "2025-02-27T14:17:46-05:00",
          "tree_id": "dc294f90a1d1c818851578f681581b941443681a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/b1dc585d59066b3ee80ac67611f8aef9cc7034f4"
        },
        "date": 1740686723149,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18257.514246000028,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16027.352928999999 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18703.219622999768,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16360.549045999998 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3945.711534000111,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3135.478999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55382.821542000005,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55382824000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9734.464826000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9734468000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1915774007,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1915774007 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 229299710,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 229299710 ns\nthreads: 1"
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
          "id": "93dc92a89abb238ef5f1828f6fddc9242fac2c45",
          "message": "feat: Merge queue workflow changes. (#12378)\n\nMerge queue can be enable to turn on grinder.",
          "timestamp": "2025-02-28T17:57:39Z",
          "tree_id": "585391b48f0f0526c59cc91c5976a7ea23381c18",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/93dc92a89abb238ef5f1828f6fddc9242fac2c45"
        },
        "date": 1740767298238,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18106.343143000006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15852.526571000002 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18676.916126999913,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16363.347029 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3935.0266500000544,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3038.3764120000005 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54971.052274999995,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54971053000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10144.177441,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10144182000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1916007782,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1916007782 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 213097719,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 213097719 ns\nthreads: 1"
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
          "id": "d583b09373c21ca34dac96e0f4bb102c48f3f1e1",
          "message": "feat: add include_gates_per_opcode flag for gates command (#12328)\n\n`gates_per_opcode` in JSON output of `bb gates` command is not useful\napart from the usage in flamegraph.\nThis PR moves it under a flag - cleaner output for external users.\n\n\nTodo: [Noir\ndocs](https://github.com/noir-lang/noir/blob/master/docs/docs/tooling/profiler.md#generate-a-backend-gates-flamegraph)\nneeds to be updated once bb is released",
          "timestamp": "2025-02-28T18:30:10Z",
          "tree_id": "9fd9c87560aacdb452f9924dc53b3dbe3484eea2",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d583b09373c21ca34dac96e0f4bb102c48f3f1e1"
        },
        "date": 1740769624719,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18353.995720000057,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16119.411632999998 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18670.340733999867,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16533.251466 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3914.379697999948,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3109.0360809999997 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55233.23407900001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55233235000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9953.331647,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9953337000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1887623533,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1887623533 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 212338548,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 212338548 ns\nthreads: 1"
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
          "id": "e31f0f4a463f16901e63aad844f150e7c89365c8",
          "message": "chore: Increase timeout for prover full (#12379)",
          "timestamp": "2025-02-28T18:49:49Z",
          "tree_id": "867d7c9f9beaa854f276deff9bdd7a1ea3df7b64",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e31f0f4a463f16901e63aad844f150e7c89365c8"
        },
        "date": 1740770675263,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18210.031165999906,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16082.486762000002 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18686.146706000043,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16276.852501000001 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3948.7047889997484,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3158.6834809999996 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55304.101214999995,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55304101000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11257.793598,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11257796000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1885726675,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1885726675 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 218546338,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 218546338 ns\nthreads: 1"
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
          "id": "0a03c7a09ae13dacb10411693f656bbeeb3477db",
          "message": "chore: always verify clientivc (#12310)\n\nThis prevents confusion around why the rollup would fail to verify an\nIVC proof. The cost is around 100ms and worth it at least until things\nare very stable, as this sanity checks issues with our proving.",
          "timestamp": "2025-02-28T18:58:42Z",
          "tree_id": "834568445cd5a5a4d0c96ed3a8f0d7b67c02e909",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0a03c7a09ae13dacb10411693f656bbeeb3477db"
        },
        "date": 1740771892366,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18237.985586999912,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16154.040843 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18802.66592399994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16543.972029 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3959.0097529999184,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3137.748681 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55288.970914,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55288971000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11136.93087,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11136933000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1908414237,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1908414237 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 224385843,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 224385843 ns\nthreads: 1"
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
          "id": "db409c7c91c5e30756d2fc75c52048d21730c3b8",
          "message": "fix: honk_recursion flag for bb gates (#12364)\n\nAdd missing `honk_recursion` flag for `gates` command in \"new bb cli\"\nand update usages (looks like the flamegraph.sh is broken otherwise)",
          "timestamp": "2025-02-28T19:33:08Z",
          "tree_id": "99ea1dcae4eab27fd1dcf843c065f824c93a7186",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/db409c7c91c5e30756d2fc75c52048d21730c3b8"
        },
        "date": 1740773291586,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18319.939834000026,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16184.844862000002 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18816.666607000116,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16517.209723999997 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3822.234599000012,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3094.6137489999996 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55047.426954,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55047427000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9449.256136999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9449278000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1900747345,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1900747345 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 218054877,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 218054877 ns\nthreads: 1"
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
          "id": "018169d06465e72f0a8a080945dd8a064e1c70a2",
          "message": "fix: wire NPM_TOKEN (#12388)",
          "timestamp": "2025-02-28T15:40:05-05:00",
          "tree_id": "cb33520b4e8fbafec7b51abdc46498ac4f7a5a1e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/018169d06465e72f0a8a080945dd8a064e1c70a2"
        },
        "date": 1740776670039,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18469.908433,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16052.762196 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 19260.78851400007,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16539.778169 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3909.3037040001946,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3039.29913 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 56620.545659,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 56620543000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9932.343750000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9932347000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1940841252,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1940841252 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 220415682,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 220415682 ns\nthreads: 1"
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
          "id": "9d2e96b123116e2474f3aa08eaf4630b2dfae5ad",
          "message": "fix: Wait for L1 to L2 msg sync before claiming (#12386)\n\nIn order to claim an L1 to L2 msg on L2, we need to wait 2 L2 blocks to\nbe mined _after the archiver has synced the msg_. We were waiting 2 L2\nblocks since the message was sent L1, so if this happened right before\nthe end of an L2 slot, the archiver would not get to sync it in time, so\nwaiting for 2 blocks meant we only waited for **one** block after it got\nsynced.\n\nThis adds a wait for the msg to be synced in the node before waiting for\nthe two L2 blocks. The code that waited for the L2 blocks was repeated\nin three different places, and I didnt attempt to refactor it here, so\nthe fix is also repeated three times.\n\nFixes #12366",
          "timestamp": "2025-02-28T18:18:43-03:00",
          "tree_id": "c422b07af5b756304cd709d0407533ae7201ef17",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9d2e96b123116e2474f3aa08eaf4630b2dfae5ad"
        },
        "date": 1740779433646,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18142.659761999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15988.668214000001 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18657.13638400007,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16368.149578999997 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3842.780656000059,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3101.3220859999997 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55205.423163,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55205423000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11324.551264,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11324555000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1903064907,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1903064907 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 224998209,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 224998209 ns\nthreads: 1"
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
          "id": "288c0570f00e89e7af50f0b0afe2ce3b769117a6",
          "message": "fix: `uniswap_trade_on_l1_from_l2.test.ts` (#12389)",
          "timestamp": "2025-03-01T10:21:38+09:00",
          "tree_id": "605bc08e4dff8ea71a0ff536699a422306632bb9",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/288c0570f00e89e7af50f0b0afe2ce3b769117a6"
        },
        "date": 1740794128303,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18263.93893699992,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16027.12911 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18818.129537999994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16484.794111 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4003.093528000136,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3153.2355380000004 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54605.241308000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54605241000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9804.866422,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9804868000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1911481550,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1911481550 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 224947953,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 224947953 ns\nthreads: 1"
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
          "id": "f25023895c6c5baab27aadf0c5e38c3b848c8973",
          "message": "feat: prod network deployments (#12358)\n\nAdds support in the aztec-network chart to make use of external boot\nnodes and ethereum nodes while only deploying:\n- validators\n- prover infra\n- pxe\n\nThis change enables rolling upgrades by allowing nodes to connect to\nexisting boot nodes and contract addresses rather than requiring a full\ndeployment.\n\nKey changes:\n\n- Adds configuration options for external boot node host and contract\naddresses\n- Adds logic to skip waiting for services when registry address and\nbootstrap nodes are already set\n- Reduces required contract addresses to only those needed for node\noperation\n- Adds new slim.yaml configuration for minimal deployments\n- Adds test script to validate rolling upgrade scenarios",
          "timestamp": "2025-03-01T01:48:52Z",
          "tree_id": "7e0ba7a2511b94bcdf43eb93480df148382a00af",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f25023895c6c5baab27aadf0c5e38c3b848c8973"
        },
        "date": 1740795577295,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18432.989824000062,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16529.580986999998 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18806.803460999843,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16462.327586 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3893.4896550001667,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3125.7152859999997 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55431.216828,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55431217000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10096.504494,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10096508000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1942898351,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1942898351 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 212011729,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 212011729 ns\nthreads: 1"
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
          "id": "966982264a0da23546fb7695079e74b1234da790",
          "message": "chore: Add logging to isolated prover client tests and bump CPUs (#12387)\n\nTest was taking 900+ seconds with 4 CPUs, 600 with 8 CPUs (and 200s with\nunbounded CPUs on mainframe). Bumping CPUs from 4 to 16 (as the e2e\nprover full test uses) should keep this under control.\n\nAlso rollbacks increased timeout for e2e prover full.",
          "timestamp": "2025-03-01T18:12:18+08:00",
          "tree_id": "75e5d32052f2af655c224f057e08ad8e5fe2a621",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/966982264a0da23546fb7695079e74b1234da790"
        },
        "date": 1740825932805,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18294.241950000014,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16158.176792999999 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18905.296790999957,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16696.302228 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4035.9864619999826,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3180.5967650000002 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55811.363076,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55811363000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9653.699568999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9653702000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1921625742,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1921625742 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 223016353,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 223016353 ns\nthreads: 1"
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
          "id": "443d615d99f2092bcf7012600db4883449d45b64",
          "message": "fix(avm): Use standard form in ecadd trace (#12332)\n\nEcadd was using the standard form (x, y, inf) but was representing\ninfinity with (p+1/2, 0, true) instead of (0,0,true). This PR makes it\nso ecadd traces use the standard form.",
          "timestamp": "2025-03-03T11:35:19+01:00",
          "tree_id": "356e0861ee545fcfb6d69b9ee9c42842017570fc",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/443d615d99f2092bcf7012600db4883449d45b64"
        },
        "date": 1741000172394,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18191.322044000117,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16086.717512 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18939.53822100002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16299.462155000001 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3987.5755370001116,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3179.5706900000005 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55381.350218,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55381351000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9377.538685000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9377540000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1921779381,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1921779381 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 226590225,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 226590225 ns\nthreads: 1"
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
          "id": "71542737dc0ea54708dd7e8e289da169a972877b",
          "message": "feat: Watch CI3 from terminal and ci.aztec-labs.com. (#12396)\n\n* You can now `ci watch` and see each ci run.\n* You can also see the same at http://ci.aztec-labs.com.\n* For now at least, revert to running the exact commit in CI rather than\nthe master merge.\n* Fix off-by-one on gather test count.\n* Sanitize `cache_log` to require `DUP=1` to also print to term.\n* Update colors to 256 support (for consistent rendering in term and\nbrowser).\n* export `CI` when computed in `source`",
          "timestamp": "2025-03-03T11:40:23Z",
          "tree_id": "f420e9393d5646ab18e6122b59c4d13ffad2b362",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/71542737dc0ea54708dd7e8e289da169a972877b"
        },
        "date": 1741003869253,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18136.66093400002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15976.094367999998 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18722.463539999808,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16293.369211000001 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3853.805591000082,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3118.4148480000003 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55626.787313,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55626787000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10668.349804,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10668352000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1948479009,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1948479009 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 213380019,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 213380019 ns\nthreads: 1"
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
          "id": "5ac7a370a9db2ccc7e216b4401794951e5863237",
          "message": "feat: initial playground bootstrap (#12339)\n\nInitial version of a bootstrap script for playground. Just builds it,\nbut includes bundle size limits now that all artifacts have been\nextracted completely from the build via lazy loading.\n\nAll things being equal (no changes to libraries, vite itself or\nplayground code), it will allow us to notice and analyze changes in\n`aztec.js`/`pxe` packages (and its dependencies) that blow up bundle\nsizes.\n\nIt also changes the structure of the playground so it doesn't lazy load\nthe main component (better UX) in favor of a worst-case scenario (first\nmeaningful content print). This could be improved if\nhttps://github.com/drwpow/vite-plugin-bundlesize/issues/4 gets merged.",
          "timestamp": "2025-03-03T12:43:35+01:00",
          "tree_id": "625e1324ec56bd79185a18122318a6a8ae15dfc4",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5ac7a370a9db2ccc7e216b4401794951e5863237"
        },
        "date": 1741004307567,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18180.19262200005,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15969.323334 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18932.646095999873,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16297.444027999998 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3911.828149999792,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3142.9384609999997 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55579.308437,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55579309000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9527.712418000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9527723000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1896447948,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1896447948 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 211296714,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 211296714 ns\nthreads: 1"
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
          "id": "a447ad7c9688af35d8f5ca4b71b16c31ca1c5189",
          "message": "chore(bb): update some help commands (#12397)",
          "timestamp": "2025-03-03T13:28:41Z",
          "tree_id": "43bb270ddf8cf1b213a592d72a001fa269422b88",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a447ad7c9688af35d8f5ca4b71b16c31ca1c5189"
        },
        "date": 1741011211692,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18367.343477000304,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16006.297825000001 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18835.225433999767,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16376.206200000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4101.9373690000975,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3109.0268749999996 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55347.367634999995,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55347367000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10862.942696999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10862944000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1959207359,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1959207359 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 228252316,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 228252316 ns\nthreads: 1"
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