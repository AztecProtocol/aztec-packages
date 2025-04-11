window.BENCHMARK_DATA = {
  "lastUpdate": 1744354867518,
  "repoUrl": "https://github.com/AztecProtocol/aztec-packages",
  "entries": {
    "End-to-end Benchmark": [
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
          "id": "64675db1232d1344da8e0f1ebd6b87b1522ad59a",
          "message": "chore: rename logs to msg (#13364)\n\nThis expands on the 'message' term:\n\n- contracts send and receive messages\n- messages follow standard encoding, by having a message type id,\nmetadata, and content\n- encoded messages are encrypted into ciphertext\n- ciphertext can be emitted alongside a tag in a log\n- ciphertext is decrypted into plaintext, which is an encoded message\n- from it we get back message metadata and content\n\nBefore this PR, we call both the log and the message 'logs', which is\nincorrect and confusing.\n\nThe renaming is partial since some concepts are still tied to logs (e.g.\nevents *must* be in logs, message processing is currently done on logs\nstored in capsules, etc.), but this is a good first step.",
          "timestamp": "2025-04-07T21:36:12Z",
          "tree_id": "a4f2192b2549e65875b8a92937cd5cdbd244ecfb",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/64675db1232d1344da8e0f1ebd6b87b1522ad59a"
        },
        "date": 1744064230569,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9274,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2358511703642627,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 134517,
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
          "id": "0d5add0bc5ed8f6f32e5299965bb418553178638",
          "message": "chore: improve capsule performance and add tests (#13284)\n\nBest reviewed by ignoring whitespace changes in the diff.\n\nThis makes `copyCapsule` create a transaction, massively reducing how\nlong it takes to copy large numbers of elements, which we do when\ndeleting arbitrary entries in a `CapsuleArray`. I added some tests with\nhardcoded timeouts to try to detect performance regressions, though\neventually these should be collected along with other metrics in some\nmore complete manner.\n\nI also added tests for the `appendToCapsuleArray` function @benesjan\nintroduced, since these were missing.\n\n---------\n\nCo-authored-by: Gregorio Juliana <gregojquiros@gmail.com>",
          "timestamp": "2025-04-07T22:20:16Z",
          "tree_id": "ec9e2096961e9568a3e641574a103f1c3948f5c8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0d5add0bc5ed8f6f32e5299965bb418553178638"
        },
        "date": 1744066527023,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9173,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23328501223113318,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 139096,
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
          "id": "5026c6259e6a09a3a1ea73c904aa4f12bafbb880",
          "message": "test: `getLogByTag` and `removeNullifiedNotes` on `PXEOracleInterface` (#13323)\n\nAdding tests for `getLogByTag` oracle and `removeNullifiedNotes`",
          "timestamp": "2025-04-07T22:34:35Z",
          "tree_id": "659818506224bd1f3f1616f3eff3247dda2f8649",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5026c6259e6a09a3a1ea73c904aa4f12bafbb880"
        },
        "date": 1744067399793,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9298,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23645765622698234,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 146406,
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
          "id": "ec4fd7454e964965f6ff6529a244b2bffb2cd8e4",
          "message": "git subrepo push --branch=master noir-projects/aztec-nr\n\nsubrepo:\n  subdir:   \"noir-projects/aztec-nr\"\n  merged:   \"50d90d3551\"\nupstream:\n  origin:   \"https://github.com/AztecProtocol/aztec-nr\"\n  branch:   \"master\"\n  commit:   \"50d90d3551\"\ngit-subrepo:\n  version:  \"0.4.6\"\n  origin:   \"???\"\n  commit:   \"???\"",
          "timestamp": "2025-04-08T02:29:34Z",
          "tree_id": "db2e23e429c2e98fd76d7c3b6b248950e4e0532d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ec4fd7454e964965f6ff6529a244b2bffb2cd8e4"
        },
        "date": 1744081103511,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9195,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23383865086322708,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 145240,
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
          "id": "236e9e58c90e469aa9ffb14213586270aa9c62f0",
          "message": "test: `e2e_note_getter` not using `DocsExampleContract` (#13366)\n\nThis PR is a piece of a series of PRs in which I clean up our use of\ntest contracts. In this case I am replacing the use of\nDocsExampleContract in `e2e_note_getter.test.ts` with the goal of\neventually not using `DocsExampleContract` in `/yarn-project` at all.\n\nI introduce a new NoteGetter test contract.",
          "timestamp": "2025-04-08T03:09:45Z",
          "tree_id": "acbb75be09b2c4ebde1dbe50334482b75cee1d98",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/236e9e58c90e469aa9ffb14213586270aa9c62f0"
        },
        "date": 1744083617092,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9292,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23630896735816972,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 141583,
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
          "id": "1c3d70b44a904c3a0542f78995bc0aef50068c96",
          "message": "chore: add option to register contract class to deploy account in cli-wallet (#13359)\n\nWithout this, devnet / testnet were having issues deploying the first\nschnorr account contract.",
          "timestamp": "2025-04-08T09:03:26Z",
          "tree_id": "e328d87de190be914f4bcbcce766210e41d6e130",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1c3d70b44a904c3a0542f78995bc0aef50068c96"
        },
        "date": 1744105393291,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9284,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2361083302796656,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 144566,
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
          "id": "ca6c7a7ba344fa15d3abe5515d24b65c5585c8fd",
          "message": "fix: txe node should not use base fork for find_leaves_indexes (#13341)\n\nThis is a change to unblock defi-wonderland as they're running into some\nissues after moving more log processing to noir. This will be more or\nless refactored in a imminent txe rework / cleanup.\n\nThe crux of this fix was that `this.baseFork` does not include any block\nmetadata, because it is not checkpointed by `handleL2BlocksAndMessages`.\nWe need to specifically fetch for the `lastCommitted` state, or from\n`getSnapshot`\n\nCo-authored-by: sklppy88 <esau@aztecprotocol.com>",
          "timestamp": "2025-04-08T10:03:21Z",
          "tree_id": "5f514996931ec44a88971ef05104c445fa4b2298",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ca6c7a7ba344fa15d3abe5515d24b65c5585c8fd"
        },
        "date": 1744108322410,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9206,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23412761125451428,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 130039,
            "unit": "us"
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
          "distinct": false,
          "id": "d68800a69e03280e0276dc3310c15a8ca528fb35",
          "message": "fix: mega zk in hiding circuit + bug fixes (#13262)\n\nFixed the bugs discovered by Taceo + it was long overdue to switch from\nMega to MegaZK for proving the hiding circuit.\n\n\nCloses https://github.com/AztecProtocol/aztec-packages/issues/13117\nCloses https://github.com/AztecProtocol/aztec-packages/issues/13116",
          "timestamp": "2025-04-08T11:51:35Z",
          "tree_id": "d48158c1a82f4464081440cc98f1e2ea63dd8f69",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d68800a69e03280e0276dc3310c15a8ca528fb35"
        },
        "date": 1744116883212,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9642,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.24521800370965796,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 141029,
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
          "id": "be31389ba3cf9c2833492b5c8f366e9e17bed59d",
          "message": "chore: Fix flake in reqresp p2p test (#13333)\n\nIssue seems to be that the txs get sent to the first proposer with\nlittle time for it to build the block, so it misses its shot, and then\nthat tx never reaches other nodes (since p2p gossip was disabled). This\nattempts to fix it.\n\nWIP: currently running into a `Assertion failed: Failed to get a note\n'self.is_some()'`",
          "timestamp": "2025-04-08T12:09:36Z",
          "tree_id": "50385e1584c39416383f23ef9185b43376aa971d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/be31389ba3cf9c2833492b5c8f366e9e17bed59d"
        },
        "date": 1744117058055,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9544,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2427159723129036,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 141775,
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
          "id": "5b4848fb027d2e81b2e4fe6b2181f598901a08f0",
          "message": "fix: `PXE::getPrivateEvents(...)` ordering (#13363)\n\nFixes https://github.com/AztecProtocol/aztec-packages/issues/13335\n\nWe didn't return events from getPrivateEvents in ordering in which they\nwere emitted because we didn't have txIndexInBlock info before. That\ninfo got propagated in a [PR down the\nstack](https://github.com/AztecProtocol/aztec-packages/pull/13336) and\nin this PR I am leveraging that to fix the ordering.",
          "timestamp": "2025-04-08T13:53:24Z",
          "tree_id": "14e2b202af7fc8c96108fafd18f1b832ff3f575c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5b4848fb027d2e81b2e4fe6b2181f598901a08f0"
        },
        "date": 1744122714052,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9428,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23976658243666626,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 144286,
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
          "id": "746353898f4a62189dd896c288e36b231d77c0bf",
          "message": "feat: preload CRS files once in GKE (#13093)\n\nThis PR downloads the CRS file to a volume using a pre-install helm job\nthat then gets cloned into a `ReadOnlyMany` shared volume for all the\nagents",
          "timestamp": "2025-04-08T15:36:18Z",
          "tree_id": "8f0380d391b7aacc40095e9aed49f99bf7530904",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/746353898f4a62189dd896c288e36b231d77c0bf"
        },
        "date": 1744128934463,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9895,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2516428503485002,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 142234,
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
          "id": "668616825cb9cc76bf25884ff40d77f2101272a9",
          "message": "chore: Deflake p2p client unit test (#13387)\n\nRemoves sleeps in favor of forced syncs.\n\nFixes flakes like [this one](http://ci.aztec-labs.com/8be3f58c163e887d).",
          "timestamp": "2025-04-08T15:38:44Z",
          "tree_id": "15d20e84278f842ad1487a18a838a5f1532fc166",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/668616825cb9cc76bf25884ff40d77f2101272a9"
        },
        "date": 1744129282203,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9289,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23622763367235936,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 148266,
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
          "id": "7aabf7c22a6f7bd044c00c591c120c576c00d22b",
          "message": "chore: add encode/decode fns (#13369)\n\nHopefully the last step for a while in our msg encode/decode adventures.\nThis creates `encoding::{encode_message, decode_message}`, which are\nfunctions that already existed in other modules but were not yet a core\nconcept. I also added some tests.\n\n---------\n\nCo-authored-by: Jan Beneš <janbenes1234@gmail.com>",
          "timestamp": "2025-04-08T15:52:23Z",
          "tree_id": "f22dcbe39fd6d2689236e6dfecc8c6fcf5f818a9",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7aabf7c22a6f7bd044c00c591c120c576c00d22b"
        },
        "date": 1744129869623,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9374,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23840345971100732,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 143686,
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
          "id": "1ad43685678fa74faf4b71641376b378285ecf49",
          "message": "fix: retry download old crs (#13350)\n\nHopefully this whole thing will go away next week when we migrate C++ to\nuse flat crs in ~/.bb-crs",
          "timestamp": "2025-04-08T17:59:01Z",
          "tree_id": "afddb535a2d66371acad6ea3666580a9ec6ca905",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1ad43685678fa74faf4b71641376b378285ecf49"
        },
        "date": 1744138839264,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9653,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2454798566594021,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 158782,
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
          "id": "ca708e70d1090771faf5f20eb70b4ebd6d4ebf53",
          "message": "chore(civc): Rename e2e trace to aztec trace (#13399)\n\nClient IVC tech debt, this is now 'the' trace not just 'a trace\noptimized for e2e test'",
          "timestamp": "2025-04-08T19:15:43Z",
          "tree_id": "0b61adf7335d40dba34cc9ec1ddaf63dbb454ff1",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ca708e70d1090771faf5f20eb70b4ebd6d4ebf53"
        },
        "date": 1744143844044,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9576,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2435444880280836,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 161816,
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
          "id": "007811df98c86f29b89ad218eedfa4dfaadc44d4",
          "message": "docs: update utility fn docs (#13310)\n\nReplacement for\nhttps://github.com/AztecProtocol/aztec-packages/pull/13248 to get it out\nof the graphite stack.\n\nThis PR updates mentions of top-level unconstrained contract fns for the\nnew 'utility' term. Some instances may be missing, but I think we\ncovered the vast majority of it. I also updated language in some parts\nwere explanations were outdated, and tried to remove bits that conflated\nNoir unconstrained functions and utility functions. We'll likely want to\nexpand on this given the apparent confusion.\n\n---------\n\nCo-authored-by: benesjan <janbenes1234@gmail.com>",
          "timestamp": "2025-04-08T19:55:01Z",
          "tree_id": "7be517c7601f05a23cf05f78b324cf77c16f8939",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/007811df98c86f29b89ad218eedfa4dfaadc44d4"
        },
        "date": 1744145624295,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9346,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23768477911834635,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 138703,
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
          "distinct": false,
          "id": "4899d3fe8f633b3533f84ad2988ba5bd4f85d8cd",
          "message": "feat: node mempool limiting (#13247)\n\nCloses https://github.com/AztecProtocol/aztec-packages/issues/12879\n\n[Design\ndoc](https://github.com/AztecProtocol/engineering-designs/blob/main/docs/mempools/dd.md)\n\nCurrently, there are no limits on the size of the pending tx pool.\n\nThis PR adds limits on the total number and cumulative tx size of valid\npending txs in the mempool. If either limit is hit, then the lowest\npriority pending txs will be evicted to make room until both limits are\nsatisfied.\n\nAdditionally, whenever a new block is mined, all pending txs will be\nchecked to ensure that they don't share any nullifiers with mined txs,\nhave a sufficient fee payer balance, and have a max block number higher\nthan the mined block.\n\nIn the case of a reorg, all pending txs are checked to ensure that their\narchive root is still valid. If it isn't, then the tx is evicted.",
          "timestamp": "2025-04-08T19:54:09Z",
          "tree_id": "3a977f24bdf3da8427092f718bba78105d40da13",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/4899d3fe8f633b3533f84ad2988ba5bd4f85d8cd"
        },
        "date": 1744146102495,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9734,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2475449114544229,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 169424,
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
          "id": "0ec191783554672ed3a182a1726d2c913a887dd9",
          "message": "feat: Add rollup IVC testing suite (#13371)\n\nAdds mock bases, merge and root rollups that use the rollup ivc scheme.\nThese are testing the IVC integration for rollup honk and will be used\nto test the integration of goblinized AVM recursive verifiers into\nrollup honk.",
          "timestamp": "2025-04-08T22:08:13Z",
          "tree_id": "36b25e12ce9ef5e15bcee03d6a04aa57736f6030",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0ec191783554672ed3a182a1726d2c913a887dd9"
        },
        "date": 1744152402874,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9189,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23369847941747382,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 132102,
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
          "id": "d656743bbd6b88f57b76ec5b30679f14a79b37a6",
          "message": "test: replacing remaining use of DocsExampleContract (#13388)\n\nContinuation of\nhttps://github.com/AztecProtocol/aztec-packages/pull/13368\n\nThis PR is part of a series of PRs in which I clean up our use of test\ncontracts. In this PR I am replacing all the remaining use of\nDocsExampleContract in `/yarn-project`.\n\nI introduce `NoConstructor` and `InvalidAccount` test contracts.",
          "timestamp": "2025-04-08T22:44:40Z",
          "tree_id": "17b0e6f8a75a2c67deff2ab366490cc5ce81123b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d656743bbd6b88f57b76ec5b30679f14a79b37a6"
        },
        "date": 1744154799931,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9906,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.25191931024492853,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 147002,
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
          "id": "a27fda019057795ac7103033b9f196d6ada6e0fa",
          "message": "git subrepo push --branch=master noir-projects/aztec-nr\n\nsubrepo:\n  subdir:   \"noir-projects/aztec-nr\"\n  merged:   \"7ab89b96ff\"\nupstream:\n  origin:   \"https://github.com/AztecProtocol/aztec-nr\"\n  branch:   \"master\"\n  commit:   \"7ab89b96ff\"\ngit-subrepo:\n  version:  \"0.4.6\"\n  origin:   \"???\"\n  commit:   \"???\"",
          "timestamp": "2025-04-09T02:30:25Z",
          "tree_id": "e0bdc44b6196b64049824ea7d5e5b6d898941bcd",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a27fda019057795ac7103033b9f196d6ada6e0fa"
        },
        "date": 1744167642712,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9204,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23406102907272042,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 130974,
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
          "id": "0e30b2cb2443694bca769914b1f398fb8b1f81b7",
          "message": "chore: remove setup-l2 job as it's not needed anymore (#13375)",
          "timestamp": "2025-04-09T08:38:53Z",
          "tree_id": "2579ec9ede3e411cd86af34957b9fca8dda8c54c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0e30b2cb2443694bca769914b1f398fb8b1f81b7"
        },
        "date": 1744190052218,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9291,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23627189413507002,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 142668,
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
          "distinct": false,
          "id": "20a0aaa43386dcfe2942de7ddb0426ce8b64bddd",
          "message": "fix: logging ABI in errors + more aggressive hex truncation (#12715)\n\nFixes #11003 \nAlso does some more aggressive hex truncation since we're still seeing\nsome logs including the entire `args` and taking up 100s of thousands of\nchars in logs that make them unreadable",
          "timestamp": "2025-04-09T09:20:49Z",
          "tree_id": "4aa499b6f264695c7f127b3bb293d64456e43fd7",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/20a0aaa43386dcfe2942de7ddb0426ce8b64bddd"
        },
        "date": 1744192494792,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9395,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23893326808862225,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 140144,
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
          "id": "c4efcb3c14474488ac469814bca60f2144bc8d2d",
          "message": "fix(avm): request paths for appendLeaves (#13389)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\nline.",
          "timestamp": "2025-04-09T09:37:50Z",
          "tree_id": "b3af6ec7eb35a2d0aa9a61d89cc97ab89a191e40",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c4efcb3c14474488ac469814bca60f2144bc8d2d"
        },
        "date": 1744194938363,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 10254,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.26076435246995994,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 153635,
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
          "id": "c8a766e9de7e107d5348771b5ad3adee35cab41e",
          "message": "fix: Wait for world-state to start before starting p2p (#13400)\n\nSince #13247 the p2p pool depends on world-state to be up to date for\npurging txs with insufficient balance. This means that if world-state is\nnot yet running, it will not accept `syncImmediate` calls, and will\ncause p2p to fail with the following error:\n\n```\n20:14:28 [20:14:28.999] ERROR: p2p:lmdb-v2:40401 Failed to commit transaction: Error: World State is not running. Unable to perform sync.\n20:14:28     at ServerWorldStateSynchronizer.syncImmediate (/home/aztec-dev/aztec-packages/yarn-project/world-state/dest/synchronizer/server_world_state_synchronizer.js:132:19)\n20:14:28     at AztecKVTxPool.evictInvalidTxsAfterMining (/home/aztec-dev/aztec-packages/yarn-project/p2p/dest/mem_pools/tx_pool/aztec_kv_tx_pool.js:375:44)\n20:14:28     at /home/aztec-dev/aztec-packages/yarn-project/p2p/dest/mem_pools/tx_pool/aztec_kv_tx_pool.js:82:46\n20:14:28     at /home/aztec-dev/aztec-packages/yarn-project/kv-store/dest/lmdb-v2/store.js:111:29\n20:14:29     at /home/aztec-dev/aztec-packages/yarn-project/foundation/dest/queue/serial_queue.js:56:33\n20:14:29     at FifoMemoryQueue.process (/home/aztec-dev/aztec-packages/yarn-project/foundation/dest/queue/base_memory_queue.js:110:17)\n20:14:29 [20:14:28.999] ERROR: p2p:l2-block-stream:40401 Error processing block stream: Error: World State is not running. Unable to perform sync.\n20:14:29     at ServerWorldStateSynchronizer.syncImmediate (/home/aztec-dev/aztec-packages/yarn-project/world-state/dest/synchronizer/server_world_state_synchronizer.js:132:19)\n20:14:29     at AztecKVTxPool.evictInvalidTxsAfterMining (/home/aztec-dev/aztec-packages/yarn-project/p2p/dest/mem_pools/tx_pool/aztec_kv_tx_pool.js:375:44)\n20:14:29     at /home/aztec-dev/aztec-packages/yarn-project/p2p/dest/mem_pools/tx_pool/aztec_kv_tx_pool.js:82:46\n20:14:29     at /home/aztec-dev/aztec-packages/yarn-project/kv-store/dest/lmdb-v2/store.js:111:29\n20:14:29     at /home/aztec-dev/aztec-packages/yarn-project/foundation/dest/queue/serial_queue.js:56:33\n20:14:29     at FifoMemoryQueue.process (/home/aztec-dev/aztec-packages/yarn-project/foundation/dest/queue/base_memory_queue.js:110:17)\n```\n\nSee [here](http://ci.aztec-labs.com/a97eca2e41f285b2) for a sample run.\n\nThis commit changes the Aztec node startup so it waits for world-state\nto start before kicking off p2p.",
          "timestamp": "2025-04-09T10:02:15Z",
          "tree_id": "398083263fd7f297994701285774f000859c3709",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c8a766e9de7e107d5348771b5ad3adee35cab41e"
        },
        "date": 1744195115109,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 10335,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2628406184429479,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 144425,
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
          "id": "8c58b76ca152b7896e2c4e731d5bc3d8239f431d",
          "message": "feat: unify opcode API between ultra and eccvm ops (#13376)\n\nIn this PR:\n* Use the same representation of opcodes for Ultra Ops and ECCVM ops and\nunit tests the equivalence. We favour the ECCVM representation because\nthis is thightly coupled to the correctness and efficiency of some ECCVM\nrelations.\n* Define the Ultra and ECCVM operation structs in the same file and\nremove the double definition of ECCVM operations\n* Move the op_queue outside of the stdlib_circuit_builder target in its\nown target to avoid the dependency of Goblin VMs on this",
          "timestamp": "2025-04-09T10:15:33Z",
          "tree_id": "9b5dad3c213ada7fe26507915b188f511c9184fa",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8c58b76ca152b7896e2c4e731d5bc3d8239f431d"
        },
        "date": 1744197281438,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 10435,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2653747516092325,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 151482,
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
          "id": "d5ce03a70b54516a2f3323e95d0878572f63f563",
          "message": "fix: check genesis state before starting node (#13121)\n\nThis PR adds a check that the computed genesis state matches the\nrollup's and refuses to start if there's a mismatch:\n\nExample of it in action: (I previously deployed a rollup without test\naccounts)\n```\nt % export TEST_ACCOUNTS=true\nt % node aztec/dest/bin/index.js start --node --archiver\nInitial funded accounts: 0x28491b8467212d92f515f389a39f1feddcd22dd07d6dbf60a2f162a213746c90, 0x235b767f653b46347246207d9f6dcc199b9204388e76be129e1bb1e57f43cab7, 0x041fc27e559aace70b414b6dfa4a70dc5933aa045afba8e100ec63f31d0fc88b                                                                                                                                                            Genesis block hash: 0x10d6c0bd1f44fdde380fa846ab63ca943f74e567b916774fe1855fcf2f41b105\nGenesis archive root: 0x1ef48c132277b9b2a9b348c763d2f281b4f3d08baa86070fc3a461507bd74ca6\n[10:59:45.136] WARN: foundation:version-manager Rollup or tag has changed, resetting data directory {\"versionFile\":\"/tmp/aztec-world-state-xZNypg/world_state/db_version\",\"storedVersion\":{\"schemaVersion\":0,\"rollupAddress\":\"0x0000000000000000000000000000000000000000\",\"tag\":\"\"},\"currentVersion\":{\"schemaVersion\":1,\"rollupAddress\":\"0x0000000000000000000000000000000000000000\",\"tag\":\"genesisArchiveTreeRoot:0x0000000000000000000000000000000000000000000000000000000000000000\"}}\n[10:59:45.159] INFO: world-state:database Creating world state data store at directory /tmp/aztec-world-state-xZNypg/world_state with map size 10485760 KB and 16 threads.\n[10:59:45.558] ERROR: cli Error in command execution\n[10:59:45.559] ERROR: cli Error: The computed genesis archive tree root 0x1ef48c132277b9b2a9b348c763d2f281b4f3d08baa86070fc3a461507bd74ca6 does not match the expected genesis archive tree root 0x0237797d6a2c04d20d4fa06b74482bd970ccd51a43d9b05b57e9b91fa1ae1cae for the rollup deployed at 0x0b306bf915c4d645ff596e518faf3f9669b97016\nError: The computed genesis archive tree root 0x1ef48c132277b9b2a9b348c763d2f281b4f3d08baa86070fc3a461507bd74ca6 does not match the expected genesis archive tree root 0x0237797d6a2c04d20d4fa06b74482bd970ccd51a43d9b05b57e9b91fa1ae1cae for the rollup deployed at 0x0b306bf915c4d645ff596e518faf3f9669b97016\n    at startNode (file:///mnt/user-data/alexg/code/aztec-packages/alpha/yarn-project/aztec/dest/cli/cmds/start_node.js:63:19)\n```\n\nFix #13020",
          "timestamp": "2025-04-09T11:29:55Z",
          "tree_id": "03ccf1f3be43bc4901ec3654c1450f86d3f74805",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d5ce03a70b54516a2f3323e95d0878572f63f563"
        },
        "date": 1744200914370,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 10240,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.26042087137865244,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 145752,
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
          "id": "3f11060e5de846f0dc2662985c4b98dd62001302",
          "message": "feat(avm): tree padding (#13394)\n\nFolded creation of db type aliases into this PR.",
          "timestamp": "2025-04-09T11:39:41Z",
          "tree_id": "0dddc76daae5ea17f63d2584e30081bf262b85db",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/3f11060e5de846f0dc2662985c4b98dd62001302"
        },
        "date": 1744202275343,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 10629,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2703238966865319,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 161027,
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
          "id": "16aa932f5a1fc06a05bad90d7b6de35a0289bb4f",
          "message": "chore(sol): fix off by one in test gen (#13410)\n\n## Overview\n\nultra tests have not been running in ci and failing locally for some\ntime, this pr makes em green again",
          "timestamp": "2025-04-09T13:13:23Z",
          "tree_id": "23a823af2a918ba6fc5ecce7c8b6019b559d9e28",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/16aa932f5a1fc06a05bad90d7b6de35a0289bb4f"
        },
        "date": 1744207972827,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 10061,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2558729232713865,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 147120,
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
          "id": "1994b2ccb3976644074beabeddf708427a2b6700",
          "message": "chore(avm): dont use PIs in simulation (#13409)\n\nWe would not have PIs in standalone simulation. We have to make sure\nthat our inputs either come from the DBs or TX.",
          "timestamp": "2025-04-09T13:22:44Z",
          "tree_id": "8075083f52d03f05c9ca572f055a409bd82f8b35",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1994b2ccb3976644074beabeddf708427a2b6700"
        },
        "date": 1744208678854,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 10477,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.26645804777912546,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 153865,
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
          "id": "4247bb6512d9e5b7e9515ac52eaeaf9f5251eb34",
          "message": "feat: persist the bot and enable simulation capturing (#13276)\n\nThe bots did not persist their databases because when we first\nintroduced them the pxe did not have reorg support. This should be fine\nnow :)\n\nAlso enables the option of using the recording simulator in the bot's\nPXE for debugging",
          "timestamp": "2025-04-09T14:51:32Z",
          "tree_id": "e8e5db9c1980eebfd7752bd481f67a411fc5f613",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/4247bb6512d9e5b7e9515ac52eaeaf9f5251eb34"
        },
        "date": 1744212450660,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 10269,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.26115074508919084,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 140542,
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
          "id": "8dc17ec36e2723958d297b7847af1ec94ff57561",
          "message": "feat: more blob sink metrics (#13413)\n\nThis PR adds more metrics to the blob sink\n\n---------\n\nCo-authored-by: Santiago Palladino <santiago@aztecprotocol.com>",
          "timestamp": "2025-04-09T15:18:10Z",
          "tree_id": "95a2e8af434b94c546de17d6bf355ad1979a0696",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8dc17ec36e2723958d297b7847af1ec94ff57561"
        },
        "date": 1744214049666,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 10393,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2643113354938142,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 151527,
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
          "id": "ff2e7381d344dbfa18be8deff96c61b01e53d6f4",
          "message": "fix: Nondeterminism in constant allocation (#13340)\n\nQuick fix to an issue discovered in testnet. We were having\nnondeterministic contract builds between aarch64 and amd64 builds of the\nnoir compiler, reproduced locally. The iterators generated from the\nFxHashMaps/FxHashSets used in constant_allocation were yielding\ndifferently ordered items. I did log the insertions and the input was in\nthe same order (if the insertion ordering was nondeterministic the\niteration order is expected to be nondeterministic) so I have no idea\nwhat was creating the nondeterminism there. Switched to a\nBTreeMap/BTreeSet in that file and nondeterminism is gone.",
          "timestamp": "2025-04-09T15:22:43Z",
          "tree_id": "1efcb1efecf60c9a6966f88f74de166abb69c434",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ff2e7381d344dbfa18be8deff96c61b01e53d6f4"
        },
        "date": 1744214956007,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 10436,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.26539785261289495,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 157537,
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
          "id": "33286aeea54ac77a4dc1dd82fba1c63a7c463803",
          "message": "fix: easier description of how to use multiple authwitnesses with cli wallet (#13412)\n\nWas unable to figure out how it worked here from the desc to use\nmultiple authwits in a single tx, so I made it a bit easier to figure\nout and added it in the desc",
          "timestamp": "2025-04-09T15:45:28Z",
          "tree_id": "8e55da863a814017f52e387bfb426cc652e407cb",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/33286aeea54ac77a4dc1dd82fba1c63a7c463803"
        },
        "date": 1744216455788,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 10225,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2600473858346468,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 147949,
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
          "id": "593541723bd2350745cc40f15b969016e5cf65ba",
          "message": "fix: Use API keys when fetching blobs on missed slot (#13418)\n\nOptional arguments considered harmful.\n\nDue to a missed argument in a recursive call, we were not loading the\nAPI keys for hitting the consensus URL on a missed slot, so any requests\nwould fail with a 4xx if hitting a consensus endpoint that needed keys\n(like GCP's).\n\nFixes #13415",
          "timestamp": "2025-04-09T15:56:15Z",
          "tree_id": "1e4f9136c6fb69525de06f98c47681e01740887c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/593541723bd2350745cc40f15b969016e5cf65ba"
        },
        "date": 1744220582857,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 10377,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2638965272272603,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 144134,
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
          "id": "ea7eaf5919e84b7abb75cb90839ed22b516c71ad",
          "message": "refactor(avm): getNullifierIndex -> checkNullifierExists (#13414)\n\nChanging only for public, the same can be done for private.\n\nChatted with @nventuro and decided to merge the CommitmentsDB interface\nwith the ExecutionDataProvider interface, since it wasn't used anywhere\nelse.",
          "timestamp": "2025-04-09T16:12:37Z",
          "tree_id": "898c6d70e3376d1a044ca40fd0626415e5fe813c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ea7eaf5919e84b7abb75cb90839ed22b516c71ad"
        },
        "date": 1744220641428,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 10387,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.26414873052761595,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 151569,
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
          "id": "ca81e65fe32e295cc48596fff1b0fd1a6df5f1c3",
          "message": "fix: warn if blob sink server can't be reached (#13419)",
          "timestamp": "2025-04-09T16:58:58Z",
          "tree_id": "a4ac5c5c094b65cf401f081d9e6f654a23687185",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ca81e65fe32e295cc48596fff1b0fd1a6df5f1c3"
        },
        "date": 1744220732017,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 10334,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2628073926668328,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 147323,
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
          "distinct": false,
          "id": "15d2633d5bb6de55d74f4b8404cd4f009523f708",
          "message": "fix(Barretenberg): shplemini variables in one gate fixes (#13290)\n\nThis PR fixes extra and unconstrained variables in the ultra recursive\nverifier.\n\nExtra variables appeared in the circuit for different reasons. We don't\nfix some places in the circuit because of interleaving (see\nhttps://github.com/AztecProtocol/barretenberg/issues/1293)\n\nAlso static analyzer found unconstrained variables in the circuit:\nnum_public_inputs and pub_inputs_offset were added in the circuit at the\ntime of the creation of verification key.\n\nAlso there was created function to print additional information about\nvariable in one gate for more convenient debugging.\n\n---------\n\nCo-authored-by: iakovenkos <sergey.s.yakovenko@gmail.com>",
          "timestamp": "2025-04-09T17:00:36Z",
          "tree_id": "930505a65bb045ea4588dc576d310da8532e27e5",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/15d2633d5bb6de55d74f4b8404cd4f009523f708"
        },
        "date": 1744220885980,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 10263,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2609922088605811,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 144627,
            "unit": "us"
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
          "distinct": false,
          "id": "6c23db4ddba5aed447ee44412ce96b3a637c6a7e",
          "message": "chore: bump to forge nightly 2025-04-08 (#12799)\n\nWe want to move to stable forge.\nFix #12742\n\n---------\n\nCo-authored-by: Charlie Lye <5764343+charlielye@users.noreply.github.com>\nCo-authored-by: Santiago Palladino <santiago@aztec-labs.com>",
          "timestamp": "2025-04-09T21:56:56Z",
          "tree_id": "830df1d995d4e366e33fa2f5196ccc570ad6b38c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/6c23db4ddba5aed447ee44412ce96b3a637c6a7e"
        },
        "date": 1744239307830,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 10255,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2607976077557036,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 145317,
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
          "id": "866968a79be21d4d64442326bf4e91e2bd05eb69",
          "message": "chore: BoundedVec::for_each (#13426)\n\nNow that this exists in the stdlib we can get rid of our homemade\nreplacement function.",
          "timestamp": "2025-04-09T22:34:43Z",
          "tree_id": "a6ff7604bc9b79d5132d0dab7550cd368cb02f91",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/866968a79be21d4d64442326bf4e91e2bd05eb69"
        },
        "date": 1744241523469,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 10380,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2639823533076461,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 148823,
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
          "id": "772259aa081e102ff0b4b57f68019c275afbb93b",
          "message": "git subrepo push --branch=master noir-projects/aztec-nr\n\nsubrepo:\n  subdir:   \"noir-projects/aztec-nr\"\n  merged:   \"b32f8e9b47\"\nupstream:\n  origin:   \"https://github.com/AztecProtocol/aztec-nr\"\n  branch:   \"master\"\n  commit:   \"b32f8e9b47\"\ngit-subrepo:\n  version:  \"0.4.6\"\n  origin:   \"???\"\n  commit:   \"???\"",
          "timestamp": "2025-04-10T02:29:58Z",
          "tree_id": "365a83b2865540b221eba17e34a4d4b7c26c661e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/772259aa081e102ff0b4b57f68019c275afbb93b"
        },
        "date": 1744254200566,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 10344,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.26306962795377864,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 143875,
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
          "id": "9eadf18b6e9757a16d1bd2d464c5a539256b7a7d",
          "message": "chore(avm): check full tuple after find_in_dst (#13397)\n\nCloses #13140, assuming tests are compiled with assertions enabled.",
          "timestamp": "2025-04-10T07:07:22Z",
          "tree_id": "95ffdd0d048c89685edd60dc8b40222074c2408f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9eadf18b6e9757a16d1bd2d464c5a539256b7a7d"
        },
        "date": 1744273585013,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 10341,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2629781007616372,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 153535,
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
          "id": "ac97b246604b9df6e7691c559a01d395a045050d",
          "message": "feat: Add nullifier read gadget (#13403)\n\nAdds a nullifier read gadget that will eventually be transformed to a\nnullifier rw gadget",
          "timestamp": "2025-04-10T07:39:09Z",
          "tree_id": "5a563efefcb94a579155358e0b3ac4bab89c048d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ac97b246604b9df6e7691c559a01d395a045050d"
        },
        "date": 1744275532606,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 10717,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.272558138013629,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 157467,
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
          "distinct": false,
          "id": "220e82b278055d254de689e7cab343f51290a956",
          "message": "fix: omit p2p options from prover & bootstrap nodes (#13441)\n\nWe were getting options like `p2pPort` in multiple namespaces & getting\nthem overwriten. we should only get p2p CLI options under the `p2p.`\nnamespace and apply those to whatever infra is starting",
          "timestamp": "2025-04-10T12:40:43Z",
          "tree_id": "f4d5d9c62d04756ccd317b5307db0e1f52023756",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/220e82b278055d254de689e7cab343f51290a956"
        },
        "date": 1744292377226,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 10359,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.26344331477023925,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 150878,
            "unit": "us"
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
          "distinct": false,
          "id": "915841b28fcba381467b2bb55e082fd91fb22d27",
          "message": "fix: deprecate witness circuit size from ECCVM and Translator (#13133)\n\nThe circuit sizes in Translator and ECCVM are now given by constexpr\nintegers. Therefore, the provers do not need to send the circuit sizes\nto the verifiers. In its turn, the respective recursive verifiers do not\nneed to constrain witness `log_circuit_size`s in-circuit.\n\nTo support this change, I modified Shplemini interface to accept log\ncircuit size as an integer as opposed to (unconstrained) witness\n`circuit_size`. The derivation of log circuit sizes in other Flavors'\nrecursive verifiers is still insecure.\n\nIntroduced `USE_PADDING` flag in Flavors to allow compile time exclusion\nof padding logic in Shplemini and Sumcheck.\n \n\nCloses https://github.com/AztecProtocol/barretenberg/issues/1040",
          "timestamp": "2025-04-10T15:37:21Z",
          "tree_id": "5850f444477e53e31be896d552284a1c5f3bdad9",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/915841b28fcba381467b2bb55e082fd91fb22d27"
        },
        "date": 1744307664167,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 10348,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2631738236788016,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 143802,
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
          "id": "148ff8d9011739dd03a7865ca46cb5f5301ca4e7",
          "message": "chore: update koa dependency (#13452)\n\n## Overview\n\nupdate koa dependency",
          "timestamp": "2025-04-10T17:53:50Z",
          "tree_id": "e4abc6761a4f3ce5c3f7df6836c258050780b237",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/148ff8d9011739dd03a7865ca46cb5f5301ca4e7"
        },
        "date": 1744311347338,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 10340,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2629599136018908,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 145008,
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
          "id": "507b68be913746f6d1e05172010e5f4d03ee8bf5",
          "message": "feat: statically defined ECCVM/Translator VK data (#13395)\n\nIntroduces static methods for initializing the verification keys for\nECCVM/Translator. This is possible since the VK commitments for these\nVMs are a function only of the respective fixed circuit size constants.\nThe ECCVM/Translator VKs are now default constructed with the correct\nvalues which allows removal of a lot of explicit handling of them\nelsewhere.\n\nNote: there's more simplification that could come out of this work but\nits beyond the scope of the primary purpose of this PR which was to\nintroduce simple methods for obtaining the fixed VK data.\n\nCloses https://github.com/AztecProtocol/barretenberg/issues/798",
          "timestamp": "2025-04-10T18:58:02Z",
          "tree_id": "4ef5e63ea0f63227dbb151e1afdff17ee318d18f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/507b68be913746f6d1e05172010e5f4d03ee8bf5"
        },
        "date": 1744316319469,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 10564,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2686594751898348,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 144616,
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
          "id": "40b34ef0fed0e3044a0485a55c4c0c3917c51d46",
          "message": "chore: remove lingering log (#13408)\n\nFixes #13355\n\nThe `bridgeL1FeeJuice` function already does logging based on whether it\nmints or not, so not needed directly in the cli part as well.",
          "timestamp": "2025-04-10T20:39:27Z",
          "tree_id": "030ab94bdf249888befb79860cdac314f5943d2b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/40b34ef0fed0e3044a0485a55c4c0c3917c51d46"
        },
        "date": 1744321426673,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 10393,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.26431336146332335,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 150898,
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
          "id": "a045f7852fa17320666daa65b658601559585bb7",
          "message": "chore(dep): bump crypto polyfill (#13466)\n\ntitle",
          "timestamp": "2025-04-10T22:01:02Z",
          "tree_id": "fb6c55075aef14cbfffc53184b99288810e03db8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a045f7852fa17320666daa65b658601559585bb7"
        },
        "date": 1744325918122,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 10322,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.26249199399418316,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 144913,
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
          "id": "29d737e7811be26586577061c0b409a3da9f2dcb",
          "message": "feat: Reorg cheat codes (#13367)\n\nLeverages [`anvil_reorg` and\n`anvil_rollback`](https://github.com/foundry-rs/foundry/discussions/10267)\nto simulate reorgs in EthCheatCodes.\n\nRequires foundry `nightly-fe92e7ef225c6380e657e49452ce931871ae56bc`\n(2025-01-31T00:20:44.300723007Z) or later.",
          "timestamp": "2025-04-10T23:04:17Z",
          "tree_id": "8b96731538e53f3333947fd6ad6b1bf2e6f55099",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/29d737e7811be26586577061c0b409a3da9f2dcb"
        },
        "date": 1744329867718,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 10436,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.26540595300244463,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 154804,
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
          "id": "95b199e9353b4666687ae3e1907d289c4ef60e05",
          "message": "fix: PXE sync batch and plantext deploy sent tx (#13476)\n\nFixes extracted from playground branch",
          "timestamp": "2025-04-11T06:04:24Z",
          "tree_id": "0fda1a3a240e03a3b16437539ff311d3b2061b7d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/95b199e9353b4666687ae3e1907d289c4ef60e05"
        },
        "date": 1744354866646,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 10137,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.25779168936307667,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 146254,
            "unit": "us"
          }
        ]
      }
    ]
  }
}