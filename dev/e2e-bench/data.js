window.BENCHMARK_DATA = {
  "lastUpdate": 1736959153275,
  "repoUrl": "https://github.com/AztecProtocol/aztec-packages",
  "entries": {
    "End-to-end Benchmark": [
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
          "id": "c9563648fd031d8a5992a8ccd30436ce8956684d",
          "message": "chore: Block building benchmark via github-action-benchmark",
          "timestamp": "2025-01-14T14:07:29Z",
          "url": "https://github.com/AztecProtocol/aztec-packages/pull/11202/commits/c9563648fd031d8a5992a8ccd30436ce8956684d"
        },
        "date": 1736866749781,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 4591,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 3.4021821596371913,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 649730,
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
          "id": "c107b6bb84f68d4d9bf8dca604f86fbdc7a8e88c",
          "message": "chore: Block building benchmark via github-action-benchmark (#11202)\n\nDeletes old benchmarks, along with the benchmark-related scripts and\r\ntypes.\r\n\r\nAdds a single benchmark for block building, with a stubbed\r\n`TelemetryClient` that collects all datapoints in memory, and then\r\nflushes a set of specified metrics into the custom format expected by\r\n[github-action-benchmark](https://github.com/benchmark-action/github-action-benchmark),\r\nwhich we're currently using for bb.\r\n\r\nBenchmarks get published to\r\nhttps://aztecprotocol.github.io/aztec-packages/dev/e2e-bench/\r\n\r\nFixes #11154",
          "timestamp": "2025-01-14T17:09:23Z",
          "tree_id": "105c00ceaf27c7fbb6bfcab761bfd28e40a4adae",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c107b6bb84f68d4d9bf8dca604f86fbdc7a8e88c"
        },
        "date": 1736875813179,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 4526,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 3.401117607245741,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 657931,
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
          "id": "1d24fab7152b827e91738ff87fb9aef9398c589a",
          "message": "feat: track nodejs runtime metrics (#11160)\n\nThis PR implements the OTEL nodejs runtime recommended metrics\nhttps://opentelemetry.io/docs/specs/semconv/runtime/nodejs-metrics/",
          "timestamp": "2025-01-14T17:26:12Z",
          "tree_id": "bc666e1ddaf3fc73dff872de32202e139236fae7",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1d24fab7152b827e91738ff87fb9aef9398c589a"
        },
        "date": 1736877021810,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 4763,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 3.5795080324160247,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 684259,
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
            "email": "santiago@aztecprotocol.com",
            "name": "Santiago Palladino",
            "username": "spalladino"
          },
          "distinct": true,
          "id": "f2885ec188a6e74afb18e44b8f66c331ab42e108",
          "message": "fix: Use absolute path for docker bind in e2e-test",
          "timestamp": "2025-01-14T14:55:31-03:00",
          "tree_id": "dabe2f4dbe5cb379321400d7b321f72a5dbe67bc",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f2885ec188a6e74afb18e44b8f66c331ab42e108"
        },
        "date": 1736878717678,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 4505,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 3.3853893367006673,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 655408,
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
          "id": "60bdf1da7460303f9a478f83c0f6754e0985118a",
          "message": "fix: Bump inotify limits on tester (#11217)\n\nAssuming the current default for inotify max user watches on the tester\r\nmachine is 8192, this PR bumps it to 64k. We were getting errors when\r\ntrying to tail k8s logs caused by hitting inotify limits, for example:\r\n\r\n```\r\nspartan-aztec-network-boot-node-0 wait-for-ethereum export ETHEREUM_HOST=http://spartan-aztec-network-ethereum.smoke:8545\r\nspartan-aztec-network-boot-node-0 wait-for-ethereum export BOOT_NODE_HOST=http://spartan-aztec-network-boot-node.smoke:8080\r\nspartan-aztec-network-boot-node-0 wait-for-ethereum export PROVER_NODE_HOST=http://spartan-aztec-network-prover-node.smoke:8080\r\nspartan-aztec-network-boot-node-0 wait-for-ethereum export PROVER_BROKER_HOST=http://spartan-aztec-network-prover-broker.smoke:8084\r\nspartan-aztec-network-boot-node-0 wait-for-ethereum Awaiting ethereum node at http://spartan-aztec-network-ethereum.smoke:8545\r\nspartan-aztec-network-boot-node-0 wait-for-ethereum Waiting for Ethereum node http://spartan-aztec-network-ethereum.smoke:8545...\r\nspartan-aztec-network-boot-node-0 wait-for-ethereum to create fsnotify watcher: too many open files\r\n```",
          "timestamp": "2025-01-14T18:19:15Z",
          "tree_id": "668cac92b7c7256fbee123d4df4c44d6f8d480b9",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/60bdf1da7460303f9a478f83c0f6754e0985118a"
        },
        "date": 1736880117430,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 4565,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 3.4300492898082946,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 663670,
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
          "id": "93ade26408ace2ddd0d9dfe6ce7100e76c775cc0",
          "message": "feat: Inject protocol nullifier conditionally (#11155)\n\nResolves https://github.com/AztecProtocol/aztec-packages/issues/9269\r\nAvoids inserting the tx request hash as nullifier (protocol nullifier)\r\nwhen the tx already generates a nonrevertible nullifier. The simulator's\r\nnote cache detects this while simulating the private functions and\r\nchooses a nonce generating nullifier appropiately.\r\n\r\nCircuits flow:\r\n- Private kernel init receives a claim on what will be the first\r\nnullifier (or zero indicating that it needs to generate and append the\r\nprotocol nullifier)\r\n- That claim gets passed through the databus\r\n- Reset uses the claimed value to make unique note hashes\r\n- Tail verifies that the first nullifier is the claimed one. Tail to\r\npublic additionally verifies that it's non revertible",
          "timestamp": "2025-01-14T19:46:32+01:00",
          "tree_id": "308299d8b6bd62792dfcff4d1d44f092b888c701",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/93ade26408ace2ddd0d9dfe6ce7100e76c775cc0"
        },
        "date": 1736881750636,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 4752,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 3.5710587117762804,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 689573,
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
          "id": "10c8afed6ea5fd186e4f14820c4eb259cba85460",
          "message": "docs: enable protocol specs for docs in dev mode (#11219)\n\n`yarn dev` or `yarn dev:local` now show protocol specs, but `yarn build`\nor `yarn docs` does not. You can also enable via\n`SHOW_PROTOCOL_SPECS=1`. Moved protocol specs back to original folder.",
          "timestamp": "2025-01-14T13:47:36-05:00",
          "tree_id": "9e5e7a6424bf32b9473f77351b4001dfb2e9a33c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/10c8afed6ea5fd186e4f14820c4eb259cba85460"
        },
        "date": 1736881811775,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 4711,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 3.5396977098155817,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 670257,
            "unit": "us"
          }
        ]
      },
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
      }
    ]
  }
}