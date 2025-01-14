window.BENCHMARK_DATA = {
  "lastUpdate": 1736881758143,
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
      }
    ]
  }
}