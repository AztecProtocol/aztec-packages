window.BENCHMARK_DATA = {
  "lastUpdate": 1746542561148,
  "repoUrl": "https://github.com/AztecProtocol/aztec-packages",
  "entries": {
    "End-to-end Benchmark": [
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
          "id": "80e8afec22db049f304508d9adeaf74b56d9d1eb",
          "message": "fix: retry noir install deps (#13936)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\nline.",
          "timestamp": "2025-04-29T22:31:35Z",
          "tree_id": "0d1b0ba9567828567ea19782c11ff007da0d2ef8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/80e8afec22db049f304508d9adeaf74b56d9d1eb"
        },
        "date": 1745968787785,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8064,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23084990393181248,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 132896,
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
          "id": "001a3403792ec424893df45a3683d49c53794827",
          "message": "fix: Restart archiver loop if L1 block falls more than 128 blocks behind (#13602)\n\nIf the `currentL1Block` used in the archiver sync loop falls more than\n128 blocks behind (eg during a very long sync), then `eth_call`\noperations that pin the block number (`status`, `canPrune`) may end up\nquerying a block evicted by a non-archive node. If this happens, we just\nabort the current sync and restart. This should not evict any messages\nor blocks already downloaded.\n\nFixes #13596",
          "timestamp": "2025-04-29T22:38:45Z",
          "tree_id": "55a5b92b965ea176ecb063901641efbfb1a6a2d7",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/001a3403792ec424893df45a3683d49c53794827"
        },
        "date": 1745969123236,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8164,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23373201782720845,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 148619,
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
          "id": "2a9dd4487986ae16f03238144c5d4c9a3412bc08",
          "message": "git subrepo push --branch=master noir-projects/aztec-nr\n\nsubrepo:\n  subdir:   \"noir-projects/aztec-nr\"\n  merged:   \"db8ad4da6e\"\nupstream:\n  origin:   \"https://github.com/AztecProtocol/aztec-nr\"\n  branch:   \"master\"\n  commit:   \"db8ad4da6e\"\ngit-subrepo:\n  version:  \"0.4.6\"\n  origin:   \"???\"\n  commit:   \"???\"",
          "timestamp": "2025-04-30T02:31:10Z",
          "tree_id": "111667e5daca579144c4e483fb9ed6758f2c9f9b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/2a9dd4487986ae16f03238144c5d4c9a3412bc08"
        },
        "date": 1745982458268,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8204,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23487807948650014,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 153271,
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
          "id": "f65674dce7b631dba1494782aebd460cead6884c",
          "message": "fix: Cl/p2p ports (#13943)\n\nMove the e2e_p2p ports out of the \"ephemeral range\" to see if resolves\nthe network bind issue.\nFix precommit hook which didn't error when it should.",
          "timestamp": "2025-04-30T08:10:18Z",
          "tree_id": "1faeeed51783c94a59fa7514fec70cb324cb6928",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f65674dce7b631dba1494782aebd460cead6884c"
        },
        "date": 1746003281542,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8123,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23256506240185754,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 144689,
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
          "id": "2ad6803bf8f830a6e4c76f3b4657889ec85d8e2c",
          "message": "chore: log which civc final circuit fails to verify (#13939)",
          "timestamp": "2025-04-30T08:11:57Z",
          "tree_id": "e7ce33f1bc7196d802ba89623b10d7f5c8c0b95b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/2ad6803bf8f830a6e4c76f3b4657889ec85d8e2c"
        },
        "date": 1746003296471,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8731,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2499673167733319,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 146428,
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
          "id": "e3798106bc21b035f3631908355ff752f8fad1c9",
          "message": "chore: bump retries for request tx by hash (#13675)\n\n## Overview\n\nWith better sampling logic, we can more safetly bump the retries for the\ntx requests",
          "timestamp": "2025-04-30T09:43:30Z",
          "tree_id": "911fa7579ce86743b7bed1b203bb9d4682f40790",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e3798106bc21b035f3631908355ff752f8fad1c9"
        },
        "date": 1746009391832,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8129,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23273344735720697,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 150170,
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
          "id": "0d9085f2fcecd82374af846b7497ac3067921494",
          "message": "chore: update proving cost changes (#13833)\n\nFixes #13600. \n\n\nAccompanying update tohe engineering design in\nhttps://github.com/AztecProtocol/engineering-designs/pull/59\n\nThe diff looks very large, but is mostly because we generated a new\nfixture structure.",
          "timestamp": "2025-04-30T12:13:04Z",
          "tree_id": "56fbb3ec7ae5a6368ddf0b3b8efc47912893596d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0d9085f2fcecd82374af846b7497ac3067921494"
        },
        "date": 1746017999945,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8257,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2363961687745719,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 147593,
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
          "id": "ef6bb21a1cf63280383e93c5304884fe51087dd8",
          "message": "feat: P2P requests txs from mined unproven blocks (#13941)\n\nThis should help mined txs to be spread through the p2p network, so\nprovers have a better chance to get them.",
          "timestamp": "2025-04-30T12:57:23Z",
          "tree_id": "e3ff76039853148bda4514a9661b921b6b48b20e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ef6bb21a1cf63280383e93c5304884fe51087dd8"
        },
        "date": 1746020538048,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8275,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23691814975454095,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 149612,
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
          "id": "48cfcfe56ea6cca4bf6de138079b9ff7c89d30ec",
          "message": "refactor: use open zeppelin library (#13952)\n\nFixes #13873.\n\nReplaces most of the custom things in the `UserLib` with the open\nzeppelin checkpoint library. Still let the `UserLib` exist because the\n`add` and `sub` makes logic makes it simpler to use, and more plug and\nplay (also expect to be able to reuse it later).\n\n⚠️ Uses `uint32` for timestamps ⚠️",
          "timestamp": "2025-04-30T13:26:03Z",
          "tree_id": "c519d38515b3b6e5537ff0fed38ef8e0c9e99dc0",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/48cfcfe56ea6cca4bf6de138079b9ff7c89d30ec"
        },
        "date": 1746026389907,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8438,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.24157168470643484,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 145745,
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
          "id": "8e83b22f4b187b2d09eb28118c6fccb4de914c52",
          "message": "fix: generate recursion separator properly (#13931)\n\nCloses https://github.com/AztecProtocol/barretenberg/issues/995.\n\nInstead of setting the recursion separator to 42, we generate it by\nhashing the two input pairing point objects.",
          "timestamp": "2025-04-30T14:28:18Z",
          "tree_id": "87734d936afc18d82d3822c39bc02781bbfbf360",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8e83b22f4b187b2d09eb28118c6fccb4de914c52"
        },
        "date": 1746026447576,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8128,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23268611689917826,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 148970,
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
          "id": "f24d32326786f9a2c89520babf08e8e17f50bc2a",
          "message": "fix: Missing try/catch when requesting txs for unproven blocks (#13957)\n\nGiven the promise was not awaited to avoid blocking, an error there\nwould mean the node failing with an uncaught promise rejection.",
          "timestamp": "2025-04-30T14:37:37Z",
          "tree_id": "9797146046117410e4be65610d1007775f83d6de",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f24d32326786f9a2c89520babf08e8e17f50bc2a"
        },
        "date": 1746026683937,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8271,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23679203621023817,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 142289,
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
          "id": "727664beeda8355bc3a467676bc4234c077810f7",
          "message": "chore: Do not sync attestations to the p2p pool (#13926)\n\nFixes #13923",
          "timestamp": "2025-04-30T14:39:37Z",
          "tree_id": "75ce23839468413901c6c5ca34227be5f1592aab",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/727664beeda8355bc3a467676bc4234c077810f7"
        },
        "date": 1746026787065,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9061,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2593941538264399,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 170580,
            "unit": "us"
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
          "distinct": false,
          "id": "dcdc92a42e333b3e2def3a3a3f20a9f4c9d1bf27",
          "message": "feat!: change ret/rev operands (#13960)\n\nChanges RET/REV operands from `(data_offset, size_offset)` to\n`(size_offset, data_offset)`",
          "timestamp": "2025-04-30T15:33:47Z",
          "tree_id": "aac652447ccc0ebc4edebc310a67ed066c784ba1",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/dcdc92a42e333b3e2def3a3a3f20a9f4c9d1bf27"
        },
        "date": 1746029808034,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8221,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23535309436364643,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 140679,
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
          "id": "7e95820806bf5a010a5ac59d78b21989daefde22",
          "message": "chore: Enable l1 reorg e2e test on CI (#13944)\n\nI forgot to include it (again).",
          "timestamp": "2025-04-30T15:50:56Z",
          "tree_id": "ae2897ad17afa3545ffc685ed2bcbe0d41ecdeaf",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7e95820806bf5a010a5ac59d78b21989daefde22"
        },
        "date": 1746031198221,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8762,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2508586892934515,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 156549,
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
          "id": "3b1e34ebfc7cb0af03779bd67128e42aa4654a40",
          "message": "chore!: remove all access to plonk via bberg interfaces (#13902)\n\nEffectively remove plonk from all bberg interfaces in preparation to\nremove it from the codebase entirely.",
          "timestamp": "2025-04-30T16:34:37Z",
          "tree_id": "9134d90eaf18477f57742edb9dd6e5337fb26ad3",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/3b1e34ebfc7cb0af03779bd67128e42aa4654a40"
        },
        "date": 1746035175113,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9159,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2622230007331755,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 155135,
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
          "id": "2a0fb838b3b9111a3f68c2034203320505561963",
          "message": "feat: hide Translator accumulated_result  (#13792)\n\n`TranslatorCircuitBuilder` is responsible for computing the evaluation\nat some challenge `x` of a batched polynomial derived from the `UltraOp`\nversion of the op_queue. This value gets sent to the\n`TranslatorVerifier` as part of the proof and hence needs to not leak\ninformation about the actual ops (explained in more detail as a comments\nin the code). The PR resolves issue\nhttps://github.com/AztecProtocol/barretenberg/issues/1368 and also\nremoves some left over ops that were just avoiding point at infinity\nissues and are not necessary anymore.",
          "timestamp": "2025-04-30T18:23:33Z",
          "tree_id": "3676832977e6cae6ad323a1484df92d4f11eb5a9",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/2a0fb838b3b9111a3f68c2034203320505561963"
        },
        "date": 1746041613818,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8361,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23936627300489408,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 295413,
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
          "id": "39e9b261a16957ffdcc44aaaf464e1cdb842830e",
          "message": "feat: testing contract compilation fails as expected (#13896)\n\nIt is desirable to have the ability to test that a given contract fails\nwith a given compilation error. In this PR I introduce\n`noir-projects/noir-contracts-comp-failures` directory in which a\ncontract package can be defined along with the expected error message\nand then in the bootstrap.sh script the contracts are compiled and the\noutput is checked to contain a given error.\n\nThe compilation failure check is being run in CI and I verified that it\nfails as expected when the error does not match. Did that in [this\nrun](https://github.com/AztecProtocol/aztec-packages/actions/runs/14740278893/job/41376379014):\n<img width=\"624\" alt=\"image\"\nsrc=\"https://github.com/user-attachments/assets/a4cbe6be-4421-4bf3-87c4-1f7cacce90c1\"\n/>\n\nThe plan is to test more comp failures in followup PRs.",
          "timestamp": "2025-04-30T18:39:48Z",
          "tree_id": "d074de5b3a2bfc2771fa6405dd9dca7251279a86",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/39e9b261a16957ffdcc44aaaf464e1cdb842830e"
        },
        "date": 1746041919170,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8590,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2459183698563099,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 137900,
            "unit": "us"
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
          "id": "897c49b6c3a0d428173275628f1e50fbdad8e42b",
          "message": "feat: github-action-benchmark reporting for public simulation (#13938)\n\nGH pages page is here:\nhttps://aztecprotocol.github.io/aztec-packages/dev/sim-bench/\n\n(I temporarily removed the `if` condition for the ci steps so that\nthey'd generate gh-action-benchmark commits/points for my PR)\n\nAfter seeing the alert below at 110% threshold that I believe was just\ndue to general variability in simulation times, I bumped the alert\nthreshold to 200%. That's kind of a bummer because ideally I'd like to\nget notified if #instructions executed grows by even ~5%, but the\nduration metrics vary more widely from run to run.\n\nCo-authored-by: AztecBot <tech@aztecprotocol.com>",
          "timestamp": "2025-04-30T19:09:02Z",
          "tree_id": "b1a081012f5fa3e8873a33adade5d5438aafe01f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/897c49b6c3a0d428173275628f1e50fbdad8e42b"
        },
        "date": 1746042689981,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8620,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.24678379025352098,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 178473,
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
          "id": "6585142c92d64bdc05d570f6ee3f4b5ee1b5ae79",
          "message": "fix!: cycle group fix (results in protocol circuit changes) (#13970)\n\nFixes https://github.com/AztecProtocol/barretenberg/issues/1374",
          "timestamp": "2025-04-30T19:49:06Z",
          "tree_id": "764cb590b6a03cb70b01f4b0e12ae6dd26a286ef",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/6585142c92d64bdc05d570f6ee3f4b5ee1b5ae79"
        },
        "date": 1746046816042,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8600,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.24622063634246139,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 138540,
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
          "id": "c1cbbadfca7e48cc892c818da16a62fd596fcc5a",
          "message": "git subrepo push --branch=master noir-projects/aztec-nr\n\nsubrepo:\n  subdir:   \"noir-projects/aztec-nr\"\n  merged:   \"58fd8174c5\"\nupstream:\n  origin:   \"https://github.com/AztecProtocol/aztec-nr\"\n  branch:   \"master\"\n  commit:   \"58fd8174c5\"\ngit-subrepo:\n  version:  \"0.4.6\"\n  origin:   \"???\"\n  commit:   \"???\"",
          "timestamp": "2025-05-01T02:34:19Z",
          "tree_id": "c69f068f9e6d6259cc2695f89afe1b667835960a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c1cbbadfca7e48cc892c818da16a62fd596fcc5a"
        },
        "date": 1746069054856,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8491,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2430789350225699,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 143217,
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
          "id": "0565b2d9c38dc55406eff514e695c829d1bd83c5",
          "message": "chore: codeowner and changetest (#13962)\n\nAdds a new test that do some minimal checks to catch if the contract\ncode have been changed, and add the turtles as codeowners for the test.\n\nThat way, we should be able to somewhat avoid not noticing if there are\nchanges made to the contracts. It only check a few of the contracts;\n`rollup`, `governance` and `registry` as those are the big ones and\nshould deal with most changes.\n\nI only do codeowners on this one file instead of the dir as we don't to\nbe notified around extra tests or things that would not really cause a\nproblem if used for nodes.",
          "timestamp": "2025-05-01T07:44:20Z",
          "tree_id": "b8bb8afcc6f7805cdbb20ca023258f30a1e082f5",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0565b2d9c38dc55406eff514e695c829d1bd83c5"
        },
        "date": 1746087563564,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8308,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23784261526031517,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 151423,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "helloworld@mcgee.cat",
            "name": "Cat McGee",
            "username": "catmcgee"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": false,
          "id": "1c63984ea112d03669c34b8286f0db62acfc6d27",
          "message": "feat(docs): applying dogfooding feedback in docs (#13920)\n\n- addresses feedback\n- updates getting started to be tabbed sandbox/testnet\n- updates contract tutorials and versioned\n\n---------\n\nCo-authored-by: Josh Crites <jc@joshcrites.com>\nCo-authored-by: josh crites <critesjosh@gmail.com>\nCo-authored-by: James Zaki <james.zaki@proton.me>",
          "timestamp": "2025-05-01T08:55:03Z",
          "tree_id": "df7493aea8c314e78913ba40e1631ccc2a449ef0",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1c63984ea112d03669c34b8286f0db62acfc6d27"
        },
        "date": 1746092217808,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8182,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23423274020918858,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 150124,
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
          "id": "1ae0383ea63a047d2097898334227d1e8d6d6591",
          "message": "chore: Bump Noir reference (#13906)\n\nAutomated pull of nightly from the\n[noir](https://github.com/noir-lang/noir) programming language, a\ndependency of Aztec.\nBEGIN_COMMIT_OVERRIDE\nfeat: add `--debug-compile-stdin` to read `main.nr` from `STDIN` for\ntesting (https://github.com/noir-lang/noir/pull/8253)\nfeat: better error message on unicode whitespace that isn't ascii\nwhitespace (https://github.com/noir-lang/noir/pull/8295)\nchore: update `quicksort` from iterative `noir_sort` version\n(https://github.com/noir-lang/noir/pull/7348)\nfix: use correct meta attribute names in contract custom attributes\n(https://github.com/noir-lang/noir/pull/8273)\nfeat: `nargo expand` to show code after macro expansions\n(https://github.com/noir-lang/noir/pull/7613)\nfeat: allow specifying fuzz-related dirs when invoking `nargo test`\n(https://github.com/noir-lang/noir/pull/8293)\nchore: redo typo PR by ciaranightingale\n(https://github.com/noir-lang/noir/pull/8292)\nchore: Extend the bug list with issues found by the AST fuzzer\n(https://github.com/noir-lang/noir/pull/8285)\nfix: don't disallow writing to memory after passing it to brillig\n(https://github.com/noir-lang/noir/pull/8276)\nchore: test against zkpassport rsa lib\n(https://github.com/noir-lang/noir/pull/8278)\nfeat: omit element size array for more array types\n(https://github.com/noir-lang/noir/pull/8257)\nchore: refactor array handling in ACIRgen\n(https://github.com/noir-lang/noir/pull/8256)\nchore: document cast (https://github.com/noir-lang/noir/pull/8268)\nEND_COMMIT_OVERRIDE\n\n---------\n\nCo-authored-by: AztecBot <tech@aztecprotocol.com>\nCo-authored-by: Tom French <15848336+TomAFrench@users.noreply.github.com>",
          "timestamp": "2025-05-01T10:02:47Z",
          "tree_id": "e26d7004a8bf1f7a1cb67c47d58e90c0bc92afbe",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1ae0383ea63a047d2097898334227d1e8d6d6591"
        },
        "date": 1746096444483,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8563,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.24514466476957383,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 140392,
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
          "distinct": false,
          "id": "e032787d31f1d54622b51f38d30926beeb0e4b16",
          "message": "feat: txe state machine (#13836)\n\nThis PR removes the TXe node with an implementation of a TXe state\nmachine which combines an aztec node, and a custom archiver /\nsynchronizer.\n\nNote: Because of the extension of `ArchiverStoreHelper`, there was a\nclash of `getBlocks`, in one interface it was expected to receive\n`L2Blocks`, and in the other `PublishedBlocks`. To solve this, I have\nrenamed `getBlocks` on the `ArchiverStoreHelper` to\n`getPublishedBlocks`. But doing so I also did the same renaming on the\nArchiverDataStore because it seems to better match the signature\nanyways.",
          "timestamp": "2025-05-01T11:58:59Z",
          "tree_id": "49b79e3cc727ff808a0292232131a3a73ab2d254",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e032787d31f1d54622b51f38d30926beeb0e4b16"
        },
        "date": 1746103213777,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8281,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23708008375565198,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 142828,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "spypsy@users.noreply.github.com",
            "name": "spypsy",
            "username": "spypsy"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "7018daa67b6c16de2393990457d0c47f31778a82",
          "message": "chore: use separate KV store for lip2p peers + logging missing txs (#13967)",
          "timestamp": "2025-05-01T12:41:15Z",
          "tree_id": "4b8cb2072d68cf0fce3e1a254cc6bd79932ed03d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7018daa67b6c16de2393990457d0c47f31778a82"
        },
        "date": 1746105839312,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8436,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2415048845570426,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 146066,
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
          "distinct": false,
          "id": "64f106c46159fa7c21a42288580d6e8f47348d42",
          "message": "chore: redo typo PR by Maximilian199603 (#13992)\n\nThanks Maximilian199603 for\nhttps://github.com/AztecProtocol/aztec-packages/pull/13983. Our policy\nis to redo typo changes to dissuade metric farming. This is an automated\nscript.\n\nCo-authored-by: AztecBot <tech@aztecprotocol.com>",
          "timestamp": "2025-05-01T13:30:06Z",
          "tree_id": "a99aca4d50c745662f745b8264c8c5598d8f061e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/64f106c46159fa7c21a42288580d6e8f47348d42"
        },
        "date": 1746108706465,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8168,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23383542475737237,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 120946,
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
          "id": "8a77df7cf1f2b25fc2cb06a1d71aacc0e93c5ba2",
          "message": "fix(cmake): clientivc uses libdeflate (#13973)",
          "timestamp": "2025-05-01T14:26:05Z",
          "tree_id": "14e8e0c6c34691c03cc29e6d7c9ed5a2f5743ef8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8a77df7cf1f2b25fc2cb06a1d71aacc0e93c5ba2"
        },
        "date": 1746112358646,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8555,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2449165128590966,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 146716,
            "unit": "us"
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
          "id": "8c530294087363dc41785fad4cb19bdd422385da",
          "message": "fix: make zod deserialization of SimulationErrors less strict (#13976) (#13998)\n\ncherry-picked from `alpha-testnet`\nhttps://github.com/AztecProtocol/aztec-packages/pull/13976\n\nCo-authored-by: AztecBot <tech@aztecprotocol.com>",
          "timestamp": "2025-05-01T14:56:51Z",
          "tree_id": "241e5acbf341e24ce91ef4f879b4b252307f1713",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8c530294087363dc41785fad4cb19bdd422385da"
        },
        "date": 1746113894421,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8695,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2489219811302203,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 170688,
            "unit": "us"
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
          "distinct": false,
          "id": "e4ee6e9c505a30953ce4e7dace56f05de7885f33",
          "message": "feat!: GETCONTRACTINSTANCE opcode has 1 dstOffset operand where dstOffset gets exists and dstOffset+1 gets instance member (#13971)\n\nThis is easier to constrain in the AVM as otherwise it is the only\nopcode with two destination offset operands.\n\nCo-authored-by: AztecBot <tech@aztecprotocol.com>",
          "timestamp": "2025-05-01T18:32:00Z",
          "tree_id": "b15736eea6598650d98f3c0fa821e38a021aed08",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e4ee6e9c505a30953ce4e7dace56f05de7885f33"
        },
        "date": 1746127184201,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8365,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2394796585977987,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 131893,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "mike@aztecprotocol.com",
            "name": "Michael Connor",
            "username": "iAmMichaelConnor"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": false,
          "id": "ff32e15889f519dc9c556906faaf5f07410c551c",
          "message": "docs: script to unravel deeply nested protocol circuit structs, for readability (#14006)\n\nSpecify the name of a struct that you cannot be bothered tracing through\nthe `nr` codebase.\nIt'll unravel it for you.\n\nThis has already helped me find some potential issues.\n\nE.g. this is the output of unravelling `PrivateCircuitPublicInputs`:\n\n```noir\napp_public_inputs: PrivateCircuitPublicInputs {\n    call_context: CallContext {\n        msg_sender: AztecAddress {\n            inner: Field,\n        },\n        contract_address: AztecAddress {\n            inner: Field,\n        },\n        function_selector: FunctionSelector {\n            inner: u32,\n        },\n        is_static_call: bool,\n    },\n    args_hash: Field,\n    returns_hash: Field,\n    min_revertible_side_effect_counter: u32,\n    is_fee_payer: bool,\n    max_block_number: MaxBlockNumber {\n        _opt: Option {\n            _is_some: bool,\n            _value: u32,\n        },\n    },\n    note_hash_read_requests: [\n        ReadRequest {\n            value: Field,\n            counter: u32,\n        };\n        16,\n    ],\n    nullifier_read_requests: [\n        ReadRequest {\n            value: Field,\n            counter: u32,\n        };\n        16,\n    ],\n    key_validation_requests_and_generators: [\n        KeyValidationRequestAndGenerator {\n            request: KeyValidationRequest {\n                pk_m: EmbeddedCurvePoint {\n                    x: Field,\n                    y: Field,\n                    is_infinite: bool,\n                },\n                sk_app: Field,\n            },\n            sk_app_generator: Field,\n        };\n        16,\n    ],\n    note_hashes: [\n        NoteHash {\n            value: Field,\n            counter: u32,\n        };\n        16,\n    ],\n    nullifiers: [\n        Nullifier {\n            value: Field,\n            counter: u32,\n            note_hash: Field,\n        };\n        16,\n    ],\n    private_call_requests: [\n        PrivateCallRequest {\n            call_context: CallContext {\n                msg_sender: AztecAddress {\n                    inner: Field,\n                },\n                contract_address: AztecAddress {\n                    inner: Field,\n                },\n                function_selector: FunctionSelector {\n                    inner: u32,\n                },\n                is_static_call: bool,\n            },\n            args_hash: Field,\n            returns_hash: Field,\n            start_side_effect_counter: u32,\n            end_side_effect_counter: u32,\n        };\n        5,\n    ],\n    public_call_requests: [\n        Counted {\n            inner: PublicCallRequest {\n                msg_sender: AztecAddress {\n                    inner: Field,\n                },\n                contract_address: AztecAddress {\n                    inner: Field,\n                },\n                is_static_call: bool,\n                calldata_hash: Field,\n            },\n            counter: u32,\n        };\n        16,\n    ],\n    public_teardown_call_request: PublicCallRequest {\n        msg_sender: AztecAddress {\n            inner: Field,\n        },\n        contract_address: AztecAddress {\n            inner: Field,\n        },\n        is_static_call: bool,\n        calldata_hash: Field,\n    },\n    l2_to_l1_msgs: [\n        L2ToL1Message {\n            recipient: EthAddress {\n                inner: Field,\n            },\n            content: Field,\n            counter: u32,\n        };\n        2,\n    ],\n    private_logs: [\n        PrivateLogData {\n            log: Log {\n                fields: [\n                    Field;\n                    18,\n                ],\n            },\n            note_hash_counter: u32,\n            counter: u32,\n        };\n        16,\n    ],\n    contract_class_logs_hashes: [\n        LogHash {\n            value: Field,\n            counter: u32,\n            length: u32,\n        };\n        1,\n    ],\n    start_side_effect_counter: u32,\n    end_side_effect_counter: u32,\n    historical_header: BlockHeader {\n        last_archive: AppendOnlyTreeSnapshot {\n            root: Field,\n            next_available_leaf_index: u32,\n        },\n        content_commitment: ContentCommitment {\n            num_txs: Field,\n            blobs_hash: Field,\n            in_hash: Field,\n            out_hash: Field,\n        },\n        state: StateReference {\n            l1_to_l2_message_tree: AppendOnlyTreeSnapshot {\n                root: Field,\n                next_available_leaf_index: u32,\n            },\n            partial: PartialStateReference {\n                note_hash_tree: AppendOnlyTreeSnapshot {\n                    root: Field,\n                    next_available_leaf_index: u32,\n                },\n                nullifier_tree: AppendOnlyTreeSnapshot {\n                    root: Field,\n                    next_available_leaf_index: u32,\n                },\n                public_data_tree: AppendOnlyTreeSnapshot {\n                    root: Field,\n                    next_available_leaf_index: u32,\n                },\n            },\n        },\n        global_variables: GlobalVariables {\n            chain_id: Field,\n            version: Field,\n            block_number: Field,\n            slot_number: Field,\n            timestamp: u64,\n            coinbase: EthAddress {\n                inner: Field,\n            },\n            fee_recipient: AztecAddress {\n                inner: Field,\n            },\n            gas_fees: GasFees {\n                fee_per_da_gas: Field,\n                fee_per_l2_gas: Field,\n            },\n        },\n        total_fees: Field,\n        total_mana_used: Field,\n    },\n    tx_context: TxContext {\n        chain_id: Field,\n        version: Field,\n        gas_settings: GasSettings {\n            gas_limits: Gas {\n                da_gas: u32,\n                l2_gas: u32,\n            },\n            teardown_gas_limits: Gas {\n                da_gas: u32,\n                l2_gas: u32,\n            },\n            max_fees_per_gas: GasFees {\n                fee_per_da_gas: Field,\n                fee_per_l2_gas: Field,\n            },\n            max_priority_fees_per_gas: GasFees {\n                fee_per_da_gas: Field,\n                fee_per_l2_gas: Field,\n            },\n        },\n    },\n};\n```",
          "timestamp": "2025-05-01T19:39:28Z",
          "tree_id": "494738671548426bcdcd34af1df86e0acd3a63e8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ff32e15889f519dc9c556906faaf5f07410c551c"
        },
        "date": 1746131448855,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8180,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2341934086265142,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 147932,
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
          "id": "199648fe3d9d5c303a53ad8016d7217f2dbefcde",
          "message": "chore: comment civc trace size log parsing (#13975)\n\nGrego is relying on this format and we've changed it a few times lately,\na comment is prudent",
          "timestamp": "2025-05-01T19:16:49Z",
          "tree_id": "2f7eb4ca39583c4baed6fb428c2abb7910a80f88",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/199648fe3d9d5c303a53ad8016d7217f2dbefcde"
        },
        "date": 1746131811585,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8498,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.24328585772010497,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 153408,
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
          "id": "117ed54cd4bd947f03c15f65cbd2ce312b006ff4",
          "message": "feat: brittle benchmark for UH RV in Ultra gate count (#14008)\n\nAugments UltraRecursiveVerifier test by adding a gate count pinning\ncheck, so we can keep track of the Ultra gate count of a\nMegaZKRecursiveVerifier.\n\nHelps in closing\nhttps://github.com/AztecProtocol/barretenberg/issues/1380 because I\nneeded a measurement of the impact of an optimization.",
          "timestamp": "2025-05-01T21:14:25Z",
          "tree_id": "4084158f6a4253e6b124c2c614b83a6af94ab64b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/117ed54cd4bd947f03c15f65cbd2ce312b006ff4"
        },
        "date": 1746138734332,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8267,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2366642085144209,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 141030,
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
          "id": "b526d3b71db1ad0c5e13773d0affe5dd298d3d0b",
          "message": "feat: detect CIVC standalone VKs changing in CI (#13858)\n\nAdd functionality for previously unused `bb check` when ran in CIVC\nmode. Now checks an input stack, asserting that the same VKs would be\nwritten out.\n\nThis validates the recent fixes to VK generation.\n\n---------\n\nCo-authored-by: ledwards2225 <l.edwards.d@gmail.com>",
          "timestamp": "2025-05-01T21:30:52Z",
          "tree_id": "fe898a542f76202fbaa7c482b103e0f98c9140c1",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/b526d3b71db1ad0c5e13773d0affe5dd298d3d0b"
        },
        "date": 1746139908153,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8377,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23981102890921954,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 145688,
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
          "id": "d19dfd1c16f64748fdddb6b85602755e1e02aaba",
          "message": "git subrepo push --branch=master noir-projects/aztec-nr\n\nsubrepo:\n  subdir:   \"noir-projects/aztec-nr\"\n  merged:   \"1ead03ed81\"\nupstream:\n  origin:   \"https://github.com/AztecProtocol/aztec-nr\"\n  branch:   \"master\"\n  commit:   \"1ead03ed81\"\ngit-subrepo:\n  version:  \"0.4.6\"\n  origin:   \"???\"\n  commit:   \"???\"",
          "timestamp": "2025-05-02T02:31:33Z",
          "tree_id": "43bab8b7ff645f73236e153e0de7501148825bb8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d19dfd1c16f64748fdddb6b85602755e1e02aaba"
        },
        "date": 1746155369238,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8121,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23250206868715614,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 138804,
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
          "distinct": false,
          "id": "19da0fb437f338e2e5fc1ecbca7eb9feb3a03227",
          "message": "chore: Bump Noir reference (#14017)\n\nAutomated pull of nightly from the\n[noir](https://github.com/noir-lang/noir) programming language, a\ndependency of Aztec.\nBEGIN_COMMIT_OVERRIDE\nfeat: disallow emitting multiple `MemoryInit` opcodes for the same block\n(https://github.com/noir-lang/noir/pull/8291)\nfix(ssa): Remove unused calls to pure functions\n(https://github.com/noir-lang/noir/pull/8298)\nfix(ssa): Do not remove unused checked binary ops\n(https://github.com/noir-lang/noir/pull/8303)\nfix: Return zero and insert an assertion if RHS bit size is over the\nlimit in euclidian division\n(https://github.com/noir-lang/noir/pull/8294)\nfeat: remove unnecessary dynamic arrays when pushing onto slices\n(https://github.com/noir-lang/noir/pull/8287)\nfeat(testing): Add SSA interpreter for testing SSA\n(https://github.com/noir-lang/noir/pull/8115)\nEND_COMMIT_OVERRIDE\n\nCo-authored-by: AztecBot <tech@aztecprotocol.com>",
          "timestamp": "2025-05-02T10:45:35Z",
          "tree_id": "0ef14af234f08e53694e5060525c84a643b7223a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/19da0fb437f338e2e5fc1ecbca7eb9feb3a03227"
        },
        "date": 1746186490994,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8482,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.24284063316323967,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 152377,
            "unit": "us"
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
          "id": "5276489d0e271fe1d852518dfb46577e6413534e",
          "message": "feat!: swap copyOffset and dataOffset operands (#14000)\n\nSimilar to the changes to return / revert. \n\nThe copySizeOffset and dataOffset operands are swapped for cdCopy,\nrdCopy and Call to match retrun/revert",
          "timestamp": "2025-05-02T11:16:17Z",
          "tree_id": "6ff9bdfd892b1e351bad1d5adcecd86dccc7a264",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5276489d0e271fe1d852518dfb46577e6413534e"
        },
        "date": 1746188083323,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8660,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2479125146485307,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 150233,
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
          "distinct": false,
          "id": "1fb70a4a983da2fd775f833b45ec4d83f5a2b08b",
          "message": "feat(avm): Evolve public data read to read/write (#13486)\n\nEvolves the public data read gadget to a checker gadget with both read\nand write. It's very similar to the nullifier one but handling the\nupdate case instead of failing in that case.\n\n---------\n\nCo-authored-by: jeanmon <jean@aztec-labs.com>",
          "timestamp": "2025-05-02T13:26:33Z",
          "tree_id": "760daad76b3d4a843a843e2c7e98cdc41836f70e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1fb70a4a983da2fd775f833b45ec4d83f5a2b08b"
        },
        "date": 1746197158694,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8155,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2334724829331615,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 152654,
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
          "id": "9d1d63c91860d2a8d8274fd1761efe0c419f5c12",
          "message": "fix!: fix hiding circuit VK consistency in overflow case (#14011)\n\nPrior to this update, the PG recursive verifier was not treating the\ncircuit size and log circuit size as witnesses. This led to the\n`padding_indicator_array` used in the decider recursive verifier in the\nhiding circuit being populated with constant values. This is turn led to\ndifferent constraints in the case where the accumulator had a circuit\nsize larger than the nominal one determined by the structured trace\n(which occurs when the overflow mechanism is active for example).\n\nThis PR makes those values witnesses and adds an additional CIVC VK\nconsistency test for the case where one or more of the circuits\noverflows and results in an accumulator with larger dyadic size than the\nnominal structured trace dyadic size.\n\n---------\n\nCo-authored-by: sergei iakovenko <105737703+iakovenkos@users.noreply.github.com>",
          "timestamp": "2025-05-02T13:39:15Z",
          "tree_id": "8607a58002fc04b33e1853e470161e1fa299b66d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9d1d63c91860d2a8d8274fd1761efe0c419f5c12"
        },
        "date": 1746197966557,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8575,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.24550107013916472,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 158510,
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
          "id": "9d35213a970dede4c094f639754f6ac058cf3b1e",
          "message": "fix: pippenger buffer overflow if threads > 128 (#14039)\n\nGiven how heavy MSMs are, this was definitely a bad micro-optimization.\nIt was missing an assert, at the least. Added one for round count.",
          "timestamp": "2025-05-02T19:26:51Z",
          "tree_id": "2d3f48f01a799820f0a048973a741d7974155977",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9d35213a970dede4c094f639754f6ac058cf3b1e"
        },
        "date": 1746218764869,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8214,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23517094340705316,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 143326,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "isennovskiy@gmail.com",
            "name": "Innokentii Sennovskii",
            "username": "Rumata888"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "6bf07d407f2d797152d9251c3c1654efd4240102",
          "message": "fix: Fixing PG recursive verifier FS break (#14004)\n\nThere was a\n[vulnerability](https://github.com/AztecProtocol/barretenberg/issues/1381)\nbreaking the soundness of PG recursive verifier which could allow\ncompletely breaking Client IVC. This fixes it.\n\nCloses: https://github.com/AztecProtocol/barretenberg/issues/1381\n\n---------\n\nCo-authored-by: ledwards2225 <l.edwards.d@gmail.com>\nCo-authored-by: ludamad <domuradical@gmail.com>\nCo-authored-by: ludamad <adam.domurad@gmail.com>",
          "timestamp": "2025-05-02T21:27:18Z",
          "tree_id": "75f8bc1191530b04bd765caa400df6b65eb63b19",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/6bf07d407f2d797152d9251c3c1654efd4240102"
        },
        "date": 1746225965272,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8439,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.24159322031441424,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 157856,
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
          "id": "7b26feb0ff14931540d81feaade10e6cca90ffd8",
          "message": "git subrepo push --branch=master noir-projects/aztec-nr\n\nsubrepo:\n  subdir:   \"noir-projects/aztec-nr\"\n  merged:   \"2d830cc52a\"\nupstream:\n  origin:   \"https://github.com/AztecProtocol/aztec-nr\"\n  branch:   \"master\"\n  commit:   \"2d830cc52a\"\ngit-subrepo:\n  version:  \"0.4.6\"\n  origin:   \"???\"\n  commit:   \"???\"",
          "timestamp": "2025-05-03T02:30:30Z",
          "tree_id": "005d1d58fe536c8c4368eca72cfa17ef47f09a88",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7b26feb0ff14931540d81feaade10e6cca90ffd8"
        },
        "date": 1746241544667,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8208,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2349777546559667,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 145028,
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
          "id": "02866bd7d78ee998c7a1c11c83768a40888efb26",
          "message": "fix(docs): Update JS tutorials to fix versions (#14053)\n\n- adds versioning to aztec.js tutorials",
          "timestamp": "2025-05-04T02:18:51Z",
          "tree_id": "e05990096767158236c8c36d8ec518f59e3dc932",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/02866bd7d78ee998c7a1c11c83768a40888efb26"
        },
        "date": 1746327139438,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8188,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23440058262608818,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 148140,
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
          "id": "f6a77748ac3d1779f16d5695447f434ea27d10d8",
          "message": "feat!: improving perf insights + avoid simulating on proving (#13928)\n\nIntroduces new timing info in`profileTx`, but in the process got\ndistracted by a few things, so I'm branching this off before adding more\nbenchmarks:\n\n- Adds a contract deployment benchmark to our key flows\n- Avoids resimulating kernels (in brillig) before proving. We're going\nto do witgen anyways! This should improve our performance across the\nboard. Simulation is still recommended, but that's left as a wallet\nresponsibility\n- Allows playground to profile txs taking into account fee payments\nand/or authwits\n\n---------\n\nCo-authored-by: Nicolás Venturo <nicolas.venturo@gmail.com>",
          "timestamp": "2025-05-05T06:56:12Z",
          "tree_id": "1d7996c4d2a2d73f3cf2a8d35dedd2a092be208f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f6a77748ac3d1779f16d5695447f434ea27d10d8"
        },
        "date": 1746430205244,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8283,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2371243831209173,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 140290,
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
          "id": "6728664dc8924d0ddb7cf8312df8be3926395af3",
          "message": "fix: e2e_fees (#14075)\n\nIncorrectly flagged as flake",
          "timestamp": "2025-05-05T08:11:11Z",
          "tree_id": "a22499d12a4e3818222c4075ed4ada749aea44a0",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/6728664dc8924d0ddb7cf8312df8be3926395af3"
        },
        "date": 1746434598802,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8461,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.24222658553044957,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 157108,
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
          "id": "c4602e1c898504106fa4ebf5d0c96f9a343aaa69",
          "message": "chore: avoid unnecesary async chunks (#14076)\n\nMaster version of:\nhttps://github.com/AztecProtocol/aztec-packages/pull/14074",
          "timestamp": "2025-05-05T08:13:58Z",
          "tree_id": "16d899fcc1b8a11abf2f38a1eb05639ce0d2bcc5",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c4602e1c898504106fa4ebf5d0c96f9a343aaa69"
        },
        "date": 1746435189166,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8152,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23339477839865974,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 148418,
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
          "id": "7012aebf69ed546c3576eb32bad70c88d9cf8400",
          "message": "fix: Error enriching after noir changes (#14080)\n\nUpdates our error enrichment code after the changes in noir to use a\nlocations tree. Partially based on\nhttps://github.com/AztecProtocol/aztec-packages/pull/14016",
          "timestamp": "2025-05-05T16:25:52Z",
          "tree_id": "c8d99d9e28aa5e4c98da06e4aea8d63735f0c4bd",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7012aebf69ed546c3576eb32bad70c88d9cf8400"
        },
        "date": 1746464290937,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8164,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23372639100508658,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 137316,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "shramee.srivastav@gmail.com",
            "name": "Shramee Srivastav",
            "username": "shramee"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": false,
          "id": "a1148b3be9a434579f8b722e138c0e49f9737b33",
          "message": "feat(bb.js): Enable more ZK flavors (#14072)\n\nZK flavors are not included in the generated WASM. This PR adds 'em.\n\n<img width=\"418\" alt=\"image\"\nsrc=\"https://github.com/user-attachments/assets/a8f38ff6-62d0-4124-9115-b96a12414e78\"\n/>\n\nCo-authored-by: ludamad <adam.domurad@gmail.com>",
          "timestamp": "2025-05-05T18:23:14Z",
          "tree_id": "c6ae290ba20e5c3eb0d5e92e8be2149944d83bd4",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a1148b3be9a434579f8b722e138c0e49f9737b33"
        },
        "date": 1746473357700,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8337,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23868524528966603,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 150048,
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
          "id": "bb78059a896a4e8332054075e98cff4d00f6920a",
          "message": "fix(bb): solve memory blowup, acir::Opcode 7kb => 386 bytes (#14042)\n\nAdded a script that can be run after acir generations, until\nhttps://github.com/zefchain/serde-reflection/issues/75 has attention\nThe issue is that we have a giant enum over these static arrays. In\nRust, they are `Box<... array ...>`, which would be `std::unique_ptr<...\narray ...>` in C++. We have an issue open to do just this - but\nmeanwhile, the more practical move is to use std::shared_ptr to avoid\nfurther changes.\n\nAlso uses std::move more to reduce time and allocation.",
          "timestamp": "2025-05-05T23:29:12Z",
          "tree_id": "ebd4b6cd572da6e0b7168f962739c9b1ff4cc4ad",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/bb78059a896a4e8332054075e98cff4d00f6920a"
        },
        "date": 1746491497603,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8246,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2360642425229602,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 142294,
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
          "id": "a0d48a5b515813b9d11d85fad0ef15760b4a028a",
          "message": "git subrepo push --branch=master noir-projects/aztec-nr\n\nsubrepo:\n  subdir:   \"noir-projects/aztec-nr\"\n  merged:   \"2483a77bd8\"\nupstream:\n  origin:   \"https://github.com/AztecProtocol/aztec-nr\"\n  branch:   \"master\"\n  commit:   \"2483a77bd8\"\ngit-subrepo:\n  version:  \"0.4.6\"\n  origin:   \"???\"\n  commit:   \"???\"",
          "timestamp": "2025-05-06T02:31:49Z",
          "tree_id": "60f660004a9cca06fff737684a46dd370ddd381c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a0d48a5b515813b9d11d85fad0ef15760b4a028a"
        },
        "date": 1746500762146,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8305,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23775174343353458,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 141306,
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
          "distinct": true,
          "id": "30c2030c13c80df5c03f441139dde3387b0931cb",
          "message": "chore: better handling of ultra ops in translator circuit builder (#13990)\n\nThis PR attempts to improve clarity in the circuit builder and reduce\nthe size of existing methods by separating the logic that checks ultra\nops and the logic that populates corresponding wire data using the ultra\nop from other builder logic. This will additionally help code\nshareability in upcoming modifications. I also fixed the\n`TranslatorOpcodeConstraintRelation` as it was accepting some opcodes\nthat are not supported",
          "timestamp": "2025-05-06T13:39:06Z",
          "tree_id": "e42723a846cc88379cccfd442b0bb139ed4108ae",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/30c2030c13c80df5c03f441139dde3387b0931cb"
        },
        "date": 1746542560398,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8235,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2357618136118969,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 135845,
            "unit": "us"
          }
        ]
      }
    ]
  }
}