window.BENCHMARK_DATA = {
  "lastUpdate": 1746714558328,
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
          "id": "b50e8bab66f4068325871c52924df57db7a7d873",
          "message": "chore: L1 reorg test for loading blocks before L1 syncpoint (#14122)\n\nAdds an L1 reorg scenario test for loading blocks older than last sync\npoint (see `checkForNewBlocksBeforeL1SyncPoint`)",
          "timestamp": "2025-05-07T10:08:16Z",
          "tree_id": "ab577415275e48feda8df2af2dc8d7dd153e31cd",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/b50e8bab66f4068325871c52924df57db7a7d873"
        },
        "date": 1746614997275,
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
          "id": "163052f00f99fff838148b5af65ef25e54d6e2ef",
          "message": "fix: aztec with no args complains on mac (#14123)\n\nbash 3.2.57 on mac considers a=() undefined\n\n```\ncopypaste@copypastes-MacBook-Pro aztec-test % aztec\n/Users/copypaste/.aztec/bin/aztec: line 43: args[@]: unbound variable\n```",
          "timestamp": "2025-05-07T11:18:14Z",
          "tree_id": "6d14b0c967a626926da2d97daa9a645b49235451",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/163052f00f99fff838148b5af65ef25e54d6e2ef"
        },
        "date": 1746619150053,
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
          "id": "e98bfa4be1b9e84193e60e564b1e13b0aaed4ee8",
          "message": "chore: updated sepolia account funding actions (#13999)\n\n- new action specifically to fund accounts on sepolia, derived from a\nmnemonic + values file with mnemonic indices\n- can be used with an existing mnemonic, or will generate a new one if\nGCP secret doesn't exist\n- network-deploy now uses that action so can also be used with an\nexisting mnemonic or will create a new one with chosen name\n\nFixes #14113",
          "timestamp": "2025-05-07T12:56:12Z",
          "tree_id": "180d5353659a24ef0b1afbe8ebcab3395c0893fd",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e98bfa4be1b9e84193e60e564b1e13b0aaed4ee8"
        },
        "date": 1746625227961,
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
          "id": "8d81136d3ddf396fc061fa8074c9ba5f9fb2ab40",
          "message": "chore: more specific world state tree map size config (#13905)\n\nCloses https://github.com/AztecProtocol/aztec-packages/issues/13386\n\nAdds tree map size configurations for each specific world state tree\n(archive, nullifier tree, note hash tree, public data tree, L1 to L2\nmessage tree).\n\nAdditionally, adds a blob sink map size configuration.",
          "timestamp": "2025-05-07T12:29:35Z",
          "tree_id": "60f6a8bc2bbb4c005a9b71f2462259e4987b2646",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8d81136d3ddf396fc061fa8074c9ba5f9fb2ab40"
        },
        "date": 1746625407452,
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
            "email": "olehmisar@gmail.com",
            "name": "oleh",
            "username": "olehmisar"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": false,
          "id": "3a901453a5d99969cc29d4d89de5a4decf73f97c",
          "message": "fix: use globalThis instead of self in PXE (#14136)\n\nA simple fix to make `@pxe/client` work in node.js. Not tested. Please\nrun CI. Similar to\nhttps://github.com/AztecProtocol/aztec-packages/pull/10747",
          "timestamp": "2025-05-07T15:30:47Z",
          "tree_id": "b42efec1cb67a5b021cf8304954a0129c1048587",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/3a901453a5d99969cc29d4d89de5a4decf73f97c"
        },
        "date": 1746633861195,
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
            "email": "james.zaki@proton.me",
            "name": "James Zaki",
            "username": "jzaki"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": false,
          "id": "72244db5a5d17a66b25ed82b1493845d80f05726",
          "message": "docs: add seq quickstart (#14081)\n\nAdded a quickstart section to the sequencer doc.\n\n---------\n\nCo-authored-by: josh crites <critesjosh@gmail.com>",
          "timestamp": "2025-05-07T15:47:38Z",
          "tree_id": "ebbc77e3c63b0d41df5dfad114deda2afd242204",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/72244db5a5d17a66b25ed82b1493845d80f05726"
        },
        "date": 1746635471994,
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
            "email": "critesjosh@gmail.com",
            "name": "josh crites",
            "username": "critesjosh"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": false,
          "id": "2a18007b3d9c5c42496cb441a933528f78b2506e",
          "message": "chore(docs): Make alpha-testnet storage doc match v0.86 (#14134)\n\napplies some feedback to the alpha-testnet docs that is in v0.86.0",
          "timestamp": "2025-05-07T15:58:25Z",
          "tree_id": "07d762c59333657785e03dc07a5368d2f037c0b3",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/2a18007b3d9c5c42496cb441a933528f78b2506e"
        },
        "date": 1746636735808,
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
          "id": "647bb120e484e6502efe12773202362c3b81a7e0",
          "message": "chore: allow for multiple aztec-wallet invocations (#14141)\n\nResolves #14140.",
          "timestamp": "2025-05-07T16:31:36Z",
          "tree_id": "5a6311b6af52c2377e6f98fc3c4ac1a1815c04fd",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/647bb120e484e6502efe12773202362c3b81a7e0"
        },
        "date": 1746637711949,
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
          "id": "98a7ec01df19e1d5981cc21a9487a192497849a1",
          "message": "feat: more profiling (#14142)\n\n- Consolidation of our profiling/timing structs in order to surface more\nand more data to the user on \"where is time spent\" when sending TXs.\n- Display of profiling information on both playground and CLI wallet\n- General improvements for cli-wallet startup time and usability, trying\nto remove the mandatory node or pxe requirements for local-only\ncommands.\n- Removed useless fee estimation default param that forced resimulation\non cli-wallet. Heads up! Fee estimation right now is all but disabled in\nboth playground and cli-wallet, but at least we're not wasting time on\nit. Discussed a bit with @iAmMichaelConnor, and will review soon with\nsane defaults",
          "timestamp": "2025-05-07T18:47:12Z",
          "tree_id": "18869b2a4e7a609e3e0009c292439716fd844e11",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/98a7ec01df19e1d5981cc21a9487a192497849a1"
        },
        "date": 1746645679955,
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
          "id": "08184fbc13622a15f5bdea4f227dbe9d45685709",
          "message": "chore: civc debugging utils (#13900)\n\nAdds some debugging functionality that's been useful to me on a number\nof occasions including\n1. Two tests in AcirIntegrationTest for debugging CIVC from msgpack\ninputs (disabled like all of the others)\n2. A `compute_vk_hash` utility for debugging discrepancies between\ncircuits that are expected to be equivalent\n3. Adds `Debug CIVC transaction` config to launch.json to allow quick\ndebugging of CIVC w/ msgpack inputs",
          "timestamp": "2025-05-07T20:22:59Z",
          "tree_id": "dc90d3579375f61f24a0b8ca514e9f9ee6fa4611",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/08184fbc13622a15f5bdea4f227dbe9d45685709"
        },
        "date": 1746651869293,
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
          "id": "03d6547218cee1eb175f287f81136c6adb149a79",
          "message": "feat(release): intel mac version fix, starknet bb variant build (#14013)\n\nSo far just enabled for mac. Linux and WASM support TODO\n\nNoticed that intel mac had the wrong sed command while at it",
          "timestamp": "2025-05-07T21:51:05Z",
          "tree_id": "b9808b177b76dad3d833859d1cba99f47d30a652",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/03d6547218cee1eb175f287f81136c6adb149a79"
        },
        "date": 1746658398720,
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
          "id": "7d5bb11ce79ee8094e5f0b2fa489259c6f4d2514",
          "message": "fix: yp run_test.sh arg passing (#14154)",
          "timestamp": "2025-05-07T23:26:02Z",
          "tree_id": "a1bf033efbdf28f51351adea4c65d46632766c0f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7d5bb11ce79ee8094e5f0b2fa489259c6f4d2514"
        },
        "date": 1746662329839,
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
            "email": "tech@aztecprotocol.com",
            "name": "AztecBot"
          },
          "committer": {
            "email": "tech@aztecprotocol.com",
            "name": "AztecBot"
          },
          "distinct": true,
          "id": "c855d048fe250d55b220e6d26822ee16d62e228c",
          "message": "git subrepo push --branch=master noir-projects/aztec-nr\n\nsubrepo:\n  subdir:   \"noir-projects/aztec-nr\"\n  merged:   \"aa67df1d68\"\nupstream:\n  origin:   \"https://github.com/AztecProtocol/aztec-nr\"\n  branch:   \"master\"\n  commit:   \"aa67df1d68\"\ngit-subrepo:\n  version:  \"0.4.6\"\n  origin:   \"???\"\n  commit:   \"???\"",
          "timestamp": "2025-05-08T02:32:23Z",
          "tree_id": "90a82df450aebcde1460c599793b795865971bec",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c855d048fe250d55b220e6d26822ee16d62e228c"
        },
        "date": 1746673654436,
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
          "id": "4fab079c0dcf45117ca6dcd1b46bcb01b50f1bd2",
          "message": "chore: advance block when deploying contract txe (#14107)\n\nRight now we mine an extra block when we do not need to and not after\nany initializers have been emitted, forcing us to\n`env.advance_block_by()` after any time we deploy to actually discover\nthose side effects via note discovery.\n\nNote that this removes the ability to check the note cache directly\nafter deployment but I think that is such a niche case and we can always\nre-add an endpoint that doesn't advance block after deployment if\nnecessary",
          "timestamp": "2025-05-08T05:49:02Z",
          "tree_id": "07bb24ec2c7b1aa58e1a22b1962fdb4906cb340c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/4fab079c0dcf45117ca6dcd1b46bcb01b50f1bd2"
        },
        "date": 1746686002016,
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
          "id": "957aaaef0fa3b93cf6d24c429d06563cabb46856",
          "message": "feat: txe new contract calling flow (#14020)\n\nThis is the first phase of TXe 2.0.\n\nWe're adding a new interface for calling private contract functions.\nThis handles external calls, as well as proper public calls.\n\nThis leverages the existing `PrivateExecutionContext` as well as the\n`PublicProcessor` to handle the execution.",
          "timestamp": "2025-05-08T10:06:40Z",
          "tree_id": "457c15d2872416151bb1d0181109278c40a86a5c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/957aaaef0fa3b93cf6d24c429d06563cabb46856"
        },
        "date": 1746701479062,
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
          "id": "5c14e5f41dabad01c79e337c23dc85bda209dc82",
          "message": "chore: creating a node rpc should have retries by default (#14159)\n\nExternals are seeing lots of issues with 502's which break the\nuseability of anything that requires a node via rpc (which is nearly\neverything). The actual backoff is arbitrarily set, but this is a\nplaceholder series that hopefully informs our builders that a retry is\npossible. Furthermore I foresee this simple retry solving and unblocking\na large proportion of the current issues faced.",
          "timestamp": "2025-05-08T12:46:05Z",
          "tree_id": "9a90a6561b6fab3d213a09341323087c109fbf15",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5c14e5f41dabad01c79e337c23dc85bda209dc82"
        },
        "date": 1746710343701,
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
          "id": "d5e6b09350a86237e422d713d1831a837e8ce46e",
          "message": "chore: Merging alpha testnet changes back to master (#14143)\n\nThis PR cherry picks changes from alpha-testnet back to master.\n\n---------\n\nCo-authored-by: Alex Gherghisan <alexghr@users.noreply.github.com>\nCo-authored-by: Maddiaa <47148561+Maddiaa0@users.noreply.github.com>\nCo-authored-by: saleel <saleel@aztecprotocol.com>\nCo-authored-by: spypsy <spypsy@users.noreply.github.com>\nCo-authored-by: Gregorio Juliana <gregojquiros@gmail.com>\nCo-authored-by: saleel <saleel@saleel.xyz>\nCo-authored-by: Santiago Palladino <santiago@aztecprotocol.com>\nCo-authored-by: Santiago Palladino <santiago@aztec-labs.com>",
          "timestamp": "2025-05-08T13:29:28Z",
          "tree_id": "290103d8a5b0b944440d3e7fb55b755f1f0babb8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d5e6b09350a86237e422d713d1831a837e8ce46e"
        },
        "date": 1746713365024,
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
          "id": "6b23d48eddee95af347487073f2d69a99ad241d6",
          "message": "refactor: timestamp based snapshots (#14128)\n\nFixes #13877. \n\nUpdates the address snapshot library to be based on time only, and rely\non the caller to pass meaningful time in. The staking lib can then feed\nalong the timestamp for which the current epoch is stable `timeOfEpoch -\n1` and we can neatly use the same storage later for different rollups.\n\nAlters quite a lot of the tests to test the timings.",
          "timestamp": "2025-05-08T13:47:32Z",
          "tree_id": "8728d8c1d12ccb57afe3c46348c3bb70559671df",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/6b23d48eddee95af347487073f2d69a99ad241d6"
        },
        "date": 1746714557331,
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
            "value": 312318,
            "unit": "gas"
          },
          {
            "name": "forward (no_validators) per l2 tx",
            "value": 867.55,
            "unit": "gas"
          },
          {
            "name": "forward (overhead)",
            "value": 327246,
            "unit": "gas"
          },
          {
            "name": "forward (overhead) per l2 tx",
            "value": 909.02,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (100_validators)",
            "value": 1579024,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (100_validators) per l2 tx",
            "value": 137.07,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (no_validators)",
            "value": 67920,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (no_validators) per l2 tx",
            "value": 5.9,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (overhead)",
            "value": 1511104,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (overhead) per l2 tx",
            "value": 131.17,
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