window.BENCHMARK_DATA = {
  "lastUpdate": 1739540080503,
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
          "id": "61614b1a0fa4a766b1ad5090a29f92a122511806",
          "message": "chore: remove some templates in templates (#11698)\n\nClean up some functionality for generating solidity test circuits as we\r\ndon't have any utility of creating `StandardCircuits`",
          "timestamp": "2025-02-03T18:49:47Z",
          "tree_id": "e0d9af1a0a99122f459d378b9daeedf2dda1ad9d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/61614b1a0fa4a766b1ad5090a29f92a122511806"
        },
        "date": 1738610306899,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19299.832435000015,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16229.158743999998 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21537.477334000017,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18920.895883 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4161.836698000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3863.370731 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 83475.813774,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 83475814000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14679.242965,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14679244000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3190324190,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3190324190 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 136821763,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 136821763 ns\nthreads: 1"
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
          "id": "08e96fee292c53afa645a00a8d2689d01e8136d5",
          "message": "chore: turn on masking in ultra and mega zk + oink clean-up (#11693)\n\nWe have a mechanism to mask witness commitments and evaluations in ZK\r\nFlavors, in this PR the masking is enabled.\r\n\r\nIt is also a precursor to short scalars in UH ZK Recursive verifier, as\r\nit eliminates the edge cases from `bn254_endo_batch_mul`.\r\n\r\nCleaned up oink prover using a newly introduced `commit_with_type`\r\nmethod",
          "timestamp": "2025-02-04T11:54:55+01:00",
          "tree_id": "3b827bc4915b49c7290da85acba1849984a9465b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/08e96fee292c53afa645a00a8d2689d01e8136d5"
        },
        "date": 1738667961279,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19039.80748999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16132.504239 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 20829.509549999984,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18475.905757 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4072.1784620000108,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3788.1779460000002 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 73772.282123,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 73772282000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14350.693643999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14350695000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2615203913,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2615203913 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 132317828,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 132317828 ns\nthreads: 1"
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
          "id": "aee14208a42f9b5b7f9aef4b6e0d92e303a265c1",
          "message": "refactor: ensure new kv-store is used on the server (#11662)\n\nThis PR refactors the last few stores (other than PXE and old merkle\ntrees) to the new async store interface",
          "timestamp": "2025-02-04T11:17:29Z",
          "tree_id": "40f07b6530e708c8234209b0ad3cd80670f09352",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/aee14208a42f9b5b7f9aef4b6e0d92e303a265c1"
        },
        "date": 1738669302974,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19118.79109399999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16332.479119999998 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 20749.381434999974,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18520.836228 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4050.380407000006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3794.5928759999997 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 73937.08689899999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 73937087000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14340.037348000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14340039000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2615769720,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2615769720 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 132240330,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 132240330 ns\nthreads: 1"
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
          "id": "08fc279405cfbd88a679046d3c97b6c145b57b7a",
          "message": "chore(master): Release 0.74.0 (#11676)\n\n:robot: I have created a release *beep* *boop*\n---\n\n\n<details><summary>aztec-package: 0.74.0</summary>\n\n##\n[0.74.0](https://github.com/AztecProtocol/aztec-packages/compare/aztec-package-v0.73.0...aztec-package-v0.74.0)\n(2025-02-04)\n\n\n### Miscellaneous\n\n* Ensure new kv-store is used on the server\n([#11662](https://github.com/AztecProtocol/aztec-packages/issues/11662))\n([aee1420](https://github.com/AztecProtocol/aztec-packages/commit/aee14208a42f9b5b7f9aef4b6e0d92e303a265c1))\n</details>\n\n<details><summary>barretenberg.js: 0.74.0</summary>\n\n##\n[0.74.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg.js-v0.73.0...barretenberg.js-v0.74.0)\n(2025-02-04)\n\n\n### Miscellaneous\n\n* **barretenberg.js:** Synchronize aztec-packages versions\n</details>\n\n<details><summary>aztec-packages: 0.74.0</summary>\n\n##\n[0.74.0](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.73.0...aztec-packages-v0.74.0)\n(2025-02-04)\n\n\n### ⚠ BREAKING CHANGES\n\n* time library\n([#11542](https://github.com/AztecProtocol/aztec-packages/issues/11542))\n\n### Features\n\n* `u128.ts` accepting string on input\n([#11664](https://github.com/AztecProtocol/aztec-packages/issues/11664))\n([bb25992](https://github.com/AztecProtocol/aztec-packages/commit/bb2599240f8cea20c111c1533cff457372e5d458))\n* Add network, better drawer performance\n([#11694](https://github.com/AztecProtocol/aztec-packages/issues/11694))\n([1f61822](https://github.com/AztecProtocol/aztec-packages/commit/1f61822e731b6d1cd7295772f54afda54b646514))\n* Skip calculation of partial sums when simulating blobs\n([#11257](https://github.com/AztecProtocol/aztec-packages/issues/11257))\n([aca66f7](https://github.com/AztecProtocol/aztec-packages/commit/aca66f7611be2eba774b9d204d732801853cc6a2))\n* Time library\n([#11542](https://github.com/AztecProtocol/aztec-packages/issues/11542))\n([3b463f9](https://github.com/AztecProtocol/aztec-packages/commit/3b463f9f9376393c5f781cf2495c6db379308aca)),\ncloses\n[#11520](https://github.com/AztecProtocol/aztec-packages/issues/11520)\n* UltraHonkZK contract\n([#11553](https://github.com/AztecProtocol/aztec-packages/issues/11553))\n([a68369f](https://github.com/AztecProtocol/aztec-packages/commit/a68369fd1f12d00e037a2626b2bbc17375054883))\n\n\n### Bug Fixes\n\n* Add bootstrap.sh to rebuild_patterns\n([#11683](https://github.com/AztecProtocol/aztec-packages/issues/11683))\n([e84a81a](https://github.com/AztecProtocol/aztec-packages/commit/e84a81a556b2059be843e06a7e814cd4fb7f99eb))\n* **archiver:** Do not attempt to decode blob before filtering\n([#11668](https://github.com/AztecProtocol/aztec-packages/issues/11668))\n([961cbdd](https://github.com/AztecProtocol/aztec-packages/commit/961cbdd9ee33ce85f9509e690c346988e1a3bccf))\n* Barretenber/stdlib/logic bugs\n([#11651](https://github.com/AztecProtocol/aztec-packages/issues/11651))\n([dddab22](https://github.com/AztecProtocol/aztec-packages/commit/dddab22934b3abb798dbf204bccb68b557ee2193))\n* Barretenberg/stdlib/logic bugs (redo)\n([#11691](https://github.com/AztecProtocol/aztec-packages/issues/11691))\n([6d0bad7](https://github.com/AztecProtocol/aztec-packages/commit/6d0bad77b2ffdc966462cc333faa9cea4b21f4dc))\n* **docs:** Keys docs update\n([#11665](https://github.com/AztecProtocol/aztec-packages/issues/11665))\n([ce3d92c](https://github.com/AztecProtocol/aztec-packages/commit/ce3d92c966cbdd68cc1c8e1e34e1831db5080a34))\n* Revert \"barretenberg/stdlib/logic bugs\"\n([#11689](https://github.com/AztecProtocol/aztec-packages/issues/11689))\n([b99570d](https://github.com/AztecProtocol/aztec-packages/commit/b99570d416f4c4c59f38e47a8677b476c5c06f0b))\n* Solidity verifier caching\n([#11712](https://github.com/AztecProtocol/aztec-packages/issues/11712))\n([2ba1e71](https://github.com/AztecProtocol/aztec-packages/commit/2ba1e7112c4d8052967603ab78c1213cc70b8038))\n* Use eth-execution label\n([#11713](https://github.com/AztecProtocol/aztec-packages/issues/11713))\n([d3c31d8](https://github.com/AztecProtocol/aztec-packages/commit/d3c31d887b696865f3df41611fae534e1d89460f))\n\n\n### Miscellaneous\n\n* Add tests for gov proposer\n([#11633](https://github.com/AztecProtocol/aztec-packages/issues/11633))\n([5c6a48a](https://github.com/AztecProtocol/aztec-packages/commit/5c6a48a251ff4ef25a2efdf90891241df05e8652)),\ncloses\n[#11681](https://github.com/AztecProtocol/aztec-packages/issues/11681)\n* **bb-prover:** Avm test skip and split\n([#11717](https://github.com/AztecProtocol/aztec-packages/issues/11717))\n([1778867](https://github.com/AztecProtocol/aztec-packages/commit/177886764a23b9437fdc767726cc7c8533c27f08))\n* Benchmark sha256 number of instructions executed in AVM\n([#11253](https://github.com/AztecProtocol/aztec-packages/issues/11253))\n([aaf0d8c](https://github.com/AztecProtocol/aztec-packages/commit/aaf0d8c02b99eb1c037745d54c0859553492c088))\n* Delete MerkleTrees implementation in JS\n([#11697](https://github.com/AztecProtocol/aztec-packages/issues/11697))\n([1db7b78](https://github.com/AztecProtocol/aztec-packages/commit/1db7b7845405e1c877da71185566b8495c9469e7))\n* Ensure new kv-store is used on the server\n([#11662](https://github.com/AztecProtocol/aztec-packages/issues/11662))\n([aee1420](https://github.com/AztecProtocol/aztec-packages/commit/aee14208a42f9b5b7f9aef4b6e0d92e303a265c1))\n* Field encoding should use `fromString` instead of `fromHexString`\n([#11585](https://github.com/AztecProtocol/aztec-packages/issues/11585))\n([43fdbb1](https://github.com/AztecProtocol/aztec-packages/commit/43fdbb17361c3c2e7ab8b2cb79f0c91932a0d56e)),\ncloses\n[#10331](https://github.com/AztecProtocol/aztec-packages/issues/10331)\n* Improve boxes\n([#11656](https://github.com/AztecProtocol/aztec-packages/issues/11656))\n([46a3e85](https://github.com/AztecProtocol/aztec-packages/commit/46a3e85c08c930aa2dacb6b20483de1f7926c0ff))\n* Increase node pool count and don't use a release channel\n([#11687](https://github.com/AztecProtocol/aztec-packages/issues/11687))\n([65a3f11](https://github.com/AztecProtocol/aztec-packages/commit/65a3f11944975c8cb990a72c8b87df3ed224323c))\n* Mark contracts as pub\n([#11241](https://github.com/AztecProtocol/aztec-packages/issues/11241))\n([b168601](https://github.com/AztecProtocol/aztec-packages/commit/b1686016dd91d559cc81a2e250228698e7ff925e))\n* Reduce memory requests on prover node\n([#11678](https://github.com/AztecProtocol/aztec-packages/issues/11678))\n([a720151](https://github.com/AztecProtocol/aztec-packages/commit/a720151115471722fa46f4f4f8d6a08408659107))\n* Remove profiler cache fallback\n([#11680](https://github.com/AztecProtocol/aztec-packages/issues/11680))\n([a305aef](https://github.com/AztecProtocol/aztec-packages/commit/a305aefb8caa0e462f3f7ee535a6dbcadef871da))\n* Remove some templates in templates\n([#11698](https://github.com/AztecProtocol/aztec-packages/issues/11698))\n([61614b1](https://github.com/AztecProtocol/aztec-packages/commit/61614b1a0fa4a766b1ad5090a29f92a122511806))\n* Remove unused functions from public side effect trace\n([#11600](https://github.com/AztecProtocol/aztec-packages/issues/11600))\n([54e9602](https://github.com/AztecProtocol/aztec-packages/commit/54e960255e43c103170d7caee716fb6a0253f6f4))\n* Replace relative paths to noir-protocol-circuits\n([739151e](https://github.com/AztecProtocol/aztec-packages/commit/739151ead0f5e6a9aa421567e9e6329fa7774c13))\n* Replace relative paths to noir-protocol-circuits\n([bbd526c](https://github.com/AztecProtocol/aztec-packages/commit/bbd526ce0f53e227f40e9a4ef3c068796aff447b))\n* **sequencer:** Add InvalidArchive to canProposeAtNextEthBlock ignored\nerrors\n([#11682](https://github.com/AztecProtocol/aztec-packages/issues/11682))\n([eea4bd3](https://github.com/AztecProtocol/aztec-packages/commit/eea4bd3db21858e67e730324d0610f7c90a12023))\n* **spartan:** Remove hardcoded keys and addresses - derive all from\nmnemonic\n([#11672](https://github.com/AztecProtocol/aztec-packages/issues/11672))\n([65f0e48](https://github.com/AztecProtocol/aztec-packages/commit/65f0e484513734a73e88d78ff490d8c939005eea))\n* Turn off auto-upgrade in node-pools\n([#11679](https://github.com/AztecProtocol/aztec-packages/issues/11679))\n([09f98a9](https://github.com/AztecProtocol/aztec-packages/commit/09f98a9f10f18fd48895af40981b670c015f7aa3))\n* Turn on masking in ultra and mega zk + oink clean-up\n([#11693](https://github.com/AztecProtocol/aztec-packages/issues/11693))\n([08e96fe](https://github.com/AztecProtocol/aztec-packages/commit/08e96fee292c53afa645a00a8d2689d01e8136d5))\n\n\n### Documentation\n\n* Update mig notes release version\n([#11685](https://github.com/AztecProtocol/aztec-packages/issues/11685))\n([46a30b5](https://github.com/AztecProtocol/aztec-packages/commit/46a30b5a7438b23c64336bc217dcc1686e94b7c4))\n</details>\n\n<details><summary>barretenberg: 0.74.0</summary>\n\n##\n[0.74.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.73.0...barretenberg-v0.74.0)\n(2025-02-04)\n\n\n### Features\n\n* UltraHonkZK contract\n([#11553](https://github.com/AztecProtocol/aztec-packages/issues/11553))\n([a68369f](https://github.com/AztecProtocol/aztec-packages/commit/a68369fd1f12d00e037a2626b2bbc17375054883))\n\n\n### Bug Fixes\n\n* Barretenber/stdlib/logic bugs\n([#11651](https://github.com/AztecProtocol/aztec-packages/issues/11651))\n([dddab22](https://github.com/AztecProtocol/aztec-packages/commit/dddab22934b3abb798dbf204bccb68b557ee2193))\n* Barretenberg/stdlib/logic bugs (redo)\n([#11691](https://github.com/AztecProtocol/aztec-packages/issues/11691))\n([6d0bad7](https://github.com/AztecProtocol/aztec-packages/commit/6d0bad77b2ffdc966462cc333faa9cea4b21f4dc))\n* Revert \"barretenberg/stdlib/logic bugs\"\n([#11689](https://github.com/AztecProtocol/aztec-packages/issues/11689))\n([b99570d](https://github.com/AztecProtocol/aztec-packages/commit/b99570d416f4c4c59f38e47a8677b476c5c06f0b))\n\n\n### Miscellaneous\n\n* Ensure new kv-store is used on the server\n([#11662](https://github.com/AztecProtocol/aztec-packages/issues/11662))\n([aee1420](https://github.com/AztecProtocol/aztec-packages/commit/aee14208a42f9b5b7f9aef4b6e0d92e303a265c1))\n* Remove some templates in templates\n([#11698](https://github.com/AztecProtocol/aztec-packages/issues/11698))\n([61614b1](https://github.com/AztecProtocol/aztec-packages/commit/61614b1a0fa4a766b1ad5090a29f92a122511806))\n* Turn on masking in ultra and mega zk + oink clean-up\n([#11693](https://github.com/AztecProtocol/aztec-packages/issues/11693))\n([08e96fe](https://github.com/AztecProtocol/aztec-packages/commit/08e96fee292c53afa645a00a8d2689d01e8136d5))\n</details>\n\n---\nThis PR was generated with [Release\nPlease](https://github.com/googleapis/release-please). See\n[documentation](https://github.com/googleapis/release-please#release-please).",
          "timestamp": "2025-02-04T15:50:13Z",
          "tree_id": "70b43e51affbe5b1ec0480bcdc0747ee5cd140d6",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/08fc279405cfbd88a679046d3c97b6c145b57b7a"
        },
        "date": 1738685154112,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19484.881145000003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16704.663555 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21200.329780000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18839.351505 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4147.203273000031,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3840.100856 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 75084.88300299998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 75084884000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14448.724624,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14448724000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2680544585,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2680544585 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 134268472,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 134268472 ns\nthreads: 1"
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
          "id": "7a2870f3684b198d5472ea4bdd7be5a84e812d93",
          "message": "chore: remove stale zk constants and methods (#11715)\n\nWe're using sumcheck with disabled rows that does not require all the\r\nconstants that I introduced a while ago with an implementation of a\r\ndifferent witness masking technique.",
          "timestamp": "2025-02-05T10:45:27+01:00",
          "tree_id": "c1e6b6167712607aefa0c58aac7a1a7cf0119eda",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7a2870f3684b198d5472ea4bdd7be5a84e812d93"
        },
        "date": 1738750233124,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19472.937636999974,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16489.886534 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21126.880759000018,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18971.637977999995 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4090.6745119999923,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3821.6991430000003 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 73855.372665,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 73855373000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14458.82835,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14458828000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2902792846,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2902792846 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 140680761,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 140680761 ns\nthreads: 1"
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
          "id": "1a83cd26f7f8c4163d538f942677dcea7f2bc8dc",
          "message": "feat: report wrong proof length in the verifier contract (#11728)\n\nMake the error explicit when we test the deployed honk verifier\r\ncontracts with the wrong proof length by looking at the length member of\r\nthe calldata proof received as input.",
          "timestamp": "2025-02-05T12:26:46Z",
          "tree_id": "85da8d57d3b229ee1d2cf34f1b3bbdb07ef2d17e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1a83cd26f7f8c4163d538f942677dcea7f2bc8dc"
        },
        "date": 1738759431003,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19340.18554000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16676.547506 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 22732.52264499999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18907.644507 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4090.2754399999994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3788.413685 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 82474.95643,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 82474956000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14529.683263000003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14529684000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3335265706,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3335265706 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 163568694,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 163568694 ns\nthreads: 1"
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
          "id": "511abe50c77b91bfd0d29c209720663c33debc61",
          "message": "feat: k-shifts (#11663)\n\nAdds logic to the Shplemini PCS to open right-shift-by-k polynomials\nfrom their unshifted counterparts. As a result of prior PRs in this\nseries, the logic for doing this is isolated to sub classes\n`PolynomialBatcher` and `ClaimBatcher`.\n\nNote: the mechanism is tested in the commitment_schemes_tests suite but\nnot yet used in any real protocols.",
          "timestamp": "2025-02-05T12:45:20Z",
          "tree_id": "a2a3b65688e80714a3fccf67585f60b31615c156",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/511abe50c77b91bfd0d29c209720663c33debc61"
        },
        "date": 1738761062832,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19852.644344999986,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17001.061112 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21803.18771100002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19300.99086 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4214.942121000007,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3907.7355700000003 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 75573.87557,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 75573875000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14705.656345000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14705658000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2737314647,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2737314647 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 137863623,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 137863623 ns\nthreads: 1"
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
          "id": "b003567128c15c1064bd6bd831ebe1a4158ae66f",
          "message": "chore(avm): use lookup by clk for sha params (#11762)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this line.",
          "timestamp": "2025-02-05T17:44:58Z",
          "tree_id": "94455a5dc0d7011557ce46cb58760879c9d5072b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/b003567128c15c1064bd6bd831ebe1a4158ae66f"
        },
        "date": 1738778496914,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19834.562712999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16994.689435999997 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21437.376126000003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19006.689238 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4143.899132999991,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3863.1326039999994 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 76478.33661299999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 76478336000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14593.485742,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14593487000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2671148046,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2671148046 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 135142599,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 135142599 ns\nthreads: 1"
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
          "id": "6145cd051a9fcabfd4c7ddcb5c7607390ef5f152",
          "message": "chore(avm): full row cleanup (#11767)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this line.",
          "timestamp": "2025-02-06T09:55:42Z",
          "tree_id": "aeeb59eeb4cd7c4f86d5520c2e609f03b7488339",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/6145cd051a9fcabfd4c7ddcb5c7607390ef5f152"
        },
        "date": 1738836823300,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20355.636050999976,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17605.100001 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21177.440432000025,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18439.475241 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4490.174085000007,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4143.9138410000005 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 71549.33496699999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 71549334000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13406.643896000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13406643000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2726265222,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2726265222 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 146876412,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 146876412 ns\nthreads: 1"
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
          "id": "e58d1f7df0d6e2bceb88aae3171351f79375372c",
          "message": "chore(master): Release 0.75.0",
          "timestamp": "2025-02-06T11:32:00Z",
          "url": "https://github.com/AztecProtocol/aztec-packages/pull/11726/commits/e58d1f7df0d6e2bceb88aae3171351f79375372c"
        },
        "date": 1738842308321,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20219.993541999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17404.9443 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21357.20039299997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18736.859895999998 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4512.661745000003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4222.195421 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 71709.801158,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 71709801000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13465.458864,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13465459000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2701893677,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2701893677 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 142851430,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 142851430 ns\nthreads: 1"
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
          "id": "ff6875bab256bef0e92e06da45689a9086ae09c2",
          "message": "chore(master): Release 0.75.0 (#11726)\n\n:robot: I have created a release *beep* *boop*\n---\n\n\n<details><summary>aztec-package: 0.75.0</summary>\n\n##\n[0.75.0](https://github.com/AztecProtocol/aztec-packages/compare/aztec-package-v0.74.0...aztec-package-v0.75.0)\n(2025-02-06)\n\n\n### Miscellaneous\n\n* Playground name change\n([#11720](https://github.com/AztecProtocol/aztec-packages/issues/11720))\n([c5cbf65](https://github.com/AztecProtocol/aztec-packages/commit/c5cbf659ffebff15d3609c0cb92d732133691ea0))\n</details>\n\n<details><summary>barretenberg.js: 0.75.0</summary>\n\n##\n[0.75.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg.js-v0.74.0...barretenberg.js-v0.75.0)\n(2025-02-06)\n\n\n### Miscellaneous\n\n* Better bundling for bb.js, remove aztec.js bundling\n([#11761](https://github.com/AztecProtocol/aztec-packages/issues/11761))\n([8cc3f0a](https://github.com/AztecProtocol/aztec-packages/commit/8cc3f0a9f2753e942d7055f2ccddc96e6f4c7f94))\n* Playground name change\n([#11720](https://github.com/AztecProtocol/aztec-packages/issues/11720))\n([c5cbf65](https://github.com/AztecProtocol/aztec-packages/commit/c5cbf659ffebff15d3609c0cb92d732133691ea0))\n</details>\n\n<details><summary>aztec-packages: 0.75.0</summary>\n\n##\n[0.75.0](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.74.0...aztec-packages-v0.75.0)\n(2025-02-06)\n\n\n### ⚠ BREAKING CHANGES\n\n* introduce `WithHash<T>` + use it in `PublicImmutable`\n([#8022](https://github.com/AztecProtocol/aztec-packages/issues/8022))\n* leonidas library\n([#11596](https://github.com/AztecProtocol/aztec-packages/issues/11596))\n\n### Features\n\n* Allow resolved types in constructors\n(https://github.com/noir-lang/noir/pull/7223)\n([b60a39d](https://github.com/AztecProtocol/aztec-packages/commit/b60a39d989b77702a89ebb24047e5b2419915dc3))\n* Allow specifying multiple patterns in nargo test\n(https://github.com/noir-lang/noir/pull/7186)\n([b60a39d](https://github.com/AztecProtocol/aztec-packages/commit/b60a39d989b77702a89ebb24047e5b2419915dc3))\n* Contracts deployed in txe should emit deployment nullifier\nautomatically\n([#11708](https://github.com/AztecProtocol/aztec-packages/issues/11708))\n([20f5653](https://github.com/AztecProtocol/aztec-packages/commit/20f565383792921926492adbb76e3671718acb8c))\n* **docs:** Applying structure feedback + adding nodes docs\n([#10976](https://github.com/AztecProtocol/aztec-packages/issues/10976))\n([2fd08ba](https://github.com/AztecProtocol/aztec-packages/commit/2fd08babea610f97d63adcea5630cfd3065fd3a8))\n* **docs:** Inspiration / ideas page\n([#11755](https://github.com/AztecProtocol/aztec-packages/issues/11755))\n([0b012f1](https://github.com/AztecProtocol/aztec-packages/commit/0b012f1088c1e1bbcbab503a54ede82c0867cea2))\n* **experimental:** Implement enum tag constants\n(https://github.com/noir-lang/noir/pull/7183)\n([b60a39d](https://github.com/AztecProtocol/aztec-packages/commit/b60a39d989b77702a89ebb24047e5b2419915dc3))\n* **experimental:** Implement zeroed for enums\n(https://github.com/noir-lang/noir/pull/7252)\n([b60a39d](https://github.com/AztecProtocol/aztec-packages/commit/b60a39d989b77702a89ebb24047e5b2419915dc3))\n* **experimental:** Parse match expressions\n(https://github.com/noir-lang/noir/pull/7243)\n([b60a39d](https://github.com/AztecProtocol/aztec-packages/commit/b60a39d989b77702a89ebb24047e5b2419915dc3))\n* **experimental:** Support enums in comptime code\n(https://github.com/noir-lang/noir/pull/7194)\n([b60a39d](https://github.com/AztecProtocol/aztec-packages/commit/b60a39d989b77702a89ebb24047e5b2419915dc3))\n* Gen public base prover.toml\n([#11757](https://github.com/AztecProtocol/aztec-packages/issues/11757))\n([1fa89da](https://github.com/AztecProtocol/aztec-packages/commit/1fa89da45c00f4efea7e0858e9282d27a9134707))\n* Introduce `WithHash&lt;T&gt;` + use it in `PublicImmutable`\n([#8022](https://github.com/AztecProtocol/aztec-packages/issues/8022))\n([6c15604](https://github.com/AztecProtocol/aztec-packages/commit/6c15604261d4d59ce74e6bd23ebaf75bf20575e0))\n* K-shifts\n([#11663](https://github.com/AztecProtocol/aztec-packages/issues/11663))\n([511abe5](https://github.com/AztecProtocol/aztec-packages/commit/511abe50c77b91bfd0d29c209720663c33debc61))\n* Leonidas library\n([#11596](https://github.com/AztecProtocol/aztec-packages/issues/11596))\n([e8cfed7](https://github.com/AztecProtocol/aztec-packages/commit/e8cfed75cce442e4e7a1a7a41df3ccc95b1ff2b7))\n* **LSP:** Suggest enum variants without parameters\n(https://github.com/noir-lang/noir/pull/7261)\n([b60a39d](https://github.com/AztecProtocol/aztec-packages/commit/b60a39d989b77702a89ebb24047e5b2419915dc3))\n* **optimization:** Add purity analysis to SSA\n(https://github.com/noir-lang/noir/pull/7197)\n([b60a39d](https://github.com/AztecProtocol/aztec-packages/commit/b60a39d989b77702a89ebb24047e5b2419915dc3))\n* Report wrong proof length in the verifier contract\n([#11728](https://github.com/AztecProtocol/aztec-packages/issues/11728))\n([1a83cd2](https://github.com/AztecProtocol/aztec-packages/commit/1a83cd26f7f8c4163d538f942677dcea7f2bc8dc))\n* Simplify subtraction from self to return zero\n(https://github.com/noir-lang/noir/pull/7189)\n([b60a39d](https://github.com/AztecProtocol/aztec-packages/commit/b60a39d989b77702a89ebb24047e5b2419915dc3))\n* Sync from aztec-packages (https://github.com/noir-lang/noir/pull/7241)\n([b60a39d](https://github.com/AztecProtocol/aztec-packages/commit/b60a39d989b77702a89ebb24047e5b2419915dc3))\n\n\n### Bug Fixes\n\n* Add missing `is_empty` check for enums\n(https://github.com/noir-lang/noir/pull/7257)\n([b60a39d](https://github.com/AztecProtocol/aztec-packages/commit/b60a39d989b77702a89ebb24047e5b2419915dc3))\n* Avoid type error when calling something with a type alias of a\nfunction (https://github.com/noir-lang/noir/pull/7239)\n([b60a39d](https://github.com/AztecProtocol/aztec-packages/commit/b60a39d989b77702a89ebb24047e5b2419915dc3))\n* **brillig:** Globals entry point reachability analysis\n(https://github.com/noir-lang/noir/pull/7188)\n([b60a39d](https://github.com/AztecProtocol/aztec-packages/commit/b60a39d989b77702a89ebb24047e5b2419915dc3))\n* Contracts with no private / public functions should not fail to\ngenerate a contract artifact\n([#11744](https://github.com/AztecProtocol/aztec-packages/issues/11744))\n([672171c](https://github.com/AztecProtocol/aztec-packages/commit/672171c607595c7bbd90c2dd7d477379e7e2bcdd))\n* Correct reversed callstacks\n(https://github.com/noir-lang/noir/pull/7212)\n([b60a39d](https://github.com/AztecProtocol/aztec-packages/commit/b60a39d989b77702a89ebb24047e5b2419915dc3))\n* Deflake prover node epoch proof quote test\n([#11773](https://github.com/AztecProtocol/aztec-packages/issues/11773))\n([04e1061](https://github.com/AztecProtocol/aztec-packages/commit/04e1061be7e63c90eff4b54af808f3216296ddd7))\n* **docs:** Fix docs previews\n([#11736](https://github.com/AztecProtocol/aztec-packages/issues/11736))\n([255b3d8](https://github.com/AztecProtocol/aztec-packages/commit/255b3d87ae8bc61f7ce10aa21eb249b9ca723318))\n* Handle sequencer building block mid-synch\n([#11735](https://github.com/AztecProtocol/aztec-packages/issues/11735))\n([435a0af](https://github.com/AztecProtocol/aztec-packages/commit/435a0afe47155d89e3b7dc7a66273e917ca0ef3f))\n* Prevent panic within `remove_possibly_mutated_cached_make_arrays`\n(https://github.com/noir-lang/noir/pull/7264)\n([b60a39d](https://github.com/AztecProtocol/aztec-packages/commit/b60a39d989b77702a89ebb24047e5b2419915dc3))\n* **ssa:** Only attempt to inline constant Brillig calls for entry\npoints (https://github.com/noir-lang/noir/pull/7260)\n([b60a39d](https://github.com/AztecProtocol/aztec-packages/commit/b60a39d989b77702a89ebb24047e5b2419915dc3))\n* **ssa:** Use number of SSA instructions for the Brillig unrolling\nbytecode size limit (https://github.com/noir-lang/noir/pull/7242)\n([b60a39d](https://github.com/AztecProtocol/aztec-packages/commit/b60a39d989b77702a89ebb24047e5b2419915dc3))\n* **unrolling:** Fetch original bytecode size from the original function\n(https://github.com/noir-lang/noir/pull/7253)\n([b60a39d](https://github.com/AztecProtocol/aztec-packages/commit/b60a39d989b77702a89ebb24047e5b2419915dc3))\n\n\n### Miscellaneous\n\n* **avm:** Add names to lookup settings\n([#11768](https://github.com/AztecProtocol/aztec-packages/issues/11768))\n([fafe3ba](https://github.com/AztecProtocol/aztec-packages/commit/fafe3bad6ceff1679ed1bd43ab29a1345cc22721))\n* **avm:** Full row cleanup\n([#11767](https://github.com/AztecProtocol/aztec-packages/issues/11767))\n([6145cd0](https://github.com/AztecProtocol/aztec-packages/commit/6145cd051a9fcabfd4c7ddcb5c7607390ef5f152))\n* **avm:** Use lookup by clk for sha params\n([#11762](https://github.com/AztecProtocol/aztec-packages/issues/11762))\n([b003567](https://github.com/AztecProtocol/aztec-packages/commit/b003567128c15c1064bd6bd831ebe1a4158ae66f))\n* Better bundling for bb.js, remove aztec.js bundling\n([#11761](https://github.com/AztecProtocol/aztec-packages/issues/11761))\n([8cc3f0a](https://github.com/AztecProtocol/aztec-packages/commit/8cc3f0a9f2753e942d7055f2ccddc96e6f4c7f94))\n* Build docs in the merge queue\n(https://github.com/noir-lang/noir/pull/7218)\n([b60a39d](https://github.com/AztecProtocol/aztec-packages/commit/b60a39d989b77702a89ebb24047e5b2419915dc3))\n* Bump gates diff (https://github.com/noir-lang/noir/pull/7245)\n([b60a39d](https://github.com/AztecProtocol/aztec-packages/commit/b60a39d989b77702a89ebb24047e5b2419915dc3))\n* Change log level for block proposal\n([#11734](https://github.com/AztecProtocol/aztec-packages/issues/11734))\n([29ee9aa](https://github.com/AztecProtocol/aztec-packages/commit/29ee9aa871464e928e188be456a94e584dda0222))\n* **ci:** Add test for global vars entry points regression\n(https://github.com/noir-lang/noir/pull/7209)\n([b60a39d](https://github.com/AztecProtocol/aztec-packages/commit/b60a39d989b77702a89ebb24047e5b2419915dc3))\n* Clarify to_radix docs examples\n(https://github.com/noir-lang/noir/pull/7230)\n([b60a39d](https://github.com/AztecProtocol/aztec-packages/commit/b60a39d989b77702a89ebb24047e5b2419915dc3))\n* **docs:** Moving references to noir-starter to awesome-noir\n(https://github.com/noir-lang/noir/pull/7203)\n([b60a39d](https://github.com/AztecProtocol/aztec-packages/commit/b60a39d989b77702a89ebb24047e5b2419915dc3))\n* Early check type equality in try_unify\n(https://github.com/noir-lang/noir/pull/7263)\n([b60a39d](https://github.com/AztecProtocol/aztec-packages/commit/b60a39d989b77702a89ebb24047e5b2419915dc3))\n* Exclude dependency fetching time from benchmarks\n(https://github.com/noir-lang/noir/pull/7210)\n([b60a39d](https://github.com/AztecProtocol/aztec-packages/commit/b60a39d989b77702a89ebb24047e5b2419915dc3))\n* Fix struct example (https://github.com/noir-lang/noir/pull/7198)\n([b60a39d](https://github.com/AztecProtocol/aztec-packages/commit/b60a39d989b77702a89ebb24047e5b2419915dc3))\n* More scalability for our metrics\n([#11732](https://github.com/AztecProtocol/aztec-packages/issues/11732))\n([52bbf14](https://github.com/AztecProtocol/aztec-packages/commit/52bbf1432500f7701deda8d75bf6ff454d37b024))\n* Playground name change\n([#11720](https://github.com/AztecProtocol/aztec-packages/issues/11720))\n([c5cbf65](https://github.com/AztecProtocol/aztec-packages/commit/c5cbf659ffebff15d3609c0cb92d732133691ea0))\n* Re-enable p2p test\n([#11706](https://github.com/AztecProtocol/aztec-packages/issues/11706))\n([652c251](https://github.com/AztecProtocol/aztec-packages/commit/652c25137bafec903759dd4ad831881bf53dde1d)),\ncloses\n[#10737](https://github.com/AztecProtocol/aztec-packages/issues/10737)\n* Remove stale zk constants and methods\n([#11715](https://github.com/AztecProtocol/aztec-packages/issues/11715))\n([7a2870f](https://github.com/AztecProtocol/aztec-packages/commit/7a2870f3684b198d5472ea4bdd7be5a84e812d93))\n* Replace relative paths to noir-protocol-circuits\n([aabab34](https://github.com/AztecProtocol/aztec-packages/commit/aabab34efc42d2195ac575f3ea72bc21dadc0aa2))\n* Replace relative paths to noir-protocol-circuits\n([0720d18](https://github.com/AztecProtocol/aztec-packages/commit/0720d18580494823f13c7ba5ab956bc3eff12726))\n* Request txs in prover-node after each block finishes\n([#11749](https://github.com/AztecProtocol/aztec-packages/issues/11749))\n([61e4eee](https://github.com/AztecProtocol/aztec-packages/commit/61e4eeea89dc87e06ea19ede0ee5e60189a65cab))\n* Rework defunctionalize pass to not rely on DFG bugs\n(https://github.com/noir-lang/noir/pull/7222)\n([b60a39d](https://github.com/AztecProtocol/aztec-packages/commit/b60a39d989b77702a89ebb24047e5b2419915dc3))\n* Sandbox lower sequencer log level\n([#11742](https://github.com/AztecProtocol/aztec-packages/issues/11742))\n([7b30758](https://github.com/AztecProtocol/aztec-packages/commit/7b30758816592f49fda428e4a82fc8c825011523)),\ncloses\n[#11677](https://github.com/AztecProtocol/aztec-packages/issues/11677)\n* **spartan:** Making the spartan script add the coinbase address\n([#11235](https://github.com/AztecProtocol/aztec-packages/issues/11235))\n([b97ff0d](https://github.com/AztecProtocol/aztec-packages/commit/b97ff0d4857704e7625acbd043ee53a778837bc2))\n* **ssa:** Flip the SSA Brillig constraint check to off by default\n(https://github.com/noir-lang/noir/pull/7211)\n([b60a39d](https://github.com/AztecProtocol/aztec-packages/commit/b60a39d989b77702a89ebb24047e5b2419915dc3))\n* Start tracking time to run critical library tests\n(https://github.com/noir-lang/noir/pull/7221)\n([b60a39d](https://github.com/AztecProtocol/aztec-packages/commit/b60a39d989b77702a89ebb24047e5b2419915dc3))\n* Update docs to use devcontainer feature\n(https://github.com/noir-lang/noir/pull/7206)\n([b60a39d](https://github.com/AztecProtocol/aztec-packages/commit/b60a39d989b77702a89ebb24047e5b2419915dc3))\n* Use batch p2p reqresp for requesting txs in prover node\n([#11741](https://github.com/AztecProtocol/aztec-packages/issues/11741))\n([df9e4ec](https://github.com/AztecProtocol/aztec-packages/commit/df9e4ec1377c2751f7c59f70fd3a94ae1e0506ec))\n</details>\n\n<details><summary>barretenberg: 0.75.0</summary>\n\n##\n[0.75.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.74.0...barretenberg-v0.75.0)\n(2025-02-06)\n\n\n### Features\n\n* K-shifts\n([#11663](https://github.com/AztecProtocol/aztec-packages/issues/11663))\n([511abe5](https://github.com/AztecProtocol/aztec-packages/commit/511abe50c77b91bfd0d29c209720663c33debc61))\n* Report wrong proof length in the verifier contract\n([#11728](https://github.com/AztecProtocol/aztec-packages/issues/11728))\n([1a83cd2](https://github.com/AztecProtocol/aztec-packages/commit/1a83cd26f7f8c4163d538f942677dcea7f2bc8dc))\n\n\n### Miscellaneous\n\n* **avm:** Add names to lookup settings\n([#11768](https://github.com/AztecProtocol/aztec-packages/issues/11768))\n([fafe3ba](https://github.com/AztecProtocol/aztec-packages/commit/fafe3bad6ceff1679ed1bd43ab29a1345cc22721))\n* **avm:** Full row cleanup\n([#11767](https://github.com/AztecProtocol/aztec-packages/issues/11767))\n([6145cd0](https://github.com/AztecProtocol/aztec-packages/commit/6145cd051a9fcabfd4c7ddcb5c7607390ef5f152))\n* **avm:** Use lookup by clk for sha params\n([#11762](https://github.com/AztecProtocol/aztec-packages/issues/11762))\n([b003567](https://github.com/AztecProtocol/aztec-packages/commit/b003567128c15c1064bd6bd831ebe1a4158ae66f))\n* Better bundling for bb.js, remove aztec.js bundling\n([#11761](https://github.com/AztecProtocol/aztec-packages/issues/11761))\n([8cc3f0a](https://github.com/AztecProtocol/aztec-packages/commit/8cc3f0a9f2753e942d7055f2ccddc96e6f4c7f94))\n* Remove stale zk constants and methods\n([#11715](https://github.com/AztecProtocol/aztec-packages/issues/11715))\n([7a2870f](https://github.com/AztecProtocol/aztec-packages/commit/7a2870f3684b198d5472ea4bdd7be5a84e812d93))\n</details>\n\n---\nThis PR was generated with [Release\nPlease](https://github.com/googleapis/release-please). See\n[documentation](https://github.com/googleapis/release-please#release-please).",
          "timestamp": "2025-02-06T11:31:55Z",
          "tree_id": "9198a0c1c8fb0d35db81122969b0c3a1c93884ed",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ff6875bab256bef0e92e06da45689a9086ae09c2"
        },
        "date": 1738842484225,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20293.17253399998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17523.969428 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21168.99298300001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18575.672824999998 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4487.737239000012,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4177.816374 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 79083.002251,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 79083003000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13346.922948000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13346924000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2809449835,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2809449835 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 142010775,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 142010775 ns\nthreads: 1"
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
          "id": "a6fcdb0f9b5b8f3eb12911148e3f2f75630643f5",
          "message": "chore: aggregate with short scalars in UH Recursion (#11478)\n\nTake advantage of short challenges to create less gates while\r\naggregating pairing points.\r\n\r\nFixed several short scalar issues and re-used\r\n`bn254_endo_batch_mul(...)` to define scalar mul operator in relevant\r\ncontexts.\r\n\r\n**UH Recursive Verifier finalized num gates**\r\n\r\nBefore:  866732\r\nAfter:  729534",
          "timestamp": "2025-02-06T17:19:05+01:00",
          "tree_id": "6a9f1b488bcdec06d9073197c907b5a633842e46",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a6fcdb0f9b5b8f3eb12911148e3f2f75630643f5"
        },
        "date": 1738860269723,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20142.254793000007,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17326.265416 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21185.782439000006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18536.450496999998 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4484.45029399997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4084.405895000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 78283.916045,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 78283916000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13365.554094,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13365622000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2697223508,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2697223508 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 143095998,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 143095998 ns\nthreads: 1"
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
          "id": "be382bc5ecf9bdea11ff26af104c8860472260d9",
          "message": "feat(avm): restrict bytecode bytes (#11798)\n\nAdded \"range check\".",
          "timestamp": "2025-02-07T10:53:05Z",
          "tree_id": "f020449c2326567e1d33bdd8f49d84ae5bc99f88",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/be382bc5ecf9bdea11ff26af104c8860472260d9"
        },
        "date": 1738926598571,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19150.442951,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16302.132906 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 20766.060745999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18438.789222 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4060.2140510000027,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3781.2978590000002 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 72747.636521,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 72747637000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14368.568916,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14368570000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2607070623,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2607070623 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 132828840,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 132828840 ns\nthreads: 1"
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
          "id": "67aec61665aa554527969c85fd6e7d23d9f41bf8",
          "message": "feat(avm): add skippable condition for interactions (#11800)\n\nVM1 sumcheck (16 threads) goes from `60s` to `40s`.",
          "timestamp": "2025-02-07T12:00:19Z",
          "tree_id": "c2565833387a55cbc1c13ef9c3071b56cc869f67",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/67aec61665aa554527969c85fd6e7d23d9f41bf8"
        },
        "date": 1738930624570,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19335.835640000027,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16491.369809 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 20986.69777599997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18768.384942 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4083.1567849999715,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3823.065538 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 73454.685001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 73454686000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14415.621036,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14415621000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2632830496,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2632830496 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 133888551,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 133888551 ns\nthreads: 1"
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
          "id": "ee5fc45d1347fd12d924efd4e9a2305ba5efe5b7",
          "message": "chore: do not differentiate variable vs fixed length for Poseidon2 (#11740)\n\nRemove the terminator for poseidon2 that was used to distinguish between\r\nfixed and variable size hashes.",
          "timestamp": "2025-02-07T13:01:24+01:00",
          "tree_id": "068effa569dc0859b9555229a5ad30262f7070b0",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ee5fc45d1347fd12d924efd4e9a2305ba5efe5b7"
        },
        "date": 1738933492063,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19133.344061000003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16294.236034999998 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 20800.562824999986,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18450.334303000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4068.7724550000157,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3788.0796119999995 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 73423.034237,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 73423034000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14375.265541000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14375267000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2803749417,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2803749417 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 141306638,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 141306638 ns\nthreads: 1"
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
          "id": "fde135d1ccbcfe90fae7e1eb8dcd940c5fdf7109",
          "message": "fix: tracy run (#11819)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this line.",
          "timestamp": "2025-02-07T17:58:20Z",
          "tree_id": "366e8f07a3bacae8e218d29be11df4f485ab8436",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/fde135d1ccbcfe90fae7e1eb8dcd940c5fdf7109"
        },
        "date": 1738952599698,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19523.38935200001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16651.113965999997 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21109.99458500001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18909.183525 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4095.8570629999826,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3832.003281 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 81559.367444,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 81559368000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14448.365395999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14448366000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2670668323,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2670668323 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 134857308,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 134857308 ns\nthreads: 1"
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
          "id": "8c1d4770d60d6d06014c0cd66aae63bd1560a8ff",
          "message": "fix: Add missing return in main (#11786)\n\nhttps://github.com/AztecProtocol/aztec-packages/pull/10217 introduced a\nbug where the verifier result would not be sent from bb main as a\nsignal. This triggers a mysterious error in the ivc-integration tests\nsuite, native only, but does not break any e2e tests. More investigation\nis necessary, and ultimately this should be resolved in the ACIR tests,\nbut it feels prudent now to fix the bug and reinstate the tests later.",
          "timestamp": "2025-02-07T18:52:42Z",
          "tree_id": "777abc0fc0a9b6a6a735b0a25dcb8ecf86214b9a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8c1d4770d60d6d06014c0cd66aae63bd1560a8ff"
        },
        "date": 1738955945167,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19056.493096999988,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16413.644007000003 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 20754.794586999993,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18324.37999 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4062.22329000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3794.907889 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 72476.85666300001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 72476857000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14365.453820999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14365454000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2617905823,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2617905823 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 132649934,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 132649934 ns\nthreads: 1"
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
          "id": "4a8136ce1249c4096d1fb906398b8a230b94d503",
          "message": "chore: simplify handling of pub inputs block (#11747)\n\nSimplifies handling of public inputs by populating `pub_inputs` block in\n`finalize_circuit()` which ensures that all blocks are complete prior to\nany prover work. Also improves some of the log info related to the\noverflow mechanism.\n\ncloses: https://github.com/AztecProtocol/barretenberg/issues/1220",
          "timestamp": "2025-02-08T09:32:47Z",
          "tree_id": "5549b9212bbaf6b1826f3d9cea8a5fbcec04a87e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/4a8136ce1249c4096d1fb906398b8a230b94d503"
        },
        "date": 1739008670819,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19191.684199999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16203.605638000003 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 20857.936020000012,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18554.380913 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4079.7445510000043,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3809.735145 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 81062.11368,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 81062114000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14469.131455,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14469131000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2758758681,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2758758681 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 133117939,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 133117939 ns\nthreads: 1"
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
          "id": "ce6a5bf716b970c1ab086dc2babe7b4d3e5912aa",
          "message": "feat(avm): range check opt via aliases (#11846)\n\nTests are passing but please check.",
          "timestamp": "2025-02-10T09:50:31Z",
          "tree_id": "889e420c74d3fb926623d343265e26c40cb7d172",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ce6a5bf716b970c1ab086dc2babe7b4d3e5912aa"
        },
        "date": 1739182547309,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20161.87518100003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17363.873584 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21187.49944199999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18530.08247 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4458.2611580000275,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4035.667441 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 72112.750046,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 72112749000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13363.710348999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13363712000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2717317964,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2717317964 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 149128120,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 149128120 ns\nthreads: 1"
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
          "id": "432e38823168aa9206c2a254010492bbfbae2448",
          "message": "chore(master): Release 0.76.0",
          "timestamp": "2025-02-10T17:22:10Z",
          "url": "https://github.com/AztecProtocol/aztec-packages/pull/11781/commits/432e38823168aa9206c2a254010492bbfbae2448"
        },
        "date": 1739208950714,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19128.64016399999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16276.199204999997 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 20816.49784000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18458.662126 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4056.7181119999987,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3779.835189 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 73446.37220900001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 73446372000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14444.720096000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14444722000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2696854407,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2696854407 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 132843955,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 132843955 ns\nthreads: 1"
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
          "id": "59b229a21b1352f12488b9e9c27afc17769cf8cf",
          "message": "chore(master): Release 0.76.0 (#11781)\n\n:robot: I have created a release *beep* *boop*\n---\n\n\n<details><summary>aztec-package: 0.76.0</summary>\n\n##\n[0.76.0](https://github.com/AztecProtocol/aztec-packages/compare/aztec-package-v0.75.0...aztec-package-v0.76.0)\n(2025-02-10)\n\n\n### Features\n\n* **spartan:** Blob sink in spartan\n([#11307](https://github.com/AztecProtocol/aztec-packages/issues/11307))\n([d8e5bcc](https://github.com/AztecProtocol/aztec-packages/commit/d8e5bccfe674b4abfa6b645af4d62de976e7bf13))\n\n\n### Miscellaneous\n\n* Check versioning\n([#11611](https://github.com/AztecProtocol/aztec-packages/issues/11611))\n([b33f1da](https://github.com/AztecProtocol/aztec-packages/commit/b33f1da9438672766ae8e266b2aa3bf7b5a8964f))\n* **p2p:** Remove min peers option\n([#11789](https://github.com/AztecProtocol/aztec-packages/issues/11789))\n([cfb6797](https://github.com/AztecProtocol/aztec-packages/commit/cfb6797ec91a24052498236221372a607d7299be))\n</details>\n\n<details><summary>barretenberg.js: 0.76.0</summary>\n\n##\n[0.76.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg.js-v0.75.0...barretenberg.js-v0.76.0)\n(2025-02-10)\n\n\n### Bug Fixes\n\n* **bb.js:** Make wasm imports bundleable\n([#11812](https://github.com/AztecProtocol/aztec-packages/issues/11812))\n([1af69a9](https://github.com/AztecProtocol/aztec-packages/commit/1af69a973ae878a38b7e6b81422fe7671e67d9e5))\n* Remove unnecessary console.log\n([#11810](https://github.com/AztecProtocol/aztec-packages/issues/11810))\n([8a320bf](https://github.com/AztecProtocol/aztec-packages/commit/8a320bf69502662ca9403bd294e633b2d45a7869))\n</details>\n\n<details><summary>aztec-packages: 0.76.0</summary>\n\n##\n[0.76.0](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.75.0...aztec-packages-v0.76.0)\n(2025-02-10)\n\n\n### ⚠ BREAKING CHANGES\n\n* check abi integer input is within signed range\n(https://github.com/noir-lang/noir/pull/7316)\n* using `WithHash<T>` in `SharedMutable` + fixing slot allocation\n([#11716](https://github.com/AztecProtocol/aztec-packages/issues/11716))\n\n### Features\n\n* `assert` and `assert_eq` are now expressions\n(https://github.com/noir-lang/noir/pull/7313)\n([b883911](https://github.com/AztecProtocol/aztec-packages/commit/b8839114363fa7d026eea3f461b1c9a37ecaebe6))\n* `assert` and `assert_eq` are now expressions\n(https://github.com/noir-lang/noir/pull/7313)\n([3840e8e](https://github.com/AztecProtocol/aztec-packages/commit/3840e8e01c12656229651baaae120858b1c99911))\n* **avm:** Add skippable condition for interactions\n([#11800](https://github.com/AztecProtocol/aztec-packages/issues/11800))\n([67aec61](https://github.com/AztecProtocol/aztec-packages/commit/67aec61665aa554527969c85fd6e7d23d9f41bf8))\n* **avm:** Range check opt via aliases\n([#11846](https://github.com/AztecProtocol/aztec-packages/issues/11846))\n([ce6a5bf](https://github.com/AztecProtocol/aztec-packages/commit/ce6a5bf716b970c1ab086dc2babe7b4d3e5912aa))\n* **avm:** Restrict bytecode bytes\n([#11798](https://github.com/AztecProtocol/aztec-packages/issues/11798))\n([be382bc](https://github.com/AztecProtocol/aztec-packages/commit/be382bc5ecf9bdea11ff26af104c8860472260d9))\n* **aztec-nr:** Do not compile functions with a private public macro and\nunconstrained\n([#11815](https://github.com/AztecProtocol/aztec-packages/issues/11815))\n([afb52e3](https://github.com/AztecProtocol/aztec-packages/commit/afb52e3fca2307427a0e1c2e9fc5257f63d2b337))\n* **blob-lib:** Make blob lib and fix encoding test flake\n([#11782](https://github.com/AztecProtocol/aztec-packages/issues/11782))\n([753f505](https://github.com/AztecProtocol/aztec-packages/commit/753f50578786ec409e99b753160a3c59a34d31bd))\n* Broker sends back job after accepting result\n([#11754](https://github.com/AztecProtocol/aztec-packages/issues/11754))\n([62e5de7](https://github.com/AztecProtocol/aztec-packages/commit/62e5de77736791bb2c8c5c93a62435444acac2d5))\n* **docs:** Notes page\n([#11746](https://github.com/AztecProtocol/aztec-packages/issues/11746))\n([117200e](https://github.com/AztecProtocol/aztec-packages/commit/117200ed464ee1588d5c79ae66bafe3f56cdb350))\n* **docs:** Reindex typesense in CI\n([#11791](https://github.com/AztecProtocol/aztec-packages/issues/11791))\n([6af8d54](https://github.com/AztecProtocol/aztec-packages/commit/6af8d5467cd52a3f96316b1312fade5304ad0016))\n* Infer lambda parameter types from return type and let type\n(https://github.com/noir-lang/noir/pull/7267)\n([b883911](https://github.com/AztecProtocol/aztec-packages/commit/b8839114363fa7d026eea3f461b1c9a37ecaebe6))\n* Infer lambda parameter types from return type and let type\n(https://github.com/noir-lang/noir/pull/7267)\n([3840e8e](https://github.com/AztecProtocol/aztec-packages/commit/3840e8e01c12656229651baaae120858b1c99911))\n* Optimizing contract with config pattern\n([#11756](https://github.com/AztecProtocol/aztec-packages/issues/11756))\n([7820cb7](https://github.com/AztecProtocol/aztec-packages/commit/7820cb7b373370f16fed249beed07809da6998cc))\n* **p2p:** Test bench scaffold\n([#11758](https://github.com/AztecProtocol/aztec-packages/issues/11758))\n([48dc491](https://github.com/AztecProtocol/aztec-packages/commit/48dc491dc61d634210817ff042149b8f10e699e5))\n* Partial note handling in aztec-nr\n([#11641](https://github.com/AztecProtocol/aztec-packages/issues/11641))\n([1c1a33b](https://github.com/AztecProtocol/aztec-packages/commit/1c1a33b3dde41f08f64f8d0800d1d9427b2e00fa))\n* **perf:** Speed up TS AVM core simulator\n([#11794](https://github.com/AztecProtocol/aztec-packages/issues/11794))\n([bb58c87](https://github.com/AztecProtocol/aztec-packages/commit/bb58c87661e16d35d100cd0b2644f9e3c8230619))\n* **reqresp:** Send status messages along with reqresp responses\n([#11727](https://github.com/AztecProtocol/aztec-packages/issues/11727))\n([b212490](https://github.com/AztecProtocol/aztec-packages/commit/b212490adbaeead2d035b1533cddcd4ec59f81e5))\n* Simplify `Ord` implementation for arrays\n(https://github.com/noir-lang/noir/pull/7305)\n([b883911](https://github.com/AztecProtocol/aztec-packages/commit/b8839114363fa7d026eea3f461b1c9a37ecaebe6))\n* Simplify `Ord` implementation for arrays\n(https://github.com/noir-lang/noir/pull/7305)\n([3840e8e](https://github.com/AztecProtocol/aztec-packages/commit/3840e8e01c12656229651baaae120858b1c99911))\n* **spartan:** Blob sink in spartan\n([#11307](https://github.com/AztecProtocol/aztec-packages/issues/11307))\n([d8e5bcc](https://github.com/AztecProtocol/aztec-packages/commit/d8e5bccfe674b4abfa6b645af4d62de976e7bf13))\n* Suport deploying contracts with public keys in txe\n([#11882](https://github.com/AztecProtocol/aztec-packages/issues/11882))\n([94bdc85](https://github.com/AztecProtocol/aztec-packages/commit/94bdc856071f6bde93614e4de7d6c370dc45eee3)),\ncloses\n[#11881](https://github.com/AztecProtocol/aztec-packages/issues/11881)\n* Sync from aztec-packages (https://github.com/noir-lang/noir/pull/7293)\n([b883911](https://github.com/AztecProtocol/aztec-packages/commit/b8839114363fa7d026eea3f461b1c9a37ecaebe6))\n* Sync from aztec-packages (https://github.com/noir-lang/noir/pull/7293)\n([3840e8e](https://github.com/AztecProtocol/aztec-packages/commit/3840e8e01c12656229651baaae120858b1c99911))\n* Trust tree roots from the AVM in public base\n([#11823](https://github.com/AztecProtocol/aztec-packages/issues/11823))\n([5d12f94](https://github.com/AztecProtocol/aztec-packages/commit/5d12f9446ad868a825874c0db947bf165153960a))\n* Using `WithHash&lt;T&gt;` in `SharedMutable` + fixing slot allocation\n([#11716](https://github.com/AztecProtocol/aztec-packages/issues/11716))\n([952615b](https://github.com/AztecProtocol/aztec-packages/commit/952615bed1be4f0c8d382f4ed83bf12c34c6799a))\n\n\n### Bug Fixes\n\n* Add missing return in main\n([#11786](https://github.com/AztecProtocol/aztec-packages/issues/11786))\n([8c1d477](https://github.com/AztecProtocol/aztec-packages/commit/8c1d4770d60d6d06014c0cd66aae63bd1560a8ff))\n* Allows for infinite brillig loops\n(https://github.com/noir-lang/noir/pull/7296)\n([b883911](https://github.com/AztecProtocol/aztec-packages/commit/b8839114363fa7d026eea3f461b1c9a37ecaebe6))\n* Always normalize ssa when priting at least one pass\n(https://github.com/noir-lang/noir/pull/7299)\n([b883911](https://github.com/AztecProtocol/aztec-packages/commit/b8839114363fa7d026eea3f461b1c9a37ecaebe6))\n* Always normalize ssa when priting at least one pass\n(https://github.com/noir-lang/noir/pull/7299)\n([3840e8e](https://github.com/AztecProtocol/aztec-packages/commit/3840e8e01c12656229651baaae120858b1c99911))\n* Avoid recomputing contractclassid\n([#11783](https://github.com/AztecProtocol/aztec-packages/issues/11783))\n([f8448bf](https://github.com/AztecProtocol/aztec-packages/commit/f8448bfb9d2353116e270c22449d1d1960adf683))\n* Avoid stack overflow on many comments in a row\n(https://github.com/noir-lang/noir/pull/7325)\n([b883911](https://github.com/AztecProtocol/aztec-packages/commit/b8839114363fa7d026eea3f461b1c9a37ecaebe6))\n* Aztec wallet partial address display on deployment\n([#11866](https://github.com/AztecProtocol/aztec-packages/issues/11866))\n([eef5302](https://github.com/AztecProtocol/aztec-packages/commit/eef5302376586a26eb76082ec8f661ba8bdab82a)),\ncloses\n[#11864](https://github.com/AztecProtocol/aztec-packages/issues/11864)\n* **bb.js:** Make wasm imports bundleable\n([#11812](https://github.com/AztecProtocol/aztec-packages/issues/11812))\n([1af69a9](https://github.com/AztecProtocol/aztec-packages/commit/1af69a973ae878a38b7e6b81422fe7671e67d9e5))\n* Beacon chain doesn't eat mainframe\n([#11854](https://github.com/AztecProtocol/aztec-packages/issues/11854))\n([ebbdbc7](https://github.com/AztecProtocol/aztec-packages/commit/ebbdbc794607caf495b36c71bef5a51bd8e10f3b))\n* Check abi integer input is within signed range\n(https://github.com/noir-lang/noir/pull/7316)\n([b883911](https://github.com/AztecProtocol/aztec-packages/commit/b8839114363fa7d026eea3f461b1c9a37ecaebe6))\n* **ci:** Enforce boxes-test on merge\n([#11841](https://github.com/AztecProtocol/aztec-packages/issues/11841))\n([e26a288](https://github.com/AztecProtocol/aztec-packages/commit/e26a2884f3c9ebd4d9d0731da7afc5c41e02f3d1))\n* Downgrade to mainframe-compatible KIND\n([#11883](https://github.com/AztecProtocol/aztec-packages/issues/11883))\n([9239b4f](https://github.com/AztecProtocol/aztec-packages/commit/9239b4f36ac293cf528b3a84bab9da850f1d586c))\n* Error on if without else when type mismatch\n(https://github.com/noir-lang/noir/pull/7302)\n([b883911](https://github.com/AztecProtocol/aztec-packages/commit/b8839114363fa7d026eea3f461b1c9a37ecaebe6))\n* Error on if without else when type mismatch\n(https://github.com/noir-lang/noir/pull/7302)\n([3840e8e](https://github.com/AztecProtocol/aztec-packages/commit/3840e8e01c12656229651baaae120858b1c99911))\n* Error on trailing doc comment\n(https://github.com/noir-lang/noir/pull/7300)\n([b883911](https://github.com/AztecProtocol/aztec-packages/commit/b8839114363fa7d026eea3f461b1c9a37ecaebe6))\n* Error on trailing doc comment\n(https://github.com/noir-lang/noir/pull/7300)\n([3840e8e](https://github.com/AztecProtocol/aztec-packages/commit/3840e8e01c12656229651baaae120858b1c99911))\n* Formatting in master\n([#11879](https://github.com/AztecProtocol/aztec-packages/issues/11879))\n([fff0f04](https://github.com/AztecProtocol/aztec-packages/commit/fff0f04e69535f2918c65deba53c5227651d5467))\n* Mark field division and modulo as requiring predicate for all\nnecessary types (https://github.com/noir-lang/noir/pull/7290)\n([b883911](https://github.com/AztecProtocol/aztec-packages/commit/b8839114363fa7d026eea3f461b1c9a37ecaebe6))\n* Mark field division and modulo as requiring predicate for all\nnecessary types (https://github.com/noir-lang/noir/pull/7290)\n([3840e8e](https://github.com/AztecProtocol/aztec-packages/commit/3840e8e01c12656229651baaae120858b1c99911))\n* Playground use new unbundled aztec.js\n([#11780](https://github.com/AztecProtocol/aztec-packages/issues/11780))\n([fe2b666](https://github.com/AztecProtocol/aztec-packages/commit/fe2b6665032be665c3a3bdf416adf81b17c0643f))\n* Prover-client test\n([#11853](https://github.com/AztecProtocol/aztec-packages/issues/11853))\n([e950c76](https://github.com/AztecProtocol/aztec-packages/commit/e950c760a6760ce02aeb9bb99b644dd68fba34fb))\n* Publish telemetry-client\n([#11777](https://github.com/AztecProtocol/aztec-packages/issues/11777))\n([8634f6e](https://github.com/AztecProtocol/aztec-packages/commit/8634f6e8108296ecb8499435ff6c54949abb9407))\n* Pxe release\n([#11877](https://github.com/AztecProtocol/aztec-packages/issues/11877))\n([4c0d2f2](https://github.com/AztecProtocol/aztec-packages/commit/4c0d2f2d25fe7752158e94c88a648435f63d01f8))\n* Re exposing intent inner hash\n([#11865](https://github.com/AztecProtocol/aztec-packages/issues/11865))\n([9638792](https://github.com/AztecProtocol/aztec-packages/commit/96387929e8fa0d365ea65e2280dda5247f8ecfdb)),\ncloses\n[#11795](https://github.com/AztecProtocol/aztec-packages/issues/11795)\n* Remove unnecessary console.log\n([#11810](https://github.com/AztecProtocol/aztec-packages/issues/11810))\n([8a320bf](https://github.com/AztecProtocol/aztec-packages/commit/8a320bf69502662ca9403bd294e633b2d45a7869))\n* Revert \"feat: partial note handling in aztec-nr\n([#11641](https://github.com/AztecProtocol/aztec-packages/issues/11641))\"\n([#11797](https://github.com/AztecProtocol/aztec-packages/issues/11797))\n([c5c3f09](https://github.com/AztecProtocol/aztec-packages/commit/c5c3f096d8a85b4a9259b24a61867c73ef0cba4a))\n* Skip orchestrator_workflow test (see\n[#11870](https://github.com/AztecProtocol/aztec-packages/issues/11870))\n([#11872](https://github.com/AztecProtocol/aztec-packages/issues/11872))\n([f8e7e4e](https://github.com/AztecProtocol/aztec-packages/commit/f8e7e4e888729a458963f80a35defd8dffa6f4a5))\n* Skip vite browser test until\n[#11874](https://github.com/AztecProtocol/aztec-packages/issues/11874)\n([#11876](https://github.com/AztecProtocol/aztec-packages/issues/11876))\n([e1adf23](https://github.com/AztecProtocol/aztec-packages/commit/e1adf23ac681f8ae0f82900ec397f2236abe547a))\n* **ssa:** Unused functions removals post folding constant Brillig calls\n(https://github.com/noir-lang/noir/pull/7265)\n([b883911](https://github.com/AztecProtocol/aztec-packages/commit/b8839114363fa7d026eea3f461b1c9a37ecaebe6))\n* **ssa:** Unused functions removals post folding constant Brillig calls\n(https://github.com/noir-lang/noir/pull/7265)\n([3840e8e](https://github.com/AztecProtocol/aztec-packages/commit/3840e8e01c12656229651baaae120858b1c99911))\n* Tracy run\n([#11819](https://github.com/AztecProtocol/aztec-packages/issues/11819))\n([fde135d](https://github.com/AztecProtocol/aztec-packages/commit/fde135d1ccbcfe90fae7e1eb8dcd940c5fdf7109))\n* Txe block headers\n([#11710](https://github.com/AztecProtocol/aztec-packages/issues/11710))\n([4f6b76f](https://github.com/AztecProtocol/aztec-packages/commit/4f6b76f2a19808b3786bf7a7dee96a126c770d69))\n\n\n### Miscellaneous\n\n* Add sha256 library to test suite\n(https://github.com/noir-lang/noir/pull/7278)\n([b883911](https://github.com/AztecProtocol/aztec-packages/commit/b8839114363fa7d026eea3f461b1c9a37ecaebe6))\n* Add sha256 library to test suite\n(https://github.com/noir-lang/noir/pull/7278)\n([3840e8e](https://github.com/AztecProtocol/aztec-packages/commit/3840e8e01c12656229651baaae120858b1c99911))\n* Add timeouts to reports CI\n(https://github.com/noir-lang/noir/pull/7317)\n([b883911](https://github.com/AztecProtocol/aztec-packages/commit/b8839114363fa7d026eea3f461b1c9a37ecaebe6))\n* Aggregate with short scalars in UH Recursion\n([#11478](https://github.com/AztecProtocol/aztec-packages/issues/11478))\n([a6fcdb0](https://github.com/AztecProtocol/aztec-packages/commit/a6fcdb0f9b5b8f3eb12911148e3f2f75630643f5))\n* **avm:** Remove some parentheses in codegen relations\n([#11766](https://github.com/AztecProtocol/aztec-packages/issues/11766))\n([f2f2634](https://github.com/AztecProtocol/aztec-packages/commit/f2f2634d2ad46f900799c478fae52d5cac33516a))\n* Bump noir_bigcurve timeout\n(https://github.com/noir-lang/noir/pull/7322)\n([b883911](https://github.com/AztecProtocol/aztec-packages/commit/b8839114363fa7d026eea3f461b1c9a37ecaebe6))\n* Check versioning\n([#11611](https://github.com/AztecProtocol/aztec-packages/issues/11611))\n([b33f1da](https://github.com/AztecProtocol/aztec-packages/commit/b33f1da9438672766ae8e266b2aa3bf7b5a8964f))\n* Cleanup in AVM test fixture\n([#11850](https://github.com/AztecProtocol/aztec-packages/issues/11850))\n([4526059](https://github.com/AztecProtocol/aztec-packages/commit/4526059c7d00ade78b118359f6b760dd263c61f9))\n* Create a CI action to download nargo and add to path\n(https://github.com/noir-lang/noir/pull/7281)\n([b883911](https://github.com/AztecProtocol/aztec-packages/commit/b8839114363fa7d026eea3f461b1c9a37ecaebe6))\n* Create a CI action to download nargo and add to path\n(https://github.com/noir-lang/noir/pull/7281)\n([3840e8e](https://github.com/AztecProtocol/aztec-packages/commit/3840e8e01c12656229651baaae120858b1c99911))\n* Disable exp-2 from nightly deployments\n([#11880](https://github.com/AztecProtocol/aztec-packages/issues/11880))\n([bc42b60](https://github.com/AztecProtocol/aztec-packages/commit/bc42b6045df70c661765b2d36fac96aeeeda2ad0))\n* Do not differentiate variable vs fixed length for Poseidon2\n([#11740](https://github.com/AztecProtocol/aztec-packages/issues/11740))\n([ee5fc45](https://github.com/AztecProtocol/aztec-packages/commit/ee5fc45d1347fd12d924efd4e9a2305ba5efe5b7))\n* Fix memory reports in CI (https://github.com/noir-lang/noir/pull/7311)\n([b883911](https://github.com/AztecProtocol/aztec-packages/commit/b8839114363fa7d026eea3f461b1c9a37ecaebe6))\n* Fix memory reports in CI (https://github.com/noir-lang/noir/pull/7311)\n([3840e8e](https://github.com/AztecProtocol/aztec-packages/commit/3840e8e01c12656229651baaae120858b1c99911))\n* **p2p:** Remove min peers option\n([#11789](https://github.com/AztecProtocol/aztec-packages/issues/11789))\n([cfb6797](https://github.com/AztecProtocol/aztec-packages/commit/cfb6797ec91a24052498236221372a607d7299be))\n* Push inlining info code into a submodule\n(https://github.com/noir-lang/noir/pull/7266)\n([b883911](https://github.com/AztecProtocol/aztec-packages/commit/b8839114363fa7d026eea3f461b1c9a37ecaebe6))\n* Push inlining info code into a submodule\n(https://github.com/noir-lang/noir/pull/7266)\n([3840e8e](https://github.com/AztecProtocol/aztec-packages/commit/3840e8e01c12656229651baaae120858b1c99911))\n* Reduce number of benchmarking scripts\n(https://github.com/noir-lang/noir/pull/7285)\n([b883911](https://github.com/AztecProtocol/aztec-packages/commit/b8839114363fa7d026eea3f461b1c9a37ecaebe6))\n* Reduce number of benchmarking scripts\n(https://github.com/noir-lang/noir/pull/7285)\n([3840e8e](https://github.com/AztecProtocol/aztec-packages/commit/3840e8e01c12656229651baaae120858b1c99911))\n* Remove dead code\n([#11809](https://github.com/AztecProtocol/aztec-packages/issues/11809))\n([51ad298](https://github.com/AztecProtocol/aztec-packages/commit/51ad298a0ca16e24d21a73f675f7ee3ca02aaae6))\n* Remove Recoverable (https://github.com/noir-lang/noir/pull/7307)\n([b883911](https://github.com/AztecProtocol/aztec-packages/commit/b8839114363fa7d026eea3f461b1c9a37ecaebe6))\n* Remove Recoverable (https://github.com/noir-lang/noir/pull/7307)\n([3840e8e](https://github.com/AztecProtocol/aztec-packages/commit/3840e8e01c12656229651baaae120858b1c99911))\n* Replace benchmarks on fast test suites with a cut-off\n(https://github.com/noir-lang/noir/pull/7276)\n([b883911](https://github.com/AztecProtocol/aztec-packages/commit/b8839114363fa7d026eea3f461b1c9a37ecaebe6))\n* Replace benchmarks on fast test suites with a cut-off\n(https://github.com/noir-lang/noir/pull/7276)\n([3840e8e](https://github.com/AztecProtocol/aztec-packages/commit/3840e8e01c12656229651baaae120858b1c99911))\n* Replace relative paths to noir-protocol-circuits\n([330f613](https://github.com/AztecProtocol/aztec-packages/commit/330f613a930c49dd8791eef118564e67c387d84d))\n* Replace relative paths to noir-protocol-circuits\n([501ec66](https://github.com/AztecProtocol/aztec-packages/commit/501ec66f282a2f3f4d3c00abadcbc9b613e8c1cb))\n* Replace relative paths to noir-protocol-circuits\n([3fa986a](https://github.com/AztecProtocol/aztec-packages/commit/3fa986a3b80ea31f5d3d63b1f02e80d340a18def))\n* Sepolia mnemonic, e2e & ignition chain\n([#11759](https://github.com/AztecProtocol/aztec-packages/issues/11759))\n([ff1536a](https://github.com/AztecProtocol/aztec-packages/commit/ff1536a3b90be2ac0f1f2b4cf06eda0bd8b47d4e))\n* Simplify handling of pub inputs block\n([#11747](https://github.com/AztecProtocol/aztec-packages/issues/11747))\n([4a8136c](https://github.com/AztecProtocol/aztec-packages/commit/4a8136ce1249c4096d1fb906398b8a230b94d503))\n* **spartan:** Give services label names\n([#11609](https://github.com/AztecProtocol/aztec-packages/issues/11609))\n([2da39df](https://github.com/AztecProtocol/aztec-packages/commit/2da39df45d6e1862024cd6a609867d6beb9beeb9))\n* **spartan:** Update ethereum external host values\n([#11590](https://github.com/AztecProtocol/aztec-packages/issues/11590))\n([f17a8f3](https://github.com/AztecProtocol/aztec-packages/commit/f17a8f3c5c921b5f254a293c1a1bbaa4d74fb4a2))\n* Update migration_notes.md\n([#11801](https://github.com/AztecProtocol/aztec-packages/issues/11801))\n([baa69a2](https://github.com/AztecProtocol/aztec-packages/commit/baa69a27adbddb6be4c1239303157444eee2fa33))\n\n\n### Documentation\n\n* Some blob docs\n([#11729](https://github.com/AztecProtocol/aztec-packages/issues/11729))\n([b1d65f1](https://github.com/AztecProtocol/aztec-packages/commit/b1d65f120f3d477d52cabd5660e13ec46dd456c0))\n</details>\n\n<details><summary>barretenberg: 0.76.0</summary>\n\n##\n[0.76.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.75.0...barretenberg-v0.76.0)\n(2025-02-10)\n\n\n### Features\n\n* **avm:** Add skippable condition for interactions\n([#11800](https://github.com/AztecProtocol/aztec-packages/issues/11800))\n([67aec61](https://github.com/AztecProtocol/aztec-packages/commit/67aec61665aa554527969c85fd6e7d23d9f41bf8))\n* **avm:** Range check opt via aliases\n([#11846](https://github.com/AztecProtocol/aztec-packages/issues/11846))\n([ce6a5bf](https://github.com/AztecProtocol/aztec-packages/commit/ce6a5bf716b970c1ab086dc2babe7b4d3e5912aa))\n* **avm:** Restrict bytecode bytes\n([#11798](https://github.com/AztecProtocol/aztec-packages/issues/11798))\n([be382bc](https://github.com/AztecProtocol/aztec-packages/commit/be382bc5ecf9bdea11ff26af104c8860472260d9))\n\n\n### Bug Fixes\n\n* Add missing return in main\n([#11786](https://github.com/AztecProtocol/aztec-packages/issues/11786))\n([8c1d477](https://github.com/AztecProtocol/aztec-packages/commit/8c1d4770d60d6d06014c0cd66aae63bd1560a8ff))\n* Tracy run\n([#11819](https://github.com/AztecProtocol/aztec-packages/issues/11819))\n([fde135d](https://github.com/AztecProtocol/aztec-packages/commit/fde135d1ccbcfe90fae7e1eb8dcd940c5fdf7109))\n\n\n### Miscellaneous\n\n* Aggregate with short scalars in UH Recursion\n([#11478](https://github.com/AztecProtocol/aztec-packages/issues/11478))\n([a6fcdb0](https://github.com/AztecProtocol/aztec-packages/commit/a6fcdb0f9b5b8f3eb12911148e3f2f75630643f5))\n* **avm:** Remove some parentheses in codegen relations\n([#11766](https://github.com/AztecProtocol/aztec-packages/issues/11766))\n([f2f2634](https://github.com/AztecProtocol/aztec-packages/commit/f2f2634d2ad46f900799c478fae52d5cac33516a))\n* Do not differentiate variable vs fixed length for Poseidon2\n([#11740](https://github.com/AztecProtocol/aztec-packages/issues/11740))\n([ee5fc45](https://github.com/AztecProtocol/aztec-packages/commit/ee5fc45d1347fd12d924efd4e9a2305ba5efe5b7))\n* Simplify handling of pub inputs block\n([#11747](https://github.com/AztecProtocol/aztec-packages/issues/11747))\n([4a8136c](https://github.com/AztecProtocol/aztec-packages/commit/4a8136ce1249c4096d1fb906398b8a230b94d503))\n</details>\n\n---\nThis PR was generated with [Release\nPlease](https://github.com/googleapis/release-please). See\n[documentation](https://github.com/googleapis/release-please#release-please).",
          "timestamp": "2025-02-10T17:22:03Z",
          "tree_id": "9d71d676eeb3d75aae6b872556e0bcb54706e647",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/59b229a21b1352f12488b9e9c27afc17769cf8cf"
        },
        "date": 1739209134789,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20353.483244000017,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17642.492496 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21325.096392000036,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18898.451396999997 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4505.409237999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4150.420864 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 71352.47442,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 71352474000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13416.740098,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13416741000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2807979571,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2807979571 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 142279960,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 142279960 ns\nthreads: 1"
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
          "id": "0018aeea8f0d0517ae22943cc26174f083edbc83",
          "message": "chore(master): Release 0.76.1",
          "timestamp": "2025-02-10T21:23:10Z",
          "url": "https://github.com/AztecProtocol/aztec-packages/pull/11892/commits/0018aeea8f0d0517ae22943cc26174f083edbc83"
        },
        "date": 1739223134761,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19220.64168000003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16385.64404 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 20964.957631999994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18457.086292 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4085.829877000009,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3811.3746010000004 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 73950.682805,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 73950683000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14454.106606000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14454108000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2809088930,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2809088930 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 134413115,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 134413115 ns\nthreads: 1"
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
          "id": "41464968895be2ae0bfc9a0a554a3b6824252fd4",
          "message": "fix: smt_verification: negative bitvecs, changed gates indicies. acir_formal_proofs: noir-style signed division (#11649)\n\nThis pr fixes two issues in smt_verification and adds one feautre to\r\nacir_formal_proofs\r\n1) Previously negative values bitvectors were not parsed properly. \r\n2) Indices of selectors changed in ultra\r\n\r\nfor acir_formal_proofs added noir-style signed division, where first bit\r\nof number is sign of the number",
          "timestamp": "2025-02-11T12:35:00Z",
          "tree_id": "f622573a912af7b1cd93a2c200086a5df5b2ab3c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/41464968895be2ae0bfc9a0a554a3b6824252fd4"
        },
        "date": 1739278298601,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19307.43151300004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16548.249767999998 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21099.177618999987,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18681.175658 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4203.424982999991,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3892.061372 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 85223.40698300001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 85223407000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14614.901879000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14614903000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3288873337,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3288873337 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 193111592,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 193111592 ns\nthreads: 1"
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
          "id": "1afddbd0712ad268bcc82931cf91bbb067766cbe",
          "message": "chore: fixing the sizes of VMs in CIVC (#11793)\n\nThe sizes of Translator and ECCVM circuits leak the amount of circuits\r\nthat have been folded, so we need to fix them.\r\n\r\n`benchmark_client_ivc` after fixing the sizes (note that regression is\r\nexpected, as the IPA prover is opening a dense polynomial of size 2^16\r\ninstead of 2^15 + there is not much skipping in Sumcheck except for\r\n`SetRelation`)\r\n\r\n\r\nECCVMProver(CircuitBuilder&)(t)          190     0.87%\r\nECCVMProver::construct_proof(t)         2405    10.95%\r\nTranslatorProver::construct_proof(t)    1316     5.99%\r\nGoblin::merge(t)                         132     0.60%\r\n\r\nTotal time accounted for: 21963ms/23040ms = 95.32%\r\n\r\nBenchmark on master: \r\n\r\nECCVMProver(CircuitBuilder&)(t)          182     0.85%\r\nECCVMProver::construct_proof(t)         1612     7.51%\r\nTranslatorProver::construct_proof(t)    1650     7.69%\r\nGoblin::merge(t)                         132     0.62%\r\n\r\nTotal time accounted for: 21468ms/22538ms = 95.25%",
          "timestamp": "2025-02-11T17:26:02+01:00",
          "tree_id": "e4843487e245056ccf8cff6b72f4d6e72c7f58d0",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1afddbd0712ad268bcc82931cf91bbb067766cbe"
        },
        "date": 1739292201814,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19856.797536999977,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16879.032606000004 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21577.03428499997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19280.203897 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4114.1195190000135,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3826.327591 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 76174.251606,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 76174252000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14534.181616,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14534181000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2451532625,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2451532625 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 145144702,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 145144702 ns\nthreads: 1"
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
          "id": "f289b7c038d399c30e17bc27a620860792416b9f",
          "message": "fix: note hash collision (#11869)",
          "timestamp": "2025-02-11T18:08:20+01:00",
          "tree_id": "ffd2fca1f39926665e7c11893fa590b6cd59c8ad",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f289b7c038d399c30e17bc27a620860792416b9f"
        },
        "date": 1739295265603,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19734.732105999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16960.782137 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21406.52425600001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19052.794002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4091.795978000022,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3823.214942 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 84893.725617,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 84893726000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14500.653787000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14500655000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2996011845,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2996011845 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 160620827,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 160620827 ns\nthreads: 1"
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
          "id": "a8ac29a928e0b2adc4869910bce619bd4d94b790",
          "message": "chore(master): Release 0.76.2",
          "timestamp": "2025-02-11T19:37:20Z",
          "url": "https://github.com/AztecProtocol/aztec-packages/pull/11899/commits/a8ac29a928e0b2adc4869910bce619bd4d94b790"
        },
        "date": 1739303208647,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20791.08052700002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17938.2537 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21755.94765699998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19199.369129000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4554.299880000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4240.097318 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 76077.708293,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 76077709000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13421.299729,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13421300000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3026079182,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3026079182 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 170960694,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 170960694 ns\nthreads: 1"
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
          "id": "b4e2264a9a7df027f5266f1f88b014bd72af76f0",
          "message": "fix: memory fragmentation fixes to cut UltraHonk memory usage by 26% (#11895)\n\nprove_ultra_honk on the verify_honk_proof circuit goes from 3059.63MiB\r\nto 2251.31MiB, a decrease of 26%. This gets us close to the memory\r\nreported by tracy, 2081MiB, which doesn't account for any fragmentation\r\nissues.\r\n\r\nThe fix hinges on a couple key issues: we want to deallocate large\r\nobjects when we don't need them anymore and we need to be careful with\r\nour vector usage.\r\n\r\nFirst, we should deallocate the builder after the prover is constructed\r\nand before we call construct_proof, and we should also deallocate the\r\ncommitment_key during sumcheck since we do not need to commit to any\r\npolynomials during that phase.\r\n\r\nSecond, this deallocation of the commitment key does not actually help\r\nmemory that much, in large part due to fragmentation. I discovered that\r\nour usage of the manifest, which uses vectors for each round data,\r\ncaused tiny vectors to be littered across memory, often breaking up what\r\notherwise would be a large contiguous block of memory.\r\n\r\nWith this in mind, we now only use the prover manifest when we specify\r\nthat we want the manifest specifically, i.e. for the manifest tests. The\r\nnative and recursive verifier manifests will be enabled for now.",
          "timestamp": "2025-02-12T02:54:48Z",
          "tree_id": "48e7ad322d9d4e1d704879a4022e01b374809e91",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/b4e2264a9a7df027f5266f1f88b014bd72af76f0"
        },
        "date": 1739329891723,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20575.342438999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17820.398479000003 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21678.447344000007,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19193.473605000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4918.01634600003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4384.930490000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 73335.59736900001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 73335597000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13446.440172,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13446442000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2477130464,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2477130464 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 141930056,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 141930056 ns\nthreads: 1"
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
          "id": "bbbded313eef8d7dd8c42a658d7076d1ead4d761",
          "message": "chore: only take FF (and not Flavor) in compute_logderivative_inverse (#11938)\n\nThe Flavor is not needed, and no other function in the file takes the Flavor as a template param. Just taking FF lets callers avoid having to import the whole flavor.",
          "timestamp": "2025-02-12T12:54:05Z",
          "tree_id": "735a99e65ae60cc03ede17419491c30f688cca2e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/bbbded313eef8d7dd8c42a658d7076d1ead4d761"
        },
        "date": 1739365818831,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19692.565072999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16866.227045 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21484.14981899998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18960.353646 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4057.3854079999874,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3803.2331739999995 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 80447.255053,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 80447255000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14389.683439999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14389683000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2523608818,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2523608818 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 132905621,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 132905621 ns\nthreads: 1"
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
          "id": "3980f6cb58f51723296c1db3e6228c242377c935",
          "message": "feat(avm): sequential lookup resolution (#11769)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this line.",
          "timestamp": "2025-02-12T12:55:32Z",
          "tree_id": "48bdbc59059b09022ba8b6185b6cbba67a7ccc55",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/3980f6cb58f51723296c1db3e6228c242377c935"
        },
        "date": 1739365972789,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20093.227934000028,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17145.414128000004 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21776.043335000053,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19393.360780000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4103.784555999993,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3782.2931049999997 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 84637.959682,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 84637961000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14517.742892000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14517744000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2385448085,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2385448085 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 148315666,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 148315666 ns\nthreads: 1"
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
          "id": "ed215e8d86eb9cc441bc60be090d0225d03e1fb3",
          "message": "chore: use RelationChecker in relation correctness tests and add Translator interleaving test (#11878)\n\nThe RelationChecker was introduced as a debugging utility in a previous\r\nPR but was not actually used in relevant tests, leading to duplicated\r\ncode. This PR fixes that and aims to refine the check function in the\r\nutility. It also includes refactoring of stale code and adds a small\r\nsequential test that changing the interleaving strategy in translator\r\nwill not break the PermutationRelation and DeltaRangeConstraintRelation\r\n(the two relations that now operate on the concatenated polynomials)",
          "timestamp": "2025-02-12T15:17:11Z",
          "tree_id": "275ae60582d15f573dc4ea325d6f8feae00e9169",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ed215e8d86eb9cc441bc60be090d0225d03e1fb3"
        },
        "date": 1739374449382,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19750.348890999987,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16850.706449 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21444.526182000005,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18797.480171 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4067.2636779999893,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3766.4752670000003 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 75518.12293099999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 75518124000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14407.127980999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14407129000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2637187705,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2637187705 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 133439767,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 133439767 ns\nthreads: 1"
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
          "id": "fdc2042d318eb00082c1f014066d4f177c5f72a1",
          "message": "fix: Empty blocks can now be unwound (#11920)\n\nThis PR has the following changes:\r\n\r\n1. Fixes an issue where empty blocks added from the genesis state could\r\nnot be unwound.\r\n2. Refactors the retrieval of meta data so a transaction is not required\r\nif just reading uncommitted data.\r\n3. We now provide a specific method for committing the genesis state.",
          "timestamp": "2025-02-12T15:26:54Z",
          "tree_id": "53f8f4c77f4c3b0288b4349b8febb3eab0b2f5cc",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/fdc2042d318eb00082c1f014066d4f177c5f72a1"
        },
        "date": 1739376087227,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20615.668932000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17638.683384 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21653.675975,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19037.451891 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4494.92410000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4212.206265 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 80197.17479,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 80197175000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13468.419773,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13468420000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2476523364,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2476523364 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 141588284,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 141588284 ns\nthreads: 1"
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
          "id": "6464059047f5e563b4a2207c72ea57d84f1b43cc",
          "message": "feat: Native world state now supports checkpointing  (#11739)\n\nThis PR introduces checkpointing to the native world state. \r\n\r\nCheckpointing allows for state updates to be reverted to a previous\r\nstate. This can be done to an arbitrary depth.\r\n\r\n---------\r\n\r\nCo-authored-by: Alex Gherghisan <alexg@aztecprotocol.com>",
          "timestamp": "2025-02-12T19:37:48Z",
          "tree_id": "3db75519add689febcf204a1e6ae96e5f7e5a2a7",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/6464059047f5e563b4a2207c72ea57d84f1b43cc"
        },
        "date": 1739390054847,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19758.472902999983,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16937.815788999997 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21385.89081500001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18897.586096000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4075.264261000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3783.0714459999995 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 75214.594814,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 75214596000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14409.883042,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14409884000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2333407771,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2333407771 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 133140235,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 133140235 ns\nthreads: 1"
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
          "id": "7a76374d51e822f419fa00e49b36340e4a512ca9",
          "message": "--ignored files too",
          "timestamp": "2025-02-12T22:48:29Z",
          "tree_id": "4720a792c7613ee9a85d4d14be278b9711e47886",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7a76374d51e822f419fa00e49b36340e4a512ca9"
        },
        "date": 1739402092278,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18352.138348999913,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16123.864729 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18783.20463299997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16488.720099000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4042.1647189998566,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3116.5696770000004 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54916.607443,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54916611000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10669.048437,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10669056000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1800036745,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1800036745 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 128188830,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 128188830 ns\nthreads: 1"
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
          "id": "082ed66bee121c29621e73540e930c6162ff9e8c",
          "message": "chore: op queue cleanup (#11925)\n\nPrecursor cleanup of the `ECCOpQueue` class. \n\n- remove unused logic related to asynchronously updating the op queue\n- move logic for tracking ECCVM row usage into a sub-class\nEccvmRowTracker\n- general syntax cleanup",
          "timestamp": "2025-02-12T15:51:41-07:00",
          "tree_id": "6a1139f0508bd09219162c9f906adc62dde99e16",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/082ed66bee121c29621e73540e930c6162ff9e8c"
        },
        "date": 1739402280987,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20199.34910799998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17102.965545 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21941.216296999984,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19501.613326000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4162.93243299998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3887.3578089999996 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 77284.03128400001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 77284031000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14589.530673000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14589531000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2385422733,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2385422733 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 135072840,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 135072840 ns\nthreads: 1"
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
          "id": "e1567e987e87d05ed684f7be48fd2dd4fbe8d43a",
          "message": "Update bootstrap.sh",
          "timestamp": "2025-02-13T00:12:13Z",
          "tree_id": "cdc11e25f14c236c023084de0d0ed5f1137419f8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e1567e987e87d05ed684f7be48fd2dd4fbe8d43a"
        },
        "date": 1739406184582,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18144.11199699998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16127.813609 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18560.50134999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16172.764604000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3846.9365550000703,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3095.8197149999996 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54912.166688,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54912168000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11406.814688999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11406817000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1806579207,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1806579207 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 129102069,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 129102069 ns\nthreads: 1"
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
          "id": "7f3bcccf81eafe51bac589599a21e1a68117e5c9",
          "message": "grind baby grind",
          "timestamp": "2025-02-13T00:13:28Z",
          "tree_id": "053e5cbd9a3f73d9b35ca927a59e353047b68a42",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7f3bcccf81eafe51bac589599a21e1a68117e5c9"
        },
        "date": 1739406269976,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18172.887891000017,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16029.509789999998 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18603.11177599999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16393.072671 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3915.1752300000453,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3076.473743 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54965.659322,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54965660000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10431.515263,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10431520000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1808463020,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1808463020 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 129084588,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 129084588 ns\nthreads: 1"
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
          "id": "cd3ee7f0d3b2bc13a2a1b812beb6e2654ee66ed1",
          "message": "Merge remote-tracking branch 'origin/ci3-fake-master' into ci3-fake-master",
          "timestamp": "2025-02-13T08:39:37Z",
          "tree_id": "0cf5df858a63a4db1dd412fe919eb88ecb074ae7",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/cd3ee7f0d3b2bc13a2a1b812beb6e2654ee66ed1"
        },
        "date": 1739437400491,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18042.68821400001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15856.260483999999 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18538.37488099998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16065.907245000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3852.0219290001023,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3131.6464530000003 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55282.521339,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55282523000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11094.995866,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11094999000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1813917306,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1813917306 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 133987662,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 133987662 ns\nthreads: 1"
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
          "id": "f87d0e380a9bc2bad78a2ba8f57b87115a7ec842",
          "message": "chore(master): Release 0.76.3",
          "timestamp": "2025-02-13T08:58:01Z",
          "url": "https://github.com/AztecProtocol/aztec-packages/pull/11924/commits/f87d0e380a9bc2bad78a2ba8f57b87115a7ec842"
        },
        "date": 1739437622738,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19817.806886,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16830.133472 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21554.134912999983,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19166.074354000004 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4063.20387400001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3808.0564269999995 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 75172.38043199999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 75172381000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14428.28627,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14428287000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2335032226,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2335032226 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 134494031,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 134494031 ns\nthreads: 1"
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
          "id": "f8fe602fe978fcd9f61a6476d24c03eb552d5341",
          "message": "feat(avm): constrained ec_add (#11525)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\r\nline.",
          "timestamp": "2025-02-13T10:31:59Z",
          "tree_id": "703f7d96bb42e22232cb6e81e6e57d8c8056749e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f8fe602fe978fcd9f61a6476d24c03eb552d5341"
        },
        "date": 1739443736551,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19882.779287999994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17025.416019 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21678.378683999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19244.714270000004 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4101.979628000009,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3833.000713 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 85015.37016899999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 85015370000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14519.75816,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14519759000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3107353091,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3107353091 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 167858029,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 167858029 ns\nthreads: 1"
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
          "id": "b865cccad1e5ff4b1cc175acd2095f0d2c1d423d",
          "message": "chore(avm): tracegen interactions assertion (#11972)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this line.",
          "timestamp": "2025-02-13T12:36:22Z",
          "tree_id": "9fd1e9f708ac7cd2a3651217ee113485a05ba9e2",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/b865cccad1e5ff4b1cc175acd2095f0d2c1d423d"
        },
        "date": 1739451144776,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19688.813485,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16847.588804 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21438.397313000023,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19428.84856 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4073.243609000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3820.294695 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 76075.219784,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 76075219000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14408.330074999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14408331000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2347613006,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2347613006 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 133471319,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 133471319 ns\nthreads: 1"
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
          "id": "95b581de29df183c7ee443c990fef11a3f9a301e",
          "message": "feat(avm): relation microbenchmarks (#11974)\n\nRelation accumulation microbenchmarks\n\n```\n----------------------------------------------------------------------\nBenchmark                            Time             CPU   Iterations\n----------------------------------------------------------------------\nalu_acc_random                   0.126 us        0.126 us      5542448\nbc_decomposition_acc_random       4.32 us         4.32 us       161914\nbc_retrieval_acc_random          0.024 us        0.024 us     28942571\nbitwise_acc_random                1.42 us         1.42 us       493754\necc_acc_random                    2.61 us         2.61 us       269299\nexecution_acc_random             0.527 us        0.527 us      1309267\ninstr_fetching_acc_random        0.024 us        0.024 us     29060773\nrange_check_acc_random            2.77 us         2.77 us       257953\nsha256_acc_random                 6.33 us         6.33 us       111173\n```",
          "timestamp": "2025-02-13T12:38:32Z",
          "tree_id": "a4d9ce3d63bf12aa0639719c11ea2f8763e085ff",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/95b581de29df183c7ee443c990fef11a3f9a301e"
        },
        "date": 1739451307833,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19715.376171000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16917.24779 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21560.375647,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19052.936192 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4092.942883000006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3804.6566430000003 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 85588.19262599999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 85588193000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14448.867079000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14448866000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2356653593,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2356653593 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 136974539,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 136974539 ns\nthreads: 1"
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
          "id": "f11d3903b3def2a93afe6764f56f9f45c02f48a7",
          "message": "cleanup",
          "timestamp": "2025-02-13T12:36:06Z",
          "tree_id": "e4b6152a35ec9a723b6a41bb5547759eec904a6e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f11d3903b3def2a93afe6764f56f9f45c02f48a7"
        },
        "date": 1739451742263,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18188.017486000033,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16222.525063 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18678.905398999857,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16327.409725 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3848.8889469999776,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3112.436424 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55221.597924,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55221599000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10608.840078999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10608843000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1807472139,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1807472139 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 131876434,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 131876434 ns\nthreads: 1"
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
          "id": "d0ab4b7c81e69e34a7b89d42c04a2b8c32baf52b",
          "message": "fix slack logic",
          "timestamp": "2025-02-13T12:38:42Z",
          "tree_id": "87ce11606ddfd9656bfcb82c04224fd68eac4246",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d0ab4b7c81e69e34a7b89d42c04a2b8c32baf52b"
        },
        "date": 1739451910343,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18157.176316999994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16051.900906 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18647.8915109999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16223.614831000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3926.1201409999558,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3166.9184920000002 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55246.363472000005,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55246365000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11101.1768,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11101178000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1822560556,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1822560556 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 132330572,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 132330572 ns\nthreads: 1"
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
          "distinct": false,
          "id": "d246cc15018c274f19245ecb265a47d1b29a0e34",
          "message": "Merge remote-tracking branch 'origin/master' into ci3-release-test",
          "timestamp": "2025-02-13T12:43:30Z",
          "tree_id": "d1ff4074788357fe88993c67462d22f037bfed02",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d246cc15018c274f19245ecb265a47d1b29a0e34"
        },
        "date": 1739452893389,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18364.56830899988,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16299.085409 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18707.920687000296,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16394.771189 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4073.3246640002108,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3181.764426 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55097.61531100001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55097618000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11357.524494,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11357548000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1823060326,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1823060326 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 133866437,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 133866437 ns\nthreads: 1"
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
          "distinct": false,
          "id": "d246cc15018c274f19245ecb265a47d1b29a0e34",
          "message": "Merge remote-tracking branch 'origin/master' into ci3-release-test",
          "timestamp": "2025-02-13T12:43:30Z",
          "tree_id": "d1ff4074788357fe88993c67462d22f037bfed02",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d246cc15018c274f19245ecb265a47d1b29a0e34"
        },
        "date": 1739452924661,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18364.56830899988,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16299.085409 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18707.920687000296,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16394.771189 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4073.3246640002108,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3181.764426 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55097.61531100001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55097618000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11357.524494,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11357548000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1823060326,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1823060326 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 133866437,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 133866437 ns\nthreads: 1"
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
          "id": "3a03fe052bbbdbf3ed0e44d0a5ed2701beb67689",
          "message": "chore(master): Release 0.76.4",
          "timestamp": "2025-02-13T15:46:11Z",
          "url": "https://github.com/AztecProtocol/aztec-packages/pull/11971/commits/3a03fe052bbbdbf3ed0e44d0a5ed2701beb67689"
        },
        "date": 1739462132639,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19749.756007999993,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16772.894749 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21623.772971999984,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19221.365389 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4107.517180999992,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3845.4931570000003 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 76527.401622,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 76527402000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14565.685312,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14565686000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2546620468,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2546620468 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 138494048,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 138494048 ns\nthreads: 1"
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
          "id": "6c9305897c9c333791d333d332cafa352f9bbe58",
          "message": "feat: PIL relations modifications for bc decomposition (#11935)\n\n```\r\n----------------------------------------------------------------------\r\nBenchmark                            Time             CPU   Iterations\r\n----------------------------------------------------------------------\r\nalu_acc_random                   0.126 us        0.126 us      5553823\r\nbc_decomposition_acc_random       8.73 us         8.73 us        80583\r\nbc_retrieval_acc_random          0.024 us        0.024 us     29187915\r\nbitwise_acc_random                1.42 us         1.42 us       493026\r\necc_acc_random                    2.59 us         2.59 us       269872\r\nexecution_acc_random             0.524 us        0.524 us      1339762\r\ninstr_fetching_acc_random        0.024 us        0.024 us     29288136\r\nrange_check_acc_random            2.67 us         2.67 us       262513\r\nsha256_acc_random                 6.25 us         6.25 us       111991\r\n```",
          "timestamp": "2025-02-13T17:34:57+01:00",
          "tree_id": "6d597e1136ea4cf605059f4e576847822281d4eb",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/6c9305897c9c333791d333d332cafa352f9bbe58"
        },
        "date": 1739465955500,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20794.973448000008,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17974.696425000002 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21791.425892000007,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19180.924053 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4472.892544999979,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4112.5963329999995 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 73158.95751,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 73158958000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13531.784989000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13531785000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2490362517,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2490362517 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 147715099,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 147715099 ns\nthreads: 1"
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
          "id": "be1b563ffe99689af45c9241a1d94d53de1c4e35",
          "message": "chore: op wires index from 0 (#11986)\n\nThe ecc op relation in Mega is designed to check that the ecc op data\nhas been duplicated across the wires and ecc_op_wires. Because the wires\nneed to be shifted, they contain a zero row, meaning the ecc op data is\nstored starting from index 1. Prior to this PR, the op wires also stored\nthe data this way, even though they dont need to be shifted. Its more\nconvenient for the ecc op wires to index from zero. This is achieved by\nsimply utilizing the shifted wires in the relation so that we check\necc_op_wire[i] = wire[i+1].\n\nNote: also fixes an incorrect skip condition in the EccOpRelation that\nwas not caught prior due to an unrelated bug that will be fixed in\nanother PR.",
          "timestamp": "2025-02-13T12:31:44-07:00",
          "tree_id": "8a0820276c52745ef79a215c3bdb37b28429aa03",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/be1b563ffe99689af45c9241a1d94d53de1c4e35"
        },
        "date": 1739476133902,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20560.81565299996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17695.849037000004 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21682.422184000017,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18906.432971000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4472.108256000012,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4163.633242 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 73320.063362,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 73320063000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13456.631414999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13456632000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2611656601,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2611656601 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 142926815,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 142926815 ns\nthreads: 1"
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
          "id": "2c199d852b316775053751fc67bd5018f35cf61b",
          "message": "feat: poseidon2 in vm2 (#11597)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\r\nline.",
          "timestamp": "2025-02-14T12:43:05Z",
          "tree_id": "ded1ab2d6ae35181c473083efec43b51392290f7",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/2c199d852b316775053751fc67bd5018f35cf61b"
        },
        "date": 1739538019237,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19799.610655000037,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17050.165887 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21561.330535000023,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19112.80939 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4075.5684900000233,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3821.244053 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 75134.517779,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 75134518000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14425.359297,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14425360000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2342022021,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2342022021 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 134049734,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 134049734 ns\nthreads: 1"
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
          "id": "723163a9a93d628c9688ff5861ed7bff556bae16",
          "message": "feat: Cl/ci3.3 (#10946)\n\n[CI3 introduction.](https://hackmd.io/bTnKHtTHT8mAdTtD0t7JvA?view)\r\n\r\nThis is a majority step towards the vision of CI3, still namely missing\r\nmerge queue.\r\n\r\nNew features:\r\n- Grinding flakes in master. We run all tests on 5 separate runners to\r\nreport on flakes at the source.\r\n- External contributors can now have CI run just by approving their PR. \r\n- Ability to debug CI entirely from commandline from any machine. Get\r\ndropped into a productive shell right after the CI failure by doing\r\n`./ci.sh ec2` while your PR is a draft (note: do not do this if pushing\r\nto a non-draft PR).\r\n- Add tests to CI by adding tests to bootstrap. Target a rich\r\nenvironment with no differences from running inside the dev container.\r\n- Releases that are fully dry-runnable and deployable from a single\r\ncommand. See above hackmd for details.\r\n- Recovery from spot eviction (finally implemented correctly).\r\n\r\nSome remaining items are tracked here.\r\nhttps://github.com/aztecprotocol/aztec-packages/issues/10775\r\n\r\n---------\r\n\r\nCo-authored-by: ludamad <domuradical@gmail.com>\r\nCo-authored-by: ludamad <adam.domurad@gmail.com>\r\nCo-authored-by: thunkar <gregojquiros@gmail.com>",
          "timestamp": "2025-02-14T12:59:22Z",
          "tree_id": "85acd18259eaa089b56151f51cbcc72dcf0ebff2",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/723163a9a93d628c9688ff5861ed7bff556bae16"
        },
        "date": 1739540072733,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18351.557659000035,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16251.382791000002 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18748.663436000017,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16344.662915 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3966.570054000158,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3172.46146 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55257.81427,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55257815000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11365.368749,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11365373000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1832061531,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1832061531 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 131153334,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 131153334 ns\nthreads: 1"
          }
        ]
      }
    ]
  }
}