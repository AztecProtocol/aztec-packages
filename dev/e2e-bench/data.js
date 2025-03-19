window.BENCHMARK_DATA = {
  "lastUpdate": 1742406988322,
  "repoUrl": "https://github.com/AztecProtocol/aztec-packages",
  "entries": {
    "End-to-end Benchmark": [
      {
        "commit": {
          "author": {
            "email": "84764772+aminsammara@users.noreply.github.com",
            "name": "Amin Sammara",
            "username": "aminsammara"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "107f1754c7fc33cda1c3afb820b3b099745882ed",
          "message": "chore: Add cli option to specify withdrawer address in the add-l1-validator … (#11199)\n\nPreviously all three of the `proposer` `attester` and `withdrawer`\r\naddresses were the same. It meant I couldn't exit (external) validators\r\nout myself so I changed it.\r\n\r\n---------\r\n\r\nCo-authored-by: Mitch <mitchell@aztecprotocol.com>",
          "timestamp": "2025-01-14T13:56:16-05:00",
          "tree_id": "d5d1ab502ed76c1390365fe5dc43ac80bcf12756",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/107f1754c7fc33cda1c3afb820b3b099745882ed"
        },
        "date": 1736882412746,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 4599,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 3.4556160672324663,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 660554,
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
          "id": "1389a5b797fd89397a2c53c2b42299dda75bc53e",
          "message": "chore: Save kind smoke test logs as artifact (#11212)\n\nSaves the logs from the kind-smoke test as an artifact so we can debug\r\nfailures. See\r\n[here](https://github.com/AztecProtocol/aztec-packages/actions/runs/12768996955?pr=11212)\r\nfor an example run.",
          "timestamp": "2025-01-14T19:48:25Z",
          "tree_id": "04cc3b3f1910aa0ce5c31da044a1ccf5a4d6118c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1389a5b797fd89397a2c53c2b42299dda75bc53e"
        },
        "date": 1736885346505,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 4790,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 3.5993103721326993,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 701771,
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
          "id": "2790bd7382195706d569207a2a48ffe2053cb3ea",
          "message": "feat: dashboard in gcp (#11201)\n\n[new\r\ndashboard](https://console.cloud.google.com/monitoring/dashboards/builder/30d2d0d2-8dd2-4535-8074-e551dbc773aa;duration=PT15M?f.mlabel.k8s_namespace_name.namespace=mitch&f.mlabel.aztec_circuit_protocol_circuit_name.protocol_circuit=&project=testnet-440309)\r\n\r\nIt also has\r\n[traces](https://console.cloud.google.com/traces/list?project=testnet-440309),\r\nand the [logs](https://cloudlogging.app.goo.gl/kV6xa4jZzP8ScDLM8) are\r\nmuch nicer looking now.\r\n\r\nWe have a new env var, USE_GCLOUD_OBSERVABILITY, which takes precedence\r\nover the otel stuff. The \"old\" otel env vars can be used to use a custom\r\nmetrics stack, e.g. in local testing or in CI.",
          "timestamp": "2025-01-14T20:32:28Z",
          "tree_id": "8dc0491cdc8a9561ad5b982ba4288500769e6e29",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/2790bd7382195706d569207a2a48ffe2053cb3ea"
        },
        "date": 1736888170315,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 4573,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 3.4363788813899467,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 629689,
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
          "id": "2f05dc02fe7b147c7cd6fc235134279dbf332c08",
          "message": "fix(avm): AVM circuit fixes related calldata, returndata and call_ptr (#11207)\n\nThe AVM circuit code did not correctly compute col_offset (defined in\r\nmem_slice.pil) in the context of multiple enqueued calls. In this case,\r\nthe calldata of these top-level calls are concatenated and therefore\r\ncol_offset needs to take into account the previous concatenated\r\ncalldata. We needed also to relax the constraint #[COL_OFFSET_INCREMENT]\r\nwhich needs to be \"reset\" at call boundaries.\r\n\r\nSimilar fix applies for returndata.\r\n\r\nIn addition, we identified some missing call_ptr member in trace row of\r\nseveral opcodes.",
          "timestamp": "2025-01-15T12:00:38+01:00",
          "tree_id": "b36e5fbd90d5dcadb4709b7f428354c704715518",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/2f05dc02fe7b147c7cd6fc235134279dbf332c08"
        },
        "date": 1736940186218,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 4424,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 3.3245454515231403,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 634892,
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
          "id": "ffd36258b1c5bc8e0823410b19b1774aa58496a1",
          "message": "feat: expose getL2ToL1Membership on the pxe (#11215)\n\nThis PR adds a new API to the PXE to calculate the membership witness\nfor an L2 to L1 message by forwarding the request to a node (this\nobviously leaks privacy). This API is necessary in order to complete a\nwithdrawal back to L1.",
          "timestamp": "2025-01-15T11:12:08Z",
          "tree_id": "c8fbd509809f453cbd95387f248562000771f454",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ffd36258b1c5bc8e0823410b19b1774aa58496a1"
        },
        "date": 1736941006054,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 4602,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 3.457946187441431,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 658785,
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
          "id": "5becb99dabf9ea75f23cc2b94e96b00f57733175",
          "message": "chore: refactor `get_tx_effects_hash_input_helper` (#11213)\n\nThis PR does some of the refactoring mentioned in #11037. I've removed\nsome of the fixed length for-loops and avoided unnecessary byte\ndecompositions.",
          "timestamp": "2025-01-15T13:58:08Z",
          "tree_id": "6f9fcbc6f3b21d9382198a71e1b738aabe55655b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5becb99dabf9ea75f23cc2b94e96b00f57733175"
        },
        "date": 1736951373761,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 4479,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 3.3659947019243392,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 641768,
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
          "id": "17aa4b4cf2164d29d24d4da29d4b55d273802747",
          "message": "feat: Allow concurrent world state access (#11216)\n\nImplements per-fork queues for requests to the native world state\r\nfollowing it's concurrency rules. Also tightens up aspects of the cached\r\nstore to ensure reads of committed data don't access anything\r\nuncommitted.\r\n\r\n```\r\n1. Reads of committed state never need to be queued. LMDB uses MVCC to ensure readers see a consistent view of the DB.\r\n2. Reads of uncommitted state can happen concurrently with other reads of uncommitted state on the same fork (or reads of committed state)\r\n3. All writes require exclusive access to their respective fork\r\n ```",
          "timestamp": "2025-01-15T15:35:02Z",
          "tree_id": "6d3c54fb931d0cdda99e1f6c0c836e40f27d9f3f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/17aa4b4cf2164d29d24d4da29d4b55d273802747"
        },
        "date": 1736956759467,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 4460,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 3.351206434316354,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 657479,
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
          "id": "3ed22edf614df01161844785226c9a705a5d9f0e",
          "message": "feat: Sync from noir (#11196)\n\nAutomated pull of development from the\n[noir](https://github.com/noir-lang/noir) programming language, a\ndependency of Aztec.\nBEGIN_COMMIT_OVERRIDE\nchore: add end step for formatting workflow\n(https://github.com/noir-lang/noir/pull/7070)\nfeat(LSP): code action to import trait in a method call\n(https://github.com/noir-lang/noir/pull/7066)\nfeat!: Handle generic fields in `StructDefinition::fields` and move old\nfunctionality to `StructDefinition::fields_as_written`\n(https://github.com/noir-lang/noir/pull/7067)\nchore(ci): Check various inliner aggressiveness setttings in Brillig\nreports (https://github.com/noir-lang/noir/pull/7049)\nchore: reenable reports on rollup root circuits\n(https://github.com/noir-lang/noir/pull/7061)\nfix: don't always select trait impl when verifying trait constraints\n(https://github.com/noir-lang/noir/pull/7041)\nchore: mark some critical libraries as good again\n(https://github.com/noir-lang/noir/pull/7065)\nfix: Reduce memory usage in mem2reg\n(https://github.com/noir-lang/noir/pull/7053)\nfeat: Allow associated types to be ellided from trait constraints\n(https://github.com/noir-lang/noir/pull/7026)\nchore(perf): try using vec-collections's VecSet in AliasSet\n(https://github.com/noir-lang/noir/pull/7058)\nchore: reduce number of iterations of `acvm::compiler::compile`\n(https://github.com/noir-lang/noir/pull/7050)\nchore: add `noir_check_shuffle` as a critical library\n(https://github.com/noir-lang/noir/pull/7056)\nchore: clippy warning fix (https://github.com/noir-lang/noir/pull/7051)\nchore(ci): Unify compilation/execution report jobs that take averages\nwith single runs (https://github.com/noir-lang/noir/pull/7048)\nfix(nargo_fmt): let doc comment could come after regular comment\n(https://github.com/noir-lang/noir/pull/7046)\nfix(nargo_fmt): don't consider identifiers the same if they are equal…\n(https://github.com/noir-lang/noir/pull/7043)\nfeat: auto-import traits when suggesting trait methods\n(https://github.com/noir-lang/noir/pull/7037)\nfeat: avoid inserting `inc_rc` instructions into ACIR\n(https://github.com/noir-lang/noir/pull/7036)\nfix(lsp): suggest all possible trait methods, but only visible ones\n(https://github.com/noir-lang/noir/pull/7027)\nchore: add more protocol circuits to reports\n(https://github.com/noir-lang/noir/pull/6977)\nfeat: avoid generating a new witness when checking if linear expression\nis zero (https://github.com/noir-lang/noir/pull/7031)\nfeat: skip codegen of zero iteration loops\n(https://github.com/noir-lang/noir/pull/7030)\nEND_COMMIT_OVERRIDE\n\n---------\n\nCo-authored-by: Tom French <tom@tomfren.ch>\nCo-authored-by: Tom French <15848336+TomAFrench@users.noreply.github.com>\nCo-authored-by: Jake Fecher <jfecher11@gmail.com>",
          "timestamp": "2025-01-15T16:12:49Z",
          "tree_id": "5511c9b2690ea808949d09243df222772c73a203",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/3ed22edf614df01161844785226c9a705a5d9f0e"
        },
        "date": 1736959145288,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 4521,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 3.397616232451312,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 654561,
            "unit": "us"
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
          "id": "0446fce7b7b9edb58f3f169933163594ffd66b91",
          "message": "chore(master): Release 0.70.0",
          "timestamp": "2025-01-15T18:00:20Z",
          "url": "https://github.com/AztecProtocol/aztec-packages/pull/11107/commits/0446fce7b7b9edb58f3f169933163594ffd66b91"
        },
        "date": 1736964597128,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 4530,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 3.4038149958473456,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 638417,
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
          "id": "f1b92112b7063af80044a2b3bc6daa98a8446d9f",
          "message": "fix: Sequencer timetable accounts for spare time (#11221)",
          "timestamp": "2025-01-15T18:19:22Z",
          "tree_id": "68f613d5da8ea85756f09aa73e7573d28fc535c4",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f1b92112b7063af80044a2b3bc6daa98a8446d9f"
        },
        "date": 1736966498030,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 4490,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 3.3741492926096006,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 627962,
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
          "id": "5de24e017afe9b5bd165a44caa7c96a6d5657589",
          "message": "chore: fixing `@safety` warnings (#11094)\n\nFixes #11087\r\n\r\n## Note for reviewer\r\nI originally addressed a bunch of other stuff in this PR but as\r\n@nventuro pointed out it became too messy so I separated those changes\r\ninto a PR up the stack.\r\n\r\n~**Merging currently blocked by** [this nargo fmt\r\nbug](https://github.com/noir-lang/noir/issues/7045)~\r\n\r\n---------\r\n\r\nCo-authored-by: Santiago Palladino <santiago@aztecprotocol.com>",
          "timestamp": "2025-01-15T16:07:39-03:00",
          "tree_id": "e161b2d4d1820b3e9d899f878870263654e12394",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5de24e017afe9b5bd165a44caa7c96a6d5657589"
        },
        "date": 1736969439030,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 4661,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 3.5027619277800546,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 666608,
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
          "id": "946a418d138c1b2bee3a5dc14096616a902cc0b7",
          "message": "chore!: Attestation collection times out based on sequencer timetable (#11248)\n\nRemoves the env var `VALIDATOR_ATTESTATIONS_WAIT_TIMEOUT_MS` and\r\nreplaces it with the deadline for publishing the block to L1. This\r\nensures the sequencer does not get stuck waiting for attestations where\r\nthe validators have given up due to a reexecution timeout.\r\n\r\nIf timetable is not enforced, this value defaults to one aztec slot.",
          "timestamp": "2025-01-15T19:26:54Z",
          "tree_id": "374758d87a6cc69d6359da31636d6c7f81b9340b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/946a418d138c1b2bee3a5dc14096616a902cc0b7"
        },
        "date": 1736970556715,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 4840,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 3.6367339219993307,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 713663,
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
          "id": "44bd79b7e27d9610568f14c109b22cf7e36fe298",
          "message": "chore: Silence \"Updated proven chain\" log (#11250)\n\nArchiver no longer logs \"Updated proven chain\" on every iteration, but\r\nonly when there is an actual change to it.",
          "timestamp": "2025-01-15T18:17:45-03:00",
          "tree_id": "02cd082739584b108a6c19d9a82e9d55e48ba7b0",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/44bd79b7e27d9610568f14c109b22cf7e36fe298"
        },
        "date": 1736977286216,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 4631,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 3.4800644507936287,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 670350,
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
          "id": "29bc4bdd5b59ee1050951e0c143654ef3cdd25b0",
          "message": "fix: resolve misc bugs handling phases in avm witgen (#11218)\n\n* At the end of teardown, witgen needs to reset gas back to parent's end\ngas.\n* Make sure that order of enqueued calls is right in TX for bb-prover\ntests (should be a stack)\n* Add a test that reverts in teardown and can still be proven",
          "timestamp": "2025-01-15T20:47:53-05:00",
          "tree_id": "d7053ba6d77d627e2e00a99e681b4af89b9db362",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/29bc4bdd5b59ee1050951e0c143654ef3cdd25b0"
        },
        "date": 1736993482299,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 4458,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 3.3495787904670986,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 637101,
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
          "id": "caf88fa45d32c9174e033f6c1124cf5b5d06f827",
          "message": "fix: references to a3 in docs (#11256)\n\nfixes: https://github.com/AztecProtocol/aztec-packages/issues/11170",
          "timestamp": "2025-01-16T12:09:16+01:00",
          "tree_id": "ffc7387588a2c675921dc62ff8135bfb8190d8ac",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/caf88fa45d32c9174e033f6c1124cf5b5d06f827"
        },
        "date": 1737027004139,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 4491,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 3.3748553030788804,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 639168,
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
          "distinct": true,
          "id": "d254f497345ef4dd69d5cfdb58705c34e58a65cf",
          "message": "feat(docs): algolia->typesense (#11034)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\r\nline.\r\n\r\n---------\r\n\r\nCo-authored-by: ludamad <adam.domurad@gmail.com>\r\nCo-authored-by: josh crites <jc@joshcrites.com>",
          "timestamp": "2025-01-16T11:10:26Z",
          "tree_id": "283e22f3898b6a36a8da658835b9651a9c4cc9e0",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d254f497345ef4dd69d5cfdb58705c34e58a65cf"
        },
        "date": 1737027040189,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 4579,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 3.4411562284927735,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 647386,
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
          "id": "a6ebc2e7dc453e55ad3b3872f1d78b9fa0b8abdf",
          "message": "feat: reenable constrained config for roots (#10605)\n\nThis PR replaces the oracle calls used to calculate the roots of unity\nwith constants which can be written directly into the bytecode now that\nwe're not passing it across the unconstrained boundary.\n\n---------\n\nCo-authored-by: Michael Connor <mike@aztecprotocol.com>",
          "timestamp": "2025-01-16T12:13:30Z",
          "tree_id": "7f93f325668072769352797dbb482766ec3bdcbc",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a6ebc2e7dc453e55ad3b3872f1d78b9fa0b8abdf"
        },
        "date": 1737030994905,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 4514,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 3.3921072448626535,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 654693,
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
          "id": "507ae9df9c369603da20f25ccc228729ee2733cd",
          "message": "chore:  move shared pcs functionality to internal library in solidity and small refactorings in sumcheck (#11230)\n\n* functionality that is shared in PCS between the ZK and non-ZK contract\r\nhas been moved to a separate internal library.\r\n* simplified ZK sumcheck and pcs logic",
          "timestamp": "2025-01-16T13:49:22Z",
          "tree_id": "0e2de66dabc433e3e0a421e6157821ddac7af3a8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/507ae9df9c369603da20f25ccc228729ee2733cd"
        },
        "date": 1737036756241,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 4809,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 3.6138918000795055,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 707420,
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
          "id": "a5b7a6ae4ec9fbe68cfd5b8216a5a4501077baa0",
          "message": "chore: Demote error closing forks to warn (#11263)\n\nThis can happen if the sequencer is stopped right after block\r\nprocessing, as @alexghr pointed out. Demoting to warn.",
          "timestamp": "2025-01-16T13:50:46Z",
          "tree_id": "796e3c9f93318b7fadfa4d077c561c135537641c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a5b7a6ae4ec9fbe68cfd5b8216a5a4501077baa0"
        },
        "date": 1737036839823,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 4573,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 3.436520591631385,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 628751,
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
          "id": "db3d860992eae972c8f7d1db2daf66673d83fb4b",
          "message": "chore: silence circuit return values in CI (#11259)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\r\nline.",
          "timestamp": "2025-01-16T14:12:13Z",
          "tree_id": "1ad8c2f92bc3b9684c3ea6490b2a5f513e71b80d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/db3d860992eae972c8f7d1db2daf66673d83fb4b"
        },
        "date": 1737038112111,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 4564,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 3.4297316577950943,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 643910,
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
          "id": "181d6e08de039a84f7c4afbab2f63030b3139855",
          "message": "chore: remove `noir-lang/ec` dependency (#12507)\n\n`noir-lang/ec` is a bad library and we're using it for non ec things.\nLet's take these non ec things out of the ec library and then not use\nthe ec library.\n\nMaybe these non ec things can go into another place at some point... but\ntoday is not that day.",
          "timestamp": "2025-03-17T15:40:46Z",
          "tree_id": "e351ddbb9f10fcd913782491d0c409877eff71ea",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/181d6e08de039a84f7c4afbab2f63030b3139855"
        },
        "date": 1742228128864,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9559,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23326030730645925,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 139360,
            "unit": "us"
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
          "id": "100d31fa2b017617d8c4238c2e819f0ae653b074",
          "message": "chore: Update references to GH issues to reflect recent changes (#12722)\n\nAfter looking over all of the Barretenberg issues, and closing some, I\nhave gone through the monorepo to remove any stale references to these\nissues. In a small number of cases I opened a new, issue which was a\nrefinement of the previous issue, and in the case of slab allocation I\nleft the stale issues in since I thought it could be helpful if that\nissue is ever reopened.",
          "timestamp": "2025-03-17T12:43:04-04:00",
          "tree_id": "28295b0e830468823f3bd0560d9735c4e8e8a8aa",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/100d31fa2b017617d8c4238c2e819f0ae653b074"
        },
        "date": 1742232154612,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9452,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23065401021981788,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 139294,
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
          "id": "d2f8f18578dfdfc0933c7831bc61582509f04d07",
          "message": "chore: re-enable nightly tests (#12673)\n\nFixes #12107",
          "timestamp": "2025-03-17T16:56:14Z",
          "tree_id": "a96b3a8a6d925bdb63f1207534798d969c02df28",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d2f8f18578dfdfc0933c7831bc61582509f04d07"
        },
        "date": 1742232915709,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9528,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2324899605022806,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 132311,
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
          "id": "99fc7052763c6095bf809308b5761cd37c0a3b6f",
          "message": "chore: remove some unnecessary mod.nr files (#12797)\n\nThis is ultimately a styling choice, I find it annoying that the code\nfor both `note_getter` and most of the macros is in `mod.nr` files,\nwhich make it a bit harder to find the content, and make it quite\nconfusing when you have five of those files open in the IDE and you\ncan't tell them apart by name. Ideally if we have a single mod `foo`\nwe'd just have `foo.nr`, and only do `foo/mod.nr` once there's multiple\nfiles, keeping the `mod` as a source of further mode declarations and\npotentially exports, but not actual source code.",
          "timestamp": "2025-03-17T14:09:25-03:00",
          "tree_id": "c4beae3f6db47ba2afc32dedc8bfd9aef87e30c9",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/99fc7052763c6095bf809308b5761cd37c0a3b6f"
        },
        "date": 1742233884122,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9217,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.22491151418753078,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 144665,
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
          "id": "2fd47f674f487c1b8f3c4389abf2124e73d0da6a",
          "message": "fix: update join split test hash (#12798)\n\nUpdate the circuit hash in a join split test. This changes all the time\nbut the test is currently skipped on CI so whoever pushed the PR that\nchanged it wasn't alerted. May wind up deleting these altogether at some\npoint soon.",
          "timestamp": "2025-03-17T10:21:52-07:00",
          "tree_id": "0ad157348b4df3c91eecf9e662f58f43bf95a9c4",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/2fd47f674f487c1b8f3c4389abf2124e73d0da6a"
        },
        "date": 1742234397167,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9188,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2241990098026533,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 135985,
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
          "id": "392abc287812ccee2fc8be14132fda74d1e95672",
          "message": "fix: redo \"fix: make vk metadata actual witnesses\" (#12535)\n\nReverts AztecProtocol/aztec-packages#12534. This was reverted due to\nbreaking e2e-prover-full\n\nCo-authored-by: Lucas Xia <lucasxia01@gmail.com>",
          "timestamp": "2025-03-17T13:29:08-04:00",
          "tree_id": "c8b56e6e40987052267cbfb0153b9fd57ab78b23",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/392abc287812ccee2fc8be14132fda74d1e95672"
        },
        "date": 1742234792608,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9333,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.22774026769046546,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 157755,
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
          "id": "66e80284927bb3d71b80edafeba5181f0ad4bf20",
          "message": "fix: consensus URL as CLI config (#12796)\n\nFixes #12787 \n\n'promotes' consensus URL options to top-level CLI options, instead of\ne.g. `--sequencer.l1ConsensusHostUrl`",
          "timestamp": "2025-03-17T21:08:07+02:00",
          "tree_id": "e3ecdfeda5ccaedb062e43758ee93da6d682273f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/66e80284927bb3d71b80edafeba5181f0ad4bf20"
        },
        "date": 1742239964735,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9409,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2296016182322053,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 133823,
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
          "id": "2fc01a3e84a1d72c91c47f061936974921c3a1fc",
          "message": "chore: simplify note getter oracle (#12807)\n\nThe `get_notes` oracle is extremely messy, not maintained and not\ndocumented. I intend to simplify it a bit, use generics and structs to\nbetter convey what is going on, etc., so that we are able to actually\nwork with it in the future (e.g. to extract a note's randomness from its\ncontents). This is just an initial pass removing some of the superfluous\narray lengths and unnecessary redundant type bindings that made the\nthing just more difficult to read.",
          "timestamp": "2025-03-17T16:42:38-03:00",
          "tree_id": "68521e1773e5a38df1d96e7ce979fc19989e73f5",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/2fc01a3e84a1d72c91c47f061936974921c3a1fc"
        },
        "date": 1742242054602,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9167,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2236924783180473,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 137066,
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
          "id": "95a0ec174a7ad07c5584d6d2f9b8a775321a1f50",
          "message": "fix: cpp ivc bench (#12815)",
          "timestamp": "2025-03-17T17:09:25-04:00",
          "tree_id": "e4001bdc4a05daba47780670a9df9535d5d67e25",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/95a0ec174a7ad07c5584d6d2f9b8a775321a1f50"
        },
        "date": 1742250245484,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9102,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.22211244931393906,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 140727,
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
          "id": "889bc48cf6e241badd9eda39fdcba21549348954",
          "message": "chore: remove whyle, use native while (#12820)\n\nNow that Noir supports `while` loops in unconstrained functions we no\nlonger need to rely on this. Best reviewed by hiding whitespace changes.",
          "timestamp": "2025-03-17T23:08:35Z",
          "tree_id": "4426dadcc32f9cabf5b2f7730ff6b93b941cd62b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/889bc48cf6e241badd9eda39fdcba21549348954"
        },
        "date": 1742254457804,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9360,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2283902302881531,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 152262,
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
          "id": "75d545a528c91090066b618b00479ebda7c85fc3",
          "message": "chore: begin splitting out note discovery (#12819)\n\nThese are the seeds to soon have a shared encoding scheme with\nlog_type_id and metadata where each dispatcher will interpret the data\naccording to their own needs. For now it's just moving some stuff out of\nthe dispatching discovery file and into private note/partial note as\nappropriate.",
          "timestamp": "2025-03-17T23:13:07Z",
          "tree_id": "01c47a37daab24621f8bdad4b1aab9f8f1e0a365",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/75d545a528c91090066b618b00479ebda7c85fc3"
        },
        "date": 1742254748625,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9292,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2267443099649136,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 141000,
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
          "id": "3a89a2404486f933181be08835654dad451714f8",
          "message": "chore: note getter internals (#12809)\n\nFollow up of #12807 with some more misc changes.\n\n---------\n\nCo-authored-by: Jan Beneš <janbenes1234@gmail.com>",
          "timestamp": "2025-03-17T23:45:01Z",
          "tree_id": "56c879a4958121236674f628a3e2df3dd0e26b9c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/3a89a2404486f933181be08835654dad451714f8"
        },
        "date": 1742256522334,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9139,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.22300989316488057,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 139735,
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
          "id": "37ccc38aaeb539b19ff4614f02d443f1500870b0",
          "message": "fix: revert \"Switch to `noir-repo` context for cache content hashing\" (#12824)\n\nReverts AztecProtocol/aztec-packages#12784 as it broke master",
          "timestamp": "2025-03-17T20:55:14-04:00",
          "tree_id": "56c879a4958121236674f628a3e2df3dd0e26b9c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/37ccc38aaeb539b19ff4614f02d443f1500870b0"
        },
        "date": 1742260594176,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9139,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.22300989316488057,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 139735,
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
          "id": "ff8a199e93ae35134ccd6bfdb4b5c8ca46a4b38f",
          "message": "refactor: minor `CommitmentsDB` cleanup (#12817)\n\nThe naming made me sad + no reason to keep around unused and badly named\ngetCommitmentIndex functionality.",
          "timestamp": "2025-03-17T22:48:22-04:00",
          "tree_id": "b11cf4883d7eb78804532ee3f0bf515d9d4a8063",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ff8a199e93ae35134ccd6bfdb4b5c8ca46a4b38f"
        },
        "date": 1742268242700,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9124,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2226347396576145,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 139722,
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
          "id": "e9526cf008b9b4d8af057e83782f432bfd215ab9",
          "message": "chore: bump noir (#12760)\n\nAutomated pull of nightly from the\n[noir](https://github.com/noir-lang/noir) programming language, a\ndependency of Aztec.\nBEGIN_COMMIT_OVERRIDE\nchore(docs): Brillig opcodes\n(https://github.com/noir-lang/noir/pull/7722)\nchore: add lambda calculus test\n(https://github.com/noir-lang/noir/pull/7646)\nchore: bump external pinned commits\n(https://github.com/noir-lang/noir/pull/7728)\nchore: pull most logic from `get_all_contracts` up out of the\n`CrateDefMap` (https://github.com/noir-lang/noir/pull/7715)\nchore: add timeouts to CI (https://github.com/noir-lang/noir/pull/7725)\nchore: Resolve various rustdoc warnings\n(https://github.com/noir-lang/noir/pull/7724)\nchore: encapsulate `Index` within `LocalModuleId`\n(https://github.com/noir-lang/noir/pull/7719)\nfix: doc comments on functions warn unexpectedly\n(https://github.com/noir-lang/noir/pull/7721)\nchore: update docusaurus config to correct trailing slash issue\n(https://github.com/noir-lang/noir/pull/7720)\nfeat: allow `fn` returning `()` without having to write `-> ()`\n(https://github.com/noir-lang/noir/pull/7717)\nfix: allow omitting ';' after last block statement if it's an assignment\n(https://github.com/noir-lang/noir/pull/7718)\nchore: fix rustdoc issues (https://github.com/noir-lang/noir/pull/7712)\nchore: check test program execution success output\n(https://github.com/noir-lang/noir/pull/7713)\nchore: remove ultraplonk tests\n(https://github.com/noir-lang/noir/pull/7680)\nchore(docs): Document BlackBoxFuncCall enum\n(https://github.com/noir-lang/noir/pull/7702)\nchore: hide Ident fields (https://github.com/noir-lang/noir/pull/7709)\nchore(frontend): Regression test for creating a mutable reference to an\narray element (https://github.com/noir-lang/noir/pull/7699)\nfix: wrong printing of line comment in quoted\n(https://github.com/noir-lang/noir/pull/7694)\nchore: more descriptive SSA tests\n(https://github.com/noir-lang/noir/pull/7697)\nchore(artifact_cli): Print circuit output to stdout\n(https://github.com/noir-lang/noir/pull/7696)\nfeat(ssa): Dominance frontiers\n(https://github.com/noir-lang/noir/pull/7692)\nchore: add cargo deny advisory\n(https://github.com/noir-lang/noir/pull/7691)\nchore: add workflow to publish rustdoc to github pages\n(https://github.com/noir-lang/noir/pull/7687)\nfix: allow renaming a trait when importing it\n(https://github.com/noir-lang/noir/pull/7688)\nchore: Update README.md to add trailing docs `/`\n(https://github.com/noir-lang/noir/pull/7689)\nchore: add tests for trait renaming in imports\n(https://github.com/noir-lang/noir/pull/7631)\nfeat(ssa): Post dominator tree\n(https://github.com/noir-lang/noir/pull/7595)\nchore(docs): Extend stable documentation versions to build to cover\nmultiple `beta.n` releases (https://github.com/noir-lang/noir/pull/7685)\nchore(docs): Minor fixes on local documentation development workflows\n(https://github.com/noir-lang/noir/pull/7684)\nchore: add trailing slash to link on docs homepage\n(https://github.com/noir-lang/noir/pull/7682)\nfix: allow referring to comptime locals at runtime\n(https://github.com/noir-lang/noir/pull/7681)\nchore: easier way to test monormophization errors\n(https://github.com/noir-lang/noir/pull/7679)\nchore(docs): update bb commands to match the new version\n(https://github.com/noir-lang/noir/pull/7677)\nchore: update yarn version to 4.5.2\n(https://github.com/noir-lang/noir/pull/7678)\nchore: migrate to use new flat eslint config file\n(https://github.com/noir-lang/noir/pull/7676)\nchore: bump JS dependencies\n(https://github.com/noir-lang/noir/pull/7669)\nchore: bump wasm-pack to 0.13.1\n(https://github.com/noir-lang/noir/pull/7675)\nchore: bump node to v22.18.3\n(https://github.com/noir-lang/noir/pull/7668)\nchore!: make `ResolverError::UnnecessaryPub` a hard error\n(https://github.com/noir-lang/noir/pull/7664)\nfix: correctly format let followed by comment before unsafe\n(https://github.com/noir-lang/noir/pull/7659)\nchore: bump external pinned commits\n(https://github.com/noir-lang/noir/pull/7667)\nchore: fixing timeouts (https://github.com/noir-lang/noir/pull/7666)\nchore(ssa): Do not print entire functions in underconstrained values\ncheck trace (https://github.com/noir-lang/noir/pull/7665)\nchore(ci): Exclude enum tests from Brillig reports\n(https://github.com/noir-lang/noir/pull/7661)\nchore: add regression tests for PR #7570 from lambda interpreter test\n(https://github.com/noir-lang/noir/pull/7638)\nchore: remove some unused HIR code\n(https://github.com/noir-lang/noir/pull/7643)\nchore: update examples to use UltraHonk\n(https://github.com/noir-lang/noir/pull/7653)\nfix: allow method call after block, if and match\n(https://github.com/noir-lang/noir/pull/7655)\nchore: address recurring typo in docs\n(https://github.com/noir-lang/noir/pull/7656)\nfix(ssa): don't check Brillig calls for coverage if they don't return\nanything (e.g. println) (https://github.com/noir-lang/noir/pull/7644)\nEND_COMMIT_OVERRIDE\n\n---------\n\nCo-authored-by: AztecBot <tech@aztecprotocol.com>",
          "timestamp": "2025-03-18T11:22:50Z",
          "tree_id": "a7e3e6924421a513e075a145027588aa69e0b2b4",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e9526cf008b9b4d8af057e83782f432bfd215ab9"
        },
        "date": 1742298180403,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9102,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2220954304087289,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 143602,
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
          "id": "558e3152550959a25b26c8a475fb5be3cc9a0220",
          "message": "fix: Some basic re-org handling (#12812)\n\nThis attempts to fix an issue with L1 re-orgs in the archiver.\n\nDue to the possibility of L1 re-orgs, we can't trust the absence of an\nL2 block in an L1 block to mean that there definitely isn't one there.\nAs it could appear after a re-org. Therefore, we must ensure that our\nstored latest L1 block number is only set based on actually retrieved\nblocks.",
          "timestamp": "2025-03-18T11:46:45Z",
          "tree_id": "670a0a836b3d12d0f5500b6a835168cfb5f6046a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/558e3152550959a25b26c8a475fb5be3cc9a0220"
        },
        "date": 1742300218409,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9334,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2277659440716169,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 134846,
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
          "id": "c89b32221d41aa070fffad3e4df07dbd52671fc7",
          "message": "Merge branch 'master' of github.com:aztecprotocol/aztec-packages",
          "timestamp": "2025-03-18T12:29:35Z",
          "tree_id": "b0a07c7017c8b75356da5207a9b1192e626894ce",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c89b32221d41aa070fffad3e4df07dbd52671fc7"
        },
        "date": 1742302076988,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9334,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2277659440716169,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 134846,
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
          "id": "c5405d8cc540cfaa1d5bd63f02bca1ff14d9e124",
          "message": "chore: nuking MemoryArchiveStore (#12826)",
          "timestamp": "2025-03-18T12:32:26Z",
          "tree_id": "425e906e328774ff48197f349f7497492351bd93",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c5405d8cc540cfaa1d5bd63f02bca1ff14d9e124"
        },
        "date": 1742302595681,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9508,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.232004834980761,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 140415,
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
          "id": "74476ff81ac32814f60560a1832d92d51c09dac5",
          "message": "chore: Set max txs per block (#12837)\n\nSimply sets the pre-defined max txs per block config to 4 for ignition",
          "timestamp": "2025-03-18T13:22:35Z",
          "tree_id": "4f66c4c059dea074659505838fef821bcb464621",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/74476ff81ac32814f60560a1832d92d51c09dac5"
        },
        "date": 1742305161861,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9491,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2315998011020908,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 138513,
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
          "id": "189fc8388831f0d36b7c0d8de96fca9d1ce6f07a",
          "message": "Merge branch 'master' of github.com:aztecprotocol/aztec-packages",
          "timestamp": "2025-03-18T15:53:11Z",
          "tree_id": "9390dd7bc74e3b988b4d223ec2ea66c544feb74a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/189fc8388831f0d36b7c0d8de96fca9d1ce6f07a"
        },
        "date": 1742314366641,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9535,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23267507228632808,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 148168,
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
          "id": "0fc552844c65e1ef07ead1638e14c3514c422a01",
          "message": "chore: enable wtr debug logging (#12848)",
          "timestamp": "2025-03-18T16:37:53Z",
          "tree_id": "2f3d48b24893cb8324771a22ad3a3f7df686f792",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0fc552844c65e1ef07ead1638e14c3514c422a01"
        },
        "date": 1742317383367,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9344,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.22800301055175132,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 139364,
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
          "id": "233ca3eb21fdd04ac676f37b21ef4d0b7c74932a",
          "message": "chore(avm): vm2 lazy bytecode loading (#12847)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this line.",
          "timestamp": "2025-03-18T17:05:48Z",
          "tree_id": "8d76e428c46cc3913396ecc13090f10fed566aa5",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/233ca3eb21fdd04ac676f37b21ef4d0b7c74932a"
        },
        "date": 1742320092547,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9486,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2314856610836955,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 143089,
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
          "id": "eff250193b2a0b75f503cbfd308f57aa7efec274",
          "message": "fix: Remove hack to register contract class directly on node (#12795)\n\nFixes #10007",
          "timestamp": "2025-03-18T18:43:56Z",
          "tree_id": "74ef051b88c8f2b1743bcfd50cd74032ce576617",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/eff250193b2a0b75f503cbfd308f57aa7efec274"
        },
        "date": 1742324696062,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9338,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.22786299600647314,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 132519,
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
          "id": "4f37decb654f3ab0a186fafb0a9a3d0b7d9d00ec",
          "message": "chore: once again skip the uniswap tests (#12859)\n\nSkips the uniswap test in ci again as we deleted that part by mistake in\n#12724",
          "timestamp": "2025-03-18T20:17:54Z",
          "tree_id": "4185932695511d55ff1f42b434aa9775c5f6290b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/4f37decb654f3ab0a186fafb0a9a3d0b7d9d00ec"
        },
        "date": 1742330392158,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9437,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23027186126212468,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 143177,
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
          "id": "fa5991f80fdfb0fbde5fa8062367b339236abe4d",
          "message": "feat(noir sync): Calculate noir hash based on just `noir-repo-ref` and `noir-repo.patch` (#12861)\n\nAlternative to\nhttps://github.com/AztecProtocol/aztec-packages/pull/12858\n\nChanges `noir/bootstrap.sh` to use `cache_content_hash\n.rebuild_patterns` if\n* we have specified an `AZTEC_COMMIT_HASH`, looking for historical\nvalues\n* there are no commits in `noir-repo` that could be added to a patch\nfile, indicating changes that aren't captured by the `.rebuild_patterns`\nand the `noir-repo-ref` file, and\n* `noir-repo` isn't on a _branch_ which could evolve all the time; if\nit's on a branch then use the `.noir-repo.rebuild_patterns` in\n`noir-repo` itself to figure out the hash\n\nThe exception for feature branches should not affect normal aztec\nworkflow, which is based on _tags_, it's only there to support temporary\nwork noir developers do across both repos at the same time, and it's not\nsomething that will be merged into the `master` branch of\n`aztec-packages` (it would defeat repeatable builds).\n\nWith this change it should be possible to use `AZTEC_COMMIT_HASH` to\nquery historical queries, as seen in the 2nd example below.\n\n### Example 1\n\nThis shows that if we're on a tag, then adding a new commit to the\nnoir-repo will disable caching. This is the normal case in\n`aztec-packages`. Otherwise the hash is based on just `noir`. But if we\nswitch to a feature branch, caching is back on to support faster builds,\nincorporating the latest commits into the hash.\n\n```console\n# We are on a tag\n% ./noir/scripts/sync.sh info                                                                                                                                                                        \nRepo exists:              yes\nFixup commit:             9dcbd3fbf47f886821ac71a647d4f9712ab1eb1d\nCheckout commit:          45ad637273cef317eba42feaf2be0e59d34065ed\nWanted:                   nightly-2025-03-18\nNeeds switch:             no\nNeeds patch:              no\nDetached:                 yes\nOn branch:                no\nBranch name:              n/a\nHas wanted tag:           yes\nHas tag commit:           yes\nHas patch commit:         yes\nLast commit is patch:     yes\nHas fixup and patch:      yes\nHas uncommitted changes:  no\nLatest nightly:           nightly-2025-03-18\nCache mode:               noir\n% ./noir/scripts/sync.sh cache-mode                                                                                                                                                                  \nnoir\n% ./noir/bootstrap.sh hash                                                                                                                                                                           \neb08d2624603de97\n\n# Make a change in the noir-repo\n% cd noir/noir-repo                                                                                                                                                                                  \n% echo \"Foo\" > compiler/foo.txt && git add compiler/foo.txt && git commit -m \"Foo\"                                                                                                              \n[detached HEAD 23d1d2ac6b] Foo\n 1 file changed, 1 insertion(+)\n create mode 100644 compiler/foo.txt\n% cd ../..        \n\n# The extra commit disables the cache\n% ./noir/scripts/sync.sh cache-mode                                                                                                                                                                  \ndisabled-cache\n% ./noir/bootstrap.sh hash                                                                                                                                                                           \ndisabled-cache\n\n# Now switch to a feature branch\n% echo af/msgpack-codegen > noir/noir-repo-ref                                                                                                                                                       \n% ./noir/bootstrap.sh hash                                                                                                                                                                          \nError: noir-repo is on a detached HEAD and the last commit is not the patch marker commit;\nswitching to af/msgpack-codegen could mean losing those commits.\nPlease use the 'make-patch' command to create a noir-repo.patch file and commit it in aztec-packages, \nso that it is re-applied after each checkout. Make sure to commit the patch on the branch where it should be.\n\n# Get rid of the foo commit, so we can switch away\n% cd noir/noir-repo                                                                                                                                                                                 \n% git reset --hard HEAD~1                                                                                                                                                                       \nHEAD is now at 8b88883d58 Noir local patch commit.\n% cd ../..                   \n\n# Hashing still involves syncing; we need the noir-repo to decide how to hash\n% ./noir/bootstrap.sh hash                                                                                                                                                                          \nremote: Enumerating objects: 187, done.\n...\nSwitched to branch 'af/msgpack-codegen'\nYour branch is up to date with 'upstream/af/msgpack-codegen'.\n...\n[af/msgpack-codegen 98f9a3cc43] Noir local fixup commit.\n 4 files changed, 108 insertions(+), 2 deletions(-)\n create mode 100755 acvm-repo/acvm_js/build.sh.bak\n create mode 100755 tooling/noirc_abi_wasm/build.sh.bak\nApplying: patch: delete honk example programs\nApplying: chore: turn on `skipLibCheck`\nApplying: chore: delete leftover file\nApplying: Ignore package.tgz\n[af/msgpack-codegen 182331696a] Noir local patch commit.\ndisabled-cache\n\n# ^ The cache is disabled becase we have a pending change in `noir/noir-repo-ref`, \n# but `cache-mode` indicates we need to cache based on the `noir-repo` contents.\n% ./noir/scripts/sync.sh cache-mode                                                                                                                                                                 \nnoir-repo\n\n# Commit the noir-repo-ref file, so we have a clean state in aztec-packages                                                                                                                                                                              \n% git add noir/noir-repo-ref && git commit -m \"Switched to a feature branch\"                                                                                                                        \nFormatting barretenberg staged files...\n[af/noir-repo-ref-hash 62fc17a03b] Switched to a feature branch\n 1 file changed, 1 insertion(+), 1 deletion(-)\n\n# Now we hash based on the code in `noir-repo`, *and* the contents of `noir`\n% ./noir/bootstrap.sh hash                                                                                                                                                                          \n798ec85262e6133a\n\n```\n\n### Example 2\n\nThis one shows that even after switching to a different tag, we can use\nthe `AZTEC_CACHE_COMMIT` feature to go back in the commit log to get a\nhistorical hash.\n\n```console\n# We're on a tag\n% git rev-parse HEAD                                                                                                                                                                                \n517f2463281beb3d528662d1fd3d6e5346fdb523\n% cat noir/noir-repo-ref                                                                                                                                                                            \nnightly-2025-03-18\n% ./noir/bootstrap.sh hash                                                                                                                                                                          \nbf9bcc2b4f6046c7\n\n# Want to roll back to a previous nightly tag\n% echo nightly-2025-03-11 > noir/noir-repo-ref                                                                                                                                                      \n% git add noir                                                                                                                                                                                      \n% git commit -m \"Roll back nightly\"                                                                                                                                                                 \nFormatting barretenberg staged files...\n[af/noir-repo-ref-hash 858d98f42b] Roll back nightly\n 1 file changed, 1 insertion(+), 1 deletion(-)\n\n# Recalculating the hash will sync the repo, but the hash will be based on the ref, not the content\n% ./noir/bootstrap.sh hash                                                                                                                                                                          \nremote: Enumerating objects: 66481, done.\nremote: Counting objects: 100% (61479/61479), done.\nremote: Compressing objects: 100% (36681/36681), done.\nremote: Total 57993 (delta 21540), reused 52084 (delta 16927), pack-reused 0 (from 0)\nReceiving objects: 100% (57993/57993), 158.39 MiB | 33.13 MiB/s, done.\nResolving deltas: 100% (21540/21540), completed with 557 local objects.\nremote: Enumerating objects: 23, done.\nremote: Counting objects: 100% (16/16), done.\nremote: Compressing objects: 100% (3/3), done.\nremote: Total 3 (delta 2), reused 1 (delta 0), pack-reused 0 (from 0)\nUnpacking objects: 100% (3/3), 1.66 KiB | 1.66 MiB/s, done.\nFrom https://github.com/noir-lang/noir\n * tag                     nightly-2025-03-11 -> FETCH_HEAD\nWarning: you are leaving 6 commits behind, not connected to\nany of your branches:\n\n  ba0ad9e5f2 Noir local patch commit.\n  41425e3e82 Ignore package.tgz\n  e5942f5295 chore: delete leftover file\n  b98e22d860 chore: turn on `skipLibCheck`\n ... and 2 more.\n\nHEAD is now at 1fa0dd95a9 chore: bump external pinned commits (#7640)\n[detached HEAD 96b25f1022] Noir local fixup commit.\n 4 files changed, 108 insertions(+), 2 deletions(-)\n create mode 100755 acvm-repo/acvm_js/build.sh.bak\n create mode 100755 tooling/noirc_abi_wasm/build.sh.bak\nApplying: patch: delete honk example programs\nApplying: chore: turn on `skipLibCheck`\nApplying: chore: delete leftover file\nApplying: Ignore package.tgz\n[detached HEAD 2e591ecb7c] Noir local patch commit.\ncb3599adbc8ee588\n\n# We can still query the hash as it was before\n% AZTEC_CACHE_COMMIT=HEAD~1 ./noir/bootstrap.sh hash                                                                                                                                            13s \nbf9bcc2b4f6046c7\n\n```",
          "timestamp": "2025-03-18T18:18:35-04:00",
          "tree_id": "cc29259eb5b7d0bc778b8487a29c2a4c26582f90",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/fa5991f80fdfb0fbde5fa8062367b339236abe4d"
        },
        "date": 1742337709248,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9311,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.22721308383821975,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 137700,
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
          "id": "5df2aea2b1723a5cf7db1dc7d9966f3b8fba476a",
          "message": "fix: clientivc capture benchmarks include authwits (#12873)\n\nBuilds on top of:\nhttps://github.com/AztecProtocol/aztec-packages/pull/12868\n\nFixes benchmarks by making sure the profile call gets the correct\nauthwitnesses.\n\n---------\n\nCo-authored-by: MirandaWood <miranda@aztecprotocol.com>",
          "timestamp": "2025-03-19T15:06:01+01:00",
          "tree_id": "b5fbf1b087d8ff5eb634bffc106957f134fc3b4d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5df2aea2b1723a5cf7db1dc7d9966f3b8fba476a"
        },
        "date": 1742395021808,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8552,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.20868871282054063,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 112566,
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
          "id": "545b4e0f98fd494d3e9cfc1a117cc86a43e4f26a",
          "message": "fix: Don't log config (#12876)\n\nWe shouldn't just log out the complete node configuration. It may\ncontain sensitive data.",
          "timestamp": "2025-03-19T14:53:58Z",
          "tree_id": "c99a31fba0a121bc487448c96876dfb7e287ba4a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/545b4e0f98fd494d3e9cfc1a117cc86a43e4f26a"
        },
        "date": 1742397735058,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9701,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2367232016907718,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 151126,
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
          "id": "04981e2a395e51cd07a398c173d55a3a3a53ae44",
          "message": "refactor(avm): vm2 recursive execution (#12842)\n\nAfter discussions with @IlyasRidhuan we think this is the most viable\npath to make things work for CALL and context management.",
          "timestamp": "2025-03-19T23:10:37+08:00",
          "tree_id": "363b64f68372aa2a122218855730d4bdbcc0fe17",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/04981e2a395e51cd07a398c173d55a3a3a53ae44"
        },
        "date": 1742398759429,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8359,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.20397144644515502,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 106268,
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
          "id": "c9ea1cd2d36939d2064d05af998da47d18e12751",
          "message": "docs: additions (#12551)",
          "timestamp": "2025-03-19T15:49:03Z",
          "tree_id": "560a4a28c7274fd4b97a5e7310d266b7f12c6d52",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c9ea1cd2d36939d2064d05af998da47d18e12751"
        },
        "date": 1742401025137,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9453,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23068258284215246,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 140670,
            "unit": "us"
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
          "id": "65bd2764bdeafe6f2d259600b809d002c49e74fd",
          "message": "feat: precomputed ClientIVC VKs (#12126)\n\nAfter this PR, we no longer rely on a user provided vk when verifying\ncivc proofs. This was insecure.\n\n`yarn-project/bb-prover` now has a `yarn generate` step that creates two\nfiles in `yarn-project/bb-prover/artifacts`: `private-civc-vk` and\n`public-civc-vk`. These correspond to clientivc stacks that end in the\nprivate and public tail, respectively.\n\nThis is achieved by pinning historic CIVC inputs and using one public\nand private example, respectively. If the number of public inputs in the\ntail circuits, or the fundamental structure, change we will need to bump\nthis. This pinning will be obsoleted by\nhttps://github.com/AztecProtocol/barretenberg/issues/1296.\n\nThe write_vk command **is to be considered undocumented**. It is subject\nto change. Namely, a future simplification\n(https://github.com/AztecProtocol/barretenberg/issues/1296) will make it\nnot take an ivc stack. Original comments by Cody below:\n```\nAdd a write_vk command to generate a vk for generating ClientIVC proofs. This consists of: a vk for 'the' hiding circuit, a vk for the ECCVM and a vk for the Translator. The later two could and perhaps should go away in the future since they are actually just fixed constants known at C++ compile time. The former sounds like a constant, but in fact the key depends on the number of outputs of the final circuit in a stack to be verified. At the moment the two possibilities in our system are the private kernel tail and tail-to-public circuits, where the latter I'm told has very many PIs, enough that we should have a distinction. I believe this means having two Tubes, or making the Tube receive exeuction time input on which of the two keys it should use.\n\nWe remove the special handling of single circuits in ClientIVC. This was originally added so that there would be _some_ unit tests of the bb binary of ClientIVC, but the new tests in this PR will fill that role better by being more realistic.\nI also shove some little API improvements requested by @saleel in here to make sure they don't get lost in the shuffle.\n```\n\nCloses https://github.com/AztecProtocol/barretenberg/issues/1245\n\n---------\n\nCo-authored-by: ludamad <domuradical@gmail.com>\nCo-authored-by: ludamad <adam.domurad@gmail.com>\nCo-authored-by: ledwards2225 <l.edwards.d@gmail.com>",
          "timestamp": "2025-03-19T10:11:38-07:00",
          "tree_id": "82a7de1b6215d0c66c8dc984e155c2e7a1c0e67a",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/65bd2764bdeafe6f2d259600b809d002c49e74fd"
        },
        "date": 1742406987734,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9210,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2247386963177913,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 147270,
            "unit": "us"
          }
        ]
      }
    ]
  }
}