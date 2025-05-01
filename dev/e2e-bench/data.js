window.BENCHMARK_DATA = {
  "lastUpdate": 1746087564936,
  "repoUrl": "https://github.com/AztecProtocol/aztec-packages",
  "entries": {
    "End-to-end Benchmark": [
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
          "id": "467166f47f443412fcd7cd9ee9137896bbbe28b2",
          "message": "chore: use public component key for pairing inputs (#13705)\n\nReplaces `pairing_point_accumulator_public_input_indices` and\n`contains_pairing_point_accumulator` with a `PublicComponentKey`\n`pairing_inputs_public_input_key`. This reduces the number of field\nelements in a honk VK (all variants) by 16. (The old components are\nstill used for Plonk so I couldn't remove them entirely yet).",
          "timestamp": "2025-04-23T23:34:21Z",
          "tree_id": "a2cbaea3c36656eaa4e21d4544f872a36ab90145",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/467166f47f443412fcd7cd9ee9137896bbbe28b2"
        },
        "date": 1745456101483,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9622,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2754609218740488,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 155998,
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
          "id": "0f31e1da06e677b3438910f7caf322d975229674",
          "message": "git subrepo push --branch=master noir-projects/aztec-nr\n\nsubrepo:\n  subdir:   \"noir-projects/aztec-nr\"\n  merged:   \"a3cb3569f7\"\nupstream:\n  origin:   \"https://github.com/AztecProtocol/aztec-nr\"\n  branch:   \"master\"\n  commit:   \"a3cb3569f7\"\ngit-subrepo:\n  version:  \"0.4.6\"\n  origin:   \"???\"\n  commit:   \"???\"",
          "timestamp": "2025-04-24T02:31:35Z",
          "tree_id": "e853c991f56aed285449faecc8c4023cf6440daf",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0f31e1da06e677b3438910f7caf322d975229674"
        },
        "date": 1745464105415,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9192,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2631578947368421,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 138360,
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
          "id": "abc462350775ceaf16e3e2af45f1669f02ee5adb",
          "message": "fix: remove all txs from a failed epoch (#13771)\n\nFixes #13723 \nTo be reverted in the future, tracked here:\nhttps://github.com/AztecProtocol/aztec-packages/issues/13770",
          "timestamp": "2025-04-24T09:59:13Z",
          "tree_id": "4d4899c750191faa8cc700a87034c81d7bfde41d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/abc462350775ceaf16e3e2af45f1669f02ee5adb"
        },
        "date": 1745492542199,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9660,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2765606803171487,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 148245,
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
          "id": "640dd086401ef8ed05063fea8939062f69aebb8e",
          "message": "refactor: bespoke export for client native prover / PXE server store lazy load (#13783)\n\nFixes: https://github.com/AztecProtocol/aztec-packages/issues/13656 (or\nmore like avoids the problematic import)\n\nCreates specific (and more descriptive) exports for `bb-prover`,\nfocusing on where the code should run (client/server) rather than the\ntask at hand (prover/verifier). This mimics the behavior of other\npackages with similar issues.\n\nWe still have to figure out publishing of native packages.",
          "timestamp": "2025-04-24T12:06:29Z",
          "tree_id": "abff4369fc949913de8495996c9a30310915387f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/640dd086401ef8ed05063fea8939062f69aebb8e"
        },
        "date": 1745501398068,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 10307,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.29507856171627134,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 172250,
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
          "id": "4d04e62b1f48cbdbdc05c6c6fd057bdc4bf834fa",
          "message": "feat!: Use combined p2p and http prover coordination (#13760)\n\nRefactors prover coordination to allow tx retrieval by the prover node\nover p2p and/or http using known nodes.",
          "timestamp": "2025-04-24T12:46:08Z",
          "tree_id": "782fac50c3e254f3991c8ca55b2879bda9b8f48f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/4d04e62b1f48cbdbdc05c6c6fd057bdc4bf834fa"
        },
        "date": 1745502312365,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9310,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.266538657034315,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 154603,
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
          "id": "1f9603eefccf7d9bbb12df086b10c949a880e8c3",
          "message": "feat: Store epoch proving job failure (#13752)\n\nAdds a config `PROVER_NODE_FAILED_EPOCH_STORE` pointing to a local\ndirectory or google storage. If set, when an epoch proving job fails, it\nuploads a snapshot of the archiver and world state, along with all txs,\nblocks, and cross-chain messages involved in the epoch, so we can\n(hopefully) reconstruct state at the time of the failure.\n\nRe-running is done via two new actions: one for downloading, another for\nactually proving. Proving is done with a local prover, which should be\ngood enough for debugging smallish epochs, but we can extend this to use\na remote broker if we need more horsepower. See\n`end-to-end/src/e2e_epochs/epochs_upload_failed_proof.test.ts` for an\nend-to-end on how to use these actions (with real proofs disabled).\n\nPending add the env var to the prover node in k8s, and cherry-pick to\nthe alpha-testnet branch once merged.\n\nFixes #13725",
          "timestamp": "2025-04-24T16:17:02Z",
          "tree_id": "8bfe068c3e5eba659247d52b2901a28c6f73a04c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1f9603eefccf7d9bbb12df086b10c949a880e8c3"
        },
        "date": 1745516648120,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9357,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2678784774644552,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 151386,
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
          "id": "34538b29316cb9cbbbf792d11c814108b549b924",
          "message": "fix: Handle undefined proverCoordinationNodeUrls (#13804)\n\nGot hit by the following when deploying:\n\n```\nTypeError: Cannot read properties of undefined (reading 'length') at createProverCoordination (file:///usr/src/yarn-project/prover-node/dest/prover-coordination/factory.js:35:43) at createProverNode (file:///usr/src/yarn-project/prover-node/dest/factory.js:50:38) at process.processTicksAndRejections (node:internal/process/task_queues:95:5) at async startProverNode (file:///usr/src/yarn-project/aztec/dest/cli/cmds/start_prover_node.js:81:24) at async aztecStart (file:///usr/src/yarn-project/aztec/dest/cli/aztec_start_action.js:54:27) at async Command.<anonymous> (file:///usr/src/yarn-project/aztec/dest/cli/cli.js:17:16) at async Command.parseAsync (/usr/src/yarn-project/node_modules/commander/lib/command.js:1092:5) at async main (file:///usr/src/yarn-project/aztec/dest/bin/index.js:48:5)\n```",
          "timestamp": "2025-04-24T18:37:31Z",
          "tree_id": "a83565ceeddcc1f237aa03cd05a9da70c4ea264a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/34538b29316cb9cbbbf792d11c814108b549b924"
        },
        "date": 1745523425012,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9315,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.26666659555557454,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 164078,
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
          "id": "549c254cf89e44fdf883d0950dae36e50822c28f",
          "message": "chore: skip hinting for tree padding (#13818)\n\nBefore\n\n![image](https://github.com/user-attachments/assets/2933fef3-a1b5-45e4-882a-b6374d1682dc)\n\nAfter\n\n![image](https://github.com/user-attachments/assets/6e1b2db9-7e9d-49d5-acdf-810f1901c210)\n\nCo-authored-by: dbanks12 <david@aztecprotocol.com>",
          "timestamp": "2025-04-24T18:39:32Z",
          "tree_id": "5737334c0287e11c1f539123c12c9fec9c39f2f7",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/549c254cf89e44fdf883d0950dae36e50822c28f"
        },
        "date": 1745524731863,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8142,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2330849657633148,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 139315,
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
          "id": "d9146b29f07702a40dec81937e3703c97de701df",
          "message": "refactor(avm): some fixes and faster tests (#13785)\n\nThis PR does a few things\n* Improves the way to check for previously initialized polynomials in\n`compute_polynomials`.\n* Removes `AllConstRefEntities` from the flavor, and also\n`get_standard_row` from the polys. This is not used in \"prod\" and was\nonly used for check_circut and other things.\n* Creates an equivalent concept of `AvmFullRowConstRef` which is a row\nof references, similar to what was `AllConstRefEntities`.\n* We now use the above directly in check_circuit AND in tests, which\navoids creating full rows of fields.\n* This allowed some simplifications in `check_relation`.\n\nSome improvements: running all C++ VM2 tests (without goblin):\n* Before: 43s\n* After: 15s",
          "timestamp": "2025-04-24T18:47:23Z",
          "tree_id": "5962714a705727335143ee5ce153a9c9a16d5e19",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d9146b29f07702a40dec81937e3703c97de701df"
        },
        "date": 1745526435658,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8603,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.24629213350314355,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 159107,
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
          "id": "115611990d3a57bba60b5dde06929452ddac6c3a",
          "message": "feat(docs): \"try testnet\" collation page (#11299)\n\nCloses https://github.com/AztecProtocol/aztec-packages/issues/10493\nCloses https://github.com/AztecProtocol/aztec-packages/issues/10538\nCloses https://github.com/AztecProtocol/aztec-packages/issues/11723\n\nnot fully ready for review but i'd appreciate a look on the \"try\ntestnet\" and \"getting started with testnet\" pages\n\n---------\n\nCo-authored-by: Rahul Kothari <rahul.kothari.201@gmail.com>\nCo-authored-by: josh crites <critesjosh@gmail.com>\nCo-authored-by: Josh Crites <jc@joshcrites.com>",
          "timestamp": "2025-04-24T20:38:35Z",
          "tree_id": "baaa80f4982ace9166b414dd47fb379d807004a0",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/115611990d3a57bba60b5dde06929452ddac6c3a"
        },
        "date": 1745531397247,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8314,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23802473743491215,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 145778,
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
          "id": "eadb87d8550fd069ab72705b0fe9ed6b355220ad",
          "message": "feat: Add pairing points for all Honk circuits (#13701)\n\nWe add a couple of checks to enforce that honk circuits add exactly ONE\npairing point object to its public outputs. The first check is in the\nDeciderProvingKey constructor, which all flows use to create the proving\nkey from the circuit, and it checks that the pairing point object has\nbeen set in the builder. The second check happens in the\naggregation_state itself, where if we try to call set_public() and the\nbuilder already has one set, it will throw an error.\n\nThese checks require us to add pairing point objects to a lot of\ndifferent tests and also move around some of the logic to more proper\npositions (like from accumulate() to complete_kernel_circuit_logic()).\nPreviously, we had varying amounts of pairing point objects for Mega\ncircuits, but now that shouldn't be the case.",
          "timestamp": "2025-04-24T20:58:53Z",
          "tree_id": "181e85f3136a6c12d2953a7406ec7229d2932a86",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/eadb87d8550fd069ab72705b0fe9ed6b355220ad"
        },
        "date": 1745531913359,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8613,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2465783554505899,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 150575,
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
          "id": "4cb40fdd1f1a053c64abab21ef25502489541ed8",
          "message": "chore: assert on bad public component key (#13827)\n\nAbort when attempting to reconstruct a PublicInputComponent with a key\nthat leads to overreading the public inputs.\n\nCloses https://github.com/AztecProtocol/barretenberg/issues/1372",
          "timestamp": "2025-04-25T02:44:20Z",
          "tree_id": "d907c33307fcf1f2b4a746c2aed7471dfd40002a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/4cb40fdd1f1a053c64abab21ef25502489541ed8"
        },
        "date": 1745554599394,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8218,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2352713101694612,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 149961,
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
          "id": "32262af5946c2d6848d8021441f205d3f5cb7fc2",
          "message": "fix: sponsored fpc playground versioning (#13831)\n\nAllows using fixed artifacts for particular networks. Requires\nhttps://github.com/AztecProtocol/aztec-packages/pull/13830 to be merged\nso it works with playground.\n\nAlso sneaky fix for bad defaults on cli-wallet account deployments\n\n---------\n\nCo-authored-by: saleel <saleel@aztecprotocol.com>",
          "timestamp": "2025-04-25T06:45:28Z",
          "tree_id": "4f6f43826eb2259213356f6b53acb4eab19e4f42",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/32262af5946c2d6848d8021441f205d3f5cb7fc2"
        },
        "date": 1745567011913,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8388,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.24013074638879378,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 143865,
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
          "id": "fb7f80f9a1db7f6e71e0e63a10d6458d396e90f2",
          "message": "feat: Script for donwloading and running failed epoch proof (#13822)\n\nAdds a one-liner that, given an URL for an uploaded failed epoch proving\njob, downloads and re-runs it.\n\nExample run:\n\n```\n$ PROVER_REAL_PROOFS=false yarn run-failed-epoch 'gs://aztec-develop/palla/failed-epochs/aztec-1337-3184683497-0x11ea6beac329629007a630d53d0a76831d8ed452/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642' /tmp/epoch-test\n\n[17:11:21.921] INFO: prover-node:run-failed-epoch Downloading epoch proving job data and state from gs://aztec-develop/palla/failed-epochs/aztec-1337-3184683497-0x11ea6beac329629007a630d53d0a76831d8ed452/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642 to /tmp/epoch-test/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642\n[17:11:21.921] INFO: prover-node:run-failed-epoch Downloading epoch proving job data from gs://aztec-develop/palla/failed-epochs/aztec-1337-3184683497-0x11ea6beac329629007a630d53d0a76831d8ed452/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642\n[17:11:21.921] INFO: stdlib:file-store Creating google cloud file store at aztec-develop palla/failed-epochs/aztec-1337-3184683497-0x11ea6beac329629007a630d53d0a76831d8ed452/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642\n[17:11:24.429] INFO: prover-node:run-failed-epoch Downloading state snapshot from gs://aztec-develop/palla/failed-epochs/aztec-1337-3184683497-0x11ea6beac329629007a630d53d0a76831d8ed452/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642 to local data directory {\"metadata\":{\"l2BlockNumber\":104,\"l2BlockHash\":\"0x26f2c7651ab1ff2e787a12cd7003b603f36fbb85f6b56060547a366ab86fdbd9\",\"l1BlockNumber\":219,\"l1ChainId\":1337,\"rollupVersion\":3184683497,\"rollupAddress\":\"0x11ea6beac329629007a630d53d0a76831d8ed452\"},\"dataUrls\":{\"archiver\":\"gs://aztec-develop/palla/failed-epochs/aztec-1337-3184683497-0x11ea6beac329629007a630d53d0a76831d8ed452/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/archiver.db\",\"nullifier-tree\":\"gs://aztec-develop/palla/failed-epochs/aztec-1337-3184683497-0x11ea6beac329629007a630d53d0a76831d8ed452/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/nullifier-tree.db\",\"public-data-tree\":\"gs://aztec-develop/palla/failed-epochs/aztec-1337-3184683497-0x11ea6beac329629007a630d53d0a76831d8ed452/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/public-data-tree.db\",\"note-hash-tree\":\"gs://aztec-develop/palla/failed-epochs/aztec-1337-3184683497-0x11ea6beac329629007a630d53d0a76831d8ed452/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/note-hash-tree.db\",\"archive-tree\":\"gs://aztec-develop/palla/failed-epochs/aztec-1337-3184683497-0x11ea6beac329629007a630d53d0a76831d8ed452/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/archive-tree.db\",\"l1-to-l2-message-tree\":\"gs://aztec-develop/palla/failed-epochs/aztec-1337-3184683497-0x11ea6beac329629007a630d53d0a76831d8ed452/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/l1-to-l2-message-tree.db\"}}\n[17:11:24.429] INFO: prover-node:run-failed-epoch Creating google cloud file store at aztec-develop palla/failed-epochs/aztec-1337-3184683497-0x11ea6beac329629007a630d53d0a76831d8ed452/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642\n[17:11:25.599] INFO: prover-node:run-failed-epoch Downloading snapshot to /tmp/epoch-test/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/state/download-tTi6tA {\"snapshot\":{\"dataUrls\":{\"archiver\":\"gs://aztec-develop/palla/failed-epochs/aztec-1337-3184683497-0x11ea6beac329629007a630d53d0a76831d8ed452/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/archiver.db\",\"nullifier-tree\":\"gs://aztec-develop/palla/failed-epochs/aztec-1337-3184683497-0x11ea6beac329629007a630d53d0a76831d8ed452/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/nullifier-tree.db\",\"public-data-tree\":\"gs://aztec-develop/palla/failed-epochs/aztec-1337-3184683497-0x11ea6beac329629007a630d53d0a76831d8ed452/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/public-data-tree.db\",\"note-hash-tree\":\"gs://aztec-develop/palla/failed-epochs/aztec-1337-3184683497-0x11ea6beac329629007a630d53d0a76831d8ed452/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/note-hash-tree.db\",\"archive-tree\":\"gs://aztec-develop/palla/failed-epochs/aztec-1337-3184683497-0x11ea6beac329629007a630d53d0a76831d8ed452/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/archive-tree.db\",\"l1-to-l2-message-tree\":\"gs://aztec-develop/palla/failed-epochs/aztec-1337-3184683497-0x11ea6beac329629007a630d53d0a76831d8ed452/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/l1-to-l2-message-tree.db\"}},\"downloadPaths\":{\"archiver\":\"/tmp/epoch-test/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/state/download-tTi6tA/archiver.db\",\"nullifier-tree\":\"/tmp/epoch-test/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/state/download-tTi6tA/nullifier-tree.db\",\"public-data-tree\":\"/tmp/epoch-test/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/state/download-tTi6tA/public-data-tree.db\",\"note-hash-tree\":\"/tmp/epoch-test/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/state/download-tTi6tA/note-hash-tree.db\",\"archive-tree\":\"/tmp/epoch-test/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/state/download-tTi6tA/archive-tree.db\",\"l1-to-l2-message-tree\":\"/tmp/epoch-test/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/state/download-tTi6tA/l1-to-l2-message-tree.db\"}}\n[17:11:27.391] INFO: prover-node:run-failed-epoch Snapshot downloaded at /tmp/epoch-test/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/state/download-tTi6tA {\"snapshot\":{\"dataUrls\":{\"archiver\":\"gs://aztec-develop/palla/failed-epochs/aztec-1337-3184683497-0x11ea6beac329629007a630d53d0a76831d8ed452/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/archiver.db\",\"nullifier-tree\":\"gs://aztec-develop/palla/failed-epochs/aztec-1337-3184683497-0x11ea6beac329629007a630d53d0a76831d8ed452/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/nullifier-tree.db\",\"public-data-tree\":\"gs://aztec-develop/palla/failed-epochs/aztec-1337-3184683497-0x11ea6beac329629007a630d53d0a76831d8ed452/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/public-data-tree.db\",\"note-hash-tree\":\"gs://aztec-develop/palla/failed-epochs/aztec-1337-3184683497-0x11ea6beac329629007a630d53d0a76831d8ed452/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/note-hash-tree.db\",\"archive-tree\":\"gs://aztec-develop/palla/failed-epochs/aztec-1337-3184683497-0x11ea6beac329629007a630d53d0a76831d8ed452/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/archive-tree.db\",\"l1-to-l2-message-tree\":\"gs://aztec-develop/palla/failed-epochs/aztec-1337-3184683497-0x11ea6beac329629007a630d53d0a76831d8ed452/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/l1-to-l2-message-tree.db\"}},\"downloadPaths\":{\"archiver\":\"/tmp/epoch-test/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/state/download-tTi6tA/archiver.db\",\"nullifier-tree\":\"/tmp/epoch-test/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/state/download-tTi6tA/nullifier-tree.db\",\"public-data-tree\":\"/tmp/epoch-test/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/state/download-tTi6tA/public-data-tree.db\",\"note-hash-tree\":\"/tmp/epoch-test/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/state/download-tTi6tA/note-hash-tree.db\",\"archive-tree\":\"/tmp/epoch-test/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/state/download-tTi6tA/archive-tree.db\",\"l1-to-l2-message-tree\":\"/tmp/epoch-test/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/state/download-tTi6tA/l1-to-l2-message-tree.db\"}}\n[17:11:27.393] INFO: prover-node:run-failed-epoch Archiver database set up from snapshot {\"path\":\"/tmp/epoch-test/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/state/archiver\",\"dbVersion\":1,\"rollupAddress\":\"0x11ea6beac329629007a630d53d0a76831d8ed452\"}\n[17:11:27.393] INFO: prover-node:run-failed-epoch World state database l1-to-l2-message-tree set up from snapshot {\"path\":\"/tmp/epoch-test/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/state/world_state/L1ToL2MessageTree\",\"dbVersion\":1,\"rollupAddress\":\"0x11ea6beac329629007a630d53d0a76831d8ed452\"}\n[17:11:27.394] INFO: prover-node:run-failed-epoch World state database archive-tree set up from snapshot {\"path\":\"/tmp/epoch-test/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/state/world_state/ArchiveTree\",\"dbVersion\":1,\"rollupAddress\":\"0x11ea6beac329629007a630d53d0a76831d8ed452\"}\n[17:11:27.394] INFO: prover-node:run-failed-epoch World state database public-data-tree set up from snapshot {\"path\":\"/tmp/epoch-test/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/state/world_state/PublicDataTree\",\"dbVersion\":1,\"rollupAddress\":\"0x11ea6beac329629007a630d53d0a76831d8ed452\"}\n[17:11:27.394] INFO: prover-node:run-failed-epoch World state database note-hash-tree set up from snapshot {\"path\":\"/tmp/epoch-test/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/state/world_state/NoteHashTree\",\"dbVersion\":1,\"rollupAddress\":\"0x11ea6beac329629007a630d53d0a76831d8ed452\"}\n[17:11:27.394] INFO: prover-node:run-failed-epoch World state database nullifier-tree set up from snapshot {\"path\":\"/tmp/epoch-test/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/state/world_state/NullifierTree\",\"dbVersion\":1,\"rollupAddress\":\"0x11ea6beac329629007a630d53d0a76831d8ed452\"}\n[17:11:27.395] INFO: prover-node:run-failed-epoch Downloading epoch proving job data from gs://aztec-develop/palla/failed-epochs/aztec-1337-3184683497-0x11ea6beac329629007a630d53d0a76831d8ed452/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/data.bin to /tmp/epoch-test/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/data.bin\n[17:11:28.368] INFO: prover-node:run-failed-epoch Epoch proving job data for epoch 26 downloaded successfully\n[17:11:28.375] INFO: prover-node:run-failed-epoch Download to /tmp/epoch-test/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642 complete\n[17:11:28.375] INFO: prover-node:run-failed-epoch Rerunning proving job from /tmp/epoch-test/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/data.bin with state from /tmp/epoch-test/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/state {\"l2BlockNumber\":104,\"l2BlockHash\":\"0x26f2c7651ab1ff2e787a12cd7003b603f36fbb85f6b56060547a366ab86fdbd9\",\"l1BlockNumber\":219,\"l1ChainId\":1337,\"rollupVersion\":3184683497,\"rollupAddress\":\"0x11ea6beac329629007a630d53d0a76831d8ed452\"}\n[17:11:28.375] INFO: prover-node:run-failed-epoch Loaded proving job data for epoch 26\n[17:11:28.378] INFO: world-state:database Creating world state data store at directory /tmp/epoch-test/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/state/world_state with map size 134217728 KB and 1 threads.\n[17:11:28.389] INFO: archiver:lmdb Creating archiver data store at directory /tmp/epoch-test/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/state/archiver with map size 134217728 KB (LMDB v2)\n[17:11:28.390] INFO: archiver:lmdb Starting data store with maxReaders 16\n[17:11:28.392] WARN: prover-client:proving-broker-database Found invalid epoch directory /tmp/epoch-test/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/state/archiver when loading epoch databases, ignoring\n[17:11:28.392] WARN: prover-client:proving-broker-database Found invalid epoch directory /tmp/epoch-test/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/state/world_state when loading epoch databases, ignoring\n[17:11:28.392] INFO: prover-client:proving-broker Proving Broker started\n[17:11:28.393] INFO: prover-node:run-failed-epoch Rerunning epoch proving job for epoch 26\n[17:11:28.394] WARN: prover-node:epoch-proving-job No L2 block source available, skipping epoch check\n[17:11:28.394] INFO: prover-node:epoch-proving-job Starting epoch 26 proving job with blocks 101 to 104 {\"fromBlock\":101,\"toBlock\":104,\"epochSizeBlocks\":4,\"epochNumber\":26,\"uuid\":\"29459f0f-5fc1-4257-a630-8c95a87a7c8f\"}\n[17:11:28.394] INFO: prover-client:orchestrator Starting epoch 26 with 4 blocks\n[17:11:28.395] INFO: prover-client:orchestrator Starting block 101 for slot 104\n[17:11:28.396] INFO: prover-client:orchestrator Starting block 102 for slot 105\n[17:11:28.397] INFO: prover-client:orchestrator Starting block 103 for slot 106\n[17:11:28.397] INFO: prover-client:orchestrator Starting block 104 for slot 107\n[17:11:28.403] INFO: prover-client:proving-broker New proving job id=26:BASE_PARITY:7b66e84142d309333defc85471e4d242c55ab0b72a716279c7c23e4430c31db1 epochNumber=26 {\"provingJobId\":\"26:BASE_PARITY:7b66e84142d309333defc85471e4d242c55ab0b72a716279c7c23e4430c31db1\"}\n[17:11:28.412] INFO: simulator:public-processor Processed 0 successful txs and 0 failed txs in 0.000034478001296520235s {\"duration\":0.000034478001296520235,\"rate\":0,\"totalPublicGas\":{\"daGas\":0,\"l2Gas\":0},\"totalBlockGas\":{\"daGas\":0,\"l2Gas\":0},\"totalSizeInBytes\":0}\n[17:11:28.412] WARN: prover-client:orchestrator Provided no txs to orchestrator addTxs.\n[17:11:28.414] INFO: simulator:public-processor Processed 0 successful txs and 0 failed txs in 0.000007936999201774598s {\"duration\":0.000007936999201774598,\"rate\":0,\"totalPublicGas\":{\"daGas\":0,\"l2Gas\":0},\"totalBlockGas\":{\"daGas\":0,\"l2Gas\":0},\"totalSizeInBytes\":0}\n[17:11:28.414] WARN: prover-client:orchestrator Provided no txs to orchestrator addTxs.\n[17:11:28.421] INFO: simulator:public-processor Processed 0 successful txs and 0 failed txs in 0.000005669999867677689s {\"duration\":0.000005669999867677689,\"rate\":0,\"totalPublicGas\":{\"daGas\":0,\"l2Gas\":0},\"totalBlockGas\":{\"daGas\":0,\"l2Gas\":0},\"totalSizeInBytes\":0}\n[17:11:28.421] WARN: prover-client:orchestrator Provided no txs to orchestrator addTxs.\n[17:11:28.428] INFO: simulator:public-processor Processed 0 successful txs and 0 failed txs in 0.000005761001259088517s {\"duration\":0.000005761001259088517,\"rate\":0,\"totalPublicGas\":{\"daGas\":0,\"l2Gas\":0},\"totalBlockGas\":{\"daGas\":0,\"l2Gas\":0},\"totalSizeInBytes\":0}\n[17:11:28.428] WARN: prover-client:orchestrator Provided no txs to orchestrator addTxs.\n[17:11:28.454] INFO: prover-client:proving-broker-database Creating broker database for epoch 26 at /tmp/epoch-test/26-20250424185805-8290846f-6a3a-4523-adbd-156db21a2642/state/26 with map size 134217728\n[17:11:28.456] INFO: kv-store:lmdb-v2 Starting data store with maxReaders 16\n[17:11:28.494] INFO: prover-client:proving-agent Starting job id=26:BASE_PARITY:7b66e84142d309333defc85471e4d242c55ab0b72a716279c7c23e4430c31db1 type=BASE_PARITY inputsUri=data:application/json;charset=utf-8,%7B%22type%22%3A9%2C%22input...\n[17:11:28.495] INFO: prover-client:proving-agent:job-controller-05d8627b Job controller started jobId=26:BASE_PARITY:7b66e84142d309333defc85471e4d242c55ab0b72a716279c7c23e4430c31db1 {\"jobId\":\"26:BASE_PARITY:7b66e84142d309333defc85471e4d242c55ab0b72a716279c7c23e4430c31db1\"}\n[17:11:28.530] INFO: prover-client:proving-agent Job id=26:BASE_PARITY:7b66e84142d309333defc85471e4d242c55ab0b72a716279c7c23e4430c31db1 type=BASE_PARITY completed outputUri=data:application/json;charset=utf-8,%7B%22type%22%3A9%2C%22resul...\n[17:11:28.530] INFO: prover-client:proving-broker Proving job complete id=26:BASE_PARITY:7b66e84142d309333defc85471e4d242c55ab0b72a716279c7c23e4430c31db1 type=BASE_PARITY totalAttempts=1 {\"provingJobId\":\"26:BASE_PARITY:7b66e84142d309333defc85471e4d242c55ab0b72a716279c7c23e4430c31db1\"}\n[17:11:29.405] INFO: prover-client:proving-broker New proving job id=26:ROOT_PARITY:79df3b651dec4aadded8c73af550295a575a0f31e8cb1803085b3749374084b3 epochNumber=26 {\"provingJobId\":\"26:ROOT_PARITY:79df3b651dec4aadded8c73af550295a575a0f31e8cb1803085b3749374084b3\"}\n[17:11:29.489] INFO: prover-client:proving-agent Starting job id=26:ROOT_PARITY:79df3b651dec4aadded8c73af550295a575a0f31e8cb1803085b3749374084b3 type=ROOT_PARITY inputsUri=data:application/json;charset=utf-8,%7B%22type%22%3A10%2C%22inpu...\n[17:11:29.498] INFO: prover-client:proving-agent:job-controller-12df7151 Job controller started jobId=26:ROOT_PARITY:79df3b651dec4aadded8c73af550295a575a0f31e8cb1803085b3749374084b3 {\"jobId\":\"26:ROOT_PARITY:79df3b651dec4aadded8c73af550295a575a0f31e8cb1803085b3749374084b3\"}\n[17:11:29.542] INFO: prover-client:proving-agent Job id=26:ROOT_PARITY:79df3b651dec4aadded8c73af550295a575a0f31e8cb1803085b3749374084b3 type=ROOT_PARITY completed outputUri=data:application/json;charset=utf-8,%7B%22type%22%3A10%2C%22resu...\n[17:11:29.542] INFO: prover-client:proving-broker Proving job complete id=26:ROOT_PARITY:79df3b651dec4aadded8c73af550295a575a0f31e8cb1803085b3749374084b3 type=ROOT_PARITY totalAttempts=1 {\"provingJobId\":\"26:ROOT_PARITY:79df3b651dec4aadded8c73af550295a575a0f31e8cb1803085b3749374084b3\"}\n[17:11:30.397] INFO: prover-client:proving-broker New proving job id=26:EMPTY_BLOCK_ROOT_ROLLUP:addf992ccad2fbdb518ef246e0ae772f1f6fc0561309a5a654eaba268e8ea453 epochNumber=26 {\"provingJobId\":\"26:EMPTY_BLOCK_ROOT_ROLLUP:addf992ccad2fbdb518ef246e0ae772f1f6fc0561309a5a654eaba268e8ea453\"}\n[17:11:30.399] INFO: prover-client:proving-broker New proving job id=26:EMPTY_BLOCK_ROOT_ROLLUP:24a57be82ef0668fcb2e9717246e1acf72404f818326d62891170ada648965a4 epochNumber=26 {\"provingJobId\":\"26:EMPTY_BLOCK_ROOT_ROLLUP:24a57be82ef0668fcb2e9717246e1acf72404f818326d62891170ada648965a4\"}\n[17:11:30.400] INFO: prover-client:proving-broker New proving job id=26:EMPTY_BLOCK_ROOT_ROLLUP:9f47be45839c0a5192ff3a564c692d2005be651e66c8b05ad24a03946159a175 epochNumber=26 {\"provingJobId\":\"26:EMPTY_BLOCK_ROOT_ROLLUP:9f47be45839c0a5192ff3a564c692d2005be651e66c8b05ad24a03946159a175\"}\n[17:11:30.401] INFO: prover-client:proving-broker New proving job id=26:EMPTY_BLOCK_ROOT_ROLLUP:01801b76914f2b1c15fb9e253396bbb19d371c6851b317fd19d8dfcb33f27d7d epochNumber=26 {\"provingJobId\":\"26:EMPTY_BLOCK_ROOT_ROLLUP:01801b76914f2b1c15fb9e253396bbb19d371c6851b317fd19d8dfcb33f27d7d\"}\n[17:11:30.505] INFO: prover-client:proving-agent Starting job id=26:EMPTY_BLOCK_ROOT_ROLLUP:addf992ccad2fbdb518ef246e0ae772f1f6fc0561309a5a654eaba268e8ea453 type=EMPTY_BLOCK_ROOT_ROLLUP inputsUri=data:application/json;charset=utf-8,%7B%22type%22%3A4%2C%22input...\n[17:11:30.509] INFO: prover-client:proving-agent:job-controller-def82bf7 Job controller started jobId=26:EMPTY_BLOCK_ROOT_ROLLUP:addf992ccad2fbdb518ef246e0ae772f1f6fc0561309a5a654eaba268e8ea453 {\"jobId\":\"26:EMPTY_BLOCK_ROOT_ROLLUP:addf992ccad2fbdb518ef246e0ae772f1f6fc0561309a5a654eaba268e8ea453\"}\n[17:11:30.538] INFO: prover-client:proving-agent Job id=26:EMPTY_BLOCK_ROOT_ROLLUP:addf992ccad2fbdb518ef246e0ae772f1f6fc0561309a5a654eaba268e8ea453 type=EMPTY_BLOCK_ROOT_ROLLUP completed outputUri=data:application/json;charset=utf-8,%7B%22type%22%3A4%2C%22resul...\n[17:11:30.538] INFO: prover-client:proving-broker Proving job complete id=26:EMPTY_BLOCK_ROOT_ROLLUP:addf992ccad2fbdb518ef246e0ae772f1f6fc0561309a5a654eaba268e8ea453 type=EMPTY_BLOCK_ROOT_ROLLUP totalAttempts=1 {\"provingJobId\":\"26:EMPTY_BLOCK_ROOT_ROLLUP:addf992ccad2fbdb518ef246e0ae772f1f6fc0561309a5a654eaba268e8ea453\"}\n[17:11:30.591] INFO: prover-client:proving-agent Starting job id=26:EMPTY_BLOCK_ROOT_ROLLUP:24a57be82ef0668fcb2e9717246e1acf72404f818326d62891170ada648965a4 type=EMPTY_BLOCK_ROOT_ROLLUP inputsUri=data:application/json;charset=utf-8,%7B%22type%22%3A4%2C%22input...\n[17:11:30.594] INFO: prover-client:proving-agent:job-controller-271ca88f Job controller started jobId=26:EMPTY_BLOCK_ROOT_ROLLUP:24a57be82ef0668fcb2e9717246e1acf72404f818326d62891170ada648965a4 {\"jobId\":\"26:EMPTY_BLOCK_ROOT_ROLLUP:24a57be82ef0668fcb2e9717246e1acf72404f818326d62891170ada648965a4\"}\n[17:11:30.619] INFO: prover-client:proving-agent Job id=26:EMPTY_BLOCK_ROOT_ROLLUP:24a57be82ef0668fcb2e9717246e1acf72404f818326d62891170ada648965a4 type=EMPTY_BLOCK_ROOT_ROLLUP completed outputUri=data:application/json;charset=utf-8,%7B%22type%22%3A4%2C%22resul...\n[17:11:30.619] INFO: prover-client:proving-broker Proving job complete id=26:EMPTY_BLOCK_ROOT_ROLLUP:24a57be82ef0668fcb2e9717246e1acf72404f818326d62891170ada648965a4 type=EMPTY_BLOCK_ROOT_ROLLUP totalAttempts=1 {\"provingJobId\":\"26:EMPTY_BLOCK_ROOT_ROLLUP:24a57be82ef0668fcb2e9717246e1acf72404f818326d62891170ada648965a4\"}\n[17:11:30.672] INFO: prover-client:proving-agent Starting job id=26:EMPTY_BLOCK_ROOT_ROLLUP:9f47be45839c0a5192ff3a564c692d2005be651e66c8b05ad24a03946159a175 type=EMPTY_BLOCK_ROOT_ROLLUP inputsUri=data:application/json;charset=utf-8,%7B%22type%22%3A4%2C%22input...\n[17:11:30.674] INFO: prover-client:proving-agent:job-controller-feb02ad8 Job controller started jobId=26:EMPTY_BLOCK_ROOT_ROLLUP:9f47be45839c0a5192ff3a564c692d2005be651e66c8b05ad24a03946159a175 {\"jobId\":\"26:EMPTY_BLOCK_ROOT_ROLLUP:9f47be45839c0a5192ff3a564c692d2005be651e66c8b05ad24a03946159a175\"}\n[17:11:30.699] INFO: prover-client:proving-agent Job id=26:EMPTY_BLOCK_ROOT_ROLLUP:9f47be45839c0a5192ff3a564c692d2005be651e66c8b05ad24a03946159a175 type=EMPTY_BLOCK_ROOT_ROLLUP completed outputUri=data:application/json;charset=utf-8,%7B%22type%22%3A4%2C%22resul...\n[17:11:30.699] INFO: prover-client:proving-broker Proving job complete id=26:EMPTY_BLOCK_ROOT_ROLLUP:9f47be45839c0a5192ff3a564c692d2005be651e66c8b05ad24a03946159a175 type=EMPTY_BLOCK_ROOT_ROLLUP totalAttempts=1 {\"provingJobId\":\"26:EMPTY_BLOCK_ROOT_ROLLUP:9f47be45839c0a5192ff3a564c692d2005be651e66c8b05ad24a03946159a175\"}\n[17:11:30.753] INFO: prover-client:proving-agent Starting job id=26:EMPTY_BLOCK_ROOT_ROLLUP:01801b76914f2b1c15fb9e253396bbb19d371c6851b317fd19d8dfcb33f27d7d type=EMPTY_BLOCK_ROOT_ROLLUP inputsUri=data:application/json;charset=utf-8,%7B%22type%22%3A4%2C%22input...\n[17:11:30.755] INFO: prover-client:proving-agent:job-controller-41cdfcfc Job controller started jobId=26:EMPTY_BLOCK_ROOT_ROLLUP:01801b76914f2b1c15fb9e253396bbb19d371c6851b317fd19d8dfcb33f27d7d {\"jobId\":\"26:EMPTY_BLOCK_ROOT_ROLLUP:01801b76914f2b1c15fb9e253396bbb19d371c6851b317fd19d8dfcb33f27d7d\"}\n[17:11:30.781] INFO: prover-client:proving-agent Job id=26:EMPTY_BLOCK_ROOT_ROLLUP:01801b76914f2b1c15fb9e253396bbb19d371c6851b317fd19d8dfcb33f27d7d type=EMPTY_BLOCK_ROOT_ROLLUP completed outputUri=data:application/json;charset=utf-8,%7B%22type%22%3A4%2C%22resul...\n[17:11:30.781] INFO: prover-client:proving-broker Proving job complete id=26:EMPTY_BLOCK_ROOT_ROLLUP:01801b76914f2b1c15fb9e253396bbb19d371c6851b317fd19d8dfcb33f27d7d type=EMPTY_BLOCK_ROOT_ROLLUP totalAttempts=1 {\"provingJobId\":\"26:EMPTY_BLOCK_ROOT_ROLLUP:01801b76914f2b1c15fb9e253396bbb19d371c6851b317fd19d8dfcb33f27d7d\"}\n[17:11:31.407] INFO: prover-client:proving-broker New proving job id=26:BLOCK_MERGE_ROLLUP:eaa676140725197c2567e551b420811775e1577b71a8cc48da71815168749b60 epochNumber=26 {\"provingJobId\":\"26:BLOCK_MERGE_ROLLUP:eaa676140725197c2567e551b420811775e1577b71a8cc48da71815168749b60\"}\n[17:11:31.412] INFO: prover-client:proving-broker New proving job id=26:BLOCK_MERGE_ROLLUP:8848eeffa964c9bba3ad837806f4b9b441dc88b7d23341d3b684174415479ea4 epochNumber=26 {\"provingJobId\":\"26:BLOCK_MERGE_ROLLUP:8848eeffa964c9bba3ad837806f4b9b441dc88b7d23341d3b684174415479ea4\"}\n[17:11:31.539] INFO: prover-client:proving-agent Starting job id=26:BLOCK_MERGE_ROLLUP:eaa676140725197c2567e551b420811775e1577b71a8cc48da71815168749b60 type=BLOCK_MERGE_ROLLUP inputsUri=data:application/json;charset=utf-8,%7B%22type%22%3A7%2C%22input...\n[17:11:31.555] INFO: prover-client:proving-agent:job-controller-052bf782 Job controller started jobId=26:BLOCK_MERGE_ROLLUP:eaa676140725197c2567e551b420811775e1577b71a8cc48da71815168749b60 {\"jobId\":\"26:BLOCK_MERGE_ROLLUP:eaa676140725197c2567e551b420811775e1577b71a8cc48da71815168749b60\"}\n[17:11:31.626] INFO: prover-client:proving-agent Job id=26:BLOCK_MERGE_ROLLUP:eaa676140725197c2567e551b420811775e1577b71a8cc48da71815168749b60 type=BLOCK_MERGE_ROLLUP completed outputUri=data:application/json;charset=utf-8,%7B%22type%22%3A7%2C%22resul...\n[17:11:31.626] INFO: prover-client:proving-broker Proving job complete id=26:BLOCK_MERGE_ROLLUP:eaa676140725197c2567e551b420811775e1577b71a8cc48da71815168749b60 type=BLOCK_MERGE_ROLLUP totalAttempts=1 {\"provingJobId\":\"26:BLOCK_MERGE_ROLLUP:eaa676140725197c2567e551b420811775e1577b71a8cc48da71815168749b60\"}\n[17:11:31.687] INFO: prover-client:proving-agent Starting job id=26:BLOCK_MERGE_ROLLUP:8848eeffa964c9bba3ad837806f4b9b441dc88b7d23341d3b684174415479ea4 type=BLOCK_MERGE_ROLLUP inputsUri=data:application/json;charset=utf-8,%7B%22type%22%3A7%2C%22input...\n[17:11:31.699] INFO: prover-client:proving-agent:job-controller-dbd72897 Job controller started jobId=26:BLOCK_MERGE_ROLLUP:8848eeffa964c9bba3ad837806f4b9b441dc88b7d23341d3b684174415479ea4 {\"jobId\":\"26:BLOCK_MERGE_ROLLUP:8848eeffa964c9bba3ad837806f4b9b441dc88b7d23341d3b684174415479ea4\"}\n[17:11:31.767] INFO: prover-client:proving-agent Job id=26:BLOCK_MERGE_ROLLUP:8848eeffa964c9bba3ad837806f4b9b441dc88b7d23341d3b684174415479ea4 type=BLOCK_MERGE_ROLLUP completed outputUri=data:application/json;charset=utf-8,%7B%22type%22%3A7%2C%22resul...\n[17:11:31.767] INFO: prover-client:proving-broker Proving job complete id=26:BLOCK_MERGE_ROLLUP:8848eeffa964c9bba3ad837806f4b9b441dc88b7d23341d3b684174415479ea4 type=BLOCK_MERGE_ROLLUP totalAttempts=1 {\"provingJobId\":\"26:BLOCK_MERGE_ROLLUP:8848eeffa964c9bba3ad837806f4b9b441dc88b7d23341d3b684174415479ea4\"}\n[17:11:32.406] INFO: prover-client:proving-broker New proving job id=26:ROOT_ROLLUP:48d24e60f54518fdf4cc9f352ae967d14a6dbc2824d931510eccff48ea57140c epochNumber=26 {\"provingJobId\":\"26:ROOT_ROLLUP:48d24e60f54518fdf4cc9f352ae967d14a6dbc2824d931510eccff48ea57140c\"}\n[17:11:32.532] INFO: prover-client:proving-agent Starting job id=26:ROOT_ROLLUP:48d24e60f54518fdf4cc9f352ae967d14a6dbc2824d931510eccff48ea57140c type=ROOT_ROLLUP inputsUri=data:application/json;charset=utf-8,%7B%22type%22%3A8%2C%22input...\n[17:11:32.544] INFO: prover-client:proving-agent:job-controller-79d49f12 Job controller started jobId=26:ROOT_ROLLUP:48d24e60f54518fdf4cc9f352ae967d14a6dbc2824d931510eccff48ea57140c {\"jobId\":\"26:ROOT_ROLLUP:48d24e60f54518fdf4cc9f352ae967d14a6dbc2824d931510eccff48ea57140c\"}\n[17:11:32.609] INFO: prover-client:proving-agent Job id=26:ROOT_ROLLUP:48d24e60f54518fdf4cc9f352ae967d14a6dbc2824d931510eccff48ea57140c type=ROOT_ROLLUP completed outputUri=data:application/json;charset=utf-8,%7B%22type%22%3A8%2C%22resul...\n[17:11:32.609] INFO: prover-client:proving-broker Proving job complete id=26:ROOT_ROLLUP:48d24e60f54518fdf4cc9f352ae967d14a6dbc2824d931510eccff48ea57140c type=ROOT_ROLLUP totalAttempts=1 {\"provingJobId\":\"26:ROOT_ROLLUP:48d24e60f54518fdf4cc9f352ae967d14a6dbc2824d931510eccff48ea57140c\"}\nEpoch proving job complete with result completed\n[17:11:33.403] INFO: prover-node:epoch-proving-job Finalised proof for epoch 26 {\"epochNumber\":26,\"uuid\":\"29459f0f-5fc1-4257-a630-8c95a87a7c8f\",\"duration\":5009.350722000003}\n[17:11:33.403] INFO: prover-node:epoch-proving-job Submitted proof for epoch 26 (blocks 101 to 104) {\"epochNumber\":26,\"uuid\":\"29459f0f-5fc1-4257-a630-8c95a87a7c8f\"}\n[17:11:33.403] INFO: prover-node:run-failed-epoch Completed job for epoch 26 with status completed\n```",
          "timestamp": "2025-04-25T12:13:15Z",
          "tree_id": "7912a959748b90b3b1591753ad38b29fe61c0f82",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/fb7f80f9a1db7f6e71e0e63a10d6458d396e90f2"
        },
        "date": 1745587655830,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8195,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23462293044978624,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 137142,
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
          "id": "17207b44bcb762ee9c7dcbf84f3744f38f64eb69",
          "message": "feat: Expose bot address in API (#13842)\n\nAdds a `getInfo` method to the bot api to get its address.\n\nRelated to #13788",
          "timestamp": "2025-04-25T14:52:46Z",
          "tree_id": "5408d741fc7a911bf558e79669b51e918ee85e24",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/17207b44bcb762ee9c7dcbf84f3744f38f64eb69"
        },
        "date": 1745597082505,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8215,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23518725962392145,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 145144,
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
          "id": "40a976288c08995273f2089d8b30031ab752b656",
          "message": "chore: use L1 TX utils for L1 validator CLI actions (#13838)\n\nuse l1 tx utils to capture ABI errors on the CLI",
          "timestamp": "2025-04-25T15:03:51Z",
          "tree_id": "e43fd4800c35d85f3f0f64b23bb6b37dc3ef7ad2",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/40a976288c08995273f2089d8b30031ab752b656"
        },
        "date": 1745598513012,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8092,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23167846180328786,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 158263,
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
          "id": "7d7990e1c18b0fe3762367e61cf11f057fb3247d",
          "message": "feat: constrain call (#13758)\n\nBegin constraining call. Limited PIL relations since we are still\nmissing the infrastructure for transaction trace.\n\n### PIL relations\nAdd context switching relations to either propagate context state during\nexecution and updating context on `CALL`\n\n### Simulation\n- Updated the `call` operation in `Execution` to handle additional\nparameters for L2 and DA gas offsets. These values and contract address\nare assigned to their respective execution registers.\n- New getter for `next_context_id` to populate field execution event (we\nneed this while we aren't using `clk` for context id)\n\n### Context Serialization and Event Updates:\n- `ContextEvent` includes `parent_id` and `next_pc` fields (we'll need\nthis for JUMP commands as well).\n- Modified `serialize_context_event` methods in `EnqueuedCallContext`\nand `NestedContext` to populate new fields like `parent_id` and\n`next_pc`.\n\n### Testing:\n* There are updated constraining, simulation and tracegen tests",
          "timestamp": "2025-04-25T15:10:52Z",
          "tree_id": "37f77328e1aeb813f6def929eaabb6a532e68708",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7d7990e1c18b0fe3762367e61cf11f057fb3247d"
        },
        "date": 1745599699457,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8247,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23609578783865875,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 149331,
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
          "id": "da8041adf837db13e4bcc95d7a9b11edc41b2d52",
          "message": "chore(bb): avoid use of brackets in RefArray/Vector (#13835)\n\nThe use of brackets in Ref{Array,Vector} was the main driver of bracket\ndepth.\n\nThere are still other uses of brackets to apply stuff to tuples, but\ntheir length seems to be much smaller.",
          "timestamp": "2025-04-25T16:07:45Z",
          "tree_id": "8952b0015b2a25e5e5ee3b44ce910f995411188c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/da8041adf837db13e4bcc95d7a9b11edc41b2d52"
        },
        "date": 1745602435099,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8499,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.24332628984832985,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 142525,
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
          "id": "f1b7f745491c65d68921b1bd0a905bda59ca17fe",
          "message": "chore: report size of other stores on disk (#13829)\n\nCloses https://github.com/AztecProtocol/aztec-packages/issues/13738\n\nReports the physical disk size of all of stores used by aztec LMDBs.",
          "timestamp": "2025-04-25T16:18:14Z",
          "tree_id": "7b53a004e6db848f3157b206574a25c2e6e4d663",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f1b7f745491c65d68921b1bd0a905bda59ca17fe"
        },
        "date": 1745603974577,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8170,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2338981584028498,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 138671,
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
          "id": "78cf374e96b8d87a0815123106c2fa9cfcc39104",
          "message": "chore: Enable snapshot sync e2e test (#13841)\n\nFixes #13840\n\nCo-authored-by: Tom French <15848336+TomAFrench@users.noreply.github.com>",
          "timestamp": "2025-04-25T16:57:37Z",
          "tree_id": "60ee804e51be07a498c5d076287f2898aa52c212",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/78cf374e96b8d87a0815123106c2fa9cfcc39104"
        },
        "date": 1745606452583,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8166,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2337751840161361,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 143363,
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
          "id": "2810ccd89e9212191339b8a01c5981673215df7b",
          "message": "chore: Configure prover coordination in K8s (#13849)\n\nThis PR contains configuration to use full nodes for prover\ncoordination.",
          "timestamp": "2025-04-25T17:05:19Z",
          "tree_id": "9376706887ac253bb4b4bec25336f842df5a9fde",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/2810ccd89e9212191339b8a01c5981673215df7b"
        },
        "date": 1745606461444,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8505,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.24347831168243025,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 153656,
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
          "id": "429a53b8ad85c739b19a58bb3d8e4a6ab55d6159",
          "message": "chore: hook new benchmarks (#13832)\n\nTesting it out before adding more metrics",
          "timestamp": "2025-04-25T18:46:38Z",
          "tree_id": "3d930748b0c1751fd100691091cec087e1c8d66a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/429a53b8ad85c739b19a58bb3d8e4a6ab55d6159"
        },
        "date": 1745610421704,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8673,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2483064876774181,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 159487,
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
          "id": "095b032ea6cea72cfdd78e05f8badff9158a78fd",
          "message": "chore: provide hash function in `noir-protocol-circuits` (#13857)\n\nThis fixes `./ci.sh gh-bench` as it's trying to call the `hash` function\nwithin `noir-protocol-circuits` which doesn't exist.\n\n---------\n\nCo-authored-by: AztecBot <tech@aztecprotocol.com>",
          "timestamp": "2025-04-25T21:40:34Z",
          "tree_id": "435dea1ef73ba571f1b125f79f706a82621562ab",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/095b032ea6cea72cfdd78e05f8badff9158a78fd"
        },
        "date": 1745620991104,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8354,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2391612709890921,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 151403,
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
          "id": "807b03d09f8effc2553ab7228ec716c44b0f9452",
          "message": "feat: new assert functionality for bb (#13854)\n\nI thought our asserts could use more helpful information to aid\ndebugging time.\n\nExample:\n```\nBB_ASSERT_GT(1, 1, \"false\");\n``` \nproduces:\n```\nAssertion failed: (1 > 1)\n  Left   : 1\n  Right  : 1\n  Reason : false\n```",
          "timestamp": "2025-04-26T00:37:23Z",
          "tree_id": "34214f56bcfd1d375460548c478a9842dd33df17",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/807b03d09f8effc2553ab7228ec716c44b0f9452"
        },
        "date": 1745632806292,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8303,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23770630530237194,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 141928,
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
          "id": "4c9da5b8b495cb6c60916fd4a8a7625776d07d2d",
          "message": "git subrepo push --branch=master noir-projects/aztec-nr\n\nsubrepo:\n  subdir:   \"noir-projects/aztec-nr\"\n  merged:   \"e25e53b26e\"\nupstream:\n  origin:   \"https://github.com/AztecProtocol/aztec-nr\"\n  branch:   \"master\"\n  commit:   \"e25e53b26e\"\ngit-subrepo:\n  version:  \"0.4.6\"\n  origin:   \"???\"\n  commit:   \"???\"",
          "timestamp": "2025-04-26T02:29:29Z",
          "tree_id": "d33df4d74b923f81ada5cee6282530ef1b54186b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/4c9da5b8b495cb6c60916fd4a8a7625776d07d2d"
        },
        "date": 1745636832547,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8348,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2389852304737715,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 141020,
            "unit": "us"
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
          "id": "a1f94c3a1c244834601e3048953cad9047c69835",
          "message": "fix: constrain proposed block header (#13693)\n\nhttps://github.com/AztecProtocol/aztec-packages/issues/12928",
          "timestamp": "2025-04-27T10:17:45Z",
          "tree_id": "4799da36a80154e1074c65667dd6b5a7d18f3968",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a1f94c3a1c244834601e3048953cad9047c69835"
        },
        "date": 1745752569718,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8297,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2375384366882866,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 147128,
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
          "distinct": false,
          "id": "6e3e494a1698d07145ff5abea0ea951889d118f0",
          "message": "chore: bump noir commit (#13930)\n\nThis should address #13921\n\nCo-authored-by: AztecBot <tech@aztecprotocol.com>",
          "timestamp": "2025-04-29T16:44:09Z",
          "tree_id": "30df15a0eed2dc830783c1569bc65f155cf6b393",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/6e3e494a1698d07145ff5abea0ea951889d118f0"
        },
        "date": 1745948399380,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8457,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.24211263612480324,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 147297,
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
          "id": "7250d7b50058dfb13fbc6e82b0ad656e40932095",
          "message": "chore: make private state variables take a single slot, remove special-casin… (#13859)\n\nInstead of special-casing notes to use a single slot, now private state\nvariables simply allocate just one. This means that notes can be stored\nin public correctly (which is a bit weird but w/e - at least they won't\nwreck the layout).\n\n---------\n\nCo-authored-by: Jan Beneš <janbenes1234@gmail.com>",
          "timestamp": "2025-04-29T18:59:36Z",
          "tree_id": "22d7d912a4b2284b3421239585827571418da2f8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7250d7b50058dfb13fbc6e82b0ad656e40932095"
        },
        "date": 1745956189044,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8291,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23735080425133268,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 144297,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "michaeljklein@users.noreply.github.com",
            "name": "Michael J Klein",
            "username": "michaeljklein"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": false,
          "id": "d5d2d140ed85c86703c8a2563ad44e901cec1cc6",
          "message": "chore: enable --pedantic-solving for all tests with nargo (#11224)\n\nThis PR is a continuation of [this PR in\nNoir](https://github.com/noir-lang/noir/pull/6716) which enables\n`--pedantic-solving` in all tests that use `nargo`, including some I\nmissed in `noir`.\n\n---------\n\nCo-authored-by: Tom French <15848336+TomAFrench@users.noreply.github.com>",
          "timestamp": "2025-04-29T19:21:29Z",
          "tree_id": "233d1a1ea02d7779108b6111558dc4611fadfd52",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d5d2d140ed85c86703c8a2563ad44e901cec1cc6"
        },
        "date": 1745957354407,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8408,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.24071235451345294,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 141047,
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
      }
    ]
  }
}