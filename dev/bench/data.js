window.BENCHMARK_DATA = {
  "lastUpdate": 1733949049598,
  "repoUrl": "https://github.com/AztecProtocol/aztec-packages",
  "entries": {
    "C++ Benchmark": [
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
          "id": "1bfc15e08873a1f0f3743e259f418b70426b3f25",
          "message": "chore: pull out some sync changes (#10245)\n\nThis pulls out some of the lower-risk changes from the sync.",
          "timestamp": "2024-11-27T15:15:39Z",
          "tree_id": "3db46d454d22850f12c69f1921beac70c0564618",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1bfc15e08873a1f0f3743e259f418b70426b3f25"
        },
        "date": 1732721967526,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28006.621101000008,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 26281.337176999998 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5011.699031999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4641.308725 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 84203.719131,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 84203720000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15147.367450000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15147369000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3058870092,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3058870092 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 139729064,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 139729064 ns\nthreads: 1"
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
          "id": "089c34cc3e9fb5cb493096246525c2205e646204",
          "message": "refactor: CIVC VK (#10223)\n\nAs a step toward a consistent API, we add to `ClientIVC`\r\n```\r\n    struct VerificationKey {\r\n        std::shared_ptr<MegaVerificationKey> mega;\r\n        std::shared_ptr<ECCVMVerificationKey> eccvm;\r\n        std::shared_ptr<TranslatorVerificationKey> translator;\r\n\r\n        MSGPACK_FIELDS(mega, eccvm, translator);\r\n    };\r\n```\r\n\r\nClientIVC API before;\r\n```\r\n    static bool verify(const Proof& proof,\r\n                       const std::shared_ptr<MegaVerificationKey>& mega_vk,\r\n                       const std::shared_ptr<ClientIVC::ECCVMVerificationKey>& eccvm_vk,\r\n                       const std::shared_ptr<ClientIVC::TranslatorVerificationKey>& translator_vk);\r\n```\r\n(three vk paths need to be provided to CLI)\r\n\r\nClientIVC API after: \r\n```\r\n    static bool verify(const Proof& proof, const VerificationKey& vk);`\r\n```\r\n(and one vk path needs to be provided to CLI)",
          "timestamp": "2024-11-27T10:46:11-05:00",
          "tree_id": "15bb5742f4af493ce0e60e3e6fe1989266ad1597",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/089c34cc3e9fb5cb493096246525c2205e646204"
        },
        "date": 1732724330465,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28005.986659000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 26315.656614 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5032.924441999995,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4713.488985 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 83547.696289,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 83547697000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15144.496462,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15144496000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3052192836,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3052192836 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 140263845,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 140263845 ns\nthreads: 1"
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
          "id": "b5783d3945959056d24aa3d988e9ca9efd3ec224",
          "message": "feat: Full IPA Recursive Verifier (#10189)\n\nAdds back the full IPA recursive verifier implementation in preparation\r\nof adding it to the root rollup circuit. Creates new tests for the full\r\nverification and also new tests for accumulation with different sizes.",
          "timestamp": "2024-11-27T17:22:55Z",
          "tree_id": "ca246934d508be7b0a599d5eee83596e3c6d305e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/b5783d3945959056d24aa3d988e9ca9efd3ec224"
        },
        "date": 1732730447339,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 27930.91603800002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 26331.796415 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5056.760932999992,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4728.927258 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 83513.182727,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 83513183000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15173.696832000003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15173697000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3060561275,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3060561275 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 140253105,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 140253105 ns\nthreads: 1"
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
          "id": "569edf1d5e3200ecd42eb2777eb2f57120fcf0e7",
          "message": "chore(master): Release 0.65.1",
          "timestamp": "2024-11-27T19:04:37Z",
          "url": "https://github.com/AztecProtocol/aztec-packages/pull/10219/commits/569edf1d5e3200ecd42eb2777eb2f57120fcf0e7"
        },
        "date": 1732735215788,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 27910.29672600001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 26112.701827 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5023.950282000015,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4684.277552 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 83833.78808099999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 83833788000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15117.710857,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15117711000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3051434015,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3051434015 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 139566333,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 139566333 ns\nthreads: 1"
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
          "id": "62fc9175019cb5f3fabca1a5f5ff9e04d708695e",
          "message": "chore(master): Release 0.65.1 (#10219)\n\n:robot: I have created a release *beep* *boop*\r\n---\r\n\r\n\r\n<details><summary>aztec-package: 0.65.1</summary>\r\n\r\n##\r\n[0.65.1](https://github.com/AztecProtocol/aztec-packages/compare/aztec-package-v0.65.0...aztec-package-v0.65.1)\r\n(2024-11-27)\r\n\r\n\r\n### Miscellaneous\r\n\r\n* Delete old serialization methods\r\n([#9951](https://github.com/AztecProtocol/aztec-packages/issues/9951))\r\n([10d3f6f](https://github.com/AztecProtocol/aztec-packages/commit/10d3f6fe851dc73f5f12edec26b028fe526f0be6))\r\n</details>\r\n\r\n<details><summary>barretenberg.js: 0.65.1</summary>\r\n\r\n##\r\n[0.65.1](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg.js-v0.65.0...barretenberg.js-v0.65.1)\r\n(2024-11-27)\r\n\r\n\r\n### Features\r\n\r\n* Speed up transaction execution\r\n([#10172](https://github.com/AztecProtocol/aztec-packages/issues/10172))\r\n([da265b6](https://github.com/AztecProtocol/aztec-packages/commit/da265b6b7d61a0d991fa23bd044f711513a0e86c))\r\n\r\n\r\n### Bug Fixes\r\n\r\n* Add pako as a dependency in bb.js\r\n([#10186](https://github.com/AztecProtocol/aztec-packages/issues/10186))\r\n([b773c14](https://github.com/AztecProtocol/aztec-packages/commit/b773c14a8fe8bf425dc755b3a156e500e9924c1e))\r\n</details>\r\n\r\n<details><summary>aztec-packages: 0.65.1</summary>\r\n\r\n##\r\n[0.65.1](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.65.0...aztec-packages-v0.65.1)\r\n(2024-11-27)\r\n\r\n\r\n### Features\r\n\r\n* Add total mana used to header\r\n([#9868](https://github.com/AztecProtocol/aztec-packages/issues/9868))\r\n([2478d19](https://github.com/AztecProtocol/aztec-packages/commit/2478d1909db2d79cc0cdd3063dc2ac4e1eaedce3))\r\n* Assert metrics in network tests\r\n([#10215](https://github.com/AztecProtocol/aztec-packages/issues/10215))\r\n([9380c0f](https://github.com/AztecProtocol/aztec-packages/commit/9380c0f68bc01722b60539034a9f064606e1b119))\r\n* Avm inserts nullifiers from private\r\n([#10129](https://github.com/AztecProtocol/aztec-packages/issues/10129))\r\n([3fc0c7c](https://github.com/AztecProtocol/aztec-packages/commit/3fc0c7c7d4b6b4052d185dbb795a7fe3d724f09f))\r\n* Burn congestion fee\r\n([#10231](https://github.com/AztecProtocol/aztec-packages/issues/10231))\r\n([20a33f2](https://github.com/AztecProtocol/aztec-packages/commit/20a33f2d097d7fd3bd67eabf2d2254b43d5723d0))\r\n* Configure world state block history\r\n([#10216](https://github.com/AztecProtocol/aztec-packages/issues/10216))\r\n([01eb392](https://github.com/AztecProtocol/aztec-packages/commit/01eb392f15995f344e40aa8f8e41a28f6f5b825d))\r\n* Integrate fee into rollup\r\n([#10176](https://github.com/AztecProtocol/aztec-packages/issues/10176))\r\n([12744d6](https://github.com/AztecProtocol/aztec-packages/commit/12744d6bd9ca6f4c4c1ef43ddd919e81cffb7a17))\r\n* Speed up transaction execution\r\n([#10172](https://github.com/AztecProtocol/aztec-packages/issues/10172))\r\n([da265b6](https://github.com/AztecProtocol/aztec-packages/commit/da265b6b7d61a0d991fa23bd044f711513a0e86c))\r\n* Using current gas prices in cli-wallet\r\n([#10105](https://github.com/AztecProtocol/aztec-packages/issues/10105))\r\n([15ffeea](https://github.com/AztecProtocol/aztec-packages/commit/15ffeea8ef47b619f9922793be7e3380964297a3))\r\n\r\n\r\n### Bug Fixes\r\n\r\n* Add pako as a dependency in bb.js\r\n([#10186](https://github.com/AztecProtocol/aztec-packages/issues/10186))\r\n([b773c14](https://github.com/AztecProtocol/aztec-packages/commit/b773c14a8fe8bf425dc755b3a156e500e9924c1e))\r\n* **avm:** Execution test ordering\r\n([#10226](https://github.com/AztecProtocol/aztec-packages/issues/10226))\r\n([49b4a6c](https://github.com/AztecProtocol/aztec-packages/commit/49b4a6c07f39711ad2a0477e1fad11e11b8ee23c))\r\n* Deploy preview master\r\n([#10227](https://github.com/AztecProtocol/aztec-packages/issues/10227))\r\n([321a175](https://github.com/AztecProtocol/aztec-packages/commit/321a17531eb5d440f2726ff32bc6e157a732a8ed))\r\n* Use current base fee for public fee payment\r\n([#10230](https://github.com/AztecProtocol/aztec-packages/issues/10230))\r\n([f081d80](https://github.com/AztecProtocol/aztec-packages/commit/f081d8013ce37a2109750424d1ed615411d9056a))\r\n\r\n\r\n### Miscellaneous\r\n\r\n* Add traces and histograms to avm simulator\r\n([#10233](https://github.com/AztecProtocol/aztec-packages/issues/10233))\r\n([e83726d](https://github.com/AztecProtocol/aztec-packages/commit/e83726dddbc7ea98c86b99a7439e39f076a63b25)),\r\ncloses\r\n[#10146](https://github.com/AztecProtocol/aztec-packages/issues/10146)\r\n* Avm-proving and avm-integration tests do not require simulator to\r\nexport function with jest mocks\r\n([#10228](https://github.com/AztecProtocol/aztec-packages/issues/10228))\r\n([f28fcdb](https://github.com/AztecProtocol/aztec-packages/commit/f28fcdb1e41aa353f0fdc2233ea66ae51ef745a4))\r\n* **avm:** Handle parsing error\r\n([#10203](https://github.com/AztecProtocol/aztec-packages/issues/10203))\r\n([3c623fc](https://github.com/AztecProtocol/aztec-packages/commit/3c623fc2d857d6792b557dc7d1ccb929274046bb)),\r\ncloses\r\n[#9770](https://github.com/AztecProtocol/aztec-packages/issues/9770)\r\n* **avm:** Zero initialization in avm public inputs and execution test\r\nfixes\r\n([#10238](https://github.com/AztecProtocol/aztec-packages/issues/10238))\r\n([0c7c4c9](https://github.com/AztecProtocol/aztec-packages/commit/0c7c4c9bb0c01067abe57ccd06962d71c7279aa0))\r\n* Bump timeout for after-hook for data store test again\r\n([#10240](https://github.com/AztecProtocol/aztec-packages/issues/10240))\r\n([52047f0](https://github.com/AztecProtocol/aztec-packages/commit/52047f05495ef95a778e8669fc4e115cacb590a0))\r\n* CIVC VK\r\n([#10223](https://github.com/AztecProtocol/aztec-packages/issues/10223))\r\n([089c34c](https://github.com/AztecProtocol/aztec-packages/commit/089c34cc3e9fb5cb493096246525c2205e646204))\r\n* Declare global types\r\n([#10206](https://github.com/AztecProtocol/aztec-packages/issues/10206))\r\n([7b2e343](https://github.com/AztecProtocol/aztec-packages/commit/7b2e343a61eb9c74f365758530deca87b40891d0))\r\n* Delete old serialization methods\r\n([#9951](https://github.com/AztecProtocol/aztec-packages/issues/9951))\r\n([10d3f6f](https://github.com/AztecProtocol/aztec-packages/commit/10d3f6fe851dc73f5f12edec26b028fe526f0be6))\r\n* Fix migration notes\r\n([#10252](https://github.com/AztecProtocol/aztec-packages/issues/10252))\r\n([05bdcd5](https://github.com/AztecProtocol/aztec-packages/commit/05bdcd51d45f35a3ed683c1a90bb8e9370533fb0))\r\n* Pull out some sync changes\r\n([#10245](https://github.com/AztecProtocol/aztec-packages/issues/10245))\r\n([1bfc15e](https://github.com/AztecProtocol/aztec-packages/commit/1bfc15e08873a1f0f3743e259f418b70426b3f25))\r\n* Remove docs from sync\r\n([#10241](https://github.com/AztecProtocol/aztec-packages/issues/10241))\r\n([eeea0aa](https://github.com/AztecProtocol/aztec-packages/commit/eeea0aade045bfba73ee1e6458d5815163f55dd6))\r\n* Replace relative paths to noir-protocol-circuits\r\n([e7690ca](https://github.com/AztecProtocol/aztec-packages/commit/e7690ca2e441ca71f8a02d39ed5fb2c7e9ba533d))\r\n</details>\r\n\r\n<details><summary>barretenberg: 0.65.1</summary>\r\n\r\n##\r\n[0.65.1](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.65.0...barretenberg-v0.65.1)\r\n(2024-11-27)\r\n\r\n\r\n### Features\r\n\r\n* Add total mana used to header\r\n([#9868](https://github.com/AztecProtocol/aztec-packages/issues/9868))\r\n([2478d19](https://github.com/AztecProtocol/aztec-packages/commit/2478d1909db2d79cc0cdd3063dc2ac4e1eaedce3))\r\n* Configure world state block history\r\n([#10216](https://github.com/AztecProtocol/aztec-packages/issues/10216))\r\n([01eb392](https://github.com/AztecProtocol/aztec-packages/commit/01eb392f15995f344e40aa8f8e41a28f6f5b825d))\r\n* Speed up transaction execution\r\n([#10172](https://github.com/AztecProtocol/aztec-packages/issues/10172))\r\n([da265b6](https://github.com/AztecProtocol/aztec-packages/commit/da265b6b7d61a0d991fa23bd044f711513a0e86c))\r\n\r\n\r\n### Bug Fixes\r\n\r\n* **avm:** Execution test ordering\r\n([#10226](https://github.com/AztecProtocol/aztec-packages/issues/10226))\r\n([49b4a6c](https://github.com/AztecProtocol/aztec-packages/commit/49b4a6c07f39711ad2a0477e1fad11e11b8ee23c))\r\n\r\n\r\n### Miscellaneous\r\n\r\n* **avm:** Handle parsing error\r\n([#10203](https://github.com/AztecProtocol/aztec-packages/issues/10203))\r\n([3c623fc](https://github.com/AztecProtocol/aztec-packages/commit/3c623fc2d857d6792b557dc7d1ccb929274046bb)),\r\ncloses\r\n[#9770](https://github.com/AztecProtocol/aztec-packages/issues/9770)\r\n* **avm:** Zero initialization in avm public inputs and execution test\r\nfixes\r\n([#10238](https://github.com/AztecProtocol/aztec-packages/issues/10238))\r\n([0c7c4c9](https://github.com/AztecProtocol/aztec-packages/commit/0c7c4c9bb0c01067abe57ccd06962d71c7279aa0))\r\n* CIVC VK\r\n([#10223](https://github.com/AztecProtocol/aztec-packages/issues/10223))\r\n([089c34c](https://github.com/AztecProtocol/aztec-packages/commit/089c34cc3e9fb5cb493096246525c2205e646204))\r\n* Pull out some sync changes\r\n([#10245](https://github.com/AztecProtocol/aztec-packages/issues/10245))\r\n([1bfc15e](https://github.com/AztecProtocol/aztec-packages/commit/1bfc15e08873a1f0f3743e259f418b70426b3f25))\r\n</details>\r\n\r\n---\r\nThis PR was generated with [Release\r\nPlease](https://github.com/googleapis/release-please). See\r\n[documentation](https://github.com/googleapis/release-please#release-please).",
          "timestamp": "2024-11-27T19:04:31Z",
          "tree_id": "d0e12206481bc20e591a5652787494c76c862622",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/62fc9175019cb5f3fabca1a5f5ff9e04d708695e"
        },
        "date": 1732735724917,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 27854.885658,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 26376.737892 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5002.223991000008,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4700.498326000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 83821.16596299999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 83821166000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15131.392319999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15131392000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3072156120,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3072156120 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 140666464,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 140666464 ns\nthreads: 1"
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
          "id": "b7b282cd0fb306abbe3951a55a1a4f4d42ed7f8e",
          "message": "feat: swap polys to facilitate dynamic trace overflow (#9976)\n\nUpdate PG/ClientIvc so that during accumulation we can handle a circuit\r\nthat overflows the nominal structured trace (and potentially increases\r\nthe dyadic size of the accumulator) without knowing about the size of\r\nthe overflow in advance. (A previous PR makes it possible to overflow\r\narbitrarily as long as ClientIvc is initialized with the proper overflow\r\ncapacity). Ensure the ExecutionTraceTracker is updated correctly when\r\nencountering a circuit that overflows and also ensure that the tracker\r\nis used appropriately in Protogalaxy.\r\n\r\n---------\r\n\r\nCo-authored-by: maramihali <mara@aztecprotocol.com>",
          "timestamp": "2024-11-27T15:22:09-05:00",
          "tree_id": "eca71991eb4839e20ba88bebde59fac32583d695",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/b7b282cd0fb306abbe3951a55a1a4f4d42ed7f8e"
        },
        "date": 1732741468619,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28225.632292000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 26587.677380999998 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5020.246728000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4673.310028999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 84009.54356300001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 84009544000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15132.574935999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15132576000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3076078674,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3076078674 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 139484576,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 139484576 ns\nthreads: 1"
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
          "id": "3392629818e6d51c01ca4c75c1ad916bb4b4fdb1",
          "message": "chore: pull value merger code from sync (#10080)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\r\nline.",
          "timestamp": "2024-11-28T00:50:04+01:00",
          "tree_id": "63bc4ce36fecc25022468f8af611f5da4fa1bdef",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/3392629818e6d51c01ca4c75c1ad916bb4b4fdb1"
        },
        "date": 1732752846095,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28363.431515000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 26635.272279999997 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5137.387709999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4756.1121969999995 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 84213.797103,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 84213798000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15233.782082000003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15233783000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3104842302,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3104842302 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 140566137,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 140566137 ns\nthreads: 1"
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
          "id": "bfd9fa68be4147acb3e3feeaf83ed3c9247761be",
          "message": "feat: Sequential insertion in indexed trees (#10111)\n\n- Adds sequential (no subtree) insertion in indexed trees\r\n- If witnesses are requested, the response includes 2*N witnesses, N for\r\nthe low leaves and N for the insertions\r\n   - If no witness is requested, it directly does sparse_batch_update\r\n   - Updating an item multiple times in the same call is allowed\r\n- Uses sequential insertion with witnesses to avoid doing N batch\r\nupdates of 1 item for the base rollup\r\n- Uses sequential insertion without witnesses for syncing the public\r\ndata tree, to avoid doing 1 batch insertion per TX in the block",
          "timestamp": "2024-11-28T14:02:54Z",
          "tree_id": "defc9c4f062e912d3f8eb7ab58ae7482928cce54",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/bfd9fa68be4147acb3e3feeaf83ed3c9247761be"
        },
        "date": 1732804028018,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28153.127274000013,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 26537.149002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5038.755413000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4631.034165 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 84192.29212700001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 84192293000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15156.366907,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15156368000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3080859077,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3080859077 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 139642057,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 139642057 ns\nthreads: 1"
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
          "id": "c22be8b23e6d16cf4a60509494b979c3edfdba9b",
          "message": "fix: Don't store indices of zero leaves. (#10270)\n\nThis PR ensures we don't store indices of zero leaves as this could be\r\nmisleading. Requesting the index of a zero leaf is deemed invalid.\r\n\r\nIt also adds tests that ensure we can unwind blocks of zero leaves",
          "timestamp": "2024-11-28T14:22:54Z",
          "tree_id": "e2e218a7dde2adc2d1a8f08c848f0235e80a1b93",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c22be8b23e6d16cf4a60509494b979c3edfdba9b"
        },
        "date": 1732805781859,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28077.81052499999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 26478.350335 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4994.416454999992,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4641.7432229999995 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 83494.305385,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 83494306000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15162.920884,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15162922000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3065184537,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3065184537 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 139364858,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 139364858 ns\nthreads: 1"
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
          "id": "34372f13c6083befb1dfd07a2d99ea07b166b398",
          "message": "chore(master): Release 0.65.2",
          "timestamp": "2024-11-28T15:22:57Z",
          "url": "https://github.com/AztecProtocol/aztec-packages/pull/10258/commits/34372f13c6083befb1dfd07a2d99ea07b166b398"
        },
        "date": 1732808602046,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28226.71693699999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 26671.284782000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5122.234616,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4757.604875999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 84324.61404100001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 84324615000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15235.193823,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15235195000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3096213748,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3096213748 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 140131794,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 140131794 ns\nthreads: 1"
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
          "id": "10754db0e6626047d4fc59cd0d7bbb320606152a",
          "message": "chore(master): Release 0.65.2 (#10258)\n\n:robot: I have created a release *beep* *boop*\r\n---\r\n\r\n\r\n<details><summary>aztec-package: 0.65.2</summary>\r\n\r\n##\r\n[0.65.2](https://github.com/AztecProtocol/aztec-packages/compare/aztec-package-v0.65.1...aztec-package-v0.65.2)\r\n(2024-11-28)\r\n\r\n\r\n### Features\r\n\r\n* New proving broker\r\n([#10174](https://github.com/AztecProtocol/aztec-packages/issues/10174))\r\n([6fd5fc1](https://github.com/AztecProtocol/aztec-packages/commit/6fd5fc18bd973b539fb9edfb372181fbe4617f75))\r\n</details>\r\n\r\n<details><summary>barretenberg.js: 0.65.2</summary>\r\n\r\n##\r\n[0.65.2](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg.js-v0.65.1...barretenberg.js-v0.65.2)\r\n(2024-11-28)\r\n\r\n\r\n### Miscellaneous\r\n\r\n* **barretenberg.js:** Synchronize aztec-packages versions\r\n</details>\r\n\r\n<details><summary>aztec-packages: 0.65.2</summary>\r\n\r\n##\r\n[0.65.2](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.65.1...aztec-packages-v0.65.2)\r\n(2024-11-28)\r\n\r\n\r\n### Features\r\n\r\n* Fee foresight support\r\n([#10262](https://github.com/AztecProtocol/aztec-packages/issues/10262))\r\n([9e19244](https://github.com/AztecProtocol/aztec-packages/commit/9e19244c01440ce7900ba91c0557567e57f017a0))\r\n* New proving broker\r\n([#10174](https://github.com/AztecProtocol/aztec-packages/issues/10174))\r\n([6fd5fc1](https://github.com/AztecProtocol/aztec-packages/commit/6fd5fc18bd973b539fb9edfb372181fbe4617f75))\r\n* Sequential insertion in indexed trees\r\n([#10111](https://github.com/AztecProtocol/aztec-packages/issues/10111))\r\n([bfd9fa6](https://github.com/AztecProtocol/aztec-packages/commit/bfd9fa68be4147acb3e3feeaf83ed3c9247761be))\r\n* Swap polys to facilitate dynamic trace overflow\r\n([#9976](https://github.com/AztecProtocol/aztec-packages/issues/9976))\r\n([b7b282c](https://github.com/AztecProtocol/aztec-packages/commit/b7b282cd0fb306abbe3951a55a1a4f4d42ed7f8e))\r\n\r\n\r\n### Bug Fixes\r\n\r\n* Don't store indices of zero leaves.\r\n([#10270](https://github.com/AztecProtocol/aztec-packages/issues/10270))\r\n([c22be8b](https://github.com/AztecProtocol/aztec-packages/commit/c22be8b23e6d16cf4a60509494b979c3edfdba9b))\r\n* Expect proper duplicate nullifier error patterns in e2e tests\r\n([#10256](https://github.com/AztecProtocol/aztec-packages/issues/10256))\r\n([4ee8344](https://github.com/AztecProtocol/aztec-packages/commit/4ee83448a24be1944ca8c71d42ae8aa15049af10))\r\n\r\n\r\n### Miscellaneous\r\n\r\n* Check artifact consistency\r\n([#10271](https://github.com/AztecProtocol/aztec-packages/issues/10271))\r\n([6a49405](https://github.com/AztecProtocol/aztec-packages/commit/6a494050f85510c18870117f376280d8e10ed486))\r\n* Dont import things that themselves import jest in imported functions\r\n([#10260](https://github.com/AztecProtocol/aztec-packages/issues/10260))\r\n([9440c1c](https://github.com/AztecProtocol/aztec-packages/commit/9440c1cf3834eea380014d55eef6e81cff8ffee8))\r\n* Fix bad merge in integration l1 publisher\r\n([#10272](https://github.com/AztecProtocol/aztec-packages/issues/10272))\r\n([b5a6aa4](https://github.com/AztecProtocol/aztec-packages/commit/b5a6aa4ce51a27b220162d48ba065a0077b9fcd8))\r\n* Fixing sol warnings\r\n([#10276](https://github.com/AztecProtocol/aztec-packages/issues/10276))\r\n([3d113b2](https://github.com/AztecProtocol/aztec-packages/commit/3d113b212b4641b2a97e6b2b0b4835908f3957c8))\r\n* Pull out sync changes\r\n([#10274](https://github.com/AztecProtocol/aztec-packages/issues/10274))\r\n([391a6b7](https://github.com/AztecProtocol/aztec-packages/commit/391a6b7377a5253f2c47fa5ec949f255b284da00))\r\n* Pull value merger code from sync\r\n([#10080](https://github.com/AztecProtocol/aztec-packages/issues/10080))\r\n([3392629](https://github.com/AztecProtocol/aztec-packages/commit/3392629818e6d51c01ca4c75c1ad916bb4b4fdb1))\r\n* Remove default gas settings\r\n([#10163](https://github.com/AztecProtocol/aztec-packages/issues/10163))\r\n([c9a4d88](https://github.com/AztecProtocol/aztec-packages/commit/c9a4d88b15c320e6cc6d79e0721d0f4062d2d840))\r\n* Replace relative paths to noir-protocol-circuits\r\n([654d801](https://github.com/AztecProtocol/aztec-packages/commit/654d801dc762ce69589a300ef6a2d8fe590527a8))\r\n* Teardown context in prover coordination test\r\n([#10257](https://github.com/AztecProtocol/aztec-packages/issues/10257))\r\n([7ea3888](https://github.com/AztecProtocol/aztec-packages/commit/7ea38887e514a4bbdc7ff847efe19bd2d1b74baf))\r\n</details>\r\n\r\n<details><summary>barretenberg: 0.65.2</summary>\r\n\r\n##\r\n[0.65.2](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.65.1...barretenberg-v0.65.2)\r\n(2024-11-28)\r\n\r\n\r\n### Features\r\n\r\n* Sequential insertion in indexed trees\r\n([#10111](https://github.com/AztecProtocol/aztec-packages/issues/10111))\r\n([bfd9fa6](https://github.com/AztecProtocol/aztec-packages/commit/bfd9fa68be4147acb3e3feeaf83ed3c9247761be))\r\n* Swap polys to facilitate dynamic trace overflow\r\n([#9976](https://github.com/AztecProtocol/aztec-packages/issues/9976))\r\n([b7b282c](https://github.com/AztecProtocol/aztec-packages/commit/b7b282cd0fb306abbe3951a55a1a4f4d42ed7f8e))\r\n\r\n\r\n### Bug Fixes\r\n\r\n* Don't store indices of zero leaves.\r\n([#10270](https://github.com/AztecProtocol/aztec-packages/issues/10270))\r\n([c22be8b](https://github.com/AztecProtocol/aztec-packages/commit/c22be8b23e6d16cf4a60509494b979c3edfdba9b))\r\n\r\n\r\n### Miscellaneous\r\n\r\n* Pull value merger code from sync\r\n([#10080](https://github.com/AztecProtocol/aztec-packages/issues/10080))\r\n([3392629](https://github.com/AztecProtocol/aztec-packages/commit/3392629818e6d51c01ca4c75c1ad916bb4b4fdb1))\r\n</details>\r\n\r\n---\r\nThis PR was generated with [Release\r\nPlease](https://github.com/googleapis/release-please). See\r\n[documentation](https://github.com/googleapis/release-please#release-please).",
          "timestamp": "2024-11-28T10:22:53-05:00",
          "tree_id": "75a12e8a612674cd7cbd7c42119371605cd4124e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/10754db0e6626047d4fc59cd0d7bbb320606152a"
        },
        "date": 1732808740469,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28274.836461999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 26665.580315 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5034.530501999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4673.489594999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 84250.902544,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 84250903000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15184.186199,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15184187000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3057541936,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3057541936 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 140326283,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 140326283 ns\nthreads: 1"
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
          "id": "0311bf333acb2def3be1373b36514b99b132623a",
          "message": "chore: Public inputs in unit tests with proving were incorrectly set (#10300)",
          "timestamp": "2024-11-29T13:19:48Z",
          "tree_id": "819212f2a4a91c49009daf55447970a26ad28fb5",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0311bf333acb2def3be1373b36514b99b132623a"
        },
        "date": 1732888868492,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 27269.089281000022,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 25231.633902999998 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4584.776615999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4298.010478 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 87862.19409100001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 87862194000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 16499.810913,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16499812000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3040071696,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3040071696 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 134229535,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 134229535 ns\nthreads: 1"
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
          "id": "ba335bdff645398d20241ce7baab02f63b20f55c",
          "message": "chore: Parallelise construction of perturbator coefficients at each level (#10304)\n\nWhen constructing the perturbator via the tree technique we can\r\nparallelise the construction of the coefficients at each level which is\r\none of the culprits of performance degrading when using an ambient trace\r\nof size 2^20. We see a ~1s improvement in performance doing this.\r\n\r\n2^20 trace (`EXAMPLE_20`) in master for `ClientIVCBench/Full/6` was\r\n`38114 ms` and is now `37310 ms`. For the defacto\r\n`CLIENT_IVC_BENCH_STRUCTURE` which gives 2^19 finalised circuits we go\r\nfrom `29496ms` to `29188 ms` so not as impactful but also the\r\nperformance doesn't degrade.\r\n\r\nI have also benchmarked the actual computation of coefficients and it is\r\nneglegible regardless of the ambient trace size (2^20 vs 2^19) .",
          "timestamp": "2024-11-29T13:31:09Z",
          "tree_id": "1610bbe9ced2c2d5867cb228187bec0aefc3960f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ba335bdff645398d20241ce7baab02f63b20f55c"
        },
        "date": 1732889932004,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28024.471804,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 26021.440359 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4687.344296999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4385.659062000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 95384.399199,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 95384400000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 16740.872949,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16740873000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3091390860,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3091390860 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 136304615,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 136304615 ns\nthreads: 1"
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
          "id": "5a04ca880ae2a0f285b6a5a110286ba10bc4a6c3",
          "message": "feat: Avoid inserting an empty leaf in indexed trees on update (#10281)\n\nPreviously, we were always appending an empty leaf when we encountered\r\nan update in the public data tree. After this PR public data tree\r\ninsertions don't add an empty leaf when the write is an update.",
          "timestamp": "2024-11-29T17:45:39+01:00",
          "tree_id": "2f47d10fb913d917be8d1325613d967cc661325a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5a04ca880ae2a0f285b6a5a110286ba10bc4a6c3"
        },
        "date": 1732900908817,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 27109.017248000015,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 25232.662169 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4595.447338,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4294.366223999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 91516.73673100001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 91516736000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 16542.535683000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16542537000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3038863907,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3038863907 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 133489523,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 133489523 ns\nthreads: 1"
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
          "id": "887c01103255ea4cbbb6cb33c8771d47123b3bff",
          "message": "fix: Revert \"feat: Avoid inserting an empty leaf in indexed trees on update\" (#10319)\n\nBroke kind tests. Reverts AztecProtocol/aztec-packages#10281",
          "timestamp": "2024-11-29T14:49:44-05:00",
          "tree_id": "78051fac3fcc61be957804da1d2efd108f6cc97a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/887c01103255ea4cbbb6cb33c8771d47123b3bff"
        },
        "date": 1732912388360,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 27083.93215999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 25000.168543999996 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4583.430852999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4313.663856 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 92685.02027400001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 92685021000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 16496.052567,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16496053000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3032242338,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3032242338 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 133738848,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 133738848 ns\nthreads: 1"
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
          "id": "cf05a7a346ea11853e940d5e9ac105ef0d629d35",
          "message": "feat: Allow querying block number for tree indices (#10332)\n\nThis PR make the following changes.\r\n\r\n1. Captures and propagates more of the errors generated in the merkle\r\ntrees out to the TS interface.\r\n2. Introduces the `block_number_t` typedef within the native world\r\nstate.\r\n3. Introduces a new DB in the native world state. This DB maps block\r\nnumbers to the size of the tree at that block. It then uses this DB to\r\nfulfill queries looking to identify which block given notes were\r\nincluded within.",
          "timestamp": "2024-12-02T14:27:20Z",
          "tree_id": "c8522bb2cc4539932198c8940c2fa75549ec551e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/cf05a7a346ea11853e940d5e9ac105ef0d629d35"
        },
        "date": 1733151370444,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28045.361946000015,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 26377.061908 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5038.110503999988,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4704.827921 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 85570.86460399999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 85570865000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15154.101198999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15154102000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3062933694,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3062933694 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 140911800,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 140911800 ns\nthreads: 1"
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
          "id": "4a38edfc1580aa1cb5113993ff8a2e5574076226",
          "message": "fix: witness changes in file sponge.hpp (#10345)\n\nStatic analyzer found that initial values in cache and state arrays\r\nweren't properly constrained. Initially state fill in 0 + iv value, but\r\nthese values weren't constrained as witnesses.\r\n\r\nWe replaced witness_t constructor with function create_constant_witness\r\nfrom class witness_t in file sponge.hpp.\r\n\r\nAll tests for poseidon2s passed after fix.",
          "timestamp": "2024-12-02T20:44:53+03:00",
          "tree_id": "d0444278f60e51a3c5ef6cedd929b8c3404e4878",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/4a38edfc1580aa1cb5113993ff8a2e5574076226"
        },
        "date": 1733165442826,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28206.610216,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 26382.913040000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5030.539386000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4615.324457 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 85472.53586,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 85472536000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15179.204237999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15179205000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3074885816,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3074885816 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 140784160,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 140784160 ns\nthreads: 1"
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
          "id": "c53f4cf84c60b8d81cc62d5827ec4408da88cc4e",
          "message": "feat: ultra rollup flows (#10162)\n\nAdds new flows to bb main for UltraRollupFlavor. Modifies honk recursion\r\nconstraint to be able to extract IPA claims and call accumulate on them.\r\n\r\ncloses https://github.com/AztecProtocol/barretenberg/issues/1153",
          "timestamp": "2024-12-02T12:53:55-05:00",
          "tree_id": "ad071125ed40edacc4aba31401d375fcf57cf9d2",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c53f4cf84c60b8d81cc62d5827ec4408da88cc4e"
        },
        "date": 1733166526793,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28043.348758999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 26374.351862 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5012.645554999992,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4664.723404 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 86346.74977799998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 86346750000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15139.722934000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15139723000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3053741206,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3053741206 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 141150427,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 141150427 ns\nthreads: 1"
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
          "id": "80fad4544a4d8c1b488f8b4b4f86fe508ed1f4cc",
          "message": "feat: Avoid inserting an empty leaf in indexed trees on update (#10334)\n\nFix network kind tests",
          "timestamp": "2024-12-03T10:18:02Z",
          "tree_id": "a6a0b0906d50a085855638493b15343206c6b4cb",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/80fad4544a4d8c1b488f8b4b4f86fe508ed1f4cc"
        },
        "date": 1733222571121,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28319.304727999992,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 26620.616363 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5016.4591000000055,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4730.0535740000005 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 87602.68474099999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 87602685000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15222.555528,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15222556000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3061636169,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3061636169 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 140433347,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 140433347 ns\nthreads: 1"
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
          "id": "0d1b722ef7fdc501ca78cfca8f46009a29504c8f",
          "message": "chore: redo typo PR by leopardracer (#10363)\n\nThanks leopardracer for\r\nhttps://github.com/AztecProtocol/aztec-packages/pull/9697. Our policy is\r\nto redo typo changes to dissuade metric farming. This is an automated\r\nscript.",
          "timestamp": "2024-12-03T11:37:48Z",
          "tree_id": "f187950692b5c8c78fb7f0eb455ddb107298f2d3",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0d1b722ef7fdc501ca78cfca8f46009a29504c8f"
        },
        "date": 1733227262865,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28199.36169500002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 26392.883146 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5038.348471999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4743.176674000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 85801.383808,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 85801384000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15111.3174,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15111318000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3054275815,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3054275815 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 140973381,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 140973381 ns\nthreads: 1"
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
          "id": "cc54a1e1ef75b29d160a02d03cf9b29e28d3e4ca",
          "message": "feat: Client IVC API (#10217)\n\n- Establish API in purely virtual class\r\n- This is just a first pass. I will continue to work on this before\r\nshowing dev rel and others to get buy-in.\r\n- Implement some API functions for ClientIVC: prove, verify,\r\nprove_and_verify\r\n- Support for constructing CIVC proof for input a single circuit\r\n  - This is interpreted as a \"compiletime stack\"\r\n- Produces ECCVM and Translator proofs from dummy/empty data; future\r\noptimization could avoid.\r\n- Add `one_circuit` to CIVC to encode whether the MH part of the CIVC\r\nproof should be a hiding circuit (which takes a folding proof) or a\r\nproof for the single circuit.\r\n- Run almost all ACIR tests against ClientIVC\r\n- Previously only ran MegaHonk tests, which are not totally meaningful.\r\n- Four are skipped because they fail. These failures are expected to be\r\nsuperficial (see\r\nhttps://github.com/AztecProtocol/barretenberg/issues/1164 and the\r\nreferences to it in the PR's new code).\r\n- fold_and_verify and mega honk flows go away in bb, but remain until\r\nbb.js alignment.\r\n- Delete large log file that should not be track (accounts for big\r\nnegative diff).",
          "timestamp": "2024-12-03T09:18:40-05:00",
          "tree_id": "fd1f89f19c186899ac0b6dff4a4554775b7c33c4",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/cc54a1e1ef75b29d160a02d03cf9b29e28d3e4ca"
        },
        "date": 1733237970951,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28037.81463200002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 26323.953417999997 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5009.527340000005,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4690.045214000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 86074.169488,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 86074170000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15090.203081,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15090204000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3046228577,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3046228577 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 140944710,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 140944710 ns\nthreads: 1"
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
          "id": "da809c58290f9590836f45ec59376cbf04d3c4ce",
          "message": "chore: redo typo PR by Dimitrolito (#10364)\n\nThanks Dimitrolito for\r\nhttps://github.com/AztecProtocol/aztec-packages/pull/10171. Our policy\r\nis to redo typo changes to dissuade metric farming. This is an automated\r\nscript.",
          "timestamp": "2024-12-03T15:44:23Z",
          "tree_id": "658c8b5666b1ec68d21e7a99d246ba086817a1e9",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/da809c58290f9590836f45ec59376cbf04d3c4ce"
        },
        "date": 1733242479351,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28077.23477799999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 26508.392528 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5041.33717900001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4700.703569000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 86147.2139,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 86147214000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15199.769935000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15199770000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3063815423,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3063815423 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 140592705,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 140592705 ns\nthreads: 1"
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
          "id": "ac7c0da38ff05d6f11c4d6a6244c4526ac00232e",
          "message": "feat: mock IVC state from arbitrary acir IVC recursion constraints (#10314)\n\nGenerating a bberg kernel circuit from a noir kernel program represented\r\nas acir requires an IVC instance containing certain state including a\r\nverifier accumulator and verification queue containing proofs/VKs for\r\ninput to recursive verifiers. In the context of a write_vk flow, this\r\ndata is not known and must be mocked so that the recursive verifiers in\r\nthe kernel can be constructed properly. (Similar to how we construct a\r\ndummy proof to generate a Honk recursive verifier).\r\n\r\nThe main method in this PR is `create_mock_ivc_from_constraints()` which\r\nconstructs an IVC instance with mocked state based on the IVC recursion\r\nconstraints present in the acir data. For example, if there are two PG\r\nrecursive verifications in the constraint system, we must generate two\r\nmocked PG proofs plus some other auxiliary data.\r\n\r\nSo no actual write_vk flow exists but the logic is tested though the\r\n`IvcRecursionConstraintTest` suite which constructs VKs from programs\r\ncontaining each of the 3 different possible combinations of IVC\r\nrecursion constraints that appear in Aztec kernel circuits. (These are:\r\n(a) 1 Oink recursive verification (init kernel), (b) 1 PG recursive\r\nverification (reset or tail kernel), and (c) 2 PG recursive\r\nverifications (inner kernel)).",
          "timestamp": "2024-12-03T11:50:53-07:00",
          "tree_id": "9835e31dcba1d81f93920cded826facf31b0cea1",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ac7c0da38ff05d6f11c4d6a6244c4526ac00232e"
        },
        "date": 1733254346529,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28276.316141999985,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 26358.961927 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5117.060768000016,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4738.289079 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 86761.711741,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 86761713000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15287.610942,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15287611000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3122349811,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3122349811 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 143279314,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 143279314 ns\nthreads: 1"
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
          "id": "93cd323e493118ce91097934216a364855a991db",
          "message": "chore!: remove SchnorrVerify opcode (#9897)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\r\nline.",
          "timestamp": "2024-12-03T18:59:53Z",
          "tree_id": "797ce26600894a36e5f454a0505359e4346927be",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/93cd323e493118ce91097934216a364855a991db"
        },
        "date": 1733255434404,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28255.152562000007,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 26595.755121 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5089.471339000013,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4706.901985000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 85745.93753099999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 85745937000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15183.608444,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15183609000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3071871459,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3071871459 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 141991981,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 141991981 ns\nthreads: 1"
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
          "id": "a1e5966ffe98351d848bfa47608a2f22c381acfb",
          "message": "chore(avm): Fake verification routine for avm recursion in public base rollup (#10382)\n\nResolves #10243",
          "timestamp": "2024-12-04T15:14:40+01:00",
          "tree_id": "df55ccdacab4a5a11448ba0c2a7f24f034773e7d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a1e5966ffe98351d848bfa47608a2f22c381acfb"
        },
        "date": 1733323524506,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 28253.117745999985,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 26532.772844 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5041.187059999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4715.030212000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 86911.401326,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 86911402000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15144.797168000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15144798000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3151999153,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3151999153 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 140944261,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 140944261 ns\nthreads: 1"
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
          "id": "427cf594ec9ca4b472ec5d4a249c7b49805c78e2",
          "message": "chore: parallelise inverse polynomial construction for lookup relations (#10413)\n\nBenchmark were showing that oink is the second most expensive round in\r\nPG after combiner. On top of that one component where we see\r\ndiscrepancies when increasing the ambient trace size is logderivative\r\ninverses construction. A step towards improving this is parallelising\r\nthe construction of inverse polynomials (which is linear). Also the\r\ninverses can be committed to with `commit_sparse` which shows a slight\r\nimprovement as well.\r\nBEFORE\r\n```\r\nCLIENT_IVC_BENCH_STRUCTURE(2^19)\r\n\r\nClientIVCBench/Full/6      29146 ms        27299 ms\r\nProtogalaxyProver::prove(t)            16265    58.29%\r\nProtogalaxyProver_::run_oink_prover_on_each_incomplete_key(t)    5624    34.58%\r\n\r\n\r\nEXAMPLE_20(2^20)\r\n\r\nClientIVCBench/Full/6      37145 ms        34235 ms\r\nProtogalaxyProver::prove(t)            21283    60.75%\r\nProtogalaxyProver_::run_oink_prover_on_each_incomplete_key(t)    8818    41.43%\r\nCOMMIT::lookup_inverses(t)        406     9.82%\r\n```\r\n\r\nAFTER\r\n```\r\nCLIENT_IVC_BENCH_STRUCTURE(2^19)\r\n\r\nClientIVCBench/Full/6      27351 ms        25477 ms \r\nProtogalaxyProver::prove(t)            14627    55.72%\r\nProtogalaxyProver_::run_oink_prover_on_each_incomplete_key(t)    4030    27.55%\r\n\r\n\r\nEXAMPLE_20(2^20)\r\nClientIVCBench/Full/6      33852 ms        30893 ms   \r\nProtogalaxyProver::prove(t)            18250    56.97%\r\nProtogalaxyProver_::run_oink_prover_on_each_incomplete_key(t)    5526    30.28%\r\nCOMMIT::lookup_inverses(t)        301     7.43%\r\n```",
          "timestamp": "2024-12-05T12:15:35Z",
          "tree_id": "1e148d2fba9c8aea7b0a4ace84927fd45f915316",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/427cf594ec9ca4b472ec5d4a249c7b49805c78e2"
        },
        "date": 1733404399309,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 25513.040267999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 23644.438496 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4582.814206000009,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4319.2583030000005 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 91484.2179,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 91484218000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 16490.637163,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16490638000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2819528647,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2819528647 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 136637592,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 136637592 ns\nthreads: 1"
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
          "id": "7ed89aaa9d0968af6334c1c8abf6c06a42754c52",
          "message": "feat: Integrate verify_proof calls in mock protocol circuits (#9253)\n\nIntegrates `verify_proof` calls into the mock kernels in the IVC\r\nintegration suite. VKs are computed using a new `write_vk_for_ivc` flow.\r\n\r\n---------\r\n\r\nCo-authored-by: ledwards2225 <l.edwards.d@gmail.com>",
          "timestamp": "2024-12-05T07:29:08-07:00",
          "tree_id": "797ebc8d7c7d86b831bcdb0f59ce6ee3573716ed",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7ed89aaa9d0968af6334c1c8abf6c06a42754c52"
        },
        "date": 1733411987048,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 25636.434116000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 23776.302220999998 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4626.7122279999885,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4309.831836 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 89467.156511,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 89467158000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 16541.559909,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16541561000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2841648049,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2841648049 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 136619531,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 136619531 ns\nthreads: 1"
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
          "id": "c00ebdd60373aa579587b03eeb4b44ada0bb1155",
          "message": "chore: Don't generate proofs of verifier circuits in test (#10405)\n\nTo test circuit logic we don't need to generate proofs. Running the\r\ncircuit checker is much faster and more memory efficient.",
          "timestamp": "2024-12-05T17:57:13-05:00",
          "tree_id": "e94aaf1fa39980a216322498a3bdbbd07e09f686",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c00ebdd60373aa579587b03eeb4b44ada0bb1155"
        },
        "date": 1733442134012,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 26150.069204999993,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 23990.022216 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5112.618403999988,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4769.290175 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 86459.831842,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 86459832000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15274.610086999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15274610000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2907878008,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2907878008 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 147869487,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 147869487 ns\nthreads: 1"
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
          "id": "e7ebef8d09744fdc24a79cb0bf74638b0a8f5dc8",
          "message": "feat: manage enqueued calls & phases in AVM witgen (#10310)\n\nAnother larger PR:\n1) Swap out to use the enqueued side effect trace (so we private insert\nhints)\n2) Perform private inserts of nullifiers in witgen\n3) Apply asserts in witgen to ensure the endTree snapshots and endGas\nline up with expected public inputs\n4) Enforce side effect limits in witgen\n5) Handle enqueued calls & phases in witgen\n\nLater:\n1) [Handle nested calls in\nwitgen](https://github.com/AztecProtocol/aztec-packages/pull/10384)\n2) Remove old side effect trace & old public inputs completely\n\n---------\n\nCo-authored-by: David Banks <47112877+dbanks12@users.noreply.github.com>\nCo-authored-by: dbanks12 <david@aztecprotocol.com>",
          "timestamp": "2024-12-06T10:55:34-05:00",
          "tree_id": "0234141f751e83f7ac99ef8f4ac7e4f325960c69",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e7ebef8d09744fdc24a79cb0bf74638b0a8f5dc8"
        },
        "date": 1733503614595,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 25520.91563799999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 23644.049005 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4589.823870999993,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4320.716221000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 89293.39788599999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 89293398000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 16528.366928,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16528367000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2816102150,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2816102150 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 134061838,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 134061838 ns\nthreads: 1"
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
          "id": "38c0c14fe90a1a920818f2f99a7d3204f0211091",
          "message": "chore(avm): remove function selector type of getenv opcode (#10406)\n\nResolves #9396",
          "timestamp": "2024-12-06T20:07:08+01:00",
          "tree_id": "9114d995646ae38aa3b2904cdd31f68a032aff96",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/38c0c14fe90a1a920818f2f99a7d3204f0211091"
        },
        "date": 1733513801175,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 25778.716395000003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 23730.594843000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4590.6557349999985,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4288.54193 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 90954.692418,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 90954692000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 16494.789636,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16494789000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2824984306,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2824984306 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 134158258,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 134158258 ns\nthreads: 1"
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
          "id": "f55c7edea760f329b56cbf51d5ea94048a0bc2bf",
          "message": "chore(master): Release 0.66.0",
          "timestamp": "2024-12-06T21:01:21Z",
          "url": "https://github.com/AztecProtocol/aztec-packages/pull/10282/commits/f55c7edea760f329b56cbf51d5ea94048a0bc2bf"
        },
        "date": 1733520196308,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 25559.453394000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 23710.599725 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4607.460427999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4334.487976 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 91180.047014,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 91180047000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 16490.780506,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16490782000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2803860369,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2803860369 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 133736164,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 133736164 ns\nthreads: 1"
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
          "id": "fc61b27dde7c8d30712bf4910d45081caaf0bb53",
          "message": "chore(master): Release 0.66.0 (#10282)\n\n:robot: I have created a release *beep* *boop*\r\n---\r\n\r\n\r\n<details><summary>aztec-package: 0.66.0</summary>\r\n\r\n##\r\n[0.66.0](https://github.com/AztecProtocol/aztec-packages/compare/aztec-package-v0.65.2...aztec-package-v0.66.0)\r\n(2024-12-06)\r\n\r\n\r\n### ⚠ BREAKING CHANGES\r\n\r\n* Remove debug and winston in favor of pino\r\n([#10355](https://github.com/AztecProtocol/aztec-packages/issues/10355))\r\n\r\n### Features\r\n\r\n* Agent and broker expose OTEL metrics\r\n([#10264](https://github.com/AztecProtocol/aztec-packages/issues/10264))\r\n([c2c8cc6](https://github.com/AztecProtocol/aztec-packages/commit/c2c8cc6f7336cf4b2fa14d9a7f1af1a30f1b8f79))\r\n* Epoch cache, do not attest if not in committee or from current\r\nproposer\r\n([#10327](https://github.com/AztecProtocol/aztec-packages/issues/10327))\r\n([9ebaa65](https://github.com/AztecProtocol/aztec-packages/commit/9ebaa65ce290481e5dc00174e92137561360549a))\r\n* Staking integration\r\n([#10403](https://github.com/AztecProtocol/aztec-packages/issues/10403))\r\n([ecd6c4f](https://github.com/AztecProtocol/aztec-packages/commit/ecd6c4ff914129236b23ab6f4924e4faa3e9d523))\r\n\r\n\r\n### Miscellaneous\r\n\r\n* Remove debug and winston in favor of pino\r\n([#10355](https://github.com/AztecProtocol/aztec-packages/issues/10355))\r\n([c246aba](https://github.com/AztecProtocol/aztec-packages/commit/c246aba5dd51391e2b8a3bd8cdc67f0115b85a7a))\r\n</details>\r\n\r\n<details><summary>barretenberg.js: 0.66.0</summary>\r\n\r\n##\r\n[0.66.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg.js-v0.65.2...barretenberg.js-v0.66.0)\r\n(2024-12-06)\r\n\r\n\r\n### Miscellaneous\r\n\r\n* **barretenberg.js:** Synchronize aztec-packages versions\r\n</details>\r\n\r\n<details><summary>aztec-packages: 0.66.0</summary>\r\n\r\n##\r\n[0.66.0](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.65.2...aztec-packages-v0.66.0)\r\n(2024-12-06)\r\n\r\n\r\n### ⚠ BREAKING CHANGES\r\n\r\n* remove `ec` module from stdlib\r\n(https://github.com/noir-lang/noir/pull/6612)\r\n* Disallow `#[export]` on associated methods\r\n(https://github.com/noir-lang/noir/pull/6626)\r\n* Require types of globals to be specified\r\n(https://github.com/noir-lang/noir/pull/6592)\r\n* remove eddsa from stdlib (https://github.com/noir-lang/noir/pull/6591)\r\n* Remove debug and winston in favor of pino\r\n([#10355](https://github.com/AztecProtocol/aztec-packages/issues/10355))\r\n* remove SchnorrVerify opcode\r\n([#9897](https://github.com/AztecProtocol/aztec-packages/issues/9897))\r\n\r\n### Features\r\n\r\n* Add `array_refcount` and `slice_refcount` builtins for debugging\r\n(https://github.com/noir-lang/noir/pull/6584)\r\n([3304046](https://github.com/AztecProtocol/aztec-packages/commit/3304046704e257902e32b86baf1aafc8b23bcaf6))\r\n* Add `BoundedVec::from_parts` and `BoundedVec::from_parts_unchecked`\r\n(https://github.com/noir-lang/noir/pull/6691)\r\n([3304046](https://github.com/AztecProtocol/aztec-packages/commit/3304046704e257902e32b86baf1aafc8b23bcaf6))\r\n* Add memory report into the CI\r\n(https://github.com/noir-lang/noir/pull/6630)\r\n([3304046](https://github.com/AztecProtocol/aztec-packages/commit/3304046704e257902e32b86baf1aafc8b23bcaf6))\r\n* Add workflow_call trigger to network-deploy\r\n([#10451](https://github.com/AztecProtocol/aztec-packages/issues/10451))\r\n([18254e6](https://github.com/AztecProtocol/aztec-packages/commit/18254e6518bdcb93006d8f4c7cac2c4e8da05cbf))\r\n* Adding configurable data dir and p2p pk for testnet nodes\r\n([#10422](https://github.com/AztecProtocol/aztec-packages/issues/10422))\r\n([77b0039](https://github.com/AztecProtocol/aztec-packages/commit/77b0039925ccdb322c8fa224cb05f91d82d8c0f1))\r\n* Agent and broker expose OTEL metrics\r\n([#10264](https://github.com/AztecProtocol/aztec-packages/issues/10264))\r\n([c2c8cc6](https://github.com/AztecProtocol/aztec-packages/commit/c2c8cc6f7336cf4b2fa14d9a7f1af1a30f1b8f79))\r\n* Allow filtering which SSA passes are printed\r\n(https://github.com/noir-lang/noir/pull/6636)\r\n([3304046](https://github.com/AztecProtocol/aztec-packages/commit/3304046704e257902e32b86baf1aafc8b23bcaf6))\r\n* Allow ignoring test failures from foreign calls\r\n(https://github.com/noir-lang/noir/pull/6660)\r\n([3304046](https://github.com/AztecProtocol/aztec-packages/commit/3304046704e257902e32b86baf1aafc8b23bcaf6))\r\n* Allow querying block number for tree indices\r\n([#10332](https://github.com/AztecProtocol/aztec-packages/issues/10332))\r\n([cf05a7a](https://github.com/AztecProtocol/aztec-packages/commit/cf05a7a346ea11853e940d5e9ac105ef0d629d35))\r\n* AMM\r\n([#10153](https://github.com/AztecProtocol/aztec-packages/issues/10153))\r\n([90668c3](https://github.com/AztecProtocol/aztec-packages/commit/90668c35a8556c4e77fce9fb4e6e0de931c7f872))\r\n* Avoid incrementing reference counts in some cases\r\n(https://github.com/noir-lang/noir/pull/6568)\r\n([3304046](https://github.com/AztecProtocol/aztec-packages/commit/3304046704e257902e32b86baf1aafc8b23bcaf6))\r\n* Avoid inserting an empty leaf in indexed trees on update\r\n([#10281](https://github.com/AztecProtocol/aztec-packages/issues/10281))\r\n([5a04ca8](https://github.com/AztecProtocol/aztec-packages/commit/5a04ca880ae2a0f285b6a5a110286ba10bc4a6c3))\r\n* Avoid inserting an empty leaf in indexed trees on update\r\n([#10334](https://github.com/AztecProtocol/aztec-packages/issues/10334))\r\n([80fad45](https://github.com/AztecProtocol/aztec-packages/commit/80fad4544a4d8c1b488f8b4b4f86fe508ed1f4cc))\r\n* **bb:** Define std::hash for field\r\n([#10312](https://github.com/AztecProtocol/aztec-packages/issues/10312))\r\n([752bc59](https://github.com/AztecProtocol/aztec-packages/commit/752bc59c579710c21acf6cc97164e377f72c256c))\r\n* Better error message when trying to invoke struct function field\r\n(https://github.com/noir-lang/noir/pull/6661)\r\n([3304046](https://github.com/AztecProtocol/aztec-packages/commit/3304046704e257902e32b86baf1aafc8b23bcaf6))\r\n* Client IVC API\r\n([#10217](https://github.com/AztecProtocol/aztec-packages/issues/10217))\r\n([cc54a1e](https://github.com/AztecProtocol/aztec-packages/commit/cc54a1e1ef75b29d160a02d03cf9b29e28d3e4ca))\r\n* **comptime:** Implement blackbox functions in comptime interpreter\r\n(https://github.com/noir-lang/noir/pull/6551)\r\n([3304046](https://github.com/AztecProtocol/aztec-packages/commit/3304046704e257902e32b86baf1aafc8b23bcaf6))\r\n* Delete attestations older than a slot\r\n([#10326](https://github.com/AztecProtocol/aztec-packages/issues/10326))\r\n([24abcfe](https://github.com/AztecProtocol/aztec-packages/commit/24abcfeba2cbf506cae79246a545c65913ea5c2f))\r\n* Deploy devnet to k8s\r\n([#10449](https://github.com/AztecProtocol/aztec-packages/issues/10449))\r\n([27506c1](https://github.com/AztecProtocol/aztec-packages/commit/27506c1112a224482f3b0479d92b2053dbf13512))\r\n* Deploy networks via github actions\r\n([#10381](https://github.com/AztecProtocol/aztec-packages/issues/10381))\r\n([7e19b39](https://github.com/AztecProtocol/aztec-packages/commit/7e19b3991ca34bcf9dd43284d4d21ded87824366))\r\n* **docs:** Applied structure feedback\r\n([#9288](https://github.com/AztecProtocol/aztec-packages/issues/9288))\r\n([5b0b721](https://github.com/AztecProtocol/aztec-packages/commit/5b0b721ec00545794b5e54e0e24dbc0e14b1fdd8))\r\n* Epoch cache, do not attest if not in committee or from current\r\nproposer\r\n([#10327](https://github.com/AztecProtocol/aztec-packages/issues/10327))\r\n([9ebaa65](https://github.com/AztecProtocol/aztec-packages/commit/9ebaa65ce290481e5dc00174e92137561360549a))\r\n* Gas Utils for L1 operations\r\n([#9834](https://github.com/AztecProtocol/aztec-packages/issues/9834))\r\n([17fa214](https://github.com/AztecProtocol/aztec-packages/commit/17fa214a5af4eb8364b09fc3e148fcd3a8949779))\r\n* Improve parser recovery of constructor field with '::' instead of ':'\r\n(https://github.com/noir-lang/noir/pull/6701)\r\n([3304046](https://github.com/AztecProtocol/aztec-packages/commit/3304046704e257902e32b86baf1aafc8b23bcaf6))\r\n* Integrate verify_proof calls in mock protocol circuits\r\n([#9253](https://github.com/AztecProtocol/aztec-packages/issues/9253))\r\n([7ed89aa](https://github.com/AztecProtocol/aztec-packages/commit/7ed89aaa9d0968af6334c1c8abf6c06a42754c52))\r\n* Making testnet script write a docker compose file\r\n([#10333](https://github.com/AztecProtocol/aztec-packages/issues/10333))\r\n([be54cc3](https://github.com/AztecProtocol/aztec-packages/commit/be54cc3e2e58b809c3795a2b85e76711cdff2216))\r\n* Manage enqueued calls & phases in AVM witgen\r\n([#10310](https://github.com/AztecProtocol/aztec-packages/issues/10310))\r\n([e7ebef8](https://github.com/AztecProtocol/aztec-packages/commit/e7ebef8d09744fdc24a79cb0bf74638b0a8f5dc8))\r\n* Mock IVC state from arbitrary acir IVC recursion constraints\r\n([#10314](https://github.com/AztecProtocol/aztec-packages/issues/10314))\r\n([ac7c0da](https://github.com/AztecProtocol/aztec-packages/commit/ac7c0da38ff05d6f11c4d6a6244c4526ac00232e))\r\n* Optionally emit public bytecode\r\n([#10365](https://github.com/AztecProtocol/aztec-packages/issues/10365))\r\n([84ff623](https://github.com/AztecProtocol/aztec-packages/commit/84ff623ea00d0c6da4db960653655d7d485bccb1))\r\n* **p2p:** Persist node private p2p keys\r\n([#10324](https://github.com/AztecProtocol/aztec-packages/issues/10324))\r\n([1c32eda](https://github.com/AztecProtocol/aztec-packages/commit/1c32eda798158682db204a9e5efcd867694a6bd2))\r\n* **p2p:** Snappy compress p2p messages\r\n([#10417](https://github.com/AztecProtocol/aztec-packages/issues/10417))\r\n([c643a54](https://github.com/AztecProtocol/aztec-packages/commit/c643a540262dcfe3106d03da3c3ca9bbaef338f0))\r\n* **perf:** Track last loads per block in mem2reg and remove them if\r\npossible (https://github.com/noir-lang/noir/pull/6088)\r\n([3304046](https://github.com/AztecProtocol/aztec-packages/commit/3304046704e257902e32b86baf1aafc8b23bcaf6))\r\n* Process blocks in parallel during epoch proving\r\n([#10263](https://github.com/AztecProtocol/aztec-packages/issues/10263))\r\n([a9d418c](https://github.com/AztecProtocol/aztec-packages/commit/a9d418c07268a38e0c5432983438ea00b97d233b))\r\n* Reduce memory consumption by storing array length as `u32` during SSA\r\n(https://github.com/noir-lang/noir/pull/6606)\r\n([3304046](https://github.com/AztecProtocol/aztec-packages/commit/3304046704e257902e32b86baf1aafc8b23bcaf6))\r\n* Release please for release branch\r\n([#10467](https://github.com/AztecProtocol/aztec-packages/issues/10467))\r\n([38941bf](https://github.com/AztecProtocol/aztec-packages/commit/38941bfec92ab2c61d2db25ac45c3c9f3312ee31))\r\n* Replace quadratic removal of `rc` instructions\r\n(https://github.com/noir-lang/noir/pull/6705)\r\n([3304046](https://github.com/AztecProtocol/aztec-packages/commit/3304046704e257902e32b86baf1aafc8b23bcaf6))\r\n* Replace quadratic removal of rc instructions\r\n([#10416](https://github.com/AztecProtocol/aztec-packages/issues/10416))\r\n([9d833c5](https://github.com/AztecProtocol/aztec-packages/commit/9d833c53dea362599374802e5d64c7c9d62f76be))\r\n* Revert changes to `ValueMerger` and `Instruction::IfElse`\r\n(https://github.com/noir-lang/noir/pull/6673)\r\n([3304046](https://github.com/AztecProtocol/aztec-packages/commit/3304046704e257902e32b86baf1aafc8b23bcaf6))\r\n* Show printable byte arrays as byte strings in SSA\r\n(https://github.com/noir-lang/noir/pull/6709)\r\n([3304046](https://github.com/AztecProtocol/aztec-packages/commit/3304046704e257902e32b86baf1aafc8b23bcaf6))\r\n* Simplify `jmpif`s by reversing branches if condition is negated\r\n(https://github.com/noir-lang/noir/pull/5891)\r\n([3304046](https://github.com/AztecProtocol/aztec-packages/commit/3304046704e257902e32b86baf1aafc8b23bcaf6))\r\n* **ssa:** Deduplicate intrinsics with predicates\r\n(https://github.com/noir-lang/noir/pull/6615)\r\n([3304046](https://github.com/AztecProtocol/aztec-packages/commit/3304046704e257902e32b86baf1aafc8b23bcaf6))\r\n* **ssa:** Hoisting of array get using known induction variable maximum\r\n(https://github.com/noir-lang/noir/pull/6639)\r\n([3304046](https://github.com/AztecProtocol/aztec-packages/commit/3304046704e257902e32b86baf1aafc8b23bcaf6))\r\n* **ssa:** Loop invariant code motion\r\n(https://github.com/noir-lang/noir/pull/6563)\r\n([3304046](https://github.com/AztecProtocol/aztec-packages/commit/3304046704e257902e32b86baf1aafc8b23bcaf6))\r\n* **ssa:** Option to set the maximum acceptable Brillig bytecode\r\nincrease in unrolling (https://github.com/noir-lang/noir/pull/6641)\r\n([3304046](https://github.com/AztecProtocol/aztec-packages/commit/3304046704e257902e32b86baf1aafc8b23bcaf6))\r\n* **ssa:** Simplify array get from set that writes to the same dynamic\r\nindex (https://github.com/noir-lang/noir/pull/6684)\r\n([3304046](https://github.com/AztecProtocol/aztec-packages/commit/3304046704e257902e32b86baf1aafc8b23bcaf6))\r\n* Staking integration\r\n([#10403](https://github.com/AztecProtocol/aztec-packages/issues/10403))\r\n([ecd6c4f](https://github.com/AztecProtocol/aztec-packages/commit/ecd6c4ff914129236b23ab6f4924e4faa3e9d523))\r\n* Standalone ssd\r\n([#10317](https://github.com/AztecProtocol/aztec-packages/issues/10317))\r\n([c324781](https://github.com/AztecProtocol/aztec-packages/commit/c3247819751b8efab646ed05b3b781be403653e1))\r\n* Switch to using an external noir implementation of Schnorr\r\n([#10330](https://github.com/AztecProtocol/aztec-packages/issues/10330))\r\n([6cbd375](https://github.com/AztecProtocol/aztec-packages/commit/6cbd375c4fddc0108b72a3092fcd75816305adde))\r\n* Sync from aztec-packages (https://github.com/noir-lang/noir/pull/6576)\r\n([3304046](https://github.com/AztecProtocol/aztec-packages/commit/3304046704e257902e32b86baf1aafc8b23bcaf6))\r\n* Sync from aztec-packages (https://github.com/noir-lang/noir/pull/6634)\r\n([3304046](https://github.com/AztecProtocol/aztec-packages/commit/3304046704e257902e32b86baf1aafc8b23bcaf6))\r\n* Sync from aztec-packages (https://github.com/noir-lang/noir/pull/6656)\r\n([3304046](https://github.com/AztecProtocol/aztec-packages/commit/3304046704e257902e32b86baf1aafc8b23bcaf6))\r\n* Terraform for alerting on metrics\r\n([#10192](https://github.com/AztecProtocol/aztec-packages/issues/10192))\r\n([05c9e5d](https://github.com/AztecProtocol/aztec-packages/commit/05c9e5df89f4f4185490a940d1d9daa2751e7219)),\r\ncloses\r\n[#9956](https://github.com/AztecProtocol/aztec-packages/issues/9956)\r\n* Test release network via ci workflow\r\n([#10388](https://github.com/AztecProtocol/aztec-packages/issues/10388))\r\n([e6060ec](https://github.com/AztecProtocol/aztec-packages/commit/e6060ecca318ca4cdc60f1df77c1e7639a745f79)),\r\ncloses\r\n[#10383](https://github.com/AztecProtocol/aztec-packages/issues/10383)\r\n* **tooling:** Skip program transformation when loaded from cache\r\n(https://github.com/noir-lang/noir/pull/6689)\r\n([3304046](https://github.com/AztecProtocol/aztec-packages/commit/3304046704e257902e32b86baf1aafc8b23bcaf6))\r\n* Try to inline brillig calls with all constant arguments\r\n(https://github.com/noir-lang/noir/pull/6548)\r\n([3304046](https://github.com/AztecProtocol/aztec-packages/commit/3304046704e257902e32b86baf1aafc8b23bcaf6))\r\n* Ultra rollup flows\r\n([#10162](https://github.com/AztecProtocol/aztec-packages/issues/10162))\r\n([c53f4cf](https://github.com/AztecProtocol/aztec-packages/commit/c53f4cf84c60b8d81cc62d5827ec4408da88cc4e))\r\n* Zip and propagate private logs\r\n([#10210](https://github.com/AztecProtocol/aztec-packages/issues/10210))\r\n([5c32747](https://github.com/AztecProtocol/aztec-packages/commit/5c327473994b9dd983f936809529c2bc07691130))\r\n* Zip and silo and propagate private logs\r\n([#10308](https://github.com/AztecProtocol/aztec-packages/issues/10308))\r\n([90d4385](https://github.com/AztecProtocol/aztec-packages/commit/90d43858532712a2b7182bdd06f9073e10fa5d41))\r\n\r\n\r\n### Bug Fixes\r\n\r\n* Add helm\r\n([#10454](https://github.com/AztecProtocol/aztec-packages/issues/10454))\r\n([2eb9ade](https://github.com/AztecProtocol/aztec-packages/commit/2eb9ade6e778d247557fde534cd101391d3c3307))\r\n* Add secret\r\n([#10453](https://github.com/AztecProtocol/aztec-packages/issues/10453))\r\n([95601df](https://github.com/AztecProtocol/aztec-packages/commit/95601df9a38590e1d6acf499b5aa2d8dcfb84b0f))\r\n* Add type\r\n([#10452](https://github.com/AztecProtocol/aztec-packages/issues/10452))\r\n([cd9699f](https://github.com/AztecProtocol/aztec-packages/commit/cd9699fdadaa1123aebcad35535b7e4bd0b06193))\r\n* Allow multiple `_` parameters, and disallow `_` as an expression you\r\ncan read from (https://github.com/noir-lang/noir/pull/6657)\r\n([3304046](https://github.com/AztecProtocol/aztec-packages/commit/3304046704e257902e32b86baf1aafc8b23bcaf6))\r\n* Always return an array of `u8`s when simplifying `Intrinsic::ToRadix`\r\ncalls (https://github.com/noir-lang/noir/pull/6663)\r\n([3304046](https://github.com/AztecProtocol/aztec-packages/commit/3304046704e257902e32b86baf1aafc8b23bcaf6))\r\n* Await block unwind when a reorg happens\r\n([#10380](https://github.com/AztecProtocol/aztec-packages/issues/10380))\r\n([5a02480](https://github.com/AztecProtocol/aztec-packages/commit/5a024803648e8a645cbafdeb4e2ab9f6bfa26117))\r\n* Bbup cleanup and fix\r\n([#10067](https://github.com/AztecProtocol/aztec-packages/issues/10067))\r\n([0ff8177](https://github.com/AztecProtocol/aztec-packages/commit/0ff81773da58f7c28621d4e5711ce130afd3e51b))\r\n* Bootstrapping devnet\r\n([#10396](https://github.com/AztecProtocol/aztec-packages/issues/10396))\r\n([f3c7294](https://github.com/AztecProtocol/aztec-packages/commit/f3c72942370a3ce01b73807bd729bb0d7500c177))\r\n* Bot waits for pxe synch\r\n([#10316](https://github.com/AztecProtocol/aztec-packages/issues/10316))\r\n([ebd4165](https://github.com/AztecProtocol/aztec-packages/commit/ebd41651f5912fc2e0d1aa5d0df154620341c755))\r\n* Consider prereleases to be compatible with pre-1.0.0 releases\r\n(https://github.com/noir-lang/noir/pull/6580)\r\n([3304046](https://github.com/AztecProtocol/aztec-packages/commit/3304046704e257902e32b86baf1aafc8b23bcaf6))\r\n* Correct signed integer handling in `noirc_abi`\r\n(https://github.com/noir-lang/noir/pull/6638)\r\n([3304046](https://github.com/AztecProtocol/aztec-packages/commit/3304046704e257902e32b86baf1aafc8b23bcaf6))\r\n* Correct type when simplifying `derive_pedersen_generators`\r\n(https://github.com/noir-lang/noir/pull/6579)\r\n([3304046](https://github.com/AztecProtocol/aztec-packages/commit/3304046704e257902e32b86baf1aafc8b23bcaf6))\r\n* Correct types returned by constant EC operations simplified within SSA\r\n(https://github.com/noir-lang/noir/pull/6652)\r\n([3304046](https://github.com/AztecProtocol/aztec-packages/commit/3304046704e257902e32b86baf1aafc8b23bcaf6))\r\n* Disallow `#[export]` on associated methods\r\n(https://github.com/noir-lang/noir/pull/6626)\r\n([3304046](https://github.com/AztecProtocol/aztec-packages/commit/3304046704e257902e32b86baf1aafc8b23bcaf6))\r\n* Do not warn on unused functions marked with #[export]\r\n(https://github.com/noir-lang/noir/pull/6625)\r\n([3304046](https://github.com/AztecProtocol/aztec-packages/commit/3304046704e257902e32b86baf1aafc8b23bcaf6))\r\n* Don't pass default value for --node-url\r\n([#10427](https://github.com/AztecProtocol/aztec-packages/issues/10427))\r\n([5299481](https://github.com/AztecProtocol/aztec-packages/commit/5299481bb631fa57b9e59cb923139d161b71e6b6)),\r\ncloses\r\n[#10419](https://github.com/AztecProtocol/aztec-packages/issues/10419)\r\n* Don't remove necessary RC instructions in DIE pass\r\n(https://github.com/noir-lang/noir/pull/6585)\r\n([3304046](https://github.com/AztecProtocol/aztec-packages/commit/3304046704e257902e32b86baf1aafc8b23bcaf6))\r\n* Don't report visibility errors when elaborating comptime value\r\n(https://github.com/noir-lang/noir/pull/6498)\r\n([3304046](https://github.com/AztecProtocol/aztec-packages/commit/3304046704e257902e32b86baf1aafc8b23bcaf6))\r\n* Get node info from a PXE\r\n([#10420](https://github.com/AztecProtocol/aztec-packages/issues/10420))\r\n([ed972f3](https://github.com/AztecProtocol/aztec-packages/commit/ed972f320c350c37628b583b0913a554ee1745df))\r\n* Increase timeouts\r\n([#10412](https://github.com/AztecProtocol/aztec-packages/issues/10412))\r\n([d3b8838](https://github.com/AztecProtocol/aztec-packages/commit/d3b883877620783d2e818650b5435cb243c56c96))\r\n* LSP auto-import text indent\r\n(https://github.com/noir-lang/noir/pull/6699)\r\n([3304046](https://github.com/AztecProtocol/aztec-packages/commit/3304046704e257902e32b86baf1aafc8b23bcaf6))\r\n* LSP code action wasn't triggering on beginning or end of identifier\r\n(https://github.com/noir-lang/noir/pull/6616)\r\n([3304046](https://github.com/AztecProtocol/aztec-packages/commit/3304046704e257902e32b86baf1aafc8b23bcaf6))\r\n* **LSP:** Use generic self type to narrow down methods to complete\r\n(https://github.com/noir-lang/noir/pull/6617)\r\n([3304046](https://github.com/AztecProtocol/aztec-packages/commit/3304046704e257902e32b86baf1aafc8b23bcaf6))\r\n* Move spartan-script tf to spartan, use file in bucket\r\n([#10395](https://github.com/AztecProtocol/aztec-packages/issues/10395))\r\n([5cef628](https://github.com/AztecProtocol/aztec-packages/commit/5cef62834e76f57514d0d09c24e4a2c98ea05485))\r\n* Nit\r\n([#10392](https://github.com/AztecProtocol/aztec-packages/issues/10392))\r\n([d6985a8](https://github.com/AztecProtocol/aztec-packages/commit/d6985a80e82ee671a562866d7ed978c6f6e1b659))\r\n* Optimize array ref counts to copy arrays much less often\r\n(https://github.com/noir-lang/noir/pull/6685)\r\n([3304046](https://github.com/AztecProtocol/aztec-packages/commit/3304046704e257902e32b86baf1aafc8b23bcaf6))\r\n* **p2p:** Override msg Id\r\n([#10415](https://github.com/AztecProtocol/aztec-packages/issues/10415))\r\n([990d11b](https://github.com/AztecProtocol/aztec-packages/commit/990d11b1d70126bb545e834724e51a5f8e46e64a))\r\n* Parse a bit more SSA stuff\r\n(https://github.com/noir-lang/noir/pull/6599)\r\n([3304046](https://github.com/AztecProtocol/aztec-packages/commit/3304046704e257902e32b86baf1aafc8b23bcaf6))\r\n* Preserve newlines between comments when formatting statements\r\n(https://github.com/noir-lang/noir/pull/6601)\r\n([3304046](https://github.com/AztecProtocol/aztec-packages/commit/3304046704e257902e32b86baf1aafc8b23bcaf6))\r\n* Prevent hoisting binary instructions which can overflow\r\n(https://github.com/noir-lang/noir/pull/6672)\r\n([3304046](https://github.com/AztecProtocol/aztec-packages/commit/3304046704e257902e32b86baf1aafc8b23bcaf6))\r\n* **prover:** Handle starting blocks out of order in prover\r\n([#10350](https://github.com/AztecProtocol/aztec-packages/issues/10350))\r\n([9106102](https://github.com/AztecProtocol/aztec-packages/commit/910610251e04bd9e50a4cc6da8a3230c20e49be6))\r\n* Publicly register contract classes\r\n([#10385](https://github.com/AztecProtocol/aztec-packages/issues/10385))\r\n([94e6e1a](https://github.com/AztecProtocol/aztec-packages/commit/94e6e1a954911b81e6af85edff55c64f13595b20))\r\n* Remove `compiler_version` from new `Nargo.toml`\r\n(https://github.com/noir-lang/noir/pull/6590)\r\n([3304046](https://github.com/AztecProtocol/aztec-packages/commit/3304046704e257902e32b86baf1aafc8b23bcaf6))\r\n* Revert \"feat: Avoid inserting an empty leaf in indexed trees on\r\nupdate\"\r\n([#10319](https://github.com/AztecProtocol/aztec-packages/issues/10319))\r\n([887c011](https://github.com/AztecProtocol/aztec-packages/commit/887c01103255ea4cbbb6cb33c8771d47123b3bff))\r\n* Revert \"feat: zip and propagate private logs\"\r\n([#10302](https://github.com/AztecProtocol/aztec-packages/issues/10302))\r\n([9d70728](https://github.com/AztecProtocol/aztec-packages/commit/9d70728f0e494bbe63ecf7875877344de776d438))\r\n* Safely insert sibling paths\r\n([#10423](https://github.com/AztecProtocol/aztec-packages/issues/10423))\r\n([41f7645](https://github.com/AztecProtocol/aztec-packages/commit/41f76457355fc10781613cdee7bfe0b7207f2fb4))\r\n* **ssa:** Don't deduplicate constraints in blocks that are not\r\ndominated (https://github.com/noir-lang/noir/pull/6627)\r\n([3304046](https://github.com/AztecProtocol/aztec-packages/commit/3304046704e257902e32b86baf1aafc8b23bcaf6))\r\n* **ssa:** Remove RC tracker in DIE\r\n(https://github.com/noir-lang/noir/pull/6700)\r\n([3304046](https://github.com/AztecProtocol/aztec-packages/commit/3304046704e257902e32b86baf1aafc8b23bcaf6))\r\n* **ssa:** Track all local allocations during flattening\r\n(https://github.com/noir-lang/noir/pull/6619)\r\n([3304046](https://github.com/AztecProtocol/aztec-packages/commit/3304046704e257902e32b86baf1aafc8b23bcaf6))\r\n* Tf vars\r\n([#10457](https://github.com/AztecProtocol/aztec-packages/issues/10457))\r\n([00aaef6](https://github.com/AztecProtocol/aztec-packages/commit/00aaef6a544580d8ec8a0bb64ca4c40a185b6410))\r\n* Typo in u128 docs (https://github.com/noir-lang/noir/pull/6711)\r\n([3304046](https://github.com/AztecProtocol/aztec-packages/commit/3304046704e257902e32b86baf1aafc8b23bcaf6))\r\n* Url in bbup install\r\n([#10456](https://github.com/AztecProtocol/aztec-packages/issues/10456))\r\n([1b0dfb7](https://github.com/AztecProtocol/aztec-packages/commit/1b0dfb77612cae9fa026da1d453bdf0d89442200))\r\n* Use correct type for attribute arguments\r\n(https://github.com/noir-lang/noir/pull/6640)\r\n([3304046](https://github.com/AztecProtocol/aztec-packages/commit/3304046704e257902e32b86baf1aafc8b23bcaf6))\r\n* Used signed division for signed modulo\r\n(https://github.com/noir-lang/noir/pull/6635)\r\n([3304046](https://github.com/AztecProtocol/aztec-packages/commit/3304046704e257902e32b86baf1aafc8b23bcaf6))\r\n* Witness changes in file sponge.hpp\r\n([#10345](https://github.com/AztecProtocol/aztec-packages/issues/10345))\r\n([4a38edf](https://github.com/AztecProtocol/aztec-packages/commit/4a38edfc1580aa1cb5113993ff8a2e5574076226))\r\n\r\n\r\n### Miscellaneous\r\n\r\n* Add `ram_blowup_regression` to memory report\r\n(https://github.com/noir-lang/noir/pull/6683)\r\n([3304046](https://github.com/AztecProtocol/aztec-packages/commit/3304046704e257902e32b86baf1aafc8b23bcaf6))\r\n* Add panic for compiler error described in\r\n[#6620](https://github.com/AztecProtocol/aztec-packages/issues/6620)\r\n(https://github.com/noir-lang/noir/pull/6621)\r\n([3304046](https://github.com/AztecProtocol/aztec-packages/commit/3304046704e257902e32b86baf1aafc8b23bcaf6))\r\n* **avm:** Fake verification routine for avm recursion in public base\r\nrollup\r\n([#10382](https://github.com/AztecProtocol/aztec-packages/issues/10382))\r\n([a1e5966](https://github.com/AztecProtocol/aztec-packages/commit/a1e5966ffe98351d848bfa47608a2f22c381acfb)),\r\ncloses\r\n[#10243](https://github.com/AztecProtocol/aztec-packages/issues/10243)\r\n* **avm:** Remove function selector type of getenv opcode\r\n([#10406](https://github.com/AztecProtocol/aztec-packages/issues/10406))\r\n([38c0c14](https://github.com/AztecProtocol/aztec-packages/commit/38c0c14fe90a1a920818f2f99a7d3204f0211091)),\r\ncloses\r\n[#9396](https://github.com/AztecProtocol/aztec-packages/issues/9396)\r\n* Batch archiver requests\r\n([#10442](https://github.com/AztecProtocol/aztec-packages/issues/10442))\r\n([9443e8e](https://github.com/AztecProtocol/aztec-packages/commit/9443e8ea62237201342f111d846d321612fa2bb3))\r\n* Boot node has fixed peer id private key\r\n([#10352](https://github.com/AztecProtocol/aztec-packages/issues/10352))\r\n([cae1203](https://github.com/AztecProtocol/aztec-packages/commit/cae1203ec4263d3b64fbc3fba5cfa281922004bd))\r\n* Bump alert in gossip_network.test.ts\r\n([#10430](https://github.com/AztecProtocol/aztec-packages/issues/10430))\r\n([2c2169b](https://github.com/AztecProtocol/aztec-packages/commit/2c2169be46d489a1b2023b80e5426a13702c32ab))\r\n* Centralized helm flag for proving and clean release tf deploys\r\n([#10221](https://github.com/AztecProtocol/aztec-packages/issues/10221))\r\n([c2c1744](https://github.com/AztecProtocol/aztec-packages/commit/c2c1744cb40f91773988476b23e61eb00babdc84))\r\n* **ci:** Move playwright install to `+deps`\r\n([#10293](https://github.com/AztecProtocol/aztec-packages/issues/10293))\r\n([d7bd306](https://github.com/AztecProtocol/aztec-packages/commit/d7bd306ad85b663b96c022048840c51370da99ef))\r\n* Clean up archiver logs\r\n([#10429](https://github.com/AztecProtocol/aztec-packages/issues/10429))\r\n([4fcbc59](https://github.com/AztecProtocol/aztec-packages/commit/4fcbc592c963389a132b5b72f0f68d1f6526943b))\r\n* Consolidate some CI workflows to reduce sprawl\r\n(https://github.com/noir-lang/noir/pull/6696)\r\n([3304046](https://github.com/AztecProtocol/aztec-packages/commit/3304046704e257902e32b86baf1aafc8b23bcaf6))\r\n* Contracts on a diet\r\n([#10389](https://github.com/AztecProtocol/aztec-packages/issues/10389))\r\n([dddb008](https://github.com/AztecProtocol/aztec-packages/commit/dddb008d0fe69da64574df9a21e0e91533f9ab15))\r\n* Deduplicate constants across blocks\r\n([#9972](https://github.com/AztecProtocol/aztec-packages/issues/9972))\r\n([69bb64f](https://github.com/AztecProtocol/aztec-packages/commit/69bb64fa34667810e96ea85c7594595522ccdce1))\r\n* Derive PartialEq and Hash for FieldElement\r\n(https://github.com/noir-lang/noir/pull/6610)\r\n([3304046](https://github.com/AztecProtocol/aztec-packages/commit/3304046704e257902e32b86baf1aafc8b23bcaf6))\r\n* **docs:** Remove additional `DEBUG` references, add note on\r\n`LOG_LEVEL`s\r\n([#10434](https://github.com/AztecProtocol/aztec-packages/issues/10434))\r\n([e1e5906](https://github.com/AztecProtocol/aztec-packages/commit/e1e5906c1dd1af4c3865572111438185c6ec8a41))\r\n* Don't generate proofs of verifier circuits in test\r\n([#10405](https://github.com/AztecProtocol/aztec-packages/issues/10405))\r\n([c00ebdd](https://github.com/AztecProtocol/aztec-packages/commit/c00ebdd60373aa579587b03eeb4b44ada0bb1155))\r\n* Fix sassy-salamander chores v1\r\n([#10218](https://github.com/AztecProtocol/aztec-packages/issues/10218))\r\n([7227b48](https://github.com/AztecProtocol/aztec-packages/commit/7227b487f97e26a3f8f2aa8086fb7c2c7b0de557)),\r\ncloses\r\n[#10074](https://github.com/AztecProtocol/aztec-packages/issues/10074)\r\n[#10075](https://github.com/AztecProtocol/aztec-packages/issues/10075)\r\n[#10077](https://github.com/AztecProtocol/aztec-packages/issues/10077)\r\n* Fix tests in `noirc_abi_wasm`\r\n(https://github.com/noir-lang/noir/pull/6688)\r\n([3304046](https://github.com/AztecProtocol/aztec-packages/commit/3304046704e257902e32b86baf1aafc8b23bcaf6))\r\n* Fix traces endpoint url in native testnet script\r\n([#10309](https://github.com/AztecProtocol/aztec-packages/issues/10309))\r\n([2367c62](https://github.com/AztecProtocol/aztec-packages/commit/2367c629de001f70e455abdcb7984851bf19458c))\r\n* Fix typo in test name (https://github.com/noir-lang/noir/pull/6589)\r\n([3304046](https://github.com/AztecProtocol/aztec-packages/commit/3304046704e257902e32b86baf1aafc8b23bcaf6))\r\n* Fix warning when compiling `noir_wasm`\r\n(https://github.com/noir-lang/noir/pull/6686)\r\n([3304046](https://github.com/AztecProtocol/aztec-packages/commit/3304046704e257902e32b86baf1aafc8b23bcaf6))\r\n* Ignore almost-empty directories in nargo_cli tests\r\n(https://github.com/noir-lang/noir/pull/6611)\r\n([3304046](https://github.com/AztecProtocol/aztec-packages/commit/3304046704e257902e32b86baf1aafc8b23bcaf6))\r\n* Improve error message of `&T`\r\n(https://github.com/noir-lang/noir/pull/6633)\r\n([3304046](https://github.com/AztecProtocol/aztec-packages/commit/3304046704e257902e32b86baf1aafc8b23bcaf6))\r\n* Log manual contract class registrations\r\n([#10354](https://github.com/AztecProtocol/aztec-packages/issues/10354))\r\n([da1470d](https://github.com/AztecProtocol/aztec-packages/commit/da1470d074f4884e61b51e450a661432c6f0a10f))\r\n* Making bbup a shell script\r\n([#10426](https://github.com/AztecProtocol/aztec-packages/issues/10426))\r\n([1c29554](https://github.com/AztecProtocol/aztec-packages/commit/1c29554929268fe9f53961325ae6af3f9b799b1c))\r\n* **network_test.sh:** Work around 143 by disabling stern\r\n([#10436](https://github.com/AztecProtocol/aztec-packages/issues/10436))\r\n([64f6dad](https://github.com/AztecProtocol/aztec-packages/commit/64f6dad8f95e4972ee4bef26b9e5da6d6b577f13))\r\n* Parallelise construction of perturbator coefficients at each level\r\n([#10304](https://github.com/AztecProtocol/aztec-packages/issues/10304))\r\n([ba335bd](https://github.com/AztecProtocol/aztec-packages/commit/ba335bdff645398d20241ce7baab02f63b20f55c))\r\n* Parallelise inverse polynomial construction for lookup relations\r\n([#10413](https://github.com/AztecProtocol/aztec-packages/issues/10413))\r\n([427cf59](https://github.com/AztecProtocol/aztec-packages/commit/427cf594ec9ca4b472ec5d4a249c7b49805c78e2))\r\n* Pin foundry version in CI\r\n(https://github.com/noir-lang/noir/pull/6642)\r\n([3304046](https://github.com/AztecProtocol/aztec-packages/commit/3304046704e257902e32b86baf1aafc8b23bcaf6))\r\n* Public inputs in unit tests with proving were incorrectly set\r\n([#10300](https://github.com/AztecProtocol/aztec-packages/issues/10300))\r\n([0311bf3](https://github.com/AztecProtocol/aztec-packages/commit/0311bf333acb2def3be1373b36514b99b132623a))\r\n* Pull out cfg simplification changes\r\n([#10279](https://github.com/AztecProtocol/aztec-packages/issues/10279))\r\n([c48ae90](https://github.com/AztecProtocol/aztec-packages/commit/c48ae90c5d72450a3a19b76e552df1607ff79953))\r\n* Pull out constant brillig inliner\r\n([#10291](https://github.com/AztecProtocol/aztec-packages/issues/10291))\r\n([0577c1a](https://github.com/AztecProtocol/aztec-packages/commit/0577c1a70e9746bd06f07d2813af1be39e01ca02))\r\n* Pull out loop invariant optimization\r\n([#10277](https://github.com/AztecProtocol/aztec-packages/issues/10277))\r\n([94cba37](https://github.com/AztecProtocol/aztec-packages/commit/94cba373c0807e66a2633e2bdaacea538838e2e7))\r\n* Pull out sync changes\r\n([#10292](https://github.com/AztecProtocol/aztec-packages/issues/10292))\r\n([49f80b3](https://github.com/AztecProtocol/aztec-packages/commit/49f80b30db59e2454347c4b742d536e317305f2e))\r\n* Random typos\r\n([#10393](https://github.com/AztecProtocol/aztec-packages/issues/10393))\r\n([ed47a42](https://github.com/AztecProtocol/aztec-packages/commit/ed47a42e838ffb75e17a7897bc0b77658f6e4b15))\r\n* Redo typo PR by Dimitrolito\r\n([#10364](https://github.com/AztecProtocol/aztec-packages/issues/10364))\r\n([da809c5](https://github.com/AztecProtocol/aztec-packages/commit/da809c58290f9590836f45ec59376cbf04d3c4ce))\r\n* Redo typo PR by Dimitrolito\r\n(https://github.com/noir-lang/noir/pull/6614)\r\n([3304046](https://github.com/AztecProtocol/aztec-packages/commit/3304046704e257902e32b86baf1aafc8b23bcaf6))\r\n* Redo typo PR by donatik27\r\n(https://github.com/noir-lang/noir/pull/6575)\r\n([3304046](https://github.com/AztecProtocol/aztec-packages/commit/3304046704e257902e32b86baf1aafc8b23bcaf6))\r\n* Redo typo PR by leopardracer\r\n([#10363](https://github.com/AztecProtocol/aztec-packages/issues/10363))\r\n([0d1b722](https://github.com/AztecProtocol/aztec-packages/commit/0d1b722ef7fdc501ca78cfca8f46009a29504c8f))\r\n* Redo typo PR by leopardracer\r\n([#10444](https://github.com/AztecProtocol/aztec-packages/issues/10444))\r\n([3653c4c](https://github.com/AztecProtocol/aztec-packages/commit/3653c4c78e8ba3ab2036c6467e60c2c496db5811))\r\n* Refactor foreign call executors\r\n(https://github.com/noir-lang/noir/pull/6659)\r\n([3304046](https://github.com/AztecProtocol/aztec-packages/commit/3304046704e257902e32b86baf1aafc8b23bcaf6))\r\n* Refactor indexed tree to use traits\r\n([#10361](https://github.com/AztecProtocol/aztec-packages/issues/10361))\r\n([621cbaf](https://github.com/AztecProtocol/aztec-packages/commit/621cbafc49acee6fa4422fd5ebcccd6c27507670))\r\n* Refactor poseidon2 (https://github.com/noir-lang/noir/pull/6655)\r\n([3304046](https://github.com/AztecProtocol/aztec-packages/commit/3304046704e257902e32b86baf1aafc8b23bcaf6))\r\n* Release Noir(1.0.0-beta.0)\r\n(https://github.com/noir-lang/noir/pull/6562)\r\n([3304046](https://github.com/AztecProtocol/aztec-packages/commit/3304046704e257902e32b86baf1aafc8b23bcaf6))\r\n* Remove `ec` module from stdlib\r\n(https://github.com/noir-lang/noir/pull/6612)\r\n([3304046](https://github.com/AztecProtocol/aztec-packages/commit/3304046704e257902e32b86baf1aafc8b23bcaf6))\r\n* Remove debug and winston in favor of pino\r\n([#10355](https://github.com/AztecProtocol/aztec-packages/issues/10355))\r\n([c246aba](https://github.com/AztecProtocol/aztec-packages/commit/c246aba5dd51391e2b8a3bd8cdc67f0115b85a7a))\r\n* Remove eddsa from stdlib (https://github.com/noir-lang/noir/pull/6591)\r\n([3304046](https://github.com/AztecProtocol/aztec-packages/commit/3304046704e257902e32b86baf1aafc8b23bcaf6))\r\n* Remove inliner override for `reference_counts` test\r\n(https://github.com/noir-lang/noir/pull/6714)\r\n([3304046](https://github.com/AztecProtocol/aztec-packages/commit/3304046704e257902e32b86baf1aafc8b23bcaf6))\r\n* Remove SchnorrVerify opcode\r\n([#9897](https://github.com/AztecProtocol/aztec-packages/issues/9897))\r\n([93cd323](https://github.com/AztecProtocol/aztec-packages/commit/93cd323e493118ce91097934216a364855a991db))\r\n* Remove temporary allocations from `num_bits`\r\n(https://github.com/noir-lang/noir/pull/6600)\r\n([3304046](https://github.com/AztecProtocol/aztec-packages/commit/3304046704e257902e32b86baf1aafc8b23bcaf6))\r\n* Remove unused dep\r\n([#10295](https://github.com/AztecProtocol/aztec-packages/issues/10295))\r\n([2a07355](https://github.com/AztecProtocol/aztec-packages/commit/2a0735583eb1dfb8aad47daf6f70b267fc2eca20))\r\n* Replace relative paths to noir-protocol-circuits\r\n([8fd8236](https://github.com/AztecProtocol/aztec-packages/commit/8fd823689482c4ead689f24927ca57d7206c93a7))\r\n* Replace relative paths to noir-protocol-circuits\r\n([5d11e24](https://github.com/AztecProtocol/aztec-packages/commit/5d11e24fa1bcdef097d4af0693f3f8556dbd4372))\r\n* Replace relative paths to noir-protocol-circuits\r\n([e7a99f2](https://github.com/AztecProtocol/aztec-packages/commit/e7a99f28cdb54c7d462a43c8e971fa59696900f2))\r\n* Replace relative paths to noir-protocol-circuits\r\n([2496118](https://github.com/AztecProtocol/aztec-packages/commit/2496118908db955d82222fe98514f4a55ff61e33))\r\n* Replace relative paths to noir-protocol-circuits\r\n([d77dc96](https://github.com/AztecProtocol/aztec-packages/commit/d77dc96e699b3338ff624665be5f831b0d21afb7))\r\n* Replace relative paths to noir-protocol-circuits\r\n([46d12e3](https://github.com/AztecProtocol/aztec-packages/commit/46d12e30bf9e4b523ccd5f5f4b2771498a72b8a5))\r\n* Require types of globals to be specified\r\n(https://github.com/noir-lang/noir/pull/6592)\r\n([3304046](https://github.com/AztecProtocol/aztec-packages/commit/3304046704e257902e32b86baf1aafc8b23bcaf6))\r\n* Revert \"fix: Don't remove necessary RC instructions in DIE pass\r\n(https://github.com/noir-lang/noir/pull/6585)\"\r\n(https://github.com/noir-lang/noir/pull/6693)\r\n([3304046](https://github.com/AztecProtocol/aztec-packages/commit/3304046704e257902e32b86baf1aafc8b23bcaf6))\r\n* Sassy network\r\n([#10468](https://github.com/AztecProtocol/aztec-packages/issues/10468))\r\n([92eb377](https://github.com/AztecProtocol/aztec-packages/commit/92eb377ffb1ce192b608536fc39c85c5aa9ccfc4))\r\n* Simplify otel config, 1val setup, fix pod dns, retries\r\n([#10344](https://github.com/AztecProtocol/aztec-packages/issues/10344))\r\n([be91d80](https://github.com/AztecProtocol/aztec-packages/commit/be91d807c91fbd829181c8b5935f93308fef6dbb))\r\n* Skip A-&gt;B B->A e2e_2_pxes test\r\n([#10297](https://github.com/AztecProtocol/aztec-packages/issues/10297))\r\n([b75bfd0](https://github.com/AztecProtocol/aztec-packages/commit/b75bfd0a40547eab1d4700da80819d51e15a4428))\r\n* Sync logging with jest\r\n([#10459](https://github.com/AztecProtocol/aztec-packages/issues/10459))\r\n([6e33cb9](https://github.com/AztecProtocol/aztec-packages/commit/6e33cb916643eadb62159421ba00c829e5162386))\r\n* Typo in oracles how to (https://github.com/noir-lang/noir/pull/6598)\r\n([3304046](https://github.com/AztecProtocol/aztec-packages/commit/3304046704e257902e32b86baf1aafc8b23bcaf6))\r\n* Update noir-bench-report version\r\n(https://github.com/noir-lang/noir/pull/6675)\r\n([3304046](https://github.com/AztecProtocol/aztec-packages/commit/3304046704e257902e32b86baf1aafc8b23bcaf6))\r\n* Update pprof (https://github.com/noir-lang/noir/pull/6710)\r\n([3304046](https://github.com/AztecProtocol/aztec-packages/commit/3304046704e257902e32b86baf1aafc8b23bcaf6))\r\n* Update release-please action\r\n(https://github.com/noir-lang/noir/pull/6704)\r\n([3304046](https://github.com/AztecProtocol/aztec-packages/commit/3304046704e257902e32b86baf1aafc8b23bcaf6))\r\n* Use non default mnemonic for releases\r\n([#10400](https://github.com/AztecProtocol/aztec-packages/issues/10400))\r\n([bb5f364](https://github.com/AztecProtocol/aztec-packages/commit/bb5f364e4a086f7308137ccb8f77668d33367f3a))\r\n</details>\r\n\r\n<details><summary>barretenberg: 0.66.0</summary>\r\n\r\n##\r\n[0.66.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.65.2...barretenberg-v0.66.0)\r\n(2024-12-06)\r\n\r\n\r\n### ⚠ BREAKING CHANGES\r\n\r\n* remove SchnorrVerify opcode\r\n([#9897](https://github.com/AztecProtocol/aztec-packages/issues/9897))\r\n\r\n### Features\r\n\r\n* Allow querying block number for tree indices\r\n([#10332](https://github.com/AztecProtocol/aztec-packages/issues/10332))\r\n([cf05a7a](https://github.com/AztecProtocol/aztec-packages/commit/cf05a7a346ea11853e940d5e9ac105ef0d629d35))\r\n* Avoid inserting an empty leaf in indexed trees on update\r\n([#10281](https://github.com/AztecProtocol/aztec-packages/issues/10281))\r\n([5a04ca8](https://github.com/AztecProtocol/aztec-packages/commit/5a04ca880ae2a0f285b6a5a110286ba10bc4a6c3))\r\n* Avoid inserting an empty leaf in indexed trees on update\r\n([#10334](https://github.com/AztecProtocol/aztec-packages/issues/10334))\r\n([80fad45](https://github.com/AztecProtocol/aztec-packages/commit/80fad4544a4d8c1b488f8b4b4f86fe508ed1f4cc))\r\n* **bb:** Define std::hash for field\r\n([#10312](https://github.com/AztecProtocol/aztec-packages/issues/10312))\r\n([752bc59](https://github.com/AztecProtocol/aztec-packages/commit/752bc59c579710c21acf6cc97164e377f72c256c))\r\n* Client IVC API\r\n([#10217](https://github.com/AztecProtocol/aztec-packages/issues/10217))\r\n([cc54a1e](https://github.com/AztecProtocol/aztec-packages/commit/cc54a1e1ef75b29d160a02d03cf9b29e28d3e4ca))\r\n* Integrate verify_proof calls in mock protocol circuits\r\n([#9253](https://github.com/AztecProtocol/aztec-packages/issues/9253))\r\n([7ed89aa](https://github.com/AztecProtocol/aztec-packages/commit/7ed89aaa9d0968af6334c1c8abf6c06a42754c52))\r\n* Manage enqueued calls & phases in AVM witgen\r\n([#10310](https://github.com/AztecProtocol/aztec-packages/issues/10310))\r\n([e7ebef8](https://github.com/AztecProtocol/aztec-packages/commit/e7ebef8d09744fdc24a79cb0bf74638b0a8f5dc8))\r\n* Mock IVC state from arbitrary acir IVC recursion constraints\r\n([#10314](https://github.com/AztecProtocol/aztec-packages/issues/10314))\r\n([ac7c0da](https://github.com/AztecProtocol/aztec-packages/commit/ac7c0da38ff05d6f11c4d6a6244c4526ac00232e))\r\n* Ultra rollup flows\r\n([#10162](https://github.com/AztecProtocol/aztec-packages/issues/10162))\r\n([c53f4cf](https://github.com/AztecProtocol/aztec-packages/commit/c53f4cf84c60b8d81cc62d5827ec4408da88cc4e))\r\n\r\n\r\n### Bug Fixes\r\n\r\n* Bbup cleanup and fix\r\n([#10067](https://github.com/AztecProtocol/aztec-packages/issues/10067))\r\n([0ff8177](https://github.com/AztecProtocol/aztec-packages/commit/0ff81773da58f7c28621d4e5711ce130afd3e51b))\r\n* Revert \"feat: Avoid inserting an empty leaf in indexed trees on\r\nupdate\"\r\n([#10319](https://github.com/AztecProtocol/aztec-packages/issues/10319))\r\n([887c011](https://github.com/AztecProtocol/aztec-packages/commit/887c01103255ea4cbbb6cb33c8771d47123b3bff))\r\n* Url in bbup install\r\n([#10456](https://github.com/AztecProtocol/aztec-packages/issues/10456))\r\n([1b0dfb7](https://github.com/AztecProtocol/aztec-packages/commit/1b0dfb77612cae9fa026da1d453bdf0d89442200))\r\n* Witness changes in file sponge.hpp\r\n([#10345](https://github.com/AztecProtocol/aztec-packages/issues/10345))\r\n([4a38edf](https://github.com/AztecProtocol/aztec-packages/commit/4a38edfc1580aa1cb5113993ff8a2e5574076226))\r\n\r\n\r\n### Miscellaneous\r\n\r\n* **avm:** Fake verification routine for avm recursion in public base\r\nrollup\r\n([#10382](https://github.com/AztecProtocol/aztec-packages/issues/10382))\r\n([a1e5966](https://github.com/AztecProtocol/aztec-packages/commit/a1e5966ffe98351d848bfa47608a2f22c381acfb)),\r\ncloses\r\n[#10243](https://github.com/AztecProtocol/aztec-packages/issues/10243)\r\n* **avm:** Remove function selector type of getenv opcode\r\n([#10406](https://github.com/AztecProtocol/aztec-packages/issues/10406))\r\n([38c0c14](https://github.com/AztecProtocol/aztec-packages/commit/38c0c14fe90a1a920818f2f99a7d3204f0211091)),\r\ncloses\r\n[#9396](https://github.com/AztecProtocol/aztec-packages/issues/9396)\r\n* Don't generate proofs of verifier circuits in test\r\n([#10405](https://github.com/AztecProtocol/aztec-packages/issues/10405))\r\n([c00ebdd](https://github.com/AztecProtocol/aztec-packages/commit/c00ebdd60373aa579587b03eeb4b44ada0bb1155))\r\n* Making bbup a shell script\r\n([#10426](https://github.com/AztecProtocol/aztec-packages/issues/10426))\r\n([1c29554](https://github.com/AztecProtocol/aztec-packages/commit/1c29554929268fe9f53961325ae6af3f9b799b1c))\r\n* Parallelise construction of perturbator coefficients at each level\r\n([#10304](https://github.com/AztecProtocol/aztec-packages/issues/10304))\r\n([ba335bd](https://github.com/AztecProtocol/aztec-packages/commit/ba335bdff645398d20241ce7baab02f63b20f55c))\r\n* Parallelise inverse polynomial construction for lookup relations\r\n([#10413](https://github.com/AztecProtocol/aztec-packages/issues/10413))\r\n([427cf59](https://github.com/AztecProtocol/aztec-packages/commit/427cf594ec9ca4b472ec5d4a249c7b49805c78e2))\r\n* Public inputs in unit tests with proving were incorrectly set\r\n([#10300](https://github.com/AztecProtocol/aztec-packages/issues/10300))\r\n([0311bf3](https://github.com/AztecProtocol/aztec-packages/commit/0311bf333acb2def3be1373b36514b99b132623a))\r\n* Redo typo PR by Dimitrolito\r\n([#10364](https://github.com/AztecProtocol/aztec-packages/issues/10364))\r\n([da809c5](https://github.com/AztecProtocol/aztec-packages/commit/da809c58290f9590836f45ec59376cbf04d3c4ce))\r\n* Redo typo PR by leopardracer\r\n([#10363](https://github.com/AztecProtocol/aztec-packages/issues/10363))\r\n([0d1b722](https://github.com/AztecProtocol/aztec-packages/commit/0d1b722ef7fdc501ca78cfca8f46009a29504c8f))\r\n* Remove SchnorrVerify opcode\r\n([#9897](https://github.com/AztecProtocol/aztec-packages/issues/9897))\r\n([93cd323](https://github.com/AztecProtocol/aztec-packages/commit/93cd323e493118ce91097934216a364855a991db))\r\n</details>\r\n\r\n---\r\nThis PR was generated with [Release\r\nPlease](https://github.com/googleapis/release-please). See\r\n[documentation](https://github.com/googleapis/release-please#release-please).",
          "timestamp": "2024-12-06T16:01:16-05:00",
          "tree_id": "943e07f9ceefc16dc6ea7a75012308068a1f3f45",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/fc61b27dde7c8d30712bf4910d45081caaf0bb53"
        },
        "date": 1733520801769,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 25725.825347000013,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 23857.453801000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4611.416650999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4338.86545 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 89787.238678,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 89787239000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 16581.509560000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16581511000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2810100813,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2810100813 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 135063196,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 135063196 ns\nthreads: 1"
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
          "id": "0803964015492db81001c17252aa4b724e43797b",
          "message": "feat!: rename Header to BlockHeader (#10372)\n\nI found this name quite confusing since there are lots of headers (note\r\nheaders, log headers, etc.), and so this seemed like an obvious\r\nimprovement. I also renamed the generic-looking methods (e.g.\r\n`getHeader()`) where appropriate.",
          "timestamp": "2024-12-07T20:24:35+01:00",
          "tree_id": "f08a04f47f2f90f4ea6a0e07b1189bd95c164b12",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0803964015492db81001c17252aa4b724e43797b"
        },
        "date": 1733602222573,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 26129.843539999994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 23759.768661 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4708.530955,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4423.987256 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 93080.362463,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 93080363000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 16775.935299,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16775934000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2852306938,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2852306938 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 136154515,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 136154515 ns\nthreads: 1"
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
          "id": "9301253f0488e6d96ed12a8c9bde72a653aa7d36",
          "message": "feat: GETCONTRACTINSTANCE and bytecode retrieval perform nullifier membership checks (#10445)\n\nResolves #10376 \r\nResolves #10377\r\nResolves #10378 \r\nResolves #10379",
          "timestamp": "2024-12-08T19:44:55-05:00",
          "tree_id": "ef88eee2d6dff18e500d014bda158e36dad44816",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9301253f0488e6d96ed12a8c9bde72a653aa7d36"
        },
        "date": 1733708113733,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 25784.541165000006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 23861.023060999996 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5034.496931999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4678.906249 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 84871.90155099999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 84871902000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15253.160036000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15253161000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2811242014,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2811242014 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 140003553,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 140003553 ns\nthreads: 1"
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
          "id": "7fa8f844d9e389f8636118f1d3c3ecce707e771e",
          "message": "chore: Optimise grand product computation round based on active ranges (#10460)\n\nSkip computation of numerator and denominator of z_perm at indexes that\r\nare not part of the active ranges, and refine the threshold in\r\ncommit_structured for `z_perm`. New benchmarks:\r\n**Now: 5.6 s difference**\r\nWe still see a difference between committing to z_perm between an\r\nambient trace of 2^19 and 2^20, caused by the fact that the active\r\nranges complement are larger (i.e. the ranges in the trace blocks where\r\nz_perm is constant) because the blocks themselves are larger. We \r\nmake sure to at least avoid computing and committing to z_perm after the\r\nfinal active wire index.",
          "timestamp": "2024-12-09T09:53:47Z",
          "tree_id": "e07b9816aa0a2b96dfd8c944278cc45ff76196b9",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7fa8f844d9e389f8636118f1d3c3ecce707e771e"
        },
        "date": 1733740870659,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 25051.447335000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 23098.617967 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4955.206206,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4610.698397 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 84998.268733,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 84998270000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15135.86786,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15135869000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2841811673,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2841811673 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 142816444,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 142816444 ns\nthreads: 1"
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
          "id": "0c376725a29ec18e25a7c9a89c0df8f5a1e06ff4",
          "message": "feat: Several Updates in SMT verification module (part 1) (#10437)\n\nThis pr enhances symbolic circuit to produce valid witnesses. \r\n\r\n# Utils\r\n\r\nAdded post processing functionality. So now, while optimizing something\r\ninside the circuit, you can postpone some witness calculations until\r\nhere, in case the variable has been optimized and does not fit as an\r\nSTerm.\r\n\r\n# Builders + Schema\r\n\r\nAdded `circuit_finalized` flag to the export. Should be used in the\r\nfuture, during RAM/ROM processing.\r\n\r\n# StandardCircuit\r\n\r\nPushed the post processing for standard logic operations. They were used\r\nto test the sha256 witness, which is coming in part 3, I guess.",
          "timestamp": "2024-12-09T17:29:12+03:00",
          "tree_id": "68b68e14c5d4eab18b74a38dbcddd8d2a8ff4c5c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0c376725a29ec18e25a7c9a89c0df8f5a1e06ff4"
        },
        "date": 1733757438289,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 24904.424422000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 22998.633256 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4945.819821000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4631.735119 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 84248.706783,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 84248707000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15180.103952,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15180106000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2809749867,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2809749867 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 140951230,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 140951230 ns\nthreads: 1"
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
          "id": "da4c47c5dc8caea3e860ac15a58b9ff7f011e4f6",
          "message": "feat: Adding fuzzer for ultra bigfield and relaxing ultra circuit checker (#10433)\n\nThis pr changes the behavior of `circuit_checker` for fuzzer's sake.\r\n- delta range constraint is now checked using ranges, not sort\r\nconstraints\r\n- RAM/ROM gates are checked directly \r\n\r\n\r\nAlso\r\n\r\n## Bigfield \r\n\r\n- add_two and sum methods are added\r\n\r\n## Auxiliary relation\r\n\r\n- fixed few typos\r\n\r\n## Bigfield fuzzer\r\n\r\n- Added extra logging\r\n- Disabled byte conversion due to known issue\r\n- Added Ultra circuit builder support",
          "timestamp": "2024-12-09T18:07:50+03:00",
          "tree_id": "97e10fe3a612168b00a6dff83f4a90a0de60e595",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/da4c47c5dc8caea3e860ac15a58b9ff7f011e4f6"
        },
        "date": 1733759431069,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 24792.9403,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 22966.788697 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5012.512947999994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4629.149490000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 84221.257393,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 84221257000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15170.732993,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15170733000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2826613328,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2826613328 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 140262421,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 140262421 ns\nthreads: 1"
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
          "id": "a204d1b60514d6321c2db5063375cc2bbd507fe8",
          "message": "feat: modify HonkRecursionConstraint to handle IPA claims (#10469)\n\nThis PR was split out of the IPA-in-rollup integration work. It modifies\r\nthe recursion constraint to be able to recursively verify\r\nUltraRollupFlavor properly by either forwarding or accumulating IPA\r\nclaims.",
          "timestamp": "2024-12-09T21:41:58Z",
          "tree_id": "37790a7c77cea39530e2f7f44a8192665fac5d04",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a204d1b60514d6321c2db5063375cc2bbd507fe8"
        },
        "date": 1733783711326,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 24900.701414999985,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 22607.165860999998 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4956.461761,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4634.686903999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 84354.74129699999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 84354742000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15172.759086000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15172759000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2810364825,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2810364825 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 140408428,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 140408428 ns\nthreads: 1"
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
          "id": "fbc8c0e864b10d2265373688457a33d61517bbb4",
          "message": "chore(avm): pilcom compatibility changes (#10544)\n\nFor compatibility with upcoming design.\n* Creates a columns file\n* Relations now have subrelation constexpr\n* Relative includes for generated files\n* Now you can specify output path for generated files with `-o path`\n* Full row uses macro list of columns!*\n\n*warning: GCC didn't like this so I added\n```\n\"CXXFLAGS\": \"-Wno-missing-field-initializers\"\n```\nthe reason is that I'm now defining the AvmFullRow as `FF ALL_ENTITIES;` but GCC prefers it if I do `FF col1{}; FF col2{};...` with the explicit `{}`. If I need to do that, then I need to codegen and repeat again all names.\n\nTo be honest IDK why it complains so much, if you Google this, you'll find other people running into it. This should NOT be a problem since any field not specified in aggregate initialization WILL be value-initialized. \n\nNow, FF's are special in that they don't initialize themselves by default, to accommodate array/other uses cases. (this is a BAD choice if you ask me, there are other ways to avoid explicit initialization if and only when you want to, especially for arrays etc).\n\nLet's see what tests say. In our case the AvmFullRow is only used in a vector, which does somehow force full initialization of all the fields (or at least it did).",
          "timestamp": "2024-12-09T22:03:39Z",
          "tree_id": "9e79e965dd440542ccea3e37597516ff7a85aa9b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/fbc8c0e864b10d2265373688457a33d61517bbb4"
        },
        "date": 1733784689993,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 24739.08498900002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 22920.006211 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4941.039238000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4638.026436999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 84269.571195,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 84269571000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15143.453146,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15143455000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2802303735,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2802303735 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 141348575,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 141348575 ns\nthreads: 1"
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
          "id": "e0d743121674bcfdd73f84836c17645a5bc2df92",
          "message": "feat: keccak honk proving in bb.js (#10489)",
          "timestamp": "2024-12-10T14:30:44Z",
          "tree_id": "c4d67da1da2fc7cbe8afda4419d1b4e47a63ccbd",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e0d743121674bcfdd73f84836c17645a5bc2df92"
        },
        "date": 1733842565278,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 24970.354224999995,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 22854.476754 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4569.090336000017,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4297.830157 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 90260.531113,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 90260532000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 16539.915219,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16539916000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2802856531,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2802856531 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 135031461,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 135031461 ns\nthreads: 1"
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
          "id": "8c064d484c686fdf00a100f65f1f740be4ef13cb",
          "message": "feat: CIVC browser proveThenVerify  (#10431)\n\nAdd c_binds for ClientIVC `prove` and `verify`. Wrap these in\r\n`proveThenVerify` and use replace use of `proveAndVerify` by this in the\r\nivc-integration suite.",
          "timestamp": "2024-12-10T10:17:17-05:00",
          "tree_id": "bc3bcc2f411303ed6dd522b27918e568b3ef0936",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8c064d484c686fdf00a100f65f1f740be4ef13cb"
        },
        "date": 1733846228166,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 25449.79668299999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 23020.436321999998 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4657.012612000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4363.618836 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 91991.37895999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 91991380000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 16749.367298999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16749368000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2879038387,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2879038387 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 137365749,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 137365749 ns\nthreads: 1"
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
          "id": "f18d701aa527c68a1adcc4b8acbb9c7bd239468a",
          "message": "chore(avm): more pilcom compat changes (#10569)\n\nMore changes that I need for compatibility between old and new witgen.\n\nIn particular, I'm using `bb::{{vm_name}}` namespaces versus\n``{{name}}Composer/Verifier`` etc because it makes it easier to work\nwith both of them. Also I had to add a prefix to the macros because\nnamespaces don't work with them.",
          "timestamp": "2024-12-10T10:49:27-05:00",
          "tree_id": "d7a835808ec6b418934ca7e53fcde2e4a9d3283f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f18d701aa527c68a1adcc4b8acbb9c7bd239468a"
        },
        "date": 1733848709257,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 24967.05513500001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 22686.914858 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4598.240313999994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4308.402399 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 89083.774755,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 89083775000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 16620.763439000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16620763000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2835158934,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2835158934 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 134841990,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 134841990 ns\nthreads: 1"
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
          "id": "985aef16ce612a9d3d7ff27b87b871a01911002e",
          "message": "fix: use e2e structure in cbind (#10585)",
          "timestamp": "2024-12-10T17:26:16Z",
          "tree_id": "f62851e64446bf75898ec86a57333e47eb0075d9",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/985aef16ce612a9d3d7ff27b87b871a01911002e"
        },
        "date": 1733853781259,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 24977.41933399999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 22904.236849 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4959.933972000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4652.185017 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 84560.366332,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 84560366000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15128.370046000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15128370000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2837789056,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2837789056 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 142979160,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 142979160 ns\nthreads: 1"
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
          "id": "dede16e035115e1c6971079d12f62e3046407b36",
          "message": "feat: sayonara old hints (#10547)",
          "timestamp": "2024-12-10T13:58:05-05:00",
          "tree_id": "aad3a9748365c64c07facaff8eb8d48f192863e0",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/dede16e035115e1c6971079d12f62e3046407b36"
        },
        "date": 1733859763882,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 25673.99247099999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 23592.166347 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4735.013152999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4425.648104 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 91210.434041,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 91210435000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 16922.595208999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16922597000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2806769276,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2806769276 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 135022949,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 135022949 ns\nthreads: 1"
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
          "id": "a4dfe13c1c0af3d527f5c9b2fcc38fe059e9bc38",
          "message": "feat: unified create circuit from acir (#10440)\n\nThe main goal of this PR is to allow for all circuits (including\r\nkernels) to be created using a single `create_circuit()` method. (Prior\r\nto this PR things had diverged for kernels/ivc_recursion_constraints and\r\na separate `create_kernel_circuit()` method was required). To facilitate\r\nthis and as general cleanup, this PR introduces struct `ProgramMetadata`\r\nso that the create_circuit interface is reduced to\r\n`create_circuit(AcirProgram&, ProgramMetadata&)`.\r\n\r\nNote: `ProgramMetadata` simply contains all the stuff that used to be\r\nindividual defaulted inputs to the create_circuit methods (plus a\r\npointer to a ClientIVC instance). This is a better pattern but I haven't\r\nyet made an effort to address whether some of the parameters can be\r\nremoved altogether. (It may be that they cannot).",
          "timestamp": "2024-12-10T14:08:24-07:00",
          "tree_id": "de8f5dad237ac6e7333151914e57f140a6a5ea6b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a4dfe13c1c0af3d527f5c9b2fcc38fe059e9bc38"
        },
        "date": 1733867308372,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 25006.930574000024,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 23013.879139 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4927.290060999993,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4611.554363 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 84133.171972,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 84133173000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15444.037854999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15444038000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2810950106,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2810950106 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 140482713,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 140482713 ns\nthreads: 1"
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
          "id": "ce0eee0ef4a2084ec74b6dae0a75d18af5877ef8",
          "message": "feat: Add verify proof calls to private kernels (#10533)\n\nCo-authored-by: ledwards2225 <l.edwards.d@gmail.com>",
          "timestamp": "2024-12-11T12:25:41Z",
          "tree_id": "885d3fe8632afe5effc86a4a6bded0bf8d12cb44",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ce0eee0ef4a2084ec74b6dae0a75d18af5877ef8"
        },
        "date": 1733922004034,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 24968.581983000007,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 23105.302775 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4957.461303999991,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4662.423615 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 83912.49465499999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 83912495000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15124.951348,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15124952000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2865992796,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2865992796 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 143406629,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 143406629 ns\nthreads: 1"
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
          "id": "1365401cb379d7206e268dc01a33110cecae7293",
          "message": "chore!: l2 gas maximum is per-TX-public-portion. AVM startup gas is now 20k. (#10214)\n\nResolves https://github.com/AztecProtocol/aztec-packages/issues/10030\r\n\r\nBump of AVM startup gas to 20k is mostly arbitrary, but considering some\r\nindividual opcodes cost more than its previous value of 512, it\r\ncertainly needed to be much higher. I thought 20k is at least _more_\r\nreasonable to account for the constraint cost of verifying an AVM proof.\r\n\r\nThe l2 gas maximum per-tx-public-portion ensures that there is some hard\r\nlimit on execution per AVM proof. For now, we use that limit to ensure\r\nthat you cannot overflow the AVM trace.\r\n\r\n---------\r\n\r\nCo-authored-by: IlyasRidhuan <ilyasridhuan@gmail.com>",
          "timestamp": "2024-12-11T10:28:51-05:00",
          "tree_id": "16478f624d315efa769aa2accd5873b046615dae",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1365401cb379d7206e268dc01a33110cecae7293"
        },
        "date": 1733933892288,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 25089.572749000014,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 22736.158037999998 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4636.394272000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4352.320544 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 90242.48128400001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 90242481000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 16729.639049999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16729641000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2830559702,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2830559702 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 134125685,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 134125685 ns\nthreads: 1"
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
          "id": "98ba7475ac0130dac4424a2f5cabdbe37eba5cc8",
          "message": "feat: AVM inserts fee write on txs with public calls (#10394)\n\nCo-authored-by: dbanks12 <david@aztecprotocol.com>",
          "timestamp": "2024-12-11T10:29:21-05:00",
          "tree_id": "9ada81e50985193c4a9223af5ef68898320810ff",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/98ba7475ac0130dac4424a2f5cabdbe37eba5cc8"
        },
        "date": 1733934134676,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 24590.665323999987,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 22670.279973000004 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4529.699119,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4253.775862 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 89326.130277,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 89326131000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 16532.971278999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16532972000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2788351292,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2788351292 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 132999361,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 132999361 ns\nthreads: 1"
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
          "id": "fc729ef3af7ec33f48dbb9fae3820a59a4a26479",
          "message": "chore(avm): Gas constants adjustment based on trace rows accounting (#10614)\n\nResolves #10368",
          "timestamp": "2024-12-11T19:40:24Z",
          "tree_id": "225ce297ac40c1bb343c8073532b9d9f8b1cd9a3",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/fc729ef3af7ec33f48dbb9fae3820a59a4a26479"
        },
        "date": 1733947986683,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 24587.800087000003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 22541.924446 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4528.183127999995,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4256.803812 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 89456.425646,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 89456425000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 16535.653199000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16535653000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2777904570,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2777904570 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 132148528,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 132148528 ns\nthreads: 1"
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
          "id": "d773423fb4c701d830ac2a732ab9bbc205396a63",
          "message": "fix: remove auto verify in cbind ivc prove (#10627)\n\nFixes the `wasm_client_ivc_integration_tests`\r\n\r\n---------\r\n\r\nCo-authored-by: ludamad <adam.domurad@gmail.com>",
          "timestamp": "2024-12-11T19:42:18Z",
          "tree_id": "49579e5de905bb6b483362cc44fa86f45511dd4b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d773423fb4c701d830ac2a732ab9bbc205396a63"
        },
        "date": 1733949042716,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 25490.710686,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 23174.738680000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4579.286725000003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4295.296845 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 91494.1889,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 91494190000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 16709.217765999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16709218000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2837742036,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2837742036 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 136201843,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 136201843 ns\nthreads: 1"
          }
        ]
      }
    ]
  }
}