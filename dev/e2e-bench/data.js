window.BENCHMARK_DATA = {
  "lastUpdate": 1743805226250,
  "repoUrl": "https://github.com/AztecProtocol/aztec-packages",
  "entries": {
    "End-to-end Benchmark": [
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
          "id": "6bb76db6788af83f856aae7744f5b695fe92afe6",
          "message": "feat: Add public data read gadget (#13138)\n\nImplements a gadget for public data reads. I'll consider wether to add\nthe columns for write to this gadget or to create a separate gadget for\npublic data writes. Possibly the former.",
          "timestamp": "2025-04-01T09:58:05+02:00",
          "tree_id": "60b6bc2b09b2bb1b71b14d06ff359f1968b22f54",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/6bb76db6788af83f856aae7744f5b695fe92afe6"
        },
        "date": 1743496872055,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9290,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2362487292771474,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 137318,
            "unit": "us"
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
          "id": "081f30d1537ffa28c7994b28361d35b27aad6bf7",
          "message": "fix: Uninstall gossipsub event handler on service stop (#13190)\n\nAttempts at fixing a\n[flake](http://ci.aztec-labs.com/list/6e0726a5d09ceada) where the p2p\nclient hangs while stopping.",
          "timestamp": "2025-04-01T09:08:03+01:00",
          "tree_id": "fa493f33c98aef17be513ecb31be10fdb16e90ce",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/081f30d1537ffa28c7994b28361d35b27aad6bf7"
        },
        "date": 1743496880360,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9602,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.24418527704406884,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 141994,
            "unit": "us"
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
          "id": "24d7f8b25920d877774358c5efb22083eb26759c",
          "message": "chore!: change version and protocol version to rollupVersion (#13145)",
          "timestamp": "2025-04-01T09:46:00+01:00",
          "tree_id": "5534f8571c51331eebe8168690cf366ca461cb66",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/24d7f8b25920d877774358c5efb22083eb26759c"
        },
        "date": 1743499047294,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9568,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2433199547911524,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 148063,
            "unit": "us"
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
          "id": "555652482f5ea7bba7a93807658d20fbc93fa072",
          "message": "chore: Enable debug logging for annoying unit tests (#13191)\n\nManually enable debug logging for a subset of unit tests that flake in\nCI.",
          "timestamp": "2025-04-01T09:47:08-03:00",
          "tree_id": "23d5087b27891508c7103270cbf26285f0cfd53f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/555652482f5ea7bba7a93807658d20fbc93fa072"
        },
        "date": 1743513397061,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9429,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2397980900082131,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 142317,
            "unit": "us"
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
          "id": "6b94555f1b58c6a43a703b998476d196ec3248cf",
          "message": "fix: Transpile cmov (#13194)\n\nCMOV codegen was restored by the noir team getting some improvements in\nbytecode size. We can transpile it to 3 instructions.",
          "timestamp": "2025-04-01T15:23:20+02:00",
          "tree_id": "edce38aa1bf772255988f6c611c481effa652adc",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/6b94555f1b58c6a43a703b998476d196ec3248cf"
        },
        "date": 1743515534546,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9285,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2361224351495635,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 137526,
            "unit": "us"
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
        "date": 1743522210866,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9485,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.24121308957303353,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 134911,
            "unit": "us"
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
        "date": 1743522216319,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9462,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.24064411767112323,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 148528,
            "unit": "us"
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
        "date": 1743526616223,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9347,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23769929897722747,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 142648,
            "unit": "us"
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
        "date": 1743529545459,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9548,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.24282801390238945,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 157581,
            "unit": "us"
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
        "date": 1743531539543,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9529,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.24232695916499947,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 133309,
            "unit": "us"
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
        "date": 1743546427612,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9442,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.24012244323625503,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 140918,
            "unit": "us"
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
        "date": 1743587735028,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9569,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.24334494169820214,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 145334,
            "unit": "us"
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
        "date": 1743604070329,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9436,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2399734877290757,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 145586,
            "unit": "us"
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
        "date": 1743606295795,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8373,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.21293984321665224,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 108043,
            "unit": "us"
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
        "date": 1743613222467,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9563,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.24319208088763164,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 147258,
            "unit": "us"
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
        "date": 1743617011029,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8415,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.21400316895892593,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 112204,
            "unit": "us"
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
        "date": 1743617507140,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9367,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2382252977637553,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 141238,
            "unit": "us"
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
        "date": 1743619102293,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9335,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23739441586611335,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 141650,
            "unit": "us"
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
        "date": 1743624552910,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9470,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.24084871232644442,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 137545,
            "unit": "us"
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
        "date": 1743628088163,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9514,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.24195312303413088,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 141023,
            "unit": "us"
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
        "date": 1743636818846,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9415,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23944754662043732,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 137641,
            "unit": "us"
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
        "date": 1743649157530,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9482,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.24115294257232056,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 146171,
            "unit": "us"
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
        "date": 1743668991384,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9263,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2355661549855692,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 127411,
            "unit": "us"
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
        "date": 1743672625784,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9374,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23840624471781163,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 149782,
            "unit": "us"
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
        "date": 1743676345053,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9260,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23548732807364536,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 149664,
            "unit": "us"
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
        "date": 1743690912818,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9175,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2333250191851497,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 140103,
            "unit": "us"
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
        "date": 1743699356090,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9281,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23601916853279156,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 135513,
            "unit": "us"
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
        "date": 1743700919495,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8248,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.20974676434153988,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 104842,
            "unit": "us"
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
        "date": 1743719986857,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9262,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2355428508976067,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 154349,
            "unit": "us"
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
        "date": 1743722525565,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9254,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23533033083208568,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 145667,
            "unit": "us"
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
        "date": 1743724181310,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9171,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23324093882276767,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 147640,
            "unit": "us"
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
        "date": 1743732714496,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9472,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2408911817446881,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 147219,
            "unit": "us"
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
        "date": 1743735423585,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9162,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23299980963915554,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 150956,
            "unit": "us"
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
        "date": 1743736353706,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9358,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23798803015403538,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 152045,
            "unit": "us"
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
        "date": 1743755256083,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9407,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2392449811187861,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 140856,
            "unit": "us"
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
        "date": 1743755537312,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9598,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.24409622761485034,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 156807,
            "unit": "us"
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
        "date": 1743756725587,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9263,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2355713712939323,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 149209,
            "unit": "us"
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
        "date": 1743759035401,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9536,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.24252013341517578,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 134515,
            "unit": "us"
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
        "date": 1743759422432,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9388,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2387628075354497,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 154274,
            "unit": "us"
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
        "date": 1743767797141,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9516,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2420075201416809,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 140220,
            "unit": "us"
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
        "date": 1743767837423,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9296,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2364155618179411,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 144992,
            "unit": "us"
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
        "date": 1743768710933,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9911,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.25204776204271606,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 151036,
            "unit": "us"
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
        "date": 1743770619844,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9215,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23434504777358145,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 132656,
            "unit": "us"
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
        "date": 1743782547516,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9400,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2390560156055767,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 144132,
            "unit": "us"
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
        "date": 1743783557151,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9242,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23504546719517425,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 149535,
            "unit": "us"
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
        "date": 1743801396495,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9190,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23372726505676886,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 151320,
            "unit": "us"
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
        "date": 1743801731150,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9284,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23610693660930135,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 137715,
            "unit": "us"
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
        "date": 1743803432459,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9460,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.24058737965217802,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 130989,
            "unit": "us"
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
        "date": 1743803997599,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9406,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23920234628797427,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 143921,
            "unit": "us"
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
        "date": 1743805224811,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9283,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23607600136357498,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 137037,
            "unit": "us"
          }
        ]
      }
    ]
  }
}