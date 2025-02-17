window.BENCHMARK_DATA = {
  "lastUpdate": 1739813882207,
  "repoUrl": "https://github.com/AztecProtocol/aztec-packages",
  "entries": {
    "C++ Benchmark": [
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
          "id": "1dbaf37c281baaa1c5555174f5e99d01d6a8854b",
          "message": "fix: playground improvements (#12010)\n\nlog panel prevented some txs from being sent, import types affected\r\nproduction builds",
          "timestamp": "2025-02-14T15:04:17Z",
          "tree_id": "7cc4833f9cd656efeff5bc395bf80b0b7f3af250",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1dbaf37c281baaa1c5555174f5e99d01d6a8854b"
        },
        "date": 1739546067271,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18035.961868000017,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15972.900548000001 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18409.426161,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16230.944167 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3822.1105640000133,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3051.038035 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54563.643755000005,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54563645000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9939.243801,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9939250000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1795150451,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1795150451 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 128186841,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 128186841 ns\nthreads: 1"
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
          "id": "adacbda44dc7223ac0dd849c3951b61263eaece2",
          "message": "feat(avm): interactions microbenchmarks (#12005)\n\n```\n----------------------------------------------------------------------------\nBenchmark                                  Time             CPU   Iterations\n----------------------------------------------------------------------------\nalu_acc                                0.123 us        0.123 us      5733323\nbc_decomposition_acc                    8.74 us         8.74 us        80218\nbc_decomposition_interactions_acc       1.10 us         1.10 us       635912\nbc_retrieval_acc                       0.024 us        0.024 us     29223517\nbitwise_acc                             1.42 us         1.42 us       493467\nbitwise_interactions_acc               0.947 us        0.947 us       756449\necc_acc                                 2.59 us         2.59 us       268431\nexecution_acc                          0.519 us        0.519 us      1348920\nexecution_interactions_acc              1.53 us         1.53 us       459332\ninstr_fetching_acc                     0.024 us        0.024 us     29175405\nposeidon2_hash_acc                      1.86 us         1.86 us       377966\nposeidon2_hash_interactions_acc        0.743 us        0.743 us       943393\nposeidon2_perm_acc                      44.1 us         44.1 us        16011\nrange_check_acc                         2.68 us         2.68 us       260746\nrange_check_interactions_acc            3.53 us         3.53 us       198772\nsha256_acc                              6.25 us         6.24 us       112169\nsha256_interactions_acc                0.406 us        0.406 us      1736243\n```",
          "timestamp": "2025-02-14T10:37:52-05:00",
          "tree_id": "7101a3daf586f2c6d93cc4b5e2a378db2873aa96",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/adacbda44dc7223ac0dd849c3951b61263eaece2"
        },
        "date": 1739548894513,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18130.676950999943,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15986.488747 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18619.035850000044,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16460.302063 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3890.1604389998283,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3150.0280940000002 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55374.345571,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55374347000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11588.472747,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11588475000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1805893201,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1805893201 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 131345815,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 131345815 ns\nthreads: 1"
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
          "id": "9fedf8b9aed70abf7cb9e52ec305fcb0cf80b06a",
          "message": "chore(avm): Add comments in byte decomposition and hashing pil files (#12011)\n\nAdd comments in byte decomposition and hashing pil files and boolean\r\nrelation in bitwise.pil",
          "timestamp": "2025-02-14T17:22:51+01:00",
          "tree_id": "fbca2187c29be3fcd430ae5f75581936aa76e3f8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9fedf8b9aed70abf7cb9e52ec305fcb0cf80b06a"
        },
        "date": 1739551594030,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18250.700126999844,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16133.313581000002 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18652.454971,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16446.149862000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3907.2975179999503,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3104.662058 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55173.716966,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55173720000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9641.993386,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9641996000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1813327549,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1813327549 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 130071936,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 130071936 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "asterite@gmail.com",
            "name": "Ary Borenszweig",
            "username": "asterite"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "d1144e57927bf062ddb43d1194a40a686e2f9737",
          "message": "chore: turn get_vk_merkle_tree into a global (#12009)\n\nCalling `get_vk_merkle_tree` during comptime takes 80ms on my machine.\nIt's called several times during compilation.\n\nRunning `time nargo check --force` inside `rollup-base-private` used to\ntake 1.3 seconds on my machine. With this change it takes 0.6 seconds.\nIt's not that much for a human, but `nargo check` is what LSP uses so\nthis should speed up LSP in these projects by a noticeable amount.",
          "timestamp": "2025-02-14T17:37:23Z",
          "tree_id": "cb9109cd3505edd4eff100d3914232e7ebca7850",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d1144e57927bf062ddb43d1194a40a686e2f9737"
        },
        "date": 1739556014051,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18124.868891999995,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16007.239689000002 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18593.10187999995,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16501.382161 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3925.6521390000216,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3167.3881949999995 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55468.425597,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55468426000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11131.095260999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11131099000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1823151374,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1823151374 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 135660520,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 135660520 ns\nthreads: 1"
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
          "id": "283050db11cd723ca41b1f349bab666d772d05d2",
          "message": "chore: proof submission window in charts (#11993)\n\nI ran a [successful deployment of\r\nRC-1](https://github.com/AztecProtocol/aztec-packages/actions/runs/13314469598)\r\nto gke-private/mitch.\r\nSee the [proven chain\r\nadvancing](https://cloudlogging.app.goo.gl/B9nXhrH3tmZnYVby8)\r\n\r\nAlso remove some dead values files.",
          "timestamp": "2025-02-14T19:02:59Z",
          "tree_id": "96ed41c8592b6f9a503621cab8b6637f15d379c1",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/283050db11cd723ca41b1f349bab666d772d05d2"
        },
        "date": 1739560993197,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18041.573430000084,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15841.327466 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18620.864071000142,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16327.047741000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3865.861246999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3099.932936 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55365.849685999994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55365852000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10985.898537,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10985905000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1820259928,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1820259928 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 133605533,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 133605533 ns\nthreads: 1"
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
          "id": "0dbd60e20028a9281df2c7eeef2b2ab307600a9e",
          "message": "chore(avm): fix test names (#12017)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this line.",
          "timestamp": "2025-02-14T19:07:41Z",
          "tree_id": "7cdf825ae48938711a1d34acfae5fc668160c087",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0dbd60e20028a9281df2c7eeef2b2ab307600a9e"
        },
        "date": 1739561519906,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18290.239000999918,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16138.251344 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18663.57409400007,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16330.308382999998 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3857.1539950000897,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3034.994758 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55071.241346,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55071245000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9922.484751,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9922488000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1861998441,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1861998441 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 130916390,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 130916390 ns\nthreads: 1"
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
          "id": "a8c9285df069377bc7d5c802fa0b997868daac78",
          "message": "chore(ci3): release pass (#12016)\n\nCo-authored-by: Charlie Lye <karl.lye@gmail.com>\r\nCo-authored-by: thunkar <gregojquiros@gmail.com>",
          "timestamp": "2025-02-14T19:24:37Z",
          "tree_id": "676afac17813c4eaf367312f72ad72b26e6e12eb",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a8c9285df069377bc7d5c802fa0b997868daac78"
        },
        "date": 1739562477988,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18184.526628000185,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16110.195129999998 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18757.738717000168,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16362.987561 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3997.2766560001673,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3151.866055 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55256.351533,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55256351000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 12037.516598999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 12037521000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1837575839,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1837575839 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 131987008,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 131987008 ns\nthreads: 1"
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
          "id": "fe2c77bb56d56c83bdce6ea708ee1a7cd360978f",
          "message": "feat: Sync from noir (#12002)\n\nAutomated pull of development from the\n[noir](https://github.com/noir-lang/noir) programming language, a\ndependency of Aztec.\nBEGIN_COMMIT_OVERRIDE\nfix(ssa): Do not deduplicate division by a zero constant\n(https://github.com/noir-lang/noir/pull/7393)\nchore: document traits required to be in scope\n(https://github.com/noir-lang/noir/pull/7387)\nfix: field zero division in brillig\n(https://github.com/noir-lang/noir/pull/7386)\nchore: box `ParserError`s in `InterpreterError`\n(https://github.com/noir-lang/noir/pull/7373)\nchore: remove unnecessary dereferencing within brillig vm\n(https://github.com/noir-lang/noir/pull/7375)\nfix: give \"correct\" error when trying to use AsTraitPath\n(https://github.com/noir-lang/noir/pull/7360)\nEND_COMMIT_OVERRIDE\n\n---------\n\nCo-authored-by: Tom French <15848336+TomAFrench@users.noreply.github.com>",
          "timestamp": "2025-02-14T19:37:43Z",
          "tree_id": "b1cf6dc76ed5490f4f283a2eeeac9b9d37b8e3f2",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/fe2c77bb56d56c83bdce6ea708ee1a7cd360978f"
        },
        "date": 1739563359941,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18126.20716499987,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16042.353617 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18603.09570599998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16327.955765000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3888.5236720000194,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3087.0518789999996 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55536.430089999994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55536431000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10857.471972,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10857476000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1816113384,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1816113384 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 134085562,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 134085562 ns\nthreads: 1"
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
          "id": "f96903792b7f050f63f37e49382afd0ea114b94e",
          "message": "chore(ci3): label handling (#12020)",
          "timestamp": "2025-02-14T20:12:07Z",
          "tree_id": "9766a5981c339b44e07c59fad2922235f66dca7d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f96903792b7f050f63f37e49382afd0ea114b94e"
        },
        "date": 1739564559879,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18072.268280999993,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15971.024243000002 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18531.105095999977,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16235.809557999999 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3843.291487999977,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3107.055706 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55168.556744,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55168558000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9475.941302000003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9475944000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1820055600,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1820055600 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 133266457,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 133266457 ns\nthreads: 1"
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
          "id": "d8534ec6e48f7fc469a4370abfb3061427469c7c",
          "message": "chore: skip flakey p2p (#12021)",
          "timestamp": "2025-02-14T23:09:07Z",
          "tree_id": "1999bbec49f8a49e69c00068711c91be496bd21a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d8534ec6e48f7fc469a4370abfb3061427469c7c"
        },
        "date": 1739575177683,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18037.378052999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15937.616101 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18567.52139400004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16178.019913 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3870.910135000031,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3073.831465 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55175.349675,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55175351000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10928.430685000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10928439000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1820938292,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1820938292 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 130705776,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 130705776 ns\nthreads: 1"
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
          "id": "de7882ccb72d371f66f07c66d3e762374aac909b",
          "message": "feat: new op queue logic (#11999)\n\nNew class EccOpsTable to support the new concatenate-via-relations\napproach to the Merge protocol.\n\nBackground: The \"Merge\" protocol is essentially a protocol for\nestablishing that a large table was constructed as the concatenation of\nsmaller ones (subtables). In the original version of the protocol, the\nlarger table was obtained by successively appending subtables (one from\neach circuit). The new version requires that subtables be PRE-pended.\nThis results in a simpler protocol overall (and, importantly, one that's\neasier to make ZK) but its a bit more annoying from a data management\nstandpoint since in general we don't want to pre-pend things in memory.\nThis PR introduces a class `EccOpsTable` which stores individual\nsubtables which can be virtually \"prepended\" to construct the entries of\nthe corresponding aggregate table as needed.",
          "timestamp": "2025-02-15T12:53:49-07:00",
          "tree_id": "f199c0cf9d7d55e48000439b9b22ad5df8cc133d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/de7882ccb72d371f66f07c66d3e762374aac909b"
        },
        "date": 1739650856324,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18218.27088200007,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16090.161274000004 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18711.115801000007,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16408.70379 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4010.99242999976,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3131.0757529999996 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55306.514611,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55306515000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10391.696799000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10391700000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1823023468,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1823023468 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 127892281,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 127892281 ns\nthreads: 1"
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
          "id": "ba50dd92a4ef0a30e8a136a0038f489e466802d7",
          "message": "fix(ci3): fix ./bootstrap.sh fast in noir-projects (#12026)",
          "timestamp": "2025-02-15T15:44:32-05:00",
          "tree_id": "36a0bda7973c759ba2ae72f373a6d0f2f6df5f01",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ba50dd92a4ef0a30e8a136a0038f489e466802d7"
        },
        "date": 1739653495972,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17951.99469500017,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15895.375432999997 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18541.15595400003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16128.288628 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3964.595658999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3072.1547349999996 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55162.955009,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55162956000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10971.659951,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10971660000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1857845676,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1857845676 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 131687619,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 131687619 ns\nthreads: 1"
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
          "id": "6f771b9f55fdc568944e78b5ae05eeff25033b1e",
          "message": "chore: structured polys in Translator (#12003)\n\nIn this PR:\r\n* renamed the `MINIMUM_MINI_CIRCUIT_SIZE`. Initially, the variable was\r\n2048 existed to determine the lower bound of the translator vm. In the\r\nfixed size VM work it became the upper_bound of the translator. Renamed\r\nthe variable to `FIXED_TRANSLATOR_VM_SIZE` and enforced statically that\r\nthis never gets set under 2048.\r\n* make the prover polynomials structured, so now the majority of\r\npolynomials in translator only have space allocated up to the mini\r\ncircuit size",
          "timestamp": "2025-02-15T21:58:04+01:00",
          "tree_id": "6df4557a6531f72aa2b31a51d7784bec8b804e0f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/6f771b9f55fdc568944e78b5ae05eeff25033b1e"
        },
        "date": 1739655254316,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18189.39530600005,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15915.337828 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18706.344808000038,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16251.708061000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3939.2020780001076,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3162.6268669999995 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55094.560113,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55094560000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10357.982311,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10357984000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1824159654,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1824159654 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 129649571,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 129649571 ns\nthreads: 1"
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
          "id": "3633c077e48f051919c30f4377fbb967f696b773",
          "message": "fix: unexposing test fr from vkey struct ts (#12028)\n\nwhoops !",
          "timestamp": "2025-02-15T21:56:12Z",
          "tree_id": "2f32a9363dae4031e0528b163ef39ffbe26277fd",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/3633c077e48f051919c30f4377fbb967f696b773"
        },
        "date": 1739657796983,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18039.335058999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15931.832471 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18565.380645000005,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16177.571516 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3870.8480039999813,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3084.2926980000007 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54956.944531,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54956945000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10379.151297,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10379156000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1812584741,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1812584741 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 131095380,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 131095380 ns\nthreads: 1"
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
          "id": "2f4f7a6126230e010f9a22fca76e74c344982f2e",
          "message": "chore: redo typo PR by maximevtush (#12033)\n\nThanks maximevtush for\nhttps://github.com/AztecProtocol/aztec-packages/pull/12030. Our policy\nis to redo typo changes to dissuade metric farming. This is an automated\nscript.",
          "timestamp": "2025-02-16T11:34:54-05:00",
          "tree_id": "6477794dbcc2c50a094872338468eadc5106cc8c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/2f4f7a6126230e010f9a22fca76e74c344982f2e"
        },
        "date": 1739724890572,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18161.758910999994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16012.543032 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18594.301562000055,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16105.156753 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3943.8402950000864,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3113.5112190000004 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55094.110021,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55094109000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10172.353963,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10172362000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1815084719,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1815084719 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 128740696,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 128740696 ns\nthreads: 1"
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
          "id": "0c937238e193ad1a9936004f665a319ba92468d9",
          "message": "feat!: enforce fees (#11480)\n\n### Circuits\r\n- Private kernels ensure that fee payer is not empty.\r\n- Private base rollup and the avm check that the fee payer must have\r\nenough balance to pay the fee.\r\n\r\n### Aztec.js/cli\r\n- Default payment method is `FeeJuicePaymentMethod`, the fee payer is\r\nthe wallet owner.\r\n- `NoFeePaymentMethod` is no longer available.\r\n- \r\n\r\n### End-to-end/Sandbox\r\n- Some public data leaves are created for funding the initial test\r\naccounts with fee juice. The genesis archive root and block hash are\r\ngenerated with these public data leaves.\r\n  - For the e2e tests, the test accounts are generated randomly.\r\n- For the sandbox, the test accounts are defined in\r\n`@aztec/accounts/testing`.\r\n- These funded test accounts can deploy their own account contract and\r\npay the fee for the deployment themselves.\r\n- These funded test accounts can be used to deploy another account\r\nwithout pre-funded fee juice.\r\n- By calling `someAccountManager.deploy({ deployWallet: fundedWallet })`\r\n- `BananaCoin` and `BananaFPC` are deployed in sandbox by default. Users\r\ncan use the funded accounts to mint banana coin for a new account.\r\n- The new account can then submit transactions and pay the fees using\r\n`PrivateFeePaymentMethod`.\r\n  - See example in `end-to-end/src/composed/e2e_sandbox_example.test.ts`\r\n\r\n---------\r\n\r\nCo-authored-by: Alex Gherghisan <alexghr@users.noreply.github.com>\r\nCo-authored-by: ludamad <domuradical@gmail.com>",
          "timestamp": "2025-02-17T09:00:37+01:00",
          "tree_id": "7cf64fee037fb7e98d424d44ece100fb57ad4d9b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0c937238e193ad1a9936004f665a319ba92468d9"
        },
        "date": 1739781429915,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18338.773387999936,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16067.586888000002 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18842.640455000037,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16471.326252000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4024.2380279998997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3154.818714 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55020.452012,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55020450000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11293.945298,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11293951000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1825613558,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1825613558 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 135923700,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 135923700 ns\nthreads: 1"
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
          "id": "be273e536d27ed101201f108f3f1971bb99cfab4",
          "message": "feat: Contract updates (#11514)\n\nImplements\r\nhttps://hackmd.io/McJEZq0DRlSU0xZjg41QqQ?view#Contract-upgradeability\r\nCloses https://github.com/AztecProtocol/aztec-packages/issues/8979\r\n\r\n---------\r\n\r\nCo-authored-by: Leila Wang <leizciw@gmail.com>\r\nCo-authored-by: Alex Gherghisan <alexghr@users.noreply.github.com>",
          "timestamp": "2025-02-17T10:06:27+01:00",
          "tree_id": "fe3fb014fb1173741bc534dbd5e219a751b0ca32",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/be273e536d27ed101201f108f3f1971bb99cfab4"
        },
        "date": 1739783812593,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18155.77185000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16089.490837 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18552.418585,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16249.258402000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3845.72835299997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3052.679883999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55031.879607999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55031880000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10577.461694,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10577464000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1793077066,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1793077066 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 128968515,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 128968515 ns\nthreads: 1"
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
          "id": "af8c7d6d974232c4d65e43d7005b4d505065a8d8",
          "message": "feat(avm): packed field in bytecode decomposition (#12015)\n\n```\n----------------------------------------------------------------------------\nBenchmark                                  Time             CPU   Iterations\n----------------------------------------------------------------------------\nbc_decomposition_acc                    10.9 us         10.8 us        64294\nbc_decomposition_interactions_acc       1.12 us         1.12 us       635595\n```",
          "timestamp": "2025-02-17T12:25:45Z",
          "tree_id": "a3e00c034c972bb1cb8d24f67d36f9aedec231e7",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/af8c7d6d974232c4d65e43d7005b4d505065a8d8"
        },
        "date": 1739796641262,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18128.714296999988,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16032.233798 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18773.769971000092,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16322.243547999999 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3935.1615500002026,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3087.322353 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54947.885979,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54947883000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11098.674887000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11098678000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1836168299,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1836168299 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 135816022,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 135816022 ns\nthreads: 1"
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
          "id": "914ead09cb19b1a1f8929db7603fdb7e0433482b",
          "message": "chore(docs): acir formal verification final report (#12040)\n\nSMT verification results of ssa->acir translation.",
          "timestamp": "2025-02-17T12:49:24Z",
          "tree_id": "b3c7d1cf67e9bc432d304c432753f2a8ed37b705",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/914ead09cb19b1a1f8929db7603fdb7e0433482b"
        },
        "date": 1739797193789,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18075.453373000015,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16051.966492000001 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18669.87492499999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16194.918232999999 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3915.178076000018,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3094.3153509999997 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54786.092111000005,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54786091000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10631.256249,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10631260000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1816231128,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1816231128 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 134972954,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 134972954 ns\nthreads: 1"
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
          "id": "24e02d32f43d692582231605df90208aa3afb10e",
          "message": "fix: Basic install test (#12049)\n\nChanging the test to use one of the prefilled accounts for now.\r\nPossible other options:\r\n- Bridge from l1 in the test: The ugly thing about this is showing the\r\nuser that he has to send garbage txs to make the sandbox chain advance\r\nso the l1l2 message gets included. Would be nice to show them the\r\nbridging though.\r\n- Create a free for all FPC: Using the fpc is maybe too complicated for\r\na getting started guide?\r\n- Use the bananacoin FPC: I think it's too complicated for getting\r\nstarted, but should be nice as a second tutorial\r\n \r\nHaven't changed the tutorial (getting_started.md) yet until I get some\r\ninput on the options\r\n \r\n@Thunkar I think the cli-wallet tests aren't running in CI, because they\r\nare assuming no fees",
          "timestamp": "2025-02-17T18:27:28+01:00",
          "tree_id": "86a2372b712014150b72b032db34225256967f41",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/24e02d32f43d692582231605df90208aa3afb10e"
        },
        "date": 1739813874354,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 18125.37029600003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15906.914583999998 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 18683.836364999992,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16217.380595999999 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3918.816131999961,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3082.05831 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 54826.743786,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 54826743000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10864.299625,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10864306000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 1804453099,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 1804453099 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 130484083,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 130484083 ns\nthreads: 1"
          }
        ]
      }
    ]
  }
}