window.BENCHMARK_DATA = {
  "lastUpdate": 1736866757570,
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
      }
    ]
  }
}