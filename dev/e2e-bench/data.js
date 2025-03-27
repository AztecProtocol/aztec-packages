window.BENCHMARK_DATA = {
  "lastUpdate": 1743102386179,
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
            "email": "5764343+charlielye@users.noreply.github.com",
            "name": "Charlie Lye",
            "username": "charlielye"
          },
          "distinct": true,
          "id": "3933b35bcf92f20c32dfd742d01c3caaf7ad977f",
          "message": "fix: yolo txe binds just to localhost by default.",
          "timestamp": "2025-03-22T19:11:58Z",
          "tree_id": "c917dc69dc265ae758cde5692d8f0692512851f9",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/3933b35bcf92f20c32dfd742d01c3caaf7ad977f"
        },
        "date": 1742672130324,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9843,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2503157733480786,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 148031,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "aakoshh@gmail.com",
            "name": "Akosh Farkash",
            "username": "aakoshh"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "7843a6714547a71c64274830ebb6176d78dbb890",
          "message": "chore: Change `/bin/bash` shebang to be env based (#12834)\n\nChanges `#!/bin/bash` in scripts into `#!/usr/bin/env bash`, to be more\ncross platform.\n\n### Why?\n\nI was just trying to test initialising `noir-repo` on my Mac, because I\nwanted to avoid having to delete it on the mainframe, however the\nversion of `bash` shipped with MacOS is 3.2, and it doesn't have all the\noptions that the `ci3` scripts assume, which caused failures. I have the\nlatest `bash` installed via Homebrew, but the scripts are coded to use\nthe one in `/bin`, which is the old version and cannot be updated.\n\n```console\n$ hash=$(./noir/bootstrap.sh hash)\n/Users/aakoshh/Work/aztec/aztec-packages/ci3/source_options: line 9: shopt: globstar: invalid shell option name\n$ shopt\n...\nglobskipdots   \ton\nglobstar       \toff\ngnu_errfmt     \toff\n...\n$ echo $SHELL\n/opt/homebrew/bin/bash\n$ /bin/bash --version\nGNU bash, version 3.2.57(1)-release (arm64-apple-darwin24)\nCopyright (C) 2007 Free Software Foundation, Inc.\n$ /opt/homebrew/bin/bash --version\nGNU bash, version 5.2.37(1)-release (aarch64-apple-darwin24.0.0)\n$ /bin/bash\n$ shopt\n...\nforce_fignore  \ton\ngnu_errfmt     \toff\nhistappend     \toff\n...\n```",
          "timestamp": "2025-03-22T22:36:09Z",
          "tree_id": "cdd738af86bfece376a20ac399eedd13061319f1",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7843a6714547a71c64274830ebb6176d78dbb890"
        },
        "date": 1742685237156,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9303,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23659578414704144,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 142725,
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
          "id": "18bcc1b1777650d6249e2cdc824ed8acbe39c506",
          "message": "refactor: remove selector from public call request (#12828)\n\n- Remove `function_selector` from `PublicCallRequest` as it is no longer\nused.\n- Remove `public_functions` from `ContractClass`.\n- `ContractClass` checks that there's at most 1 public function in the\nartifact.\n- Rename `args` to `calldata` when it's public calldata that includes\nthe function selector.\n- Use different generator indexes for calldata and regular args.\n\n### aztec-nr\n- Rename oracle calls `enqueue_public_function_call_internal ` to\n`notify_enqueued_public_function_call `, and\n`set_public_teardown_function_call_internal` to\n`notify_set_public_teardown_function_call `, to be consistent with other\noracle calls.\n- Storing data to execution cache will need to provide the hash in\naddition to the preimage, making it possible to use it for different\ntypes of data. Currently it's used for calldata and args.\n\n### node\n- Rename `getContractFunctionName` to `getDebugFunctionName`, as the\nfunction name won't always be available. It's set by explicitly calling\n`registerContractFunctionSignatures` for debugging purpose.\n- Remove `ExecutionRequest[]` in `Tx` and replace it with `calldata[]`.\nWe now loop through the `publicCallRequests` in the public inputs and\npair each with an entry in `calldata[]`.\n- `DataValidator` checks that calldata are provided for all the\nnon-empty public call requests, and the hash is correct.",
          "timestamp": "2025-03-23T13:50:19Z",
          "tree_id": "da67f601d8c18deba44229b7133b3a9d7a20a73f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/18bcc1b1777650d6249e2cdc824ed8acbe39c506"
        },
        "date": 1742740221184,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9294,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23636694550087337,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 143174,
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
          "id": "75c1549dd325cd42da22e407de8971c909050561",
          "message": "chore: Set default proving config to true (#12964)\n\nUp until now our configurations have generally defaulted to swtiching\noff proving. This is desirable for e2e tests and the sandbox etc. I\nthink we are at the point where the default should be switched on and\nthe user has to make a decision to switch it off.",
          "timestamp": "2025-03-23T16:17:51Z",
          "tree_id": "34e5b52c6f1215c400e36bf32de7b35881c85b5f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/75c1549dd325cd42da22e407de8971c909050561"
        },
        "date": 1742748521159,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9250,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23525005669526367,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 134222,
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
          "distinct": true,
          "id": "1a37d6d4c5f4470fa87bd5bd3934e23ce0a9fb10",
          "message": "chore: deflake the kind smoke test (#12955)\n\nSmoke test runs in just under 5 minutes in ci now (just under 3 minutes\nlocally).\nIt has ran through the deflaker (locally) 100 times with no error; i.e.\n\n```\n./yarn-project/end-to-end/scripts/deflaker.sh ./spartan/bootstrap.sh test-kind-smoke\n```\n\nHowever, it did flake when I was running it on mainframe, so updating\nmyself to receive slack notifications.\n\nSee [passing CI run](http://ci.aztec-labs.com/5ffc13f772a79c68)\n\nchanges:\n- have the pxe and bot just connect to the boot node\n- retain the setup l2 contracts job if it fails\n- make the 1-validators yaml lighter/faster\n- use 1-validators in the smoke test in CI\n- fix the kubectl await to only await the pxe\n- make the deflaker support bootstrap scripts\n\nFix #11177",
          "timestamp": "2025-03-23T14:40:39-04:00",
          "tree_id": "370aae2582cceb57e889c939284ddc574d7c6e4d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1a37d6d4c5f4470fa87bd5bd3934e23ce0a9fb10"
        },
        "date": 1742756816897,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9256,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2354052843307416,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 131680,
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
          "id": "49d6bfadb0584e7d5238a319540e2b28255fb688",
          "message": "fix: increased poseidon gates (#12973)\n\nAfter this: https://github.com/AztecProtocol/aztec-packages/pull/12061\nwe were overflowing the trace on contract class registrations. This was\nnot caught by tests due to:\n\n- Insufficient tests with full proving (and the ones we have deploy\nwithout proving!)\n- Insufficient WASM testing: this overflow caused the overflowing trace\nto go over 4GB",
          "timestamp": "2025-03-24T12:11:33+01:00",
          "tree_id": "9cf42eebcbf4d5f2a92b189fd26776e6b180c534",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/49d6bfadb0584e7d5238a319540e2b28255fb688"
        },
        "date": 1742815249246,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9149,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23266960450820626,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 130863,
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
          "id": "5a256c8abaeb65a1fdc47eb674ae19819a795d48",
          "message": "chore: Fix for e2e gossip network test (#12954)",
          "timestamp": "2025-03-24T11:46:28Z",
          "tree_id": "7ec30bc2d4f67e00b8bc288c5f7d7a02ebef1e6d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5a256c8abaeb65a1fdc47eb674ae19819a795d48"
        },
        "date": 1742818710745,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9201,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23400308135257525,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 132673,
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
          "id": "1e796e2d1cc293010942b85165aa04c8b3ab31b3",
          "message": "chore: Bump Noir reference (#12958)\n\nAutomated pull of nightly from the\n[noir](https://github.com/noir-lang/noir) programming language, a\ndependency of Aztec.\nBEGIN_COMMIT_OVERRIDE\nchore: remove duplication on library list files\n(https://github.com/noir-lang/noir/pull/7774)\nchore: bump bb to 0.82.0 (https://github.com/noir-lang/noir/pull/7777)\nfeat: optimize unconstrained `embedded_curve_add`\n(https://github.com/noir-lang/noir/pull/7751)\nEND_COMMIT_OVERRIDE\n\n---------\n\nCo-authored-by: AztecBot <tech@aztecprotocol.com>\nCo-authored-by: Tom French <15848336+TomAFrench@users.noreply.github.com>",
          "timestamp": "2025-03-24T12:11:32Z",
          "tree_id": "57061c001e9e1add1f3cc71c979ef2423b4e6a86",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1e796e2d1cc293010942b85165aa04c8b3ab31b3"
        },
        "date": 1742819935890,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9146,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2325898366614613,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 139257,
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
          "id": "33e528f15947eef5697f2b70d7f510b5ba6b60fa",
          "message": "feat: translator zk relation adjustments testing (#12718)\n\nThis PR changes DeltaRangeConstraint and Permutation relation in\nTranslator to operate correctly in the presence of masking data at the\nend of the polynomials as well as unit tests to establish correctness of\nthe changes given masking is not yet full enabled in Translator.",
          "timestamp": "2025-03-24T12:35:09Z",
          "tree_id": "c26431db9a5376c3059f3c292645c306fe11be29",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/33e528f15947eef5697f2b70d7f510b5ba6b60fa"
        },
        "date": 1742821401551,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9276,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23589890693882481,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 135092,
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
          "id": "a85f5305d491e61bb0df159c31a08bf52e2534dc",
          "message": "fix: sponsored fpc arg parsed correctly (#12976) (#12977)\n\nResyncing master after hotfix for alpha-testnet. Holding for release\n0.82.2 to go in !\n\nCo-authored-by: sklppy88 <esau@aztecprotocol.com>",
          "timestamp": "2025-03-24T14:22:44+01:00",
          "tree_id": "c89fe9c6a93cbbbbfb0f71c913853684e78bb142",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a85f5305d491e61bb0df159c31a08bf52e2534dc"
        },
        "date": 1742824274500,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9222,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23453868234761024,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 133036,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "james.zaki@proton.me",
            "name": "James Zaki",
            "username": "jzaki"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "4a0fd588d46617eec8ded7a1bccf746401d8c3a4",
          "message": "docs: Add fees to cli reference (#12884)\n\nCo-authored-by: josh crites <critesjosh@gmail.com>\nCo-authored-by: Josh Crites <jc@joshcrites.com>",
          "timestamp": "2025-03-24T21:32:10Z",
          "tree_id": "49d02ab7d68f5627cedb0c6a8ef58f7d4b5a16f6",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/4a0fd588d46617eec8ded7a1bccf746401d8c3a4"
        },
        "date": 1742853520021,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8560,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.21770219254409176,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 110068,
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
          "id": "e2b1361f73ddcb582275cb9f9bb8100a94bbc9c7",
          "message": "feat(avm): vm2 initial context (#12972)\n\nThis adds the initial work for `context` and `context_stack` to vm2. The\ninterfaces will still need to be updated in the future, but it sets up\nthe points where the context events will happen (i.e. at the end of the\nmain execution loop and within `call`).\n\nThis also outlines the contents of the two events albeit commented out\nfor now (until we have the supported inputs in the context itself)",
          "timestamp": "2025-03-25T11:41:19+08:00",
          "tree_id": "d8c37cf8472368ef6d8562ff6d8e4e84013d76ce",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e2b1361f73ddcb582275cb9f9bb8100a94bbc9c7"
        },
        "date": 1742876193976,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8348,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.21230962726497218,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 111509,
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
          "id": "73820e442ed58433874746f9ab47a1dfde6af986",
          "message": "fix: extend e2e 2 pxes timeout. strip color codes for error_regex.",
          "timestamp": "2025-03-25T08:34:15Z",
          "tree_id": "a6a1c0673dc8daea1be2744761bb03bb7cf87957",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/73820e442ed58433874746f9ab47a1dfde6af986"
        },
        "date": 1742893378352,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9351,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23780002634824293,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 153753,
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
          "id": "8871c83fb13d15d5d36d2466e9953e9bb679ffd0",
          "message": "fix(avm): semicolons are hard (#12999)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\nline.",
          "timestamp": "2025-03-25T19:11:29+08:00",
          "tree_id": "dbf25a7a5efadfdaa3670b5dcf69d466f274667e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8871c83fb13d15d5d36d2466e9953e9bb679ffd0"
        },
        "date": 1742901487969,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9276,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23591476776904133,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 140825,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "88586592+porco-rosso-j@users.noreply.github.com",
            "name": "porco",
            "username": "porco-rosso-j"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "0c21c74c146a282b210cc07cbeb227a1ee19bb18",
          "message": "fix: added #[derive(Eq)] to EcdsaPublicKeyNote (#12966)",
          "timestamp": "2025-03-25T12:16:13Z",
          "tree_id": "8c08a239ac2f371e5beb924745ab8ccac8b15176",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0c21c74c146a282b210cc07cbeb227a1ee19bb18"
        },
        "date": 1742906862887,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9747,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.24788486045693608,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 158651,
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
          "id": "1ece539e68b030845808e63b4ac982644687f0bb",
          "message": "fix(e2e): p2p (#13002)",
          "timestamp": "2025-03-25T13:05:16Z",
          "tree_id": "231a6abfaf7132a54dcdaa52cd53528d69d34eda",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1ece539e68b030845808e63b4ac982644687f0bb"
        },
        "date": 1742909782217,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9432,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23988167116924564,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 141486,
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
          "id": "0838084a4d5cc879c8fcced230ed7483e965067e",
          "message": "fix(docs): Load token artifact from the compiled source in the sample dapp tutorial (#12802)\n\ncloses #12810",
          "timestamp": "2025-03-25T13:31:41Z",
          "tree_id": "9f721baf70f61205a0982cf1a6fd0a800caa917c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0838084a4d5cc879c8fcced230ed7483e965067e"
        },
        "date": 1742911345726,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9474,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.24093146030003676,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 152767,
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
          "id": "770695cd24f480b1f3c5c444e3cd7b6089bdc48d",
          "message": "feat: Validators sentinel (#12818)",
          "timestamp": "2025-03-25T15:51:35Z",
          "tree_id": "a5571d05518b4863bceaf5efb5c314fafa2ecf39",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/770695cd24f480b1f3c5c444e3cd7b6089bdc48d"
        },
        "date": 1742919634009,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9750,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.24796636584213716,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 153825,
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
          "id": "98e2576615cef87771583822b856244dc2f8c82a",
          "message": "chore: Revert \"chore: add default native proving for cli wallet (#12855)\" (#13013)\n\nThis reverts commit c0f773c0c614d1a76ee7aef368645bc280e8b761.\n\nReverting to investigate more if this could be causing timeouts.\n\nCo-authored-by: Esau <esau@aztecprotocol.com>",
          "timestamp": "2025-03-25T20:38:22Z",
          "tree_id": "992a4473ec86d6fdf986fd2d8d9fcf9fedce2254",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/98e2576615cef87771583822b856244dc2f8c82a"
        },
        "date": 1742935938192,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9277,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.235927624954348,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 134159,
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
          "id": "ba8d6548f5f97bf68364f007c2c81370fa6d37a2",
          "message": "fix: Allow use of local blob sink client (#13025)\n\nIn #12857 an irresponsible developer changed the blob sink client\nfactory so that the remote `HttpBlobSinkClient` was used if there was a\nblob archive API defined or even an L1 chain id, since we have a method\nfor inferring an archive API just by using the L1 chain id.\n\nThis has the unintended effect of using the `HttpBlobSinkClient` pretty\nmuch always, since L1 chain id is pretty much always defined. Even when\nrunning locally against anvil. Which means the archiver no longer works\nwhen running locally, since we end up with no local blob sink.\n\nThis commit removes the check for L1 chain id when deciding whether to\nuse a local client or an http one. We assume that, if working in a\n\"real\" environment, we have an L1 consensus host url, given we hit the\narchive API just as a fallback.",
          "timestamp": "2025-03-25T19:25:26-03:00",
          "tree_id": "4722ac25ea1946b8532ffda3773ec9b47540e78b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ba8d6548f5f97bf68364f007c2c81370fa6d37a2"
        },
        "date": 1742942256340,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9396,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23894736993019391,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 156147,
            "unit": "us"
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
          "id": "56b1f0d2bc29909041c579d79221388a25d8b6d0",
          "message": "feat: AVM parsing tag validation (#12936)\n\nBEFORE\n```\ninstr_fetching_acc                   8.56 us     8.56 us     81280\ninstr_fetching_interactions_acc      5.24 us     5.23 us    132904\n```\nAFTER this PR (version with committed column)\n```\ninstr_fetching_acc                   8.79 us     8.79 us     79677\ninstr_fetching_interactions_acc      5.74 us     5.74 us    122150\n```",
          "timestamp": "2025-03-26T08:42:59+01:00",
          "tree_id": "1e30faa2cbc56980c615eb6ed05a1ec503cdc203",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/56b1f0d2bc29909041c579d79221388a25d8b6d0"
        },
        "date": 1742976835029,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9220,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23448104771759665,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 135832,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "koenmtb1@users.noreply.github.com",
            "name": "Koen",
            "username": "koenmtb1"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "67018067b9871218cc303d7f9685a7f6fead18c9",
          "message": "fix: parse away trailing slash from consensus host (#12577)\n\nfixes: https://github.com/AztecProtocol/aztec-packages/issues/12576",
          "timestamp": "2025-03-26T10:33:11Z",
          "tree_id": "b1313a2e65984eb542451b6fc274caf823faa98d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/67018067b9871218cc303d7f9685a7f6fead18c9"
        },
        "date": 1742987004290,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9222,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2345206409824351,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 147870,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "9820846+rw0x0@users.noreply.github.com",
            "name": "Roman Walch",
            "username": "rw0x0"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "76ef873f0721843bb2f44e2428d352edf595d1c3",
          "message": "fix: make circuit parsing deterministic (#11772)",
          "timestamp": "2025-03-26T11:36:28Z",
          "tree_id": "99813f93acb4c2bca53cf02b059d89b9e26d43ba",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/76ef873f0721843bb2f44e2428d352edf595d1c3"
        },
        "date": 1742990259661,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9670,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2459136528309088,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 155514,
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
          "id": "34ec9e8300116d27c1903a1daae775672186c945",
          "message": "feat(avm): merkle db hints (part 1) (#12922)\n\nThis PR adds AVM hints for the following merkle operations\n* getPreviousValueIndex to get the low leaf index\n* getLeafPreimage to get the low leaf preimage\n* getSiblingPath to get the low leaf sibling path\n\nOn the C++ side, the operations are called slightly differently. I'm using the C++ world state db names.\n\nThis PR also separates the C++ DB interfaces into low level (basically the equivalent of the TS merkleops) and high level (equivalent of the public trees db/journal). This needed to be done because loose low level operations cannot necessarily be constrained. We usually need more context, and a coarser granularity. Therefore the idea is that low level ops are hinted (and unconstrained), and high level ops are constrained.\n\nHinting is currently tested via the deserialization tests, and it should be used by the bulk test, but we never get there (beyond bytecode processing). So some things might still be wrong.\n\nI'm trying to get this out as quick as possible to unblock others.\n\n```\nInitializing HintedRawContractDB with...\n * contractInstances: 6\n * contractClasses: 3\n * bytecodeCommitments: 3\nInitializing HintedRawMerkleDB with...\n * get_sibling_path hints: 3\n * get_previous_value_index hints: 27\n * get_leaf_preimage hints_public_data_tree: 3\n```\n\nPS: there's probably a lot of duplication happening now in the hints. We'll have to eventually deduplicate.",
          "timestamp": "2025-03-26T12:08:05Z",
          "tree_id": "9d34bec4915bbd9a3cac20240f72ce7da1cdb1ab",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/34ec9e8300116d27c1903a1daae775672186c945"
        },
        "date": 1742993507138,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9692,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2464752195046686,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 147837,
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
          "id": "d768d2661462f93d798a3f535d9a7b33fc619276",
          "message": "chore: fix governance util issue (#13043)\n\nUpdates the governance util such that it uses the correct asset",
          "timestamp": "2025-03-26T14:13:46Z",
          "tree_id": "3fc85ef5b7fbc02975c1cbffd116bf84fba9a9ea",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d768d2661462f93d798a3f535d9a7b33fc619276"
        },
        "date": 1742999646688,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9371,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23832897072152429,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 137681,
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
          "id": "fefffa7a6376066792874da4c5da41126603841d",
          "message": "chore: towards no more mock op_queues (#12984)\n\nRemove occurences of mock ecc ops additions in scenarios where the merge\nprotocol operates properly without adding this merge operations but we\nare also not required to make some actual changes to the protocol\nitself.",
          "timestamp": "2025-03-26T14:24:00Z",
          "tree_id": "5b9e2ccabd7ddb216d8259b5131a737d7e6a7ed1",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/fefffa7a6376066792874da4c5da41126603841d"
        },
        "date": 1743000887473,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9385,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23866604772604957,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 132083,
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
          "id": "1ebd04424dca674b35c4fc3d32e240046f9b27fa",
          "message": "chore(bb): minor acir buf C++ improvements (#13042)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\nline.",
          "timestamp": "2025-03-26T14:38:21Z",
          "tree_id": "74dd59a306f9a0cbd7c2f957d2bafac019b7e930",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1ebd04424dca674b35c4fc3d32e240046f9b27fa"
        },
        "date": 1743002546895,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9322,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23706676345312397,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 138484,
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
          "id": "8a47d8ba6618fa5299923d8b70bb3cfe88e48115",
          "message": "fix: bootstrap network and sponsored fpc devnet (#13044)\n\nEnables sponsoredFPC and fixes bootstrap network\n\nCo-authored-by: sklppy88 <esau@aztecprotocol.com>",
          "timestamp": "2025-03-26T16:29:48+01:00",
          "tree_id": "b61dd476682adffe52546b9638354d5d9af2dcc6",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8a47d8ba6618fa5299923d8b70bb3cfe88e48115"
        },
        "date": 1743004831305,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9278,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23594477004822711,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 131658,
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
          "distinct": true,
          "id": "af48184f5786e21b7e2e7aa980487b04495a2559",
          "message": "feat: staking asset handler (#12968)\n\nFix #12932",
          "timestamp": "2025-03-26T11:38:38-04:00",
          "tree_id": "bd02b0f6ee462d1ce944711ee6f5d9d959089048",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/af48184f5786e21b7e2e7aa980487b04495a2559"
        },
        "date": 1743006051681,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9479,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.24105754839170018,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 146772,
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
          "id": "3a7ba2d12da63833ef233b290d51428594f21c13",
          "message": "chore: redundant if in affine from projective constructor (#13045)\n\nThe if-statement at the end of the projective to affine constructor is\nredundant, we check that the projective point is infinity at the\nbeginning of the function and the operations we perform afterwards do\nnot affect it in a way that would make it become infinity.",
          "timestamp": "2025-03-26T15:36:35Z",
          "tree_id": "755181a5808e6ba644ec16f1406c5572090ed559",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/3a7ba2d12da63833ef233b290d51428594f21c13"
        },
        "date": 1743006052968,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9438,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2400282657285722,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 131302,
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
          "id": "f972db97dcd643bf5a86fd7ff7439303135fefac",
          "message": "fix: Syntax error when running tests via jest after tsc build (#13051)\n\nRunning e2e tests in jest after building using `tsc -b` would result in\nan error `SyntaxError: 'super' keyword unexpected here`.\n\n```\n FAIL  src/e2e_block_building.test.ts\n  ● Test suite failed to run\n\n    SyntaxError: 'super' keyword unexpected here\n\n      at Runtime.loadEsmModule (../../node_modules/jest-runtime/build/index.js:517:20)\n```\n\nAfter patching jest to report where the issue was coming up, it turned\nout it was caused by the usage of `super` in a js private method. For\nsome reason tsc was emitting the following:\n\n```ts\n  async #getHintKey(treeId: MerkleTreeId): Promise<AppendOnlyTreeSnapshot> {\n    const treeInfo = await super.getTreeInfo(treeId);\n    return new AppendOnlyTreeSnapshot(Fr.fromBuffer(treeInfo.root), Number(treeInfo.size));\n  }\n```\n\n```js\n_HintingPublicTreesDB_instances = new WeakSet(), _HintingPublicTreesDB_getHintKey =\n// Private methods.\nasync function _HintingPublicTreesDB_getHintKey(treeId) {\n    const treeInfo = await super.getTreeInfo(treeId);\n    return new AppendOnlyTreeSnapshot(Fr.fromBuffer(treeInfo.root), Number(treeInfo.size));\n};\n```\n\nSince the private method was moved outside the class as part of code\ngeneration, node threw a syntax error since `super` can only be used in\nthe context of a class.\n\nThis patches the issue by using regular ts private methods, but we still\nneed to figure out why ts is emitting invalid js code.",
          "timestamp": "2025-03-26T16:20:25Z",
          "tree_id": "bb33ad02e393bcccb63af19dc736cd97506a5299",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f972db97dcd643bf5a86fd7ff7439303135fefac"
        },
        "date": 1743007907863,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9509,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.24182375739466822,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 134111,
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
          "id": "dc5f78f7f0e6a1a20c3e0a280abca7e7edbf69d0",
          "message": "chore: comprehensive cleanup of translator flavor and use inheritance properly in flavors (#13041)\n\nCloses https://github.com/AztecProtocol/barretenberg/issues/810.\n\nClarify getters in the `TranslatorFlavor` and ensure all the existing\ngetters are actually needed. We also were (and I think still are in\nECCVM) using inheritance weirdly between entities so cleaned that up as\nwell. There is still work to be done in ECCVM (added to\n[this](https://github.com/AztecProtocol/barretenberg/issues/939) issue).",
          "timestamp": "2025-03-26T16:36:06Z",
          "tree_id": "8c89cfc04c3d7ce5f0ba235b86cb71271dd67404",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/dc5f78f7f0e6a1a20c3e0a280abca7e7edbf69d0"
        },
        "date": 1743009540263,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9218,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23443729072076103,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 133965,
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
          "id": "d92d8955753b0079ca884767fe26968dea9fc377",
          "message": "fix: starting the sandbox with no pxe should still deploy initial test accounts (#13047)\n\nResolves #12950 without adding cheatcodes to advance a block.\n\nCo-authored-by: sklppy88 <esau@aztecprotocol.com>",
          "timestamp": "2025-03-26T18:17:33+01:00",
          "tree_id": "419974572e2be8f0daf3196155851a1415ca0911",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d92d8955753b0079ca884767fe26968dea9fc377"
        },
        "date": 1743011424176,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9228,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2346891717936472,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 142659,
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
          "id": "985e83bec2b4da9791f47768953cba3d9af57f66",
          "message": "fix: Bump tsc target (#13052)\n\nWe were using different targets for tsc and swc (es2020 vs es2022). This\nPR updates tsc target so it matches the swc one, to minimize\nincompatibilities between code built with either tool.",
          "timestamp": "2025-03-26T17:12:53Z",
          "tree_id": "84d80ddbc27939afcb9d1d859f9465b5791deef0",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/985e83bec2b4da9791f47768953cba3d9af57f66"
        },
        "date": 1743011487499,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9710,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.24693156662028468,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 162528,
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
          "id": "da6d02178f2cb61e56e8f9e702aba574f8b03cee",
          "message": "chore: remove dummy ops in decider pk (#13049)\n\nWe used to not serialise and deserialise infinity points in the\ntranscript properly until\n[this](https://github.com/AztecProtocol/aztec-packages/pull/7709). More\nprecisely, it was possible to get to\n[this](https://github.com/AztecProtocol/aztec-packages/blob/mm/handle-merge/barretenberg/cpp/src/barretenberg/ecc/groups/element_impl.hpp#L68)\npoint in the projective to affine constructor (used when operating with\nzero commitments) because the transcript was not setting the infinity\nflag in situations when `z=0`. This was leading to intermmitent issues\nthat resulted in us adding dummy ecc ops [this\nPR](https://github.com/AztecProtocol/aztec-packages/pull/5174/files). We\nshould now be able to remove these dummy ops.",
          "timestamp": "2025-03-26T21:34:50Z",
          "tree_id": "6186a6d282b6d2750c826f05901df49f79f70c81",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/da6d02178f2cb61e56e8f9e702aba574f8b03cee"
        },
        "date": 1743027418081,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9646,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2453188863405708,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 135721,
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
          "id": "0b7e5649237a66247b26bda6330fdd87cb002059",
          "message": "feat: LogEncryption trait (#12942)",
          "timestamp": "2025-03-27T02:00:24Z",
          "tree_id": "f2de830552fe9addf844138ba0b4fc29701d9f3f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0b7e5649237a66247b26bda6330fdd87cb002059"
        },
        "date": 1743041527145,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9342,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23758505247897432,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 135687,
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
          "id": "20d734a11549d7a100d8f7e0ec64ca86d4cb73f8",
          "message": "feat: 64 bit log type id, 64 bit log metadata (#12956)",
          "timestamp": "2025-03-26T20:32:24-06:00",
          "tree_id": "92987217b6b580a9f6bcd2098d3abb548eeec484",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/20d734a11549d7a100d8f7e0ec64ca86d4cb73f8"
        },
        "date": 1743044391481,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8468,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.21534677398688495,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 104616,
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
          "id": "f03b2e5b541757e1dcb7daf821977f43758be70c",
          "message": "feat(avm): add calldata & returndata to context (#13008)\n\n- Reading calldata and (almost) writing returndata to the vm2 contexts. \n- Splits context interfaces into Enqueued and Nested\n- Adds parent contexts (to nested contexts) and child contexts (in both)\nto the `context` class\n\nNothing much flexs these for now - we will need to start doing the\nXDATA_COPY opcodes soon.",
          "timestamp": "2025-03-27T13:03:16+08:00",
          "tree_id": "336f04ead2b9cf3e2cf99a1c1027b497c15f256e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f03b2e5b541757e1dcb7daf821977f43758be70c"
        },
        "date": 1743054345575,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9433,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23989559743599587,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 142423,
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
          "id": "9612a4e25b825f4ef6080c165f070cc7b36bab49",
          "message": "feat: track total tx fee (#12601)",
          "timestamp": "2025-03-27T11:02:47Z",
          "tree_id": "748c44c244f57934a772372cfa66e04f85c9e36c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9612a4e25b825f4ef6080c165f070cc7b36bab49"
        },
        "date": 1743075067466,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9298,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23645771213921873,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 128770,
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
          "id": "327341fb11f99fec6219164cdc2c12f996b77182",
          "message": "fix: invalid getCommittee function (#13072)",
          "timestamp": "2025-03-27T11:55:06Z",
          "tree_id": "e87b18b7fd0019f74c35fc78634a2ce5258f67ea",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/327341fb11f99fec6219164cdc2c12f996b77182"
        },
        "date": 1743076929597,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9448,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.24026812000047093,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 145949,
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
          "id": "4eb1156250d2221e028c340e7d93dcdc39803cbe",
          "message": "feat: gas benchmark for \"normal usage\" (#13073)\n\nFixed #13075\n\nCreating explicit benchmarking test for gas such that there is something\nthat is:\n1) convenient to check against for optimisations\n2) gives a somewhat correct view instead of having all the failure cases\nin the mix\n\nThe test runs with a validator set of 100 entities, that each have a\nforwarder contract. We then ram through time and submit and fake proof\n100 blocks to collect data.\n\nNotice, that if you bump up the numbers of entities or blocks foundry is\nprobably going to explode if you don't also change the gas limits\nbecause that is a lot of things being loaded in 🤷\n\nTodo: Talk to @Maddiaa0 @just-mitch and @aminsammara on which numbers\nare missing and what should make its way into the fancy benchmark graphs\nthat charlie setup. Most should be in #12615",
          "timestamp": "2025-03-27T12:25:04Z",
          "tree_id": "cfad1b61ac0b5244adf8725ad91e94149da1ddca",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/4eb1156250d2221e028c340e7d93dcdc39803cbe"
        },
        "date": 1743078724920,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9385,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23866450977593698,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 131654,
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
          "id": "27f1eca25c4c5849d32541b5ad1d3068d5d1911a",
          "message": "chore: Speed up and deflake sentinel test (#13078)\n\nThe sentinel e2e test was [sometimes\nfailing](http://ci.aztec-labs.com/0534e1b01190d6fd) since not enough\nblocks were mined in time. We believe this was because the offline\nvalidator was being picked up as proposer, so multiple slots end up\nbeing missed.\n\nThis PR fixes it by bumping timeout and reducing the number of blocks we\nmine. We used to mine so many to make sure that each validator was\npicked at least one as proposer, so no matter which one we inspected, we\ncould assert there was at least one block proposed in its stats. We now\njust look for one with proposals and assert on it.",
          "timestamp": "2025-03-27T13:16:06Z",
          "tree_id": "7ca9c4170f282f039dcdd51e437430b16cc181f3",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/27f1eca25c4c5849d32541b5ad1d3068d5d1911a"
        },
        "date": 1743083076199,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9386,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23870022951027067,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 135342,
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
          "id": "fbbc6c701efa4f3cc7317e437a103f9a1b51895d",
          "message": "feat(avm): merkle hints (part 2) (#13077)\n\nGetLeafPreimage complete for public data and nullifiers.\nGetLeafValue complete for note hashes and l1 to l2.\n\nChanged getNullifierIndex to use other methods (the hinted ones). Please check that.",
          "timestamp": "2025-03-27T13:25:31Z",
          "tree_id": "d03a9b5933099c56b2653cb27aa424a96800e1a5",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/fbbc6c701efa4f3cc7317e437a103f9a1b51895d"
        },
        "date": 1743084497298,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9243,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23505447269877558,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 134776,
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
          "id": "a64d1dc9d7b0071f4cde2a4213f76c881a6fbe3f",
          "message": "chore: remove addition of dummy ops in mock circuit producer (#13003)\n\nEvery call to `prove_merge` checks whether the ecc_op block is empty and\nadds dummy ops if required to avoid issues. Therefore, there is no need\nto add dummy ops when creating mock circuits. This isolates the addition\nof dummy gates to two places: at builder finalisation and when necessary\nin `prove_merge`.",
          "timestamp": "2025-03-27T13:47:32Z",
          "tree_id": "48ea72add036f1a865bdbb9a7f7dae47063ac281",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a64d1dc9d7b0071f4cde2a4213f76c881a6fbe3f"
        },
        "date": 1743085374200,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8581,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.21823740126394373,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 105872,
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
          "id": "531b321fe2038f44e0bd9829344d657aa52eaaea",
          "message": "Merge branch 'master' of github.com:aztecprotocol/aztec-packages",
          "timestamp": "2025-03-27T14:28:08Z",
          "tree_id": "fbd54ce970374fff13a20688f3c1aab6a6abdab1",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/531b321fe2038f44e0bd9829344d657aa52eaaea"
        },
        "date": 1743086124362,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8581,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.21823740126394373,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 105872,
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
          "id": "8fc3c158ee8fac2386c656e7a7589527a06bd704",
          "message": "Revert \"chore: add default native proving for cli wallet retry (#13028)\"\n\nThis reverts commit b2f47855fa1877dc488ee4753037e5e057f5179d.",
          "timestamp": "2025-03-27T15:15:48Z",
          "tree_id": "a3967607117ca7a1d3240d5a90a970ea6ec92319",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8fc3c158ee8fac2386c656e7a7589527a06bd704"
        },
        "date": 1743090254598,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9406,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23920389117753857,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 139955,
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
          "id": "e1f2bddb4c1a21aeb1c058da2c8002863cff3e24",
          "message": "chore(avm): remove codegen (all but flavor) (#13079)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\nline.",
          "timestamp": "2025-03-27T15:33:20Z",
          "tree_id": "aa7358f1bbfa4a37559270678d8d1ce70ea22587",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e1f2bddb4c1a21aeb1c058da2c8002863cff3e24"
        },
        "date": 1743091295198,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9265,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23563037605429865,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 143863,
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
          "id": "9c82f3f053e01cee5359f8b1625ecd27c4978bd2",
          "message": "chore(avm): final codegen nuking (#13089)\n\nMoves the only variable part of the flavor into a new file `flavor_variables.hpp`. Nukes the rest.",
          "timestamp": "2025-03-27T16:48:44Z",
          "tree_id": "6a91392f38901e6d52b5c3d60464129c53cd0385",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9c82f3f053e01cee5359f8b1625ecd27c4978bd2"
        },
        "date": 1743094814932,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9484,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2411809764163594,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 148894,
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
          "id": "8e71e55911f928aaccaa07637631171c18584390",
          "message": "refactor: `getIndexedTaggingSecretAsSender` oracle cleanup (#13015)",
          "timestamp": "2025-03-27T17:23:37Z",
          "tree_id": "adf5bfad6c53901f64389a3840c536d03393fb2f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8e71e55911f928aaccaa07637631171c18584390"
        },
        "date": 1743096655468,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8486,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2158067666211674,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 110814,
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
          "distinct": true,
          "id": "d936285f306eb79c268bfb02e365ef6462f9a0d0",
          "message": "fix: fuzzer on staking asset handler constructor test (#13101)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\nline.",
          "timestamp": "2025-03-27T18:59:20Z",
          "tree_id": "d541c9de77201597a37158dd9ba03b420a54d154",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d936285f306eb79c268bfb02e365ef6462f9a0d0"
        },
        "date": 1743102385660,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9529,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2423268417203461,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 136884,
            "unit": "us"
          }
        ]
      }
    ]
  }
}