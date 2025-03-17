window.BENCHMARK_DATA = {
  "lastUpdate": 1742254465046,
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
      }
    ]
  }
}