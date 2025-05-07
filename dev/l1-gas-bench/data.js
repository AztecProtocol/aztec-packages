window.BENCHMARK_DATA = {
  "lastUpdate": 1746611980128,
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
          "id": "47926c91bdbfc6ae0dafb4b7b2c18681fabe3ec9",
          "message": "feat: initial gas bench gh (#13986)\n\nAdding benchmark reporting for some l1 gas numbers (see\nhttps://aztecprotocol.github.io/aztec-packages/dev/l1-gas-bench/).\n\nCurrently have removed the if, to see it being run on this pr and get it\ngoing.",
          "timestamp": "2025-05-07T08:53:19Z",
          "tree_id": "9d76ddf7975d251b43fb7addf206f9c8ec3d6986",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/47926c91bdbfc6ae0dafb4b7b2c18681fabe3ec9"
        },
        "date": 1746610007615,
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
          "id": "e6e429e631c745770337192947fd37646d985475",
          "message": "chore: start translator logic at an even index (#13985)\n\nWe want to be able to add random data in the ultra op queue (at the\nbeginning and end) to make the merge protocol zk without affecting the\nlogic of translator or the version of the op queue used by eccvm. All\nwires in translator circuit builder start with a 0 to enable shifting.\nBut having the builder add data in all wires, including the ones\ncontaining op queue data, breaks the ability of the Goblin verifier to\ncompare the full table commitments in the last merge against the\ncorresponding translator witness polynomials commitments.\n\nTo solve this we want to add the 0 row (plus random rows eventually) via\nthe ultra op queue logic, but each ultra op populates two positions in\nthe translator wires. Prior to this work, the translator relations were\nimplemented to expect the main logic to start at an odd index (i.e. the\nfirst ultra op resides at index 1 and 2). Preserving this would have\nmeant we need to implement a special branch of logic in the ultra op\nqueue that only populates 1 row with data rather than 2 in the ultra\ntables. This PR swaps what happens at even and odd indexes to facilitate\nadding 0 and random rows via the existing op queue logic by making\ntranslator logic start at an even index (so currently at index 2).",
          "timestamp": "2025-05-07T08:58:25Z",
          "tree_id": "9e8217b3cf90bf9c1ef436700a12a59fda5dfcf5",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e6e429e631c745770337192947fd37646d985475"
        },
        "date": 1746611979026,
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