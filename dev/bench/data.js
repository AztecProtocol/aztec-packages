window.BENCHMARK_DATA = {
  "lastUpdate": 1725553223527,
  "repoUrl": "https://github.com/AztecProtocol/aztec-packages",
  "entries": {
    "C++ Benchmark": [
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
          "id": "a7443216dfaa7b2731911e2320b2c1c1a720e8e8",
          "message": "docs: Update installation info for bb and noir (#8119)\n\nPeople trip up on not having jq installed when noir instructions tell\r\nthem to use the bb command.\r\nUpdate both to smooth this out.\r\n\r\n---------\r\n\r\nCo-authored-by: Tom French <15848336+TomAFrench@users.noreply.github.com>",
          "timestamp": "2024-08-22T09:32:18Z",
          "tree_id": "0420029516b35a7b0be24484d3eab37f9d19c3dc",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a7443216dfaa7b2731911e2320b2c1c1a720e8e8"
        },
        "date": 1724320159067,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 13671.636196000009,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10562.092021 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5142.773715999993,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4741.576351999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 40214.523316,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 40214524000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14693.5976,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14693598000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3774852251,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3774852251 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 208037254,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 208037254 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3100115209,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3100115209 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 172818191,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 172818191 ns\nthreads: 1"
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
          "id": "8a1032ec4738e9b592b45500c1cf47c0e1820ad3",
          "message": "feat: Native Merkle Trees (#7037)\n\nThis PR is the first of several where we are moving to use native\r\nimplementations of Merkle Trees for performance reasons. It includes:\r\n\r\n1. The core tree implementations for both indexed trees and append only\r\ntrees.\r\n2. The introduction of LMDB as a dependency that we retrieve from GIT\r\nand build ourselves.\r\n3. The creation of a set of RAII wrapper objects around the LMDB\r\nconcepts.\r\n4. The creation of a committed/uncommitted store on top of LMDB used by\r\nthe trees for state management\r\n\r\n---------\r\n\r\nCo-authored-by: IlyasRidhuan <ilyasridhuan@gmail.com>\r\nCo-authored-by: Alex Gherghisan <alexg@aztecprotocol.com>",
          "timestamp": "2024-08-22T12:12:37Z",
          "tree_id": "853b87b91b705dfc0f1d0cc8f76370c3276fac89",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8a1032ec4738e9b592b45500c1cf47c0e1820ad3"
        },
        "date": 1724329474113,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 13750.254533000003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10445.755941 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5119.2273820000055,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4751.394111 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 40354.612466000006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 40354613000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14629.768457999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14629768000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3780387679,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3780387679 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 209307590,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 209307590 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3099326385,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3099326385 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 174060750,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 174060750 ns\nthreads: 1"
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
          "id": "b1f9fb6a4986fdfa10207ec89f8b23e14d466073",
          "message": "feat(avm): enable zeromorph in AVM verification (#8111)\n\nResolves #4944",
          "timestamp": "2024-08-22T15:10:35+02:00",
          "tree_id": "29f3db899b4876aa136b43c44c8a1fef2a4ea478",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/b1f9fb6a4986fdfa10207ec89f8b23e14d466073"
        },
        "date": 1724333393834,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 13616.287578999987,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10365.409744999999 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5052.450032999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4690.233216 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 40121.292698000005,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 40121293000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14733.815796,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14733816000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3751842381,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3751842381 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 210523123,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 210523123 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3069713219,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3069713219 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 173538164,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 173538164 ns\nthreads: 1"
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
          "id": "a5cc3bab86711062d180993cf4a7412d1013aa48",
          "message": "refactor: Deduplication in Protogalaxy (#8067)\n\nShare some code between prover and verifier, and unify some code paths\r\nin the prover where we had duplication between zero-optimized and\r\ngeneral cases.",
          "timestamp": "2024-08-22T08:19:56-07:00",
          "tree_id": "669e931ea05b9fbbdf3b56499aca1e97ea81636d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a5cc3bab86711062d180993cf4a7412d1013aa48"
        },
        "date": 1724341079951,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 13603.056498999991,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10397.184903000001 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5075.154338000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4730.568903 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 40096.241011000006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 40096241000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14805.693106,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14805693000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3762755888,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3762755888 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 208099229,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 208099229 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3097743316,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3097743316 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 173073610,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 173073610 ns\nthreads: 1"
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
          "id": "580708a1f7c18338888d83e749a0740a322c86e0",
          "message": "feat: oink recursive verifier (#8121)\n\nIntroduce an Oink recursive verifier and use it to replace the\r\nequivalent logic in Ultra and PG recursive verifiers.\r\n\r\nCloses https://github.com/AztecProtocol/barretenberg/issues/949",
          "timestamp": "2024-08-22T08:20:27-07:00",
          "tree_id": "da593a8c45d22b5e003204ff946f155e1efdfcec",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/580708a1f7c18338888d83e749a0740a322c86e0"
        },
        "date": 1724341551910,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 13596.150179999995,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10470.292163999999 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5052.010317999986,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4645.362612999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 40237.851298,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 40237851000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14713.377862,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14713377000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3781292675,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3781292675 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 208385654,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 208385654 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3080830471,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3080830471 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 173627302,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 173627302 ns\nthreads: 1"
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
          "id": "0b5048048b68514571a9113465eda564c8f1ed96",
          "message": "chore(master): Release 0.50.0 (#8032)\n\n:robot: I have created a release *beep* *boop*\r\n---\r\n\r\n\r\n<details><summary>aztec-package: 0.50.0</summary>\r\n\r\n##\r\n[0.50.0](https://github.com/AztecProtocol/aztec-packages/compare/aztec-package-v0.49.2...aztec-package-v0.50.0)\r\n(2024-08-22)\r\n\r\n\r\n### Features\r\n\r\n* Add a prover-node to the proving e2e tests\r\n([#7952](https://github.com/AztecProtocol/aztec-packages/issues/7952))\r\n([ec5a5fb](https://github.com/AztecProtocol/aztec-packages/commit/ec5a5fb8fd9c344bcb0d33a4e9f07300d3317bf2))\r\n* Add max pending txs to bot\r\n([#8046](https://github.com/AztecProtocol/aztec-packages/issues/8046))\r\n([7f5517e](https://github.com/AztecProtocol/aztec-packages/commit/7f5517ecf19e720176d4e97e07f7be557b6705d9))\r\n* Deterministic deployments for L1\r\n([#8031](https://github.com/AztecProtocol/aztec-packages/issues/8031))\r\n([abc6b19](https://github.com/AztecProtocol/aztec-packages/commit/abc6b19b9483b02aa233ce844f01cfb876102531))\r\n* Introduce validator client\r\n([#7854](https://github.com/AztecProtocol/aztec-packages/issues/7854))\r\n([e3be8e6](https://github.com/AztecProtocol/aztec-packages/commit/e3be8e6cd23fa7b7cdf341da720decd21a5d8c44))\r\n* JSON logging\r\n([#8095](https://github.com/AztecProtocol/aztec-packages/issues/8095))\r\n([048fa12](https://github.com/AztecProtocol/aztec-packages/commit/048fa12cf21de3067908c2e03b2245ef8e674d46))\r\n\r\n\r\n### Bug Fixes\r\n\r\n* Port option & extracting correct namespaced options\r\n([#8097](https://github.com/AztecProtocol/aztec-packages/issues/8097))\r\n([e74c83e](https://github.com/AztecProtocol/aztec-packages/commit/e74c83e581380fa344d1dc1cd783beb1b2d11e0e))\r\n* Txe port and aztec start options\r\n([#8071](https://github.com/AztecProtocol/aztec-packages/issues/8071))\r\n([23778c5](https://github.com/AztecProtocol/aztec-packages/commit/23778c5a0ac4fe512cde3a4b66df65f588cad305))\r\n\r\n\r\n### Miscellaneous\r\n\r\n* Configuration for bot on various networks\r\n([#8063](https://github.com/AztecProtocol/aztec-packages/issues/8063))\r\n([453a096](https://github.com/AztecProtocol/aztec-packages/commit/453a096378df57b0280be9aa52697da434e1a457))\r\n* Merge devnet fixes back to master\r\n([#8149](https://github.com/AztecProtocol/aztec-packages/issues/8149))\r\n([6be2183](https://github.com/AztecProtocol/aztec-packages/commit/6be21831764243ea42ef932aac3b79f20b483a40))\r\n* Merge Provernet back to master\r\n([#8070](https://github.com/AztecProtocol/aztec-packages/issues/8070))\r\n([82f3dc7](https://github.com/AztecProtocol/aztec-packages/commit/82f3dc7320e05878cbd55136f1d88f87f14b2468))\r\n</details>\r\n\r\n<details><summary>barretenberg.js: 0.50.0</summary>\r\n\r\n##\r\n[0.50.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg.js-v0.49.2...barretenberg.js-v0.50.0)\r\n(2024-08-22)\r\n\r\n\r\n### Miscellaneous\r\n\r\n* Merge devnet fixes back to master\r\n([#8149](https://github.com/AztecProtocol/aztec-packages/issues/8149))\r\n([6be2183](https://github.com/AztecProtocol/aztec-packages/commit/6be21831764243ea42ef932aac3b79f20b483a40))\r\n</details>\r\n\r\n<details><summary>aztec-packages: 0.50.0</summary>\r\n\r\n##\r\n[0.50.0](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.49.2...aztec-packages-v0.50.0)\r\n(2024-08-22)\r\n\r\n\r\n### ⚠ BREAKING CHANGES\r\n\r\n* replace public key fetching API\r\n([#7996](https://github.com/AztecProtocol/aztec-packages/issues/7996))\r\n\r\n### Features\r\n\r\n* (LSP) suggest names that match any part of the current prefix\r\n(https://github.com/noir-lang/noir/pull/5752)\r\n([0379462](https://github.com/AztecProtocol/aztec-packages/commit/03794626859b3b3ad898e31855265de62d73620d))\r\n* Add `Expr::as_any_integer` and `Expr::as_member_access`\r\n(https://github.com/noir-lang/noir/pull/5742)\r\n([0379462](https://github.com/AztecProtocol/aztec-packages/commit/03794626859b3b3ad898e31855265de62d73620d))\r\n* Add `Expr::as_array`, `Expr::as_repeated_element_array` and same for\r\nslice (https://github.com/noir-lang/noir/pull/5750)\r\n([0379462](https://github.com/AztecProtocol/aztec-packages/commit/03794626859b3b3ad898e31855265de62d73620d))\r\n* Add `Expr::as_binary_op` (https://github.com/noir-lang/noir/pull/5734)\r\n([0379462](https://github.com/AztecProtocol/aztec-packages/commit/03794626859b3b3ad898e31855265de62d73620d))\r\n* Add `Expr::as_bool` (https://github.com/noir-lang/noir/pull/5729)\r\n([0379462](https://github.com/AztecProtocol/aztec-packages/commit/03794626859b3b3ad898e31855265de62d73620d))\r\n* Add `Expr::as_unary` (https://github.com/noir-lang/noir/pull/5731)\r\n([0379462](https://github.com/AztecProtocol/aztec-packages/commit/03794626859b3b3ad898e31855265de62d73620d))\r\n* Add `Expr` methods: `as_tuple`, `as_parenthesized`, `as_index`,\r\n`as_if` (https://github.com/noir-lang/noir/pull/5726)\r\n([0379462](https://github.com/AztecProtocol/aztec-packages/commit/03794626859b3b3ad898e31855265de62d73620d))\r\n* Add `TraitImpl::trait_generic_args` and `TraitImpl::methods`\r\n(https://github.com/noir-lang/noir/pull/5722)\r\n([0379462](https://github.com/AztecProtocol/aztec-packages/commit/03794626859b3b3ad898e31855265de62d73620d))\r\n* Add `unsafe` blocks for calling unconstrained code from constrained\r\nfunctions (https://github.com/noir-lang/noir/pull/4429)\r\n([0379462](https://github.com/AztecProtocol/aztec-packages/commit/03794626859b3b3ad898e31855265de62d73620d))\r\n* Add a prover-node to the proving e2e tests\r\n([#7952](https://github.com/AztecProtocol/aztec-packages/issues/7952))\r\n([ec5a5fb](https://github.com/AztecProtocol/aztec-packages/commit/ec5a5fb8fd9c344bcb0d33a4e9f07300d3317bf2))\r\n* Add max pending txs to bot\r\n([#8046](https://github.com/AztecProtocol/aztec-packages/issues/8046))\r\n([7f5517e](https://github.com/AztecProtocol/aztec-packages/commit/7f5517ecf19e720176d4e97e07f7be557b6705d9))\r\n* Add reusable procedures to brillig generation\r\n([#7981](https://github.com/AztecProtocol/aztec-packages/issues/7981))\r\n([99d1131](https://github.com/AztecProtocol/aztec-packages/commit/99d1131b645f10f9af4d8f65ef350ecebde8c9c3))\r\n* Automate verify_honk_proof input generation\r\n([#8092](https://github.com/AztecProtocol/aztec-packages/issues/8092))\r\n([bf38d61](https://github.com/AztecProtocol/aztec-packages/commit/bf38d61364a0fb55ae79ef09b05df2533f3a6f17))\r\n* **avm:** Enable zeromorph in AVM verification\r\n([#8111](https://github.com/AztecProtocol/aztec-packages/issues/8111))\r\n([b1f9fb6](https://github.com/AztecProtocol/aztec-packages/commit/b1f9fb6a4986fdfa10207ec89f8b23e14d466073)),\r\ncloses\r\n[#4944](https://github.com/AztecProtocol/aztec-packages/issues/4944)\r\n* Build for arm\r\n([#7994](https://github.com/AztecProtocol/aztec-packages/issues/7994))\r\n([0dffe1b](https://github.com/AztecProtocol/aztec-packages/commit/0dffe1bd69847677c19c03f0e60534105596418c))\r\n* Completing MockNote\r\n([#8059](https://github.com/AztecProtocol/aztec-packages/issues/8059))\r\n([05efe23](https://github.com/AztecProtocol/aztec-packages/commit/05efe230e65208303ebd70bac1e3c4d5bfe4f65b)),\r\ncloses\r\n[#7636](https://github.com/AztecProtocol/aztec-packages/issues/7636)\r\n* Constant addresses as addresses\r\n([#8056](https://github.com/AztecProtocol/aztec-packages/issues/8056))\r\n([1da5caf](https://github.com/AztecProtocol/aztec-packages/commit/1da5cafee41bdfcf00edfa948b74cb61a3aca180))\r\n* Deterministic deployments for L1\r\n([#8031](https://github.com/AztecProtocol/aztec-packages/issues/8031))\r\n([abc6b19](https://github.com/AztecProtocol/aztec-packages/commit/abc6b19b9483b02aa233ce844f01cfb876102531))\r\n* **docs:** Cookbook integration\r\n([#8083](https://github.com/AztecProtocol/aztec-packages/issues/8083))\r\n([19bd8a9](https://github.com/AztecProtocol/aztec-packages/commit/19bd8a9e678b2c3671a49a20090885f1d5d8048c))\r\n* Enabling public and private bridging w/ cli\r\n([#8011](https://github.com/AztecProtocol/aztec-packages/issues/8011))\r\n([f0f9c73](https://github.com/AztecProtocol/aztec-packages/commit/f0f9c73dc3212fa8d986b7c827b6b4f0cbe85494))\r\n* Fault-tolerant parsing of `fn` and `impl`\r\n(https://github.com/noir-lang/noir/pull/5753)\r\n([0379462](https://github.com/AztecProtocol/aztec-packages/commit/03794626859b3b3ad898e31855265de62d73620d))\r\n* Flush sequencer\r\n([#8050](https://github.com/AztecProtocol/aztec-packages/issues/8050))\r\n([8821e5f](https://github.com/AztecProtocol/aztec-packages/commit/8821e5fc7236c6291fe2b5cac1714c2c2255f6d3))\r\n* Introduce blob circuit\r\n([#8101](https://github.com/AztecProtocol/aztec-packages/issues/8101))\r\n([4bb3bac](https://github.com/AztecProtocol/aztec-packages/commit/4bb3bacd7230e0132eff976a2199fbbf0bc24c2a))\r\n* Introduce validator client\r\n([#7854](https://github.com/AztecProtocol/aztec-packages/issues/7854))\r\n([e3be8e6](https://github.com/AztecProtocol/aztec-packages/commit/e3be8e6cd23fa7b7cdf341da720decd21a5d8c44))\r\n* JSON logging\r\n([#8095](https://github.com/AztecProtocol/aztec-packages/issues/8095))\r\n([048fa12](https://github.com/AztecProtocol/aztec-packages/commit/048fa12cf21de3067908c2e03b2245ef8e674d46))\r\n* LSP auto-import completion\r\n(https://github.com/noir-lang/noir/pull/5741)\r\n([0379462](https://github.com/AztecProtocol/aztec-packages/commit/03794626859b3b3ad898e31855265de62d73620d))\r\n* LSP autocomplete constructor fields\r\n(https://github.com/noir-lang/noir/pull/5732)\r\n([0379462](https://github.com/AztecProtocol/aztec-packages/commit/03794626859b3b3ad898e31855265de62d73620d))\r\n* LSP signature help (https://github.com/noir-lang/noir/pull/5725)\r\n([0379462](https://github.com/AztecProtocol/aztec-packages/commit/03794626859b3b3ad898e31855265de62d73620d))\r\n* Max pending jobs in prover node\r\n([#8045](https://github.com/AztecProtocol/aztec-packages/issues/8045))\r\n([c857604](https://github.com/AztecProtocol/aztec-packages/commit/c857604a29e3184a673f2e5632b43b1d684a225b))\r\n* Move out_hash inside tx_effect_hash\r\n([#7489](https://github.com/AztecProtocol/aztec-packages/issues/7489))\r\n([ff0effe](https://github.com/AztecProtocol/aztec-packages/commit/ff0effe600023b4050183f78f97be5cd8373f57b))\r\n* Native Merkle Trees\r\n([#7037](https://github.com/AztecProtocol/aztec-packages/issues/7037))\r\n([8a1032e](https://github.com/AztecProtocol/aztec-packages/commit/8a1032ec4738e9b592b45500c1cf47c0e1820ad3))\r\n* Oink recursive verifier\r\n([#8121](https://github.com/AztecProtocol/aztec-packages/issues/8121))\r\n([580708a](https://github.com/AztecProtocol/aztec-packages/commit/580708a1f7c18338888d83e749a0740a322c86e0))\r\n* **optimization:** Follow past `array_set`s when optimizing\r\n`array_get`s (https://github.com/noir-lang/noir/pull/5772)\r\n([0379462](https://github.com/AztecProtocol/aztec-packages/commit/03794626859b3b3ad898e31855265de62d73620d))\r\n* Passes copy_cycles by const reference to avoid copying\r\n([#8051](https://github.com/AztecProtocol/aztec-packages/issues/8051))\r\n([495d363](https://github.com/AztecProtocol/aztec-packages/commit/495d363fdf0b89dfeb228c200824fc5f9af7bb19))\r\n* **perf:** Mem2reg function state for value loads to optimize across\r\nblocks (https://github.com/noir-lang/noir/pull/5757)\r\n([0379462](https://github.com/AztecProtocol/aztec-packages/commit/03794626859b3b3ad898e31855265de62d73620d))\r\n* PG recursive verifier constructors based on stdlib inputs\r\n([#8052](https://github.com/AztecProtocol/aztec-packages/issues/8052))\r\n([4c568b0](https://github.com/AztecProtocol/aztec-packages/commit/4c568b0545b022a536a6eb4199be817593e6b317))\r\n* Poseidon2 gates for Ultra arithmetisation\r\n([#7494](https://github.com/AztecProtocol/aztec-packages/issues/7494))\r\n([d86577c](https://github.com/AztecProtocol/aztec-packages/commit/d86577c2e36c5a077a859058602f455421ed93e1))\r\n* Prover node metrics\r\n([#8086](https://github.com/AztecProtocol/aztec-packages/issues/8086))\r\n([ab018ff](https://github.com/AztecProtocol/aztec-packages/commit/ab018ff473508f2b3d17ee4bb3dfda99b412951c))\r\n* Removed socat, fixed aztec-run\r\n([#8145](https://github.com/AztecProtocol/aztec-packages/issues/8145))\r\n([ff94aa2](https://github.com/AztecProtocol/aztec-packages/commit/ff94aa20a0bc799710e4515bf4e7496c6bda8be7))\r\n* Removing redundant key fetching\r\n([#8043](https://github.com/AztecProtocol/aztec-packages/issues/8043))\r\n([2bbcc7b](https://github.com/AztecProtocol/aztec-packages/commit/2bbcc7bfde00eb8078fac51e83906287d39119a5))\r\n* Replace public key fetching API\r\n([#7996](https://github.com/AztecProtocol/aztec-packages/issues/7996))\r\n([73d6aa9](https://github.com/AztecProtocol/aztec-packages/commit/73d6aa98c7d156d3a007bd65e49575b1701f0f7e))\r\n* Small optimization in toradix\r\n([#8040](https://github.com/AztecProtocol/aztec-packages/issues/8040))\r\n([0dc7a50](https://github.com/AztecProtocol/aztec-packages/commit/0dc7a503c34625c5ea5a3ec84e4724e96229f038))\r\n* Some fixes and cleanup in PG recursive verifier\r\n([#8053](https://github.com/AztecProtocol/aztec-packages/issues/8053))\r\n([5f2a9bd](https://github.com/AztecProtocol/aztec-packages/commit/5f2a9bd3d968be491a12c63f812aa8d7e3bb585e))\r\n* Suggest trait methods in LSP completion\r\n(https://github.com/noir-lang/noir/pull/5735)\r\n([0379462](https://github.com/AztecProtocol/aztec-packages/commit/03794626859b3b3ad898e31855265de62d73620d))\r\n* Suggest tuple fields in LSP completion\r\n(https://github.com/noir-lang/noir/pull/5730)\r\n([0379462](https://github.com/AztecProtocol/aztec-packages/commit/03794626859b3b3ad898e31855265de62d73620d))\r\n* Track world state metrics\r\n([#8109](https://github.com/AztecProtocol/aztec-packages/issues/8109))\r\n([ca58d94](https://github.com/AztecProtocol/aztec-packages/commit/ca58d94d1b08849f2cb472d1d65dff37ad0602d6))\r\n* Typing specific pub keys\r\n([#8099](https://github.com/AztecProtocol/aztec-packages/issues/8099))\r\n([638793a](https://github.com/AztecProtocol/aztec-packages/commit/638793adbc4a0e0640af3bc8a0cf3001b45fe928))\r\n* Unify all acir recursion constraints based on RecursionConstraint and\r\nproof_type\r\n([#7993](https://github.com/AztecProtocol/aztec-packages/issues/7993))\r\n([7cb39bc](https://github.com/AztecProtocol/aztec-packages/commit/7cb39bceddcb9ec4142b86087a7af58d547ddfaa))\r\n* User `super::` in LSP autocompletion if possible\r\n(https://github.com/noir-lang/noir/pull/5751)\r\n([0379462](https://github.com/AztecProtocol/aztec-packages/commit/03794626859b3b3ad898e31855265de62d73620d))\r\n* Various token note improvements\r\n([#8062](https://github.com/AztecProtocol/aztec-packages/issues/8062))\r\n([8f9dfd9](https://github.com/AztecProtocol/aztec-packages/commit/8f9dfd970199789fcec547605b0bf65fb1acbd0b))\r\n* Zk sumcheck\r\n([#7517](https://github.com/AztecProtocol/aztec-packages/issues/7517))\r\n([0e9a530](https://github.com/AztecProtocol/aztec-packages/commit/0e9a530cfd83f375f6b3a1bb9fb67cf562847f9b))\r\n\r\n\r\n### Bug Fixes\r\n\r\n* (LSP) only add cached files relevant to workspace\r\n(https://github.com/noir-lang/noir/pull/5775)\r\n([2d70215](https://github.com/AztecProtocol/aztec-packages/commit/2d702155f9341cac08a960f271e3ed5450740729))\r\n* Add DEBUG and LOG_LEVEL to valid env vars\r\n([#8094](https://github.com/AztecProtocol/aztec-packages/issues/8094))\r\n([70e61f9](https://github.com/AztecProtocol/aztec-packages/commit/70e61f973de063a972c726303f579ef34441d85f))\r\n* Add link to l1-artifacts\r\n([#7940](https://github.com/AztecProtocol/aztec-packages/issues/7940))\r\n([dcfd120](https://github.com/AztecProtocol/aztec-packages/commit/dcfd12019fbe8e443c5d162876c960a7062164af))\r\n* Add missing trait impls for integer types to stdlib\r\n(https://github.com/noir-lang/noir/pull/5738)\r\n([0379462](https://github.com/AztecProtocol/aztec-packages/commit/03794626859b3b3ad898e31855265de62d73620d))\r\n* Allow comptime code to use break without also being `unconstrained`\r\n(https://github.com/noir-lang/noir/pull/5744)\r\n([0379462](https://github.com/AztecProtocol/aztec-packages/commit/03794626859b3b3ad898e31855265de62d73620d))\r\n* **avm:** Real bytes finalization\r\n([#8041](https://github.com/AztecProtocol/aztec-packages/issues/8041))\r\n([047461a](https://github.com/AztecProtocol/aztec-packages/commit/047461ae6bc5d6a7a4d05bba18cce0682ee75705))\r\n* **ci:** Correctly run bb tests with asserts\r\n([#7607](https://github.com/AztecProtocol/aztec-packages/issues/7607))\r\n([7b73f69](https://github.com/AztecProtocol/aztec-packages/commit/7b73f69126b8ae70aa7ade96e775cabce581358f))\r\n* Correctly constrain get header at\r\n([#7893](https://github.com/AztecProtocol/aztec-packages/issues/7893))\r\n([2ebba0d](https://github.com/AztecProtocol/aztec-packages/commit/2ebba0d90cab84eb1a2a7533f1a4656a1484e19a))\r\n* Deploy L1 rollup contract using salt if provided\r\n([#8074](https://github.com/AztecProtocol/aztec-packages/issues/8074))\r\n([1e8eddf](https://github.com/AztecProtocol/aztec-packages/commit/1e8eddf0eff73a05995c19a10a3d7494039193fe))\r\n* Flaky e2e_prover_node test\r\n([#8116](https://github.com/AztecProtocol/aztec-packages/issues/8116))\r\n([9d97bd4](https://github.com/AztecProtocol/aztec-packages/commit/9d97bd4b5a731aaa98b3b1e11374bd8ab400338d))\r\n* **frontend:** Continue type check if we are missing an unsafe block\r\n(https://github.com/noir-lang/noir/pull/5720)\r\n([0379462](https://github.com/AztecProtocol/aztec-packages/commit/03794626859b3b3ad898e31855265de62d73620d))\r\n* Let LSP autocompletion work in more contexts\r\n(https://github.com/noir-lang/noir/pull/5719)\r\n([0379462](https://github.com/AztecProtocol/aztec-packages/commit/03794626859b3b3ad898e31855265de62d73620d))\r\n* Port option & extracting correct namespaced options\r\n([#8097](https://github.com/AztecProtocol/aztec-packages/issues/8097))\r\n([e74c83e](https://github.com/AztecProtocol/aztec-packages/commit/e74c83e581380fa344d1dc1cd783beb1b2d11e0e))\r\n* Set prover node max pending jobs in tests\r\n([#8055](https://github.com/AztecProtocol/aztec-packages/issues/8055))\r\n([403c26f](https://github.com/AztecProtocol/aztec-packages/commit/403c26f3c8e28cf51388dc21d510b6cedaf095ba))\r\n* Stop WorldStrateSynchronizer in prover node\r\n([#8126](https://github.com/AztecProtocol/aztec-packages/issues/8126))\r\n([f724b07](https://github.com/AztecProtocol/aztec-packages/commit/f724b07d2e0603b33a2f195a71403caac56ed784))\r\n* Txe port and aztec start options\r\n([#8071](https://github.com/AztecProtocol/aztec-packages/issues/8071))\r\n([23778c5](https://github.com/AztecProtocol/aztec-packages/commit/23778c5a0ac4fe512cde3a4b66df65f588cad305))\r\n* Unconstrained fn mismatch is now a warning\r\n(https://github.com/noir-lang/noir/pull/5764)\r\n([0379462](https://github.com/AztecProtocol/aztec-packages/commit/03794626859b3b3ad898e31855265de62d73620d))\r\n* Wallet fixes for devnet, testing and misc\r\n([#8058](https://github.com/AztecProtocol/aztec-packages/issues/8058))\r\n([15f3e8c](https://github.com/AztecProtocol/aztec-packages/commit/15f3e8c216571e1d60ace898e5a3d5fc13c19869))\r\n\r\n\r\n### Miscellaneous\r\n\r\n* Add Brillig loop bytecode size regression and update noir-gates-diff\r\nreport (https://github.com/noir-lang/noir/pull/5747)\r\n([0379462](https://github.com/AztecProtocol/aztec-packages/commit/03794626859b3b3ad898e31855265de62d73620d))\r\n* Apply some new lints across workspace\r\n(https://github.com/noir-lang/noir/pull/5736)\r\n([0379462](https://github.com/AztecProtocol/aztec-packages/commit/03794626859b3b3ad898e31855265de62d73620d))\r\n* **avm:** Kernel trace and finalization\r\n([#8049](https://github.com/AztecProtocol/aztec-packages/issues/8049))\r\n([d7edd24](https://github.com/AztecProtocol/aztec-packages/commit/d7edd24e76a2ab87ac490c8c97f0c344190f646b))\r\n* **avm:** Separate alu finalization\r\n([#8069](https://github.com/AztecProtocol/aztec-packages/issues/8069))\r\n([e8a9eb4](https://github.com/AztecProtocol/aztec-packages/commit/e8a9eb4b809f582c0fa185a2193e0493fc579d98))\r\n* **bb:** IPA parallelization cleanup\r\n([#8088](https://github.com/AztecProtocol/aztec-packages/issues/8088))\r\n([9227fa9](https://github.com/AztecProtocol/aztec-packages/commit/9227fa9f25b1ef8342dbf694c5bb9d37a1b0226d))\r\n* **bb:** Simplify parallel_for_if_effective\r\n([#8079](https://github.com/AztecProtocol/aztec-packages/issues/8079))\r\n([5bff26b](https://github.com/AztecProtocol/aztec-packages/commit/5bff26b2f9aecb8298225d5abe72740fedd1f4e8))\r\n* **bb:** Small cleanup in protogalaxy prover\r\n([#8072](https://github.com/AztecProtocol/aztec-packages/issues/8072))\r\n([4cb5c83](https://github.com/AztecProtocol/aztec-packages/commit/4cb5c83174f55f046d7d37e4e6a4667556ac5907))\r\n* **ci:** Only show last 50 master cpp benches\r\n([#8075](https://github.com/AztecProtocol/aztec-packages/issues/8075))\r\n([96f35bc](https://github.com/AztecProtocol/aztec-packages/commit/96f35bcca3eb1f6dc8685fcec0abdd29faf8bc1a))\r\n* Clarify Field use (https://github.com/noir-lang/noir/pull/5740)\r\n([0379462](https://github.com/AztecProtocol/aztec-packages/commit/03794626859b3b3ad898e31855265de62d73620d))\r\n* CLI command to set latest block as proven\r\n([#7987](https://github.com/AztecProtocol/aztec-packages/issues/7987))\r\n([80eaf1d](https://github.com/AztecProtocol/aztec-packages/commit/80eaf1d482184019efd67b9a8be5d9c8729545fb))\r\n* Configuration for bot on various networks\r\n([#8063](https://github.com/AztecProtocol/aztec-packages/issues/8063))\r\n([453a096](https://github.com/AztecProtocol/aztec-packages/commit/453a096378df57b0280be9aa52697da434e1a457))\r\n* Count brillig opcodes in nargo info\r\n(https://github.com/noir-lang/noir/pull/5189)\r\n([0379462](https://github.com/AztecProtocol/aztec-packages/commit/03794626859b3b3ad898e31855265de62d73620d))\r\n* Deduplication in Protogalaxy\r\n([#8067](https://github.com/AztecProtocol/aztec-packages/issues/8067))\r\n([a5cc3ba](https://github.com/AztecProtocol/aztec-packages/commit/a5cc3bab86711062d180993cf4a7412d1013aa48))\r\n* **docs:** Expanding solidity verifier chain list\r\n(https://github.com/noir-lang/noir/pull/5587)\r\n([0379462](https://github.com/AztecProtocol/aztec-packages/commit/03794626859b3b3ad898e31855265de62d73620d))\r\n* Dont trail whitespace in vscode\r\n([#5661](https://github.com/AztecProtocol/aztec-packages/issues/5661))\r\n([7595d91](https://github.com/AztecProtocol/aztec-packages/commit/7595d91fb82871c31e379c21ad1ce880d5d001be))\r\n* Handle constant output for ec add opcode\r\n([#8108](https://github.com/AztecProtocol/aztec-packages/issues/8108))\r\n([2ee79d2](https://github.com/AztecProtocol/aztec-packages/commit/2ee79d28affa66ef3c9f73782182b6221e2e9d98))\r\n* Make spans non-optional on `UnresolvedType`\r\n(https://github.com/noir-lang/noir/pull/5773)\r\n([2d70215](https://github.com/AztecProtocol/aztec-packages/commit/2d702155f9341cac08a960f271e3ed5450740729))\r\n* Merge devnet fixes back to master\r\n([#8149](https://github.com/AztecProtocol/aztec-packages/issues/8149))\r\n([6be2183](https://github.com/AztecProtocol/aztec-packages/commit/6be21831764243ea42ef932aac3b79f20b483a40))\r\n* Merge devnet to master\r\n([#8044](https://github.com/AztecProtocol/aztec-packages/issues/8044))\r\n([f84950f](https://github.com/AztecProtocol/aztec-packages/commit/f84950fd2cd93533e1755722ad918c4087682b5d))\r\n* Merge Provernet back to master\r\n([#8070](https://github.com/AztecProtocol/aztec-packages/issues/8070))\r\n([82f3dc7](https://github.com/AztecProtocol/aztec-packages/commit/82f3dc7320e05878cbd55136f1d88f87f14b2468))\r\n* Merging `TokenWithRefunds` with `Token`\r\n([#8042](https://github.com/AztecProtocol/aztec-packages/issues/8042))\r\n([8b795eb](https://github.com/AztecProtocol/aztec-packages/commit/8b795ebcd20166e62dcf7bb90d0ed95cf7013fb7))\r\n* Modified devnet config\r\n([#8087](https://github.com/AztecProtocol/aztec-packages/issues/8087))\r\n([854ab45](https://github.com/AztecProtocol/aztec-packages/commit/854ab45f4a71dc4717a42a4d30dd66f4cd2b454a))\r\n* Nuking old registry contract\r\n([#8057](https://github.com/AztecProtocol/aztec-packages/issues/8057))\r\n([3bd08a8](https://github.com/AztecProtocol/aztec-packages/commit/3bd08a83d11e76111b027b99d6022f986ec34d7e)),\r\ncloses\r\n[#7955](https://github.com/AztecProtocol/aztec-packages/issues/7955)\r\n* Pedersen hash related cleanup in aztec.nr\r\n([#8009](https://github.com/AztecProtocol/aztec-packages/issues/8009))\r\n([3c4ac65](https://github.com/AztecProtocol/aztec-packages/commit/3c4ac65766c651e56fb7823c3d799e462bbb4d91))\r\n* Portal manager cli\r\n([#8047](https://github.com/AztecProtocol/aztec-packages/issues/8047))\r\n([618e251](https://github.com/AztecProtocol/aztec-packages/commit/618e2510d760e8749d1993f84f08fd7adb7683b2))\r\n* Proper portal setup for fees + test\r\n([#7944](https://github.com/AztecProtocol/aztec-packages/issues/7944))\r\n([9fec67e](https://github.com/AztecProtocol/aztec-packages/commit/9fec67e2cd2b5e3aa57e81a8bcadc38bbfaeb46d))\r\n* Public kernel\r\n([#8061](https://github.com/AztecProtocol/aztec-packages/issues/8061))\r\n([617a69c](https://github.com/AztecProtocol/aztec-packages/commit/617a69cefdd1f9c2466af052d86157f946743c05))\r\n* Refactor ACIR function IDs from raw integers to struct\r\n(https://github.com/noir-lang/noir/pull/5748)\r\n([0379462](https://github.com/AztecProtocol/aztec-packages/commit/03794626859b3b3ad898e31855265de62d73620d))\r\n* Replace relative paths to noir-protocol-circuits\r\n([5ddf0e6](https://github.com/AztecProtocol/aztec-packages/commit/5ddf0e6bcdf93222a542af0321550d32ca62a498))\r\n* Replace relative paths to noir-protocol-circuits\r\n([ca77c17](https://github.com/AztecProtocol/aztec-packages/commit/ca77c1782af5088cadf280a834e9484a3ff87115))\r\n* Replace relative paths to noir-protocol-circuits\r\n([fe73c93](https://github.com/AztecProtocol/aztec-packages/commit/fe73c93b69a5024ae6f6ad690535b7078814a778))\r\n* Replace relative paths to noir-protocol-circuits\r\n([576bc2f](https://github.com/AztecProtocol/aztec-packages/commit/576bc2f90607c171e51ff76ebc979adf7c88faad))\r\n* Replace relative paths to noir-protocol-circuits\r\n([0d05d6b](https://github.com/AztecProtocol/aztec-packages/commit/0d05d6b75772cb37a3e62e9ca6936aabda346393))\r\n* Simplify sequencer and l1 communication\r\n([#7989](https://github.com/AztecProtocol/aztec-packages/issues/7989))\r\n([cee4eba](https://github.com/AztecProtocol/aztec-packages/commit/cee4ebaa9e53247d94882689d065c16a4c8e5bac))\r\n* Split LSP completion.rs into several files\r\n(https://github.com/noir-lang/noir/pull/5723)\r\n([0379462](https://github.com/AztecProtocol/aztec-packages/commit/03794626859b3b3ad898e31855265de62d73620d))\r\n* Split up stdlib/recursion\r\n([#8054](https://github.com/AztecProtocol/aztec-packages/issues/8054))\r\n([ec03e40](https://github.com/AztecProtocol/aztec-packages/commit/ec03e403cc8bfa1f40fb05fe93eadf9ed63b9b2f))\r\n* **sync-noir:** Fix modify/delete conflicts automatically\r\n([#8090](https://github.com/AztecProtocol/aztec-packages/issues/8090))\r\n([a09627c](https://github.com/AztecProtocol/aztec-packages/commit/a09627c78d97917443349a21d953be89bcb32eef))\r\n* Use decider verifier in ultra verifier\r\n([#8115](https://github.com/AztecProtocol/aztec-packages/issues/8115))\r\n([6c5ab2b](https://github.com/AztecProtocol/aztec-packages/commit/6c5ab2b373086cb2842ee848329e282b463b3272))\r\n\r\n\r\n### Documentation\r\n\r\n* Fix typo overview.md\r\n([#7908](https://github.com/AztecProtocol/aztec-packages/issues/7908))\r\n([3749211](https://github.com/AztecProtocol/aztec-packages/commit/37492116a70d6f26b24d53c90858888da3c2d8f4))\r\n* Update installation info for bb and noir\r\n([#8119](https://github.com/AztecProtocol/aztec-packages/issues/8119))\r\n([a744321](https://github.com/AztecProtocol/aztec-packages/commit/a7443216dfaa7b2731911e2320b2c1c1a720e8e8))\r\n</details>\r\n\r\n<details><summary>barretenberg: 0.50.0</summary>\r\n\r\n##\r\n[0.50.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.49.2...barretenberg-v0.50.0)\r\n(2024-08-22)\r\n\r\n\r\n### Features\r\n\r\n* Add a prover-node to the proving e2e tests\r\n([#7952](https://github.com/AztecProtocol/aztec-packages/issues/7952))\r\n([ec5a5fb](https://github.com/AztecProtocol/aztec-packages/commit/ec5a5fb8fd9c344bcb0d33a4e9f07300d3317bf2))\r\n* Automate verify_honk_proof input generation\r\n([#8092](https://github.com/AztecProtocol/aztec-packages/issues/8092))\r\n([bf38d61](https://github.com/AztecProtocol/aztec-packages/commit/bf38d61364a0fb55ae79ef09b05df2533f3a6f17))\r\n* **avm:** Enable zeromorph in AVM verification\r\n([#8111](https://github.com/AztecProtocol/aztec-packages/issues/8111))\r\n([b1f9fb6](https://github.com/AztecProtocol/aztec-packages/commit/b1f9fb6a4986fdfa10207ec89f8b23e14d466073)),\r\ncloses\r\n[#4944](https://github.com/AztecProtocol/aztec-packages/issues/4944)\r\n* Native Merkle Trees\r\n([#7037](https://github.com/AztecProtocol/aztec-packages/issues/7037))\r\n([8a1032e](https://github.com/AztecProtocol/aztec-packages/commit/8a1032ec4738e9b592b45500c1cf47c0e1820ad3))\r\n* Oink recursive verifier\r\n([#8121](https://github.com/AztecProtocol/aztec-packages/issues/8121))\r\n([580708a](https://github.com/AztecProtocol/aztec-packages/commit/580708a1f7c18338888d83e749a0740a322c86e0))\r\n* Passes copy_cycles by const reference to avoid copying\r\n([#8051](https://github.com/AztecProtocol/aztec-packages/issues/8051))\r\n([495d363](https://github.com/AztecProtocol/aztec-packages/commit/495d363fdf0b89dfeb228c200824fc5f9af7bb19))\r\n* PG recursive verifier constructors based on stdlib inputs\r\n([#8052](https://github.com/AztecProtocol/aztec-packages/issues/8052))\r\n([4c568b0](https://github.com/AztecProtocol/aztec-packages/commit/4c568b0545b022a536a6eb4199be817593e6b317))\r\n* Poseidon2 gates for Ultra arithmetisation\r\n([#7494](https://github.com/AztecProtocol/aztec-packages/issues/7494))\r\n([d86577c](https://github.com/AztecProtocol/aztec-packages/commit/d86577c2e36c5a077a859058602f455421ed93e1))\r\n* Some fixes and cleanup in PG recursive verifier\r\n([#8053](https://github.com/AztecProtocol/aztec-packages/issues/8053))\r\n([5f2a9bd](https://github.com/AztecProtocol/aztec-packages/commit/5f2a9bd3d968be491a12c63f812aa8d7e3bb585e))\r\n* Unify all acir recursion constraints based on RecursionConstraint and\r\nproof_type\r\n([#7993](https://github.com/AztecProtocol/aztec-packages/issues/7993))\r\n([7cb39bc](https://github.com/AztecProtocol/aztec-packages/commit/7cb39bceddcb9ec4142b86087a7af58d547ddfaa))\r\n* Zk sumcheck\r\n([#7517](https://github.com/AztecProtocol/aztec-packages/issues/7517))\r\n([0e9a530](https://github.com/AztecProtocol/aztec-packages/commit/0e9a530cfd83f375f6b3a1bb9fb67cf562847f9b))\r\n\r\n\r\n### Bug Fixes\r\n\r\n* **avm:** Real bytes finalization\r\n([#8041](https://github.com/AztecProtocol/aztec-packages/issues/8041))\r\n([047461a](https://github.com/AztecProtocol/aztec-packages/commit/047461ae6bc5d6a7a4d05bba18cce0682ee75705))\r\n* **ci:** Correctly run bb tests with asserts\r\n([#7607](https://github.com/AztecProtocol/aztec-packages/issues/7607))\r\n([7b73f69](https://github.com/AztecProtocol/aztec-packages/commit/7b73f69126b8ae70aa7ade96e775cabce581358f))\r\n\r\n\r\n### Miscellaneous\r\n\r\n* **avm:** Kernel trace and finalization\r\n([#8049](https://github.com/AztecProtocol/aztec-packages/issues/8049))\r\n([d7edd24](https://github.com/AztecProtocol/aztec-packages/commit/d7edd24e76a2ab87ac490c8c97f0c344190f646b))\r\n* **avm:** Separate alu finalization\r\n([#8069](https://github.com/AztecProtocol/aztec-packages/issues/8069))\r\n([e8a9eb4](https://github.com/AztecProtocol/aztec-packages/commit/e8a9eb4b809f582c0fa185a2193e0493fc579d98))\r\n* **bb:** IPA parallelization cleanup\r\n([#8088](https://github.com/AztecProtocol/aztec-packages/issues/8088))\r\n([9227fa9](https://github.com/AztecProtocol/aztec-packages/commit/9227fa9f25b1ef8342dbf694c5bb9d37a1b0226d))\r\n* **bb:** Simplify parallel_for_if_effective\r\n([#8079](https://github.com/AztecProtocol/aztec-packages/issues/8079))\r\n([5bff26b](https://github.com/AztecProtocol/aztec-packages/commit/5bff26b2f9aecb8298225d5abe72740fedd1f4e8))\r\n* **bb:** Small cleanup in protogalaxy prover\r\n([#8072](https://github.com/AztecProtocol/aztec-packages/issues/8072))\r\n([4cb5c83](https://github.com/AztecProtocol/aztec-packages/commit/4cb5c83174f55f046d7d37e4e6a4667556ac5907))\r\n* Deduplication in Protogalaxy\r\n([#8067](https://github.com/AztecProtocol/aztec-packages/issues/8067))\r\n([a5cc3ba](https://github.com/AztecProtocol/aztec-packages/commit/a5cc3bab86711062d180993cf4a7412d1013aa48))\r\n* Handle constant output for ec add opcode\r\n([#8108](https://github.com/AztecProtocol/aztec-packages/issues/8108))\r\n([2ee79d2](https://github.com/AztecProtocol/aztec-packages/commit/2ee79d28affa66ef3c9f73782182b6221e2e9d98))\r\n* Merge devnet fixes back to master\r\n([#8149](https://github.com/AztecProtocol/aztec-packages/issues/8149))\r\n([6be2183](https://github.com/AztecProtocol/aztec-packages/commit/6be21831764243ea42ef932aac3b79f20b483a40))\r\n* Split up stdlib/recursion\r\n([#8054](https://github.com/AztecProtocol/aztec-packages/issues/8054))\r\n([ec03e40](https://github.com/AztecProtocol/aztec-packages/commit/ec03e403cc8bfa1f40fb05fe93eadf9ed63b9b2f))\r\n* Use decider verifier in ultra verifier\r\n([#8115](https://github.com/AztecProtocol/aztec-packages/issues/8115))\r\n([6c5ab2b](https://github.com/AztecProtocol/aztec-packages/commit/6c5ab2b373086cb2842ee848329e282b463b3272))\r\n\r\n\r\n### Documentation\r\n\r\n* Update installation info for bb and noir\r\n([#8119](https://github.com/AztecProtocol/aztec-packages/issues/8119))\r\n([a744321](https://github.com/AztecProtocol/aztec-packages/commit/a7443216dfaa7b2731911e2320b2c1c1a720e8e8))\r\n</details>\r\n\r\n---\r\nThis PR was generated with [Release\r\nPlease](https://github.com/googleapis/release-please). See\r\n[documentation](https://github.com/googleapis/release-please#release-please).",
          "timestamp": "2024-08-22T16:15:35Z",
          "tree_id": "22babfe1987c278694df6b718830ef5cb32e6bd4",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0b5048048b68514571a9113465eda564c8f1ed96"
        },
        "date": 1724344249799,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 13666.856853000012,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10460.843931 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5075.994847000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4703.931839 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 40256.444526,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 40256445000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14672.071242999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14672072000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3753921288,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3753921288 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 209190637,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 209190637 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3224434633,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3224434633 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 173309427,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 173309427 ns\nthreads: 1"
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
          "id": "32a04c1e14564192df1581829d8f0ccb4a072769",
          "message": "feat: Free instances and circuits earlier to reduce max memory usage (#8118)\n\nThis PR reduces max memory by roughly a third by deleting a\r\nprover_instance member variable in client_ivc. Before, we were storing\r\nthis prover_instance, which meant that when we accumulate a third\r\ncircuit, we were storing three instances at the same time - the\r\naccumulator, the old instance, and the new instance. It also adjusts the\r\ntest (ClientIVCTests.BasicThree) to only store the builder for when it's\r\nneeded.\r\n\r\nThis is the original memory graph when running\r\nClientIVCTests.BasicThree, which accumulates three circuits of size 2^17\r\n(?).\r\n<img width=\"735\" alt=\"Before\"\r\nsrc=\"https://github.com/user-attachments/assets/66bed03b-3692-4bb2-b176-b6772bdcb27e\">\r\n\r\nAfter freeing the Builder after constructing the instance from it, and\r\nafter freeing the instance after folding it into the accumulator, our\r\nmemory graph looks like.\r\n<img width=\"700\" alt=\"After\"\r\nsrc=\"https://github.com/user-attachments/assets/13f4432c-cfc3-4095-aa6d-908a244aa6b5\">\r\n\r\nYou can see that the peak memory goes from 1216MB to 774MB, and that\r\nwe're no longer storing 3 instances worth of data at one time.",
          "timestamp": "2024-08-22T13:47:51-04:00",
          "tree_id": "f1e8de78798d3508864ba838c19617cb8d608f62",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/32a04c1e14564192df1581829d8f0ccb4a072769"
        },
        "date": 1724349799776,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 13718.26680800001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10607.756371000001 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5102.3281669999815,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4592.5226920000005 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 39919.471173,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 39919471000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14658.943422000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14658943000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3760003409,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3760003409 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 208016375,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 208016375 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3065669492,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3065669492 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 173992757,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 173992757 ns\nthreads: 1"
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
          "id": "c3dddf83941fd7411f2faefff43552aa174e1401",
          "message": "feat: share the commitment key between instances to reduce mem (#8154)\n\nContinuation of\r\nhttps://github.com/AztecProtocol/aztec-packages/pull/8118.\r\n\r\nIn AztecIVC (or ClientIVC), when we have multiple instances, we create a\r\ncommitment key for each one. However, since each of these instances are\r\nthe same size, there's no need to create a new one for each one.\r\n\r\nWhen we're constructing an instance beyond the first one, we can reuse\r\nthe same commitment key from the AztecIVC accumulator, which saves\r\n~123MB of memory for 2^17 circuits, a reduction of 15.6%.\r\n<img width=\"1045\" alt=\"After\"\r\nsrc=\"https://github.com/user-attachments/assets/032cf442-5c68-4c23-b4d2-16ab8c6812b7\">\r\n\r\n\r\nAfter the change, we cut down max memory by 123MB.\r\n<img width=\"969\" alt=\"Before\"\r\nsrc=\"https://github.com/user-attachments/assets/8e374ab5-8a4b-4395-964e-35e49fe8920a\">",
          "timestamp": "2024-08-22T21:41:18Z",
          "tree_id": "d49386cb90db1a839ad8687b3559fe73e65c2f77",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c3dddf83941fd7411f2faefff43552aa174e1401"
        },
        "date": 1724363575621,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 13527.57957,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10337.787540000001 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5134.989187999991,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4703.179805 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 39685.25907100001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 39685259000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14643.226008,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14643226000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3784877519,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3784877519 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 210666309,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 210666309 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3118162547,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3118162547 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 174714749,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 174714749 ns\nthreads: 1"
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
          "id": "5ac57884828af8fd0b2da7121f937727ee059ba0",
          "message": "chore(master): Release 0.50.1 (#8151)\n\n:robot: I have created a release *beep* *boop*\r\n---\r\n\r\n\r\n<details><summary>aztec-package: 0.50.1</summary>\r\n\r\n##\r\n[0.50.1](https://github.com/AztecProtocol/aztec-packages/compare/aztec-package-v0.50.0...aztec-package-v0.50.1)\r\n(2024-08-23)\r\n\r\n\r\n### Miscellaneous\r\n\r\n* **aztec-package:** Synchronize aztec-packages versions\r\n</details>\r\n\r\n<details><summary>barretenberg.js: 0.50.1</summary>\r\n\r\n##\r\n[0.50.1](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg.js-v0.50.0...barretenberg.js-v0.50.1)\r\n(2024-08-23)\r\n\r\n\r\n### Miscellaneous\r\n\r\n* **barretenberg.js:** Synchronize aztec-packages versions\r\n</details>\r\n\r\n<details><summary>aztec-packages: 0.50.1</summary>\r\n\r\n##\r\n[0.50.1](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.50.0...aztec-packages-v0.50.1)\r\n(2024-08-23)\r\n\r\n\r\n### Features\r\n\r\n* Free instances and circuits earlier to reduce max memory usage\r\n([#8118](https://github.com/AztecProtocol/aztec-packages/issues/8118))\r\n([32a04c1](https://github.com/AztecProtocol/aztec-packages/commit/32a04c1e14564192df1581829d8f0ccb4a072769))\r\n* Prepare protocol circuits for batch rollup\r\n([#7727](https://github.com/AztecProtocol/aztec-packages/issues/7727))\r\n([a126e22](https://github.com/AztecProtocol/aztec-packages/commit/a126e220a1a6b5265926f5bbb91b7eb79102f0f3))\r\n* Share the commitment key between instances to reduce mem\r\n([#8154](https://github.com/AztecProtocol/aztec-packages/issues/8154))\r\n([c3dddf8](https://github.com/AztecProtocol/aztec-packages/commit/c3dddf83941fd7411f2faefff43552aa174e1401))\r\n\r\n\r\n### Bug Fixes\r\n\r\n* Cli-wallet manifest\r\n([#8156](https://github.com/AztecProtocol/aztec-packages/issues/8156))\r\n([2ffcda3](https://github.com/AztecProtocol/aztec-packages/commit/2ffcda319b6b185c2ce05361149750a8abfdae0d))\r\n\r\n\r\n### Miscellaneous\r\n\r\n* Replace relative paths to noir-protocol-circuits\r\n([5372ac4](https://github.com/AztecProtocol/aztec-packages/commit/5372ac44107eac4a9b216ffa588b69dac4e41c76))\r\n* Requiring only 1 sig from user\r\n([#8146](https://github.com/AztecProtocol/aztec-packages/issues/8146))\r\n([f0b564b](https://github.com/AztecProtocol/aztec-packages/commit/f0b564be119fd0625032abf55d040a186b1cb380))\r\n</details>\r\n\r\n<details><summary>barretenberg: 0.50.1</summary>\r\n\r\n##\r\n[0.50.1](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.50.0...barretenberg-v0.50.1)\r\n(2024-08-23)\r\n\r\n\r\n### Features\r\n\r\n* Free instances and circuits earlier to reduce max memory usage\r\n([#8118](https://github.com/AztecProtocol/aztec-packages/issues/8118))\r\n([32a04c1](https://github.com/AztecProtocol/aztec-packages/commit/32a04c1e14564192df1581829d8f0ccb4a072769))\r\n* Share the commitment key between instances to reduce mem\r\n([#8154](https://github.com/AztecProtocol/aztec-packages/issues/8154))\r\n([c3dddf8](https://github.com/AztecProtocol/aztec-packages/commit/c3dddf83941fd7411f2faefff43552aa174e1401))\r\n</details>\r\n\r\n---\r\nThis PR was generated with [Release\r\nPlease](https://github.com/googleapis/release-please). See\r\n[documentation](https://github.com/googleapis/release-please#release-please).",
          "timestamp": "2024-08-23T10:25:50+01:00",
          "tree_id": "1a7a163d575c8a81ea0817df3c5723558102373b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5ac57884828af8fd0b2da7121f937727ee059ba0"
        },
        "date": 1724405957330,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 13554.103808000007,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10389.01234 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5079.755617999993,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4667.523031999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 39870.69915000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 39870701000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14779.831767000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14779832000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3729705409,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3729705409 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 207885837,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 207885837 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3102662291,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3102662291 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 173525352,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 173525352 ns\nthreads: 1"
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
          "id": "93b1914edd1fcaf582e9f47645f7188f334fb21d",
          "message": "refactor(avm): extract rng chk from gas and mem",
          "timestamp": "2024-08-23T14:49:14Z",
          "url": "https://github.com/AztecProtocol/aztec-packages/pull/8164/commits/93b1914edd1fcaf582e9f47645f7188f334fb21d"
        },
        "date": 1724429284301,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 13289.292838000023,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10092.118189 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4919.573163999985,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4511.477937 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 39764.283927,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 39764283000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14470.127863,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14470128000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3761111182,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3761111182 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 209496581,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 209496581 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3054100960,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3054100960 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 172886224,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 172886224 ns\nthreads: 1"
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
          "id": "ed96de375d3ceaf9aa8f031608b00d6987cae6cb",
          "message": "feat(avm): integrate new range and cmp gadgets",
          "timestamp": "2024-08-23T14:49:14Z",
          "url": "https://github.com/AztecProtocol/aztec-packages/pull/8165/commits/ed96de375d3ceaf9aa8f031608b00d6987cae6cb"
        },
        "date": 1724429458952,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 13309.832764999981,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10129.886821 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4915.805544999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4492.878343 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 39853.879596000006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 39853880000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14473.728753,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14473729000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3763474729,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3763474729 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 209883959,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 209883959 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3186759814,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3186759814 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 173108272,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 173108272 ns\nthreads: 1"
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
          "id": "6e46b459e67c090a4ffe496880e47c05855f9df4",
          "message": "chore: Oink takes directly populates an instance (#8170)\n\nOink can be thought of as an \"instance completer\", i.e. when it is done\r\nrunning all of the data that comprises an instance has been created. Up\r\nuntil now the model was to pass oink a reference to a proving key. It\r\nwould \"complete\" the proving key in place by populating some witness\r\npolynomials then explicitly return the rest of the data comprising an\r\ninstance (relation_parameters etc.) in a custom struct like\r\n`OinkOutput`. The data from this output would then be std::move'd into\r\nan instance existing in the external scope.\r\n\r\nThis PR simplifies this model by simply passing oink an instance\r\n(ProverInstance or VerifierInstance) which is \"completed\" in place\r\nthroughout oink. IMO this is cleaner and clearer than the half-and-half\r\napproach of completing the proving key in place and explicitly returning\r\nother data. It also removes a ton of boilerplate for moving data in and\r\nout of an instance. I don't love the \"input parameter treated as output\r\nparameter approach\" but unless we refactor Honk/PG to construct\r\nproving_key instead of an instance, I think this is preferred. (In that\r\ncase oink could take a proving_key and return a completed instance).",
          "timestamp": "2024-08-23T15:39:16-07:00",
          "tree_id": "d26f784a89925ecf358f10a5535d1dd2a3cdcfc6",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/6e46b459e67c090a4ffe496880e47c05855f9df4"
        },
        "date": 1724453612798,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 13531.287574000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10354.083299999998 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5086.065730000016,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4695.957214 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 39769.02871200001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 39769029000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14631.225642000003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14631226000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3767305192,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3767305192 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 210633197,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 210633197 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3078762684,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3078762684 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 173344248,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 173344248 ns\nthreads: 1"
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
          "id": "8baeffd1239a20ca3cbc4071f7d7da974eff709d",
          "message": "feat: optimize to_radix (#8073)\n\n- Change the ToRadix gadget/blackbox to emit u8 limbs instead of\r\nfields\r\n- Modify the toradix blackbox in brillig with an output_bits flag, to\r\nemit u1 limbs\r\n- No casting is needed in either case (u8 or u1) saving some emitted\r\nbrillig opcodes\r\n- The AVM transpiler, then ignores the output_bits flag, since it'll\r\noutput u8s which is what the AVM expects for bits",
          "timestamp": "2024-08-26T12:21:37+02:00",
          "tree_id": "75f08440826564eaf86af17f2e7ca85c2c5bd032",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8baeffd1239a20ca3cbc4071f7d7da974eff709d"
        },
        "date": 1724668610820,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 13596.35513699999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10504.463456 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5137.794686999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4715.277559999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 39870.96331399999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 39870964000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15067.200397,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15067199000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3781615339,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3781615339 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 209733474,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 209733474 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3101053176,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3101053176 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 173367340,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 173367340 ns\nthreads: 1"
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
          "id": "0263b4c8961a751961b0b9ec98b441e598d1ca4e",
          "message": "feat: Added indirect const instruction (#8065)\n\nAdds indirect const since the AVM supports it, and uses it to reduce a\r\nbunch bytecode sizes when initializing constant arrays.",
          "timestamp": "2024-08-26T15:07:52+02:00",
          "tree_id": "b59e4084ce5939b634265c87dcbb09ce4d7b5251",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0263b4c8961a751961b0b9ec98b441e598d1ca4e"
        },
        "date": 1724678406646,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 13525.035791999982,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10296.161045 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5107.130712,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4683.926792 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 39644.855502000006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 39644856000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14815.708782000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14815708000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3745650430,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3745650430 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 207404831,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 207404831 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3066983663,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3066983663 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 172869665,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 172869665 ns\nthreads: 1"
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
          "id": "7395b95672e94318de695dc0fc71863ef31b2e30",
          "message": "refactor(Protogalaxy): Isolate some state and clarify skipped zero computation (#8173)\n\nSome steps toward clarifying state during Protogalaxy proof\r\nconstruction:\r\n - Move accumulators into the class that contains state.\r\n- Reduce size of Prover header. Move internal functions into a purely\r\nstatic class. This accounts for most of the diff.\r\n- Clarify the known-zero-value while removing loose coupling of template\r\nparameters.\r\n\r\nThe next step will be to reduce the amount of state in ProverInstances.",
          "timestamp": "2024-08-26T13:35:00-04:00",
          "tree_id": "549b36c902a1ff256f4020e710e3c9981483d2fb",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7395b95672e94318de695dc0fc71863ef31b2e30"
        },
        "date": 1724694846213,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 13583.453192000008,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10239.822048999999 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5104.207797000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4723.826975 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 39787.214678000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 39787215000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14751.218413,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14751218000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3766951787,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3766951787 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 208054914,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 208054914 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3069267900,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3069267900 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 173003019,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 173003019 ns\nthreads: 1"
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
          "id": "cd5d2dfe7150fa9bd64945aa6c1a66dfa4be1536",
          "message": "refactor(Protogalaxy): Move state out of Instances (#8177)\n\nThe main goal of this PR, which is achieved, is to move all move all\r\ndata except the `_data` array out of `ProverInstances`. I do additional\r\ncleanup:\r\n- Use constructors for pow polys rather than a `void` type function to\r\nupdate the state.\r\n- Delete commented out higher folding test, which I had been maintaining\r\nin commented out form\r\n - Move `ProtogalaxyProofConstructionState` def into `ProtogalaxyProver`\r\n- More idiomatic folding of relation parameters (loop over a zip of\r\ngetters)",
          "timestamp": "2024-08-26T15:21:02-04:00",
          "tree_id": "c6e4f60ee5a89ddf8df26e9298797673cb151dfc",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/cd5d2dfe7150fa9bd64945aa6c1a66dfa4be1536"
        },
        "date": 1724700825331,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 13493.079619000015,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10322.377991000001 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5076.528722999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4678.360789000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 39592.29461900001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 39592295000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14609.373649999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14609375000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3719550373,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3719550373 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 209812343,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 209812343 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3042896287,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3042896287 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 173490579,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 173490579 ns\nthreads: 1"
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
          "id": "3540f8ea961b0001ec9f497e2ff4d00c894ce6e4",
          "message": "feat: Use oink in IVC (#8161)\n\nPrior to this work the first call to IVC accumulate initialized an\r\nincomplete (un-oinked) instance for the circuit. The second round then\r\nexecuted folding on two incomplete instances, requiring a call to oink\r\nfor each. Subsequent folding rounds only required a single oink since\r\nthe instance being folded into is a \"complete\" accumulator. This pattern\r\ncreates additional special case handling in IVC/databus. It also results\r\nin the first folding proof having a complicated structure (two internal\r\noink proofs) which makes acir constraint construction and the\r\ncorresponding proof surgery quite complicated. (The current noir\r\nframework can't even support this since recursive verification of the\r\nfirst fold proof involves a single proof but two verification keys).\r\n\r\nWith the present work, the first round of accumulation now uses oink to\r\ncomplete the instance and create an oink proof. The first kernel\r\n(instead of doing no recursive work) now does a single recursive oink\r\nverification. This allows for all subsequent rounds to have identical\r\nstructure - they fold two instances where only the new one is incomplete\r\nand thus only one oink proof is contained in the fold proof. It also\r\nallows every recursive verification (there are now two types: oink and\r\nPG) to be associated with a single proof and a single verification key,\r\nin line with how recursion is currently specified from noir.\r\n\r\nNote: This change also simplifies the databus consistency checks since\r\nthere is no longer any need to treat the first round of folding as a\r\nspecial case.",
          "timestamp": "2024-08-26T21:37:36Z",
          "tree_id": "fe463b80bac30dd5010ce94058bf174ae9c80a8a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/3540f8ea961b0001ec9f497e2ff4d00c894ce6e4"
        },
        "date": 1724709236121,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 13514.988920000007,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10372.168873999997 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5141.761798000019,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4738.8083910000005 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 39562.933271,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 39562933000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14761.700784999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14761701000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3773080067,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3773080067 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 208777462,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 208777462 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3053206641,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3053206641 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 173073875,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 173073875 ns\nthreads: 1"
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
          "id": "47e83fa680f46b12cd65c26475908987f97fff4d",
          "message": "fix(bb): eliminate recursion in accumulate* (#8205)\n\nJean is working on the AVM recursive verifier and he found that these\nfunctions were executed recursively (the compiler was indeed generating\nrecursive calls) and causing a stack overflow. This fixes that.\n* ~~Also fixed `accumulate_relation_evaluations_without_skipping` which\nwas only not skipping the first relation.~~ Tests fail with the fix,\nI've added a comment.\n* I also made some params `const&`. IIUC they were being copied before\nwhich can be massive for the type `AllValues`. Not sure about that but\nyou might want to check the callers, etc.",
          "timestamp": "2024-08-27T14:00:30+01:00",
          "tree_id": "48228f7a215f4460e1d28bcd247adeca1c73f09d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/47e83fa680f46b12cd65c26475908987f97fff4d"
        },
        "date": 1724764280203,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 13497.53438000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10433.232167000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5095.946416000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4660.768961000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 39514.393355,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 39514393000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14675.655707,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14675655000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3780309344,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3780309344 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 207605461,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 207605461 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3067587446,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3067587446 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 173312509,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 173312509 ns\nthreads: 1"
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
          "id": "a7887d738fb923408ded9ffb8d7ab381016994e6",
          "message": "chore(master): Release 0.51.0 (#8158)",
          "timestamp": "2024-08-27T13:53:22Z",
          "tree_id": "f6901c14bac72714db57b6423efcd39aea22f92b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a7887d738fb923408ded9ffb8d7ab381016994e6"
        },
        "date": 1724768584664,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 13484.208531000007,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10290.779784 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5101.416301,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4682.595083 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 39593.35877900001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 39593359000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14639.834369999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14639836000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3799302811,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3799302811 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 209454290,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 209454290 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3111814716,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3111814716 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 172143648,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 172143648 ns\nthreads: 1"
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
          "id": "55b6ba28938a8d89a4255607a61243cf13391665",
          "message": "fix(bb-prover): create structure for AVM vk (#8233)\n\nApologies for duplicating code! I tried putting a generic on the \"base\"\nclasses, but (1) generics don't play well with static methods (e.g.,\nfromBuffer) and (2) you still need to pass the value for the VK size (on\ntop of the type). I think most of this duplication can be avoided if you\njust accept some type unsafety and save things as `Fr[]` instead of\ntuples with size.\n\nPS: There might be still work to do to align the \"num public inputs\" etc\nindices, and the vk hash.",
          "timestamp": "2024-08-28T15:56:51+01:00",
          "tree_id": "afac2b8273e0318a5a2142c575f8d5111494a7f4",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/55b6ba28938a8d89a4255607a61243cf13391665"
        },
        "date": 1724857892865,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 13644.821774000007,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10694.891794 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5233.974395000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4814.628248 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 39821.008731,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 39821009000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14779.256242000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14779256000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3807274593,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3807274593 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 210597651,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 210597651 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3112539309,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3112539309 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 174149039,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 174149039 ns\nthreads: 1"
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
          "id": "10d7edd3f1ba6d0e113efd2e2bf2d01809ef43d4",
          "message": "feat: proof surgery class (#8236)\n\nAdds a `ProofSurgeon` class that manages all proof surgery, e.g.\r\nsplitting public inputs out of proof for acir and reconstructing again\r\nfor bberg. Simplifies things quite a bit in the process.",
          "timestamp": "2024-08-28T14:13:48-07:00",
          "tree_id": "85ecbdbefb76feb4fc2897a0036853951f8e247f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/10d7edd3f1ba6d0e113efd2e2bf2d01809ef43d4"
        },
        "date": 1724880933177,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 13438.997488000012,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10193.941557999999 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5090.167473000009,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4658.544515999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 39694.010487,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 39694011000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14611.353134,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14611352000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3772471015,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3772471015 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 209251901,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 209251901 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3066250897,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3066250897 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 172553327,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 172553327 ns\nthreads: 1"
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
          "id": "ac54f5ce82ac9ca51e35390b782c7da26d3b00da",
          "message": "fix(bb): mac build (#8255)",
          "timestamp": "2024-08-29T01:34:08+01:00",
          "tree_id": "441bfdebba7fbaea6d79fcab1f90e0fe9f5f40da",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ac54f5ce82ac9ca51e35390b782c7da26d3b00da"
        },
        "date": 1724893246087,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 13726.291202999988,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10561.954965 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5313.71356199999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4888.807434000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 40167.21280699999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 40167213000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15166.263861000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15166263000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3800921463,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3800921463 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 214312673,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 214312673 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3144035472,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3144035472 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 176657224,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 176657224 ns\nthreads: 1"
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
          "id": "0653ba5cc8283fade1c9f8fd534717833cc18e0a",
          "message": "fix: handle constant output for sha256 (#8251)\n\nSmall PR to enable constant outputs support for sha256. This is required\r\nin order to enable constant inputs for sha256.\r\nI expected that constant inputs sha256 to be folded in Noir but we may\r\nbe missing some cases.",
          "timestamp": "2024-08-29T11:28:59+02:00",
          "tree_id": "839b0424d7c23f39bcac0de08ce4d38588387eac",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0653ba5cc8283fade1c9f8fd534717833cc18e0a"
        },
        "date": 1724924650413,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 13540.50203,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10349.916316 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5133.519778999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4765.987133 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 39968.78757700001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 39968787000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14735.276866,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14735277000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3780129175,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3780129175 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 208308511,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 208308511 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3100384190,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3100384190 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 172941020,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 172941020 ns\nthreads: 1"
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
          "id": "bdd9b0677089bc54c461beddafc60db95e2456c2",
          "message": "feat(avm): 1-slot sload/sstore (nr, ts) (#8264)\n\nAs agreed with Zac,\n* Changes the AVM opcodes to work 1-slot at a time (this is easier to handle in the circuit).\n* Bubbles up changes to aztec nr. However, this is internal to the PublicContext only, the exported interface still takes N slots/fields.\n\nOn the CPP side, I hardcoded sizes to 1. Work needs to be done to simplify things now that we can.",
          "timestamp": "2024-08-29T16:29:40+01:00",
          "tree_id": "4649e5a9cacdae20b2a49f0941770c50a05e4f0b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/bdd9b0677089bc54c461beddafc60db95e2456c2"
        },
        "date": 1724946620358,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 13502.585730999983,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10292.982155000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5136.329669000005,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4757.382818 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 39735.570803999995,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 39735571000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14710.145868000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14710146000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3790805228,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3790805228 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 208324931,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 208324931 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3061374098,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3061374098 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 172504549,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 172504549 ns\nthreads: 1"
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
          "id": "2323cd53486d3a8a063685094ad51aa98412c4a5",
          "message": "refactor(bb): use std::span in pippenger for scalars (#8269)\n\nRefactoring stepping stone. Behaves identically\r\n\r\nNext step would be to use this to allow accessing power of 2 quantities\r\nabove the std::span size() (with a different wrapper class) so that\r\nnon-powers-of-2 can be passed directly to pippenger\r\n\r\nWe recently anted to save memory on polynomials. The idea is that\r\ninstead of rounding up to a power of 2 to make pippenger fast (at cost\r\nof memory), we will make a wrapper class that happily pretends it has\r\nT{} (i.e. zeroes) anywhere form 0 to nearest rounded up power of 2. For\r\nstarters this just introduces a std::span, which should behave\r\nidentically",
          "timestamp": "2024-08-29T17:01:38Z",
          "tree_id": "31b16225009c56551e9841d8ef13262eed82adcd",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/2323cd53486d3a8a063685094ad51aa98412c4a5"
        },
        "date": 1724951819644,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 13802.474261000014,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10547.411571999999 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5069.99193499999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4646.312263999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 40270.66841,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 40270667000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14611.493934999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14611493000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3784618196,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3784618196 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 210979989,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 210979989 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3176792949,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3176792949 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 175458836,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 175458836 ns\nthreads: 1"
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
          "id": "0dd954e5be1536ca30b43f883ef5b20f1add1408",
          "message": "feat(avm): range check gadget (#7967)\n\nThis doesnt replace the existing range check - this just sets up the initial work for a range check gadget",
          "timestamp": "2024-08-29T18:34:28+01:00",
          "tree_id": "615aa21e5d88d691a2a1b66d062f75180963da3d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0dd954e5be1536ca30b43f883ef5b20f1add1408"
        },
        "date": 1724954155534,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 13460.563995,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10381.328398000001 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5051.023547,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4661.523531 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 39592.85596100001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 39592857000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14707.273602000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14707274000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3735297934,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3735297934 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 209645845,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 209645845 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3069637284,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3069637284 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 173180514,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 173180514 ns\nthreads: 1"
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
          "id": "cc12558c8683b67ebfaf37d2018fd87ff52ab974",
          "message": "refactor(avm): replace range and cmp with gadgets (#8164)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this line.",
          "timestamp": "2024-08-29T19:50:38+01:00",
          "tree_id": "311e1a69f4a210cfe17742bcad7db45c9b6b8f34",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/cc12558c8683b67ebfaf37d2018fd87ff52ab974"
        },
        "date": 1724958341059,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 13746.385995999986,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10742.527569 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5064.125118999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4582.918392999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 39756.178349,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 39756179000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14761.892755,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14761892000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3899793116,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3899793116 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 219958465,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 219958465 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3101696455,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3101696455 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 174907237,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 174907237 ns\nthreads: 1"
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
          "id": "6a5587c7cd85a11eafd8c9a1b39d34274e076396",
          "message": "feat(avm): avm recursive verifier cpp (#8162)\n\nResolves #7790\r\nResolves #7816 \r\nThe current version does not enable checks related to public inputs.\r\nThis will be handled as part of #7817",
          "timestamp": "2024-08-29T22:54:26+02:00",
          "tree_id": "a193cb864db48448ae981d4708a98c7fdc880ca0",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/6a5587c7cd85a11eafd8c9a1b39d34274e076396"
        },
        "date": 1724965604367,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 14637.833551,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11482.356264 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5172.426130999995,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4769.385147999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 39885.28477299999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 39885284000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14957.589821,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14957590000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3771659685,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3771659685 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 207988271,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 207988271 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3100787228,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3100787228 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 173560697,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 173560697 ns\nthreads: 1"
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
          "id": "2e1be18fac9e671923119883f27af4226cec9c44",
          "message": "feat(avm): integrate new range and cmp gadgets (#8165)\n\n```\r\ntime AVM_ENABLE_FULL_PROVING=1 ./bb avm_prove --avm-bytecode /tmp/bb-dY93DM/tmp-ygXEjA/avm_bytecode.bin --avm-calldata /tmp/bb-dY93DM/tmp-ygXEjA/avm_calldata.bin --avm-public-inputs /tmp/bb-dY93DM/tmp-ygXEjA/avm_public_inputs.bin --avm-hints /tmp/bb-dY93DM/tmp-ygXEjA/avm_hints.bin -o /tmp/bb-dY93DM/tmp-ygXEjA/ -v\r\nbb command is: avm_prove\r\nbytecode size: 38126\r\ncalldata size: 6\r\npublic_inputs size: 691\r\nhints.storage_value_hints size: 2\r\nhints.note_hash_exists_hints size: 0\r\nhints.nullifier_exists_hints size: 1\r\nhints.l1_to_l2_message_exists_hints size: 0\r\nhints.externalcall_hints size: 0\r\nhints.contract_instance_hints size: 0\r\ninitializing crs with size: 1048576\r\nusing cached crs of size 33554433 at \"/mnt/user-data/ilyas/.bb-crs/bn254_g1.dat\"\r\nDeserialized 3322 instructions\r\n------- GENERATING TRACE -------\r\nTrace sizes before padding:\r\n        main_trace_size: 65535\r\n        mem_trace_size: 2084\r\n        alu_trace_size: 410\r\n        range_check_size: 65536\r\n        conv_trace_size: 1\r\n        bin_trace_size: 0\r\n        sha256_trace_size: 0\r\n        poseidon2_trace_size: 0\r\n        pedersen_trace_size: 4\r\n        gas_trace_size: 890\r\n        fixed_gas_table_size: 66\r\n        slice_trace_size: 7\r\n        range_check_trace_size: 4266\r\n        cmp_trace_size: 39\r\nBuilt trace size: 65536\r\nNumber of columns: 696\r\nNumber of non-zero elements: 236111/45613056 (0%)\r\nRelation degrees:\r\n        alu: [5°: 2, 4°: 6, 3°: 11, 2°: 24, 1°: 5]\r\n        binary: [3°: 1, 2°: 9]\r\n        cmp: [4°: 3, 3°: 1, 2°: 21, 1°: 2]\r\n        conversion: [2°: 1]\r\n        gas: [4°: 2, 3°: 2, 2°: 2]\r\n        keccakf1600: [2°: 1]\r\n        kernel: [3°: 3, 2°: 41]\r\n        main: [4°: 3, 3°: 7, 2°: 101, 1°: 3]\r\n        mem: [5°: 1, 3°: 8, 2°: 41, 1°: 2]\r\n        mem_slice: [3°: 3, 2°: 7, 1°: 1]\r\n        pedersen: [2°: 1]\r\n        poseidon2: [6°: 256, 2°: 17]\r\n        range_check: [3°: 1, 2°: 15, 1°: 9]\r\n        sha256: [2°: 1]\r\nTrace size after padding: 2^16\r\n------- PROVING EXECUTION -------\r\nvk fields size: 66\r\ncircuit size: 0x0000000000000000000000000000000000000000000000000000000000010000\r\nnum of pub inputs: 0x0000000000000000000000000000000000000000000000000000000000000000\r\nproof written to: \"/tmp/bb-dY93DM/tmp-ygXEjA/proof\"\r\nvk written to: \"/tmp/bb-dY93DM/tmp-ygXEjA/vk\"\r\nvk as fields written to: \"/tmp/bb-dY93DM/tmp-ygXEjA/vk_fields.json\"\r\n------- STATS -------\r\nprove/all_ms: 6953\r\nprove/create_composer_ms: 0\r\nprove/create_prover_ms: 1988\r\nprove/create_verifier_ms: 41\r\nprove/execute_log_derivative_inverse_commitments_round_ms: 344\r\nprove/execute_log_derivative_inverse_round_ms: 205\r\nprove/execute_pcs_rounds_ms: 760\r\nprove/execute_relation_check_rounds_ms: 727\r\nprove/execute_wire_commitments_round_ms: 616\r\nprove/gen_trace_ms: 2150\r\n\r\nAVM_ENABLE_FULL_PROVING=1 ./bb avm_prove --avm-bytecode  --avm-calldata        71.13s user 69.17s system 1579% cpu 8.882 total\r\n```",
          "timestamp": "2024-08-29T21:55:48Z",
          "tree_id": "d6cc596db53ad6f9a5496fae182de1306d67fdef",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/2e1be18fac9e671923119883f27af4226cec9c44"
        },
        "date": 1724969341058,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 13453.888129999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10304.044625999999 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5078.400733999984,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4686.074907000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 39798.389749,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 39798389000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14751.836780000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14751837000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3795947645,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3795947645 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 210360908,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 210360908 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3076994897,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3076994897 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 173139149,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 173139149 ns\nthreads: 1"
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
          "id": "ed7c7da57a37d3727e2362d519c37dec0c36a12d",
          "message": "chore(master): Release 0.51.1 (#8218)\n\n:robot: I have created a release *beep* *boop*\r\n---\r\n\r\n\r\n<details><summary>aztec-package: 0.51.1</summary>\r\n\r\n##\r\n[0.51.1](https://github.com/AztecProtocol/aztec-packages/compare/aztec-package-v0.51.0...aztec-package-v0.51.1)\r\n(2024-08-29)\r\n\r\n\r\n### Features\r\n\r\n* Add status check to prover agent\r\n([#8248](https://github.com/AztecProtocol/aztec-packages/issues/8248))\r\n([7b3006a](https://github.com/AztecProtocol/aztec-packages/commit/7b3006a4033a1453722b516e09ff682f31f4e96b))\r\n* Faster L1 deployment\r\n([#8234](https://github.com/AztecProtocol/aztec-packages/issues/8234))\r\n([51d6699](https://github.com/AztecProtocol/aztec-packages/commit/51d66991161ffdf6f04b87b600a213d3cf0a662f))\r\n* Spartan token transfer\r\n([#8163](https://github.com/AztecProtocol/aztec-packages/issues/8163))\r\n([38f0157](https://github.com/AztecProtocol/aztec-packages/commit/38f01571ebbc90174fcdc765bac84dfcb12bbc0c))\r\n</details>\r\n\r\n<details><summary>barretenberg.js: 0.51.1</summary>\r\n\r\n##\r\n[0.51.1](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg.js-v0.51.0...barretenberg.js-v0.51.1)\r\n(2024-08-29)\r\n\r\n\r\n### Miscellaneous\r\n\r\n* **barretenberg.js:** Synchronize aztec-packages versions\r\n</details>\r\n\r\n<details><summary>aztec-packages: 0.51.1</summary>\r\n\r\n##\r\n[0.51.1](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.51.0...aztec-packages-v0.51.1)\r\n(2024-08-29)\r\n\r\n\r\n### Features\r\n\r\n* Add CLI command for gathering proving metrics\r\n([#8221](https://github.com/AztecProtocol/aztec-packages/issues/8221))\r\n([5929a42](https://github.com/AztecProtocol/aztec-packages/commit/5929a42d1683b3f006ac486624b371417917eb77))\r\n* Add status check to prover agent\r\n([#8248](https://github.com/AztecProtocol/aztec-packages/issues/8248))\r\n([7b3006a](https://github.com/AztecProtocol/aztec-packages/commit/7b3006a4033a1453722b516e09ff682f31f4e96b))\r\n* **avm:** 1-slot sload/sstore (nr, ts)\r\n([#8264](https://github.com/AztecProtocol/aztec-packages/issues/8264))\r\n([bdd9b06](https://github.com/AztecProtocol/aztec-packages/commit/bdd9b0677089bc54c461beddafc60db95e2456c2))\r\n* **avm:** Range check gadget\r\n([#7967](https://github.com/AztecProtocol/aztec-packages/issues/7967))\r\n([0dd954e](https://github.com/AztecProtocol/aztec-packages/commit/0dd954e5be1536ca30b43f883ef5b20f1add1408))\r\n* **docs:** Add partial notes doc\r\n([#8192](https://github.com/AztecProtocol/aztec-packages/issues/8192))\r\n([4299bbd](https://github.com/AztecProtocol/aztec-packages/commit/4299bbda84503993b7ddf9fd551a1d168568bd4f))\r\n* Faster L1 deployment\r\n([#8234](https://github.com/AztecProtocol/aztec-packages/issues/8234))\r\n([51d6699](https://github.com/AztecProtocol/aztec-packages/commit/51d66991161ffdf6f04b87b600a213d3cf0a662f))\r\n* Initial validator set\r\n([#8133](https://github.com/AztecProtocol/aztec-packages/issues/8133))\r\n([6d31ad2](https://github.com/AztecProtocol/aztec-packages/commit/6d31ad236b678376227b1ca408b0f0169e05fc83))\r\n* L1-publisher cleanup\r\n([#8148](https://github.com/AztecProtocol/aztec-packages/issues/8148))\r\n([6ae2535](https://github.com/AztecProtocol/aztec-packages/commit/6ae2535cb5b65ac30a472084613bd78529397e32))\r\n* Proof surgery class\r\n([#8236](https://github.com/AztecProtocol/aztec-packages/issues/8236))\r\n([10d7edd](https://github.com/AztecProtocol/aztec-packages/commit/10d7edd3f1ba6d0e113efd2e2bf2d01809ef43d4))\r\n* Request specific transactions through the p2p layer\r\n([#8185](https://github.com/AztecProtocol/aztec-packages/issues/8185))\r\n([54e1cc7](https://github.com/AztecProtocol/aztec-packages/commit/54e1cc7f07a71ab0e77f81cbced79363de67fe02))\r\n* Slot duration flexibility\r\n([#8122](https://github.com/AztecProtocol/aztec-packages/issues/8122))\r\n([708e4e5](https://github.com/AztecProtocol/aztec-packages/commit/708e4e5588a73d46faa0fc258dd9664515764f5d))\r\n* Spartan token transfer\r\n([#8163](https://github.com/AztecProtocol/aztec-packages/issues/8163))\r\n([38f0157](https://github.com/AztecProtocol/aztec-packages/commit/38f01571ebbc90174fcdc765bac84dfcb12bbc0c))\r\n\r\n\r\n### Bug Fixes\r\n\r\n* Attempt to fix nightly test\r\n([#8222](https://github.com/AztecProtocol/aztec-packages/issues/8222))\r\n([477eec5](https://github.com/AztecProtocol/aztec-packages/commit/477eec50e0dcaad43b552b97469ad851359c83d6))\r\n* **avm-simulator:** Await avm bytecode check\r\n([#8268](https://github.com/AztecProtocol/aztec-packages/issues/8268))\r\n([4410eb3](https://github.com/AztecProtocol/aztec-packages/commit/4410eb34fdb1bd566b1474bcad49997b5c08d600))\r\n* **bb-prover:** Create structure for AVM vk\r\n([#8233](https://github.com/AztecProtocol/aztec-packages/issues/8233))\r\n([55b6ba2](https://github.com/AztecProtocol/aztec-packages/commit/55b6ba28938a8d89a4255607a61243cf13391665))\r\n* **bb:** Mac build\r\n([#8255](https://github.com/AztecProtocol/aztec-packages/issues/8255))\r\n([ac54f5c](https://github.com/AztecProtocol/aztec-packages/commit/ac54f5ce82ac9ca51e35390b782c7da26d3b00da))\r\n* **ci:** Spot-runner-action was not built\r\n([#8274](https://github.com/AztecProtocol/aztec-packages/issues/8274))\r\n([c1509c1](https://github.com/AztecProtocol/aztec-packages/commit/c1509c1fa41654818c5a790a039995cafb5c4c0f))\r\n* **ci:** Try fix brotli edge-case\r\n([#8256](https://github.com/AztecProtocol/aztec-packages/issues/8256))\r\n([e03ea0b](https://github.com/AztecProtocol/aztec-packages/commit/e03ea0bd716ccb21ad94414ea393a742dd7f5a65))\r\n* Docker containers healthchecks\r\n([#8228](https://github.com/AztecProtocol/aztec-packages/issues/8228))\r\n([19edbbb](https://github.com/AztecProtocol/aztec-packages/commit/19edbbba2e9841d89a4bab5cd3db674e6004044a))\r\n* **docs:** Update entrypoint details on accounts page\r\n([#8184](https://github.com/AztecProtocol/aztec-packages/issues/8184))\r\n([8453ec7](https://github.com/AztecProtocol/aztec-packages/commit/8453ec7e8bb2b5c60ac2d45eed17241cecd02573))\r\n* Export brillig names in contract functions\r\n([#8212](https://github.com/AztecProtocol/aztec-packages/issues/8212))\r\n([4745741](https://github.com/AztecProtocol/aztec-packages/commit/47457412d9534885d98ff5ca22e9ec4f4b72f9c4))\r\n* Fixes for the nightly test run against Sepolia\r\n([#8229](https://github.com/AztecProtocol/aztec-packages/issues/8229))\r\n([cfc65c6](https://github.com/AztecProtocol/aztec-packages/commit/cfc65c6230f95c1ed0232a1343c9d9eb37757f9d))\r\n* Handle constant output for sha256\r\n([#8251](https://github.com/AztecProtocol/aztec-packages/issues/8251))\r\n([0653ba5](https://github.com/AztecProtocol/aztec-packages/commit/0653ba5cc8283fade1c9f8fd534717833cc18e0a))\r\n* Log public vm errors as warn in prover-agent\r\n([#8247](https://github.com/AztecProtocol/aztec-packages/issues/8247))\r\n([9f4ea9f](https://github.com/AztecProtocol/aztec-packages/commit/9f4ea9fd04ac393cad2422377fceea8dcc87a793))\r\n* Remove devnet ARM builds for now\r\n([#8202](https://github.com/AztecProtocol/aztec-packages/issues/8202))\r\n([81ef715](https://github.com/AztecProtocol/aztec-packages/commit/81ef715f93e2e2380c08189f5922a94cdfe1f66a))\r\n* Remove fundFpc step from bootstrap\r\n([#8245](https://github.com/AztecProtocol/aztec-packages/issues/8245))\r\n([a742531](https://github.com/AztecProtocol/aztec-packages/commit/a742531d31537089323159f9c798a8aba2ab8e1d))\r\n* Ts codegen\r\n([#8267](https://github.com/AztecProtocol/aztec-packages/issues/8267))\r\n([cb58800](https://github.com/AztecProtocol/aztec-packages/commit/cb58800ca82b9b15078be1469b5f312d3e46a6f0))\r\n\r\n\r\n### Miscellaneous\r\n\r\n* Add check to just release images to devnet-deploys\r\n([#8242](https://github.com/AztecProtocol/aztec-packages/issues/8242))\r\n([aa6791d](https://github.com/AztecProtocol/aztec-packages/commit/aa6791d7950036df687596af05f77da08d54a3c2))\r\n* Add partial note support for value note\r\n([#8141](https://github.com/AztecProtocol/aztec-packages/issues/8141))\r\n([daa57cc](https://github.com/AztecProtocol/aztec-packages/commit/daa57cc89186210ab2e33479c54ff8a5fd476bc4))\r\n* Always run `build-check` step in `publish-bb.yml`\r\n([#8240](https://github.com/AztecProtocol/aztec-packages/issues/8240))\r\n([5e9749f](https://github.com/AztecProtocol/aztec-packages/commit/5e9749f5bf2f7e4fef7afba036fafcdea9f0986c))\r\n* **avm:** Replace range and cmp with gadgets\r\n([#8164](https://github.com/AztecProtocol/aztec-packages/issues/8164))\r\n([cc12558](https://github.com/AztecProtocol/aztec-packages/commit/cc12558c8683b67ebfaf37d2018fd87ff52ab974))\r\n* Basic network matrix\r\n([#8257](https://github.com/AztecProtocol/aztec-packages/issues/8257))\r\n([2a76b1a](https://github.com/AztecProtocol/aztec-packages/commit/2a76b1a6646ab9e46df6731c6d753b7930c851a7)),\r\ncloses\r\n[#8001](https://github.com/AztecProtocol/aztec-packages/issues/8001)\r\n* **bb:** Use std::span in pippenger for scalars\r\n([#8269](https://github.com/AztecProtocol/aztec-packages/issues/8269))\r\n([2323cd5](https://github.com/AztecProtocol/aztec-packages/commit/2323cd53486d3a8a063685094ad51aa98412c4a5))\r\n* Configure interval mining for anvil\r\n([#8211](https://github.com/AztecProtocol/aztec-packages/issues/8211))\r\n([eba57b4](https://github.com/AztecProtocol/aztec-packages/commit/eba57b42aafc2b4b5fe0ebc9a8edd22a9fdbe71b))\r\n* Create external-ci-approved.yml\r\n([#8235](https://github.com/AztecProtocol/aztec-packages/issues/8235))\r\n([24b059b](https://github.com/AztecProtocol/aztec-packages/commit/24b059be5fe29d70304707e37b962646d1f8cea5))\r\n* Disallow prune in devnet + add onlyOwners\r\n([#8134](https://github.com/AztecProtocol/aztec-packages/issues/8134))\r\n([c736f96](https://github.com/AztecProtocol/aztec-packages/commit/c736f961d6297daa688891e6ca721b2cb2a327a2))\r\n* Fix various warnings in noir code\r\n([#8258](https://github.com/AztecProtocol/aztec-packages/issues/8258))\r\n([1c6b478](https://github.com/AztecProtocol/aztec-packages/commit/1c6b4784b77cd79e06962ae4674a6f061e5c2eaa))\r\n* Less noisy AVM failures in proving\r\n([#8227](https://github.com/AztecProtocol/aztec-packages/issues/8227))\r\n([03bcd62](https://github.com/AztecProtocol/aztec-packages/commit/03bcd623d8c39118bd8ba707ff9cea21b46ff595))\r\n* Open an issue if publishing bb fails\r\n([#8223](https://github.com/AztecProtocol/aztec-packages/issues/8223))\r\n([2d7a775](https://github.com/AztecProtocol/aztec-packages/commit/2d7a775175ca7593e3b10517c22289da10f6f6dd))\r\n* Reinstate l1-contracts package\r\n([#8250](https://github.com/AztecProtocol/aztec-packages/issues/8250))\r\n([263a912](https://github.com/AztecProtocol/aztec-packages/commit/263a9124b203c18ed701c3dabc291a5a477f6d26))\r\n* Remove unused generic parameters\r\n([#8249](https://github.com/AztecProtocol/aztec-packages/issues/8249))\r\n([00ed045](https://github.com/AztecProtocol/aztec-packages/commit/00ed04546464628ee5c8d7dc98bcbfe304b0f087))\r\n* Replace relative paths to noir-protocol-circuits\r\n([1783c80](https://github.com/AztecProtocol/aztec-packages/commit/1783c803a8b5c01cfc85c29ed8a53ce99afafe06))\r\n* Replace relative paths to noir-protocol-circuits\r\n([ffe1f35](https://github.com/AztecProtocol/aztec-packages/commit/ffe1f35d6b72179f24dd82f08ea8c22d8ca13732))\r\n* Report prover metrics\r\n([#8155](https://github.com/AztecProtocol/aztec-packages/issues/8155))\r\n([dc7bcdf](https://github.com/AztecProtocol/aztec-packages/commit/dc7bcdfcfbe102fe49e59656123492179251f405)),\r\ncloses\r\n[#7675](https://github.com/AztecProtocol/aztec-packages/issues/7675)\r\n* Rework balances map\r\n([#8127](https://github.com/AztecProtocol/aztec-packages/issues/8127))\r\n([1cac3dd](https://github.com/AztecProtocol/aztec-packages/commit/1cac3dde5310c0a1b1b7f12c020de5516cc7b563)),\r\ncloses\r\n[#8104](https://github.com/AztecProtocol/aztec-packages/issues/8104)\r\n* Run CI after merges to provernet\r\n([#8244](https://github.com/AztecProtocol/aztec-packages/issues/8244))\r\n([97e5e25](https://github.com/AztecProtocol/aztec-packages/commit/97e5e253e7461bd4e7a5eaa83846753d0d4e0e52))\r\n\r\n\r\n### Documentation\r\n\r\n* Minor fixes\r\n([#8273](https://github.com/AztecProtocol/aztec-packages/issues/8273))\r\n([2b8af9e](https://github.com/AztecProtocol/aztec-packages/commit/2b8af9ec25ec7a9a7057f16b476140aa659c3f90))\r\n</details>\r\n\r\n<details><summary>barretenberg: 0.51.1</summary>\r\n\r\n##\r\n[0.51.1](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.51.0...barretenberg-v0.51.1)\r\n(2024-08-29)\r\n\r\n\r\n### Features\r\n\r\n* **avm:** 1-slot sload/sstore (nr, ts)\r\n([#8264](https://github.com/AztecProtocol/aztec-packages/issues/8264))\r\n([bdd9b06](https://github.com/AztecProtocol/aztec-packages/commit/bdd9b0677089bc54c461beddafc60db95e2456c2))\r\n* **avm:** Range check gadget\r\n([#7967](https://github.com/AztecProtocol/aztec-packages/issues/7967))\r\n([0dd954e](https://github.com/AztecProtocol/aztec-packages/commit/0dd954e5be1536ca30b43f883ef5b20f1add1408))\r\n* Proof surgery class\r\n([#8236](https://github.com/AztecProtocol/aztec-packages/issues/8236))\r\n([10d7edd](https://github.com/AztecProtocol/aztec-packages/commit/10d7edd3f1ba6d0e113efd2e2bf2d01809ef43d4))\r\n\r\n\r\n### Bug Fixes\r\n\r\n* **bb-prover:** Create structure for AVM vk\r\n([#8233](https://github.com/AztecProtocol/aztec-packages/issues/8233))\r\n([55b6ba2](https://github.com/AztecProtocol/aztec-packages/commit/55b6ba28938a8d89a4255607a61243cf13391665))\r\n* **bb:** Mac build\r\n([#8255](https://github.com/AztecProtocol/aztec-packages/issues/8255))\r\n([ac54f5c](https://github.com/AztecProtocol/aztec-packages/commit/ac54f5ce82ac9ca51e35390b782c7da26d3b00da))\r\n* Handle constant output for sha256\r\n([#8251](https://github.com/AztecProtocol/aztec-packages/issues/8251))\r\n([0653ba5](https://github.com/AztecProtocol/aztec-packages/commit/0653ba5cc8283fade1c9f8fd534717833cc18e0a))\r\n\r\n\r\n### Miscellaneous\r\n\r\n* **avm:** Replace range and cmp with gadgets\r\n([#8164](https://github.com/AztecProtocol/aztec-packages/issues/8164))\r\n([cc12558](https://github.com/AztecProtocol/aztec-packages/commit/cc12558c8683b67ebfaf37d2018fd87ff52ab974))\r\n* **bb:** Use std::span in pippenger for scalars\r\n([#8269](https://github.com/AztecProtocol/aztec-packages/issues/8269))\r\n([2323cd5](https://github.com/AztecProtocol/aztec-packages/commit/2323cd53486d3a8a063685094ad51aa98412c4a5))\r\n</details>\r\n\r\n---\r\nThis PR was generated with [Release\r\nPlease](https://github.com/googleapis/release-please). See\r\n[documentation](https://github.com/googleapis/release-please#release-please).",
          "timestamp": "2024-08-29T22:57:59Z",
          "tree_id": "beae9eb54949b472bbe302550553846b9ded6618",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ed7c7da57a37d3727e2362d519c37dec0c36a12d"
        },
        "date": 1724973559141,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 13439.03218700001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10191.149535 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5112.5614200000055,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4709.094346999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 39604.36790999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 39604369000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14752.901779999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14752901000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3753932979,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3753932979 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 208285896,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 208285896 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3095084118,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3095084118 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 173292754,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 173292754 ns\nthreads: 1"
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
          "id": "cc12558c8683b67ebfaf37d2018fd87ff52ab974",
          "message": "refactor(avm): replace range and cmp with gadgets (#8164)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this line.",
          "timestamp": "2024-08-29T19:50:38+01:00",
          "tree_id": "311e1a69f4a210cfe17742bcad7db45c9b6b8f34",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/cc12558c8683b67ebfaf37d2018fd87ff52ab974"
        },
        "date": 1725020818326,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 13415.749659999989,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10267.035354000001 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5106.898284999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4707.720791 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 39592.537155,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 39592537000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14719.868357000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14719869000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3791014715,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3791014715 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 208999644,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 208999644 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3111005329,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3111005329 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 174392881,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 174392881 ns\nthreads: 1"
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
          "id": "7af80ff98313a20ed18dc15fd5e4c22c82828a98",
          "message": "chore(bb): make compile on stock mac clang (#8278)\n\nxcode clang does not support all of c++20 it seems e.g. can't do\r\nConstructor(A,B,C) where A B and C are the members of a struct with only\r\ndefault constructors. Some common issues that come up like the\r\nuint64_t/size_t split",
          "timestamp": "2024-08-30T15:58:33+01:00",
          "tree_id": "102eceea53397a3ee1d50b7e8e313f91c46fb730",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7af80ff98313a20ed18dc15fd5e4c22c82828a98"
        },
        "date": 1725031091562,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 13455.709143999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10398.923689000001 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5072.433451999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4712.197612 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 39662.265849,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 39662266000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14564.31712,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14564317000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3785964003,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3785964003 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 207931450,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 207931450 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3108863531,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3108863531 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 172640666,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 172640666 ns\nthreads: 1"
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
          "id": "18abf3785e0826b81417b9f99ffe9776a0213fb1",
          "message": "docs(bb): transcript spec (#8301)\n\nfrom\r\nhttps://github.com/AztecProtocol/ignition-verification/blob/master/Transcript_spec.md",
          "timestamp": "2024-08-30T18:50:59Z",
          "tree_id": "520981f69c7c3f53e1c78a036eb68ace6f3b2b6d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/18abf3785e0826b81417b9f99ffe9776a0213fb1"
        },
        "date": 1725044604043,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 13490.369242000013,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10318.187280999999 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5064.9674020000075,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4651.812673 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 39422.748958,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 39422748000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14687.215427999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14687216000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3745305080,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3745305080 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 208534399,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 208534399 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3086968700,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3086968700 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 173619308,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 173619308 ns\nthreads: 1"
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
          "id": "4a9bb9d47e6b1838875c9ce16fa80a2133b05920",
          "message": "feat: Clarify state in Protogalaxy 3 (#8181)\n\nMain goal: more explicit state by making round functions pure functions\r\n(with const inputs).\r\n- Exception: first round mutates instances. May handle in follow-on that\r\nchanges handling of accumulator.\r\n- Also: get rid of several pieces of prover state (`gate_challenges`,\r\n`relation_parameters`, `optimised_relation_parameters`, `accumulators`,\r\n`result`)\r\n- FYI: will likely get rid of temporary refactoring helper classes\r\n`State` and `ProtogalaxyProverInternal` also.\r\n\r\nAlso:\r\n- Rename `accumulator_update_round`, `preparation_round`,\r\n`compressed_perturbator`, `OptimisedFoo`, `CombinedFoo`.\r\n - Combiner test does not use prover class.\r\n - Use `const` in a bunch of places\r\n- Reduce amount of templating by explicitly naming instantiations of\r\ncompute_combiner",
          "timestamp": "2024-08-30T19:54:10Z",
          "tree_id": "967d75d2191c870419530c7c60208c96eca8d18d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/4a9bb9d47e6b1838875c9ce16fa80a2133b05920"
        },
        "date": 1725048686760,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 13425.153857999987,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10191.722959999997 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5107.53883000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4654.311539 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 39664.33926000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 39664340000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14744.279795000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14744279000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3782092932,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3782092932 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 208529732,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 208529732 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3069457948,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3069457948 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 175020004,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 175020004 ns\nthreads: 1"
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
          "id": "be2169da8057a06c0cc5c503ec523e62647775e1",
          "message": "refactor: Renaming around Protogalaxy Prover (#8272)\n\nThis is literally just a ton of renaming + shuffling some declaration\r\nand defs in the Protogalaxy prover so the orders of these match. Some\r\nhighlights:\r\n- I wanted to stop using the term \"optimised\" around the Pg optimization\r\nthat skips computing zero because we have many optimizations and the\r\nname was unclear. I also put the extra qualifier on the non-production\r\ncase where we _don't_ use that optimization, which is currently just in\r\ntests of the combiner.\r\n- Ariel told me that the real name of the protocol is Protogalaxy--this\r\nis in the name of the paper in pdf form, but not on the eprint page\r\n:shrug:\r\n- `PowPolynomial` is now a misnomer because it doesn't involve powers of\r\na challenge $\\beta$, but rather a bunch of monomials generate from a set\r\nof $\\beta_i$'s. So I rename this and the corresponding files. I didn't\r\nhave to change this but I do think clarity here comes at a low enough\r\ncost to merit making the change.\r\n- We have functions that refer to the \"full honk\" relation, which is\r\nfine, but strictly speaking there is no connection to Honk when using\r\nProtogalaxy or sumcheck in insolation, so it makes sense to give more\r\nagnostic and IMO slightly clearer names.",
          "timestamp": "2024-08-30T21:14:00Z",
          "tree_id": "1c9a393ff201559bf6b785f62a44492631ff5038",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/be2169da8057a06c0cc5c503ec523e62647775e1"
        },
        "date": 1725053448667,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 13449.424109999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10332.491965000001 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5080.398435999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4721.820879999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 39628.54128600001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 39628541000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14742.644203,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14742644000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3755411149,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3755411149 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 206473563,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 206473563 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3099576590,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3099576590 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 173461689,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 173461689 ns\nthreads: 1"
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
          "id": "104ea85667b4be03dd52cd20812907e0b85bcdd8",
          "message": "refactor(bb): more graceful pippenger on non-powers-of-2 (#8279)\n\nPippenger was 50% slow if you had a power of 2 minus 1 vs the same power\r\nof 2\r\nBefore\r\n```\r\n----------------------------------------------------------------------------------------------\r\nBenchmark                                                    Time             CPU   Iterations\r\n----------------------------------------------------------------------------------------------\r\nbench_commit_random<curve::BN254>/22                      1438 ms         1313 ms            1\r\nbench_commit_random_non_power_of_2<curve::BN254>/22       1583 ms         1422 ms            1\r\n```\r\n\r\nAfter\r\n```\r\n----------------------------------------------------------------------------------------------\r\nBenchmark                                                    Time             CPU   Iterations\r\n----------------------------------------------------------------------------------------------\r\nbench_commit_random<curve::BN254>/22                      1436 ms         1303 ms            1\r\nbench_commit_random_non_power_of_2<curve::BN254>/22       1438 ms         1266 ms            1\r\n```",
          "timestamp": "2024-08-31T10:31:38+01:00",
          "tree_id": "0dfd1055c14c559fdf5e9d6fb4b0bbcba44f1ce0",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/104ea85667b4be03dd52cd20812907e0b85bcdd8"
        },
        "date": 1725097608855,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 13476.275716999993,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10354.470989000001 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5131.195473999995,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4739.8871739999995 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 39656.00705099999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 39656007000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14690.214987,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14690215000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3689985920,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3689985920 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 144445536,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 144445536 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3040806686,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3040806686 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 119554360,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 119554360 ns\nthreads: 1"
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
          "id": "2d3e0b672c11eddf0e4e50f00a42a662bdd67c0c",
          "message": "chore(revert): earthfile accidental change (#8309)",
          "timestamp": "2024-08-31T11:43:49-04:00",
          "tree_id": "0e995ecfe8182aa5b9bd8acbf01e8f664e236b0c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/2d3e0b672c11eddf0e4e50f00a42a662bdd67c0c"
        },
        "date": 1725119765212,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 13723.357671999991,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10360.771741999999 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5108.438909,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4654.891734999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 39939.670315,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 39939670000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14718.917256,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14718918000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3717051482,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3717051482 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 148100593,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 148100593 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3101439798,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3101439798 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 120164679,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 120164679 ns\nthreads: 1"
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
          "id": "4dd51eb0a315687fc701b1da0458b71a99ab68a7",
          "message": "chore(master): Release 0.52.0 (#8289)\n\n:robot: I have created a release *beep* *boop*\r\n---\r\n\r\n\r\n<details><summary>aztec-package: 0.52.0</summary>\r\n\r\n##\r\n[0.52.0](https://github.com/AztecProtocol/aztec-packages/compare/aztec-package-v0.51.1...aztec-package-v0.52.0)\r\n(2024-09-01)\r\n\r\n\r\n### Miscellaneous\r\n\r\n* **aztec-package:** Synchronize aztec-packages versions\r\n</details>\r\n\r\n<details><summary>barretenberg.js: 0.52.0</summary>\r\n\r\n##\r\n[0.52.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg.js-v0.51.1...barretenberg.js-v0.52.0)\r\n(2024-09-01)\r\n\r\n\r\n### Miscellaneous\r\n\r\n* **barretenberg.js:** Synchronize aztec-packages versions\r\n</details>\r\n\r\n<details><summary>aztec-packages: 0.52.0</summary>\r\n\r\n##\r\n[0.52.0](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.51.1...aztec-packages-v0.52.0)\r\n(2024-09-01)\r\n\r\n\r\n### ⚠ BREAKING CHANGES\r\n\r\n* Check unused generics are bound\r\n(https://github.com/noir-lang/noir/pull/5840)\r\n\r\n### Features\r\n\r\n* Add `Expr::as_assert` (https://github.com/noir-lang/noir/pull/5857)\r\n([cf5b667](https://github.com/AztecProtocol/aztec-packages/commit/cf5b667c9566019853a5dc2a7f16ed024ab9182b))\r\n* Add `Expr::resolve` and `TypedExpr::as_function_definition`\r\n(https://github.com/noir-lang/noir/pull/5859)\r\n([cf5b667](https://github.com/AztecProtocol/aztec-packages/commit/cf5b667c9566019853a5dc2a7f16ed024ab9182b))\r\n* Add `FunctionDef::body` (https://github.com/noir-lang/noir/pull/5825)\r\n([cf5b667](https://github.com/AztecProtocol/aztec-packages/commit/cf5b667c9566019853a5dc2a7f16ed024ab9182b))\r\n* Add `FunctionDef::has_named_attribute`\r\n(https://github.com/noir-lang/noir/pull/5870)\r\n([cf5b667](https://github.com/AztecProtocol/aztec-packages/commit/cf5b667c9566019853a5dc2a7f16ed024ab9182b))\r\n* Add `Type::as_string` (https://github.com/noir-lang/noir/pull/5871)\r\n([cf5b667](https://github.com/AztecProtocol/aztec-packages/commit/cf5b667c9566019853a5dc2a7f16ed024ab9182b))\r\n* Clarify state in Protogalaxy 3\r\n([#8181](https://github.com/AztecProtocol/aztec-packages/issues/8181))\r\n([4a9bb9d](https://github.com/AztecProtocol/aztec-packages/commit/4a9bb9d47e6b1838875c9ce16fa80a2133b05920))\r\n* LSP signature help for assert and assert_eq\r\n(https://github.com/noir-lang/noir/pull/5862)\r\n([cf5b667](https://github.com/AztecProtocol/aztec-packages/commit/cf5b667c9566019853a5dc2a7f16ed024ab9182b))\r\n* **meta:** Comptime keccak\r\n(https://github.com/noir-lang/noir/pull/5854)\r\n([cf5b667](https://github.com/AztecProtocol/aztec-packages/commit/cf5b667c9566019853a5dc2a7f16ed024ab9182b))\r\n* **optimization:** Avoid merging identical (by ID) arrays\r\n(https://github.com/noir-lang/noir/pull/5853)\r\n([cf5b667](https://github.com/AztecProtocol/aztec-packages/commit/cf5b667c9566019853a5dc2a7f16ed024ab9182b))\r\n* **perf:** Simplify poseidon2 cache zero-pad\r\n(https://github.com/noir-lang/noir/pull/5869)\r\n([cf5b667](https://github.com/AztecProtocol/aztec-packages/commit/cf5b667c9566019853a5dc2a7f16ed024ab9182b))\r\n* Populate epoch 0 from initial validator set\r\n([#8286](https://github.com/AztecProtocol/aztec-packages/issues/8286))\r\n([cbdec54](https://github.com/AztecProtocol/aztec-packages/commit/cbdec5467f902388949bda0c5acc26dfbda26366))\r\n* Remove unnecessary copying of vector size during reversal\r\n(https://github.com/noir-lang/noir/pull/5852)\r\n([cf5b667](https://github.com/AztecProtocol/aztec-packages/commit/cf5b667c9566019853a5dc2a7f16ed024ab9182b))\r\n* Removing `is_dev_net` flag\r\n([#8275](https://github.com/AztecProtocol/aztec-packages/issues/8275))\r\n([fc1f307](https://github.com/AztecProtocol/aztec-packages/commit/fc1f30787b83a0c9c2ca73e675ff666395d24d74))\r\n* Show backtrace on comptime assertion failures\r\n(https://github.com/noir-lang/noir/pull/5842)\r\n([cf5b667](https://github.com/AztecProtocol/aztec-packages/commit/cf5b667c9566019853a5dc2a7f16ed024ab9182b))\r\n* Simplify constant calls to `poseidon2_permutation`, `schnorr_verify`\r\nand `embedded_curve_add` (https://github.com/noir-lang/noir/pull/5140)\r\n([cf5b667](https://github.com/AztecProtocol/aztec-packages/commit/cf5b667c9566019853a5dc2a7f16ed024ab9182b))\r\n* Sync from aztec-packages (https://github.com/noir-lang/noir/pull/5790)\r\n([cf5b667](https://github.com/AztecProtocol/aztec-packages/commit/cf5b667c9566019853a5dc2a7f16ed024ab9182b))\r\n* Warn on unused imports (https://github.com/noir-lang/noir/pull/5847)\r\n([cf5b667](https://github.com/AztecProtocol/aztec-packages/commit/cf5b667c9566019853a5dc2a7f16ed024ab9182b))\r\n\r\n\r\n### Bug Fixes\r\n\r\n* Check unused generics are bound\r\n(https://github.com/noir-lang/noir/pull/5840)\r\n([cf5b667](https://github.com/AztecProtocol/aztec-packages/commit/cf5b667c9566019853a5dc2a7f16ed024ab9182b))\r\n* Enforce parity of sequencer tx validation and node tx validation\r\n([#7951](https://github.com/AztecProtocol/aztec-packages/issues/7951))\r\n([c7eaf92](https://github.com/AztecProtocol/aztec-packages/commit/c7eaf925c26ae9199faaf21ed1b1a220db26cfc7))\r\n* Make simulations validate resulting tx by default\r\n([#8157](https://github.com/AztecProtocol/aztec-packages/issues/8157))\r\n([f5e388d](https://github.com/AztecProtocol/aztec-packages/commit/f5e388dd2d7c78d89da391603c50fda3a2309a76))\r\n* **nargo:** Resolve Brillig assertion payloads\r\n(https://github.com/noir-lang/noir/pull/5872)\r\n([cf5b667](https://github.com/AztecProtocol/aztec-packages/commit/cf5b667c9566019853a5dc2a7f16ed024ab9182b))\r\n* Prevent honk proof from getting stale inputs on syncs\r\n([#8293](https://github.com/AztecProtocol/aztec-packages/issues/8293))\r\n([2598108](https://github.com/AztecProtocol/aztec-packages/commit/2598108e038a9fe791d3fc6e0c0ee064a1511a09))\r\n* Remove fee juice mint public\r\n([#8260](https://github.com/AztecProtocol/aztec-packages/issues/8260))\r\n([2395af3](https://github.com/AztecProtocol/aztec-packages/commit/2395af3014ff2c7c3148e2511350b92059c0325b))\r\n* **sha256:** Add extra checks against message size when constructing\r\nmsg blocks (https://github.com/noir-lang/noir/pull/5861)\r\n([cf5b667](https://github.com/AztecProtocol/aztec-packages/commit/cf5b667c9566019853a5dc2a7f16ed024ab9182b))\r\n* **sha256:** Fix upper bound when building msg block and delay final\r\nblock compression under certain cases\r\n(https://github.com/noir-lang/noir/pull/5838)\r\n([cf5b667](https://github.com/AztecProtocol/aztec-packages/commit/cf5b667c9566019853a5dc2a7f16ed024ab9182b))\r\n* **sha256:** Perform compression per block and utilize ROM instead of\r\nRAM when setting up the message block\r\n(https://github.com/noir-lang/noir/pull/5760)\r\n([cf5b667](https://github.com/AztecProtocol/aztec-packages/commit/cf5b667c9566019853a5dc2a7f16ed024ab9182b))\r\n\r\n\r\n### Miscellaneous\r\n\r\n* Add documentation to `to_be_bytes`, etc.\r\n(https://github.com/noir-lang/noir/pull/5843)\r\n([cf5b667](https://github.com/AztecProtocol/aztec-packages/commit/cf5b667c9566019853a5dc2a7f16ed024ab9182b))\r\n* Add missing cases to arithmetic generics\r\n(https://github.com/noir-lang/noir/pull/5841)\r\n([cf5b667](https://github.com/AztecProtocol/aztec-packages/commit/cf5b667c9566019853a5dc2a7f16ed024ab9182b))\r\n* Add test to reproduce\r\n[#8306](https://github.com/AztecProtocol/aztec-packages/issues/8306)\r\n([41d418c](https://github.com/AztecProtocol/aztec-packages/commit/41d418cf6e04c8598d813d0bc39534954552f477))\r\n* Alert slack on Sepolia test\r\n([#8263](https://github.com/AztecProtocol/aztec-packages/issues/8263))\r\n([6194b94](https://github.com/AztecProtocol/aztec-packages/commit/6194b94f2b2874d032beaf8a04fa2c34e4f633fd))\r\n* **bb:** Make compile on stock mac clang\r\n([#8278](https://github.com/AztecProtocol/aztec-packages/issues/8278))\r\n([7af80ff](https://github.com/AztecProtocol/aztec-packages/commit/7af80ff98313a20ed18dc15fd5e4c22c82828a98))\r\n* **bb:** More graceful pippenger on non-powers-of-2\r\n([#8279](https://github.com/AztecProtocol/aztec-packages/issues/8279))\r\n([104ea85](https://github.com/AztecProtocol/aztec-packages/commit/104ea85667b4be03dd52cd20812907e0b85bcdd8))\r\n* Bump noir-bignum to 0.3.2\r\n([#8276](https://github.com/AztecProtocol/aztec-packages/issues/8276))\r\n([4c6fe1a](https://github.com/AztecProtocol/aztec-packages/commit/4c6fe1ace4831820304ec0962d897affde7df1e0))\r\n* **ci:** Try to debug 'command brotli not found'\r\n([#8305](https://github.com/AztecProtocol/aztec-packages/issues/8305))\r\n([9ee8dd6](https://github.com/AztecProtocol/aztec-packages/commit/9ee8dd60a25ef93aa0efaa43d9092292360c1f09))\r\n* Don't require empty `Prover.toml` for programs with zero arguments but\r\na return value (https://github.com/noir-lang/noir/pull/5845)\r\n([cf5b667](https://github.com/AztecProtocol/aztec-packages/commit/cf5b667c9566019853a5dc2a7f16ed024ab9182b))\r\n* Fix a bunch of generics issues in aztec-nr\r\n([#8295](https://github.com/AztecProtocol/aztec-packages/issues/8295))\r\n([6e84970](https://github.com/AztecProtocol/aztec-packages/commit/6e84970a4fc1a345dac03e2c9881bd5a8f353f50))\r\n* Fix more issues with generics\r\n([#8302](https://github.com/AztecProtocol/aztec-packages/issues/8302))\r\n([4e2ce80](https://github.com/AztecProtocol/aztec-packages/commit/4e2ce801a9f786290c34c93eb92b11fdeda4f88d))\r\n* Fix warnings in `avm-transpiler`\r\n([#8307](https://github.com/AztecProtocol/aztec-packages/issues/8307))\r\n([359fe05](https://github.com/AztecProtocol/aztec-packages/commit/359fe0513aa1e7105e15dc92fcc7fbcab5da45c6))\r\n* Introduce the Visitor pattern\r\n(https://github.com/noir-lang/noir/pull/5868)\r\n([cf5b667](https://github.com/AztecProtocol/aztec-packages/commit/cf5b667c9566019853a5dc2a7f16ed024ab9182b))\r\n* **perf:** Simplify poseidon2 algorithm\r\n(https://github.com/noir-lang/noir/pull/5811)\r\n([cf5b667](https://github.com/AztecProtocol/aztec-packages/commit/cf5b667c9566019853a5dc2a7f16ed024ab9182b))\r\n* **perf:** Update to stdlib keccak for reduced Brillig code size\r\n(https://github.com/noir-lang/noir/pull/5827)\r\n([cf5b667](https://github.com/AztecProtocol/aztec-packages/commit/cf5b667c9566019853a5dc2a7f16ed024ab9182b))\r\n* Redo typo PR by nnsW3 (https://github.com/noir-lang/noir/pull/5834)\r\n([cf5b667](https://github.com/AztecProtocol/aztec-packages/commit/cf5b667c9566019853a5dc2a7f16ed024ab9182b))\r\n* Renaming around Protogalaxy Prover\r\n([#8272](https://github.com/AztecProtocol/aztec-packages/issues/8272))\r\n([be2169d](https://github.com/AztecProtocol/aztec-packages/commit/be2169da8057a06c0cc5c503ec523e62647775e1))\r\n* Replace relative paths to noir-protocol-circuits\r\n([56e3fbf](https://github.com/AztecProtocol/aztec-packages/commit/56e3fbf45b3e0a434678442c132115daf41316c6))\r\n* Replace relative paths to noir-protocol-circuits\r\n([1b245c4](https://github.com/AztecProtocol/aztec-packages/commit/1b245c43e9db54dc63c9536fbfc5a3a037f38a45))\r\n* Replace relative paths to noir-protocol-circuits\r\n([9c3bc43](https://github.com/AztecProtocol/aztec-packages/commit/9c3bc4393f6c80dc94cbbb79ddc91d5970fcc075))\r\n* **revert:** Earthfile accidental change\r\n([#8309](https://github.com/AztecProtocol/aztec-packages/issues/8309))\r\n([2d3e0b6](https://github.com/AztecProtocol/aztec-packages/commit/2d3e0b672c11eddf0e4e50f00a42a662bdd67c0c))\r\n* Underconstrained check in parallel\r\n(https://github.com/noir-lang/noir/pull/5848)\r\n([cf5b667](https://github.com/AztecProtocol/aztec-packages/commit/cf5b667c9566019853a5dc2a7f16ed024ab9182b))\r\n\r\n\r\n### Documentation\r\n\r\n* **bb:** Transcript spec\r\n([#8301](https://github.com/AztecProtocol/aztec-packages/issues/8301))\r\n([18abf37](https://github.com/AztecProtocol/aztec-packages/commit/18abf3785e0826b81417b9f99ffe9776a0213fb1))\r\n</details>\r\n\r\n<details><summary>barretenberg: 0.52.0</summary>\r\n\r\n##\r\n[0.52.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.51.1...barretenberg-v0.52.0)\r\n(2024-09-01)\r\n\r\n\r\n### Features\r\n\r\n* Clarify state in Protogalaxy 3\r\n([#8181](https://github.com/AztecProtocol/aztec-packages/issues/8181))\r\n([4a9bb9d](https://github.com/AztecProtocol/aztec-packages/commit/4a9bb9d47e6b1838875c9ce16fa80a2133b05920))\r\n\r\n\r\n### Bug Fixes\r\n\r\n* Prevent honk proof from getting stale inputs on syncs\r\n([#8293](https://github.com/AztecProtocol/aztec-packages/issues/8293))\r\n([2598108](https://github.com/AztecProtocol/aztec-packages/commit/2598108e038a9fe791d3fc6e0c0ee064a1511a09))\r\n\r\n\r\n### Miscellaneous\r\n\r\n* **bb:** Make compile on stock mac clang\r\n([#8278](https://github.com/AztecProtocol/aztec-packages/issues/8278))\r\n([7af80ff](https://github.com/AztecProtocol/aztec-packages/commit/7af80ff98313a20ed18dc15fd5e4c22c82828a98))\r\n* **bb:** More graceful pippenger on non-powers-of-2\r\n([#8279](https://github.com/AztecProtocol/aztec-packages/issues/8279))\r\n([104ea85](https://github.com/AztecProtocol/aztec-packages/commit/104ea85667b4be03dd52cd20812907e0b85bcdd8))\r\n* Renaming around Protogalaxy Prover\r\n([#8272](https://github.com/AztecProtocol/aztec-packages/issues/8272))\r\n([be2169d](https://github.com/AztecProtocol/aztec-packages/commit/be2169da8057a06c0cc5c503ec523e62647775e1))\r\n* **revert:** Earthfile accidental change\r\n([#8309](https://github.com/AztecProtocol/aztec-packages/issues/8309))\r\n([2d3e0b6](https://github.com/AztecProtocol/aztec-packages/commit/2d3e0b672c11eddf0e4e50f00a42a662bdd67c0c))\r\n\r\n\r\n### Documentation\r\n\r\n* **bb:** Transcript spec\r\n([#8301](https://github.com/AztecProtocol/aztec-packages/issues/8301))\r\n([18abf37](https://github.com/AztecProtocol/aztec-packages/commit/18abf3785e0826b81417b9f99ffe9776a0213fb1))\r\n</details>\r\n\r\n---\r\nThis PR was generated with [Release\r\nPlease](https://github.com/googleapis/release-please). See\r\n[documentation](https://github.com/googleapis/release-please#release-please).",
          "timestamp": "2024-09-02T09:52:08+01:00",
          "tree_id": "8d640dc67660039c27f5804c67880dc11118d0e0",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/4dd51eb0a315687fc701b1da0458b71a99ab68a7"
        },
        "date": 1725268319717,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 13481.39298800001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10328.8852 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5142.884808000005,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4739.464733 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 39527.808186999995,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 39527808000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14784.118479000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14784119000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3698179084,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3698179084 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 146519948,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 146519948 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3021519190,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3021519190 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 122210618,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 122210618 ns\nthreads: 1"
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
          "id": "a7f314448215950f6f1a7d4f282359df040be502",
          "message": "chore: uncomment asserts in oink rec verifier (#8316)\n\nCloses https://github.com/AztecProtocol/barretenberg/issues/1032.\r\n\r\nThese assert statements were commented out at some point, but they\r\nshould not need to be.",
          "timestamp": "2024-09-02T13:44:34Z",
          "tree_id": "242fbecc69e5d638e797841999832664e79d9af6",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a7f314448215950f6f1a7d4f282359df040be502"
        },
        "date": 1725285596386,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 13637.722807000016,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10323.456153000001 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5244.1195130000015,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4761.04936 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 39597.503176000006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 39597504000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14734.690129,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14734691000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3748144047,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3748144047 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 145527082,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 145527082 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3032446614,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3032446614 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 120729384,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 120729384 ns\nthreads: 1"
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
          "id": "32d67bd72244bfc3ea28aef7358c467a5b238b6b",
          "message": "chore(avm): move proving key to avm files (#8318)",
          "timestamp": "2024-09-02T14:49:28+01:00",
          "tree_id": "131cbb0756a1dc1afc736bc4c153d5c44f4809f4",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/32d67bd72244bfc3ea28aef7358c467a5b238b6b"
        },
        "date": 1725286056183,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 13525.456429000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10380.835486000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5848.483789,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4590.058074999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 39584.138573,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 39584139000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14723.141006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14723140000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3709444889,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3709444889 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 146405701,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 146405701 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3037889714,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3037889714 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 120319926,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 120319926 ns\nthreads: 1"
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
          "id": "e8a097cf338bae2445006b3f20a2f54fc8f5e7f5",
          "message": "chore: improve ec addition (#8291)\n\nReduces the gate count for addition in cycle group\r\n\r\nI get 37 gates instead of 41.\r\nI improved the equality checks by one gate by removing the boolean gate.\r\nI rewrote a division as one gate instead of 3 thanks to the quotient\r\nbeing not null.",
          "timestamp": "2024-09-03T12:11:02+02:00",
          "tree_id": "81ff96563e29ae11700d12bf523cb316a2a0e1ee",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e8a097cf338bae2445006b3f20a2f54fc8f5e7f5"
        },
        "date": 1725359169594,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 13400.620809000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10364.154539999998 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5122.895393999983,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4698.647449 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 39533.354016000005,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 39533353000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14672.914212000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14672914000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3710373764,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3710373764 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 146577441,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 146577441 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3056161209,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3056161209 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 120002177,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 120002177 ns\nthreads: 1"
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
          "id": "4df115c24ef856bd76d3724a703f3738f5788efd",
          "message": "Revert \"chore: uncomment asserts in oink rec verifier\" (#8355)\n\nSeeing breakage after this PR",
          "timestamp": "2024-09-03T11:33:47-04:00",
          "tree_id": "106232f5cb7795bf0121c6771b80f1437e72860b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/4df115c24ef856bd76d3724a703f3738f5788efd"
        },
        "date": 1725378766897,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 13392.34289800001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10172.797711 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5131.289198000005,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4695.586316 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 39187.812954,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 39187812000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14682.552901000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14682554000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3707901912,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3707901912 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 144966417,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 144966417 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3025648207,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3025648207 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 120316436,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 120316436 ns\nthreads: 1"
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
          "id": "e2150a7e5fc84932b65af07025514fc3c57f1cbc",
          "message": "chore(avm): remove some unused deps (#8366)",
          "timestamp": "2024-09-04T11:49:51+01:00",
          "tree_id": "6de5fa133ea2ef7820199daf1ecf5a51cb61a070",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e2150a7e5fc84932b65af07025514fc3c57f1cbc"
        },
        "date": 1725447383580,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 13490.814172,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10280.600525999998 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5175.230903,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4739.960201000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 39541.081373,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 39541081000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14843.483035,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14843484000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3733695960,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3733695960 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 145204727,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 145204727 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3063142128,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3063142128 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 121085924,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 121085924 ns\nthreads: 1"
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
          "id": "4dbad01c866b28f7d440d7b4e17631ed6a0469f3",
          "message": "chore(bb): reinstate \"chore: uncomment asserts in oink rec verifier\"\" (#8356)\n\nFixes the base rollup test by making the input proof have the same\r\ncircuit size, number of public inputs, and pub inputs offset.\r\n\r\n---------\r\n\r\nCo-authored-by: lucasxia01 <lucasxia01@gmail.com>",
          "timestamp": "2024-09-04T14:51:08+01:00",
          "tree_id": "0a28816720f7bed3f350cc6b3d3686d474f6bb05",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/4dbad01c866b28f7d440d7b4e17631ed6a0469f3"
        },
        "date": 1725459112350,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 13605.059952999994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10431.765838999998 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5246.008173999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4840.6236930000005 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 39743.700535,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 39743700000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14796.451688000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14796451000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3760925560,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3760925560 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 150709575,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 150709575 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3072689548,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3072689548 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 121576911,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 121576911 ns\nthreads: 1"
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
          "id": "f1746999ea12cc8117efd5a0c3b2ec5d80196343",
          "message": "chore(bb): use std::span for srs (#8371)\n\nA bit of safety - will help me catch a bug in polynomial memory PR\r\n\r\nFix a breakage in tests due to bad global grumpkin CRS assumptions",
          "timestamp": "2024-09-04T23:52:03Z",
          "tree_id": "afcd8e1ce47e0fb17f89193831f134c4acc96786",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f1746999ea12cc8117efd5a0c3b2ec5d80196343"
        },
        "date": 1725494760918,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 13411.832933,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10146.560624000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5094.396270000005,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4631.1410049999995 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 40655.268421,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 40655269000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14737.635159,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14737634000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3687480341,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3687480341 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 145227153,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 145227153 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3041576199,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3041576199 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 121873866,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 121873866 ns\nthreads: 1"
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
          "id": "7f029007365b57c06699914f97b93d0891d2a6f1",
          "message": "feat: ultra keccak honk verifier (#8261)\n\nEnable the new Keccak Ultra Honk flavor for the BlockRootRollup circuit,\r\ndeploy a Solidity verifier for it and tell the rollup to use it\r\n\r\n---------\r\n\r\nCo-authored-by: Santiago Palladino <santiago@aztecprotocol.com>",
          "timestamp": "2024-09-05T09:40:57+01:00",
          "tree_id": "47deced190fdbed64f7eeb2f770e8f61db99812d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7f029007365b57c06699914f97b93d0891d2a6f1"
        },
        "date": 1725526558586,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 13364.734365000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10081.946252 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5101.513808999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4625.598440999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 40179.549729,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 40179550000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14675.852439999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14675853000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3686540520,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3686540520 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 145163034,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 145163034 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3021970787,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3021970787 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 119688662,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 119688662 ns\nthreads: 1"
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
          "id": "2be14157abe3b277c58780ecc03bb1eff8dec20e",
          "message": "feat: verify public validation requests (#8150)\n\nVerify note hash read requests and l1tol2msg read requests in public\r\nkernel tail.\r\n\r\n---------\r\n\r\nCo-authored-by: Ilyas Ridhuan <ilyas@aztecprotocol.com>",
          "timestamp": "2024-09-05T14:13:36+01:00",
          "tree_id": "5c0148e3ea4c2f01a29352f652d0c57e6e8676c7",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/2be14157abe3b277c58780ecc03bb1eff8dec20e"
        },
        "date": 1725542953255,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 13333.934631000006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10200.208337000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5098.504270000007,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4627.799031000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 40288.236933,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 40288237000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14699.454278000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14699453000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3690950535,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3690950535 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 148616842,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 148616842 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3018613349,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3018613349 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 122119688,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 122119688 ns\nthreads: 1"
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
          "id": "d0ea6ebbe8b4bb918acc2aa5a4c09863a93b7c08",
          "message": "fix: Broken build (#8395)\n\nYep it's `verification_key->verification_key` until the refactoring is\ndone",
          "timestamp": "2024-09-05T10:23:07-04:00",
          "tree_id": "63a67f05527d727bf927eb08d22add83fd97d415",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d0ea6ebbe8b4bb918acc2aa5a4c09863a93b7c08"
        },
        "date": 1725547187284,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 13389.642334999991,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10232.849633999998 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5105.932075000012,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4715.634833 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 39357.568230000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 39357568000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14672.844135999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14672845000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3681685710,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3681685710 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 147318352,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 147318352 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3003244119,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3003244119 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 121749292,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 121749292 ns\nthreads: 1"
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
          "id": "3228e7526aa30b514375c62264cbde578754cd79",
          "message": "fix: Revert \"feat: ultra keccak honk verifier\" (#8391)\n\nReverts AztecProtocol/aztec-packages#8261\r\n\r\nCo-authored-by: maramihali <mara@aztecprotocol.com>",
          "timestamp": "2024-09-05T10:53:39-04:00",
          "tree_id": "6437b4df33ea5e33fb935794db9085600c8d943f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/3228e7526aa30b514375c62264cbde578754cd79"
        },
        "date": 1725549189848,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 13346.725968000015,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10242.722985999999 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5101.9188650000015,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4632.296591000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 39300.879639,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 39300879000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14675.694823,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14675695000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3676436660,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3676436660 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 148669609,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 148669609 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3004392655,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3004392655 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 120607790,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 120607790 ns\nthreads: 1"
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
          "id": "0d8e835dd6cd6cd545edda20f652ab6f10c530da",
          "message": "feat: replace arithmetic equalities with assert equal (#8386)\n\nReplace arithmetic equalities with assert_equal if the 2 equal witnesses\r\nhave been both added previously into an arithmetic gate.\r\n\r\n---------\r\n\r\nCo-authored-by: Tom French <15848336+TomAFrench@users.noreply.github.com>",
          "timestamp": "2024-09-05T17:04:46+01:00",
          "tree_id": "f94b94e6cc7e1cc6dcabd97b01f0c5b7f0bcfbb7",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0d8e835dd6cd6cd545edda20f652ab6f10c530da"
        },
        "date": 1725553216701,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 13408.058261000007,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10202.095563000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5132.091070999991,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4702.455685 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 39185.085528999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 39185086000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14639.280307,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14639281000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3695347337,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3695347337 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 146654178,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 146654178 ns\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3009207599,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3009207599 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 120793349,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 120793349 ns\nthreads: 1"
          }
        ]
      }
    ]
  }
}