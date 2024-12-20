window.BENCHMARK_DATA = {
  "lastUpdate": 1734719812943,
  "repoUrl": "https://github.com/AztecProtocol/aztec-packages",
  "entries": {
    "C++ Benchmark": [
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
          "id": "9836036053f1b5f3e57bf4e19bf0eb1a692306bd",
          "message": "chore!: lower public tx gas limit to 6M (#10635)\n\nAnd fix migration notes which were incorrectly modified in previous PR",
          "timestamp": "2024-12-11T22:55:51-05:00",
          "tree_id": "99d345e7ff9d81ea1fa6a317a92b12755c95cb82",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9836036053f1b5f3e57bf4e19bf0eb1a692306bd"
        },
        "date": 1733977178746,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 24831.38214599998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 22826.542892999998 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4599.074566000013,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4306.631002 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 91018.616994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 91018617000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 16589.411520999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16589412000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2824038302,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2824038302 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 135633649,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 135633649 ns\nthreads: 1"
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
          "id": "b1d8b978871948fbba639476465f4de6fb471292",
          "message": "feat: remove auto verify mode from ClientIVC (#10599)\n\nRemoves auto verify mode from `ClientIVC`. Auto verify mode was a\r\ntemporary feature designed to append kernel logic (recursive\r\nverifications etc.) to kernel circuits generated from noir kernel\r\nprograms before the `verify_proof()` calls were integrated into those\r\nprograms. Now that these calls are present in the kernels (mock and\r\ngenuine), the kernel logic is automatically constructed via\r\nivc_recursion_constraints via the normal `create_circuit()` pathway. If\r\nin the future there is need for a backend which automatically appends\r\nrecursive verification logic, it should be implemented in an entirely\r\nseparate class.\r\n\r\nNote: This change means we can no longer generate an IVC proof from the\r\nnoir `fold_*` programs since they do not contain explicit recursive\r\nverifiers. All such tests/flows have been removed.\r\n\r\nCloses https://github.com/AztecProtocol/barretenberg/issues/1116 (remove\r\nmanual setting of is_kernel)\r\nCloses https://github.com/AztecProtocol/barretenberg/issues/1101 (remove\r\nauto-verify)",
          "timestamp": "2024-12-12T08:34:34-07:00",
          "tree_id": "cd1ca9db8a576e0d7ccdcc9332438bd2096e3730",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/b1d8b978871948fbba639476465f4de6fb471292"
        },
        "date": 1734020162955,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 24597.569082999995,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 22368.714204 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4534.642659999974,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4256.634741 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 89412.031254,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 89412031000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 16556.181210000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16556182000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2774314315,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2774314315 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 132429386,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 132429386 ns\nthreads: 1"
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
          "id": "58362e4060163e5ec14e8ff7cc9f7c190302d112",
          "message": "chore(master): Release 0.67.0",
          "timestamp": "2024-12-13T05:57:40Z",
          "url": "https://github.com/AztecProtocol/aztec-packages/pull/10472/commits/58362e4060163e5ec14e8ff7cc9f7c190302d112"
        },
        "date": 1734070506181,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 24651.243679999992,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 22550.046144 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4534.163036999985,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4270.896552 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 90258.48015700001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 90258480000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 16525.912495,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16525912000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2782822117,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2782822117 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 132200542,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 132200542 ns\nthreads: 1"
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
          "id": "19a500ffc09ab8bc367a78599dd73a07a04b426e",
          "message": "chore(master): Release 0.67.0 (#10472)\n\n:robot: I have created a release *beep* *boop*\r\n---\r\n\r\n\r\n<details><summary>aztec-package: 0.67.0</summary>\r\n\r\n##\r\n[0.67.0](https://github.com/AztecProtocol/aztec-packages/compare/aztec-package-v0.66.0...aztec-package-v0.67.0)\r\n(2024-12-13)\r\n\r\n\r\n### Features\r\n\r\n* Deploy faucet\r\n([#10580](https://github.com/AztecProtocol/aztec-packages/issues/10580))\r\n([09e95a1](https://github.com/AztecProtocol/aztec-packages/commit/09e95a1d033deb5c31d9967d5100a6aeb8485ab5))\r\n* Expose P2P service API and clean up logs\r\n([#10552](https://github.com/AztecProtocol/aztec-packages/issues/10552))\r\n([98cea58](https://github.com/AztecProtocol/aztec-packages/commit/98cea58dd9c7a4518daa8e625dd794a2b6f4b314)),\r\ncloses\r\n[#10299](https://github.com/AztecProtocol/aztec-packages/issues/10299)\r\n* PXE in the browser\r\n([#10353](https://github.com/AztecProtocol/aztec-packages/issues/10353))\r\n([676f673](https://github.com/AztecProtocol/aztec-packages/commit/676f673dfbcb14f5351a0068aef9ad9fa4ebf879))\r\n* PXE sync on demand\r\n([#10613](https://github.com/AztecProtocol/aztec-packages/issues/10613))\r\n([b2f1159](https://github.com/AztecProtocol/aztec-packages/commit/b2f11596e5c79be0c11ad298e734885e9657e640))\r\n\r\n\r\n### Bug Fixes\r\n\r\n* Do not load pino-pretty in production bundles\r\n([#10578](https://github.com/AztecProtocol/aztec-packages/issues/10578))\r\n([e515e6e](https://github.com/AztecProtocol/aztec-packages/commit/e515e6e7644180bab72eb693d83b9496919cc159))\r\n* Tweaking Fr and Fq fromString functionality to distinguish number-only\r\nstrings\r\n([#10529](https://github.com/AztecProtocol/aztec-packages/issues/10529))\r\n([736fce1](https://github.com/AztecProtocol/aztec-packages/commit/736fce1f77533925943ef363d1803b2e55f83609))\r\n\r\n\r\n### Miscellaneous\r\n\r\n* Bump jest default test timeout to 30s\r\n([#10550](https://github.com/AztecProtocol/aztec-packages/issues/10550))\r\n([841bf48](https://github.com/AztecProtocol/aztec-packages/commit/841bf48c27767c3a4a53aacd0115582e8397910f))\r\n* Rename logger modules\r\n([#10404](https://github.com/AztecProtocol/aztec-packages/issues/10404))\r\n([7441767](https://github.com/AztecProtocol/aztec-packages/commit/7441767d7e8e7e7d602c447ca843dee43f8dc8f8)),\r\ncloses\r\n[#10125](https://github.com/AztecProtocol/aztec-packages/issues/10125)\r\n</details>\r\n\r\n<details><summary>barretenberg.js: 0.67.0</summary>\r\n\r\n##\r\n[0.67.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg.js-v0.66.0...barretenberg.js-v0.67.0)\r\n(2024-12-13)\r\n\r\n\r\n### Features\r\n\r\n* CIVC browser proveThenVerify\r\n([#10431](https://github.com/AztecProtocol/aztec-packages/issues/10431))\r\n([8c064d4](https://github.com/AztecProtocol/aztec-packages/commit/8c064d484c686fdf00a100f65f1f740be4ef13cb))\r\n* Keccak honk proving in bb.js\r\n([#10489](https://github.com/AztecProtocol/aztec-packages/issues/10489))\r\n([e0d7431](https://github.com/AztecProtocol/aztec-packages/commit/e0d743121674bcfdd73f84836c17645a5bc2df92))\r\n\r\n\r\n### Bug Fixes\r\n\r\n* Bump hard coded SRS size for wasm from 2^19 to 2^10\r\n([#10596](https://github.com/AztecProtocol/aztec-packages/issues/10596))\r\n([a37f82d](https://github.com/AztecProtocol/aztec-packages/commit/a37f82d2ed6a4512eb38f8fa576f52a06ddbdfba))\r\n</details>\r\n\r\n<details><summary>aztec-packages: 0.67.0</summary>\r\n\r\n##\r\n[0.67.0](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.66.0...aztec-packages-v0.67.0)\r\n(2024-12-13)\r\n\r\n\r\n### ⚠ BREAKING CHANGES\r\n\r\n* **stdlib:** Remove Schnorr\r\n(https://github.com/noir-lang/noir/pull/6749)\r\n* lower public tx gas limit to 6M\r\n([#10635](https://github.com/AztecProtocol/aztec-packages/issues/10635))\r\n* l2 gas maximum is per-TX-public-portion. AVM startup gas is now 20k.\r\n([#10214](https://github.com/AztecProtocol/aztec-packages/issues/10214))\r\n* rm outgoing logs\r\n([#10486](https://github.com/AztecProtocol/aztec-packages/issues/10486))\r\n* rename Header to BlockHeader\r\n([#10372](https://github.com/AztecProtocol/aztec-packages/issues/10372))\r\n* several format string fixes and improvements\r\n(https://github.com/noir-lang/noir/pull/6703)\r\n\r\n### Features\r\n\r\n* `std::hint::black_box` function.\r\n(https://github.com/noir-lang/noir/pull/6529)\r\n([3166529](https://github.com/AztecProtocol/aztec-packages/commit/31665296c94a221098a473426e3686e56b4b9e96))\r\n* Add rollup circuit sample inputs\r\n([#10608](https://github.com/AztecProtocol/aztec-packages/issues/10608))\r\n([775b459](https://github.com/AztecProtocol/aztec-packages/commit/775b459d0423e6dfe79e2b1a24e195fd61750171))\r\n* Add verify proof calls to private kernels\r\n([#10533](https://github.com/AztecProtocol/aztec-packages/issues/10533))\r\n([ce0eee0](https://github.com/AztecProtocol/aztec-packages/commit/ce0eee0ef4a2084ec74b6dae0a75d18af5877ef8))\r\n* Adding fuzzer for ultra bigfield and relaxing ultra circuit checker\r\n([#10433](https://github.com/AztecProtocol/aztec-packages/issues/10433))\r\n([da4c47c](https://github.com/AztecProtocol/aztec-packages/commit/da4c47c5dc8caea3e860ac15a58b9ff7f011e4f6))\r\n* Allow making range queries to prometheus in tests\r\n([f9810cc](https://github.com/AztecProtocol/aztec-packages/commit/f9810cc48f7379a0c02c76d8fc897d3ffc9d6ad8))\r\n* Allow metrics to be instantly flushed\r\n([f9810cc](https://github.com/AztecProtocol/aztec-packages/commit/f9810cc48f7379a0c02c76d8fc897d3ffc9d6ad8))\r\n* AVM inserts fee write on txs with public calls\r\n([#10394](https://github.com/AztecProtocol/aztec-packages/issues/10394))\r\n([98ba747](https://github.com/AztecProtocol/aztec-packages/commit/98ba7475ac0130dac4424a2f5cabdbe37eba5cc8))\r\n* **ci:** Initial compilation report on test_programs\r\n(https://github.com/noir-lang/noir/pull/6731)\r\n([3166529](https://github.com/AztecProtocol/aztec-packages/commit/31665296c94a221098a473426e3686e56b4b9e96))\r\n* CIVC browser proveThenVerify\r\n([#10431](https://github.com/AztecProtocol/aztec-packages/issues/10431))\r\n([8c064d4](https://github.com/AztecProtocol/aztec-packages/commit/8c064d484c686fdf00a100f65f1f740be4ef13cb))\r\n* Cli wallet improvements\r\n([#10425](https://github.com/AztecProtocol/aztec-packages/issues/10425))\r\n([cc8bd80](https://github.com/AztecProtocol/aztec-packages/commit/cc8bd80730f7ec269be9282d0e90fc2b6dc6561a))\r\n* **cli:** Run command on the package closest to the current directory\r\n(https://github.com/noir-lang/noir/pull/6752)\r\n([3166529](https://github.com/AztecProtocol/aztec-packages/commit/31665296c94a221098a473426e3686e56b4b9e96))\r\n* DB Metrics now use labels for easier querying\r\n([#10572](https://github.com/AztecProtocol/aztec-packages/issues/10572))\r\n([adadfa5](https://github.com/AztecProtocol/aztec-packages/commit/adadfa5be51a33d6b089c59d3bad5d46073f8bc3))\r\n* Deploy a network using master each night night\r\n([#10536](https://github.com/AztecProtocol/aztec-packages/issues/10536))\r\n([015ec0e](https://github.com/AztecProtocol/aztec-packages/commit/015ec0e506f76610e8378a5ad223a9c0185f78c9)),\r\ncloses\r\n[#10474](https://github.com/AztecProtocol/aztec-packages/issues/10474)\r\n[#10473](https://github.com/AztecProtocol/aztec-packages/issues/10473)\r\n* Deploy faucet\r\n([#10580](https://github.com/AztecProtocol/aztec-packages/issues/10580))\r\n([09e95a1](https://github.com/AztecProtocol/aztec-packages/commit/09e95a1d033deb5c31d9967d5100a6aeb8485ab5))\r\n* Do not make unique revertible note hashes in the private kernels\r\n([#10524](https://github.com/AztecProtocol/aztec-packages/issues/10524))\r\n([d327da1](https://github.com/AztecProtocol/aztec-packages/commit/d327da1aeac530e8497e3d21a25152bd920797e2))\r\n* Emulating blocks and correct (non-partial) note discovery in txe\r\n([#10356](https://github.com/AztecProtocol/aztec-packages/issues/10356))\r\n([6f209fb](https://github.com/AztecProtocol/aztec-packages/commit/6f209fb69fcce868c6e0fe9b79b5ac3f3a1e5c48))\r\n* Expose P2P service API and clean up logs\r\n([#10552](https://github.com/AztecProtocol/aztec-packages/issues/10552))\r\n([98cea58](https://github.com/AztecProtocol/aztec-packages/commit/98cea58dd9c7a4518daa8e625dd794a2b6f4b314)),\r\ncloses\r\n[#10299](https://github.com/AztecProtocol/aztec-packages/issues/10299)\r\n* GETCONTRACTINSTANCE and bytecode retrieval perform nullifier\r\nmembership checks\r\n([#10445](https://github.com/AztecProtocol/aztec-packages/issues/10445))\r\n([9301253](https://github.com/AztecProtocol/aztec-packages/commit/9301253f0488e6d96ed12a8c9bde72a653aa7d36)),\r\ncloses\r\n[#10377](https://github.com/AztecProtocol/aztec-packages/issues/10377)\r\n[#10379](https://github.com/AztecProtocol/aztec-packages/issues/10379)\r\n* Handle nested calls in witgen\r\n([#10384](https://github.com/AztecProtocol/aztec-packages/issues/10384))\r\n([1e21f31](https://github.com/AztecProtocol/aztec-packages/commit/1e21f31d430947f48dc9f5e52d0deb1af70ee705))\r\n* Keccak honk proving in bb.js\r\n([#10489](https://github.com/AztecProtocol/aztec-packages/issues/10489))\r\n([e0d7431](https://github.com/AztecProtocol/aztec-packages/commit/e0d743121674bcfdd73f84836c17645a5bc2df92))\r\n* Metrics via terraform\r\n([#10594](https://github.com/AztecProtocol/aztec-packages/issues/10594))\r\n([e21069d](https://github.com/AztecProtocol/aztec-packages/commit/e21069db0b3fcdf5665b62bb821a5a1d2abe2cee)),\r\ncloses\r\n[#10191](https://github.com/AztecProtocol/aztec-packages/issues/10191)\r\n[#10439](https://github.com/AztecProtocol/aztec-packages/issues/10439)\r\n* Modify HonkRecursionConstraint to handle IPA claims\r\n([#10469](https://github.com/AztecProtocol/aztec-packages/issues/10469))\r\n([a204d1b](https://github.com/AztecProtocol/aztec-packages/commit/a204d1b60514d6321c2db5063375cc2bbd507fe8))\r\n* Order attribute execution by their source ordering\r\n(https://github.com/noir-lang/noir/pull/6326)\r\n([3166529](https://github.com/AztecProtocol/aztec-packages/commit/31665296c94a221098a473426e3686e56b4b9e96))\r\n* Persistence in helm chart for validator and boot node\r\n([#10543](https://github.com/AztecProtocol/aztec-packages/issues/10543))\r\n([f9810cc](https://github.com/AztecProtocol/aztec-packages/commit/f9810cc48f7379a0c02c76d8fc897d3ffc9d6ad8))\r\n* Prover-client exec timing analysis scripts.\r\n([82434a2](https://github.com/AztecProtocol/aztec-packages/commit/82434a296f267d517032b5c9b092d787c64af7bc))\r\n* PXE in the browser\r\n([#10353](https://github.com/AztecProtocol/aztec-packages/issues/10353))\r\n([676f673](https://github.com/AztecProtocol/aztec-packages/commit/676f673dfbcb14f5351a0068aef9ad9fa4ebf879))\r\n* PXE sync on demand\r\n([#10613](https://github.com/AztecProtocol/aztec-packages/issues/10613))\r\n([b2f1159](https://github.com/AztecProtocol/aztec-packages/commit/b2f11596e5c79be0c11ad298e734885e9657e640))\r\n* Remove auto verify mode from ClientIVC\r\n([#10599](https://github.com/AztecProtocol/aztec-packages/issues/10599))\r\n([b1d8b97](https://github.com/AztecProtocol/aztec-packages/commit/b1d8b978871948fbba639476465f4de6fb471292))\r\n* Rename Header to BlockHeader\r\n([#10372](https://github.com/AztecProtocol/aztec-packages/issues/10372))\r\n([0803964](https://github.com/AztecProtocol/aztec-packages/commit/0803964015492db81001c17252aa4b724e43797b))\r\n* Rm outgoing logs\r\n([#10486](https://github.com/AztecProtocol/aztec-packages/issues/10486))\r\n([c28beec](https://github.com/AztecProtocol/aztec-packages/commit/c28beec5014b14b7ea0b1f00d1642aab807fad87))\r\n* Sayonara old hints\r\n([#10547](https://github.com/AztecProtocol/aztec-packages/issues/10547))\r\n([dede16e](https://github.com/AztecProtocol/aztec-packages/commit/dede16e035115e1c6971079d12f62e3046407b36))\r\n* Several `nargo test` improvements\r\n(https://github.com/noir-lang/noir/pull/6728)\r\n([3166529](https://github.com/AztecProtocol/aztec-packages/commit/31665296c94a221098a473426e3686e56b4b9e96))\r\n* Several Updates in SMT verification module (part 1)\r\n([#10437](https://github.com/AztecProtocol/aztec-packages/issues/10437))\r\n([0c37672](https://github.com/AztecProtocol/aztec-packages/commit/0c376725a29ec18e25a7c9a89c0df8f5a1e06ff4))\r\n* **ssa:** Implement missing brillig constraints SSA check\r\n(https://github.com/noir-lang/noir/pull/6658)\r\n([3166529](https://github.com/AztecProtocol/aztec-packages/commit/31665296c94a221098a473426e3686e56b4b9e96))\r\n* Sync from aztec-packages (https://github.com/noir-lang/noir/pull/6730)\r\n([3166529](https://github.com/AztecProtocol/aztec-packages/commit/31665296c94a221098a473426e3686e56b4b9e96))\r\n* **test:** Check that `nargo::ops::transform_program` is idempotent\r\n(https://github.com/noir-lang/noir/pull/6694)\r\n([3166529](https://github.com/AztecProtocol/aztec-packages/commit/31665296c94a221098a473426e3686e56b4b9e96))\r\n* Unified create circuit from acir\r\n([#10440](https://github.com/AztecProtocol/aztec-packages/issues/10440))\r\n([a4dfe13](https://github.com/AztecProtocol/aztec-packages/commit/a4dfe13c1c0af3d527f5c9b2fcc38fe059e9bc38))\r\n* Update and generate test Prover.tomls for protocol circuits\r\n([#10659](https://github.com/AztecProtocol/aztec-packages/issues/10659))\r\n([eb5f18a](https://github.com/AztecProtocol/aztec-packages/commit/eb5f18a439c06afcbd90f5ea6339596a84ba4e8a))\r\n\r\n\r\n### Bug Fixes\r\n\r\n* [#10473](https://github.com/AztecProtocol/aztec-packages/issues/10473)\r\n([015ec0e](https://github.com/AztecProtocol/aztec-packages/commit/015ec0e506f76610e8378a5ad223a9c0185f78c9))\r\n* [#10474](https://github.com/AztecProtocol/aztec-packages/issues/10474)\r\n([015ec0e](https://github.com/AztecProtocol/aztec-packages/commit/015ec0e506f76610e8378a5ad223a9c0185f78c9))\r\n* Allow empty loop headers (https://github.com/noir-lang/noir/pull/6736)\r\n([3166529](https://github.com/AztecProtocol/aztec-packages/commit/31665296c94a221098a473426e3686e56b4b9e96))\r\n* Always respect aztec image pull policy\r\n([#10617](https://github.com/AztecProtocol/aztec-packages/issues/10617))\r\n([e7686f1](https://github.com/AztecProtocol/aztec-packages/commit/e7686f11811d1bd7cd6752116416687721dd62ed))\r\n* Attempt to fix flake in e2e cross chain messaging test\r\n([#10634](https://github.com/AztecProtocol/aztec-packages/issues/10634))\r\n([a69502c](https://github.com/AztecProtocol/aztec-packages/commit/a69502c3bd177a5ae502b7b9d13f260ffe19314e))\r\n* Bad merge on boxes\r\n([#10579](https://github.com/AztecProtocol/aztec-packages/issues/10579))\r\n([9b26651](https://github.com/AztecProtocol/aztec-packages/commit/9b266516d706ef0ab371e21bf622420b228bf94e))\r\n* Boxes webpack config\r\n([#10548](https://github.com/AztecProtocol/aztec-packages/issues/10548))\r\n([49f9418](https://github.com/AztecProtocol/aztec-packages/commit/49f941848ce1d42530c56e2941de6133ab852c14))\r\n* Bump hard coded SRS size for wasm from 2^19 to 2^10\r\n([#10596](https://github.com/AztecProtocol/aztec-packages/issues/10596))\r\n([a37f82d](https://github.com/AztecProtocol/aztec-packages/commit/a37f82d2ed6a4512eb38f8fa576f52a06ddbdfba))\r\n* Bump timeout for failing data store tests\r\n([#10639](https://github.com/AztecProtocol/aztec-packages/issues/10639))\r\n([c75fee0](https://github.com/AztecProtocol/aztec-packages/commit/c75fee0ff34f5019ffc55d424089724a66182a6b))\r\n* Correct size in bytes of a complete address\r\n([#10574](https://github.com/AztecProtocol/aztec-packages/issues/10574))\r\n([e72b988](https://github.com/AztecProtocol/aztec-packages/commit/e72b9889fe64dab5382b1352744f7ff4ac9884a1))\r\n* Destroy old masternet if we can\r\n([#10584](https://github.com/AztecProtocol/aztec-packages/issues/10584))\r\n([679684d](https://github.com/AztecProtocol/aztec-packages/commit/679684da0e00799a6c861234f2a4c731c1d6fa61))\r\n* Do not attempt proof quote on empty epoch\r\n([#10557](https://github.com/AztecProtocol/aztec-packages/issues/10557))\r\n([39d3bc2](https://github.com/AztecProtocol/aztec-packages/commit/39d3bc286ab7ac33a83f27e09df7dd1a482fadf4))\r\n* Do not load pino-pretty in production bundles\r\n([#10578](https://github.com/AztecProtocol/aztec-packages/issues/10578))\r\n([e515e6e](https://github.com/AztecProtocol/aztec-packages/commit/e515e6e7644180bab72eb693d83b9496919cc159))\r\n* Do not merge expressions that contain output witnesses\r\n(https://github.com/noir-lang/noir/pull/6757)\r\n([3166529](https://github.com/AztecProtocol/aztec-packages/commit/31665296c94a221098a473426e3686e56b4b9e96))\r\n* Ensure LMDB store metrics have hard coded descriptions\r\n([#10642](https://github.com/AztecProtocol/aztec-packages/issues/10642))\r\n([043e2c2](https://github.com/AztecProtocol/aztec-packages/commit/043e2c2ad3101a81a197f14307d9d8b1b9f699d3))\r\n* Formatting master\r\n([#10583](https://github.com/AztecProtocol/aztec-packages/issues/10583))\r\n([79e49c9](https://github.com/AztecProtocol/aztec-packages/commit/79e49c9419ddd96cb0046c70bce527b289203d1f))\r\n* Git dependency trailing slash\r\n(https://github.com/noir-lang/noir/pull/6725)\r\n([f4ed66b](https://github.com/AztecProtocol/aztec-packages/commit/f4ed66b6535818dc87d69ff451bb6aaabd2df8ec))\r\n* Improve type error when indexing a variable of unknown type\r\n(https://github.com/noir-lang/noir/pull/6744)\r\n([3166529](https://github.com/AztecProtocol/aztec-packages/commit/31665296c94a221098a473426e3686e56b4b9e96))\r\n* Link in README.md\r\n([#10471](https://github.com/AztecProtocol/aztec-packages/issues/10471))\r\n([fca9600](https://github.com/AztecProtocol/aztec-packages/commit/fca96007d6055dcf00b72a46630c680fcb6d190d))\r\n* Log level not honored with multi transport\r\n([#10643](https://github.com/AztecProtocol/aztec-packages/issues/10643))\r\n([e1e5864](https://github.com/AztecProtocol/aztec-packages/commit/e1e586479840b18f52f3218c499a476691d93e48))\r\n* Map entry point indexes after all ssa passes\r\n(https://github.com/noir-lang/noir/pull/6740)\r\n([3166529](https://github.com/AztecProtocol/aztec-packages/commit/31665296c94a221098a473426e3686e56b4b9e96))\r\n* Memory leak in the broker\r\n([#10567](https://github.com/AztecProtocol/aztec-packages/issues/10567))\r\n([ecc037f](https://github.com/AztecProtocol/aztec-packages/commit/ecc037f31fc2a5a02484762fdf90302059b34502))\r\n* Mispelled aztec\r\n([#10491](https://github.com/AztecProtocol/aztec-packages/issues/10491))\r\n([866a5f7](https://github.com/AztecProtocol/aztec-packages/commit/866a5f75ff4d4c9145fc00b269ff858e84b14c6c))\r\n* Parser would hand on function type with colon in it\r\n(https://github.com/noir-lang/noir/pull/6764)\r\n([3166529](https://github.com/AztecProtocol/aztec-packages/commit/31665296c94a221098a473426e3686e56b4b9e96))\r\n* Pass salt to deploy-l1-contracts.sh\r\n([#10586](https://github.com/AztecProtocol/aztec-packages/issues/10586))\r\n([d6be2c8](https://github.com/AztecProtocol/aztec-packages/commit/d6be2c84ba94ca69fd99a186374edc68afe3ebd6))\r\n* Pod anti affinity spans all namespaces\r\n([#10475](https://github.com/AztecProtocol/aztec-packages/issues/10475))\r\n([2d4dc3d](https://github.com/AztecProtocol/aztec-packages/commit/2d4dc3dffc98af0361b54f2884a8a0a9f496bed1))\r\n* Print ssa blocks without recursion\r\n(https://github.com/noir-lang/noir/pull/6715)\r\n([f4ed66b](https://github.com/AztecProtocol/aztec-packages/commit/f4ed66b6535818dc87d69ff451bb6aaabd2df8ec))\r\n* Println(\"{{}}\") was printing \"{{}}\" instead of \"{}\"\r\n(https://github.com/noir-lang/noir/pull/6745)\r\n([3166529](https://github.com/AztecProtocol/aztec-packages/commit/31665296c94a221098a473426e3686e56b4b9e96))\r\n* Properly trace storage reads to slots never written before in AVM\r\n([#10560](https://github.com/AztecProtocol/aztec-packages/issues/10560))\r\n([410c730](https://github.com/AztecProtocol/aztec-packages/commit/410c730d31773ce1f290f403e53f1e405fe6feda))\r\n* Remove auto verify in cbind ivc prove\r\n([#10627](https://github.com/AztecProtocol/aztec-packages/issues/10627))\r\n([d773423](https://github.com/AztecProtocol/aztec-packages/commit/d773423fb4c701d830ac2a732ab9bbc205396a63))\r\n* Remove otel collector endpoint\r\n([#10604](https://github.com/AztecProtocol/aztec-packages/issues/10604))\r\n([276a82c](https://github.com/AztecProtocol/aztec-packages/commit/276a82c2f34101fee1d2b7526f50dd76663c56cb))\r\n* Sequencer negative histogram recodings\r\n([#10490](https://github.com/AztecProtocol/aztec-packages/issues/10490))\r\n([623f3e2](https://github.com/AztecProtocol/aztec-packages/commit/623f3e240da5a1004b4b3fc025b17d9268482eb8))\r\n* Several format string fixes and improvements\r\n(https://github.com/noir-lang/noir/pull/6703)\r\n([f4ed66b](https://github.com/AztecProtocol/aztec-packages/commit/f4ed66b6535818dc87d69ff451bb6aaabd2df8ec))\r\n* Simulation error enriching\r\n([#10595](https://github.com/AztecProtocol/aztec-packages/issues/10595))\r\n([2c36088](https://github.com/AztecProtocol/aztec-packages/commit/2c36088c4009fef4054c2414bd50034b59e5f265))\r\n* Temporary fix for private kernel tail proving\r\n([#10593](https://github.com/AztecProtocol/aztec-packages/issues/10593))\r\n([d194cdf](https://github.com/AztecProtocol/aztec-packages/commit/d194cdfeabe4d90f786b1ab36a093a27be9f71c3))\r\n* Track published bytecode\r\n([#10636](https://github.com/AztecProtocol/aztec-packages/issues/10636))\r\n([cadb4ce](https://github.com/AztecProtocol/aztec-packages/commit/cadb4ce351fa83a55177e0cf50dadf09436b44a4))\r\n* Tweaking Fr and Fq fromString functionality to distinguish number-only\r\nstrings\r\n([#10529](https://github.com/AztecProtocol/aztec-packages/issues/10529))\r\n([736fce1](https://github.com/AztecProtocol/aztec-packages/commit/736fce1f77533925943ef363d1803b2e55f83609))\r\n* Use e2e structure in cbind\r\n([#10585](https://github.com/AztecProtocol/aztec-packages/issues/10585))\r\n([985aef1](https://github.com/AztecProtocol/aztec-packages/commit/985aef16ce612a9d3d7ff27b87b871a01911002e))\r\n\r\n\r\n### Miscellaneous\r\n\r\n* Add a few regression tests for\r\n[#6674](https://github.com/AztecProtocol/aztec-packages/issues/6674)\r\n(https://github.com/noir-lang/noir/pull/6687)\r\n([f4ed66b](https://github.com/AztecProtocol/aztec-packages/commit/f4ed66b6535818dc87d69ff451bb6aaabd2df8ec))\r\n* Add script to check for critical libraries supporting a given Noir\r\nversion (https://github.com/noir-lang/noir/pull/6697)\r\n([f4ed66b](https://github.com/AztecProtocol/aztec-packages/commit/f4ed66b6535818dc87d69ff451bb6aaabd2df8ec))\r\n* **avm:** Gas constants adjustment based on trace rows accounting\r\n([#10614](https://github.com/AztecProtocol/aztec-packages/issues/10614))\r\n([fc729ef](https://github.com/AztecProtocol/aztec-packages/commit/fc729ef3af7ec33f48dbb9fae3820a59a4a26479)),\r\ncloses\r\n[#10368](https://github.com/AztecProtocol/aztec-packages/issues/10368)\r\n* **avm:** More pilcom compat changes\r\n([#10569](https://github.com/AztecProtocol/aztec-packages/issues/10569))\r\n([f18d701](https://github.com/AztecProtocol/aztec-packages/commit/f18d701aa527c68a1adcc4b8acbb9c7bd239468a))\r\n* **avm:** Pilcom compatibility changes\r\n([#10544](https://github.com/AztecProtocol/aztec-packages/issues/10544))\r\n([fbc8c0e](https://github.com/AztecProtocol/aztec-packages/commit/fbc8c0e864b10d2265373688457a33d61517bbb4))\r\n* **avm:** Reduce the number of gates for fake AVM recursive verifier\r\n([#10619](https://github.com/AztecProtocol/aztec-packages/issues/10619))\r\n([0be44b2](https://github.com/AztecProtocol/aztec-packages/commit/0be44b2837c40e4332babc98f3c8bcc22bb0aa2f))\r\n* **avm:** Remove function selector from AvmExecutionEnvironment\r\n([#10532](https://github.com/AztecProtocol/aztec-packages/issues/10532))\r\n([fef5f93](https://github.com/AztecProtocol/aztec-packages/commit/fef5f93c617640116bb0eea0fc64d7f230c7b763))\r\n* Boxes tests cause resource issues\r\n([#10676](https://github.com/AztecProtocol/aztec-packages/issues/10676))\r\n([ccf1c78](https://github.com/AztecProtocol/aztec-packages/commit/ccf1c781c9658a486b6d05576641555f1de7f4ad))\r\n* Bump avm tree test timeout\r\n([323e2eb](https://github.com/AztecProtocol/aztec-packages/commit/323e2ebcbd39ae49366b30f33c2fa499a65160bb))\r\n* Bump exp1 config to 48 validators\r\n([#10577](https://github.com/AztecProtocol/aztec-packages/issues/10577))\r\n([0379718](https://github.com/AztecProtocol/aztec-packages/commit/03797181c72443a5a4aa4ce96df99e2517325f57))\r\n* Bump jest default test timeout to 30s\r\n([#10550](https://github.com/AztecProtocol/aztec-packages/issues/10550))\r\n([841bf48](https://github.com/AztecProtocol/aztec-packages/commit/841bf48c27767c3a4a53aacd0115582e8397910f))\r\n* Bump mocha timeout\r\n([#10571](https://github.com/AztecProtocol/aztec-packages/issues/10571))\r\n([35e525f](https://github.com/AztecProtocol/aztec-packages/commit/35e525fc9689718adecd49d3bd9e12c14640278d))\r\n* Bump proven timeout\r\n([#10680](https://github.com/AztecProtocol/aztec-packages/issues/10680))\r\n([3f5cf6c](https://github.com/AztecProtocol/aztec-packages/commit/3f5cf6c0cb8340c9db5f1cb9c968d824fa95936f))\r\n* Bump prover agents\r\n([#10626](https://github.com/AztecProtocol/aztec-packages/issues/10626))\r\n([64eea72](https://github.com/AztecProtocol/aztec-packages/commit/64eea721e3bba20b72c5f6d8922abc2a48c2ed65))\r\n* **ci:** Extend compiler memory report to external repos\r\n(https://github.com/noir-lang/noir/pull/6768)\r\n([3166529](https://github.com/AztecProtocol/aztec-packages/commit/31665296c94a221098a473426e3686e56b4b9e96))\r\n* **ci:** Handle external libraries in compilation timing report\r\n(https://github.com/noir-lang/noir/pull/6750)\r\n([3166529](https://github.com/AztecProtocol/aztec-packages/commit/31665296c94a221098a473426e3686e56b4b9e96))\r\n* **ci:** Prune launch templates job\r\n([#10561](https://github.com/AztecProtocol/aztec-packages/issues/10561))\r\n([d6e4f4c](https://github.com/AztecProtocol/aztec-packages/commit/d6e4f4c9d5ca0f3fa9a0074e5c196c04c6d244e7))\r\n* **ci:** Reenable `rerun-check` job\r\n([#10653](https://github.com/AztecProtocol/aztec-packages/issues/10653))\r\n([b2c4f48](https://github.com/AztecProtocol/aztec-packages/commit/b2c4f48db6bed6f0205a56d8df88ff8e1b02aafd))\r\n* Cleanup unrolling pass (https://github.com/noir-lang/noir/pull/6743)\r\n([3166529](https://github.com/AztecProtocol/aztec-packages/commit/31665296c94a221098a473426e3686e56b4b9e96))\r\n* Disable broken test\r\n([#10663](https://github.com/AztecProtocol/aztec-packages/issues/10663))\r\n([0771260](https://github.com/AztecProtocol/aztec-packages/commit/0771260db2d2026f1ad9bdcb5ba71bdca1424fa7))\r\n* Disable ivc integration yarn tests\r\n([#10625](https://github.com/AztecProtocol/aztec-packages/issues/10625))\r\n([7c50107](https://github.com/AztecProtocol/aztec-packages/commit/7c5010759f98aab2ee15325d8cbd8f2091aa6df0))\r\n* **docs:** Update branding\r\n(https://github.com/noir-lang/noir/pull/6759)\r\n([3166529](https://github.com/AztecProtocol/aztec-packages/commit/31665296c94a221098a473426e3686e56b4b9e96))\r\n* Documenting convenient redirect to the spartan creator\r\n([#10565](https://github.com/AztecProtocol/aztec-packages/issues/10565))\r\n([b94b8ee](https://github.com/AztecProtocol/aztec-packages/commit/b94b8eeaa24edc099472e205c5031c1096bf1f56))\r\n* Enable nightly tests\r\n([#10542](https://github.com/AztecProtocol/aztec-packages/issues/10542))\r\n([4fa068c](https://github.com/AztecProtocol/aztec-packages/commit/4fa068c692872b0fa2a1043a2f9e0984fd3c0e3d))\r\n* Faucet LB if public, proving devnet\r\n([#10665](https://github.com/AztecProtocol/aztec-packages/issues/10665))\r\n([996d921](https://github.com/AztecProtocol/aztec-packages/commit/996d9214aaf67d48673bab6554fafbc794e7afa2))\r\n* Fix build issue from bad merge\r\n([85c0676](https://github.com/AztecProtocol/aztec-packages/commit/85c0676647d9f8f7b2bceaf5f2da011b794abf68))\r\n* Fix migration notes\r\n([#10656](https://github.com/AztecProtocol/aztec-packages/issues/10656))\r\n([333d6ce](https://github.com/AztecProtocol/aztec-packages/commit/333d6ceffaab6e0be505a8f6214eb838846dcda4))\r\n* Fix public keys deserialization\r\n([#10647](https://github.com/AztecProtocol/aztec-packages/issues/10647))\r\n([12473c8](https://github.com/AztecProtocol/aztec-packages/commit/12473c85a073ef1a25f4f70881f77f3c08f41252))\r\n* Flush archiver metrics on startup\r\n([f9810cc](https://github.com/AztecProtocol/aztec-packages/commit/f9810cc48f7379a0c02c76d8fc897d3ffc9d6ad8))\r\n* Free memory for silenced warnings early\r\n(https://github.com/noir-lang/noir/pull/6748)\r\n([3166529](https://github.com/AztecProtocol/aztec-packages/commit/31665296c94a221098a473426e3686e56b4b9e96))\r\n* Give validators/boot-nodes 100Gi in network configs\r\n([f9810cc](https://github.com/AztecProtocol/aztec-packages/commit/f9810cc48f7379a0c02c76d8fc897d3ffc9d6ad8))\r\n* Handle errors in e2e teardown to fix e2e token\r\n([#10590](https://github.com/AztecProtocol/aztec-packages/issues/10590))\r\n([5d4cdc1](https://github.com/AztecProtocol/aztec-packages/commit/5d4cdc11977ea2af5e465092ce9e635414c13710))\r\n* Increase test timeout to reduce flakes\r\n([#10641](https://github.com/AztecProtocol/aztec-packages/issues/10641))\r\n([4ade2ad](https://github.com/AztecProtocol/aztec-packages/commit/4ade2ad6ab6d5306ba236457f0373122cc4b8fef))\r\n* Inject k8s pod name and uid\r\n([#10633](https://github.com/AztecProtocol/aztec-packages/issues/10633))\r\n([eb472ff](https://github.com/AztecProtocol/aztec-packages/commit/eb472ff8ef38f1045d2c586ad74b4c8774771ac0))\r\n* L2 gas maximum is per-TX-public-portion. AVM startup gas is now 20k.\r\n([#10214](https://github.com/AztecProtocol/aztec-packages/issues/10214))\r\n([1365401](https://github.com/AztecProtocol/aztec-packages/commit/1365401cb379d7206e268dc01a33110cecae7293))\r\n* Load balancers for the boot node, longer epochs\r\n([#10632](https://github.com/AztecProtocol/aztec-packages/issues/10632))\r\n([001bbb1](https://github.com/AztecProtocol/aztec-packages/commit/001bbb13c70df891f12d7dd1c67cc261d66e0c05))\r\n* Lock CI to use ubuntu 22.04\r\n(https://github.com/noir-lang/noir/pull/6755)\r\n([3166529](https://github.com/AztecProtocol/aztec-packages/commit/31665296c94a221098a473426e3686e56b4b9e96))\r\n* Log when validator enters commitee\r\n([#10615](https://github.com/AztecProtocol/aztec-packages/issues/10615))\r\n([7746a39](https://github.com/AztecProtocol/aztec-packages/commit/7746a395ed0f7488d80c6b37d451dc65f1b5938d)),\r\ncloses\r\n[#10337](https://github.com/AztecProtocol/aztec-packages/issues/10337)\r\n* Lower public tx gas limit to 6M\r\n([#10635](https://github.com/AztecProtocol/aztec-packages/issues/10635))\r\n([9836036](https://github.com/AztecProtocol/aztec-packages/commit/9836036053f1b5f3e57bf4e19bf0eb1a692306bd))\r\n* Merge queue CI\r\n([#10629](https://github.com/AztecProtocol/aztec-packages/issues/10629))\r\n([835e6fd](https://github.com/AztecProtocol/aztec-packages/commit/835e6fde9416ebcdf65b9c016f8e53885145e24c))\r\n* More bots for exp1\r\n([#10671](https://github.com/AztecProtocol/aztec-packages/issues/10671))\r\n([0ba2425](https://github.com/AztecProtocol/aztec-packages/commit/0ba242507e2e0c60cf0d9e8e2b1d1c92f31ebfc3))\r\n* More logs cleanup\r\n([#10630](https://github.com/AztecProtocol/aztec-packages/issues/10630))\r\n([00c629c](https://github.com/AztecProtocol/aztec-packages/commit/00c629ca2a34c996968e2f52b697cbdeaff54a77))\r\n* Move some nr utils around\r\n([#10553](https://github.com/AztecProtocol/aztec-packages/issues/10553))\r\n([d132f83](https://github.com/AztecProtocol/aztec-packages/commit/d132f83d595315565d54590bec69d25f7371559e))\r\n* Moving stuff from the aztec sequencer node guide into this README\r\n([#10570](https://github.com/AztecProtocol/aztec-packages/issues/10570))\r\n([93b8b1b](https://github.com/AztecProtocol/aztec-packages/commit/93b8b1bcc5cc3e86b63f923005cb163db0c6cb2c))\r\n* Optimise grand product computation round based on active ranges\r\n([#10460](https://github.com/AztecProtocol/aztec-packages/issues/10460))\r\n([7fa8f84](https://github.com/AztecProtocol/aztec-packages/commit/7fa8f844d9e389f8636118f1d3c3ecce707e771e))\r\n* Optimise older opcodes in reverse order\r\n(https://github.com/noir-lang/noir/pull/6476)\r\n([f4ed66b](https://github.com/AztecProtocol/aztec-packages/commit/f4ed66b6535818dc87d69ff451bb6aaabd2df8ec))\r\n* Redo typo PR by Madmaxs2 (https://github.com/noir-lang/noir/pull/6721)\r\n([f4ed66b](https://github.com/AztecProtocol/aztec-packages/commit/f4ed66b6535818dc87d69ff451bb6aaabd2df8ec))\r\n* Reduce bb_prover_full_rollup to a single block epoch test\r\n([#10679](https://github.com/AztecProtocol/aztec-packages/issues/10679))\r\n([0c2a4d9](https://github.com/AztecProtocol/aztec-packages/commit/0c2a4d9198c48a94939ce1475d60d201415849ae))\r\n* Remove Proxy from json rpc client\r\n([#10554](https://github.com/AztecProtocol/aztec-packages/issues/10554))\r\n([93b1c45](https://github.com/AztecProtocol/aztec-packages/commit/93b1c45f3d6b6be9db8c0604c285a7d5d0e3960a))\r\n* Remove warnings from protocol circuits\r\n([#10556](https://github.com/AztecProtocol/aztec-packages/issues/10556))\r\n([e065e05](https://github.com/AztecProtocol/aztec-packages/commit/e065e0590f20ed13bed1d0756ea29781b1cabd95))\r\n* Rename logger modules\r\n([#10404](https://github.com/AztecProtocol/aztec-packages/issues/10404))\r\n([7441767](https://github.com/AztecProtocol/aztec-packages/commit/7441767d7e8e7e7d602c447ca843dee43f8dc8f8)),\r\ncloses\r\n[#10125](https://github.com/AztecProtocol/aztec-packages/issues/10125)\r\n* Rename pxe script generate-package-info to generate\r\n([#10534](https://github.com/AztecProtocol/aztec-packages/issues/10534))\r\n([ead9c0b](https://github.com/AztecProtocol/aztec-packages/commit/ead9c0b3f43ffb707b5226a36544832ffcc7c910))\r\n* Replace relative paths to noir-protocol-circuits\r\n([acfd5df](https://github.com/AztecProtocol/aztec-packages/commit/acfd5df121d67ed75b2b22fe4efba82afb8c5949))\r\n* Replace relative paths to noir-protocol-circuits\r\n([6c0533f](https://github.com/AztecProtocol/aztec-packages/commit/6c0533f15d221a6792edc2495c4cd8f870112831))\r\n* Replace relative paths to noir-protocol-circuits\r\n([a245b95](https://github.com/AztecProtocol/aztec-packages/commit/a245b951a22e1df61fdecf566888aebba3ae6f8a))\r\n* Replace relative paths to noir-protocol-circuits\r\n([153c720](https://github.com/AztecProtocol/aztec-packages/commit/153c72003bcc31988b90f8666f140b0f21416ca5))\r\n* Replace relative paths to noir-protocol-circuits\r\n([a080436](https://github.com/AztecProtocol/aztec-packages/commit/a08043697bf41ad5de4256c8c366e4b4ef183be4))\r\n* Replace relative paths to noir-protocol-circuits\r\n([8419f5a](https://github.com/AztecProtocol/aztec-packages/commit/8419f5a22d43432368a1d445bf79c84bbb2d6161))\r\n* Secret derivation funcs naming cleanup\r\n([#10637](https://github.com/AztecProtocol/aztec-packages/issues/10637))\r\n([5c50711](https://github.com/AztecProtocol/aztec-packages/commit/5c50711429b93f5eb63ba264af532abb81995b48))\r\n* Simplify MSM with constant folding\r\n(https://github.com/noir-lang/noir/pull/6650)\r\n([f4ed66b](https://github.com/AztecProtocol/aztec-packages/commit/f4ed66b6535818dc87d69ff451bb6aaabd2df8ec))\r\n* **stdlib:** Remove Schnorr\r\n(https://github.com/noir-lang/noir/pull/6749)\r\n([3166529](https://github.com/AztecProtocol/aztec-packages/commit/31665296c94a221098a473426e3686e56b4b9e96))\r\n* Try replace callstack with a linked list\r\n(https://github.com/noir-lang/noir/pull/6747)\r\n([3166529](https://github.com/AztecProtocol/aztec-packages/commit/31665296c94a221098a473426e3686e56b4b9e96))\r\n* Tweak validator logs\r\n([#10597](https://github.com/AztecProtocol/aztec-packages/issues/10597))\r\n([9eaa527](https://github.com/AztecProtocol/aztec-packages/commit/9eaa5278766da48fd4a1eba4b9b03a49290df1b8))\r\n* Unprove devnet\r\n([#10683](https://github.com/AztecProtocol/aztec-packages/issues/10683))\r\n([1c92f77](https://github.com/AztecProtocol/aztec-packages/commit/1c92f77047f99ede7f6ab26684633d7eb26a97a3))\r\n* Update url to 2.5.4 (https://github.com/noir-lang/noir/pull/6741)\r\n([3166529](https://github.com/AztecProtocol/aztec-packages/commit/31665296c94a221098a473426e3686e56b4b9e96))\r\n* Use `NumericType` not `Type` for casts and numeric constants\r\n(https://github.com/noir-lang/noir/pull/6769)\r\n([3166529](https://github.com/AztecProtocol/aztec-packages/commit/31665296c94a221098a473426e3686e56b4b9e96))\r\n* **val:** Reject proposals not for the current or next slot\r\n([#10450](https://github.com/AztecProtocol/aztec-packages/issues/10450))\r\n([27620f5](https://github.com/AztecProtocol/aztec-packages/commit/27620f5ccd7bb23cf9d8cb8a913386338c47a08c))\r\n</details>\r\n\r\n<details><summary>barretenberg: 0.67.0</summary>\r\n\r\n##\r\n[0.67.0](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.66.0...barretenberg-v0.67.0)\r\n(2024-12-13)\r\n\r\n\r\n### ⚠ BREAKING CHANGES\r\n\r\n* lower public tx gas limit to 6M\r\n([#10635](https://github.com/AztecProtocol/aztec-packages/issues/10635))\r\n* l2 gas maximum is per-TX-public-portion. AVM startup gas is now 20k.\r\n([#10214](https://github.com/AztecProtocol/aztec-packages/issues/10214))\r\n* rename Header to BlockHeader\r\n([#10372](https://github.com/AztecProtocol/aztec-packages/issues/10372))\r\n\r\n### Features\r\n\r\n* Add verify proof calls to private kernels\r\n([#10533](https://github.com/AztecProtocol/aztec-packages/issues/10533))\r\n([ce0eee0](https://github.com/AztecProtocol/aztec-packages/commit/ce0eee0ef4a2084ec74b6dae0a75d18af5877ef8))\r\n* Adding fuzzer for ultra bigfield and relaxing ultra circuit checker\r\n([#10433](https://github.com/AztecProtocol/aztec-packages/issues/10433))\r\n([da4c47c](https://github.com/AztecProtocol/aztec-packages/commit/da4c47c5dc8caea3e860ac15a58b9ff7f011e4f6))\r\n* AVM inserts fee write on txs with public calls\r\n([#10394](https://github.com/AztecProtocol/aztec-packages/issues/10394))\r\n([98ba747](https://github.com/AztecProtocol/aztec-packages/commit/98ba7475ac0130dac4424a2f5cabdbe37eba5cc8))\r\n* CIVC browser proveThenVerify\r\n([#10431](https://github.com/AztecProtocol/aztec-packages/issues/10431))\r\n([8c064d4](https://github.com/AztecProtocol/aztec-packages/commit/8c064d484c686fdf00a100f65f1f740be4ef13cb))\r\n* GETCONTRACTINSTANCE and bytecode retrieval perform nullifier\r\nmembership checks\r\n([#10445](https://github.com/AztecProtocol/aztec-packages/issues/10445))\r\n([9301253](https://github.com/AztecProtocol/aztec-packages/commit/9301253f0488e6d96ed12a8c9bde72a653aa7d36)),\r\ncloses\r\n[#10377](https://github.com/AztecProtocol/aztec-packages/issues/10377)\r\n[#10379](https://github.com/AztecProtocol/aztec-packages/issues/10379)\r\n* Handle nested calls in witgen\r\n([#10384](https://github.com/AztecProtocol/aztec-packages/issues/10384))\r\n([1e21f31](https://github.com/AztecProtocol/aztec-packages/commit/1e21f31d430947f48dc9f5e52d0deb1af70ee705))\r\n* Keccak honk proving in bb.js\r\n([#10489](https://github.com/AztecProtocol/aztec-packages/issues/10489))\r\n([e0d7431](https://github.com/AztecProtocol/aztec-packages/commit/e0d743121674bcfdd73f84836c17645a5bc2df92))\r\n* Modify HonkRecursionConstraint to handle IPA claims\r\n([#10469](https://github.com/AztecProtocol/aztec-packages/issues/10469))\r\n([a204d1b](https://github.com/AztecProtocol/aztec-packages/commit/a204d1b60514d6321c2db5063375cc2bbd507fe8))\r\n* Remove auto verify mode from ClientIVC\r\n([#10599](https://github.com/AztecProtocol/aztec-packages/issues/10599))\r\n([b1d8b97](https://github.com/AztecProtocol/aztec-packages/commit/b1d8b978871948fbba639476465f4de6fb471292))\r\n* Rename Header to BlockHeader\r\n([#10372](https://github.com/AztecProtocol/aztec-packages/issues/10372))\r\n([0803964](https://github.com/AztecProtocol/aztec-packages/commit/0803964015492db81001c17252aa4b724e43797b))\r\n* Sayonara old hints\r\n([#10547](https://github.com/AztecProtocol/aztec-packages/issues/10547))\r\n([dede16e](https://github.com/AztecProtocol/aztec-packages/commit/dede16e035115e1c6971079d12f62e3046407b36))\r\n* Several Updates in SMT verification module (part 1)\r\n([#10437](https://github.com/AztecProtocol/aztec-packages/issues/10437))\r\n([0c37672](https://github.com/AztecProtocol/aztec-packages/commit/0c376725a29ec18e25a7c9a89c0df8f5a1e06ff4))\r\n* Unified create circuit from acir\r\n([#10440](https://github.com/AztecProtocol/aztec-packages/issues/10440))\r\n([a4dfe13](https://github.com/AztecProtocol/aztec-packages/commit/a4dfe13c1c0af3d527f5c9b2fcc38fe059e9bc38))\r\n\r\n\r\n### Bug Fixes\r\n\r\n* Remove auto verify in cbind ivc prove\r\n([#10627](https://github.com/AztecProtocol/aztec-packages/issues/10627))\r\n([d773423](https://github.com/AztecProtocol/aztec-packages/commit/d773423fb4c701d830ac2a732ab9bbc205396a63))\r\n* Use e2e structure in cbind\r\n([#10585](https://github.com/AztecProtocol/aztec-packages/issues/10585))\r\n([985aef1](https://github.com/AztecProtocol/aztec-packages/commit/985aef16ce612a9d3d7ff27b87b871a01911002e))\r\n\r\n\r\n### Miscellaneous\r\n\r\n* **avm:** Gas constants adjustment based on trace rows accounting\r\n([#10614](https://github.com/AztecProtocol/aztec-packages/issues/10614))\r\n([fc729ef](https://github.com/AztecProtocol/aztec-packages/commit/fc729ef3af7ec33f48dbb9fae3820a59a4a26479)),\r\ncloses\r\n[#10368](https://github.com/AztecProtocol/aztec-packages/issues/10368)\r\n* **avm:** More pilcom compat changes\r\n([#10569](https://github.com/AztecProtocol/aztec-packages/issues/10569))\r\n([f18d701](https://github.com/AztecProtocol/aztec-packages/commit/f18d701aa527c68a1adcc4b8acbb9c7bd239468a))\r\n* **avm:** Pilcom compatibility changes\r\n([#10544](https://github.com/AztecProtocol/aztec-packages/issues/10544))\r\n([fbc8c0e](https://github.com/AztecProtocol/aztec-packages/commit/fbc8c0e864b10d2265373688457a33d61517bbb4))\r\n* L2 gas maximum is per-TX-public-portion. AVM startup gas is now 20k.\r\n([#10214](https://github.com/AztecProtocol/aztec-packages/issues/10214))\r\n([1365401](https://github.com/AztecProtocol/aztec-packages/commit/1365401cb379d7206e268dc01a33110cecae7293))\r\n* Lower public tx gas limit to 6M\r\n([#10635](https://github.com/AztecProtocol/aztec-packages/issues/10635))\r\n([9836036](https://github.com/AztecProtocol/aztec-packages/commit/9836036053f1b5f3e57bf4e19bf0eb1a692306bd))\r\n* Optimise grand product computation round based on active ranges\r\n([#10460](https://github.com/AztecProtocol/aztec-packages/issues/10460))\r\n([7fa8f84](https://github.com/AztecProtocol/aztec-packages/commit/7fa8f844d9e389f8636118f1d3c3ecce707e771e))\r\n</details>\r\n\r\n---\r\nThis PR was generated with [Release\r\nPlease](https://github.com/googleapis/release-please). See\r\n[documentation](https://github.com/googleapis/release-please#release-please).",
          "timestamp": "2024-12-13T09:57:35+04:00",
          "tree_id": "d0495d5e867caf853c0fb4f45f894e693f21f6cf",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/19a500ffc09ab8bc367a78599dd73a07a04b426e"
        },
        "date": 1734071005490,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 25145.398811999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 23037.624112 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4599.495499,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4326.946879 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 91566.114821,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 91566115000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 16693.569533,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16693569000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2807751253,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2807751253 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 133547150,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 133547150 ns\nthreads: 1"
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
          "id": "a437e73558a936981f3eb3ba022b0770b75d9060",
          "message": "feat: Leaf index requests to the native world state can now be performed as a batch query (#10649)\n\nPreviously, every request to retrieve the index for a given leaf had to\r\nmade using a seperate request. Given the number of requests that need to\r\nbe handled, this has now been changed to offer a batch request instead.",
          "timestamp": "2024-12-13T07:14:58Z",
          "tree_id": "66d315ce353877078fa0e635e82436312c958aec",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a437e73558a936981f3eb3ba022b0770b75d9060"
        },
        "date": 1734076613325,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 24613.872254,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 22439.988110000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4527.275996000015,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4247.862298999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 89460.304128,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 89460304000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 16488.959654,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16488960000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2771149142,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2771149142 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 132249560,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 132249560 ns\nthreads: 1"
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
          "id": "95eb658f90687c75589b345f95a904d96e2a8e62",
          "message": "fix: use correct size for databus_id (#10673)\n\nApparently at the time the below issue was created things failed if we\nused the correct limited size for the databus_id poly. Maybe we made a\nmistake then or maybe something got fixed somewhere but either way it\nworks fine now.\n\nCloses https://github.com/AztecProtocol/barretenberg/issues/1107",
          "timestamp": "2024-12-13T08:38:01-07:00",
          "tree_id": "fdcfad76b95186e3a99f2191ef1ea7a7b7186a36",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/95eb658f90687c75589b345f95a904d96e2a8e62"
        },
        "date": 1734107323690,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 24899.681707000014,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 22677.870755 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4964.687263999991,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4604.072021 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 85814.899523,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 85814899000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15282.858836,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15282859000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2848966428,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2848966428 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 142325698,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 142325698 ns\nthreads: 1"
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
          "id": "1ab9e30d339cfd7a80f333e408c367c1f8bf49f8",
          "message": "chore: move decider PK allocation to methods (#10670)\n\nJust moves the poly allocation logic in the DeciderPK into methods to\nmake the constructor a bit easier to digest",
          "timestamp": "2024-12-13T10:10:17-07:00",
          "tree_id": "6ee4e9406d6aa65c99b5930ca899a4022dc4c9c5",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1ab9e30d339cfd7a80f333e408c367c1f8bf49f8"
        },
        "date": 1734111924169,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 24689.301865999994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 22774.397218000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4959.345542999983,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4669.006622999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 86123.74198100001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 86123742000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15252.595772,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15252597000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2826379764,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2826379764 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 143111162,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 143111162 ns\nthreads: 1"
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
          "id": "dd8cc7b93119c0376873a366a8310d2ebd2641de",
          "message": "fix: avm gas and non-member (#10709)\n\nThis PR fixes two things:\n\n1) Non-membership checks weren't properly being handled in the witgen\n(the assertion was too strict)\n2) End gas handling",
          "timestamp": "2024-12-13T12:30:14-05:00",
          "tree_id": "bb46a288641fd41349337325988b3ea32531c227",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/dd8cc7b93119c0376873a366a8310d2ebd2641de"
        },
        "date": 1734113892196,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 24885.552339000016,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 22674.212598000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4988.833784999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4659.767849999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 85769.545945,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 85769546000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15259.417675,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15259419000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2818920693,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2818920693 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 142163165,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 142163165 ns\nthreads: 1"
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
          "id": "e077980f8cce1fc7922c27d368b6dbced956aad2",
          "message": "feat: Note hash management in the AVM (#10666)\n\n- Removes old siloing and nonce application from transitional adapters\n- Handling of note hashes from private: nonrevertibles are inserted in\nsetup and revertibles at the start of app logic both in simulator and\nwitgen\n- Makes unique emitted note hashes from public inside the AVM itself,\nboth in simulator and witgen",
          "timestamp": "2024-12-13T19:31:04+01:00",
          "tree_id": "cd6fe26c8b8d8c54cf0045dc141e4bc31520ade1",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e077980f8cce1fc7922c27d368b6dbced956aad2"
        },
        "date": 1734122807222,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 24927.223591,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 23006.678515 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4994.324048999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4623.70481 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 87041.487295,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 87041487000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15383.449391,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15383449000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2845381257,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2845381257 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 142408584,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 142408584 ns\nthreads: 1"
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
          "id": "9fbcff60a63e0eca14c4e28677aed1fc5e6f2c14",
          "message": "feat: new 17 in 20 IVC bench added to actions (#10777)\n\nAdds an IVC benchmark for the case of size 2^17 circuits in a 2^20\nstructured trace. (Adds tracking to the bench action).",
          "timestamp": "2024-12-16T23:02:05Z",
          "tree_id": "8f363d4ee236d7c58863419ddddf8f2043676d5a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9fbcff60a63e0eca14c4e28677aed1fc5e6f2c14"
        },
        "date": 1734391986802,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 25477.18304600002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19903.286651000002 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 24623.846930000014,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 22525.467117999997 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4678.564453999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4387.705726 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 90482.67207700001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 90482672000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 16532.326059000003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16532326000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2791668686,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2791668686 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 133548634,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 133548634 ns\nthreads: 1"
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
          "id": "abd2226da3a159e7efb7cbef099e41739f665ef1",
          "message": "feat: sumcheck with disabled rows (#10068)\n\nZKFlavors are now running Sumcheck with last 4 rows disabled. To our\r\nknowledge, this is the cheapest approach to mask witness commitments,\r\ntheir evaluations, and, if necessary, the evaluations of their shifts at\r\nthe sumcheck challenge. \r\n\r\n**Note:** The last 4 rows of actual circuits in ECCVM and Translator are becoming\r\nun-constrained. Will be fixed in the follow-up PRs",
          "timestamp": "2024-12-17T10:43:36+01:00",
          "tree_id": "4215e7a77d3a7fcbeecacbe3d11ed4646896a605",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/abd2226da3a159e7efb7cbef099e41739f665ef1"
        },
        "date": 1734431820600,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 25431.55851899999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19831.529317 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 24433.107527999993,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 22535.97772 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4530.41484900001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4261.140504 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 94777.705245,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 94777705000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 16472.460823999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16472462000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2782079198,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2782079198 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 132657232,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 132657232 ns\nthreads: 1"
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
          "id": "923826a9d1bbed6739527a82b34d5610600eca1b",
          "message": "feat: Add tree equality assertions (#10756)\n\nAsserts in the public base that the end tree roots of the AVM equal the\r\ncalculated tree roots in the public base, to check correctness of the\r\nAVM insertions.",
          "timestamp": "2024-12-17T17:05:14+01:00",
          "tree_id": "8ed9a58664e9d107f47e19b8b7558943865043f8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/923826a9d1bbed6739527a82b34d5610600eca1b"
        },
        "date": 1734453257717,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 25364.301028,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19743.115241000003 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 24507.166215000012,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 22465.644397999997 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4533.45861599999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4258.466504 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 89489.743332,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 89489744000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 16500.062938,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16500064000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2795012783,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2795012783 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 133026956,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 133026956 ns\nthreads: 1"
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
          "id": "1516d7f7bd6a2adbb650bd7cdd572b33db98dbfc",
          "message": "feat: better initialization for permutation mapping components (#10750)\n\nConstructing the permutation argument polynomials (sigmas/ids) involves\nconstructing an intermediate object of type `PermutationMapping` which\ncontains information about the copy constraints in the circuit. The\ninitialization of this object was inefficient in two ways: (1) the\ncomponents were zero initialized only to be immediately initialized to\nnon-zero values, and (2) the initialization was not multithreaded. This\nPR introduces a minor refactor of the underlying structures in\n`PermutationMapping` so that the zero initialization can be avoided\naltogether and the initialization to non-zero values can be done in\nparallel. (In particular instead of vectors of a struct with components\n{uint32_t, uint8_t, bool, bool}, we now have shared pointers to arrays\nof the corresponding type {*uint32_t[], *uint8_t[], *bool[], *bool[]}.\nThis structure allows for efficient use of the slab allocator and\nremoves the need to default zero initialize).\n\nBenchmark highlights for the case of 2^17 circuits in a 2^20 trace:\n\nMaster:\n```\nClientIVCBench/Full/6      24684 ms        20203 ms\nDeciderProvingKey(Circuit&)(t)          2365\ncompute_permutation_argument_polynomials(t)=912.772M\n```\n\nBranch:\n```\nClientIVCBench/Full/6      23955 ms        19680 ms\nDeciderProvingKey(Circuit&)(t)          1834     8.02%\ncompute_permutation_argument_polynomials(t)=437.54M\n```",
          "timestamp": "2024-12-17T10:21:30-07:00",
          "tree_id": "94da91aa41fe393a61a6d77a4507307076601ec5",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1516d7f7bd6a2adbb650bd7cdd572b33db98dbfc"
        },
        "date": 1734459325266,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 25351.831096000013,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19706.370672999998 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 24453.681662999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 22160.444612 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4465.00308200001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4184.896727000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 89150.73771,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 89150738000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 16538.883102,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16538884000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2779700237,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2779700237 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 133622421,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 133622421 ns\nthreads: 1"
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
          "id": "a3fba8442fdd62f429054c3367984fd4206bbbeb",
          "message": "feat: Don't store every block number in block indices DB (#10658)\n\nThe block indices DB is what enables clients to query the block number\r\nfor a given index. Where there were blocks of zero size (so multiple\r\nblock numbers against an index) it was storing every block number\r\nagainst that index. This could result in an unbounded values size in the\r\nDB. We now just store the block range in this scenario.",
          "timestamp": "2024-12-17T19:20:05Z",
          "tree_id": "789f2831838abeece429cb22541568eaed2ef8d6",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a3fba8442fdd62f429054c3367984fd4206bbbeb"
        },
        "date": 1734464936521,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 25059.891827,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19444.546301000002 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 24237.424376000006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 22342.148587 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4443.4232689999935,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4172.05496 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 89737.686278,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 89737686000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 16466.044313000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16466045000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2772927441,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2772927441 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 132240337,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 132240337 ns\nthreads: 1"
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
          "id": "4ac13e642c958392ce5606684c044ea014325e26",
          "message": "chore(avm): radix opcode - remove immediates (#10696)\n\nResolves #10371",
          "timestamp": "2024-12-17T16:45:48-05:00",
          "tree_id": "cddaab5cb2ad0941b9e2335627f82703c7efc1ac",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/4ac13e642c958392ce5606684c044ea014325e26"
        },
        "date": 1734475802836,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 25660.944038999987,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19994.639785 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 25013.04731799999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 22815.900613 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4523.916942000028,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4222.090227999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 90880.85256,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 90880852000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 16681.662177,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16681663000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2856760256,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2856760256 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 135708293,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 135708293 ns\nthreads: 1"
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
          "id": "b8bdb529719c1f72244e904ea667462458a43317",
          "message": "fix: AVM witgen track gas for nested calls and external halts (#10731)\n\nResolves https://github.com/AztecProtocol/aztec-packages/issues/10033\nResolves https://github.com/AztecProtocol/aztec-packages/issues/10374\n\nThis PR does the following:\n- Witgen handles out-of-gas errors for all opcodes \n- all halts (return/revert/exceptional) work as follows:\n- charge gas for the problematic instruction as always, adding a row to\nthe gas trace\n    - pop the parent/caller's latest gas from the stack\n- call a helper function on the gas trace to mutate that most recent gas\nrow, returning to the parent's latest gas minus any consumed gas (all\ngas consumed on exceptional halt)\n- `GasTraceEntry` includes a field `is_halt_or_first_row_in_nested_call`\nwhich lets us break gas rules on a halt or when starting a nested call\nbecause in both cases gas will jump.\n- `constrain_gas` returns a bool `out_of_gas` so that opcode\nimplementations can handle out of gas\n- `write_to_memory` now has an option to skip the \"jump back to correct\npc\" which was problematic when halting because the `jump` wouldn't\nresult in a next row with the right pc\n\nExplanation on how gas works for calls:\n- Parent snapshots its gas right before a nested call in\n`ctx.*_gas_left`\n- Nested call is given a `ctx.start_*_gas_left` and the gas trace is\nforced to that same value\n- throughout the nested call, the gas trace operates normally, charging\nper instruction\n- when any halt is encountered, the instruction that halted must have\nits gas charged normally, but then we call a helper function on the gas\ntrace to mutate the most recent row, flagging it to eventually become a\nsort of \"fake\" row that skips some constraints\n- the mutation of the halting row resets the gas to the parents last gas\nbefore the call (minus however much gas was consumed by the nested\ncall... if exceptional halt, that is _all_ allocated gas)\n\n\nFollow-up work\n- properly constrain gas for nested calls, returns, reverts and\nexceptional halts\n- if `jump` exceptionally halts (i.e. out of gas), it should be okay\nthat the next row doesn't have the target pc\n- Handle the edge case when an error is encountered on\nreturn/revert/call, but after the stack has already been modified",
          "timestamp": "2024-12-17T17:14:42-05:00",
          "tree_id": "bd71c7a2e1cb3fc04df137e14dbf7807caa7e2e6",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/b8bdb529719c1f72244e904ea667462458a43317"
        },
        "date": 1734476721724,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 25644.359549,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19862.703634999998 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 24815.773396999986,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 22861.514854999998 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4514.9682639999755,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4231.020416999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 91875.45447,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 91875455000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 16689.201242,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16689202000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2841293749,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2841293749 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 135609740,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 135609740 ns\nthreads: 1"
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
          "id": "113245eb5757ea4fa8dd9fd5faa22ecb43255420",
          "message": "chore(master): Release 0.67.1",
          "timestamp": "2024-12-18T01:03:08Z",
          "url": "https://github.com/AztecProtocol/aztec-packages/pull/10684/commits/113245eb5757ea4fa8dd9fd5faa22ecb43255420"
        },
        "date": 1734484730560,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 26850.193681999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 21104.154198 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 25913.98430199999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 23714.04403 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4813.244138000016,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4466.447006 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 91026.32383299999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 91026323000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 17241.906355000003,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17241906000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2877515977,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2877515977 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 138447633,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 138447633 ns\nthreads: 1"
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
          "id": "c90bb16a5880c42752809f383f517181e6f8a53a",
          "message": "chore(master): Release 0.67.1 (#10684)\n\n:robot: I have created a release *beep* *boop*\n---\n\n\n<details><summary>aztec-package: 0.67.1</summary>\n\n##\n[0.67.1](https://github.com/AztecProtocol/aztec-packages/compare/aztec-package-v0.67.0...aztec-package-v0.67.1)\n(2024-12-17)\n\n\n### Miscellaneous\n\n* Granular CLI imports to reduce start time\n([#10778](https://github.com/AztecProtocol/aztec-packages/issues/10778))\n([e2fd046](https://github.com/AztecProtocol/aztec-packages/commit/e2fd046250664cd785269a718b036c0310dfcda7))\n* Split up protocol contract artifacts\n([#10765](https://github.com/AztecProtocol/aztec-packages/issues/10765))\n([5a9ca18](https://github.com/AztecProtocol/aztec-packages/commit/5a9ca18ceee03ca2175605d1029153a7bf228ea9))\n* Trace and handle errors in running promises\n([#10645](https://github.com/AztecProtocol/aztec-packages/issues/10645))\n([4cc0a6d](https://github.com/AztecProtocol/aztec-packages/commit/4cc0a6d832e6ee1c3fcc6876517ed3f743f59d4b))\n</details>\n\n<details><summary>barretenberg.js: 0.67.1</summary>\n\n##\n[0.67.1](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg.js-v0.67.0...barretenberg.js-v0.67.1)\n(2024-12-17)\n\n\n### Features\n\n* PXE browser proving\n([#10704](https://github.com/AztecProtocol/aztec-packages/issues/10704))\n([46da3cc](https://github.com/AztecProtocol/aztec-packages/commit/46da3cc8a9c1c407a8ad2857695eea794e334efd))\n\n\n### Bug Fixes\n\n* **bb.js:** Use globalThis instead of self\n([#10747](https://github.com/AztecProtocol/aztec-packages/issues/10747))\n([309b5f7](https://github.com/AztecProtocol/aztec-packages/commit/309b5f74862089001e3159bdb52cbc8b60c71dc1)),\ncloses\n[#10741](https://github.com/AztecProtocol/aztec-packages/issues/10741)\n* Casting vk to rawbuffer before wasm so it reads from the correct\noffset\n([#10769](https://github.com/AztecProtocol/aztec-packages/issues/10769))\n([6a5bcfd](https://github.com/AztecProtocol/aztec-packages/commit/6a5bcfd2dc1a2bef6df2b93e9afa137a9b4ea315))\n</details>\n\n<details><summary>aztec-packages: 0.67.1</summary>\n\n##\n[0.67.1](https://github.com/AztecProtocol/aztec-packages/compare/aztec-packages-v0.67.0...aztec-packages-v0.67.1)\n(2024-12-17)\n\n\n### Features\n\n* `nargo test -q` (or `nargo test --format terse`)\n(https://github.com/noir-lang/noir/pull/6776)\n([8956e28](https://github.com/AztecProtocol/aztec-packages/commit/8956e28269a045732e733b5197bdab5e46cdf354))\n* Add `(x | 1)` optimization for booleans\n(https://github.com/noir-lang/noir/pull/6795)\n([8956e28](https://github.com/AztecProtocol/aztec-packages/commit/8956e28269a045732e733b5197bdab5e46cdf354))\n* Add `nargo test --format json`\n(https://github.com/noir-lang/noir/pull/6796)\n([d74d0fc](https://github.com/AztecProtocol/aztec-packages/commit/d74d0fcec24c533abc28320302e027470843e80c))\n* Add tree equality assertions\n([#10756](https://github.com/AztecProtocol/aztec-packages/issues/10756))\n([923826a](https://github.com/AztecProtocol/aztec-packages/commit/923826a9d1bbed6739527a82b34d5610600eca1b))\n* **avm:** Migrate simulator memory to a map\n([#10715](https://github.com/AztecProtocol/aztec-packages/issues/10715))\n([64d5f2b](https://github.com/AztecProtocol/aztec-packages/commit/64d5f2bd0dffe637fbff436ea651eb240256ab2c)),\ncloses\n[#10370](https://github.com/AztecProtocol/aztec-packages/issues/10370)\n* Better initialization for permutation mapping components\n([#10750](https://github.com/AztecProtocol/aztec-packages/issues/10750))\n([1516d7f](https://github.com/AztecProtocol/aztec-packages/commit/1516d7f7bd6a2adbb650bd7cdd572b33db98dbfc))\n* Blobs 2.\n([#10188](https://github.com/AztecProtocol/aztec-packages/issues/10188))\n([d0a4b2f](https://github.com/AztecProtocol/aztec-packages/commit/d0a4b2f011a25e59d5ef077cfefae4490ae1c263))\n* **blobs:** Add consensus client url to config\n([#10059](https://github.com/AztecProtocol/aztec-packages/issues/10059))\n([1e15bf5](https://github.com/AztecProtocol/aztec-packages/commit/1e15bf58390f6c15afc3b430edd89b4c28137c2b))\n* Check max fees per gas\n([#10283](https://github.com/AztecProtocol/aztec-packages/issues/10283))\n([4e59b06](https://github.com/AztecProtocol/aztec-packages/commit/4e59b06cd1956d43bc44a219448603b4bcf58d27))\n* **cli:** Verify `return` against ABI and `Prover.toml`\n(https://github.com/noir-lang/noir/pull/6765)\n([8956e28](https://github.com/AztecProtocol/aztec-packages/commit/8956e28269a045732e733b5197bdab5e46cdf354))\n* Don't store every block number in block indices DB\n([#10658](https://github.com/AztecProtocol/aztec-packages/issues/10658))\n([a3fba84](https://github.com/AztecProtocol/aztec-packages/commit/a3fba8442fdd62f429054c3367984fd4206bbbeb))\n* Json output for get_node_info\n([#10771](https://github.com/AztecProtocol/aztec-packages/issues/10771))\n([b086c52](https://github.com/AztecProtocol/aztec-packages/commit/b086c52110e5bc79a3d8eccbc2bc50cd68b3dc9b))\n* Leaf index requests to the native world state can now be performed as\na batch query\n([#10649](https://github.com/AztecProtocol/aztec-packages/issues/10649))\n([a437e73](https://github.com/AztecProtocol/aztec-packages/commit/a437e73558a936981f3eb3ba022b0770b75d9060))\n* New 17 in 20 IVC bench added to actions\n([#10777](https://github.com/AztecProtocol/aztec-packages/issues/10777))\n([9fbcff6](https://github.com/AztecProtocol/aztec-packages/commit/9fbcff60a63e0eca14c4e28677aed1fc5e6f2c14))\n* Note hash management in the AVM\n([#10666](https://github.com/AztecProtocol/aztec-packages/issues/10666))\n([e077980](https://github.com/AztecProtocol/aztec-packages/commit/e077980f8cce1fc7922c27d368b6dbced956aad2))\n* **p2p:** Activate gossipsub tx validators\n([#10695](https://github.com/AztecProtocol/aztec-packages/issues/10695))\n([9cce2c6](https://github.com/AztecProtocol/aztec-packages/commit/9cce2c6fbae00008451940157690e0b5b99d9e59))\n* **p2p:** Attestation pool persistence\n([#10667](https://github.com/AztecProtocol/aztec-packages/issues/10667))\n([dacef9f](https://github.com/AztecProtocol/aztec-packages/commit/dacef9f7f9f11c8ec35ecd333748a9ae8c24d428))\n* PXE browser proving\n([#10704](https://github.com/AztecProtocol/aztec-packages/issues/10704))\n([46da3cc](https://github.com/AztecProtocol/aztec-packages/commit/46da3cc8a9c1c407a8ad2857695eea794e334efd))\n* **ssa:** Bring back tracking of RC instructions during DIE\n(https://github.com/noir-lang/noir/pull/6783)\n([308c5ce](https://github.com/AztecProtocol/aztec-packages/commit/308c5cef519b68f5951750851124c0bf8f4ba7ee))\n* **ssa:** Hoist MakeArray instructions during loop invariant code\nmotion (https://github.com/noir-lang/noir/pull/6782)\n([8956e28](https://github.com/AztecProtocol/aztec-packages/commit/8956e28269a045732e733b5197bdab5e46cdf354))\n* Sumcheck with disabled rows\n([#10068](https://github.com/AztecProtocol/aztec-packages/issues/10068))\n([abd2226](https://github.com/AztecProtocol/aztec-packages/commit/abd2226da3a159e7efb7cbef099e41739f665ef1))\n* TXE detects duplicate nullifiers\n([#10764](https://github.com/AztecProtocol/aztec-packages/issues/10764))\n([7f70110](https://github.com/AztecProtocol/aztec-packages/commit/7f701105c2ac44df9cafedc834d77d4eabd92710))\n\n\n### Bug Fixes\n\n* Always remove nullified notes\n([#10722](https://github.com/AztecProtocol/aztec-packages/issues/10722))\n([5e4b46d](https://github.com/AztecProtocol/aztec-packages/commit/5e4b46d577ebf63114a5a5a1c5b6d2947d3b2567))\n* Avm gas and non-member\n([#10709](https://github.com/AztecProtocol/aztec-packages/issues/10709))\n([dd8cc7b](https://github.com/AztecProtocol/aztec-packages/commit/dd8cc7b93119c0376873a366a8310d2ebd2641de))\n* AVM witgen track gas for nested calls and external halts\n([#10731](https://github.com/AztecProtocol/aztec-packages/issues/10731))\n([b8bdb52](https://github.com/AztecProtocol/aztec-packages/commit/b8bdb529719c1f72244e904ea667462458a43317))\n* **bb.js:** Use globalThis instead of self\n([#10747](https://github.com/AztecProtocol/aztec-packages/issues/10747))\n([309b5f7](https://github.com/AztecProtocol/aztec-packages/commit/309b5f74862089001e3159bdb52cbc8b60c71dc1)),\ncloses\n[#10741](https://github.com/AztecProtocol/aztec-packages/issues/10741)\n* Block building test timeout\n([#10812](https://github.com/AztecProtocol/aztec-packages/issues/10812))\n([2cad3e5](https://github.com/AztecProtocol/aztec-packages/commit/2cad3e59765a67ed14158ce556433120e9efd809))\n* Cache\n([#10692](https://github.com/AztecProtocol/aztec-packages/issues/10692))\n([1b1306c](https://github.com/AztecProtocol/aztec-packages/commit/1b1306c7dbd9d363181146e02181af4727779b42))\n* Casting vk to rawbuffer before wasm so it reads from the correct\noffset\n([#10769](https://github.com/AztecProtocol/aztec-packages/issues/10769))\n([6a5bcfd](https://github.com/AztecProtocol/aztec-packages/commit/6a5bcfd2dc1a2bef6df2b93e9afa137a9b4ea315))\n* **ci:** Network-test timing\n([#10725](https://github.com/AztecProtocol/aztec-packages/issues/10725))\n([9c9a2dc](https://github.com/AztecProtocol/aztec-packages/commit/9c9a2dcac8f7e14c1c5ec5d54d48a04a80284497))\n* Disable failure persistance in nargo test fuzzing\n(https://github.com/noir-lang/noir/pull/6777)\n([8956e28](https://github.com/AztecProtocol/aztec-packages/commit/8956e28269a045732e733b5197bdab5e46cdf354))\n* Get e2e jobs\n([#10689](https://github.com/AztecProtocol/aztec-packages/issues/10689))\n([37e1999](https://github.com/AztecProtocol/aztec-packages/commit/37e1999f9f96271faa8cba2fda44858276266a0c))\n* Give build:fast a try in build\n([#10702](https://github.com/AztecProtocol/aztec-packages/issues/10702))\n([32095f6](https://github.com/AztecProtocol/aztec-packages/commit/32095f63f4e1585e66251369e234c742aab0fa04))\n* Minimal change to avoid reverting entire PR\n[#6685](https://github.com/AztecProtocol/aztec-packages/issues/6685)\n(https://github.com/noir-lang/noir/pull/6778)\n([8956e28](https://github.com/AztecProtocol/aztec-packages/commit/8956e28269a045732e733b5197bdab5e46cdf354))\n* Optimizer to keep track of changing opcode locations\n(https://github.com/noir-lang/noir/pull/6781)\n([8956e28](https://github.com/AztecProtocol/aztec-packages/commit/8956e28269a045732e733b5197bdab5e46cdf354))\n* Race condition in block stream\n([#10779](https://github.com/AztecProtocol/aztec-packages/issues/10779))\n([64bccd0](https://github.com/AztecProtocol/aztec-packages/commit/64bccd0e3423856aadc58890e6a689db4af08356))\n* Race condition when cleaning epoch proof quotes\n([#10795](https://github.com/AztecProtocol/aztec-packages/issues/10795))\n([f540fbe](https://github.com/AztecProtocol/aztec-packages/commit/f540fbee724c2bfe29e0b0bca7759c721a8aaec8))\n* **testdata:** Relative path calculation\n([#10791](https://github.com/AztecProtocol/aztec-packages/issues/10791))\n([5a530db](https://github.com/AztecProtocol/aztec-packages/commit/5a530db5c42743e6eff846669141527ae1344bfe))\n* Try fix e2e epochs in CI\n([#10804](https://github.com/AztecProtocol/aztec-packages/issues/10804))\n([ba28788](https://github.com/AztecProtocol/aztec-packages/commit/ba28788de22b3209ec324633e91875b3b4b86332))\n* Use correct size for databus_id\n([#10673](https://github.com/AztecProtocol/aztec-packages/issues/10673))\n([95eb658](https://github.com/AztecProtocol/aztec-packages/commit/95eb658f90687c75589b345f95a904d96e2a8e62))\n* Use extension in docs link so it also works on GitHub\n(https://github.com/noir-lang/noir/pull/6787)\n([8956e28](https://github.com/AztecProtocol/aztec-packages/commit/8956e28269a045732e733b5197bdab5e46cdf354))\n* Use throw instead of reject in broker facade\n([#10735](https://github.com/AztecProtocol/aztec-packages/issues/10735))\n([cc6a72b](https://github.com/AztecProtocol/aztec-packages/commit/cc6a72be1c8dd5b133b5d82eac5224eef89d4ede))\n\n\n### Miscellaneous\n\n* `getLogsByTags` request batching in `syncTaggedLogs`\n([#10716](https://github.com/AztecProtocol/aztec-packages/issues/10716))\n([bbbf38b](https://github.com/AztecProtocol/aztec-packages/commit/bbbf38b35c7f04414eeb7991a1ee45b19b16664f))\n* Add `Instruction::map_values_mut`\n(https://github.com/noir-lang/noir/pull/6756)\n([308c5ce](https://github.com/AztecProtocol/aztec-packages/commit/308c5cef519b68f5951750851124c0bf8f4ba7ee))\n* Add errors to abis\n([#10697](https://github.com/AztecProtocol/aztec-packages/issues/10697))\n([5c8e017](https://github.com/AztecProtocol/aztec-packages/commit/5c8e0174aade70c418a2d02cd9dc0ded3baa0745))\n* Add retries for prover node p2p test\n([#10699](https://github.com/AztecProtocol/aztec-packages/issues/10699))\n([4115bf9](https://github.com/AztecProtocol/aztec-packages/commit/4115bf985108e183f8a57aaf76289326251b8c7b))\n* Add spans to proving job\n([#10794](https://github.com/AztecProtocol/aztec-packages/issues/10794))\n([df3c51b](https://github.com/AztecProtocol/aztec-packages/commit/df3c51bfdb9770a95f6223fc85baf8632ca93279))\n* Average alerts across namespace for 1 hour\n([#10827](https://github.com/AztecProtocol/aztec-packages/issues/10827))\n([962a7a2](https://github.com/AztecProtocol/aztec-packages/commit/962a7a25d71d208992b16fcfd21e86874db5ec05))\n* **avm:** Disable fake avm recursive verifier from the public base\nrollup\n([#10690](https://github.com/AztecProtocol/aztec-packages/issues/10690))\n([b6c9c41](https://github.com/AztecProtocol/aztec-packages/commit/b6c9c4141b4ca6b1fc847068d352ee17590dea09))\n* **avm:** Radix opcode - remove immediates\n([#10696](https://github.com/AztecProtocol/aztec-packages/issues/10696))\n([4ac13e6](https://github.com/AztecProtocol/aztec-packages/commit/4ac13e642c958392ce5606684c044ea014325e26)),\ncloses\n[#10371](https://github.com/AztecProtocol/aztec-packages/issues/10371)\n* Better reqresp logging + handle empty responses in snappy\n([#10657](https://github.com/AztecProtocol/aztec-packages/issues/10657))\n([934107f](https://github.com/AztecProtocol/aztec-packages/commit/934107f35c2f2772ad422bfa34357bbd64f5049d))\n* Bump metrics and node pool\n([#10745](https://github.com/AztecProtocol/aztec-packages/issues/10745))\n([9bb88bf](https://github.com/AztecProtocol/aztec-packages/commit/9bb88bf323e68f42f34cba74ec270681d76d9bd4))\n* Change Id to use a u32 (https://github.com/noir-lang/noir/pull/6807)\n([d74d0fc](https://github.com/AztecProtocol/aztec-packages/commit/d74d0fcec24c533abc28320302e027470843e80c))\n* **ci:** Active rollup circuits in compilation report\n(https://github.com/noir-lang/noir/pull/6813)\n([308c5ce](https://github.com/AztecProtocol/aztec-packages/commit/308c5cef519b68f5951750851124c0bf8f4ba7ee))\n* **ci:** Add bloblib to external checks\n(https://github.com/noir-lang/noir/pull/6818)\n([381b0b8](https://github.com/AztecProtocol/aztec-packages/commit/381b0b84d87dd31f8ab5a3e62928f9992837d4c0))\n* Cleanup after e2e tests\n([#10748](https://github.com/AztecProtocol/aztec-packages/issues/10748))\n([284b0a4](https://github.com/AztecProtocol/aztec-packages/commit/284b0a496f42813b956e55fbcd41c864dd278241))\n* Disable ARM CI\n([#10682](https://github.com/AztecProtocol/aztec-packages/issues/10682))\n([b16945b](https://github.com/AztecProtocol/aztec-packages/commit/b16945b9c9e26d8de5502f698d2bd71e22c53807))\n* Do not print entire functions when running debug trace\n(https://github.com/noir-lang/noir/pull/6814)\n([308c5ce](https://github.com/AztecProtocol/aztec-packages/commit/308c5cef519b68f5951750851124c0bf8f4ba7ee))\n* **docs:** Update migration notes\n([#10829](https://github.com/AztecProtocol/aztec-packages/issues/10829))\n([be7cadf](https://github.com/AztecProtocol/aztec-packages/commit/be7cadf12d25042d39e6a500ae32a5002102d3da))\n* **docs:** Workaround (https://github.com/noir-lang/noir/pull/6819)\n([381b0b8](https://github.com/AztecProtocol/aztec-packages/commit/381b0b84d87dd31f8ab5a3e62928f9992837d4c0))\n* Granular CLI imports to reduce start time\n([#10778](https://github.com/AztecProtocol/aztec-packages/issues/10778))\n([e2fd046](https://github.com/AztecProtocol/aztec-packages/commit/e2fd046250664cd785269a718b036c0310dfcda7))\n* Log error in retry module\n([#10719](https://github.com/AztecProtocol/aztec-packages/issues/10719))\n([84ea539](https://github.com/AztecProtocol/aztec-packages/commit/84ea539145173a88bddfdc617051f16a7aba9834))\n* Manage call stacks using a tree\n(https://github.com/noir-lang/noir/pull/6791)\n([381b0b8](https://github.com/AztecProtocol/aztec-packages/commit/381b0b84d87dd31f8ab5a3e62928f9992837d4c0))\n* Move decider PK allocation to methods\n([#10670](https://github.com/AztecProtocol/aztec-packages/issues/10670))\n([1ab9e30](https://github.com/AztecProtocol/aztec-packages/commit/1ab9e30d339cfd7a80f333e408c367c1f8bf49f8))\n* **p2p:** Move services into folders\n([#10694](https://github.com/AztecProtocol/aztec-packages/issues/10694))\n([e28d12a](https://github.com/AztecProtocol/aztec-packages/commit/e28d12a3cdb182c905995a5ece4cc1b3d1d09482))\n* **prover:** Prover node should not gossip attestations\n([#10672](https://github.com/AztecProtocol/aztec-packages/issues/10672))\n([41fc0f0](https://github.com/AztecProtocol/aztec-packages/commit/41fc0f047a6412b824dc33b49cf8fd98c99598aa))\n* Remove default export for noir contracts js\n([#10762](https://github.com/AztecProtocol/aztec-packages/issues/10762))\n([c8e7763](https://github.com/AztecProtocol/aztec-packages/commit/c8e77639bf7f30dffe98ae335d5d1137da838e55))\n* Remove sinon in favor of a date provider\n([#10705](https://github.com/AztecProtocol/aztec-packages/issues/10705))\n([3d3fabb](https://github.com/AztecProtocol/aztec-packages/commit/3d3fabb38b160c7f98636d0f4d7c6d3c22c6227e))\n* Remove spurious echo\n([#10774](https://github.com/AztecProtocol/aztec-packages/issues/10774))\n([5538f8c](https://github.com/AztecProtocol/aztec-packages/commit/5538f8cfc94f617a5604706b53357f9018af1096))\n* Replace relative paths to noir-protocol-circuits\n([f85fa3f](https://github.com/AztecProtocol/aztec-packages/commit/f85fa3f9078fc4f3626c564e06161bf9398e87a4))\n* Replace relative paths to noir-protocol-circuits\n([b19c561](https://github.com/AztecProtocol/aztec-packages/commit/b19c56154d32050affa786620f95459bb5c29a6e))\n* Set max txs in spam test\n([#10717](https://github.com/AztecProtocol/aztec-packages/issues/10717))\n([a50ff6c](https://github.com/AztecProtocol/aztec-packages/commit/a50ff6cf968f459ae09620d0e5b2e955ea56512f))\n* Slack notifications for networks\n([#10784](https://github.com/AztecProtocol/aztec-packages/issues/10784))\n([bab9f85](https://github.com/AztecProtocol/aztec-packages/commit/bab9f852c08f29f022bf526aacb8350732fcf4ac))\n* Split up protocol contract artifacts\n([#10765](https://github.com/AztecProtocol/aztec-packages/issues/10765))\n([5a9ca18](https://github.com/AztecProtocol/aztec-packages/commit/5a9ca18ceee03ca2175605d1029153a7bf228ea9))\n* **ssa:** Activate loop invariant code motion on ACIR functions\n(https://github.com/noir-lang/noir/pull/6785)\n([8956e28](https://github.com/AztecProtocol/aztec-packages/commit/8956e28269a045732e733b5197bdab5e46cdf354))\n* Sync grafana dashboard\n([#10792](https://github.com/AztecProtocol/aztec-packages/issues/10792))\n([421fb65](https://github.com/AztecProtocol/aztec-packages/commit/421fb65d9f14b86df281b0d0dc0934859aa924bc))\n* Tagging cleanup\n([#10675](https://github.com/AztecProtocol/aztec-packages/issues/10675))\n([52b541a](https://github.com/AztecProtocol/aztec-packages/commit/52b541ab4e6295aea199a2181575208f20eaa7fc))\n* Trace and handle errors in running promises\n([#10645](https://github.com/AztecProtocol/aztec-packages/issues/10645))\n([4cc0a6d](https://github.com/AztecProtocol/aztec-packages/commit/4cc0a6d832e6ee1c3fcc6876517ed3f743f59d4b))\n* Update external joiner script for new networks\n([#10810](https://github.com/AztecProtocol/aztec-packages/issues/10810))\n([5f11cf4](https://github.com/AztecProtocol/aztec-packages/commit/5f11cf4bdc51fd21b8bd219ad1e81bf3afe585d9))\n</details>\n\n<details><summary>barretenberg: 0.67.1</summary>\n\n##\n[0.67.1](https://github.com/AztecProtocol/aztec-packages/compare/barretenberg-v0.67.0...barretenberg-v0.67.1)\n(2024-12-17)\n\n\n### Features\n\n* Add tree equality assertions\n([#10756](https://github.com/AztecProtocol/aztec-packages/issues/10756))\n([923826a](https://github.com/AztecProtocol/aztec-packages/commit/923826a9d1bbed6739527a82b34d5610600eca1b))\n* Better initialization for permutation mapping components\n([#10750](https://github.com/AztecProtocol/aztec-packages/issues/10750))\n([1516d7f](https://github.com/AztecProtocol/aztec-packages/commit/1516d7f7bd6a2adbb650bd7cdd572b33db98dbfc))\n* Don't store every block number in block indices DB\n([#10658](https://github.com/AztecProtocol/aztec-packages/issues/10658))\n([a3fba84](https://github.com/AztecProtocol/aztec-packages/commit/a3fba8442fdd62f429054c3367984fd4206bbbeb))\n* Leaf index requests to the native world state can now be performed as\na batch query\n([#10649](https://github.com/AztecProtocol/aztec-packages/issues/10649))\n([a437e73](https://github.com/AztecProtocol/aztec-packages/commit/a437e73558a936981f3eb3ba022b0770b75d9060))\n* New 17 in 20 IVC bench added to actions\n([#10777](https://github.com/AztecProtocol/aztec-packages/issues/10777))\n([9fbcff6](https://github.com/AztecProtocol/aztec-packages/commit/9fbcff60a63e0eca14c4e28677aed1fc5e6f2c14))\n* Note hash management in the AVM\n([#10666](https://github.com/AztecProtocol/aztec-packages/issues/10666))\n([e077980](https://github.com/AztecProtocol/aztec-packages/commit/e077980f8cce1fc7922c27d368b6dbced956aad2))\n* Sumcheck with disabled rows\n([#10068](https://github.com/AztecProtocol/aztec-packages/issues/10068))\n([abd2226](https://github.com/AztecProtocol/aztec-packages/commit/abd2226da3a159e7efb7cbef099e41739f665ef1))\n\n\n### Bug Fixes\n\n* Avm gas and non-member\n([#10709](https://github.com/AztecProtocol/aztec-packages/issues/10709))\n([dd8cc7b](https://github.com/AztecProtocol/aztec-packages/commit/dd8cc7b93119c0376873a366a8310d2ebd2641de))\n* AVM witgen track gas for nested calls and external halts\n([#10731](https://github.com/AztecProtocol/aztec-packages/issues/10731))\n([b8bdb52](https://github.com/AztecProtocol/aztec-packages/commit/b8bdb529719c1f72244e904ea667462458a43317))\n* Use correct size for databus_id\n([#10673](https://github.com/AztecProtocol/aztec-packages/issues/10673))\n([95eb658](https://github.com/AztecProtocol/aztec-packages/commit/95eb658f90687c75589b345f95a904d96e2a8e62))\n\n\n### Miscellaneous\n\n* **avm:** Radix opcode - remove immediates\n([#10696](https://github.com/AztecProtocol/aztec-packages/issues/10696))\n([4ac13e6](https://github.com/AztecProtocol/aztec-packages/commit/4ac13e642c958392ce5606684c044ea014325e26)),\ncloses\n[#10371](https://github.com/AztecProtocol/aztec-packages/issues/10371)\n* Move decider PK allocation to methods\n([#10670](https://github.com/AztecProtocol/aztec-packages/issues/10670))\n([1ab9e30](https://github.com/AztecProtocol/aztec-packages/commit/1ab9e30d339cfd7a80f333e408c367c1f8bf49f8))\n</details>\n\n---\nThis PR was generated with [Release\nPlease](https://github.com/googleapis/release-please). See\n[documentation](https://github.com/googleapis/release-please#release-please).",
          "timestamp": "2024-12-17T20:03:03-05:00",
          "tree_id": "817a820d374a1205075784271571b96a6b15a4fc",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c90bb16a5880c42752809f383f517181e6f8a53a"
        },
        "date": 1734485358040,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 25318.23988999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19585.571171999996 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 24424.104675999984,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 22406.304442000004 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4465.57294699997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4166.2908800000005 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 89416.667004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 89416667000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 16582.283358,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16582284000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2789911470,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2789911470 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 133534028,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 133534028 ns\nthreads: 1"
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
          "id": "469476bc73606659da58d492b2640dea4ac924c2",
          "message": "fix: remove table shifts (#10814)\n\nTable shifts have been obsolete since we moved to a log derivative\r\nlookup argument and the table polynomials were still incorrectly\r\nconsidered part of the `to_be_shifted` polynomials set. This PR\r\naddresses the issue and, in turn, the proof size because smaller by 4\r\nfrs. Additionally, this brings some flavor simplifications.",
          "timestamp": "2024-12-18T09:11:20Z",
          "tree_id": "00b64cf7c0a9828cfcd420a2e0bf15558d4fbe71",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/469476bc73606659da58d492b2640dea4ac924c2"
        },
        "date": 1734516024432,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 25358.808219999984,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19374.892241999998 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 24471.55405699999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 22387.463696000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4857.796519000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4533.140636 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 84792.790161,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 84792790000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15074.171436,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15074173000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2839630147,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2839630147 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 142449604,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 142449604 ns\nthreads: 1"
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
          "id": "263eaad065d607d7af2d2c163c5090b8d73216c1",
          "message": "feat: add priority fees to gas settings (#10763)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\r\nline.",
          "timestamp": "2024-12-18T09:38:16Z",
          "tree_id": "3ccfd4f63e1cff372cb93c7920a10620d3940ab6",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/263eaad065d607d7af2d2c163c5090b8d73216c1"
        },
        "date": 1734517915249,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 25560.60757199998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19430.118732 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 24457.996852999997,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 22280.942353 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4854.384539000022,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4523.057631000001 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 84604.086341,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 84604086000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15084.434339,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15084435000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2856668744,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2856668744 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 142950195,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 142950195 ns\nthreads: 1"
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
          "id": "e8480cbf1ecdee5d7228b08d1c9608308acdd624",
          "message": "feat: move busread and lookup block construction at the top of the trace (#10707)\n\nConstructing the lookup block and lookup table data at the top of the\r\ntrace removes the dependence of active ranges on the dyadic circuit size\r\nwhich was causing problems for the overflow scenario and also reduces\r\nthe number of active rows to be close to the real size (modulo\r\nhttps://github.com/AztecProtocol/barretenberg/issues/1152 which still\r\nneeds investigation).",
          "timestamp": "2024-12-18T11:15:45Z",
          "tree_id": "7b9e38e07add526aab7d999bf58d7a83a4e7430b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e8480cbf1ecdee5d7228b08d1c9608308acdd624"
        },
        "date": 1734523065330,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 21469.483932999992,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18921.031903 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 24431.404593999985,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 21786.193354000003 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4968.941267000019,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4642.270874999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 85628.90712,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 85628908000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15079.21652,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15079218000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2838666079,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2838666079 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 142377178,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 142377178 ns\nthreads: 1"
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
          "id": "970ad77966a17fd5c8071a7c3c3a405f83630c5d",
          "message": "fix: toBlock argument in L1 getLogs is inclusive (#10828)\n\nAs @alexghr identified, we got a spurious reorg on a node in the exp1\r\nnetwork. This was caused by the node getting a current\r\n`l1BlockNumber=245`, but then fetching an L2 block mined at 246.\r\n\r\nThis caused the `canPrune` check to fail: \r\n\r\n```\r\nconst canPrune =\r\n      localPendingBlockNumber > provenBlockNumber &&\r\n      (await this.rollup.read.canPruneAtTime([time], { blockNumber: currentL1BlockNumber }));\r\n```\r\n\r\nThe `canPruneAtTime` was evaluated at L1 block number 245, and it\r\ncorrectly returned true, since there had been a reorg shortly before (at\r\n240), and no new L2 block had been mined so the rollup hadn't reset its\r\nstate by then. However, the `localPendingBlockNumber` was incorrectly\r\nincreased due to the block mined at 246, which caused the archiver to\r\nincorrectly reorg it.\r\n\r\nThis PR fixes the L1 event queries so the `toBlock` is inclusive. A\r\nquick test with cast shows that this is the case:\r\n```\r\n$ cast logs -r https://mainnet.infura.io/v3/$INFURA_API_KEY --from-block 0x146eade --to-block 0x146eadf --address 0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48 --json | jq .[].blockNumber | uniq\r\n\"0x146eade\"\r\n\"0x146eadf\"\r\n```\r\n\r\nAnd just for good measure, we also filter the logs returned by the block\r\nrange searched.",
          "timestamp": "2024-12-18T09:11:04-03:00",
          "tree_id": "88fcc9cac8e1e230915fc3ec5831be1d3b43f54b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/970ad77966a17fd5c8071a7c3c3a405f83630c5d"
        },
        "date": 1734525442139,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 21512.632263,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18789.880754 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 24456.08347000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 21644.320863 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4951.82334499998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4605.475333 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 85072.53844,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 85072539000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15053.910278,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15053911000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2831719351,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2831719351 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 142050591,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 142050591 ns\nthreads: 1"
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
          "id": "8820bd5f3004fedd6c286e2dbf5f8b24fc767fd2",
          "message": "fix: handle calls to non-existent contracts in AVM witgen (#10862)\n\nExceptionally halt & consume all gas on a call to a non-existent\ncontract. Should be able to prove.\n\nHacked this to work for top-level/enqueued-calls by adding a dummy row\n(`op_add`) and then raising an exceptional halt.\n\nResolves https://github.com/AztecProtocol/aztec-packages/issues/10373\nResolves https://github.com/AztecProtocol/aztec-packages/issues/10044\n\nFollow-up work:\n- Add tests for bytecode deserialization failures (sim & witgen)",
          "timestamp": "2024-12-19T06:36:48-05:00",
          "tree_id": "895b9543d9e3a2d453c93791371cd2b084e935b1",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8820bd5f3004fedd6c286e2dbf5f8b24fc767fd2"
        },
        "date": 1734609525000,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 21746.67925900002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19073.500444 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 24511.337944000017,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 21797.343171 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 5007.585204999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4645.667925 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 84614.78080800001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 84614782000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15131.664287000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15131665000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2853639406,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2853639406 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 141955268,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 141955268 ns\nthreads: 1"
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
          "id": "7a9506c6f400a88cbdbc9fad75d7b2bd35bea2cf",
          "message": "chore(avm): Conditionally enable avm recursion unit tests based on an env variable (#10873)",
          "timestamp": "2024-12-19T12:57:10+01:00",
          "tree_id": "7367ac20097ce413d80f63880e0ea231f9ca6d68",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7a9506c6f400a88cbdbc9fad75d7b2bd35bea2cf"
        },
        "date": 1734610769721,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 21416.303787000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 18956.300385 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 24393.417599999964,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 21576.290522999996 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4944.460961999994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4635.3334970000005 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 83881.326274,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 83881397000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15006.525647999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15006526000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2849739376,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2849739376 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 144576089,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 144576089 ns\nthreads: 1"
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
          "id": "ebd6aba915b822711166b4424cc4c81f226ddcfb",
          "message": "feat: add gate count tracking for ivc constraints (#10772)",
          "timestamp": "2024-12-19T17:07:29+04:00",
          "tree_id": "f7976d07836b0f32189891b9f8d041633cf70403",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ebd6aba915b822711166b4424cc4c81f226ddcfb"
        },
        "date": 1734614706266,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20489.601304000018,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17991.324086999997 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 24164.213521000023,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 21199.935229000002 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4435.946793999989,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4157.363215 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 95397.72463900001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 95397725000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 16469.350387000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16469351000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3643733636,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3643733636 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 165826917,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 165826917 ns\nthreads: 1"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "blorktronics@gmail.com",
            "name": "Zachary James Williamson",
            "username": "zac-williamson"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "15475f47bdc2ac02ea5157bdc9d1f5172ff6ed09",
          "message": "feat: added a UnivariateMonomial representation to reduce field ops in protogalaxy+sumcheck (#10401)\n\nSummary:\r\n\r\n`client_ivc_bench.sh` benchmark has been improved by approx 10% (26218ms\r\nvs 29306ms)\r\n\r\nIn both protogalaxy + sumcheck, the basic representation of the edge of\r\nthe boolean hypercube is now a degree-1 monomial instead of a\r\nMAX_RELATION_DEGREE-degree monomial\r\n\r\nThe class UnivariateMonomial can efficiently evaluate low-degree\r\nmonomial relations of up to degree-2. The relations in the `relations`\r\ndirectory have been reworked to perform initial low-degree algebraic\r\ncomputations using UnivariateMonomial, only converting to a full\r\nMonomial object once the UnivariateMonomial would otherwise exceed\r\ndegree-2\r\n\r\nReason why we do all of this:\r\n\r\n1. for MegaFlavor, `extend_edges` was converting every flavour\r\npolynomial into a degree-11 Univariate. This was introducing 9 Fp\r\nadditions * NUM_ALL_ENTITIES per row in the circuit. Given the sparse\r\ntrace structure we are working with, this is a lot of computation that\r\nthis PR makes redundant\r\n2. for each relation, we check if it can be skipped by typically calling\r\n`is_zero` on a selector. The selector poly is in Univariate form\r\n(MegaFlavor = degree-11) which is 11 Fp zero-checks. MegaFlavor has 9\r\nskippable relations which is 99 Fp zero-checks. With the new degree-2\r\nrepresentation this is reduced to only 18 Fp zero-checks\r\n3. The number of raw Fp add and mul operations required to evaluate our\r\nrelations is reduced. For example, in the permutation argument each\r\n`*`/`+` operation in the `accumulate` function was costing us 11 Fp\r\nmuls/adds. It is cheaper to compute low-degree sub-terms in the\r\ncoefficient representation before extend inginto point-evaluation\r\nrepresentation\r\n\r\ne.g. consider (in the protogalaxy case where challenges are degree-1\r\nunivariates) `(w_i + \\beta * S_i + \\gamma)` for `i = 0,1,2,3`. In\r\ncoefficient representation this term can be computed with 8 Fp adds and\r\n3 Fp muls. Extending into a degree-11 point evaluation form costs 18 Fp\r\nadds for a total of 26 Fp adds and 3 Fp muls.\r\n\r\nIn master branch, using Univariate<11> this computation costs us 20 Fp\r\nadds and 10 Fp muls. Assuming an add is 1/3 the cost of a mul, this\r\nmakes the new approach cost 35 Fp add-equivalent operations vs 50 Fp\r\nadd-equivalent\r\n\r\nOverall in the new approach, the number of field operations to compute\r\nthe permutation argument has reduced by 30%",
          "timestamp": "2024-12-19T15:12:09Z",
          "tree_id": "16726762d4bf7492bbfa2f371eae794d8b327586",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/15475f47bdc2ac02ea5157bdc9d1f5172ff6ed09"
        },
        "date": 1734622480904,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 19619.226225000006,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17172.247299 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21711.567222000012,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19137.342345 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4174.930159000013,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3868.259428 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 84176.988422,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 84176989000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 15217.179274000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15217181000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2781235387,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2781235387 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 132331442,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 132331442 ns\nthreads: 1"
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
          "id": "ef247d4d68ce4aadb4c45b1f75d71a411e7102b6",
          "message": "chore(avm): extra column information in lookups (#10905)\n\nNeeded for vm2. This helps derive a lookup class from the settings.",
          "timestamp": "2024-12-20T12:40:40Z",
          "tree_id": "56999a44a08648832134df54a69c7ecfa7b847e8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ef247d4d68ce4aadb4c45b1f75d71a411e7102b6"
        },
        "date": 1734699417335,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20294.08005800002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17774.308369 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21876.17391399999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19281.479867 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4655.666172999986,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4343.510282 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 73152.726453,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 73152726000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 14069.454980000002,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 14069455000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3250698225,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3250698225 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 145886537,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 145886537 ns\nthreads: 1"
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
          "id": "9ed43bce2545f908d6351c6d330470b19510d216",
          "message": "chore(master): Release 0.68.0 (#10834)\n\nThis release is too large to preview in the pull request body. View the\nfull release notes here:\nhttps://github.com/AztecProtocol/aztec-packages/blob/release-please--branches--master--release-notes/release-notes.md",
          "timestamp": "2024-12-20T18:20:26Z",
          "tree_id": "b75f467a03f4f7d7156fde301c3cb4f537ff1159",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9ed43bce2545f908d6351c6d330470b19510d216"
        },
        "date": 1734719799818,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20322.919189999993,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17695.727963999998 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21812.926538,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19041.610996 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4630.180110999959,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4317.738614999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 81610.981691,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 81610982000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13894.379013,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13894378000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 3352309391,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 3352309391 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 142453198,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 142453198 ns\nthreads: 1"
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
          "id": "bf5e294dd31ed860d5b4ce6bf06f7ae4d5f3052a",
          "message": "chore(master): Release 0.68.0",
          "timestamp": "2024-12-20T18:20:30Z",
          "url": "https://github.com/AztecProtocol/aztec-packages/pull/10834/commits/bf5e294dd31ed860d5b4ce6bf06f7ae4d5f3052a"
        },
        "date": 1734719805369,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20448.393573000005,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 17879.481030000003 ms\nthreads: 1"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 21785.989263999993,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 19094.770102 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4627.763732999994,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 4282.267201999999 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 73104.782897,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 73104783000 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 13925.917256,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13925918000 ms\nthreads: 1"
          },
          {
            "name": "commit(t)",
            "value": 2869513808,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 2869513808 ns\nthreads: 1"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 141927201,
            "unit": "ns/iter",
            "extra": "iterations: 1\ncpu: 141927201 ns\nthreads: 1"
          }
        ]
      }
    ]
  }
}