window.BENCHMARK_DATA = {
  "lastUpdate": 1729683882880,
  "repoUrl": "https://github.com/AztecProtocol/aztec-packages",
  "entries": {
    "C++ Benchmark": [
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
      }
    ]
  }
}