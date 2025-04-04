window.BENCHMARK_DATA = {
  "lastUpdate": 1743803993819,
  "repoUrl": "https://github.com/AztecProtocol/aztec-packages",
  "entries": {
    "C++ Benchmark": [
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
          "id": "6b94555f1b58c6a43a703b998476d196ec3248cf",
          "message": "fix: Transpile cmov (#13194)\n\nCMOV codegen was restored by the noir team getting some improvements in\nbytecode size. We can transpile it to 3 instructions.",
          "timestamp": "2025-04-01T15:23:20+02:00",
          "tree_id": "edce38aa1bf772255988f6c611c481effa652adc",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/6b94555f1b58c6a43a703b998476d196ec3248cf"
        },
        "date": 1743515523371,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 27136,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 18110,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8744,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10408,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 10853,
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
          "distinct": true,
          "id": "62f497f7d5c0e1189fd79ac9a720f2d20f66f22d",
          "message": "chore: move unbound impl generics to their functions (#13147)\n\nIn Rust, a code like this:\n\n```rust\ntrait Serialize<U> {}\n\nstruct PublicMutable<T>\n{\n    x: T,\n}\n\nimpl<T, U> PublicMutable<T>\nwhere\n    T: Serialize<U>,\n{\n    fn serialize() {}\n}\n```\n\nfails to compile and gives this error:\n\n```\nerror[E0207]: the type parameter `U` is not constrained by the impl trait, self type, or predicates\n --> src/main.rs:8:9\n  |\n8 | impl<T, U> PublicMutable<T>\n  |         ^ unconstrained type parameter\n```\n\nI'm not exactly sure of the technicalities here, there's an explanation\n[here](https://stackoverflow.com/a/78258009), but the solution in Rust\nis to move the constrains to the relevant functions.\n\nNoir will eventually do the same thing (see\nhttps://github.com/noir-lang/noir/pull/6388 ) so this PR fixes the code\nthat will eventually stop to compile.\n\nCo-authored-by: Tom French <15848336+TomAFrench@users.noreply.github.com>",
          "timestamp": "2025-04-01T12:14:21-03:00",
          "tree_id": "dd8c82c8025ba47877e0099a94afaa2468863eb0",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/62f497f7d5c0e1189fd79ac9a720f2d20f66f22d"
        },
        "date": 1743522201573,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 26945,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 18210,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8802,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10359,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 11133,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "384f4e5a9b82768c0fc9f48116038986340fae1a",
          "message": "refactor!: operation mouthwash (#13171)",
          "timestamp": "2025-04-01T16:13:32+01:00",
          "tree_id": "5618e87f030d69383744a1ead0fb8b97eb9bafa3",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/384f4e5a9b82768c0fc9f48116038986340fae1a"
        },
        "date": 1743522206382,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 26709,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 18168,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8721,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10600,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 10843,
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
            "email": "5764343+charlielye@users.noreply.github.com",
            "name": "Charlie Lye",
            "username": "charlielye"
          },
          "distinct": true,
          "id": "b945ce8d8e6ffa2106987a473ff1980a40f12965",
          "message": "Revert \"chore: add rollup version as universal cli option (#13205) (#13213)\"\n\nThis reverts commit 568d9e90b9e8f4e4fb3f5f062bceed397df90174.",
          "timestamp": "2025-04-01T16:27:10Z",
          "tree_id": "7f6c3309317d91047c1c1cdd997b8e412c0b64db",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/b945ce8d8e6ffa2106987a473ff1980a40f12965"
        },
        "date": 1743526606132,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 26960,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17920,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8810,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10373,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 10930,
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
          "distinct": true,
          "id": "c8220c90347ae1bba10d9bfe866d3825b7c72aef",
          "message": "fix: add check for rollup version in tx validator (#13197)\n\nFix #13192",
          "timestamp": "2025-04-01T17:25:45Z",
          "tree_id": "308f91b161d30b61564d9c8bf9d56e8104f5d535",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c8220c90347ae1bba10d9bfe866d3825b7c72aef"
        },
        "date": 1743529536209,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 27000,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17644,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8837,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10361,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 11048,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "f2cfe3faf2fb6e573eb0613adbe09cd5aad8a158",
          "message": "chore: enable sentinel in sentinel test (#13219)\n\nWith the default config being that sentinel were off, we need to\nexplicitly turn it on for the sentinel test.",
          "timestamp": "2025-04-01T17:49:35Z",
          "tree_id": "3cddf1f59d1752c20c414e58b2a7fc31437a424d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f2cfe3faf2fb6e573eb0613adbe09cd5aad8a158"
        },
        "date": 1743531530257,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 26950,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17936,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8794,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10427,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 11113,
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
          "distinct": true,
          "id": "eea1fd7cc7ab165cdb3f9266181944777748c001",
          "message": "Merge pull request #13152 from AztecProtocol/03-28-fix_incorrect_blocknumber_in_synctaggedlogs\n\nfix: incorrect blocknumber in syncTaggedLogs",
          "timestamp": "2025-04-01T20:06:49Z",
          "tree_id": "3d2841fe8cb363dc38f2a3bdd6e1a45c15d0c664",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/eea1fd7cc7ab165cdb3f9266181944777748c001"
        },
        "date": 1743546418540,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 26941,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 18188,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8744,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10339,
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
          "id": "2bc9ca244d05b3ad49d5f38d8360524919b4fa33",
          "message": "chore: remove catch-all branch from opcode match in transpiler (#13210)\n\nTo flush out any mismatches between brillig and the transpiler, I've\nremoved the wildcard match from the transpiler so that it needs to\nenumerate how it handles all brillig opcodes.\n\nIt seems like there's a `JumpNotIf` opcode which is not supported either\n(although I'm pretty confident that we never emit this.\n\n@sirasistant @dbanks12",
          "timestamp": "2025-04-02T08:58:57Z",
          "tree_id": "6e935ee1d53d1d26cd35f95905111f0a806e93a4",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/2bc9ca244d05b3ad49d5f38d8360524919b4fa33"
        },
        "date": 1743587726000,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 26846,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 18177,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8777,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10345,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 11050,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "51711291+natebeauregard@users.noreply.github.com",
            "name": "Nate Beauregard",
            "username": "natebeauregard"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "1d0185dd606eca3604971a63aef4eeb53efd8319",
          "message": "feat: accept multiple consensus client endpoints (#13022)\n\nCloses https://github.com/AztecProtocol/aztec-packages/issues/12747\n\nUse multiple endpoints for the consensus rpc as fallback in case one\ngoes down.\n\nThe following env vars were renamed and updated to be lists:\n`L1_CONSENSUS_HOST_URL` => `L1_CONSENSUS_HOST_URLS`\n`L1_CONSENSUS_HOST_API_KEY` => `L1_CONSENSUS_HOST_API_KEYS`\n`L1_CONSENSUS_HOST_API_KEY_HEADER` =>\n`L1_CONSENSUS_HOST_API_KEY_HEADERS`\n\nThe following CLI flags were renamed and updated to be lists:\n`--l1-consensus-host-url` => `--l1-consensus-host-urls`\n`--l1-consensus-host-api-key` => `--l1-consensus-host-api-keys`\n`--l1-consensus-host-api-key-header` =>\n`--l1-consensus-host-api-key-headers`",
          "timestamp": "2025-04-02T13:50:48Z",
          "tree_id": "e9628ce8aefc7b25c1ce85ee84ab420e5303da72",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1d0185dd606eca3604971a63aef4eeb53efd8319"
        },
        "date": 1743604060176,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 26808,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17830,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8693,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10377,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 10929,
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
          "distinct": true,
          "id": "5defe47be2351f8ea545700990c4a3c48d3a97d7",
          "message": "chore: Fix flake in e2e fees failures (#13229)\n\nAttempt at fixing `e2e_fees/failures` [test\nflake](http://ci.aztec-labs.com/b0b40aa7bab4695f).\n\nLooking at the logs, the culprit seems to be here:\n\n```\n22:16:13 [22:16:13.882] INFO: e2e:e2e_fees:failures L1 block 50 mined at 22:31:07 with new L2 block 12 for epoch 2 {\"l1Timestamp\":1743546667,\"l1BlockNumber\":50,\"l2SlotNumber\":34,\"l2BlockNumber\":12,\"l2ProvenBlockNumber\":11}\n22:16:14 [22:16:14.540] INFO: archiver Downloaded L2 block 12 {\"blockHash\":{},\"blockNumber\":12,\"txCount\":1,\"globalVariables\":{\"chainId\":31337,\"version\":2493758707,\"blockNumber\":12,\"slotNumber\":34,\"timestamp\":1743546667,\"coinbase\":\"0x1f7a267433ab88c7f7d5a7c05bd0cdbe1416d5e4\",\"feeRecipient\":\"0x1fb7a557b14a492bace6d93ce9b95494fb7bbd9b6233da382c4d233f49880138\",\"feePerDaGas\":0,\"feePerL2Gas\":3180}}\n22:16:14 [22:16:14.657] VERBOSE: p2p Synched to latest block 12\n22:16:14 [22:16:14.689] VERBOSE: world_state World state updated with L2 block 12 {\"eventName\":\"l2-block-handled\",\"duration\":31.29037000000244,\"unfinalisedBlockNumber\":12,\"finalisedBlockNumber\":11,\"oldestHistoricBlock\":1,\"txCount\":1,\"blockNumber\":12,\"blockTimestamp\":1743546667,\"privateLogCount\":2,\"publicLogCount\":1,\"contractClassLogCount\":0,\"contractClassLogSize\":0}\n22:16:14 [22:16:14.711] INFO: ethereum:cheat_codes Calling evm_setNextBlockTimestamp with params: [1743547027] on http://127.0.0.1/:8545\n22:16:14 [22:16:14.715] INFO: ethereum:cheat_codes Calling evm_setNextBlockTimestamp with params: [1743546691] on http://127.0.0.1/:8545\n22:16:14 [22:16:14.717] INFO: ethereum:cheat_codes Calling hardhat_mine with params: [1] on http://127.0.0.1/:8545\n22:16:14 [22:16:14.719] INFO: ethereum:cheat_codes Calling hardhat_mine with params: [1] on http://127.0.0.1/:8545\n22:16:14 [22:16:14.720] WARN: aztecjs:cheat_codes Advanced to next epoch\n22:16:14 [22:16:14.721] WARN: ethereum:cheat_codes Warped L1 timestamp to 1743546691\n22:16:14 [22:16:14.721] INFO: aztecjs:utils:watcher Slot 34 was filled, jumped to next slot\n```\n\nCompare this with a correct run:\n\n```\n22:16:54 [22:16:54.152] INFO: e2e:e2e_fees:failures L1 block 50 mined at 22:31:47 with new L2 block 12 for epoch 2 {\"l1Timestamp\":1743546707,\"l1BlockNumber\":50,\"l2SlotNumber\":34,\"l2BlockNumber\":12,\"l2ProvenBlockNumber\":11}\n22:16:54 [22:16:54.883] INFO: ethereum:cheat_codes Calling evm_setNextBlockTimestamp with params: [1743546731] on http://127.0.0.1/:8545\n22:16:54 [22:16:54.983] INFO: archiver Downloaded L2 block 12 {\"blockHash\":{},\"blockNumber\":12,\"txCount\":1,\"globalVariables\":{\"chainId\":31337,\"version\":4183907290,\"blockNumber\":12,\"slotNumber\":34,\"timestamp\":1743546707,\"coinbase\":\"0xb102a81ca1c1abe5f5a9136c3f2ab0bd885df835\",\"feeRecipient\":\"0x1dfd51415677fcb613cf399dada960bf406a57acd021dde51cd7ce40f9baf035\",\"feePerDaGas\":0,\"feePerL2Gas\":3180}}\n22:16:54 [22:16:54.989] INFO: ethereum:cheat_codes Calling hardhat_mine with params: [1] on http://127.0.0.1/:8545\n22:16:55 [22:16:55.017] WARN: ethereum:cheat_codes Warped L1 timestamp to 1743546731\n22:16:55 [22:16:55.018] INFO: aztecjs:utils:watcher Slot 34 was filled, jumped to next slot\n22:16:55 [22:16:55.027] INFO: archiver Downloaded L2 block 12 {\"blockHash\":{},\"blockNumber\":12,\"txCount\":1,\"globalVariables\":{\"chainId\":31337,\"version\":4183907290,\"blockNumber\":12,\"slotNumber\":34,\"timestamp\":1743546707,\"coinbase\":\"0xb102a81ca1c1abe5f5a9136c3f2ab0bd885df835\",\"feeRecipient\":\"0x1dfd51415677fcb613cf399dada960bf406a57acd021dde51cd7ce40f9baf035\",\"feePerDaGas\":0,\"feePerL2Gas\":3180}}\n22:16:55 [22:16:55.067] VERBOSE: world_state World state updated with L2 block 12 {\"eventName\":\"l2-block-handled\",\"duration\":15.83266499999445,\"unfinalisedBlockNumber\":12,\"finalisedBlockNumber\":11,\"oldestHistoricBlock\":1,\"txCount\":1,\"blockNumber\":12,\"blockTimestamp\":1743546707,\"privateLogCount\":2,\"publicLogCount\":1,\"contractClassLogCount\":0,\"contractClassLogSize\":0}\n22:16:55 [22:16:55.151] VERBOSE: world_state World state updated with L2 block 12 {\"eventName\":\"l2-block-handled\",\"duration\":30.628593000001274,\"unfinalisedBlockNumber\":12,\"finalisedBlockNumber\":11,\"oldestHistoricBlock\":1,\"txCount\":1,\"blockNumber\":12,\"blockTimestamp\":1743546707,\"privateLogCount\":2,\"publicLogCount\":1,\"contractClassLogCount\":0,\"contractClassLogSize\":0}\n22:16:55 [22:16:55.177] VERBOSE: p2p Synched to latest block 12\n22:16:55 [22:16:55.198] INFO: e2e:e2e_fees:failures L1 block 51 mined at 22:32:11 {\"l1Timestamp\":1743546731,\"l1BlockNumber\":51,\"l2SlotNumber\":35,\"l2BlockNumber\":12,\"l2ProvenBlockNumber\":11}\n22:16:55 [22:16:55.468] VERBOSE: prover-node Fetching 1 tx hashes for block number 12 from coordination\n22:16:55 [22:16:55.510] INFO: ethereum:cheat_codes Calling evm_setNextBlockTimestamp with params: [1743547067] on http://127.0.0.1/:8545\n22:16:55 [22:16:55.512] INFO: ethereum:cheat_codes Calling hardhat_mine with params: [1] on http://127.0.0.1/:8545\n22:16:55 [22:16:55.514] WARN: aztecjs:cheat_codes Advanced to next epoch\n```\n\nWhat's happening is that the test code is calling `advanceToNextEpoch`\nto move the timestamp forward, but at the same time the anvil test\nwatcher kicks in and warps the timestamp to that of the next slot that\nwas just mined, which is much lower than the next epoch timestamp.\nZooming in on the logs:\n\n```\n22:16:14 [22:16:14.711] INFO: ethereum:cheat_codes Calling evm_setNextBlockTimestamp with params: [1743547027] on http://127.0.0.1/:8545\n22:16:14 [22:16:14.715] INFO: ethereum:cheat_codes Calling evm_setNextBlockTimestamp with params: [1743546691] on http://127.0.0.1/:8545\n22:16:14 [22:16:14.717] INFO: ethereum:cheat_codes Calling hardhat_mine with params: [1] on http://127.0.0.1/:8545\n22:16:14 [22:16:14.719] INFO: ethereum:cheat_codes Calling hardhat_mine with params: [1] on http://127.0.0.1/:8545\n```\n\nThis PR attempts to fix it by running the test watcher more often, which\nshouldn't be too much of a problem since it should just run against\nlocal nodes. And also by forcing a test watcher run _before_ calling the\ncheat code in that test to advance the epoch.\n\nFingers crossed.",
          "timestamp": "2025-04-02T14:30:05Z",
          "tree_id": "2c97585ced35ee0a9d6c20865a6b2d44a4022f0b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5defe47be2351f8ea545700990c4a3c48d3a97d7"
        },
        "date": 1743606285957,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 24784,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 16297,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8254,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 9900,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 10086,
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
          "distinct": true,
          "id": "4ee1e4ad3c1fa444b187943b9616d7f7d01eb1ad",
          "message": "fix: read and pass rollup version (#13232)\n\nRead the canonical rollup version and enrich the configs",
          "timestamp": "2025-04-02T16:08:45Z",
          "tree_id": "c3c12d3e60adaffce7356be30e0fcc4d9ca7fd13",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/4ee1e4ad3c1fa444b187943b9616d7f7d01eb1ad"
        },
        "date": 1743613211172,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 26910,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17901,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8783,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10326,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 11056,
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
          "id": "7f96676164d348cbfb0f8d7c23b88f4844f5a804",
          "message": "feat(avm): merkle db hints (part 3) (#13199)\n\nSequential inserts for `PUBLIC_DATA_TREE` and `NULLIFIER_TREE`.\n\nBulk test yields\n```\nInitializing HintedRawMerkleDB with...\n * get_sibling_path hints: 39\n * get_previous_value_index hints: 37\n * get_leaf_preimage hints_public_data_tree: 28\n * get_leaf_preimage hints_nullifier_tree: 9\n * get_leaf_value_hints: 0\n * sequential_insert_hints_public_data_tree: 7\n * sequential_insert_hints_nullifier_tree: 2\n```",
          "timestamp": "2025-04-02T17:00:37Z",
          "tree_id": "f4548af3dbe89eb17f9e6da1302ff1adce0ed8cc",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7f96676164d348cbfb0f8d7c23b88f4844f5a804"
        },
        "date": 1743616997131,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17149.030564999975,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13704.061375 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 121704713989.6,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 1789798598,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 219662893,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 19345.33391800005,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16611.416371 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 52276.126081,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 52276127000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 4001.512235000064,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3138.936682 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9465.361586,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9465365000 ms\nthreads: 1"
          },
          {
            "name": "wasmUltraHonkVerifierWasmMemory",
            "value": "2209.31",
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
          "id": "7f96676164d348cbfb0f8d7c23b88f4844f5a804",
          "message": "feat(avm): merkle db hints (part 3) (#13199)\n\nSequential inserts for `PUBLIC_DATA_TREE` and `NULLIFIER_TREE`.\n\nBulk test yields\n```\nInitializing HintedRawMerkleDB with...\n * get_sibling_path hints: 39\n * get_previous_value_index hints: 37\n * get_leaf_preimage hints_public_data_tree: 28\n * get_leaf_preimage hints_nullifier_tree: 9\n * get_leaf_value_hints: 0\n * sequential_insert_hints_public_data_tree: 7\n * sequential_insert_hints_nullifier_tree: 2\n```",
          "timestamp": "2025-04-02T17:00:37Z",
          "tree_id": "f4548af3dbe89eb17f9e6da1302ff1adce0ed8cc",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7f96676164d348cbfb0f8d7c23b88f4844f5a804"
        },
        "date": 1743617007469,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 24556,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 16106,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 9471,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 9735,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 9941,
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
          "id": "13426fe2cb2d1ca94df815532cc3b786bc4e5ab2",
          "message": "fix: prover config read from L1 (#13237)\n\nThis PR is based on #13232",
          "timestamp": "2025-04-02T17:33:40Z",
          "tree_id": "35429d346b99e70021db70cc83d646b5b5c8647d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/13426fe2cb2d1ca94df815532cc3b786bc4e5ab2"
        },
        "date": 1743617497355,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 27025,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 18123,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8853,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10382,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 10847,
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
          "id": "b18486532af6537e648b5f5c90612bfdf0638618",
          "message": "refactor: streamlined log processing (#13107)\n\nStreamlines log processing by loading the logs from capsules after the\n`syncNotes` oracle call finishes. This prevents spawning a new simulator\nfor processing of each individual log.\n\nStumbled upon [a TXE\nissue](https://github.com/AztecProtocol/aztec-packages/issues/13221)\nwhen implementing this.\n\n---------\n\nCo-authored-by: Nicolás Venturo <nicolas.venturo@gmail.com>",
          "timestamp": "2025-04-02T17:53:50Z",
          "tree_id": "40dc859c1814685a4cf787a6259cf3f8e0653a49",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/b18486532af6537e648b5f5c90612bfdf0638618"
        },
        "date": 1743619092959,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 27038,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17716,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8789,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10470,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 10893,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "84890c220abbcbfeb63dd8e9ce9e5f590c341bee",
          "message": "feat(Barretenberg):  static analyzer's routine (#13207)\n\nThis PR adds new used_witnesses vector in UltaCircuitBuilder that\ncontains variables in one gate that are not dangerous.\n\nThere were many false cases while testing static analyzer's working with\ndifferent primitives, so it's time to save these variables and remove\nthem at the final step of working.\n\nAlso some code refactoring.",
          "timestamp": "2025-04-02T18:48:41Z",
          "tree_id": "fe74eb7536ea7582fcf965f16cb73288a37d8134",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/84890c220abbcbfeb63dd8e9ce9e5f590c341bee"
        },
        "date": 1743624539523,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 17025.511174999792,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13553.646025999999 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 121790401175.70001,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 1784574416,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 223349570,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 19276.32179300008,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16477.389157999998 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 52616.946682,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 52616947000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3924.717236000106,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3171.6181549999997 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9649.893521999998,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9649904000 ms\nthreads: 1"
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
          "id": "84890c220abbcbfeb63dd8e9ce9e5f590c341bee",
          "message": "feat(Barretenberg):  static analyzer's routine (#13207)\n\nThis PR adds new used_witnesses vector in UltaCircuitBuilder that\ncontains variables in one gate that are not dangerous.\n\nThere were many false cases while testing static analyzer's working with\ndifferent primitives, so it's time to save these variables and remove\nthem at the final step of working.\n\nAlso some code refactoring.",
          "timestamp": "2025-04-02T18:48:41Z",
          "tree_id": "fe74eb7536ea7582fcf965f16cb73288a37d8134",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/84890c220abbcbfeb63dd8e9ce9e5f590c341bee"
        },
        "date": 1743624549834,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 27008,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 18104,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8798,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10371,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 10909,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "distinct": false,
          "id": "ad0530f0ee53b46e82d09f71b19217a6da158345",
          "message": "feat: register private-only contracts in cli-wallet and misc improvements (#13245)\n\nIn order to support the new paradigm of not deploying sponsoredFPC in\nnetworks but having their address prefunded, this PR adds the ability to\nthe wallet to register private-only contracts (that are not publicly\ndeployed and available in a node)\n\nAlso includes some misc fixes and improvements such as allowing\ndeployment/registration of contracts with no initializer, or\nautomatically loading protocol contracts as aliases on startup",
          "timestamp": "2025-04-02T20:20:44Z",
          "tree_id": "afb76c438e1f07e16c035eb34ac3e21b4b278493",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ad0530f0ee53b46e82d09f71b19217a6da158345"
        },
        "date": 1743628077701,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 26922,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 18216,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8731,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10445,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 10945,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "49aabfb3df5806e3174d62a1248c46fa3c39e85c",
          "message": "fix(docs): Register FPC docs, contract deployment, events (#13222)\n\n- adds snippets to tell people to register FPCs before using them\n- adds a contract deployment summary cc @jzaki may be relevant for\ncontract upgrades section\n- closes https://github.com/AztecProtocol/aztec-packages/issues/12906\n- adds glossary and call types pages back to the sidebar",
          "timestamp": "2025-04-02T22:59:59Z",
          "tree_id": "608c0f93016dbf245e1b491f25b832e8ca648a86",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/49aabfb3df5806e3174d62a1248c46fa3c39e85c"
        },
        "date": 1743636809208,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 26894,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 18007,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8706,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10392,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 10990,
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
          "id": "d1362978a1352cb9eee6d73a0a81a8bc704d4227",
          "message": "git subrepo push --branch=master noir-projects/aztec-nr\n\nsubrepo:\n  subdir:   \"noir-projects/aztec-nr\"\n  merged:   \"42c00b05de\"\nupstream:\n  origin:   \"https://github.com/AztecProtocol/aztec-nr\"\n  branch:   \"master\"\n  commit:   \"42c00b05de\"\ngit-subrepo:\n  version:  \"0.4.6\"\n  origin:   \"???\"\n  commit:   \"???\"",
          "timestamp": "2025-04-03T02:29:39Z",
          "tree_id": "348e2a8f0eddcc9d49c8b4c17f14df062619cb4b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d1362978a1352cb9eee6d73a0a81a8bc704d4227"
        },
        "date": 1743649145362,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 26835,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17870,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8742,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10427,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 10808,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "distinct": false,
          "id": "4b0a4ad1826d0372928c680b9c8891528a73f933",
          "message": "chore: more benchmarking (#13211)\n\nAdded cheapest txs: schnorr + fee_juice transfer variants",
          "timestamp": "2025-04-03T07:47:10Z",
          "tree_id": "6aaed7e9afa4edf4d4c4a7ac4da0cd878ac8d2f0",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/4b0a4ad1826d0372928c680b9c8891528a73f933"
        },
        "date": 1743668981743,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 26982,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17998,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8877,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10481,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 10818,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "id": "1e470f05d51792066b3d4b24fa164daf4d5b73ad",
          "message": "fix: indexeddb multimap dupes (#13254)\n\nhttps://github.com/AztecProtocol/aztec-packages/pull/13107 uncovered a\nbug in the indexeddb kv store implementation that would generate\nduplicates when using multimaps. This takes care of it, fixing the boxes\ntests in the process\n\n---------\n\nCo-authored-by: thunkar <gregjquiros@gmail.com>",
          "timestamp": "2025-04-03T10:22:50+01:00",
          "tree_id": "01c419accfd8b61eaf9940cb1f0675c2ba06a73f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1e470f05d51792066b3d4b24fa164daf4d5b73ad"
        },
        "date": 1743672615519,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 26943,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17678,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8845,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10419,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 10927,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "distinct": false,
          "id": "cc609022fe6d31335a67c96521601439907df672",
          "message": "fix: archiver prune issue and slasher flake (#13156)\n\nFixes #13065.\n\n- Fix a problem in the archiver that caused the slashing test to\nconsistently fail.\n- Fix the flake, by handling a race-condition\n\nShould make the slasher consistently run without flakes, at least when\ntrying it locally for 32 parallel runs multiple times.\n\nKeeping it in the flake for now, but will look at removing it from\nflakes if no failures in the next week from it.",
          "timestamp": "2025-04-03T09:40:52Z",
          "tree_id": "518947372c6623f444b755b9c7f3aed5e083d938",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/cc609022fe6d31335a67c96521601439907df672"
        },
        "date": 1743676334584,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 26959,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 17847,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8772,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10437,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 11050,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
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
          "distinct": false,
          "id": "0dcc915177db55fc43076caee12b92d830602c85",
          "message": "feat: Remove 4 byte metadata from bb-produced proof (#13231)\n\nCloses https://github.com/AztecProtocol/barretenberg/issues/1312.\n\nRemoves the 4 byte metadata from proof and public inputs produced from\nthe `to_buffer</*include_size=*/true>()` function. We are able to\nserialize and deserialize without this metadata by use many_from_buffer\nfor deserialization.\n\nThe result is that we get to remove a lot of ugly if statements and\nweird proof parsing based on the metadata.",
          "timestamp": "2025-04-03T13:34:25Z",
          "tree_id": "8bc96cb526b03767cf89e06c47294053a97df1ea",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0dcc915177db55fc43076caee12b92d830602c85"
        },
        "date": 1743690898260,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 16651.61457699992,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13439.021811 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 121732219831.30002,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 1769540151,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 218104682,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 19327.829300000078,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16626.475573 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 52418.836910000005,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 52418838000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3946.9970099999045,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3189.520215 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 10335.275235,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 10335292000 ms\nthreads: 1"
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
            "email": "lucasxia01@gmail.com",
            "name": "Lucas Xia",
            "username": "lucasxia01"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": false,
          "id": "0dcc915177db55fc43076caee12b92d830602c85",
          "message": "feat: Remove 4 byte metadata from bb-produced proof (#13231)\n\nCloses https://github.com/AztecProtocol/barretenberg/issues/1312.\n\nRemoves the 4 byte metadata from proof and public inputs produced from\nthe `to_buffer</*include_size=*/true>()` function. We are able to\nserialize and deserialize without this metadata by use many_from_buffer\nfor deserialization.\n\nThe result is that we get to remove a lot of ugly if statements and\nweird proof parsing based on the metadata.",
          "timestamp": "2025-04-03T13:34:25Z",
          "tree_id": "8bc96cb526b03767cf89e06c47294053a97df1ea",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0dcc915177db55fc43076caee12b92d830602c85"
        },
        "date": 1743690910454,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "ivc-amm-add-liquidity-ivc-proof",
            "value": 27094,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-amm-swap-exact-tokens-ivc-proof",
            "value": 18071,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-mint-ivc-proof",
            "value": 8796,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-nft-transfer-in-private-ivc-proof",
            "value": 10417,
            "unit": "ms/iter",
            "extra": "iterations: undefined\ncpu: undefined ms\nthreads: undefined"
          },
          {
            "name": "ivc-token-transfer-ivc-proof",
            "value": 10847,
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
          "id": "2633856a9a7f4e4976a9738cdd0e9348196c67c7",
          "message": "fix(avm): fix lookup builder and FF hashing (#13263)\n\n### TL;DR\n\nFix field element hashing and improve lookup table processing in the VM2\nimplementation.\n\n### What changed?\n\n- Removed `HashableTuple` class from `utils.hpp` as it's no longer\nneeded\n- Fixed field element hashing by ensuring elements are reduced before\nhashing\n- Replaced `LookupIntoDynamicTableSequential` with\n`LookupIntoDynamicTableGeneric` for field GT lookups\n- Modified the `LookupIntoDynamicTableSequential` implementation to sort\nsource rows before processing\n- Simplified the `RangeCheckEvent` equality operator using default\ncomparison\n- Updated tuple types in `raw_data_dbs.hpp` to use standard `std::tuple`\ninstead of `HashableTuple`. This is supported by the anklr map.",
          "timestamp": "2025-04-03T17:49:13+01:00",
          "tree_id": "c4321f75d1e2929a836fe9d499ba1d0ce83b1c51",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/2633856a9a7f4e4976a9738cdd0e9348196c67c7"
        },
        "date": 1743699345017,
        "tool": "googlecpp",
        "benches": [
          {
            "name": "nativeClientIVCBench/Ambient_17_in_20/6",
            "value": 16686.393883999925,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 13541.613449 ms\nthreads: 1"
          },
          {
            "name": "field_ops_heuristic",
            "value": 121717238824.40001,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "commit(t)",
            "value": 1764227607,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "Goblin::merge(t)",
            "value": 218362933,
            "unit": "ns/iter",
            "extra": "iterations: undefined\ncpu: undefined ns\nthreads: undefined"
          },
          {
            "name": "nativeClientIVCBench/Full/6",
            "value": 19408.793668000042,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 16675.615891 ms\nthreads: 1"
          },
          {
            "name": "wasmClientIVCBench/Full/6",
            "value": 52614.30357699999,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 52614302000 ms\nthreads: 1"
          },
          {
            "name": "nativeconstruct_proof_ultrahonk_power_of_2/20",
            "value": 3964.7555129997727,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 3159.28354 ms\nthreads: 1"
          },
          {
            "name": "wasmconstruct_proof_ultrahonk_power_of_2/20",
            "value": 9948.083658000001,
            "unit": "ms/iter",
            "extra": "iterations: 1\ncpu: 9948091000 ms\nthreads: 1"
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