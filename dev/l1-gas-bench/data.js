window.BENCHMARK_DATA = {
  "lastUpdate": 1746636736793,
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
      }
    ]
  }
}