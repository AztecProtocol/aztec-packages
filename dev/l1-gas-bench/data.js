window.BENCHMARK_DATA = {
  "lastUpdate": 1747192078195,
  "repoUrl": "https://github.com/AztecProtocol/aztec-packages",
  "entries": {
    "L1 Gas Benchmark": [
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
          "id": "b1b12774afcc5d395a97c379612019d03df642ec",
          "message": "chore: allow devnet / network tests to be run from local (#14158)\n\nThis makes it easier for someone to run the devnet tests from local\nusing flag `LOCAL=true`",
          "timestamp": "2025-05-09T10:25:56Z",
          "tree_id": "4045fbf3074c2e9b1113d3c754ed2068dd2cd3dd",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/b1b12774afcc5d395a97c379612019d03df642ec"
        },
        "date": 1746789611687,
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
          "id": "cf08c09b975a0d0ce69eba8418b1743e6e0e61e3",
          "message": "feat: add txe test contract + a new helper that disables out of context oracles (#14165)\n\nThis PR simply moves some tests from in `CounterContract` #14020 to a\nnew bespoke `TXETest` contract. Also it puts the scaffolding in for\ndisabling oracles in a txe test not invoked from a `env.` function",
          "timestamp": "2025-05-09T11:07:07Z",
          "tree_id": "545659fe9ebb8b98d32f648c38a5b9b92a7acea3",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/cf08c09b975a0d0ce69eba8418b1743e6e0e61e3"
        },
        "date": 1746790658429,
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
          "distinct": false,
          "id": "cf7ddb6633d1b6f186272bbf8fc20d5bd8a3b4b5",
          "message": "feat(spartan): globally deployable aztec node helm chart (#13850)\n\n## Overview\n\nA helm chart that can be used by both us to deploy extra nodes into our\ncluster, without the hassle of editing the full network\nchart, and for outside tooling to use.\n\nLonger term:\n- prover: true will make this a prover node etc.\n\n---------\n\nCo-authored-by: Alex Gherghisan <alexghr@users.noreply.github.com>",
          "timestamp": "2025-05-09T11:20:54Z",
          "tree_id": "c00ec0a95daa9b1d634a534dffe2c4df5eca706e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/cf7ddb6633d1b6f186272bbf8fc20d5bd8a3b4b5"
        },
        "date": 1746791404330,
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
          "id": "369f60c69d94f2a689c387ab2c6fcf3b5fb64c20",
          "message": "fix: aztec start --help when running another container (#13802)\n\ncurrently if we're running an `aztec start` container, you can't run\n`aztec start --help` if no port settings have been saved, since it'll\ntry to forward the default ports again.\n\nThis creates a special case for `--help` where it doesn't forward any\nports\n\nNot loving this solution, pls offer any alternative suggestions",
          "timestamp": "2025-05-09T11:26:26Z",
          "tree_id": "6a5d5a6021613dce28758d0068aa80b692990d74",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/369f60c69d94f2a689c387ab2c6fcf3b5fb64c20"
        },
        "date": 1746791795915,
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
          "distinct": false,
          "id": "4fe7c5139d3ad173dababa0b51c95405b44975b1",
          "message": "chore: Reenable sentinel e2e test (#14185)\n\nCI was failing as nodes sometimes started a bit late, causing the\nsentinel to miss the first slot and return a history shorter than\nexpected.\n\nThis PR waits until sentinel has collected the expected data.",
          "timestamp": "2025-05-09T13:54:27Z",
          "tree_id": "1eda318918e99c8cc48db44e5f95579fca536f34",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/4fe7c5139d3ad173dababa0b51c95405b44975b1"
        },
        "date": 1746800684361,
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
          "distinct": false,
          "id": "073bc7d4bb65324458febb9ccaf7a92449194542",
          "message": "fix: Handle \"zero\" as key on LMDBv2 map (#14183)\n\nFixes #14182",
          "timestamp": "2025-05-09T14:02:59Z",
          "tree_id": "4f3c518d97a1ae4650a236e2c05456ce79f4173d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/073bc7d4bb65324458febb9ccaf7a92449194542"
        },
        "date": 1746801776741,
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
          "distinct": false,
          "id": "2815d939e11fed9cc6205107171caf6c1a518058",
          "message": "chore(avm): less verbose equality check (#14188)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\nline.",
          "timestamp": "2025-05-09T14:25:29Z",
          "tree_id": "05be49142f3ef8292786f954aad4f5ccf3a67122",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/2815d939e11fed9cc6205107171caf6c1a518058"
        },
        "date": 1746803080303,
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
          "distinct": false,
          "id": "11cf4e6e4e8804166f45160cdeaf831bab15c018",
          "message": "fix: getEpochAndSlotAtSlot computation (#14189)",
          "timestamp": "2025-05-09T14:52:02Z",
          "tree_id": "3aba754c1c8883062f00d6ab50724229eadf0177",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/11cf4e6e4e8804166f45160cdeaf831bab15c018"
        },
        "date": 1746805005025,
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
          "distinct": false,
          "id": "cbe7246e9c3e933d3e85076a22d42741f8117b6d",
          "message": "chore: Run all nested e2e tests by default on CI (#14186)\n\nWe were missing all `e2e_epochs` and `e2e_sequencer` tests.",
          "timestamp": "2025-05-09T15:55:22Z",
          "tree_id": "f4f6eea4217f2d1f448b565bcc6df1d88767b005",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/cbe7246e9c3e933d3e85076a22d42741f8117b6d"
        },
        "date": 1746811417236,
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
          "distinct": false,
          "id": "5ff375219c58809a119a42cf96ec1b3ef43904f1",
          "message": "feat!: Indirect flag is now sorted by operand (#14184)\n\nPreviously, the indirect flag was LSB [operand_0_indirect,\noperand_1_indirect, operand_0_relative, operand_1_relative, ...0] MSB.\nThis made it so different amounts of operands would make the indirect\nflag have different meanings. This PR changes it to LSB\n[operand_0_indirect, operand_0_relative, operand_1_indirect ...] MSB\nThis way the meaning of the operand flag doesn't change with the number\nof operands, and we also avoid having to construct addressing with the\nconcrete operand count.",
          "timestamp": "2025-05-09T16:47:30Z",
          "tree_id": "517c992849ee2676af7c74fe1aa1f670f225b8a0",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5ff375219c58809a119a42cf96ec1b3ef43904f1"
        },
        "date": 1746812640636,
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
      },
      {
        "commit": {
          "author": {
            "email": "75146596+Sarkoxed@users.noreply.github.com",
            "name": "Sarkoxed",
            "username": "Sarkoxed"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": false,
          "id": "4d1a7c839df7081da05c2086a6f312c8a405cc45",
          "message": "chore: Update the list of security bugs (#13825)\n\nReorganize the security bugs table and add a few new ones",
          "timestamp": "2025-05-09T16:55:25Z",
          "tree_id": "fa0223d9d477d05dc16c77d14d186aa3b9679b84",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/4d1a7c839df7081da05c2086a6f312c8a405cc45"
        },
        "date": 1746812752471,
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
          "distinct": false,
          "id": "f0c5d936ec8c22e1ba23ea81deba87270efd6b5e",
          "message": "chore: Add archiver flake (#14196)\n\nSee http://ci.aztec-labs.com/1096c48b1c809806 for a failed run.",
          "timestamp": "2025-05-09T17:52:25Z",
          "tree_id": "b5a9315c6ee97dd57e7c90904981f53a78ca9c61",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f0c5d936ec8c22e1ba23ea81deba87270efd6b5e"
        },
        "date": 1746818258674,
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
          "distinct": false,
          "id": "cd3eb1bf0dae859e0a3b3f3a706df7d35b7be6a9",
          "message": "fix(cli): remove extra .split (#14170)\n\nIt is already parsed in the sequencers command\nfixes: https://github.com/AztecProtocol/aztec-packages/issues/14167",
          "timestamp": "2025-05-09T18:11:16Z",
          "tree_id": "58900f65b3ed2d9569d416dcb23b9e98ee350df1",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/cd3eb1bf0dae859e0a3b3f3a706df7d35b7be6a9"
        },
        "date": 1746818539048,
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
      },
      {
        "commit": {
          "author": {
            "email": "saleel@aztecprotocol.com",
            "name": "saleel",
            "username": "saleel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": false,
          "id": "904ed3de53f7e334feb0888be7523579e55b147b",
          "message": "chore(bb.js): remove plonk utils (#14180)",
          "timestamp": "2025-05-09T17:55:38Z",
          "tree_id": "daf4e975af34c393c1bbb1d6c314d7cd42c0fae4",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/904ed3de53f7e334feb0888be7523579e55b147b"
        },
        "date": 1746818540687,
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
          "id": "27eed71c797f86e2190e14bb95290d3c73131564",
          "message": "feat!: use given lengths to trim emitted logs (#14041)\n\n- All types of logs (private, public, contract class) will now be\nemitted from the contracts with a length. The base rollup will include\nthe logs to the blobs based on the specified length.\n\nRefactoring:\n- Change the prefixes of side effects in blobs to be the number of items\ninstead of the total fields of all items. It's cheaper to compute and\neasier to deserialise.\n- Remove `counter` from `LogHash` when outputted from private tail.\nCounter is only required when processing in private. We used to set it\nto 0 when exposing to public.\n\nRenaming:\n- Rename `[PUBLIC/CONTRACT_CLASS]_LOG_DATA_SIZE_IN_FIELDS ` to\n`[PUBLIC/CONTRACT_CLASS]_LOG_SIZE_IN_FIELDS ` to be consistent with\n`PRIVATE_LOG_SIZE_IN_FIELDS`.\n- Rename `[PUBLIC/CONTRACT_CLASS]_LOG_SIZE_IN_FIELDS ` to\n`[PUBLIC/CONTRACT_CLASS]_LOG_LENGTH` because other constants for a\nstruct's total number of fields are named `[...]_LENGTH`.",
          "timestamp": "2025-05-09T19:33:39Z",
          "tree_id": "1c8977b580d267bda7f41122d1dba607ad9bb4b0",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/27eed71c797f86e2190e14bb95290d3c73131564"
        },
        "date": 1746821957201,
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
          "id": "899f944baa110765465ccd0b37b1686b31c1410b",
          "message": "docs: Expand error explanations (#14195)",
          "timestamp": "2025-05-10T00:12:57Z",
          "tree_id": "050b751837b430ef38a837320e456402e229de11",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/899f944baa110765465ccd0b37b1686b31c1410b"
        },
        "date": 1746837867047,
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
          "id": "b67afe429d431c7516b95f9c6d1b6e358907ef33",
          "message": "git subrepo push --branch=master noir-projects/aztec-nr\n\nsubrepo:\n  subdir:   \"noir-projects/aztec-nr\"\n  merged:   \"8676744a84\"\nupstream:\n  origin:   \"https://github.com/AztecProtocol/aztec-nr\"\n  branch:   \"master\"\n  commit:   \"8676744a84\"\ngit-subrepo:\n  version:  \"0.4.6\"\n  origin:   \"???\"\n  commit:   \"???\"",
          "timestamp": "2025-05-10T02:30:39Z",
          "tree_id": "fc0a9f6a101169b74e3f2236ae617fa5dc603e86",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/b67afe429d431c7516b95f9c6d1b6e358907ef33"
        },
        "date": 1746846278574,
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
          "distinct": false,
          "id": "62df16a67e7b078b0e9d319517f8caff50c9afb6",
          "message": "refactor: fetch chain id and version once for all blocks (#13909)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\nline.",
          "timestamp": "2025-05-12T10:14:08Z",
          "tree_id": "0b5036b362830bfbd04b54d1fdebf9124e39893f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/62df16a67e7b078b0e9d319517f8caff50c9afb6"
        },
        "date": 1747047313196,
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
          "id": "e04e34923fd7c2d92c1626b6631ca6faab0d3690",
          "message": "feat: add experimental utility call interfaces and use them with `env.simulate_utility` txe tests (#14181)\n\nThis does not affect users not calling this via the TXe, as there is no\nAPI to call the actual interface on the call interface itself.\n\nThis simply allows for the macro to expose the UtilityCallInterface, so\nwe can have parity when writing TXe tests.",
          "timestamp": "2025-05-12T10:23:32Z",
          "tree_id": "0e7dc43507498da3b76b270bc80a1e0ce2d21c02",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e04e34923fd7c2d92c1626b6631ca6faab0d3690"
        },
        "date": 1747050654201,
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
          "id": "a2a1766bfa27e7dd6e3f6ba1725af61185387123",
          "message": "chore(docs): Add note on cross chain messages to testnet migration page (#14201)\n\nAdd some details.\n\nSome relevant unresolved issues:\n\n- https://github.com/AztecProtocol/aztec-packages/issues/14174\n- https://github.com/AztecProtocol/aztec-packages/issues/13978",
          "timestamp": "2025-05-12T11:50:03Z",
          "tree_id": "e136ccda54a0f2daa1fea4ef072ce498ae748950",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a2a1766bfa27e7dd6e3f6ba1725af61185387123"
        },
        "date": 1747052565111,
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
      },
      {
        "commit": {
          "author": {
            "email": "75146596+Sarkoxed@users.noreply.github.com",
            "name": "Sarkoxed",
            "username": "Sarkoxed"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": false,
          "id": "09fc599f3cf35e9821be67b58c94475e6b142b6b",
          "message": "feat: RAM/ROM tables handler in SMT verification module (#14150)\n\nThis pr adds a mechanism to handle RAM/ROM tables in SMT Verification\nmodule\n\n# UltraCircuit\n\n- Fixed `bool_gate` handler\n- Added `fix_witness` gate handler\n- tables' sizes are now stored\n- Fixed an optimization issue: now all the entries of `XOR` and `AND`\nare properly bounded\n\n- `handle_aux_relation` - adds non native field arithmetic constraints\nto solver\n- `handle_rom_tables`, `handle_ram_tables` - adds memory constraints to\nsolver\n\n- Added tests to verify that all the new mechanisms work fine\n\n\n# Minor changes\n\n## CircuitBase\n\n- now all the ultra related stuff is not handled in the base class\n- public inputs are now  set for optimization and relaxation purposes\n\n## Circuit Schema && CircuitBuilder\n\n- Added RAM/ROM tables export\n\n## Solver\n\n- Fixed set representation",
          "timestamp": "2025-05-12T12:49:58Z",
          "tree_id": "d14a90125fcc5c6f5ca39d177941c818a582cd1f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/09fc599f3cf35e9821be67b58c94475e6b142b6b"
        },
        "date": 1747057961865,
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
          "distinct": false,
          "id": "34eaa0ee0d80e56f9bb7d000c2f38cef57a1165f",
          "message": "fix(bb): honour CRS_PATH env var (#14208)",
          "timestamp": "2025-05-12T13:05:20Z",
          "tree_id": "ef4a34cfe586fb40d50aad19f9c1f78ec29cee1f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/34eaa0ee0d80e56f9bb7d000c2f38cef57a1165f"
        },
        "date": 1747058889636,
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
          "distinct": false,
          "id": "a5914ce8b250876fc53ce681c4c56b4affe35eb6",
          "message": "chore: Deflake e2e sentinel test (#14190)\n\nFound and fixed another flake. Stats for attestors are not collected in\nslots where no block proposal was seen, so history was shorter than\nexpected for those.",
          "timestamp": "2025-05-12T14:00:05Z",
          "tree_id": "9248cec3350437e207b7bc1bb74086650bea4a0d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a5914ce8b250876fc53ce681c4c56b4affe35eb6"
        },
        "date": 1747061686159,
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
          "id": "60dbe1a5a0287aebb51f41259dc2be0f90e30b62",
          "message": "chore: Bump Noir reference (#14055)\n\nAutomated pull of nightly from the\n[noir](https://github.com/noir-lang/noir) programming language, a\ndependency of Aztec.\nBEGIN_COMMIT_OVERRIDE\nfix: always type-check turbofish, and error when it's not allowed\n(https://github.com/noir-lang/noir/pull/8437)\nchore: Release Noir(1.0.0-beta.5)\n(https://github.com/noir-lang/noir/pull/7955)\nfeat(greybox_fuzzer): Parallel fuzz tests\n(https://github.com/noir-lang/noir/pull/8432)\nfix(ssa): Mislabeled instructions with side effects in\nEnableSideEffectsIf removal pass\n(https://github.com/noir-lang/noir/pull/8355)\nfeat: SSA pass impact report\n(https://github.com/noir-lang/noir/pull/8393)\nchore: bump external pinned commits\n(https://github.com/noir-lang/noir/pull/8433)\nchore: separate benchmarking from github actions more\n(https://github.com/noir-lang/noir/pull/7943)\nchore(fuzz): Break up the AST fuzzer `compare` module\n(https://github.com/noir-lang/noir/pull/8431)\nchore(fuzz): Rename `init_vs_final` to `min_vs_full`\n(https://github.com/noir-lang/noir/pull/8430)\nfix!: error on tuple mismatch\n(https://github.com/noir-lang/noir/pull/8424)\nchore: bump external pinned commits\n(https://github.com/noir-lang/noir/pull/8429)\nchore(acir): Test whether the predicate has an effect on slice\nintrinsics (https://github.com/noir-lang/noir/pull/8421)\nfeat(ssa): Mark transitively dead parameters during DIE\n(https://github.com/noir-lang/noir/pull/8254)\nfix(ssa_gen): Do not code gen fetching of empty arrays when initializing\nthe data bus (https://github.com/noir-lang/noir/pull/8426)\nchore: remove `.aztec-sync-commit`\n(https://github.com/noir-lang/noir/pull/8415)\nchore(test): Add more unit tests for\n`inline_functions_with_at_most_one_instruction`\n(https://github.com/noir-lang/noir/pull/8418)\nchore: add minor docs for interpreter\n(https://github.com/noir-lang/noir/pull/8397)\nfix: print slice composite types surrounded by parentheses\n(https://github.com/noir-lang/noir/pull/8412)\nfeat: Skip SSA passes that contain any of the given messages\n(https://github.com/noir-lang/noir/pull/8416)\nfix: disable range constraints using the predicate\n(https://github.com/noir-lang/noir/pull/8396)\nchore: bumping external libraries\n(https://github.com/noir-lang/noir/pull/8406)\nchore: redo typo PR by shystrui1199\n(https://github.com/noir-lang/noir/pull/8405)\nfeat(test): add `nargo_fuzz_target`\n(https://github.com/noir-lang/noir/pull/8308)\nfix: allow names to collide in the values/types namespaces\n(https://github.com/noir-lang/noir/pull/8286)\nfix: Fix sequencing of side-effects in lvalue\n(https://github.com/noir-lang/noir/pull/8384)\nfeat(greybox_fuzzer): Maximum executions parameter added\n(https://github.com/noir-lang/noir/pull/8390)\nfix: warn on and discard unreachable statements after break and continue\n(https://github.com/noir-lang/noir/pull/8382)\nfix: add handling for u128 infix ops in interpreter\n(https://github.com/noir-lang/noir/pull/8392)\nchore: move acirgen tests into separate file\n(https://github.com/noir-lang/noir/pull/8376)\nfeat(fuzz): initial version of comptime vs brillig target for AST fuzzer\n(https://github.com/noir-lang/noir/pull/8335)\nchore: apply lints to `ast_fuzzer`\n(https://github.com/noir-lang/noir/pull/8386)\nchore: add note on AI generated PRs in `CONTRIBUTING.md`\n(https://github.com/noir-lang/noir/pull/8385)\nchore: document flattening pass\n(https://github.com/noir-lang/noir/pull/8312)\nfix: comptime shift-right overflow is zero\n(https://github.com/noir-lang/noir/pull/8380)\nfeat: let static_assert accept any type for its message\n(https://github.com/noir-lang/noir/pull/8322)\nfix(expand): output safety comment before statements\n(https://github.com/noir-lang/noir/pull/8378)\nchore: avoid need to rebuild after running tests\n(https://github.com/noir-lang/noir/pull/8379)\nchore: bump dependencies (https://github.com/noir-lang/noir/pull/8372)\nchore: Add GITHUB_TOKEN to cross build\n(https://github.com/noir-lang/noir/pull/8370)\nchore: redo typo PR by GarmashAlex\n(https://github.com/noir-lang/noir/pull/8364)\nchore: remove unsafe code from greybox fuzzer\n(https://github.com/noir-lang/noir/pull/8315)\nfeat: add `--fuzz-timeout` to `nargo test` options\n(https://github.com/noir-lang/noir/pull/8326)\nchore: bump external pinned commits\n(https://github.com/noir-lang/noir/pull/8334)\nfix(expand): try to use \"Self\" in function calls\n(https://github.com/noir-lang/noir/pull/8353)\nfix: Fix evaluation order of assignments with side-effects in their rhs\n(https://github.com/noir-lang/noir/pull/8342)\nfix: let comptime Field value carry the field's sign\n(https://github.com/noir-lang/noir/pull/8343)\nfix: Ordering of items in callstacks\n(https://github.com/noir-lang/noir/pull/8338)\nchore: add snapshosts for nargo expand tests\n(https://github.com/noir-lang/noir/pull/8318)\nfix(ownership): Clone global arrays\n(https://github.com/noir-lang/noir/pull/8328)\nchore: Replace all SSA interpreter panics with error variants\n(https://github.com/noir-lang/noir/pull/8311)\nfeat: Metamorphic AST fuzzing\n(https://github.com/noir-lang/noir/pull/8299)\nfix: fix some Display implementations for AST nodes\n(https://github.com/noir-lang/noir/pull/8316)\nchore: remove leftover file\n(https://github.com/noir-lang/noir/pull/8313)\nfix: uses non-zero points with ec-add-unsafe\n(https://github.com/noir-lang/noir/pull/8248)\nEND_COMMIT_OVERRIDE\n\n---------\n\nCo-authored-by: AztecBot <tech@aztecprotocol.com>\nCo-authored-by: Tom French <15848336+TomAFrench@users.noreply.github.com>",
          "timestamp": "2025-05-12T14:45:07Z",
          "tree_id": "47cde8e9ec89c713527d7a8ca7927728fc44acc8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/60dbe1a5a0287aebb51f41259dc2be0f90e30b62"
        },
        "date": 1747065446028,
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
          "distinct": false,
          "id": "4fe0c9afc4cb91d45f3068b96001e5833550fda2",
          "message": "feat: translator merge consistency check!  (#14098)\n\nEnsure final merge and translator operate on the same op queue by\nvalidating the full table commitments received by the final merge\nverifier and the witness commitments in translator verifier\ncorresponding to the op queue. To achieve this with shifts working\ncorrectly in translator, we need to introduce functionality that adds\ndata to the ultra version of the op queue without affecting vm\noperations, currently just a no-op operation.",
          "timestamp": "2025-05-12T15:47:39Z",
          "tree_id": "f20beac57382c5d07a8b50217e409b5e910c8140",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/4fe0c9afc4cb91d45f3068b96001e5833550fda2"
        },
        "date": 1747066951831,
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
      },
      {
        "commit": {
          "author": {
            "email": "saleel@aztecprotocol.com",
            "name": "saleel",
            "username": "saleel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": false,
          "id": "b77d35bb49af914906ecf2086d8a6711409f2acb",
          "message": "feat(playground): handle struct types, display contractClassId, fix input types (#14223)",
          "timestamp": "2025-05-12T16:04:47Z",
          "tree_id": "a83a4a5b572cb794ff1cf0b25a0992cf62e955a5",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/b77d35bb49af914906ecf2086d8a6711409f2acb"
        },
        "date": 1747067837726,
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
          "distinct": false,
          "id": "09a0b71b998eee81bdbd2c37a579ccd56f413f6d",
          "message": "fix: don't call noir_sync just to clean noir folder (#14193)\n\nWe have a chicken and egg problem cleaning noir right now",
          "timestamp": "2025-05-12T16:49:57Z",
          "tree_id": "eab0d413072e1cb6af76a50bee22df6fca206dad",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/09a0b71b998eee81bdbd2c37a579ccd56f413f6d"
        },
        "date": 1747071774899,
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
          "distinct": false,
          "id": "1318fb4e5320b4bd61d5f40b5c44bcc7e365d872",
          "message": "chore(rollup): add function to trigger seed snapshot for next epoch (#13910)\n\n## Overview\nAdds cli arg to set the seed for the next epoch, much cheaper than\nperforming the whole sampling",
          "timestamp": "2025-05-12T17:12:52Z",
          "tree_id": "e490d86931d02601676697297561560423ed4b00",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1318fb4e5320b4bd61d5f40b5c44bcc7e365d872"
        },
        "date": 1747074060786,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "forward (100_validators)",
            "value": 639571,
            "unit": "gas"
          },
          {
            "name": "forward (100_validators) per l2 tx",
            "value": 1776.59,
            "unit": "gas"
          },
          {
            "name": "forward (no_validators)",
            "value": 312354,
            "unit": "gas"
          },
          {
            "name": "forward (no_validators) per l2 tx",
            "value": 867.65,
            "unit": "gas"
          },
          {
            "name": "forward (overhead)",
            "value": 327217,
            "unit": "gas"
          },
          {
            "name": "forward (overhead) per l2 tx",
            "value": 908.94,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (100_validators)",
            "value": 1579009,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (100_validators) per l2 tx",
            "value": 137.07,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (no_validators)",
            "value": 67905,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (no_validators) per l2 tx",
            "value": 5.89,
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
          "distinct": false,
          "id": "1c2226eb54b8b1b5e8a94f9466e879d3e731c1a7",
          "message": "chore: redo typo PR by shystrui1199 (#14227)\n\nThanks shystrui1199 for\nhttps://github.com/AztecProtocol/aztec-packages/pull/14226. Our policy\nis to redo typo changes to dissuade metric farming. This is an automated\nscript.\n\nCo-authored-by: AztecBot <tech@aztecprotocol.com>",
          "timestamp": "2025-05-12T17:44:07Z",
          "tree_id": "738efdbc2f388b743330aa5dd07de3bf8a067ce0",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1c2226eb54b8b1b5e8a94f9466e879d3e731c1a7"
        },
        "date": 1747075815455,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "forward (100_validators)",
            "value": 639571,
            "unit": "gas"
          },
          {
            "name": "forward (100_validators) per l2 tx",
            "value": 1776.59,
            "unit": "gas"
          },
          {
            "name": "forward (no_validators)",
            "value": 312354,
            "unit": "gas"
          },
          {
            "name": "forward (no_validators) per l2 tx",
            "value": 867.65,
            "unit": "gas"
          },
          {
            "name": "forward (overhead)",
            "value": 327217,
            "unit": "gas"
          },
          {
            "name": "forward (overhead) per l2 tx",
            "value": 908.94,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (100_validators)",
            "value": 1579009,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (100_validators) per l2 tx",
            "value": 137.07,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (no_validators)",
            "value": 67905,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (no_validators) per l2 tx",
            "value": 5.89,
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
          "distinct": false,
          "id": "eda5cc8f20cd5acf14d1d0513234e86dbc13875f",
          "message": "fix: Delete txs and attestations from p2p pool on finalized blocks (#14200)\n\nInstead of relying on config variables for choosing how long to keep\nproven txs and attestations, rely on finalized blocks instead.\n\n**Breaking**: Removes env vars `P2P_TX_POOL_KEEP_PROVEN_FOR` and\n`P2P_ATTESTATION_POOL_KEEP_FOR` (cc @devrel).\n    \nFixes #13575",
          "timestamp": "2025-05-12T18:24:09Z",
          "tree_id": "067801c2d4fddc7239604c8b47c8d7a0bc32f71c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/eda5cc8f20cd5acf14d1d0513234e86dbc13875f"
        },
        "date": 1747076330360,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "forward (100_validators)",
            "value": 639571,
            "unit": "gas"
          },
          {
            "name": "forward (100_validators) per l2 tx",
            "value": 1776.59,
            "unit": "gas"
          },
          {
            "name": "forward (no_validators)",
            "value": 312354,
            "unit": "gas"
          },
          {
            "name": "forward (no_validators) per l2 tx",
            "value": 867.65,
            "unit": "gas"
          },
          {
            "name": "forward (overhead)",
            "value": 327217,
            "unit": "gas"
          },
          {
            "name": "forward (overhead) per l2 tx",
            "value": 908.94,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (100_validators)",
            "value": 1579009,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (100_validators) per l2 tx",
            "value": 137.07,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (no_validators)",
            "value": 67905,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (no_validators) per l2 tx",
            "value": 5.89,
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
          "id": "c9d894c2f7e38d4e7b9f4a63865629111bca31ee",
          "message": "chore: Fix l1-reorg e2e flakes (#14218)\n\nAttempted fixes for:\n\n```\n13:15:46  FAIL  src/e2e_epochs/epochs_l1_reorgs.test.ts (322.03 s)\n13:15:46   e2e_epochs/epochs_l1_reorgs\n13:15:46     ✓ prunes L2 blocks if a proof is removed due to an L1 reorg (77417 ms)\n13:15:46     ✓ does not prune if a second proof lands within the submission window after the first one is reorged out (68186 ms)\n13:15:46     ✕ restores L2 blocks if a proof is added due to an L1 reorg (72522 ms)\n13:15:46     ✓ prunes L2 blocks from pending chain removed from L1 due to an L1 reorg (48771 ms)\n13:15:46     ✓ sees new blocks added in an L1 reorg (48871 ms)\n13:15:46     ○ skipped updates cross-chain messages changed due to an L1 reorg\n13:15:46 \n13:15:46   ● e2e_epochs/epochs_l1_reorgs › restores L2 blocks if a proof is added due to an L1 reorg\n13:15:46 \n13:15:46     expect(received).resolves.toEqual(expected) // deep equality\n13:15:46 \n13:15:46     Expected: 2\n13:15:46     Received: 0\n13:15:46 \n13:15:46       149 |     // And so the node undoes its reorg\n13:15:46       150 |     await retryUntil(() => node.getBlockNumber().then(b => b === monitor.l2BlockNumber), 'node sync', syncTimeout, 0.1);\n13:15:46     > 151 |     await expect(node.getProvenBlockNumber()).resolves.toEqual(monitor.l2ProvenBlockNumber);\n13:15:46           |                                                        ^\n13:15:46       152 |\n13:15:46       153 |     logger.warn(`Test succeeded`);\n13:15:46       154 |   });\n13:15:46 \n13:15:46       at Object.toEqual (../../node_modules/expect/build/index.js:174:22)\n13:15:46       at Object.toEqual (e2e_epochs/epochs_l1_reorgs.test.ts:151:56)\n```\n\n(link to run [here](http://ci.aztec-labs.com/46d88c7dd30334d2))\n\n```\n10:34:18  FAIL  src/e2e_epochs/epochs_l1_reorgs.test.ts\n10:34:18   e2e_epochs/epochs_l1_reorgs\n10:34:18     ✕ prunes L2 blocks if a proof is removed due to an L1 reorg (45473 ms)\n10:34:18     ✓ does not prune if a second proof lands within the submission window after the first one is reorged out (68275 ms)\n10:34:18     ✓ restores L2 blocks if a proof is added due to an L1 reorg (73214 ms)\n10:34:18     ✓ prunes L2 blocks from pending chain removed from L1 due to an L1 reorg (48365 ms)\n10:34:18     ✓ sees new blocks added in an L1 reorg (48927 ms)\n10:34:18     ○ skipped updates cross-chain messages changed due to an L1 reorg\n10:34:18 \n10:34:18   ● e2e_epochs/epochs_l1_reorgs › prunes L2 blocks if a proof is removed due to an L1 reorg\n10:34:18 \n10:34:18     expect(received).toEqual(expected) // deep equality\n10:34:18 \n10:34:18     Expected: 0\n10:34:18     Received: 2\n10:34:18 \n10:34:18       59 |     await context.cheatCodes.eth.reorg(2);\n10:34:18       60 |     await monitor.run();\n10:34:18     > 61 |     expect(monitor.l2ProvenBlockNumber).toEqual(0);\n10:34:18          |                                         ^\n10:34:18       62 |\n10:34:18       63 |     // Wait until the end of the proof submission window for the first epoch\n10:34:18       64 |     await test.waitUntilEndOfProofSubmissionWindow(0);\n10:34:18 \n10:34:18       at Object.toEqual (e2e_epochs/epochs_l1_reorgs.test.ts:61:41)\n```\n\n(link to run [here](http://ci.aztec-labs.com/acafe11a371dc863))",
          "timestamp": "2025-05-12T18:30:57Z",
          "tree_id": "66dd3dac1a10071920a73e5f7b50501fb3ceabb0",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c9d894c2f7e38d4e7b9f4a63865629111bca31ee"
        },
        "date": 1747077135898,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "forward (100_validators)",
            "value": 639571,
            "unit": "gas"
          },
          {
            "name": "forward (100_validators) per l2 tx",
            "value": 1776.59,
            "unit": "gas"
          },
          {
            "name": "forward (no_validators)",
            "value": 312354,
            "unit": "gas"
          },
          {
            "name": "forward (no_validators) per l2 tx",
            "value": 867.65,
            "unit": "gas"
          },
          {
            "name": "forward (overhead)",
            "value": 327217,
            "unit": "gas"
          },
          {
            "name": "forward (overhead) per l2 tx",
            "value": 908.94,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (100_validators)",
            "value": 1579009,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (100_validators) per l2 tx",
            "value": 137.07,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (no_validators)",
            "value": 67905,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (no_validators) per l2 tx",
            "value": 5.89,
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
          "id": "bbc532c663d7ff342420bba6ed00875a263f2039",
          "message": "chore: Fix flake in validator sentinel (#14232)\n\nFixes flake\n\n```\n17:54:55  FAIL  src/e2e_p2p/validators_sentinel.test.ts\n17:54:55   e2e_p2p_validators_sentinel\n17:54:55     with an offline validator\n17:54:55       ✓ collects stats on offline validator (7 ms)\n17:54:55       ✓ collects stats on a block builder (3 ms)\n17:54:55       ✓ collects stats on an attestor (6 ms)\n17:54:55       ✕ starts a sentinel on a fresh node (48514 ms)\n17:54:55 \n17:54:55   ● e2e_p2p_validators_sentinel › with an offline validator › starts a sentinel on a fresh node\n17:54:55 \n17:54:55     expect(received).toBeGreaterThan(expected)\n17:54:55 \n17:54:55     Expected: > 1\n17:54:55     Received:   1\n17:54:55 \n17:54:55       162 |       expect(stats.stats[newNodeValidator]).toBeDefined();\n17:54:55       163 |       expect(stats.stats[newNodeValidator].history.length).toBeGreaterThanOrEqual(1);\n17:54:55     > 164 |       expect(Object.keys(stats.stats).length).toBeGreaterThan(1);\n17:54:55           |                                               ^\n17:54:55       165 |     });\n17:54:55       166 |   });\n17:54:55       167 | });\n17:54:55 \n17:54:55       at Object.toBeGreaterThan (e2e_p2p/validators_sentinel.test.ts:164:47)\n```",
          "timestamp": "2025-05-12T19:22:07Z",
          "tree_id": "2c03c9404d78944254554065345b1ba5f14d0fe2",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/bbc532c663d7ff342420bba6ed00875a263f2039"
        },
        "date": 1747080343500,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "forward (100_validators)",
            "value": 639571,
            "unit": "gas"
          },
          {
            "name": "forward (100_validators) per l2 tx",
            "value": 1776.59,
            "unit": "gas"
          },
          {
            "name": "forward (no_validators)",
            "value": 312354,
            "unit": "gas"
          },
          {
            "name": "forward (no_validators) per l2 tx",
            "value": 867.65,
            "unit": "gas"
          },
          {
            "name": "forward (overhead)",
            "value": 327217,
            "unit": "gas"
          },
          {
            "name": "forward (overhead) per l2 tx",
            "value": 908.94,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (100_validators)",
            "value": 1579009,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (100_validators) per l2 tx",
            "value": 137.07,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (no_validators)",
            "value": 67905,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (no_validators) per l2 tx",
            "value": 5.89,
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
          "id": "55c4136cec17c1fc2e12a73073ed61ecfaa75e45",
          "message": "chore: nuke validator add cheatcode (#14191)\n\nFixes #12050.\n\nAdds a tiny `MultiAdder` that can be used to add a bunch of validators\nat once. I could be done similarly with a multicall and a proxy, but\nthis seemed the simplest for my case.",
          "timestamp": "2025-05-12T21:17:59Z",
          "tree_id": "45aaf796af94d8c886a9d8f5f94d9d870c2dedbe",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/55c4136cec17c1fc2e12a73073ed61ecfaa75e45"
        },
        "date": 1747087160553,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "forward (100_validators)",
            "value": 639593,
            "unit": "gas"
          },
          {
            "name": "forward (100_validators) per l2 tx",
            "value": 1776.65,
            "unit": "gas"
          },
          {
            "name": "forward (no_validators)",
            "value": 312376,
            "unit": "gas"
          },
          {
            "name": "forward (no_validators) per l2 tx",
            "value": 867.71,
            "unit": "gas"
          },
          {
            "name": "forward (overhead)",
            "value": 327217,
            "unit": "gas"
          },
          {
            "name": "forward (overhead) per l2 tx",
            "value": 908.94,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (100_validators)",
            "value": 1579031,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (100_validators) per l2 tx",
            "value": 137.07,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (no_validators)",
            "value": 67927,
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
          "id": "39f837c2cebc3739036dab6290c0017d1bd9f538",
          "message": "git subrepo push --branch=master noir-projects/aztec-nr\n\nsubrepo:\n  subdir:   \"noir-projects/aztec-nr\"\n  merged:   \"e851b303b5\"\nupstream:\n  origin:   \"https://github.com/AztecProtocol/aztec-nr\"\n  branch:   \"master\"\n  commit:   \"e851b303b5\"\ngit-subrepo:\n  version:  \"0.4.6\"\n  origin:   \"???\"\n  commit:   \"???\"",
          "timestamp": "2025-05-13T02:32:36Z",
          "tree_id": "6dbfcf796432382b5faddc9dd653905fda1314ed",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/39f837c2cebc3739036dab6290c0017d1bd9f538"
        },
        "date": 1747105555600,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "forward (100_validators)",
            "value": 639593,
            "unit": "gas"
          },
          {
            "name": "forward (100_validators) per l2 tx",
            "value": 1776.65,
            "unit": "gas"
          },
          {
            "name": "forward (no_validators)",
            "value": 312376,
            "unit": "gas"
          },
          {
            "name": "forward (no_validators) per l2 tx",
            "value": 867.71,
            "unit": "gas"
          },
          {
            "name": "forward (overhead)",
            "value": 327217,
            "unit": "gas"
          },
          {
            "name": "forward (overhead) per l2 tx",
            "value": 908.94,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (100_validators)",
            "value": 1579031,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (100_validators) per l2 tx",
            "value": 137.07,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (no_validators)",
            "value": 67927,
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
      },
      {
        "commit": {
          "author": {
            "email": "lucasxia01@gmail.com",
            "name": "Lucas Xia",
            "username": "lucasxia01"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": false,
          "id": "e8147081ccda54ea590b150b1b9584add99e2083",
          "message": "feat: remove extra pairing point aggregation batch_mul (#14219)\n\nCloses https://github.com/AztecProtocol/barretenberg/issues/1325.\n\nWe are currently doing pairing point aggregation with a batchmul of size\n1 in operator* and then another batchmul of size 2 in operator+. If we\njust directly do it, we can do it with just 1 batchmul of size 2. This\ndrops the number of transcript rows in the ECCVM, but doesn't affect the\nactual number of rows because the MSM builder row count dominates it by\na significant margin.",
          "timestamp": "2025-05-13T10:29:27Z",
          "tree_id": "550262948cc8af2ee7a5c85722a7807d033b7789",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e8147081ccda54ea590b150b1b9584add99e2083"
        },
        "date": 1747135873478,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "forward (100_validators)",
            "value": 639593,
            "unit": "gas"
          },
          {
            "name": "forward (100_validators) per l2 tx",
            "value": 1776.65,
            "unit": "gas"
          },
          {
            "name": "forward (no_validators)",
            "value": 312376,
            "unit": "gas"
          },
          {
            "name": "forward (no_validators) per l2 tx",
            "value": 867.71,
            "unit": "gas"
          },
          {
            "name": "forward (overhead)",
            "value": 327217,
            "unit": "gas"
          },
          {
            "name": "forward (overhead) per l2 tx",
            "value": 908.94,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (100_validators)",
            "value": 1579031,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (100_validators) per l2 tx",
            "value": 137.07,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (no_validators)",
            "value": 67927,
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
          "distinct": false,
          "id": "5e0b14bd09aa2130797989f7773d31f4e2565f1c",
          "message": "chore: Bump Noir reference (#14233)\n\nAutomated pull of nightly from the\n[noir](https://github.com/noir-lang/noir) programming language, a\ndependency of Aztec.\nBEGIN_COMMIT_OVERRIDE\nfix: sign extend in signed cast\n(https://github.com/noir-lang/noir/pull/8264)\nchore(fuzz): Do not use zero length types in the main input output\n(https://github.com/noir-lang/noir/pull/8465)\nchore: fix visibility issues in test suite\n(https://github.com/noir-lang/noir/pull/8454)\nchore: blackbox functions for ssa intepreter\n(https://github.com/noir-lang/noir/pull/8375)\nfeat: improve bitshift codegen\n(https://github.com/noir-lang/noir/pull/8442)\nfix(ssa): Mark mutually recursive simple functions\n(https://github.com/noir-lang/noir/pull/8447)\nfix: Fix nested trait dispatch with associated types\n(https://github.com/noir-lang/noir/pull/8440)\nchore: carry visibilities in monomorphized AST\n(https://github.com/noir-lang/noir/pull/8439)\nchore(tests): Add regression for now passing test\n(https://github.com/noir-lang/noir/pull/8441)\nchore: use human-readable bytecode in snapshots\n(https://github.com/noir-lang/noir/pull/8164)\nchore: bump external pinned commits\n(https://github.com/noir-lang/noir/pull/8445)\nEND_COMMIT_OVERRIDE\n\n---------\n\nCo-authored-by: AztecBot <tech@aztecprotocol.com>\nCo-authored-by: Tom French <15848336+TomAFrench@users.noreply.github.com>",
          "timestamp": "2025-05-13T10:47:52Z",
          "tree_id": "5e6c2872d1f7ffb8acb86b7ede0eca788250ffb7",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5e0b14bd09aa2130797989f7773d31f4e2565f1c"
        },
        "date": 1747137028649,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "forward (100_validators)",
            "value": 639593,
            "unit": "gas"
          },
          {
            "name": "forward (100_validators) per l2 tx",
            "value": 1776.65,
            "unit": "gas"
          },
          {
            "name": "forward (no_validators)",
            "value": 312376,
            "unit": "gas"
          },
          {
            "name": "forward (no_validators) per l2 tx",
            "value": 867.71,
            "unit": "gas"
          },
          {
            "name": "forward (overhead)",
            "value": 327217,
            "unit": "gas"
          },
          {
            "name": "forward (overhead) per l2 tx",
            "value": 908.94,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (100_validators)",
            "value": 1579031,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (100_validators) per l2 tx",
            "value": 137.07,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (no_validators)",
            "value": 67927,
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
          "id": "3aa76742d0b25f941daa2ae566d0beb9393e5061",
          "message": "fix: incorrectly computing l2 to l1 msg subtree root (#14240)\n\nFixes #14174\n\n@MirandaWood managed to figure out that we did not correctly compute the\nmessage subtree root for a tx with no messages.\n\nIn a followup PR I will merge the e2e_outbox and l2_to_l1 e2e tests as\nhaving them separated is purely a tech debt. I will also consider\ncleaning up `AztecNodeService.getL2ToL1MessageMembershipWitness`.",
          "timestamp": "2025-05-13T12:14:00Z",
          "tree_id": "d8b5d2b9b851aa1ce7a90abfaac54f6fdca024a1",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/3aa76742d0b25f941daa2ae566d0beb9393e5061"
        },
        "date": 1747142472934,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "forward (100_validators)",
            "value": 639593,
            "unit": "gas"
          },
          {
            "name": "forward (100_validators) per l2 tx",
            "value": 1776.65,
            "unit": "gas"
          },
          {
            "name": "forward (no_validators)",
            "value": 312376,
            "unit": "gas"
          },
          {
            "name": "forward (no_validators) per l2 tx",
            "value": 867.71,
            "unit": "gas"
          },
          {
            "name": "forward (overhead)",
            "value": 327217,
            "unit": "gas"
          },
          {
            "name": "forward (overhead) per l2 tx",
            "value": 908.94,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (100_validators)",
            "value": 1579031,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (100_validators) per l2 tx",
            "value": 137.07,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (no_validators)",
            "value": 67927,
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
          "distinct": false,
          "id": "0592163c0eef7e64a4f961b818923441b06dff43",
          "message": "chore: utility func attr without full path in the artifact (#13892)\n\nWith https://github.com/noir-lang/noir/issues/7912 issue now being\ntackled I remove the original workaround from the codebase. Getting rid\nof the full path from the ABI makes our TS codebase cleaner.\n\n~Currently blocked by https://github.com/noir-lang/noir/issues/8255~",
          "timestamp": "2025-05-13T13:14:25Z",
          "tree_id": "4eca4b6fc764281463662607ceb3dd3787768df8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0592163c0eef7e64a4f961b818923441b06dff43"
        },
        "date": 1747143913483,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "forward (100_validators)",
            "value": 639593,
            "unit": "gas"
          },
          {
            "name": "forward (100_validators) per l2 tx",
            "value": 1776.65,
            "unit": "gas"
          },
          {
            "name": "forward (no_validators)",
            "value": 312376,
            "unit": "gas"
          },
          {
            "name": "forward (no_validators) per l2 tx",
            "value": 867.71,
            "unit": "gas"
          },
          {
            "name": "forward (overhead)",
            "value": 327217,
            "unit": "gas"
          },
          {
            "name": "forward (overhead) per l2 tx",
            "value": 908.94,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (100_validators)",
            "value": 1579031,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (100_validators) per l2 tx",
            "value": 137.07,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (no_validators)",
            "value": 67927,
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
          "distinct": false,
          "id": "8ca9cda6c42c4461f303eed2d94542fc2d9564ee",
          "message": "chore: enable zk-related relation correctness tests in Translator and better handling of const sizes (#14224)\n\nWe merged a micro-optimisation of initialising Translator\nProverPolynomials strictly on their actual mini circuit size. This gets\nin the way of being able to hide such polynomials and, in fact, the\nability to run ZK correctly (hence having the relation correctness tests\nwith zk commented out). As this optimisation is not necessary to ensure\nTranslator is within the WASM memory limits, we roll back to having the\npolynomials initialised on the appropriate fixed sizes. I also attempted\nto cleanup up our initialisation of mini and dyadic circuit size with\nconstants within Translator.",
          "timestamp": "2025-05-13T13:58:19Z",
          "tree_id": "02a3456b2308fec31318c65909f5c275e63a6638",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8ca9cda6c42c4461f303eed2d94542fc2d9564ee"
        },
        "date": 1747148606780,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "forward (100_validators)",
            "value": 639593,
            "unit": "gas"
          },
          {
            "name": "forward (100_validators) per l2 tx",
            "value": 1776.65,
            "unit": "gas"
          },
          {
            "name": "forward (no_validators)",
            "value": 312376,
            "unit": "gas"
          },
          {
            "name": "forward (no_validators) per l2 tx",
            "value": 867.71,
            "unit": "gas"
          },
          {
            "name": "forward (overhead)",
            "value": 327217,
            "unit": "gas"
          },
          {
            "name": "forward (overhead) per l2 tx",
            "value": 908.94,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (100_validators)",
            "value": 1579031,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (100_validators) per l2 tx",
            "value": 137.07,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (no_validators)",
            "value": 67927,
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
          "id": "344a3f53a32d329dfa7a48bb38f88e894e7326cf",
          "message": "fix: bad quoting in noir bootstrap (#14260)\n\nIt was breaking direct calls to noir/bootstrap.sh and release action",
          "timestamp": "2025-05-13T16:39:09+01:00",
          "tree_id": "2bc4bb41a9bf964450fbe77bc57e8a4328ae0097",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/344a3f53a32d329dfa7a48bb38f88e894e7326cf"
        },
        "date": 1747152155231,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "forward (100_validators)",
            "value": 639593,
            "unit": "gas"
          },
          {
            "name": "forward (100_validators) per l2 tx",
            "value": 1776.65,
            "unit": "gas"
          },
          {
            "name": "forward (no_validators)",
            "value": 312376,
            "unit": "gas"
          },
          {
            "name": "forward (no_validators) per l2 tx",
            "value": 867.71,
            "unit": "gas"
          },
          {
            "name": "forward (overhead)",
            "value": 327217,
            "unit": "gas"
          },
          {
            "name": "forward (overhead) per l2 tx",
            "value": 908.94,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (100_validators)",
            "value": 1579031,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (100_validators) per l2 tx",
            "value": 137.07,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (no_validators)",
            "value": 67927,
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
          "distinct": false,
          "id": "02e7b91bf991660e6dcf3d503af904289aac23c0",
          "message": "fix: remove default prover-agent limits (#14256)\n\nRemove default limits as they were interfering with greater resource\nrequests in rc-1.yaml.",
          "timestamp": "2025-05-13T15:25:07Z",
          "tree_id": "6e84477e6ecbc064ceb5600e9af780299b37b7b0",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/02e7b91bf991660e6dcf3d503af904289aac23c0"
        },
        "date": 1747153499937,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "forward (100_validators)",
            "value": 639593,
            "unit": "gas"
          },
          {
            "name": "forward (100_validators) per l2 tx",
            "value": 1776.65,
            "unit": "gas"
          },
          {
            "name": "forward (no_validators)",
            "value": 312376,
            "unit": "gas"
          },
          {
            "name": "forward (no_validators) per l2 tx",
            "value": 867.71,
            "unit": "gas"
          },
          {
            "name": "forward (overhead)",
            "value": 327217,
            "unit": "gas"
          },
          {
            "name": "forward (overhead) per l2 tx",
            "value": 908.94,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (100_validators)",
            "value": 1579031,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (100_validators) per l2 tx",
            "value": 137.07,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (no_validators)",
            "value": 67927,
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
          "distinct": false,
          "id": "2b218153e3ecbec6096436ee227ee082f67f9823",
          "message": "chore: automatically run formatter as part of sync (#13365)\n\nThis PR runs the formatter over all of `noir-projects` when syncing.\n`noir-projects` now has a `format` command to run the formatter on all\nof its noir files.\n\n---------\n\nCo-authored-by: AztecBot <tech@aztecprotocol.com>",
          "timestamp": "2025-05-13T15:45:22Z",
          "tree_id": "7d05391ca99cd5d29820d9939b8620fd480a8963",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/2b218153e3ecbec6096436ee227ee082f67f9823"
        },
        "date": 1747157173823,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "forward (100_validators)",
            "value": 639593,
            "unit": "gas"
          },
          {
            "name": "forward (100_validators) per l2 tx",
            "value": 1776.65,
            "unit": "gas"
          },
          {
            "name": "forward (no_validators)",
            "value": 312376,
            "unit": "gas"
          },
          {
            "name": "forward (no_validators) per l2 tx",
            "value": 867.71,
            "unit": "gas"
          },
          {
            "name": "forward (overhead)",
            "value": 327217,
            "unit": "gas"
          },
          {
            "name": "forward (overhead) per l2 tx",
            "value": 908.94,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (100_validators)",
            "value": 1579031,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (100_validators) per l2 tx",
            "value": 137.07,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (no_validators)",
            "value": 67927,
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
          "distinct": false,
          "id": "5783cd6ce20240dfd6283d4c4e3de2f44fada9a0",
          "message": "fix: use axios for HttpFileStore (#14231)",
          "timestamp": "2025-05-13T17:04:05Z",
          "tree_id": "4c029d036d3a50b7eebb01a89aeb3ba0e4942e76",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5783cd6ce20240dfd6283d4c4e3de2f44fada9a0"
        },
        "date": 1747164111195,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "forward (100_validators)",
            "value": 639593,
            "unit": "gas"
          },
          {
            "name": "forward (100_validators) per l2 tx",
            "value": 1776.65,
            "unit": "gas"
          },
          {
            "name": "forward (no_validators)",
            "value": 312376,
            "unit": "gas"
          },
          {
            "name": "forward (no_validators) per l2 tx",
            "value": 867.71,
            "unit": "gas"
          },
          {
            "name": "forward (overhead)",
            "value": 327217,
            "unit": "gas"
          },
          {
            "name": "forward (overhead) per l2 tx",
            "value": 908.94,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (100_validators)",
            "value": 1579031,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (100_validators) per l2 tx",
            "value": 137.07,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (no_validators)",
            "value": 67927,
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
          "distinct": false,
          "id": "654d519e32d5a078d7e5815536c3b499d670d2ab",
          "message": "fix!: Handle L1 reorgs on cross-chain messages (#14151)\n\n## L1 contracts\n\n- Adds a `rollingHash` computed over all L1 to L2 messages as they are\nreceived, which gets emitted with each message and kept in storage.\n- Adds a `getState` method that returns both rolling hash and total\ncount of messages, used for syncing.\n\n## Message store\n\n- Changes keys from strings to numbers so they are properly ordered\n- Checks message consistency on insertion (indices, rolling hashes, l2\nblock numbers, etc)\n- Adds method to iterate over arbitrary ranges of messages\n- Stores message metadata (l1 block number, l2 block number, rolling\nhash, etc) along with each leaf\n- Deletes unused in-memory message store\n\n## Archiver\n\n- Compares local messages rolling hash vs the one on the Inbox contract\nto determine if it needs to resync.\n- Before syncing, checks if the rolling hash for the latest message\ndownloaded matches; if not, it considers it a reorg and rolls back\nmessages until a common sync point.\n- Once syncing is completed, checks the resulting rolling hash with the\none obtained, and warns on mismatch.",
          "timestamp": "2025-05-13T17:07:53Z",
          "tree_id": "1c61df178a36b3e5efa54b6421037badaadc805b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/654d519e32d5a078d7e5815536c3b499d670d2ab"
        },
        "date": 1747165819483,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "forward (100_validators)",
            "value": 639651,
            "unit": "gas"
          },
          {
            "name": "forward (100_validators) per l2 tx",
            "value": 1776.81,
            "unit": "gas"
          },
          {
            "name": "forward (no_validators)",
            "value": 312434,
            "unit": "gas"
          },
          {
            "name": "forward (no_validators) per l2 tx",
            "value": 867.87,
            "unit": "gas"
          },
          {
            "name": "forward (overhead)",
            "value": 327217,
            "unit": "gas"
          },
          {
            "name": "forward (overhead) per l2 tx",
            "value": 908.94,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (100_validators)",
            "value": 1579031,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (100_validators) per l2 tx",
            "value": 137.07,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (no_validators)",
            "value": 67927,
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
      },
      {
        "commit": {
          "author": {
            "email": "saleel@aztecprotocol.com",
            "name": "saleel",
            "username": "saleel"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": false,
          "id": "c1312d323ce907e2180c05dcafef9b671fd2c50e",
          "message": "chore(playground): avoid contractClassID re-computation (#14279)",
          "timestamp": "2025-05-13T18:51:00Z",
          "tree_id": "57b0ac273c1a962258675657368255c9bfcf4571",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c1312d323ce907e2180c05dcafef9b671fd2c50e"
        },
        "date": 1747172975867,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "forward (100_validators)",
            "value": 639651,
            "unit": "gas"
          },
          {
            "name": "forward (100_validators) per l2 tx",
            "value": 1776.81,
            "unit": "gas"
          },
          {
            "name": "forward (no_validators)",
            "value": 312434,
            "unit": "gas"
          },
          {
            "name": "forward (no_validators) per l2 tx",
            "value": 867.87,
            "unit": "gas"
          },
          {
            "name": "forward (overhead)",
            "value": 327217,
            "unit": "gas"
          },
          {
            "name": "forward (overhead) per l2 tx",
            "value": 908.94,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (100_validators)",
            "value": 1579031,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (100_validators) per l2 tx",
            "value": 137.07,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (no_validators)",
            "value": 67927,
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
          "id": "1e1e31c5f1f5a58020b1df3484da6e9caacc0d86",
          "message": "chore: Added timestamp and message id debugging to p2p network (#14239)\n\nThis PR adds timestamps to all P2P messages. Debug logs the publishing\nand receipt of messages.",
          "timestamp": "2025-05-13T19:25:26Z",
          "tree_id": "d7f4d32ede0a1ae32d5fae25d2f1fb61cd0125ac",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1e1e31c5f1f5a58020b1df3484da6e9caacc0d86"
        },
        "date": 1747174801273,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "forward (100_validators)",
            "value": 639651,
            "unit": "gas"
          },
          {
            "name": "forward (100_validators) per l2 tx",
            "value": 1776.81,
            "unit": "gas"
          },
          {
            "name": "forward (no_validators)",
            "value": 312434,
            "unit": "gas"
          },
          {
            "name": "forward (no_validators) per l2 tx",
            "value": 867.87,
            "unit": "gas"
          },
          {
            "name": "forward (overhead)",
            "value": 327217,
            "unit": "gas"
          },
          {
            "name": "forward (overhead) per l2 tx",
            "value": 908.94,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (100_validators)",
            "value": 1579031,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (100_validators) per l2 tx",
            "value": 137.07,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (no_validators)",
            "value": 67927,
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
          "distinct": false,
          "id": "9f0dcc87221b4ccbe61713a77a52527176bad535",
          "message": "chore: bump noir commit (#14254)\n\nThis PR bumps the noir commit to unblock\nhttps://github.com/noir-lang/noir/pull/8470\n\n---------\n\nCo-authored-by: AztecBot <tech@aztecprotocol.com>\nCo-authored-by: Ary Borenszweig <asterite@gmail.com>",
          "timestamp": "2025-05-13T20:05:46Z",
          "tree_id": "0539eacd4b6a3a98742d6b7bbf599a9f67bb68c3",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9f0dcc87221b4ccbe61713a77a52527176bad535"
        },
        "date": 1747176718705,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "forward (100_validators)",
            "value": 639651,
            "unit": "gas"
          },
          {
            "name": "forward (100_validators) per l2 tx",
            "value": 1776.81,
            "unit": "gas"
          },
          {
            "name": "forward (no_validators)",
            "value": 312434,
            "unit": "gas"
          },
          {
            "name": "forward (no_validators) per l2 tx",
            "value": 867.87,
            "unit": "gas"
          },
          {
            "name": "forward (overhead)",
            "value": 327217,
            "unit": "gas"
          },
          {
            "name": "forward (overhead) per l2 tx",
            "value": 908.94,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (100_validators)",
            "value": 1579031,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (100_validators) per l2 tx",
            "value": 137.07,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (no_validators)",
            "value": 67927,
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
      },
      {
        "commit": {
          "author": {
            "email": "asterite@gmail.com",
            "name": "Ary Borenszweig",
            "username": "asterite"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": false,
          "id": "bc4ed623d3fea246f096cc99aca3573247fe03e6",
          "message": "fix: remove unused generic and specify some that can't be deduced (#14277)\n\nTowards https://github.com/noir-lang/noir/pull/7843\n\nThe added zeroes happen in test so it should be harmless. The zero is\nfor the `INITIAL_DELAY` which is likely unused in tests (otherwise it\nwould have failed to compile when needing that value).",
          "timestamp": "2025-05-13T20:58:26Z",
          "tree_id": "84f70a34841ff14a2e241bb987c541ca8e0f3bee",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/bc4ed623d3fea246f096cc99aca3573247fe03e6"
        },
        "date": 1747178481973,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "forward (100_validators)",
            "value": 639651,
            "unit": "gas"
          },
          {
            "name": "forward (100_validators) per l2 tx",
            "value": 1776.81,
            "unit": "gas"
          },
          {
            "name": "forward (no_validators)",
            "value": 312434,
            "unit": "gas"
          },
          {
            "name": "forward (no_validators) per l2 tx",
            "value": 867.87,
            "unit": "gas"
          },
          {
            "name": "forward (overhead)",
            "value": 327217,
            "unit": "gas"
          },
          {
            "name": "forward (overhead) per l2 tx",
            "value": 908.94,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (100_validators)",
            "value": 1579031,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (100_validators) per l2 tx",
            "value": 137.07,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (no_validators)",
            "value": 67927,
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
          "distinct": false,
          "id": "35f3be19d1068a609ba0e608115ed6c344e9fe49",
          "message": "test: adding missing L2 to L1 test case (#14249)\n\nWe had a missing L2 to L1 messaging test case and for that reason [this\nissue](https://github.com/AztecProtocol/aztec-packages/issues/14174) got\nin unnoticed.",
          "timestamp": "2025-05-13T22:43:13Z",
          "tree_id": "2de6f2363f38e1e14271b61c86e8e5321d7ba70e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/35f3be19d1068a609ba0e608115ed6c344e9fe49"
        },
        "date": 1747183062482,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "forward (100_validators)",
            "value": 639651,
            "unit": "gas"
          },
          {
            "name": "forward (100_validators) per l2 tx",
            "value": 1776.81,
            "unit": "gas"
          },
          {
            "name": "forward (no_validators)",
            "value": 312434,
            "unit": "gas"
          },
          {
            "name": "forward (no_validators) per l2 tx",
            "value": 867.87,
            "unit": "gas"
          },
          {
            "name": "forward (overhead)",
            "value": 327217,
            "unit": "gas"
          },
          {
            "name": "forward (overhead) per l2 tx",
            "value": 908.94,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (100_validators)",
            "value": 1579031,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (100_validators) per l2 tx",
            "value": 137.07,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (no_validators)",
            "value": 67927,
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
          "id": "bc8000dde397fc316a85c3d45dceec6867d2004d",
          "message": "git subrepo push --branch=master noir-projects/aztec-nr\n\nsubrepo:\n  subdir:   \"noir-projects/aztec-nr\"\n  merged:   \"0ac7e465dc\"\nupstream:\n  origin:   \"https://github.com/AztecProtocol/aztec-nr\"\n  branch:   \"master\"\n  commit:   \"0ac7e465dc\"\ngit-subrepo:\n  version:  \"0.4.6\"\n  origin:   \"???\"\n  commit:   \"???\"",
          "timestamp": "2025-05-14T02:32:17Z",
          "tree_id": "b4b87de3d51cf849bf08e51a083de0285beceab6",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/bc8000dde397fc316a85c3d45dceec6867d2004d"
        },
        "date": 1747192077276,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "forward (100_validators)",
            "value": 639651,
            "unit": "gas"
          },
          {
            "name": "forward (100_validators) per l2 tx",
            "value": 1776.81,
            "unit": "gas"
          },
          {
            "name": "forward (no_validators)",
            "value": 312434,
            "unit": "gas"
          },
          {
            "name": "forward (no_validators) per l2 tx",
            "value": 867.87,
            "unit": "gas"
          },
          {
            "name": "forward (overhead)",
            "value": 327217,
            "unit": "gas"
          },
          {
            "name": "forward (overhead) per l2 tx",
            "value": 908.94,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (100_validators)",
            "value": 1579031,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (100_validators) per l2 tx",
            "value": 137.07,
            "unit": "gas"
          },
          {
            "name": "setupEpoch (no_validators)",
            "value": 67927,
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