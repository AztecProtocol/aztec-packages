window.BENCHMARK_DATA = {
  "lastUpdate": 1744041664089,
  "repoUrl": "https://github.com/AztecProtocol/aztec-packages",
  "entries": {
    "C++ Benchmark": [
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
          "id": "2633856a9a7f4e4976a9738cdd0e9348196c67c7",
          "message": "fix(avm): fix lookup builder and FF hashing (#13263)\n\n### TL;DR\n\nFix field element hashing and improve lookup table processing in the VM2\nimplementation.\n\n### What changed?\n\n- Removed `HashableTuple` class from `utils.hpp` as it's no longer\nneeded\n- Fixed field element hashing by ensuring elements are reduced before\nhashing\n- Replaced `LookupIntoDynamicTableSequential` with\n`LookupIntoDynamicTableGeneric` for field GT lookups\n- Modified the `LookupIntoDynamicTableSequential` implementation to sort\nsource rows before processing\n- Simplified the `RangeCheckEvent` equality operator using default\ncomparison\n- Updated tuple types in `raw_data_dbs.hpp` to use standard `std::tuple`\ninstead of `HashableTuple`. This is supported by the anklr map.",
          "timestamp": "2025-04-03T17:49:13+01:00",
          "tree_id": "c4321f75d1e2929a836fe9d499ba1d0ce83b1c51",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/2633856a9a7f4e4976a9738cdd0e9348196c67c7"
        },
        "date": 1743699353779,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 27159,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17855,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8834,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10425,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 10878,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "62c32eb0064c0d95527286882b1ec798fd2c3932",
          "message": "chore: flake (#13277)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\nline.",
          "timestamp": "2025-04-03T17:55:18+01:00",
          "tree_id": "c9a81647bec29bfa27bdcda707b84656aaf0f030",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/62c32eb0064c0d95527286882b1ec798fd2c3932"
        },
        "date": 1743700909424,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 24595,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 16111,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8189,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 9707,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 9895,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "distinct": false,
          "id": "bd9e690ca9b26f7f0415e89f6a1825d10f07fc87",
          "message": "chore: add some PrivateSet tests (#13270)\n\nIt's a bit shameful that even such a basic component has no tests. I\nadded some basic cases, though we should have more (e.g. multiple notes,\ninsertion after removal, etc.). PrivateSet is a bit strange in that it\ndoesn't actually _do_ much, it's mostly wrappers for the lower level\nnote api. Alas.\n\nI opened #13269 since as of now it's not really possible to test settled\nnotes without creating a contract (!), which we definitely should be\nable to do.",
          "timestamp": "2025-04-03T20:01:07Z",
          "tree_id": "371b6387e969ec9769416ceed773fd9534a6ff88",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/bd9e690ca9b26f7f0415e89f6a1825d10f07fc87"
        },
        "date": 1743719976890,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 26837,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17750,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8791,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10433,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 11078,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "distinct": false,
          "id": "df9a40c5051229f3c6a6b3f88c6d12f145c64420",
          "message": "chore: move a couple of `SharedMutableValues` functions outside of impl (#13283)\n\nThis was discussed a bit over slack, but here's some context.\n\nIn Rust this gives an error:\n\n```rust\npub struct Foo<T> {\n    x: T,\n}\n\nimpl<T> Foo<T> {\n    fn one(x: T) {\n        Bar::two(x); // Cannot infer the value of const parameter U\n    }\n}\n\nstruct Bar<T, const U: usize> {\n    x: T,\n}\n\nimpl<T, const U: usize> Bar<T, U> {\n    fn two(x: T) -> Foo<T> {\n        Foo { x }\n    }\n}\n\nfn main() {\n    Foo::<i32>::one(1);\n}\n```\n\nIn the call `Bar::two` Rust needs to know what is the value of `U`. It\ncan be solved by doing `Bar::<T, 1234>::two(x)` or using any numeric\nvalue... because the numeric value isn't used in that impl function...\nwhich probably means that it doesn't need to \"belong\" to `Bar`.\n\nIn this [Noir PR](https://github.com/noir-lang/noir/pull/7843) gets\nmerged that's what will happen. We have a similar case in this codebase\nwhere `SharedMutableValues` has two methods:\n- `unpack_value_change`: doesn't refer to `INITIAL_DELAY`\n- `unpack_delay_change`: doesn't refer to `T`\n\nSo, this PR moves those two methods outside of the impl, only specifying\nthe generics that are needed.",
          "timestamp": "2025-04-03T20:54:11Z",
          "tree_id": "c66600a6455491e676ffd9af95cf47c16759ed52",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/df9a40c5051229f3c6a6b3f88c6d12f145c64420"
        },
        "date": 1743722517164,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 26875,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17677,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8730,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10433,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 11030,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "945ffa29c5d77271b21e037c6e5e03f213d93d56",
          "message": "feat!: `#[utility]` function (#13243)\n\nPartially addresses\nhttps://github.com/AztecProtocol/aztec-packages/issues/12743 (partially\nas the rest will be addressed in PRs up the stacks)\n\nIntroduces a `#[utility]` macro for top-level unconstrained functions\nand applies it to all the relevant functions.",
          "timestamp": "2025-04-03T23:15:57Z",
          "tree_id": "eab6436f6d8e0c132453d424a8a8c007af848d86",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/945ffa29c5d77271b21e037c6e5e03f213d93d56"
        },
        "date": 1743724170215,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 29129,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17781,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8893,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10582,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12581,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "69df86f4b234725dfacea686fd7307e45685ddfe",
          "message": "refactor!: `UnsconstrainedContext` --> `UtilityContext` (#13246)\n\nPartially addresses\nhttps://github.com/AztecProtocol/aztec-packages/issues/12743 (partially\nas the rest will be addressed in PRs up the stacks)\n\nIn this PR I only rename `UnconstrainedContext` as `UtilityContext`. The\nrest of the unconstrained --> utility renaming will be done in PRs up\nthe stack.",
          "timestamp": "2025-04-04T01:41:31Z",
          "tree_id": "e8f052c8927277af5fc1b2f33676f41c8bdc6d78",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/69df86f4b234725dfacea686fd7307e45685ddfe"
        },
        "date": 1743732705222,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 29245,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17725,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 9020,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10624,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12553,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "tech@aztecprotocol.com",
            "name": "AztecBot"
          },
          "committer": {
            "email": "tech@aztecprotocol.com",
            "name": "AztecBot"
          },
          "distinct": true,
          "id": "133bcf6315da989121a8b27d51c46d9798f39fd3",
          "message": "git subrepo push --branch=master noir-projects/aztec-nr\n\nsubrepo:\n  subdir:   \"noir-projects/aztec-nr\"\n  merged:   \"45d3f88ef8\"\nupstream:\n  origin:   \"https://github.com/AztecProtocol/aztec-nr\"\n  branch:   \"master\"\n  commit:   \"45d3f88ef8\"\ngit-subrepo:\n  version:  \"0.4.6\"\n  origin:   \"???\"\n  commit:   \"???\"",
          "timestamp": "2025-04-04T02:29:18Z",
          "tree_id": "d2bb1c947064664c159317d86639458e8b29648e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/133bcf6315da989121a8b27d51c46d9798f39fd3"
        },
        "date": 1743735411089,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 28691,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17561,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8830,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10556,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12331,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "8a622c955e568e42753bc5e886027d2e0c0230e8",
          "message": "chore: minor simulator utils cleanup (#13250)\n\n`executeUnconstrainedFunction` was now unnecessary so I nuked it. Also\ncleaned up the related function params which were unnecessarily\ncluttered.",
          "timestamp": "2025-04-04T02:15:08Z",
          "tree_id": "904fc53eeb9f096b7485f13022944c1cfaec8797",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8a622c955e568e42753bc5e886027d2e0c0230e8"
        },
        "date": 1743736340259,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 29116,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17810,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8978,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10645,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12505,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "distinct": false,
          "id": "34d03bb3d32f26c2a26b9adcd72e7bd17af0c015",
          "message": "refactor: renaming unconstrained function as utility in TS (#13249)\n\nPartially addresses\nhttps://github.com/AztecProtocol/aztec-packages/issues/12743 (partially\nas the rest will be addressed in PRs up the stacks)\n\nIn this PR I rename occurrences of unconstrained to utility in our TS\ncodebase.\n\nThere are still missing some renamings on ContractClassRegister and\nrenamings of the related constants. That will be done in a separate PR.",
          "timestamp": "2025-04-04T07:58:08Z",
          "tree_id": "ad8c3fc7495ff39b84b074c09fa12b8c37f37f5b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/34d03bb3d32f26c2a26b9adcd72e7bd17af0c015"
        },
        "date": 1743755246429,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 29282,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17717,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8924,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10621,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12633,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "distinct": false,
          "id": "9a1ddc5101cb93069cf4621b4b705a307628b80a",
          "message": "chore: update slashing test port (#13274)\n\n## Overview\n\nWas using the same port as the gossip test, could likely cause\ncontention",
          "timestamp": "2025-04-04T07:58:56Z",
          "tree_id": "92f502100c582f9fc47851f4485e0dfffc98b6f3",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9a1ddc5101cb93069cf4621b4b705a307628b80a"
        },
        "date": 1743755527861,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 29125,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17696,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8932,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10705,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12503,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "distinct": false,
          "id": "c8e95ddaf72ccb74e1772357170cd2290f785717",
          "message": "chore: bump full prover test to 32 cores. hoping to boost speed. (#13293)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\nline.",
          "timestamp": "2025-04-04T08:18:12Z",
          "tree_id": "e10f7b887053eb9e466991b28e5377df30950705",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c8e95ddaf72ccb74e1772357170cd2290f785717"
        },
        "date": 1743756715696,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 29182,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17640,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 9065,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10840,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12519,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "distinct": false,
          "id": "52aceb46b5be60a5b98009dc383ed29465118e06",
          "message": "fix: import right assert (#13268)\n\nWe had assertions that only printed to the console instead of crashing\nthe process. This PR fixes that\n\n---------\n\nCo-authored-by: lucasxia01 <lucasxia01@gmail.com>",
          "timestamp": "2025-04-04T08:43:49Z",
          "tree_id": "e0245417a9f8216d1f02dfad55b5c23fb6f5d7be",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/52aceb46b5be60a5b98009dc383ed29465118e06"
        },
        "date": 1743759024914,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 29047,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17570,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8938,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10680,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12484,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "distinct": false,
          "id": "91f28c4626ed6caf18a1774b6712e88fa8825367",
          "message": "fix: Unhandled rejection in prover broker facade (#13286)\n\nFixes #13166\n\nCo-authored-by: Alex Gherghisan <alexghr@users.noreply.github.com>",
          "timestamp": "2025-04-04T09:02:58Z",
          "tree_id": "1a75d03e8add0f55cb4d0fdf172376e21c5256c6",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/91f28c4626ed6caf18a1774b6712e88fa8825367"
        },
        "date": 1743759412076,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 29589,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17707,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8904,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10648,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12630,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "distinct": false,
          "id": "5425d16b5f0cfa3b0fd98560800918fd98ca2e0e",
          "message": "chore(bb): add fr container hashing benchmark (#13295)\n\n```\n-----------------------------------------------------------\nBenchmark         Time            CPU         Iterations\n-----------------------------------------------------------\nhash_bench        564 ns          563 ns      1243422\n```",
          "timestamp": "2025-04-04T11:29:35Z",
          "tree_id": "f1ee7e10af213a3d6c476822b55c7d38b6259c41",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5425d16b5f0cfa3b0fd98560800918fd98ca2e0e"
        },
        "date": 1743767784881,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20416.994639000222,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15606.544954 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 121813279357.1,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 1930819483,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 281538933,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 19797.812919999615,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16731.384636000003 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55375.564441999995,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55375566000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4058.9722990002883,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3517.3476809999997 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11780.130508999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11780135000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2233.56",
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
          "distinct": false,
          "id": "5425d16b5f0cfa3b0fd98560800918fd98ca2e0e",
          "message": "chore(bb): add fr container hashing benchmark (#13295)\n\n```\n-----------------------------------------------------------\nBenchmark         Time            CPU         Iterations\n-----------------------------------------------------------\nhash_bench        564 ns          563 ns      1243422\n```",
          "timestamp": "2025-04-04T11:29:35Z",
          "tree_id": "f1ee7e10af213a3d6c476822b55c7d38b6259c41",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5425d16b5f0cfa3b0fd98560800918fd98ca2e0e"
        },
        "date": 1743767794616,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 29114,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17772,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 9002,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10781,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12502,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "distinct": false,
          "id": "69c316852a1d72491a6e3a73e0cf6fc328f235ea",
          "message": "chore: give port change test more resources (#13266)\n\nWhen running locally lower resources cause the errors seen in ci",
          "timestamp": "2025-04-04T11:30:09Z",
          "tree_id": "88c25f45e91923246966d5dd6f53bd199cb24401",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/69c316852a1d72491a6e3a73e0cf6fc328f235ea"
        },
        "date": 1743767826961,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 29383,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17620,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8914,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10786,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12414,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "ca3da0cb04808fc1b274024c3c71146c19386262",
          "message": "chore: add default native proving for cli-wallet (#13129)\n\nOkay so I've verified [here](http://ci.aztec-labs.com/38a5491ed3a6ac97),\nthat none of the cli-wallet tests in\n\ncli-wallet/tests/flows or\naztec-up/test or\nend-to-end/src/guides\n\nare running with prover. It turns out we needed to export the var in\neach location as the command was being called and not inheriting a\nnon-exported env var.\n\nCo-authored-by: sklppy88 <esau@aztecprotocol.com>",
          "timestamp": "2025-04-04T11:37:26Z",
          "tree_id": "291af593ed185a003bdef4bfa23bd2212f116e1e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ca3da0cb04808fc1b274024c3c71146c19386262"
        },
        "date": 1743768700390,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 29442,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17679,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8967,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10747,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12510,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "c79402b842aeb2966d4e93e86528b8b5a29c23a4",
          "message": "chore(p2p): fix gas message validator (#13299)\n\n## Overview\n\nSome new flakes have appeared after\nhttps://github.com/AztecProtocol/aztec-packages/pull/13154 as the\nmessage validation logic was unaware of the skipped state. This resulted\npeers dropping transactions with too low gas fees, that could become\nvalid later.\n\nexample failing log:\n```\n08:06:17 [08:06:17.334] INFO: pxe:service:f4e6b4 Sent transaction 0x290aafc7b7c9c57f409dfb23dff0a42f126e157c640716eb9b56ead6276ab572\n08:06:17 [08:06:17.339] INFO: e2e:e2e_p2p:e2e_p2p_rediscovery Tx sent with hash 0x290aafc7b7c9c57f409dfb23dff0a42f126e157c640716eb9b56ead6276ab572\n08:06:17 [08:06:17.797] INFO: e2e:e2e_p2p:e2e_p2p_rediscovery Receipt received for 0x290aafc7b7c9c57f409dfb23dff0a42f126e157c640716eb9b56ead6276ab572\n08:06:17 [08:06:17.839] WARN: sequencer:tx_validator:tx_gas Skipping transaction 0x290aafc7b7c9c57f409dfb23dff0a42f126e157c640716eb9b56ead6276ab572 due to insufficient fee per gas {\"txMaxFeesPerGas\":{\"feePerDaGas\":0,\"feePerL2Gas\":28890},\"currentGasFees\":{\"feePerDaGas\":0,\"feePerL2Gas\":270010}}\n08:06:17 [08:06:17.842] VERBOSE: p2p:peer-scoring Penalizing peer 16Uiu2HAmVSN83RZZYAXjTVvjF1SdcKEnovXNd7wK1SzVRngiwFB4 with HighToleranceError (new score is -2)\n08:06:17 [08:06:17.875] WARN: sequencer:tx_validator:tx_gas Skipping transaction 0x290aafc7b7c9c57f409dfb23dff0a42f126e157c640716eb9b56ead6276ab572 due to insufficient fee per gas {\"txMaxFeesPerGas\":{\"feePerDaGas\":0,\"feePerL2Gas\":28890},\"currentGasFees\":{\"feePerDaGas\":0,\"feePerL2Gas\":270010}}\n08:06:17 [08:06:17.876] VERBOSE: p2p:peer-scoring Penalizing peer 16Uiu2HAmVSN83RZZYAXjTVvjF1SdcKEnovXNd7wK1SzVRngiwFB4 with HighToleranceError (new score is -2)\n08:06:18 [08:06:18.020] WARN: sequencer:tx_validator:tx_gas Skipping transaction 0x290aafc7b7c9c57f409dfb23dff0a42f126e157c640716eb9b56ead6276ab572 due to insufficient fee per gas {\"txMaxFeesPerGas\":{\"feePerDaGas\":0,\"feePerL2Gas\":28890},\"currentGasFees\":{\"feePerDaGas\":0,\"feePerL2Gas\":270010}}\n08:06:18 [08:06:18.022] VERBOSE: p2p:peer-scoring Penalizing peer 16Uiu2HAmVSN83RZZYAXjTVvjF1SdcKEnovXNd7wK1SzVRngiwFB4 with HighToleranceError (new score is -2)\n\n```",
          "timestamp": "2025-04-04T12:10:13Z",
          "tree_id": "161bc8177bd5adf9c03e25892323eb9c09a1ba4f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c79402b842aeb2966d4e93e86528b8b5a29c23a4"
        },
        "date": 1743770610377,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 29269,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17770,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8957,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10629,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12580,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "distinct": false,
          "id": "65cfdf589b7a9bab63c5fbb07a2f52ef34b47e97",
          "message": "chore: Contract addresses for alpha-testnet (#13303)\n\nThis PR simply configures contract addresses for alpha-testnet",
          "timestamp": "2025-04-04T15:05:25Z",
          "tree_id": "204112c4011f82ca091b8a40d1bdbca38431b831",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/65cfdf589b7a9bab63c5fbb07a2f52ef34b47e97"
        },
        "date": 1743782537121,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 29367,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17821,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8938,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10681,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12564,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "d4f45c7eb54eebe22f38f6a67336c02585ba8008",
          "message": "chore: add ci logging to discv5 test (#13306)\n\nStruggling to reproduce this one locally, adding logging to CI for now",
          "timestamp": "2025-04-04T15:44:44Z",
          "tree_id": "1f787c86c62619e026361832ec559b5107abee07",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d4f45c7eb54eebe22f38f6a67336c02585ba8008"
        },
        "date": 1743783546582,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 29104,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17779,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8962,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10637,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12393,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "distinct": false,
          "id": "7f9af7cf1042b86ce01e5dc2f6eb63887dddb231",
          "message": "chore: Test that a contract without initializer can still be called (#13324)\n\nIn #12215 the `TestContract` had an `initializer` added, meaning that\nthe e2e test that checked that we could call a private function in a\ncontract without an initializer no longer tested that.\n\nThis PR adds another test that covers that scenario.",
          "timestamp": "2025-04-04T20:11:04Z",
          "tree_id": "547fdd7c14fd6168a952fa9101691d5ba682a721",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7f9af7cf1042b86ce01e5dc2f6eb63887dddb231"
        },
        "date": 1743801386877,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 29041,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17606,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8943,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10579,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12397,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "distinct": false,
          "id": "ab0d6c600815e5a75b87b52ceb4fe69654a8bbfc",
          "message": "refactor: using Txhash type (#13318)\n\nIn plenty of the places we didn't use the TxHash type for no apparent\nreason.",
          "timestamp": "2025-04-04T20:47:04Z",
          "tree_id": "91ac4b9a05393f74912424e3e360d7eef2c6ffdb",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ab0d6c600815e5a75b87b52ceb4fe69654a8bbfc"
        },
        "date": 1743801721739,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 29112,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17636,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8962,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10705,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12486,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "distinct": false,
          "id": "7db22474e5b1ec959e3afc9dbedad0baec7c022f",
          "message": "chore: Cleanup sequencer block sync check (#13289)\n\nFixes #9316",
          "timestamp": "2025-04-04T20:49:54Z",
          "tree_id": "beeb680f4e3c3047fea8b8744e17c3d4a74f2f11",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7db22474e5b1ec959e3afc9dbedad0baec7c022f"
        },
        "date": 1743803422952,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 29026,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17965,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8984,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10660,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12530,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "distinct": false,
          "id": "a0acbaff1d6be3b7b2fefa16fd820416440f5880",
          "message": "fix: workaround npm install deps cache issue (#13327)",
          "timestamp": "2025-04-04T21:10:03Z",
          "tree_id": "4510acb46b0ff61582e65af7b9f28395f26bde8e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a0acbaff1d6be3b7b2fefa16fd820416440f5880"
        },
        "date": 1743803985680,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20415.671457000142,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15370.660378 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 121815208159.2,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 1952296245,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 296457169,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 19465.309384999957,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16397.257935 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55703.983717999996,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55703985000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4074.807700000065,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3509.0352420000004 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 12105.472884,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 12105475000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2233.56",
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
          "distinct": false,
          "id": "a0acbaff1d6be3b7b2fefa16fd820416440f5880",
          "message": "fix: workaround npm install deps cache issue (#13327)",
          "timestamp": "2025-04-04T21:10:03Z",
          "tree_id": "4510acb46b0ff61582e65af7b9f28395f26bde8e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a0acbaff1d6be3b7b2fefa16fd820416440f5880"
        },
        "date": 1743803995380,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 29233,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17738,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8917,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10700,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12439,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "distinct": false,
          "id": "8c58c96e8d806c162dc81c5302ae9f57bc744f84",
          "message": "feat: improved pairing point accumulator (#13226)\n\nClean up and refactor the use of `aggregation_state` in preparation to\nperform pairing point aggregation in all of the places its needed. The\nclass now has equivalent support for Ultra and Mega.\n\nThe main components of this work:\n- Use the component-owned methods `set_public` and\n`reconstruct_from_public` to define serialization/deserialization\nmethods for `aggregation_state` rather than relying on one-off\nimplementations and builder methods\n- Avoid explicit use of the underlying witness indices and PairingPoints\n(array of group elements) in favor of an `aggregation_state` instance\n- Template `aggregation_state` on Builder instead of Curve (since only\nbn254 is relevant)\n\n---------\n\nCo-authored-by: ludamad <adam.domurad@gmail.com>",
          "timestamp": "2025-04-04T21:19:26Z",
          "tree_id": "aaf9f511434c89b17ad178c18e2e9b42de1fb298",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8c58c96e8d806c162dc81c5302ae9f57bc744f84"
        },
        "date": 1743805211309,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20652.742508000076,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15653.988794 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 122524636186.09999,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 2004141215,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 280354571,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 19776.522042999888,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16777.707694 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 56321.375373,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 56321376000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4053.229483999985,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3527.9958260000003 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 12067.484483999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 12067490000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2337.56",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
          "distinct": false,
          "id": "8c58c96e8d806c162dc81c5302ae9f57bc744f84",
          "message": "feat: improved pairing point accumulator (#13226)\n\nClean up and refactor the use of `aggregation_state` in preparation to\nperform pairing point aggregation in all of the places its needed. The\nclass now has equivalent support for Ultra and Mega.\n\nThe main components of this work:\n- Use the component-owned methods `set_public` and\n`reconstruct_from_public` to define serialization/deserialization\nmethods for `aggregation_state` rather than relying on one-off\nimplementations and builder methods\n- Avoid explicit use of the underlying witness indices and PairingPoints\n(array of group elements) in favor of an `aggregation_state` instance\n- Template `aggregation_state` on Builder instead of Curve (since only\nbn254 is relevant)\n\n---------\n\nCo-authored-by: ludamad <adam.domurad@gmail.com>",
          "timestamp": "2025-04-04T21:19:26Z",
          "tree_id": "aaf9f511434c89b17ad178c18e2e9b42de1fb298",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8c58c96e8d806c162dc81c5302ae9f57bc744f84"
        },
        "date": 1743805221690,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 29167,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17708,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 9002,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10623,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12506,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "distinct": false,
          "id": "94f46d6392876d91eaca1451cf678f4dbf1d13a3",
          "message": "refactor: renaming unconstrained to utility in registerer (#13287)\n\nPartially addresses\nhttps://github.com/AztecProtocol/aztec-packages/issues/12743 (partially\nas the rest will be addressed in PRs up the stacks)\n\nIn this PR I rename occurrences of unconstrained to utility\nContractClassRegister and the related code.",
          "timestamp": "2025-04-04T21:25:22Z",
          "tree_id": "2c8205bff8019a31e8447dc874d19ad707ce25a8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/94f46d6392876d91eaca1451cf678f4dbf1d13a3"
        },
        "date": 1743805471118,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 29324,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17815,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8919,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10647,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12536,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "distinct": false,
          "id": "405a515aabc6ed74b60173c91c83e8e2a2b5dc1e",
          "message": "fix: Use proof submission window for prover node deadline (#13321)\n\nProver node would abort operations at the end of the following epoch,\nrather than honoring the proof submission window config.\n\nFixes #13320",
          "timestamp": "2025-04-04T22:02:24Z",
          "tree_id": "17b76aac3b07aa424567ffc959d76551a4390676",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/405a515aabc6ed74b60173c91c83e8e2a2b5dc1e"
        },
        "date": 1743806913136,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 29163,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17713,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8958,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10667,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12368,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "distinct": false,
          "id": "8dcebac4fe113cf97aeb25185b168dbf98632ccd",
          "message": "fix: remove second msg discovery call in sync_notes (#13328)\n\nWhen the `#[utility]` macro was added to `sync_notes` in #13243, we\ndidn't realize that by applying the macro to `sync_notes` we were\ncausing for message discovery to be invoked _again_, since that's what\nthe macro does. `sync_notes` can now be an empty function.",
          "timestamp": "2025-04-04T22:19:04Z",
          "tree_id": "c8e236feddba1352b11aa7e3e06fd05b6a356a21",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8dcebac4fe113cf97aeb25185b168dbf98632ccd"
        },
        "date": 1743807443257,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 29254,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17753,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 9008,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10662,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12445,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "distinct": false,
          "id": "e3b3b1c890e1bd34b1f59d51e06e55089121b752",
          "message": "chore: move aes code to aes file (#13332)\n\nThis just moves the trait impl outside of the 'log_assembly' dir that\nwe're in the process of removing and into the aes file, along with the\nother aes utils. There's no code changes, renames, nothing - only\nupdated imports.",
          "timestamp": "2025-04-04T22:43:27Z",
          "tree_id": "53b60d488450608f1dad7916b13b013fb3faee7f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e3b3b1c890e1bd34b1f59d51e06e55089121b752"
        },
        "date": 1743808840588,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 29283,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17809,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8932,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10691,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12554,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "distinct": false,
          "id": "4a64f89484835ef5d00f73afbb21ee83b6efbffb",
          "message": "test: `PXEOracleInterface::deliverNote` (#13316)\n\nAdding tests for `deliverNote` oracle.\n\n---------\n\nCo-authored-by: Nicolás Venturo <nicolas.venturo@gmail.com>",
          "timestamp": "2025-04-04T23:00:44Z",
          "tree_id": "ba6bb6a0200dbccc1c9cfc5d8c039dfad838a774",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/4a64f89484835ef5d00f73afbb21ee83b6efbffb"
        },
        "date": 1743810065310,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 29218,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17845,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8966,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10584,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12437,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "distinct": false,
          "id": "81f3d7d4515f2c05232bfe5f164bf2d08232550e",
          "message": "feat(avm): checkpointing hints (#13302)\n\nThe hints are fully implemented but it is NOT being extensively used in\nthe code. I only added one call to `create_checkpoint` in the\n`tx_execution` but the use in TS is complex and intertwined with\ninsertion/call success/failure and I didn't want to understand and\nimplement all that in this PR. This has to be implemented once the\ntx_execution is implemented.",
          "timestamp": "2025-04-04T23:02:10Z",
          "tree_id": "5e264e0e17cc749f0fc5f9c9c9768e4e82662c3b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/81f3d7d4515f2c05232bfe5f164bf2d08232550e"
        },
        "date": 1743811350516,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20738.982343000316,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15551.563224 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 122503800943.80002,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 1998357728,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 282821346,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 19694.08970500035,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16747.81463 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 56329.269306999995,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 56329265000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4056.838739000341,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3565.0220270000004 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11963.31475,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11963320000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2337.56",
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
          "distinct": false,
          "id": "81f3d7d4515f2c05232bfe5f164bf2d08232550e",
          "message": "feat(avm): checkpointing hints (#13302)\n\nThe hints are fully implemented but it is NOT being extensively used in\nthe code. I only added one call to `create_checkpoint` in the\n`tx_execution` but the use in TS is complex and intertwined with\ninsertion/call success/failure and I didn't want to understand and\nimplement all that in this PR. This has to be implemented once the\ntx_execution is implemented.",
          "timestamp": "2025-04-04T23:02:10Z",
          "tree_id": "5e264e0e17cc749f0fc5f9c9c9768e4e82662c3b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/81f3d7d4515f2c05232bfe5f164bf2d08232550e"
        },
        "date": 1743811359874,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 29571,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17749,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8944,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10635,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12519,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "distinct": false,
          "id": "76a4525ad0fe1f92f10ef7b2a934900f5dfcac34",
          "message": "chore: update hash to fix test and dont skip join split tests (#13175)\n\nRemove the skip on join split tests (which should probably be deleted\nsoon anyway) and update a VK hash to make those tests pass. The cause of\nthe flake seen by Charlie may still be present but we won't know if it\ndoesnt run.",
          "timestamp": "2025-04-04T23:10:56Z",
          "tree_id": "24cb165415c4a3b610004a05e248e6a7c4c8861b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/76a4525ad0fe1f92f10ef7b2a934900f5dfcac34"
        },
        "date": 1743811955144,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 21072.489440000027,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15677.555258 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 122513091066.5,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 2005982122,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 289257990,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 19734.19302100001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16905.785797 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 56857.596534,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 56857594000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4207.013992000157,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3477.543543 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 12083.269593,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 12083276000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2337.56",
            "unit": "MiB/iter",
            "extra": "iterations: undefined\ncpu: undefined MiB\nthreads: undefined"
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
          "distinct": false,
          "id": "76a4525ad0fe1f92f10ef7b2a934900f5dfcac34",
          "message": "chore: update hash to fix test and dont skip join split tests (#13175)\n\nRemove the skip on join split tests (which should probably be deleted\nsoon anyway) and update a VK hash to make those tests pass. The cause of\nthe flake seen by Charlie may still be present but we won't know if it\ndoesnt run.",
          "timestamp": "2025-04-04T23:10:56Z",
          "tree_id": "24cb165415c4a3b610004a05e248e6a7c4c8861b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/76a4525ad0fe1f92f10ef7b2a934900f5dfcac34"
        },
        "date": 1743811964626,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 29302,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17756,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 9096,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10713,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12462,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "tech@aztecprotocol.com",
            "name": "AztecBot"
          },
          "committer": {
            "email": "tech@aztecprotocol.com",
            "name": "AztecBot"
          },
          "distinct": true,
          "id": "cbf5d3fcab2c0933a0baa884565893b1da7affba",
          "message": "git subrepo push --branch=master noir-projects/aztec-nr\n\nsubrepo:\n  subdir:   \"noir-projects/aztec-nr\"\n  merged:   \"1e5731a7cb\"\nupstream:\n  origin:   \"https://github.com/AztecProtocol/aztec-nr\"\n  branch:   \"master\"\n  commit:   \"1e5731a7cb\"\ngit-subrepo:\n  version:  \"0.4.6\"\n  origin:   \"???\"\n  commit:   \"???\"",
          "timestamp": "2025-04-05T02:28:29Z",
          "tree_id": "d3209b6b86c3741f18b822e0f89468b0eb8d4456",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/cbf5d3fcab2c0933a0baa884565893b1da7affba"
        },
        "date": 1743821808015,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 29380,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17690,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8932,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10662,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12498,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "distinct": false,
          "id": "ac55a5f1bf22f45202fcfcc1764208ec07efe9be",
          "message": "chore: Fix expected revert reason in private payment test (#13331)\n\nFix test after change introduced in #13288. This didnt show in the PR\nsince the test was a flake.",
          "timestamp": "2025-04-05T08:36:42Z",
          "tree_id": "c60b70642a3bdf2ab0626a2be0e1bc96bffe8088",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ac55a5f1bf22f45202fcfcc1764208ec07efe9be"
        },
        "date": 1743844227886,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 29173,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17630,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 9007,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10664,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12476,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "d888d0e618c242b98551daf954cfe8225226c171",
          "message": "chore(avm): use tx hash as avm proof identifier (#13304)\n\n`functionName` didn't make sense anymore since we now process a whole\nTX.",
          "timestamp": "2025-04-05T08:54:06Z",
          "tree_id": "3e97592b6cd49af08373cc4719a7114a5ce9f518",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d888d0e618c242b98551daf954cfe8225226c171"
        },
        "date": 1743846595496,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20695.36305299971,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15804.67196 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 122494268329.40001,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 2022747940,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 273167868,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 19701.057096000113,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16797.398004000002 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 55894.624560000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 55894624000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4084.906800999761,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3543.9283429999996 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11801.182714999999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11801186000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2337.56",
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
          "id": "d888d0e618c242b98551daf954cfe8225226c171",
          "message": "chore(avm): use tx hash as avm proof identifier (#13304)\n\n`functionName` didn't make sense anymore since we now process a whole\nTX.",
          "timestamp": "2025-04-05T08:54:06Z",
          "tree_id": "3e97592b6cd49af08373cc4719a7114a5ce9f518",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d888d0e618c242b98551daf954cfe8225226c171"
        },
        "date": 1743846605428,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 29111,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17729,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8926,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10623,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12476,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "869dc1fbc36d5ab26e5e7828442331332fb9a357",
          "message": "feat(avm): appendLeaves hints (#13312)",
          "timestamp": "2025-04-05T19:47:08Z",
          "tree_id": "d3f48b8d897d7f8aa6aff94e5b0af7a7f9b1fe55",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/869dc1fbc36d5ab26e5e7828442331332fb9a357"
        },
        "date": 1743885839191,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20721.93261600023,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15710.171837999998 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 122458278909.40001,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 2007083040,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 283507538,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 19639.075063999826,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16649.454383 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 56162.680881,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 56162681000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4086.030835999736,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3519.653037 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 12140.285993000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 12140290000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2337.56",
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
          "id": "869dc1fbc36d5ab26e5e7828442331332fb9a357",
          "message": "feat(avm): appendLeaves hints (#13312)",
          "timestamp": "2025-04-05T19:47:08Z",
          "tree_id": "d3f48b8d897d7f8aa6aff94e5b0af7a7f9b1fe55",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/869dc1fbc36d5ab26e5e7828442331332fb9a357"
        },
        "date": 1743885848542,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 29315,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17701,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8999,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10670,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12663,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "tech@aztecprotocol.com",
            "name": "AztecBot"
          },
          "committer": {
            "email": "tech@aztecprotocol.com",
            "name": "AztecBot"
          },
          "distinct": true,
          "id": "0e38c2665d8dd8f6714b8835bf658ee52f39f0f2",
          "message": "git subrepo push --branch=master noir-projects/aztec-nr\n\nsubrepo:\n  subdir:   \"noir-projects/aztec-nr\"\n  merged:   \"8dde369fd0\"\nupstream:\n  origin:   \"https://github.com/AztecProtocol/aztec-nr\"\n  branch:   \"master\"\n  commit:   \"8dde369fd0\"\ngit-subrepo:\n  version:  \"0.4.6\"\n  origin:   \"???\"\n  commit:   \"???\"",
          "timestamp": "2025-04-06T02:30:51Z",
          "tree_id": "294a64cebd88ce5e0d486a2bfd12da31e5515ed3",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0e38c2665d8dd8f6714b8835bf658ee52f39f0f2"
        },
        "date": 1743908331868,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 29172,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17692,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8935,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10676,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12586,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "48e17a45d37590858ea152b82100c04de5f1c432",
          "message": "fix: Might fix some npm install issues. (#13339)\n\nDeletes any node_modules folders before performing yarn installs.\nWorking theory is that if the download from the cache failed halfway,\nyou might have a half install node_modules folder.\nThe failure would look like \"cache not available\" so we then proceed to\ncall yarn install on top of half a node_modules folder.\nI suspect this might leave it in an undefined state, even on success,\nand that could result in a corrupt nm folder then being uploaded to\ncache and breaking everyone.\n\nAlso allows DUMP_FAIL env var which is set when running tests in\nterminal.\nAlso fixes redis not being sourced early enough, resulting in parallel\nattempts to connect.",
          "timestamp": "2025-04-06T18:20:03Z",
          "tree_id": "7d122c15d8cd80bb7684cdd1ba2887e4ce301dcf",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/48e17a45d37590858ea152b82100c04de5f1c432"
        },
        "date": 1743965816414,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 20715.052603000004,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 15740.420819 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 122494918513.40001,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 2014380404,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 287525954,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 19693.229685999995,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16693.438009 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 56164.088737,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 56164093000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4076.731086000109,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3528.8698520000003 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 11925.296628,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 11925299000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2337.56",
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
          "id": "48e17a45d37590858ea152b82100c04de5f1c432",
          "message": "fix: Might fix some npm install issues. (#13339)\n\nDeletes any node_modules folders before performing yarn installs.\nWorking theory is that if the download from the cache failed halfway,\nyou might have a half install node_modules folder.\nThe failure would look like \"cache not available\" so we then proceed to\ncall yarn install on top of half a node_modules folder.\nI suspect this might leave it in an undefined state, even on success,\nand that could result in a corrupt nm folder then being uploaded to\ncache and breaking everyone.\n\nAlso allows DUMP_FAIL env var which is set when running tests in\nterminal.\nAlso fixes redis not being sourced early enough, resulting in parallel\nattempts to connect.",
          "timestamp": "2025-04-06T18:20:03Z",
          "tree_id": "7d122c15d8cd80bb7684cdd1ba2887e4ce301dcf",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/48e17a45d37590858ea152b82100c04de5f1c432"
        },
        "date": 1743965829178,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 29157,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17827,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8912,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10624,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12583,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "tech@aztecprotocol.com",
            "name": "AztecBot"
          },
          "committer": {
            "email": "tech@aztecprotocol.com",
            "name": "AztecBot"
          },
          "distinct": true,
          "id": "c199f2c4ebd3e1045ebab317e1e5f76a0d9a2627",
          "message": "git subrepo push --branch=master noir-projects/aztec-nr\n\nsubrepo:\n  subdir:   \"noir-projects/aztec-nr\"\n  merged:   \"6382fc0870\"\nupstream:\n  origin:   \"https://github.com/AztecProtocol/aztec-nr\"\n  branch:   \"master\"\n  commit:   \"6382fc0870\"\ngit-subrepo:\n  version:  \"0.4.6\"\n  origin:   \"???\"\n  commit:   \"???\"",
          "timestamp": "2025-04-07T02:31:06Z",
          "tree_id": "966d3ab59ca7fad75ed57f358eeb8b69ead08aee",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c199f2c4ebd3e1045ebab317e1e5f76a0d9a2627"
        },
        "date": 1743994762358,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 29274,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17688,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8905,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10695,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12578,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "829a315c6a6306a4b36023a64fcc5a04dfc0a496",
          "message": "chore: add get canonical sponsored fpc and cleanup fee opts in cli wallet (#13319)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\nline.\n\nCo-authored-by: sklppy88 <esau@aztecprotocol.com>",
          "timestamp": "2025-04-07T08:35:51Z",
          "tree_id": "ecb82893bfd0342ffa7cae8ae02ffa174c9c8214",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/829a315c6a6306a4b36023a64fcc5a04dfc0a496"
        },
        "date": 1744016995304,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 29128,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17810,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8900,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10650,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12534,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "2e6cebde0308f3a4e4fbb0b7cb36e354b23924fa",
          "message": "chore: improve re-ex flake (#13301)\n\nPasses a parallel with 100 iterations on mainframe\n\n**What was happening**\n\n- For the second test, we mock the `publicProcessorFactory.create` which\nis run every time a block will be built.\n- The happy path expects this to get called by the proposer, trigger the\nmapping switch, leading the rest of the calls to trigger a timeout.\n- Every 100 of so times the test is run, the proposer ends up building\nthe block before we mock, which means that not all of the validators run\nthe timeout, so only 2 of them time out, not 3 as the test requires\n\nIn the interests of keeping the test short, and not cleaning out state\nbetween each run, we simply relax the condition that all validators must\nexperience an error, since we assert that the transaction fails to mine",
          "timestamp": "2025-04-07T10:36:17Z",
          "tree_id": "f4d43e0a3ccacd7c8e96718fede34f4e908c20b8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/2e6cebde0308f3a4e4fbb0b7cb36e354b23924fa"
        },
        "date": 1744024234714,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 29298,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17632,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8975,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10639,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12563,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "distinct": false,
          "id": "37001ab4b72abc09c492cf7c05278b211837804a",
          "message": "fix: Wait for L1 mint tx on cross chain test harness (#13344)\n\nAttempt at fixing flakes where the balance expectation failed:\n\n```\n18:22:41   ● e2e_cross_chain_messaging token_bridge_public › Publicly deposit funds from L1 -> L2 and withdraw back to L1\n18:22:41\n18:22:41     expect(received).toEqual(expected) // deep equality\n18:22:41\n18:22:41     Expected: 1000000n\n18:22:41     Received: 0n\n18:22:41\n18:22:41       234 |     });\n18:22:41       235 |     await contract.write.mint([this.ethAccount.toString(), amount]);\n18:22:41     > 236 |     expect(await this.l1TokenManager.getL1TokenBalance(this.ethAccount.toString())).toEqual(amount);\n18:22:41           |                                                                                     ^\n18:22:41       237 |   }\n18:22:41       238 |\n18:22:41       239 |   getL1BalanceOf(address: EthAddress) {\n18:22:41\n18:22:41       at CrossChainTestHarness.toEqual [as mintTokensOnL1] (shared/cross_chain_test_harness.ts:236:85)\n18:22:41       at Object.<anonymous> (e2e_cross_chain_messaging/token_bridge_public.test.ts:46:5)\n```",
          "timestamp": "2025-04-07T12:45:34Z",
          "tree_id": "a42e3890d9aa726c20b393204f52e3f87cc9ae43",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/37001ab4b72abc09c492cf7c05278b211837804a"
        },
        "date": 1744032777270,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 29349,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17671,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8896,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10568,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12481,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "distinct": false,
          "id": "29856a8d14e015e16817e915e03c78e8af1a41ed",
          "message": "fix: removeNullifiedNotes respecting only synced nullifiers (#13334)\n\nAs Nico pointed out\n[here](https://github.com/AztecProtocol/aztec-packages/pull/13323#discussion_r2029421426)\nwe have incorrectly obtained nullifiers at the `latest` block instead of\nat the synced one in `removeNullifiedNotes` functions. This PR addresses\nthat along with making NoteDataProvider more strict and a minor\noptimization of `removeNullifiedNotes`.",
          "timestamp": "2025-04-07T14:46:46Z",
          "tree_id": "cc789aa545270346886655d093eecbce327ce174",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/29856a8d14e015e16817e915e03c78e8af1a41ed"
        },
        "date": 1744041656086,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 29107,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17696,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8923,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10710,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 12539,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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