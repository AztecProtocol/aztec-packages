window.BENCHMARK_DATA = {
  "lastUpdate": 1746111733816,
  "repoUrl": "https://github.com/AztecProtocol/aztec-packages",
  "entries": {
    "L1 Gas Benchmark": [
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
          "id": "128076d92a976cf03031af8af862f95ff6502d7f",
          "message": "feat: initial gas bench gh",
          "timestamp": "2025-05-01T14:01:05Z",
          "url": "https://github.com/AztecProtocol/aztec-packages/pull/13986/commits/128076d92a976cf03031af8af862f95ff6502d7f"
        },
        "date": 1746111725630,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "forward (100_validators)",
            "value": 639564,
            "unit": "gas"
          },
          {
            "name": "forward (100_validators) per l2 tx",
            "value": 1776.57,
            "unit": "gas"
          },
          {
            "name": "forward (no_validators)",
            "value": 310600,
            "unit": "gas"
          },
          {
            "name": "forward (no_validators) per l2 tx",
            "value": 862.78,
            "unit": "gas"
          },
          {
            "name": "forward (overhead)",
            "value": 328964,
            "unit": "gas"
          },
          {
            "name": "forward (overhead) per l2 tx",
            "value": 913.79,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (100_validators)",
            "value": 1583400,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (100_validators) per l2 tx",
            "value": 137.45,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (no_validators)",
            "value": 67061,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (no_validators) per l2 tx",
            "value": 5.82,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (overhead)",
            "value": 1516339,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (overhead) per l2 tx",
            "value": 131.63,
            "unit": "gas"
          },
          {
            "name": "submitEpochRootProof (100_validators)",
            "value": 894670,
            "unit": "gas"
          },
          {
            "name": "submitEpochRootProof (100_validators) per l2 tx",
            "value": 77.66,
            "unit": "gas"
          },
          {
            "name": "submitEpochRootProof (no_validators)",
            "value": 911770,
            "unit": "gas"
          },
          {
            "name": "submitEpochRootProof (no_validators) per l2 tx",
            "value": 79.15,
            "unit": "gas"
          }
        ]
      }
    ]
  }
}