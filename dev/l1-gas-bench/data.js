window.BENCHMARK_DATA = {
  "lastUpdate": 1747075816748,
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
          "id": "33153b7d07c99aee9ed7e54e2ecd3659fc181dbf",
          "message": "fix: values file ordering in deployment terraform (#14166)",
          "timestamp": "2025-05-08T14:56:56Z",
          "tree_id": "015f2fdecb514522c813c5228230da017edd60bd",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/33153b7d07c99aee9ed7e54e2ecd3659fc181dbf"
        },
        "date": 1746718503917,
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
          "id": "f85d01c16ebe9fbf384f74ad72cb6b5c86b5174e",
          "message": "feat: minimal Avm PublicInputs in Cpp, Noir & Cpp `to/from_columns`, PI tracegen and evaluate all PI cols in verifiers (#13698)\n\nAlso row-indices constants are defined/computed.\n\n*NOTE:* The 'lengths' entries flagged as \"NEW\" are not added in this PR.\n\n\n![image](https://github.com/user-attachments/assets/cc10c638-817f-4741-878e-13238c6a22dd)\n\n![image](https://github.com/user-attachments/assets/8bc36e9d-d7ca-42ea-949a-a2a05925cdb0)\n\n---------\n\nCo-authored-by: dbanks12 <david@aztecprotocol.com>",
          "timestamp": "2025-05-08T18:32:59Z",
          "tree_id": "404ef7d3620d814436e990cdb4df421f268511c4",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/f85d01c16ebe9fbf384f74ad72cb6b5c86b5174e"
        },
        "date": 1746731298246,
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
          "id": "360fa17cacf5411d98a617f006332a4379d4e543",
          "message": "fix: denoise works without redis creds (#14169)\n\nUnblocks externals",
          "timestamp": "2025-05-08T17:43:12Z",
          "tree_id": "f99299cfbcd26fae07917d0dd333a0b12833ddda",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/360fa17cacf5411d98a617f006332a4379d4e543"
        },
        "date": 1746731458427,
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
          "id": "5ccf2ad2cdc3595afd4a167a7f9b565b8ecdca20",
          "message": "fix: l2 to l1 messages from private should be properly ordered by phase alongside publicly created ones (#14118)\n\nAlso, better tests of side effects for the public tx simulator,\nespecially including tests of notes & messages being thrown away/kept\nproperly based on whether a phase reverted.\n\nCo-authored-by: AztecBot <tech@aztecprotocol.com>",
          "timestamp": "2025-05-08T19:33:45Z",
          "tree_id": "617f6cd5383c1c968358caf088e3735f3641a059",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5ccf2ad2cdc3595afd4a167a7f9b565b8ecdca20"
        },
        "date": 1746735268567,
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
            "email": "47112877+dbanks12@users.noreply.github.com",
            "name": "David Banks",
            "username": "dbanks12"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": false,
          "id": "fc3910288b3c43ae3c2939d88acc1cd5485f0330",
          "message": "feat: full AVM public inputs struct in C++, including tracegen of full PI columns (#14088)\n\nCo-authored-by: AztecBot <tech@aztecprotocol.com>",
          "timestamp": "2025-05-08T20:20:24Z",
          "tree_id": "796b748f9be43a666cc9ffba1c2ccebcc5cb663f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/fc3910288b3c43ae3c2939d88acc1cd5485f0330"
        },
        "date": 1746739933581,
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
            "email": "47112877+dbanks12@users.noreply.github.com",
            "name": "David Banks",
            "username": "dbanks12"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": false,
          "id": "278661f67ce4d444b068b331971a5bb3e2a2461f",
          "message": "feat!: AVM DebugLog opcode should be (mostly) a no-op unless doing verbose \"client-initiated-simulation\" (#14085)\n\nUnless initiated from `node.simulatePublicCalls()` or from TXE, with\nlog-level verbose, DebugLog should be a no-op.\n\nIt is a no-op, but it resolves memory address operands to avoid the need\nto special case things in C++. Special casing would be \"this instruction\nhas memory offset operands but we only _sometimes_ want to resolve and\ntag check them and generate events\".\n\nIt does not do any slice memory stuff when in no-op mode.\n\nCo-authored-by: AztecBot <tech@aztecprotocol.com>",
          "timestamp": "2025-05-08T21:11:35Z",
          "tree_id": "5fbed74cb1b033fb7032c584f49136af2022a76d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/278661f67ce4d444b068b331971a5bb3e2a2461f"
        },
        "date": 1746743051603,
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
          "id": "3a5f9cfd12d602d35888cb8cd0d247983d3e9c9a",
          "message": "fix: tuple mismatch in some tests (#14175)\n\nIf you have code like this:\n\n```noir\nfn main() {\n    let (x, y) = (1, 2, 3);\n}\n```\n\nthen Noir, unlike Rust, doesn't complain that the left-hand side tuple\ndoesn't have exactly the number of elements that are on the right side.\n\nThat's about to change (it's a bug) when this PR merges:\nhttps://github.com/noir-lang/noir/pull/8424\n\nBefore that, we can fix the existing errors here.\n\nI chose to ignore the extra tuple element because it's currently\nignored, but I don't know if the \"owner\" should be used for something in\ntests (alternatively maybe \"owner\" should not be returned if it's not\ngoing to be used).",
          "timestamp": "2025-05-08T22:03:21Z",
          "tree_id": "e62f62cfb88f56e4b3c15e6e138b8c157418c867",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/3a5f9cfd12d602d35888cb8cd0d247983d3e9c9a"
        },
        "date": 1746744512151,
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
          "distinct": true,
          "id": "5b2ead29cd6e82013019a6d288cadae6123a1700",
          "message": "refactor: flat grumpkin CRS, use CDN, remove old srs_db  (#14097)\n\nA bunch of bn254/grumpkin CRS cleanup. The main motivation was to get\nrid of the extra srs_db download in CI, but it was tangled enough that\nit was best the code was refactored first.\n\nMain changes:\n- Rework the old file crs factory class to be a 'NativeCrsFactory',\nreflecting its use in native code (WASM still uses MemCrsFactory). This\nacts like a file-backed CRS that reads from ~/.bb-crs if allow_download\n= false, otherwise it reads from the network if not enough CRS points\nare found. Tested in crs_factory.test.cpp.\n- Remove the srs_db folder that redundantly downloads CRS. Rework all\nreferences to it to instead use the downloaded-on-demand version in\n~/.bb-crs\n- 'Flatten' grumpkin i.e. removing the header. This is for now called\ngrumpkin_g1.flat.dat but we can shortly move it to the original\ngrumpkin_g1.dat name. Remove the hacky grumpkin_size file as it is now\neasy to tell from the .dat file size itself.\n- Move to the new CDN-delivered CRS URL\n\nOther changes:\n- Remove the hacky up-front CRS initialization (except in WASM/bb.js,\nwhere it is still needed), fully embracing the originally intended\non-demand CRS loading.\n- no redundant verifier and prover CRS's, just make one CRS that does\nboth. We basically always want the verifier CRS around, and it's easy\nenough to represent a verifier as a 'prover' CRS with one point for\nbn254. For grumpkin, they were already identical.\n- Allow for short syntax `bb prove -s client_ivc` if\n`ivc-inputs.msgpack` is in the current working directory. The proof will\ngo in an 'out' folder that is created if it does not exist.\n- Refactor old tests that used very low level ways of reading CRS. This\nuncovered fundamental flaws in them, such as trying to read `2**20`\npoints from grumpkin (which has `2**18` max)\n\nCloses https://github.com/AztecProtocol/barretenberg/issues/1163\nCloses https://github.com/AztecProtocol/barretenberg/issues/1180\n\n---------\n\nCo-authored-by: AztecBot <tech@aztecprotocol.com>",
          "timestamp": "2025-05-08T22:41:16Z",
          "tree_id": "0a5d30ae1ade27d9bed2dd10a5a65cb35cddd2c8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5b2ead29cd6e82013019a6d288cadae6123a1700"
        },
        "date": 1746748000533,
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
          "id": "17f5c41757abf15364ba7f937200508d3e8993fc",
          "message": "feat!: add pairing agg in a few more places (#14125)\n\n1. Add nested pairing point aggregation to the native UH verifier (uses\nnew native `PairingPoints` class)\n2. Add aggregation of nested pairing points of final accumulated circuit\nin hiding circuit\n3. Add precomputed VKs to ivc-inputs.msgpack in ivc_integration suite\n4. fix bug in `generate3FunctionTestingIVCStack` (was passing the wrong\nVK for one circuit)\n\nCloses https://github.com/AztecProtocol/barretenberg/issues/1382",
          "timestamp": "2025-05-09T00:20:02Z",
          "tree_id": "b6712cf87466854026528cea5faec6f4a5a0d1d0",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/17f5c41757abf15364ba7f937200508d3e8993fc"
        },
        "date": 1746753712043,
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
          "id": "a6de3d0385c1dd1b1dd6c5f0b98430ab8ff85ad5",
          "message": "git subrepo push --branch=master noir-projects/aztec-nr\n\nsubrepo:\n  subdir:   \"noir-projects/aztec-nr\"\n  merged:   \"73cf91d049\"\nupstream:\n  origin:   \"https://github.com/AztecProtocol/aztec-nr\"\n  branch:   \"master\"\n  commit:   \"73cf91d049\"\ngit-subrepo:\n  version:  \"0.4.6\"\n  origin:   \"???\"\n  commit:   \"???\"",
          "timestamp": "2025-05-09T02:32:03Z",
          "tree_id": "435df0f792bfb9a0422f5adb9ac3b23e704e5363",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a6de3d0385c1dd1b1dd6c5f0b98430ab8ff85ad5"
        },
        "date": 1746759959722,
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
      }
    ]
  }
}