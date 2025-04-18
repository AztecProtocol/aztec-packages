window.BENCHMARK_DATA = {
  "lastUpdate": 1744950248952,
  "repoUrl": "https://github.com/AztecProtocol/aztec-packages",
  "entries": {
    "End-to-end Benchmark": [
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
          "id": "b49184f21cc3e9fa25af4b2df4d5765ac9865113",
          "message": "fix: Block stream fails when pruning to a block before its start (#13473)\n\nFixes #13471\n\nI moved the `L2MemoryTipsStore` from kv-store to stdlib to be able to\ntest this. Since I was at it, I also deleted the old L2BlockDownloader\n(no longer in use). Most of the changes in this PR are related to moving\nthings around.",
          "timestamp": "2025-04-11T18:16:58Z",
          "tree_id": "18a4f716eee3b8355608070ab0bf069fcb492a88",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/b49184f21cc3e9fa25af4b2df4d5765ac9865113"
        },
        "date": 1744399265094,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9508,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2566158122557659,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 142297,
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
          "id": "c580e8baa1df6afe129115cb12f82d2bdf4783e9",
          "message": "feat: fast PXE sync (#13475)\n\nThis makes PXE's syncing process much faster as it will skip downloading\nmost blocks from the node and jump all the way to the last finalized\none. PXE not having these blocks is not an issue since they aren't used\nfor anything other than to detect reorgs, for which having the last\nfinalized one is sufficient.\n\n---------\n\nCo-authored-by: thunkar <gregojquiros@gmail.com>",
          "timestamp": "2025-04-11T20:06:04Z",
          "tree_id": "9abd5106045152d6a97035ae46c67d9e4045260a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c580e8baa1df6afe129115cb12f82d2bdf4783e9"
        },
        "date": 1744405498664,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9917,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.26765284248656984,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 150227,
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
          "id": "927e80d8e69672b3ebd44414dcea502c4aac0151",
          "message": "feat: support HonkRecursionConstraints in ClientIVC (#13401)\n\nCloses https://github.com/AztecProtocol/barretenberg/issues/1243.\n\nThis PR enables HRCs while building Mega circuits, which means they can\nbe part of app circuits during CIVC.\n\nThe pairing point object functionality that comes with HRCs is not\nsupported yet though, and that is definitely required for secure usage.",
          "timestamp": "2025-04-11T19:51:59Z",
          "tree_id": "a22c01744c4a29c569024175a86068f81a0bc5b6",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/927e80d8e69672b3ebd44414dcea502c4aac0151"
        },
        "date": 1744405690029,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9635,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2600496174670127,
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
          "id": "29302c497fd29e53c20847d83ab2469435742959",
          "message": "chore: Try fix flake in reorg tests (#13498)\n\n- Ensures no caching is used for block numbers\n- Less strict assertions on block numbers",
          "timestamp": "2025-04-11T20:37:06Z",
          "tree_id": "05a5b2aca30e3a22f79f5bd536e38689afd07d9e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/29302c497fd29e53c20847d83ab2469435742959"
        },
        "date": 1744407256017,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9556,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.25791675478822457,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 135950,
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
          "id": "09a2b2e46aeb9464cf07c1d13fe2acce740c234d",
          "message": "feat!: rename encrypted_logs to messages (#13496)\n\nFurther renaming and moving incoming, but this is the largest piece as\nit affects all files, so having this as a separate part of the changeset\nwill avoid very messy PR diffs.\n\nedit: ended up making a much larger changeset, since it's all renamings.\nSummary:\n\n```\n- `encrypted_logs` to `messages`: this module now handles much more than just encrypted logs (including unconstrained message delivery, message encoding, etc.)\n- `log_assembly_strategies` to `logs`\n- `discovery` moved to `messages`: given that what is discovered are messages\n- `default_aes128` removed\n```\n\nWhich means there's no longer an `encrypted_logs` directory in\n`aztec-nr` (which I always found odd) and we instead have `messages`,\nwith the following content:\n\n```\n$ tree messages/\nmessages/\n├── discovery\n│   ├── mod.nr\n│   ├── nonce_discovery.nr\n│   ├── partial_notes.nr\n│   ├── pending_tagged_log.nr\n│   ├── private_logs.nr\n│   └── private_notes.nr\n├── encoding.nr\n├── encryption\n│   ├── aes128.nr\n│   ├── log_encryption.nr\n│   ├── mod.nr\n│   └── poseidon2.nr\n├── logs\n│   ├── arithmetic_generics_utils.nr\n│   ├── event.nr\n│   ├── mod.nr\n│   ├── note.nr\n│   └── utils.nr\n├── mod.nr\n└── msg_type.nr\n```\n\nwhich seems fairly reasonable: discovery is about discovering messages,\nencoding is of messages, encryption is arguably not strictly just\nmessages but it _is_ the only usage we have for it, and logs is about\nhow to put a message in a log.",
          "timestamp": "2025-04-11T21:08:44Z",
          "tree_id": "7a8b7ff9ba0232bef436e34ecbd273b76c98f703",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/09a2b2e46aeb9464cf07c1d13fe2acce740c234d"
        },
        "date": 1744409358109,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9737,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.26280034794766066,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 146179,
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
          "id": "b855fcd2e3f7cd8eeac984de2b167dbc34254173",
          "message": "git subrepo push --branch=master noir-projects/aztec-nr\n\nsubrepo:\n  subdir:   \"noir-projects/aztec-nr\"\n  merged:   \"e90f27d7b2\"\nupstream:\n  origin:   \"https://github.com/AztecProtocol/aztec-nr\"\n  branch:   \"master\"\n  commit:   \"e90f27d7b2\"\ngit-subrepo:\n  version:  \"0.4.6\"\n  origin:   \"???\"\n  commit:   \"???\"",
          "timestamp": "2025-04-12T02:29:02Z",
          "tree_id": "8b4bbfe86141d13323e4ee7991a16efac49b7e73",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/b855fcd2e3f7cd8eeac984de2b167dbc34254173"
        },
        "date": 1744426876269,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9448,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2549869714406942,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 146278,
            "unit": "us"
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
          "id": "b184863da69d6512bc4455d3c4ce7f9cd2c85aec",
          "message": "chore: Bump Noir reference (#13505)\n\nAutomated pull of nightly from the\n[noir](https://github.com/noir-lang/noir) programming language, a\ndependency of Aztec.\nBEGIN_COMMIT_OVERRIDE\nchore: parse IfElse in SSA parser\n(https://github.com/noir-lang/noir/pull/8043)\nfeat: `ssa::create_program_with_passes`\n(https://github.com/noir-lang/noir/pull/8035)\nchore: don't use `set_value_from_id` in\n`remove_truncate_after_range_checks`\n(https://github.com/noir-lang/noir/pull/8037)\nfix(ssa): Remove OOB checks inserted during DIE\n(https://github.com/noir-lang/noir/pull/7995)\nfix(fuzz): remove duplicate gen_loop, move unconstrained generators up\n(https://github.com/noir-lang/noir/pull/8029)\nchore: remove unnecessary double compilation\n(https://github.com/noir-lang/noir/pull/8031)\nfix(ssa): Map terminator instructions after constant folding\n(https://github.com/noir-lang/noir/pull/8019)\nfix: use proper max bit size during truncation\n(https://github.com/noir-lang/noir/pull/8010)\nfix(docs): fix proof splitting script in solidity guide\n(https://github.com/noir-lang/noir/pull/8033)\nchore: add workflow to run nightly tests on ARM64\n(https://github.com/noir-lang/noir/pull/8027)\nchore: correct name of acvm benchmark\n(https://github.com/noir-lang/noir/pull/8032)\nchore: fix failing test on MacOS\n(https://github.com/noir-lang/noir/pull/8030)\nfeat: add `while` generator to AST fuzzer\n(https://github.com/noir-lang/noir/pull/8021)\nchore: clippy fixes (https://github.com/noir-lang/noir/pull/8020)\nfeat(fuzz): Generate arbitrary `Call` in function body\n(https://github.com/noir-lang/noir/pull/7987)\nchore: use insta snapshots for ssa tests\n(https://github.com/noir-lang/noir/pull/7989)\nchore: add snapshot tests for the build artifacts as produced by\ntest_programs (https://github.com/noir-lang/noir/pull/7986)\nEND_COMMIT_OVERRIDE\n\n---------\n\nCo-authored-by: AztecBot <tech@aztecprotocol.com>",
          "timestamp": "2025-04-14T09:33:42Z",
          "tree_id": "8b1964ee61275182b24ab57a3cda29e25c5077d8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/b184863da69d6512bc4455d3c4ce7f9cd2c85aec"
        },
        "date": 1744626766617,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9663,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2595764905725712,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 154901,
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
          "id": "e3a337b4ab6792b1aafe0001d92f0aac89c4b92c",
          "message": "chore(txe): no custom public merkle db (#13508)\n\nThe TXE does not need a custom db because it already gets the net public\ndata writes from the public \"outputs\" of the simulation.",
          "timestamp": "2025-04-14T10:30:28Z",
          "tree_id": "ca5cc2faef24b5165862a0a7243da2a56e175820",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e3a337b4ab6792b1aafe0001d92f0aac89c4b92c"
        },
        "date": 1744629757557,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9862,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2649158905293364,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 150333,
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
          "id": "e09699ff628bb14bbb9fe0b07111fe80b1aa1c7c",
          "message": "feat!: remove PXE starting block (#13504)\n\nAs of https://github.com/AztecProtocol/aztec-packages/pull/13475, PXE no\nlonger needs to use the `startingBlock` option, and hence we can also\nremove the environment variable used to configure it. The effects of\npassing no value are equivalent to a value of 1, which was the default\nif the envvar was unset.",
          "timestamp": "2025-04-14T11:28:14Z",
          "tree_id": "47902f8d544767fcaf01fbf0e9cbafa201a5aa74",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e09699ff628bb14bbb9fe0b07111fe80b1aa1c7c"
        },
        "date": 1744634270729,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 10077,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2707005378007584,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 175551,
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
          "id": "b29b358641a1d6f71d2dd0746b095526948532cd",
          "message": "chore: add helper script for gov (#13385)\n\nAdding some scripts for setting things up and dealing with some\ngovernance testing.",
          "timestamp": "2025-04-14T13:02:51Z",
          "tree_id": "c2f6dc81e214a51cbe9c64d67e0a6ce19af1bda3",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/b29b358641a1d6f71d2dd0746b095526948532cd"
        },
        "date": 1744639013217,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9915,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2663422972609092,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 155704,
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
          "id": "89462d542f15f8f384b201338ff2c3e90d8ddba6",
          "message": "chore: Less strict block proposal init deadline (#13522)\n\nInstead of using a fixed deadline of 3s for the start of building a\nblock, we derive it from the total aztec slot time, assuming we will\nallocate at least 1s to tx processing.\n\nFixes #13511",
          "timestamp": "2025-04-14T13:19:06Z",
          "tree_id": "f6a368efaef9ef69a9a591216eb69ca30e0c46b5",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/89462d542f15f8f384b201338ff2c3e90d8ddba6"
        },
        "date": 1744639924698,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9476,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2545615520923305,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 137003,
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
          "id": "afd35789e6995647ea8fd9c9f6690a7bcbc69842",
          "message": "chore: fix mistery irreproducible bug (#13494)\n\nCloses https://github.com/AztecProtocol/aztec-packages/issues/10558.\n\nI didn't really fix anything, I just removed the 'fix' and couldn't\nreproduce.",
          "timestamp": "2025-04-14T13:28:42Z",
          "tree_id": "784619db0d0304595aac085ca1008e106e9f2068",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/afd35789e6995647ea8fd9c9f6690a7bcbc69842"
        },
        "date": 1744641366230,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9575,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2572132894904708,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 147924,
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
          "id": "1b97cd2055e6b77974eea43ba66503b875d42f14",
          "message": "feat: Validator waits for archiver sync (#13497)\n\nSlow validators may receive a proposal to attest to before their\narchiver has synced to the block immediately before. Example log:\n\n```\n[18:02:27.581] ERROR: validator Failed to attest to proposal: Error: Unable to sync to block number 4811 (last synced is 4810)\n    at ServerWorldStateSynchronizer.syncImmediate (file:///usr/src/yarn-project/world-state/dest/synchronizer/server_world_state_synchronizer.js:145:19)\n    at async Sequencer.buildBlock (file:///usr/src/yarn-project/sequencer-client/dest/sequencer/sequencer.js:351:9)\n    at async ValidatorClient.reExecuteTransactions (file:///usr/src/yarn-project/validator-client/dest/validator.js:161:41)\n    at async ValidatorClient.attestToProposal (file:///usr/src/yarn-project/validator-client/dest/validator.js:127:17)\n    at async LibP2PService.processValidBlockProposal (file:///usr/src/yarn-project/p2p/dest/services/libp2p/libp2p_service.js:451:29)\n    at async LibP2PService.processBlockFromPeer (file:///usr/src/yarn-project/p2p/dest/services/libp2p/libp2p_service.js:441:9)\n    at async LibP2PService.handleNewGossipMessage (file:///usr/src/yarn-project/p2p/dest/services/libp2p/libp2p_service.js:355:13)\n    at async safeJob (file:///usr/src/yarn-project/p2p/dest/services/libp2p/libp2p_service.js:285:17) {\"slotNumber\":7976,\"blockNumber\":4812,\"archive\":\"0x1f26b22cdad7132d0bb06461300a27b12fde92b633633550e37764d810304cb4\",\"txCount\":0,\"txHashes\":[]}\n[18:02:29.560] INFO: archiver Downloaded L2 block 4811 {\"blockHash\":{},\"blockNumber\":4811,\"txCount\":0,\"globalVariables\":{\"chainId\":11155111,\"version\":3538330213,\"blockNumber\":4811,\"slotNumber\":7975,\"timestamp\":1744394520,\"coinbase\":\"0x2b64d6efab183a85f0b37e02b1975cd9f2d98068\",\"feeRecipient\":\"0x0000000000000000000000000000000000000000000000000000000000000000\",\"feePerDaGas\":0,\"feePerL2Gas\":0}}\n```\n\nThis PR has the validator keep retrying to sync to the target block\nuntil the reexecution deadline, rather than giving up immediately.",
          "timestamp": "2025-04-14T17:16:26Z",
          "tree_id": "51d2532f94267dcda9e5aad10e8fff867c4f68b3",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1b97cd2055e6b77974eea43ba66503b875d42f14"
        },
        "date": 1744655595895,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9517,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2556619535385532,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 145980,
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
          "distinct": true,
          "id": "f7fb5e651f2f73bdd224b3a4d2e5b742bbe4ca47",
          "message": "chore: use heap buffer methods for civc proof in bbjs (#13541)\n\nAdd \"heap buffer\" serialization for CIVC Proof type and use in bbjs\nmethods",
          "timestamp": "2025-04-14T22:07:25Z",
          "tree_id": "8dd4fb88b6d5b3b427ef618506a650fd6dff2a22",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f7fb5e651f2f73bdd224b3a4d2e5b742bbe4ca47"
        },
        "date": 1744672902027,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9655,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2593500221614594,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 158299,
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
          "id": "5e8b0922bd5375cb038bb85bbf7751c48ae32aa6",
          "message": "feat: more tests for pairing point object (#13500)\n\nAdds integration tests to test that CIVC pass with\nHonkRecursionConstraints, and that tampering with the VK doesn't cause\nthings to fail (yet).",
          "timestamp": "2025-04-15T00:29:36Z",
          "tree_id": "7810c86a2da7a939065e619e524188eec8395af8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5e8b0922bd5375cb038bb85bbf7751c48ae32aa6"
        },
        "date": 1744681660501,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9650,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2592176500261032,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 143036,
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
          "id": "9a5dc93c7e2ae7cce604757051bc3b7da5ae30d5",
          "message": "chore: bench ivc in native/wasm with memory/time (#13186)\n\nAdds ability to just call the main.cpp flow in wasm, allowing us to\neasily port our current benchmark to wasm, and measures time + memory\n\n- support compiling bb cli (main.cpp logic) in WASM, shim the no\nexceptions support accordingly. Note this is ONLY FOR wasmtime dev\ntesting. It does not get us browser support because the WASI file system\nAPI is not defined there.\n- add an experimental no exceptions build for native, to be benchmarked\n- support benching both wasm and native and capture their memory amounts\n- support a NATIVE_PRESET env var that controls bootstrap and benchmarks\nto opt into op count time metrics\n- more condensed printing of ivc trace amounts, just printing the\nmaximums and printing multiple counts on one line\n- Tricky change: Fix a static initialization bug when compiling plookup\ntables in wasm. a function static was used\n\nCloses https://github.com/AztecProtocol/barretenberg/issues/1244\n\n---------\n\nCo-authored-by: Copilot <175728472+Copilot@users.noreply.github.com>",
          "timestamp": "2025-04-15T00:31:53Z",
          "tree_id": "c3b92f293fd64bda64ceab543f19cb91a4c33111",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9a5dc93c7e2ae7cce604757051bc3b7da5ae30d5"
        },
        "date": 1744682191086,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9880,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.26540412156676546,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 153097,
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
          "distinct": true,
          "id": "a7cfbbe8595ae3bdc4c7dd204dac524c03bbb358",
          "message": "fix: cpp bench ci (#13565)",
          "timestamp": "2025-04-15T10:10:17-04:00",
          "tree_id": "8d40dee5b283e69d03eb5715cdbc408c7d6be5ab",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a7cfbbe8595ae3bdc4c7dd204dac524c03bbb358"
        },
        "date": 1744729052533,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9971,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2678595344601291,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 159081,
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
          "id": "a89de5d213cf5d5cdbdc4e2e308848a20e64ef5f",
          "message": "refactor(public/avm): from hints to the end of the world (#13459)\n\nI had a few design goals with this PR\n1. Move the merkle hinting layer to the merkle db directly (from the\nPublicContractsDB)\n1. Make hinting a TxSimulator concept\n1. Divide the tree accesses into low level and high level (like we do in\nC++).\n1. Tighten our exports\n1. Some cleanups\n\nI'm satisfied with the result, but there are some things worth noting\n* Now the TxSimulator wraps the merkle db into a hinting merkle db. This\nmeans that the hints will _always_ be generated and the caller has no\ncontrol. However, reexecution and the TXE could benefit from a model\nwhere no hinting (or tracing) is done. I had a version of this PR where\nthis was done via an extra PublicTreesDBFactory that was passed to the\nTxSimulator, but I found it too much for the moment. I think at some\npoint we can consider having a more flexible factory type for the\nPublicProcessor and the TxSimulator where we can specify, e.g., merkle\nops, tracing, hinting, etc and have a \"Proving\" factory and a\n\"Simulation-only\" factory.\n\n## AI generated description\n\nThis PR refactors the public processor and simulator components to use\n`MerkleTreeWriteOperations` directly instead of going through the\n`PublicTreesDB` abstraction. Key changes include:\n\n- Changed `PublicTxSimulator` to accept a `MerkleTreeWriteOperations`\ninstead of `PublicTreesDB`\n- Moved `PublicTreesDB` to be an internal implementation detail rather\nthan a public API\n- Refactored `HintingPublicTreesDB` to `HintingMerkleWriteOperations` to\nwork directly with the merkle tree interface\n- Moved `SimpleContractDataSource` from `avm/fixtures` to\n`public/fixtures` for better organization\n- Added high-level methods to `PublicTreesDB` for writing note hashes\nand nullifiers\n- Simplified tree operations in `PublicPersistableStateManager` by using\nthe new high-level methods\n- Updated `checkL1ToL2MessageExists` to no longer require a contract\naddress parameter\n\nThis change simplifies the codebase by reducing unnecessary abstractions\nand making the component dependencies more explicit.",
          "timestamp": "2025-04-15T14:59:39Z",
          "tree_id": "859d0be15b138c9bbe6d544b98552e8443fb7953",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a89de5d213cf5d5cdbdc4e2e308848a20e64ef5f"
        },
        "date": 1744732456970,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9997,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.26862577233267365,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 159203,
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
          "id": "ea12d56bbd83b127f27787695d398b40aa2a36f7",
          "message": "fix: make the token use large notes first (#13545)\n\nThis fixes an issue @alexghr has encountered where the AMM bot crashes\ndue to trying to use too many small notes. There's other things to fix\n(make `transfer_to_public` recursive, have better max notes limits,\netc.), but this quick patch will fix most issues (unless someone needs\nto combine more than 15 notes for a transfer), so it's a good stopgap\nmeasure.\n\nThe fix is trivial, but adding tests for it is not, reflecting TXE's\npoor state of affairs. I wanted to test that regardless of the order in\nwhich two notes are created, we always consume the larger one first, but\na) was forced to write two separate tests, since it seems we lack\ncontrol over TXE's execution cache (notably transient nullified notes),\nand b) was forced to use the actual token contract and to call contract\nfunctions due to #13269. Usage of `set_contract_address` is also quite\nobscure.\n\nEach test could e.g. have looked like this, which is much simpler and\nhas way fewer moving pieces:\n\n```noir\nenv.private_tx(|context| => {\n    let storage_slot = 5;\n    let balance_set =\n        BalanceSet::new(context, storage_slot);\n\n    recipient_balance_set.add(owner, small_note_amount);\n    recipient_balance_set.add(owner, large_note_amount);\n});\n\nenv.private_tx(|context| => {\n    let storage_slot = 5;\n    let balance_set =\n        BalanceSet::new(context, storage_slot);\n\n    let emission = recipient_balance_set.sub(owner, small_note_amount);\n    assert_eq(emission.emission.unwrap().note.value, large_mint_amount - small_mint_amount);\n});\n```\n\nI guess we'd need to explicitly deal with note discovery via oracle\nhints in that case, but regardless it seems solvable. It'd also let us\ntest that this works for both transient and settled notes, or even a mix\n(which is something we should have extensive coverage of in the almost\nnon-existent note getter options tests).",
          "timestamp": "2025-04-15T15:05:29Z",
          "tree_id": "eb29cd8ce9439d0246d24970dd5d08cd63ff0ea0",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ea12d56bbd83b127f27787695d398b40aa2a36f7"
        },
        "date": 1744732923624,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9631,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.25878517440438653,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 155851,
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
          "id": "6b938322017ba4fa0baaf35be09c1c28b80e2dba",
          "message": "fix: amm bot (#13553)\n\nFix #13544",
          "timestamp": "2025-04-15T15:24:13Z",
          "tree_id": "bacb6480e099c6c677477c77d97bd770ae673079",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/6b938322017ba4fa0baaf35be09c1c28b80e2dba"
        },
        "date": 1744733943064,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9789,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2630146901594895,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 151896,
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
          "id": "42dfbbf6e11b63727add72987edbbea08fb21e64",
          "message": "chore(noir-contracts): update readme (#13563)\n\nCurrent prose is unacceptable\n\nCo-authored-by: ludamad <adam.domurad@gmail.com>",
          "timestamp": "2025-04-15T15:25:00Z",
          "tree_id": "78e1c92de1f31112390c265aa97c947583cb9fdb",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/42dfbbf6e11b63727add72987edbbea08fb21e64"
        },
        "date": 1744734280580,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9874,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2653170166905629,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 153503,
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
          "id": "9a73c4a874f4f03f1f9de3a3cd9c8f57f742b32a",
          "message": "fix: wasm memory benchmark (#13573)",
          "timestamp": "2025-04-15T15:44:23Z",
          "tree_id": "e7374c7f21712a84f3e75eb9daef62489303baa7",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9a73c4a874f4f03f1f9de3a3cd9c8f57f742b32a"
        },
        "date": 1744736658746,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9538,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.25627784618972504,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 145101,
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
          "id": "b30b5b3bf13cf0aa556fc25c7f57869044a6a4ed",
          "message": "feat(avm): tagged value type in C++ (#13540)\n\nThe main new class is in `tagged_value.{hpp,cpp}`. You can see its use\nin `memory.{hpp,cpp}` and... everywhere. It was already all over the\nplace so it's a good thing that we tackle it now. It was a bit of a\npain.\n\n## AI generated description\n\nThis PR introduces a new `TaggedValue` class to replace the previous\nmemory value representation. The `TaggedValue` class encapsulates both a\nvalue and its type tag, providing a more robust and type-safe way to\nhandle different data types in the VM.\n\nKey changes:\n- Added `TaggedValue` class that uses a variant to store different\nnumeric types (uint1_t, uint8_t, uint16_t, etc.)\n- Implemented a new `uint1_t` class to represent boolean values\n- Updated memory operations to use `TaggedValue` instead of separate\nvalue and tag parameters\n- Modified bitwise operations to work with the new `TaggedValue` type\n- Updated all related code to use the new type system, including tests\nand simulation code",
          "timestamp": "2025-04-15T16:09:36Z",
          "tree_id": "41e26edd1182b5375e58a8477c0efab9eb06c569",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/b30b5b3bf13cf0aa556fc25c7f57869044a6a4ed"
        },
        "date": 1744738054026,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9502,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2553180190181286,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 141752,
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
          "id": "1a3a326ef99340a61e917b3c2f8a6484337c0ad7",
          "message": "chore: mint block rewards for 200K blocks at deployment (#13537)\n\nFund the reward distributor with funds for 200K blocks as part of the\ndeployments.",
          "timestamp": "2025-04-15T17:03:40Z",
          "tree_id": "4f6853098244f141aa6da5921c51bdbc66e13de1",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1a3a326ef99340a61e917b3c2f8a6484337c0ad7"
        },
        "date": 1744740126768,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9618,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.25843098794290226,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 145221,
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
          "id": "a296945ca8ef4e8b1fbfd9870eaf6030596cf241",
          "message": "chore: Cleanup scripts in package jsons in yarn-project (#13527)\n\n- Removes all `formatting` scripts in individual packages\n- Delegates `test`, `lint`, and `format` in the root to bootstrap.sh\n- Directly calls `tsc` for building on the root\n- Removes unmaintained watch script",
          "timestamp": "2025-04-15T18:19:27Z",
          "tree_id": "20194fade3cd215689866b882730ebf4952d5c40",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a296945ca8ef4e8b1fbfd9870eaf6030596cf241"
        },
        "date": 1744745522660,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 10343,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.27792028912603517,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 169562,
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
          "distinct": true,
          "id": "3048a14c958976b9ce14b7a8640a4e671a6f882e",
          "message": "chore(bb): Make goblin a proper source module (#13580)\n\n- Also, don't just display one error in the IDE",
          "timestamp": "2025-04-15T21:59:00Z",
          "tree_id": "b374a9d481f578e80b1bdba6a788c4ad78d74366",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/3048a14c958976b9ce14b7a8640a4e671a6f882e"
        },
        "date": 1744759477593,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9618,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2584396036983741,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 137162,
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
          "id": "0ebb29ebf3798a17b162fadc6e9c0c7fcd98256a",
          "message": "chore(bb): debugging helpers (#13584)\n\nAllows for starting a vscode debugging session with whatever the cmake\ntarget currently selected is and with pretty-print helpers for fq, fr,\nuint256_t",
          "timestamp": "2025-04-15T23:02:01Z",
          "tree_id": "7afd67e45cbeadd910dc4dac17e3dc146703d875",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0ebb29ebf3798a17b162fadc6e9c0c7fcd98256a"
        },
        "date": 1744763240423,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9691,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2603799829242807,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 148238,
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
          "id": "1ad924919ce90fa089ffd546dfb562c4d82af9dc",
          "message": "test: wasm proof verifying with native bb (#13499)\n\nMain feature\n- New test for testing wasm proof output verifying with native CLI,\nadapting the wasm ivc test in yarn-project\n\nAlso\n- dont hide test info by default\n- allow passing BB_WORKING_DIRECTORY env var and keeping outputs around\nlike in e2e\n- use new-style logger in wasm test, dedupe some setup code\n\n---------\n\nCo-authored-by: maramihali <mara@aztecprotocol.com>\nCo-authored-by: ledwards2225 <l.edwards.d@gmail.com>\nCo-authored-by: ludamad <domuradical@gmail.com>\nCo-authored-by: ludamad <adam.domurad@gmail.com>",
          "timestamp": "2025-04-16T00:34:17Z",
          "tree_id": "cc20ab2891a4c1ad6dbf094c8ec45e008bc0c7d9",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1ad924919ce90fa089ffd546dfb562c4d82af9dc"
        },
        "date": 1744766717512,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9578,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.25735428471722166,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 146197,
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
          "id": "1dc92ef01fe73ced35b78c622c04e53f38dbfa24",
          "message": "git subrepo push --branch=master noir-projects/aztec-nr\n\nsubrepo:\n  subdir:   \"noir-projects/aztec-nr\"\n  merged:   \"6d4c70734f\"\nupstream:\n  origin:   \"https://github.com/AztecProtocol/aztec-nr\"\n  branch:   \"master\"\n  commit:   \"6d4c70734f\"\ngit-subrepo:\n  version:  \"0.4.6\"\n  origin:   \"???\"\n  commit:   \"???\"",
          "timestamp": "2025-04-16T02:30:44Z",
          "tree_id": "d521b1371129dc3447dfa9d9d360fa818f12b7a0",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1dc92ef01fe73ced35b78c622c04e53f38dbfa24"
        },
        "date": 1744772858751,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9810,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2635956021709734,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 150952,
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
          "distinct": true,
          "id": "df73c0528f56b50604febf3f9d02edbc370c7ce9",
          "message": "feat: Refactor IPA claim handling in acir format to support them for AVM (#13547)\n\nRefactor where we handle IPA claim handling to be at the acir_format\nlevel instead in within `process_honk_recursion_constraints`. This is\nneeded to handle circuits like the public base which will have AVM\nrecursion constraints and RollupHonk recursion constraints, which will\nnow BOTH produce IPA claims/proofs.\n\nFix Goblin AVM recursive verifier test and clean some small type-related\nthings.",
          "timestamp": "2025-04-16T02:23:30Z",
          "tree_id": "fa8082fa5a3086d61e878da4aa7c54d9931fbed7",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/df73c0528f56b50604febf3f9d02edbc370c7ce9"
        },
        "date": 1744775067723,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9648,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2592461433247488,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 157717,
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
          "distinct": true,
          "id": "9f0ff4a6bfed5f53ec2512e32c733e194c928cb7",
          "message": "chore: Updated contract addresses for alpha-testnet (#13585)\n\nThis PR simply updates the alpha-testnet contract addresses",
          "timestamp": "2025-04-16T13:54:07Z",
          "tree_id": "a829796f55fd5d13553aa1c05d6def06693f522d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9f0ff4a6bfed5f53ec2512e32c733e194c928cb7"
        },
        "date": 1744815219132,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9576,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2572876733475699,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 142845,
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
          "id": "60e73f987f850ad0db8fcdce3e9e9d092f2fc0d0",
          "message": "chore: Fetch rollup address using version as index (#13620)\n\nIf fetching the rollup address given a version identifier fails, it\ntries again using it as an index instead.",
          "timestamp": "2025-04-16T16:43:39Z",
          "tree_id": "c230c80adfb26d86a4c41c3d290518f687d5d1db",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/60e73f987f850ad0db8fcdce3e9e9d092f2fc0d0"
        },
        "date": 1744825246881,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9538,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.25627134419958003,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 140922,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "35969035+varex83@users.noreply.github.com",
            "name": "Bohdan Ohorodnii",
            "username": "varex83"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": false,
          "id": "4264c8cbcd0a44bab5c50ff1a3a28cc441b7b060",
          "message": "feat(p2p): add private peers (#12585)\n\nCloses #12444\n\n---------\n\nCo-authored-by: Nate Beauregard <nathanbeauregard@gmail.com>\nCo-authored-by: Maddiaa <47148561+Maddiaa0@users.noreply.github.com>\nCo-authored-by: Nate Beauregard <51711291+natebeauregard@users.noreply.github.com>",
          "timestamp": "2025-04-16T17:16:57Z",
          "tree_id": "06dd25b616ff83fd16fe835e26928140394f1c2b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/4264c8cbcd0a44bab5c50ff1a3a28cc441b7b060"
        },
        "date": 1744827338014,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9714,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.26099765832900945,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 152126,
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
          "id": "70c58ab773c7e8e2ed2bcc4eb7acbeec31477200",
          "message": "fix: update metric name to avoid conflicts (#13629)\n\nFix #13626",
          "timestamp": "2025-04-16T18:00:31Z",
          "tree_id": "deff475860a9797291468cfb79f8dac7115500ad",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/70c58ab773c7e8e2ed2bcc4eb7acbeec31477200"
        },
        "date": 1744830382307,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9490,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.25497669895436603,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 140365,
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
          "id": "caac1c911722c6ec43cba85cf2b6786a247bfc52",
          "message": "refactor(avm): move interaction jobs to trace builders (#13621)\n\nNext step is to make the tests use these, so that we are sure we are\ntesting the way we generate lookups in prod.\n\nHowever this is not trivial because sometimes we want to use subsets, or\nwe want to expect failures when running particular subsets. Will think\nmore about how to do this. I have some ideas.",
          "timestamp": "2025-04-16T17:35:10Z",
          "tree_id": "fce066832067441f1db3bba56014f46fc872ae9d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/caac1c911722c6ec43cba85cf2b6786a247bfc52"
        },
        "date": 1744830386277,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9480,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.25471892276310937,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 142653,
            "unit": "us"
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
          "distinct": false,
          "id": "f02123d95d6a84460b6535312f4d1de52e8e1e19",
          "message": "feat: SMT verification module updates (#13551)\n\nThis pr mostly consists of code refactoring/renames \n\n## Cmake\n\n`cvc5` build is now multi-threaded\n\n## Circuit Builders\n\n`CircuitBuilderBase` - added `circuit_finalized` into msgpack schema\n`UltraCircuitBuilder` - zero is now force renamed during circuit export\n\n## smt_subcircuits\n\nswitched `0xabbba` to `0` since it produced failures duirng circuit\ncreations\n\n## Solver\n\n- Added new method `get` and `operator[]`. These two methods extract the\nvalue of the variable from solver. Added a test\n- fixed the incorrectly placed `BITVECTOR_UDIV`\n- renamed `getValue` to `get_symbolic_value` to avoid confusion\n\n## Terms\n\n- New constructor, based on `bb::fr` value\n- Got rid of `isFiniteField` like members. Useless\n- Added `normalize` method, for more readability\n- Refactored the operators\n\n## SMT_Util\n\n- add `is_signed` flag in `string_to_fr()` to avoid overflows \n\n## Tests\n\nFor most part it's either a rename, engine switch or new `operator[]`\nrefactoring\n\nAlso \n- fixed an incorrect `extract_bit` test\n- \n\nAll the current changes are reflected in `README.md`\n\n---------\n\nCo-authored-by: Innokentii Sennovskii <isennovskiy@gmail.com>",
          "timestamp": "2025-04-16T19:05:39Z",
          "tree_id": "ed81b35b21e04f83e64049ed57e98b3ed1ca8ac9",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f02123d95d6a84460b6535312f4d1de52e8e1e19"
        },
        "date": 1744835242718,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9963,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.26771038020228194,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 153031,
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
          "id": "f709fab13118d12b85c7b1efd724b1876b9ed520",
          "message": "feat(p2p): optional P2P_BROADCAST_PORT (#13525)\n\nfixes: https://github.com/AztecProtocol/aztec-packages/issues/13165",
          "timestamp": "2025-04-16T19:57:48Z",
          "tree_id": "9209901346aa4f083454c46bb7a5ad010e190931",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f709fab13118d12b85c7b1efd724b1876b9ed520"
        },
        "date": 1744836750206,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9711,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2609215907136962,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 150587,
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
          "id": "abbad4c54fa4ec300dfc8fa0ea6b407979fdd247",
          "message": "chore: Use chain monitor to sync system time in p2p tests (#13632)\n\nInstead of sending a tx and awaiting its receipt, we monitor for new l1\nblocks and update time then.\n\nShould fix a [flake in p2p\ntests](http://ci.aztec-labs.com/e0ca323545d90e02) where\n`syncMockSystemTime` was called twice simultaneously and caused two txs\nfrom the same address to be sent at the same time, leading to a nonce\nclash:\n\n```\n19:30:55     FormattedViemError: Nonce provided for the transaction is lower than the current nonce of the account.\n19:30:55     Try increasing the nonce or find the latest nonce with `getTransactionCount`.\n19:30:55\n19:30:55     Request Arguments:\n19:30:55       from: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266\n19:30:55       to: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266\n19:30:55       value:                 0.000000000000000001 ETH\n19:30:55       data: 0x\n19:30:55       gas:                   25201\n19:30:55       maxFeePerGas:          1.365169136 gwei\n19:30:55       maxPriorityFeePerGas:  1.2 gwei\n19:30:55\n19:30:55     Details: transaction already imported\n19:30:55     Version: viem@2.23.7\n19:30:55\n19:30:55       298 |         }\n19:30:55       299 |     }\n19:30:55     > 300 |     return new FormattedViemError(formattedRes.replace(/\\\\n/g, '\\n'), error?.metaMessages);\n19:30:55           |            ^\n19:30:55       301 | }\n19:30:55       302 | export function tryGetCustomErrorName(err) {\n19:30:55       303 |     try {\n19:30:55\n19:30:55       at formatViemError (../../ethereum/dest/utils.js:300:12)\n19:30:55       at L1TxUtilsWithBlobs.sendTransaction (../../ethereum/dest/l1_tx_utils.js:177:31)\n19:30:55       at L1TxUtilsWithBlobs.sendAndMonitorTransaction (../../ethereum/dest/l1_tx_utils.js:326:48)\n19:30:55       at P2PNetworkTest.syncMockSystemTime (e2e_p2p/p2p_network.ts:163:25)\n19:30:55       at e2e_p2p/reex.test.ts:219:9\n```",
          "timestamp": "2025-04-16T20:54:21Z",
          "tree_id": "d5acec0beb696138bfa86cda4f1f47c079f21e4e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/abbad4c54fa4ec300dfc8fa0ea6b407979fdd247"
        },
        "date": 1744840062074,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9939,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.26704530129786685,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 154131,
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
          "id": "da1e6986d7f59b49739a42aba07718b75f39e6cb",
          "message": "git subrepo push --branch=master noir-projects/aztec-nr\n\nsubrepo:\n  subdir:   \"noir-projects/aztec-nr\"\n  merged:   \"24b9f372b4\"\nupstream:\n  origin:   \"https://github.com/AztecProtocol/aztec-nr\"\n  branch:   \"master\"\n  commit:   \"24b9f372b4\"\ngit-subrepo:\n  version:  \"0.4.6\"\n  origin:   \"???\"\n  commit:   \"???\"",
          "timestamp": "2025-04-17T02:30:31Z",
          "tree_id": "df48f992689bd71532eac9290ea97a0cf8522f70",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/da1e6986d7f59b49739a42aba07718b75f39e6cb"
        },
        "date": 1744859082706,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 10481,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.28160518333764656,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 165103,
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
          "id": "489c6cf66bdf9eaba7e1c98d9e2004fe703b22cc",
          "message": "feat: track rewards and slots (#13546)\n\nThis PR adds metrics to track rewards for sequencers/provers and slots\nfor sequencers.",
          "timestamp": "2025-04-17T11:18:15Z",
          "tree_id": "2ba9cf4d0ee50f07dca264ce6f95b4090235e78a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/489c6cf66bdf9eaba7e1c98d9e2004fe703b22cc"
        },
        "date": 1744891835627,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 10191,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2738257871053794,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 162367,
            "unit": "us"
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
          "distinct": false,
          "id": "53c070d3954b927a2718f32f4823dc51d8764bda",
          "message": "fix: make translator use ultra rather than eccvm ops (#13489)\n\nWhile attempting to implement the consistency check between the Merge\nand Translator Verifier I realised that the TranslatorCircuitBuilder is\nconstructed using the VMops, redundantly converted to UltraOps. This PR\naddressed the issue and attempts a small cleanup on the\n`UltraEccOpsTable`.\n\nCloses https://github.com/AztecProtocol/barretenberg/issues/1266",
          "timestamp": "2025-04-17T14:34:14Z",
          "tree_id": "5382cecaf1f714013616d2c47bbc18a23b497754",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/53c070d3954b927a2718f32f4823dc51d8764bda"
        },
        "date": 1744903759848,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9706,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2608001243494993,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 145365,
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
          "id": "9d941b6b55e03d2f5ad96b00fd488a71e6082f3f",
          "message": "fix(avm): cpp addressing (#13652)\n\nfix(avm): cpp addressing\n\ntesting for addressing",
          "timestamp": "2025-04-17T15:00:08Z",
          "tree_id": "94bb248508c49d688c6ebec36bbc37a320590322",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9d941b6b55e03d2f5ad96b00fd488a71e6082f3f"
        },
        "date": 1744906514101,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 10089,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2710760989221743,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 159782,
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
          "id": "58c143b4fcdbd323fad178549c27042815ce4de0",
          "message": "fix: discv5 test failure (#13653)\n\n## Overview\n\nBase config was being passed to the bootstrap node by reference, which\nwas overriding the p2pbroadcast port on start up, which meant the port\nwas not being updated in the test.\n\nI didnt experience this in the broadcast pr as i ran the tests\nindividually\n\n----------\nalso renaming getAllPeers to getKadValues as private peers can be peers\nbut not in the kad, so the name no longer fits after the private peers\npr",
          "timestamp": "2025-04-17T16:35:08Z",
          "tree_id": "e8ba6bd78a0e9c2633e73f2c62a72a8518cb51ae",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/58c143b4fcdbd323fad178549c27042815ce4de0"
        },
        "date": 1744912264241,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 10403,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.27951933854543726,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 169860,
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
          "distinct": true,
          "id": "66a61bad67f2c007b63b0cf060f8d65ef6900ae9",
          "message": "feat: no longer recompute vk's in CIVC proofs (#13590)\n\nApologies for the big PR. Lots of the stuff in here ended up being\nchicken and egg with wanting to do refactoring to make this process\nsmoother/help debug tricky issues, and wanting to see that those\nrefactorings actually make sense by the end.\n\nWe no longer compute VKs on the fly in CIVC. This saves ~25% of\ncomputation. This is done throughout by consolidating IVC inputs into a\nsingle ivc-inputs.msgpack structure which supports passing bytecode,\nwitness & vk information to the bb backend. Now attaches a name for each\nfunction, as well.\n\nMajor features:\n- IVC inputs passed thru native and wasm are always passed a single\nfile/buffer. This is encoded using msgpack and capture bytecode,\nwitness, vk, and function name (which is now printed, but only properly\npassed by native) For native, the bincode and witnesses are gzipped, for\nWASM they are uncompressed. For actions such as gates or write_vk, the\nIVC inputs are used with same structure but witness and vk data can be\nblank.\n\nThis has a bunch of implications, such as having to break away from the\nrigid API base class in bb cli (which overall doesn't feel worthwhile\nanyway as CIVC is fundamentally different than UH), having to string vk\ninfo along, etc.\n\nOther features:\n\nDebuggability:\n\n- Correct README.md instructions on WASM stack traces (give up on\ngetting line numbers working :/)\n- clangd now properly shows all errors in a C++ file you're browsing,\ninstead of only showing you the first error.\n\nCleanup\n\n- small cleanup to acir tests, but still not testing new ivc flow there.\nLightest weight test is ivc-integration in yarn-project\n- Get rid of --input_type in bb cli for CIVC. now implied always to be\nwhat was previously runtime_stack. Simplifies usages, other modes were\nunused.\n- more ignored linting in the clangd file. Maybe one day we can enforce\nthe remaining as errors.\n- Clean up msgpack usage. Msgpack headers were leaking everywhere and it\nis a chunky library.\n- Consolidate with using msgpackr as our only typescript messagepack\nlibrary\n\nBenches\n\n- use wasmtime helper in bb bootstrap. deduplicate code in bench. bench\nnow honours NATIVE_PRESET, and if you do\n```\nexport NATIVE_PRESET=op-count-time\n./bootstrap.sh\n./bootstrap.sh bench\n```\nyou will get op count timings for our native ivc benches.\n\n---------\n\nCo-authored-by: Copilot <175728472+Copilot@users.noreply.github.com>\nCo-authored-by: thunkar <gregojquiros@gmail.com>\nCo-authored-by: maramihali <mara@aztecprotocol.com>\nCo-authored-by: ledwards2225 <l.edwards.d@gmail.com>",
          "timestamp": "2025-04-17T16:39:33-04:00",
          "tree_id": "cceae41613bb981b8388ac35e8cd4c337641854c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/66a61bad67f2c007b63b0cf060f8d65ef6900ae9"
        },
        "date": 1744923650998,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9727,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2613609009842067,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 142208,
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
          "distinct": true,
          "id": "71e81ce464627f733f5671341bd36e074071ded2",
          "message": "feat: VK generation test for HonkRecursionConstraint (#13637)\n\nAdds a new test that checks whether the HonkRecursionConstraint circuit\nis the same with valid inputs vs with dummy inputs.",
          "timestamp": "2025-04-17T19:20:04Z",
          "tree_id": "2eb786c277a2177f8f170b9fdf1feaa5d6775c4a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/71e81ce464627f733f5671341bd36e074071ded2"
        },
        "date": 1744925719655,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9907,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2661929142640538,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 160234,
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
          "id": "c8acae09dece27addbdce266be703a487be4d862",
          "message": "chore: delete zeromorph (#13667)\n\nWe're not going to use Zeromorph. The time has come to let it go.",
          "timestamp": "2025-04-17T23:35:07Z",
          "tree_id": "473722d9397f4fc995b3caaf47ceb4b64eebcf5c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c8acae09dece27addbdce266be703a487be4d862"
        },
        "date": 1744937524853,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 10143,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.272545955336259,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 144740,
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
          "id": "ae578a28d7b50bf7a388af58e3cd24c90dbf315c",
          "message": "chore: delete Ultra Vanilla CIVC (#13669)\n\nThis was an experimental class introduced by Cody for doing \"vanilla\" UH\nrecursion with an interface similar to CIVC. Aside from the fact that we\nhave no need for something like this, it has no hope of being useful\nbecause it relies on the mechanism of appending recursive verifiers to\ninput circuits, similar to our original design for CIVC. This isn't\nsound because there's no way for the verifier to know that the recursive\nverifications were performed. This is precisely why Aztec has kernel\ncircuits which are specifically designed to perform recursion and are\nfixed by the protocol.",
          "timestamp": "2025-04-17T23:52:35Z",
          "tree_id": "2650a4cc2dda03eee53e7dd543888d0ad4f190ed",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ae578a28d7b50bf7a388af58e3cd24c90dbf315c"
        },
        "date": 1744938458152,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9847,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.26457462221389694,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 148896,
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
          "distinct": true,
          "id": "ac95729957e0ff9da11d18c38c379790545db154",
          "message": "chore: delete honk_recursion for building ACIR (#13664)\n\nCloses https://github.com/AztecProtocol/barretenberg/issues/1013 in the\ncontext for building ACIR.\n\nWhen we updated verify_proof_with_type to no longer default to plonk\nproofs, we forgot to also delete some hacky code wrt using the\nhonk_recursion flag for figuring out which recursive verifier to use.\nSince we always receive the proof type through the actual constraint,\nthere's no need to use the honk_recursion flag to pick this out, so it\ncan be completely removed for this context.",
          "timestamp": "2025-04-18T00:28:05Z",
          "tree_id": "92fcf62505cd9d569001e169175debadebcda1f7",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ac95729957e0ff9da11d18c38c379790545db154"
        },
        "date": 1744942650057,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9450,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.25390576896758615,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 140853,
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
          "id": "017b00c0af3b1dc24edba931f7a3954e0c1df962",
          "message": "git subrepo push --branch=master noir-projects/aztec-nr\n\nsubrepo:\n  subdir:   \"noir-projects/aztec-nr\"\n  merged:   \"cbd6906369\"\nupstream:\n  origin:   \"https://github.com/AztecProtocol/aztec-nr\"\n  branch:   \"master\"\n  commit:   \"cbd6906369\"\ngit-subrepo:\n  version:  \"0.4.6\"\n  origin:   \"???\"\n  commit:   \"???\"",
          "timestamp": "2025-04-18T02:29:36Z",
          "tree_id": "b29387310112df4907b643d1d78c73233437d243",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/017b00c0af3b1dc24edba931f7a3954e0c1df962"
        },
        "date": 1744945388690,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9982,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2682035085310172,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 149778,
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
          "distinct": true,
          "id": "ff29d8668fcad9001f701144918346849174fea1",
          "message": "chore: remove msm sorter (#13668)\n\nThe `MsmSorter` class contained logic to sort the inputs to an MSM\n{scalars, points} by scalar, sum the points sharing a scalar, then\nperform the MSM on the reduced result. This was motivated by the need to\ncommit to z_perm in the structured setting where the coefficients are\nconstant over large ranges. Turns out though that since our polys have a\nwell defined structure, its much better to simply provide the constant\nranges explicitly rather than sorting then adding. Much of the logic of\nthis class was repurposed into `BatchedAffineAddition` which is what\nsupports our `commit_structured_with_nonzero_complement` method (used\nfor `z_perm`).",
          "timestamp": "2025-04-18T03:30:02Z",
          "tree_id": "4a8c32ee1582651f4cbb043e49320477688d01b8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ff29d8668fcad9001f701144918346849174fea1"
        },
        "date": 1744950248297,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9860,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2649227683899451,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 150516,
            "unit": "us"
          }
        ]
      }
    ]
  }
}