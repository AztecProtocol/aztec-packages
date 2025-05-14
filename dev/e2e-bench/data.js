window.BENCHMARK_DATA = {
  "lastUpdate": 1747217572387,
  "repoUrl": "https://github.com/AztecProtocol/aztec-packages",
  "entries": {
    "End-to-end Benchmark": [
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
        "date": 1746735261983,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8445,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2417759312543988,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 147805,
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
          "distinct": false,
          "id": "fc3910288b3c43ae3c2939d88acc1cd5485f0330",
          "message": "feat: full AVM public inputs struct in C++, including tracegen of full PI columns (#14088)\n\nCo-authored-by: AztecBot <tech@aztecprotocol.com>",
          "timestamp": "2025-05-08T20:20:24Z",
          "tree_id": "796b748f9be43a666cc9ffba1c2ccebcc5cb663f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/fc3910288b3c43ae3c2939d88acc1cd5485f0330"
        },
        "date": 1746739927888,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8211,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23506419720757837,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 132945,
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
          "distinct": false,
          "id": "278661f67ce4d444b068b331971a5bb3e2a2461f",
          "message": "feat!: AVM DebugLog opcode should be (mostly) a no-op unless doing verbose \"client-initiated-simulation\" (#14085)\n\nUnless initiated from `node.simulatePublicCalls()` or from TXE, with\nlog-level verbose, DebugLog should be a no-op.\n\nIt is a no-op, but it resolves memory address operands to avoid the need\nto special case things in C++. Special casing would be \"this instruction\nhas memory offset operands but we only _sometimes_ want to resolve and\ntag check them and generate events\".\n\nIt does not do any slice memory stuff when in no-op mode.\n\nCo-authored-by: AztecBot <tech@aztecprotocol.com>",
          "timestamp": "2025-05-08T21:11:35Z",
          "tree_id": "5fbed74cb1b033fb7032c584f49136af2022a76d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/278661f67ce4d444b068b331971a5bb3e2a2461f"
        },
        "date": 1746743046432,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8237,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23581501915289585,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 137653,
            "unit": "us"
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
        "date": 1746744507315,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8223,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23542152223556279,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 149037,
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
          "id": "5b2ead29cd6e82013019a6d288cadae6123a1700",
          "message": "refactor: flat grumpkin CRS, use CDN, remove old srs_db  (#14097)\n\nA bunch of bn254/grumpkin CRS cleanup. The main motivation was to get\nrid of the extra srs_db download in CI, but it was tangled enough that\nit was best the code was refactored first.\n\nMain changes:\n- Rework the old file crs factory class to be a 'NativeCrsFactory',\nreflecting its use in native code (WASM still uses MemCrsFactory). This\nacts like a file-backed CRS that reads from ~/.bb-crs if allow_download\n= false, otherwise it reads from the network if not enough CRS points\nare found. Tested in crs_factory.test.cpp.\n- Remove the srs_db folder that redundantly downloads CRS. Rework all\nreferences to it to instead use the downloaded-on-demand version in\n~/.bb-crs\n- 'Flatten' grumpkin i.e. removing the header. This is for now called\ngrumpkin_g1.flat.dat but we can shortly move it to the original\ngrumpkin_g1.dat name. Remove the hacky grumpkin_size file as it is now\neasy to tell from the .dat file size itself.\n- Move to the new CDN-delivered CRS URL\n\nOther changes:\n- Remove the hacky up-front CRS initialization (except in WASM/bb.js,\nwhere it is still needed), fully embracing the originally intended\non-demand CRS loading.\n- no redundant verifier and prover CRS's, just make one CRS that does\nboth. We basically always want the verifier CRS around, and it's easy\nenough to represent a verifier as a 'prover' CRS with one point for\nbn254. For grumpkin, they were already identical.\n- Allow for short syntax `bb prove -s client_ivc` if\n`ivc-inputs.msgpack` is in the current working directory. The proof will\ngo in an 'out' folder that is created if it does not exist.\n- Refactor old tests that used very low level ways of reading CRS. This\nuncovered fundamental flaws in them, such as trying to read `2**20`\npoints from grumpkin (which has `2**18` max)\n\nCloses https://github.com/AztecProtocol/barretenberg/issues/1163\nCloses https://github.com/AztecProtocol/barretenberg/issues/1180\n\n---------\n\nCo-authored-by: AztecBot <tech@aztecprotocol.com>",
          "timestamp": "2025-05-08T22:41:16Z",
          "tree_id": "0a5d30ae1ade27d9bed2dd10a5a65cb35cddd2c8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5b2ead29cd6e82013019a6d288cadae6123a1700"
        },
        "date": 1746747994364,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8703,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.249156418655537,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 150003,
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
          "id": "17f5c41757abf15364ba7f937200508d3e8993fc",
          "message": "feat!: add pairing agg in a few more places (#14125)\n\n1. Add nested pairing point aggregation to the native UH verifier (uses\nnew native `PairingPoints` class)\n2. Add aggregation of nested pairing points of final accumulated circuit\nin hiding circuit\n3. Add precomputed VKs to ivc-inputs.msgpack in ivc_integration suite\n4. fix bug in `generate3FunctionTestingIVCStack` (was passing the wrong\nVK for one circuit)\n\nCloses https://github.com/AztecProtocol/barretenberg/issues/1382",
          "timestamp": "2025-05-09T00:20:02Z",
          "tree_id": "b6712cf87466854026528cea5faec6f4a5a0d1d0",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/17f5c41757abf15364ba7f937200508d3e8993fc"
        },
        "date": 1746753706417,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8173,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23398457480089083,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 141875,
            "unit": "us"
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
        "date": 1746759954984,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8268,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2367097533650067,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 145351,
            "unit": "us"
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
        "date": 1746790652249,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8894,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.25463505830760885,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 151330,
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
          "distinct": false,
          "id": "4fe7c5139d3ad173dababa0b51c95405b44975b1",
          "message": "chore: Reenable sentinel e2e test (#14185)\n\nCI was failing as nodes sometimes started a bit late, causing the\nsentinel to miss the first slot and return a history shorter than\nexpected.\n\nThis PR waits until sentinel has collected the expected data.",
          "timestamp": "2025-05-09T13:54:27Z",
          "tree_id": "1eda318918e99c8cc48db44e5f95579fca536f34",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/4fe7c5139d3ad173dababa0b51c95405b44975b1"
        },
        "date": 1746800678664,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8274,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23688638431546824,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 139379,
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
          "distinct": false,
          "id": "073bc7d4bb65324458febb9ccaf7a92449194542",
          "message": "fix: Handle \"zero\" as key on LMDBv2 map (#14183)\n\nFixes #14182",
          "timestamp": "2025-05-09T14:02:59Z",
          "tree_id": "4f3c518d97a1ae4650a236e2c05456ce79f4173d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/073bc7d4bb65324458febb9ccaf7a92449194542"
        },
        "date": 1746801770621,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8534,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2443208235370863,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 153086,
            "unit": "us"
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
        "date": 1746803075210,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8228,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23556243711955194,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 157115,
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
          "distinct": false,
          "id": "11cf4e6e4e8804166f45160cdeaf831bab15c018",
          "message": "fix: getEpochAndSlotAtSlot computation (#14189)",
          "timestamp": "2025-05-09T14:52:02Z",
          "tree_id": "3aba754c1c8883062f00d6ab50724229eadf0177",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/11cf4e6e4e8804166f45160cdeaf831bab15c018"
        },
        "date": 1746804999659,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8719,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.24961403429946447,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 144067,
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
          "distinct": false,
          "id": "cbe7246e9c3e933d3e85076a22d42741f8117b6d",
          "message": "chore: Run all nested e2e tests by default on CI (#14186)\n\nWe were missing all `e2e_epochs` and `e2e_sequencer` tests.",
          "timestamp": "2025-05-09T15:55:22Z",
          "tree_id": "f4f6eea4217f2d1f448b565bcc6df1d88767b005",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/cbe7246e9c3e933d3e85076a22d42741f8117b6d"
        },
        "date": 1746811411456,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8319,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23816850326338485,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 152961,
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
          "distinct": false,
          "id": "5ff375219c58809a119a42cf96ec1b3ef43904f1",
          "message": "feat!: Indirect flag is now sorted by operand (#14184)\n\nPreviously, the indirect flag was LSB [operand_0_indirect,\noperand_1_indirect, operand_0_relative, operand_1_relative, ...0] MSB.\nThis made it so different amounts of operands would make the indirect\nflag have different meanings. This PR changes it to LSB\n[operand_0_indirect, operand_0_relative, operand_1_indirect ...] MSB\nThis way the meaning of the operand flag doesn't change with the number\nof operands, and we also avoid having to construct addressing with the\nconcrete operand count.",
          "timestamp": "2025-05-09T16:47:30Z",
          "tree_id": "517c992849ee2676af7c74fe1aa1f670f225b8a0",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5ff375219c58809a119a42cf96ec1b3ef43904f1"
        },
        "date": 1746812635570,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8206,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2349229394028024,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 140810,
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
          "distinct": false,
          "id": "cd3eb1bf0dae859e0a3b3f3a706df7d35b7be6a9",
          "message": "fix(cli): remove extra .split (#14170)\n\nIt is already parsed in the sequencers command\nfixes: https://github.com/AztecProtocol/aztec-packages/issues/14167",
          "timestamp": "2025-05-09T18:11:16Z",
          "tree_id": "58900f65b3ed2d9569d416dcb23b9e98ee350df1",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/cd3eb1bf0dae859e0a3b3f3a706df7d35b7be6a9"
        },
        "date": 1746818531491,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8293,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.237423217331515,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 156839,
            "unit": "us"
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
        "date": 1746818533481,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8541,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.24450786435094898,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 169111,
            "unit": "us"
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
        "date": 1746821951813,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8379,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23987321261474034,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 150579,
            "unit": "us"
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
        "date": 1746846271915,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8335,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2386335271514841,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 138425,
            "unit": "us"
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
        "date": 1747047308360,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8249,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23615399602080517,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 143844,
            "unit": "us"
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
        "date": 1747050647779,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8179,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23414849791397102,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 143507,
            "unit": "us"
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
        "date": 1747057954964,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8408,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.24071658438572618,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 133270,
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
          "distinct": false,
          "id": "34eaa0ee0d80e56f9bb7d000c2f38cef57a1165f",
          "message": "fix(bb): honour CRS_PATH env var (#14208)",
          "timestamp": "2025-05-12T13:05:20Z",
          "tree_id": "ef4a34cfe586fb40d50aad19f9c1f78ec29cee1f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/34eaa0ee0d80e56f9bb7d000c2f38cef57a1165f"
        },
        "date": 1747058884522,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8100,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23190217995006218,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 127725,
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
          "distinct": false,
          "id": "a5914ce8b250876fc53ce681c4c56b4affe35eb6",
          "message": "chore: Deflake e2e sentinel test (#14190)\n\nFound and fixed another flake. Stats for attestors are not collected in\nslots where no block proposal was seen, so history was shorter than\nexpected for those.",
          "timestamp": "2025-05-12T14:00:05Z",
          "tree_id": "9248cec3350437e207b7bc1bb74086650bea4a0d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a5914ce8b250876fc53ce681c4c56b4affe35eb6"
        },
        "date": 1747061680877,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8369,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23958167123548912,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 148007,
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
          "id": "60dbe1a5a0287aebb51f41259dc2be0f90e30b62",
          "message": "chore: Bump Noir reference (#14055)\n\nAutomated pull of nightly from the\n[noir](https://github.com/noir-lang/noir) programming language, a\ndependency of Aztec.\nBEGIN_COMMIT_OVERRIDE\nfix: always type-check turbofish, and error when it's not allowed\n(https://github.com/noir-lang/noir/pull/8437)\nchore: Release Noir(1.0.0-beta.5)\n(https://github.com/noir-lang/noir/pull/7955)\nfeat(greybox_fuzzer): Parallel fuzz tests\n(https://github.com/noir-lang/noir/pull/8432)\nfix(ssa): Mislabeled instructions with side effects in\nEnableSideEffectsIf removal pass\n(https://github.com/noir-lang/noir/pull/8355)\nfeat: SSA pass impact report\n(https://github.com/noir-lang/noir/pull/8393)\nchore: bump external pinned commits\n(https://github.com/noir-lang/noir/pull/8433)\nchore: separate benchmarking from github actions more\n(https://github.com/noir-lang/noir/pull/7943)\nchore(fuzz): Break up the AST fuzzer `compare` module\n(https://github.com/noir-lang/noir/pull/8431)\nchore(fuzz): Rename `init_vs_final` to `min_vs_full`\n(https://github.com/noir-lang/noir/pull/8430)\nfix!: error on tuple mismatch\n(https://github.com/noir-lang/noir/pull/8424)\nchore: bump external pinned commits\n(https://github.com/noir-lang/noir/pull/8429)\nchore(acir): Test whether the predicate has an effect on slice\nintrinsics (https://github.com/noir-lang/noir/pull/8421)\nfeat(ssa): Mark transitively dead parameters during DIE\n(https://github.com/noir-lang/noir/pull/8254)\nfix(ssa_gen): Do not code gen fetching of empty arrays when initializing\nthe data bus (https://github.com/noir-lang/noir/pull/8426)\nchore: remove `.aztec-sync-commit`\n(https://github.com/noir-lang/noir/pull/8415)\nchore(test): Add more unit tests for\n`inline_functions_with_at_most_one_instruction`\n(https://github.com/noir-lang/noir/pull/8418)\nchore: add minor docs for interpreter\n(https://github.com/noir-lang/noir/pull/8397)\nfix: print slice composite types surrounded by parentheses\n(https://github.com/noir-lang/noir/pull/8412)\nfeat: Skip SSA passes that contain any of the given messages\n(https://github.com/noir-lang/noir/pull/8416)\nfix: disable range constraints using the predicate\n(https://github.com/noir-lang/noir/pull/8396)\nchore: bumping external libraries\n(https://github.com/noir-lang/noir/pull/8406)\nchore: redo typo PR by shystrui1199\n(https://github.com/noir-lang/noir/pull/8405)\nfeat(test): add `nargo_fuzz_target`\n(https://github.com/noir-lang/noir/pull/8308)\nfix: allow names to collide in the values/types namespaces\n(https://github.com/noir-lang/noir/pull/8286)\nfix: Fix sequencing of side-effects in lvalue\n(https://github.com/noir-lang/noir/pull/8384)\nfeat(greybox_fuzzer): Maximum executions parameter added\n(https://github.com/noir-lang/noir/pull/8390)\nfix: warn on and discard unreachable statements after break and continue\n(https://github.com/noir-lang/noir/pull/8382)\nfix: add handling for u128 infix ops in interpreter\n(https://github.com/noir-lang/noir/pull/8392)\nchore: move acirgen tests into separate file\n(https://github.com/noir-lang/noir/pull/8376)\nfeat(fuzz): initial version of comptime vs brillig target for AST fuzzer\n(https://github.com/noir-lang/noir/pull/8335)\nchore: apply lints to `ast_fuzzer`\n(https://github.com/noir-lang/noir/pull/8386)\nchore: add note on AI generated PRs in `CONTRIBUTING.md`\n(https://github.com/noir-lang/noir/pull/8385)\nchore: document flattening pass\n(https://github.com/noir-lang/noir/pull/8312)\nfix: comptime shift-right overflow is zero\n(https://github.com/noir-lang/noir/pull/8380)\nfeat: let static_assert accept any type for its message\n(https://github.com/noir-lang/noir/pull/8322)\nfix(expand): output safety comment before statements\n(https://github.com/noir-lang/noir/pull/8378)\nchore: avoid need to rebuild after running tests\n(https://github.com/noir-lang/noir/pull/8379)\nchore: bump dependencies (https://github.com/noir-lang/noir/pull/8372)\nchore: Add GITHUB_TOKEN to cross build\n(https://github.com/noir-lang/noir/pull/8370)\nchore: redo typo PR by GarmashAlex\n(https://github.com/noir-lang/noir/pull/8364)\nchore: remove unsafe code from greybox fuzzer\n(https://github.com/noir-lang/noir/pull/8315)\nfeat: add `--fuzz-timeout` to `nargo test` options\n(https://github.com/noir-lang/noir/pull/8326)\nchore: bump external pinned commits\n(https://github.com/noir-lang/noir/pull/8334)\nfix(expand): try to use \"Self\" in function calls\n(https://github.com/noir-lang/noir/pull/8353)\nfix: Fix evaluation order of assignments with side-effects in their rhs\n(https://github.com/noir-lang/noir/pull/8342)\nfix: let comptime Field value carry the field's sign\n(https://github.com/noir-lang/noir/pull/8343)\nfix: Ordering of items in callstacks\n(https://github.com/noir-lang/noir/pull/8338)\nchore: add snapshosts for nargo expand tests\n(https://github.com/noir-lang/noir/pull/8318)\nfix(ownership): Clone global arrays\n(https://github.com/noir-lang/noir/pull/8328)\nchore: Replace all SSA interpreter panics with error variants\n(https://github.com/noir-lang/noir/pull/8311)\nfeat: Metamorphic AST fuzzing\n(https://github.com/noir-lang/noir/pull/8299)\nfix: fix some Display implementations for AST nodes\n(https://github.com/noir-lang/noir/pull/8316)\nchore: remove leftover file\n(https://github.com/noir-lang/noir/pull/8313)\nfix: uses non-zero points with ec-add-unsafe\n(https://github.com/noir-lang/noir/pull/8248)\nEND_COMMIT_OVERRIDE\n\n---------\n\nCo-authored-by: AztecBot <tech@aztecprotocol.com>\nCo-authored-by: Tom French <15848336+TomAFrench@users.noreply.github.com>",
          "timestamp": "2025-05-12T14:45:07Z",
          "tree_id": "47cde8e9ec89c713527d7a8ca7927728fc44acc8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/60dbe1a5a0287aebb51f41259dc2be0f90e30b62"
        },
        "date": 1747065440969,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8276,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2369229209184459,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 146744,
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
          "distinct": false,
          "id": "4fe0c9afc4cb91d45f3068b96001e5833550fda2",
          "message": "feat: translator merge consistency check!  (#14098)\n\nEnsure final merge and translator operate on the same op queue by\nvalidating the full table commitments received by the final merge\nverifier and the witness commitments in translator verifier\ncorresponding to the op queue. To achieve this with shifts working\ncorrectly in translator, we need to introduce functionality that adds\ndata to the ultra version of the op queue without affecting vm\noperations, currently just a no-op operation.",
          "timestamp": "2025-05-12T15:47:39Z",
          "tree_id": "f20beac57382c5d07a8b50217e409b5e910c8140",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/4fe0c9afc4cb91d45f3068b96001e5833550fda2"
        },
        "date": 1747066947068,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8169,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23387988724182876,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 138872,
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
          "distinct": false,
          "id": "09a0b71b998eee81bdbd2c37a579ccd56f413f6d",
          "message": "fix: don't call noir_sync just to clean noir folder (#14193)\n\nWe have a chicken and egg problem cleaning noir right now",
          "timestamp": "2025-05-12T16:49:57Z",
          "tree_id": "eab0d413072e1cb6af76a50bee22df6fca206dad",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/09a0b71b998eee81bdbd2c37a579ccd56f413f6d"
        },
        "date": 1747071769794,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8229,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23558663309714203,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 137204,
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
          "distinct": false,
          "id": "1318fb4e5320b4bd61d5f40b5c44bcc7e365d872",
          "message": "chore(rollup): add function to trigger seed snapshot for next epoch (#13910)\n\n## Overview\nAdds cli arg to set the seed for the next epoch, much cheaper than\nperforming the whole sampling",
          "timestamp": "2025-05-12T17:12:52Z",
          "tree_id": "e490d86931d02601676697297561560423ed4b00",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1318fb4e5320b4bd61d5f40b5c44bcc7e365d872"
        },
        "date": 1747074054023,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8106,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23206018155924485,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 138938,
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
          "distinct": false,
          "id": "eda5cc8f20cd5acf14d1d0513234e86dbc13875f",
          "message": "fix: Delete txs and attestations from p2p pool on finalized blocks (#14200)\n\nInstead of relying on config variables for choosing how long to keep\nproven txs and attestations, rely on finalized blocks instead.\n\n**Breaking**: Removes env vars `P2P_TX_POOL_KEEP_PROVEN_FOR` and\n`P2P_ATTESTATION_POOL_KEEP_FOR` (cc @devrel).\n    \nFixes #13575",
          "timestamp": "2025-05-12T18:24:09Z",
          "tree_id": "067801c2d4fddc7239604c8b47c8d7a0bc32f71c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/eda5cc8f20cd5acf14d1d0513234e86dbc13875f"
        },
        "date": 1747076324010,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8387,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2400994972316528,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 146857,
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
          "id": "c9d894c2f7e38d4e7b9f4a63865629111bca31ee",
          "message": "chore: Fix l1-reorg e2e flakes (#14218)\n\nAttempted fixes for:\n\n```\n13:15:46  FAIL  src/e2e_epochs/epochs_l1_reorgs.test.ts (322.03 s)\n13:15:46   e2e_epochs/epochs_l1_reorgs\n13:15:46     ✓ prunes L2 blocks if a proof is removed due to an L1 reorg (77417 ms)\n13:15:46     ✓ does not prune if a second proof lands within the submission window after the first one is reorged out (68186 ms)\n13:15:46     ✕ restores L2 blocks if a proof is added due to an L1 reorg (72522 ms)\n13:15:46     ✓ prunes L2 blocks from pending chain removed from L1 due to an L1 reorg (48771 ms)\n13:15:46     ✓ sees new blocks added in an L1 reorg (48871 ms)\n13:15:46     ○ skipped updates cross-chain messages changed due to an L1 reorg\n13:15:46 \n13:15:46   ● e2e_epochs/epochs_l1_reorgs › restores L2 blocks if a proof is added due to an L1 reorg\n13:15:46 \n13:15:46     expect(received).resolves.toEqual(expected) // deep equality\n13:15:46 \n13:15:46     Expected: 2\n13:15:46     Received: 0\n13:15:46 \n13:15:46       149 |     // And so the node undoes its reorg\n13:15:46       150 |     await retryUntil(() => node.getBlockNumber().then(b => b === monitor.l2BlockNumber), 'node sync', syncTimeout, 0.1);\n13:15:46     > 151 |     await expect(node.getProvenBlockNumber()).resolves.toEqual(monitor.l2ProvenBlockNumber);\n13:15:46           |                                                        ^\n13:15:46       152 |\n13:15:46       153 |     logger.warn(`Test succeeded`);\n13:15:46       154 |   });\n13:15:46 \n13:15:46       at Object.toEqual (../../node_modules/expect/build/index.js:174:22)\n13:15:46       at Object.toEqual (e2e_epochs/epochs_l1_reorgs.test.ts:151:56)\n```\n\n(link to run [here](http://ci.aztec-labs.com/46d88c7dd30334d2))\n\n```\n10:34:18  FAIL  src/e2e_epochs/epochs_l1_reorgs.test.ts\n10:34:18   e2e_epochs/epochs_l1_reorgs\n10:34:18     ✕ prunes L2 blocks if a proof is removed due to an L1 reorg (45473 ms)\n10:34:18     ✓ does not prune if a second proof lands within the submission window after the first one is reorged out (68275 ms)\n10:34:18     ✓ restores L2 blocks if a proof is added due to an L1 reorg (73214 ms)\n10:34:18     ✓ prunes L2 blocks from pending chain removed from L1 due to an L1 reorg (48365 ms)\n10:34:18     ✓ sees new blocks added in an L1 reorg (48927 ms)\n10:34:18     ○ skipped updates cross-chain messages changed due to an L1 reorg\n10:34:18 \n10:34:18   ● e2e_epochs/epochs_l1_reorgs › prunes L2 blocks if a proof is removed due to an L1 reorg\n10:34:18 \n10:34:18     expect(received).toEqual(expected) // deep equality\n10:34:18 \n10:34:18     Expected: 0\n10:34:18     Received: 2\n10:34:18 \n10:34:18       59 |     await context.cheatCodes.eth.reorg(2);\n10:34:18       60 |     await monitor.run();\n10:34:18     > 61 |     expect(monitor.l2ProvenBlockNumber).toEqual(0);\n10:34:18          |                                         ^\n10:34:18       62 |\n10:34:18       63 |     // Wait until the end of the proof submission window for the first epoch\n10:34:18       64 |     await test.waitUntilEndOfProofSubmissionWindow(0);\n10:34:18 \n10:34:18       at Object.toEqual (e2e_epochs/epochs_l1_reorgs.test.ts:61:41)\n```\n\n(link to run [here](http://ci.aztec-labs.com/acafe11a371dc863))",
          "timestamp": "2025-05-12T18:30:57Z",
          "tree_id": "66dd3dac1a10071920a73e5f7b50501fb3ceabb0",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c9d894c2f7e38d4e7b9f4a63865629111bca31ee"
        },
        "date": 1747077129343,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8474,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.242596441789469,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 143255,
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
          "id": "bbc532c663d7ff342420bba6ed00875a263f2039",
          "message": "chore: Fix flake in validator sentinel (#14232)\n\nFixes flake\n\n```\n17:54:55  FAIL  src/e2e_p2p/validators_sentinel.test.ts\n17:54:55   e2e_p2p_validators_sentinel\n17:54:55     with an offline validator\n17:54:55       ✓ collects stats on offline validator (7 ms)\n17:54:55       ✓ collects stats on a block builder (3 ms)\n17:54:55       ✓ collects stats on an attestor (6 ms)\n17:54:55       ✕ starts a sentinel on a fresh node (48514 ms)\n17:54:55 \n17:54:55   ● e2e_p2p_validators_sentinel › with an offline validator › starts a sentinel on a fresh node\n17:54:55 \n17:54:55     expect(received).toBeGreaterThan(expected)\n17:54:55 \n17:54:55     Expected: > 1\n17:54:55     Received:   1\n17:54:55 \n17:54:55       162 |       expect(stats.stats[newNodeValidator]).toBeDefined();\n17:54:55       163 |       expect(stats.stats[newNodeValidator].history.length).toBeGreaterThanOrEqual(1);\n17:54:55     > 164 |       expect(Object.keys(stats.stats).length).toBeGreaterThan(1);\n17:54:55           |                                               ^\n17:54:55       165 |     });\n17:54:55       166 |   });\n17:54:55       167 | });\n17:54:55 \n17:54:55       at Object.toBeGreaterThan (e2e_p2p/validators_sentinel.test.ts:164:47)\n```",
          "timestamp": "2025-05-12T19:22:07Z",
          "tree_id": "2c03c9404d78944254554065345b1ba5f14d0fe2",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/bbc532c663d7ff342420bba6ed00875a263f2039"
        },
        "date": 1747080336493,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8379,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23988029014000853,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 140591,
            "unit": "us"
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
        "date": 1747087155686,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8422,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2410948599781327,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 155167,
            "unit": "us"
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
        "date": 1747105550049,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8466,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2423737111777908,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 152425,
            "unit": "us"
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
        "date": 1747135867111,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8329,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23845320177075346,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 148761,
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
          "distinct": false,
          "id": "5e0b14bd09aa2130797989f7773d31f4e2565f1c",
          "message": "chore: Bump Noir reference (#14233)\n\nAutomated pull of nightly from the\n[noir](https://github.com/noir-lang/noir) programming language, a\ndependency of Aztec.\nBEGIN_COMMIT_OVERRIDE\nfix: sign extend in signed cast\n(https://github.com/noir-lang/noir/pull/8264)\nchore(fuzz): Do not use zero length types in the main input output\n(https://github.com/noir-lang/noir/pull/8465)\nchore: fix visibility issues in test suite\n(https://github.com/noir-lang/noir/pull/8454)\nchore: blackbox functions for ssa intepreter\n(https://github.com/noir-lang/noir/pull/8375)\nfeat: improve bitshift codegen\n(https://github.com/noir-lang/noir/pull/8442)\nfix(ssa): Mark mutually recursive simple functions\n(https://github.com/noir-lang/noir/pull/8447)\nfix: Fix nested trait dispatch with associated types\n(https://github.com/noir-lang/noir/pull/8440)\nchore: carry visibilities in monomorphized AST\n(https://github.com/noir-lang/noir/pull/8439)\nchore(tests): Add regression for now passing test\n(https://github.com/noir-lang/noir/pull/8441)\nchore: use human-readable bytecode in snapshots\n(https://github.com/noir-lang/noir/pull/8164)\nchore: bump external pinned commits\n(https://github.com/noir-lang/noir/pull/8445)\nEND_COMMIT_OVERRIDE\n\n---------\n\nCo-authored-by: AztecBot <tech@aztecprotocol.com>\nCo-authored-by: Tom French <15848336+TomAFrench@users.noreply.github.com>",
          "timestamp": "2025-05-13T10:47:52Z",
          "tree_id": "5e6c2872d1f7ffb8acb86b7ede0eca788250ffb7",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5e0b14bd09aa2130797989f7773d31f4e2565f1c"
        },
        "date": 1747137023897,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8356,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2392084687452607,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 154972,
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
          "id": "3aa76742d0b25f941daa2ae566d0beb9393e5061",
          "message": "fix: incorrectly computing l2 to l1 msg subtree root (#14240)\n\nFixes #14174\n\n@MirandaWood managed to figure out that we did not correctly compute the\nmessage subtree root for a tx with no messages.\n\nIn a followup PR I will merge the e2e_outbox and l2_to_l1 e2e tests as\nhaving them separated is purely a tech debt. I will also consider\ncleaning up `AztecNodeService.getL2ToL1MessageMembershipWitness`.",
          "timestamp": "2025-05-13T12:14:00Z",
          "tree_id": "d8b5d2b9b851aa1ce7a90abfaac54f6fdca024a1",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/3aa76742d0b25f941daa2ae566d0beb9393e5061"
        },
        "date": 1747142466158,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8292,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2373857936946535,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 156788,
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
          "distinct": false,
          "id": "0592163c0eef7e64a4f961b818923441b06dff43",
          "message": "chore: utility func attr without full path in the artifact (#13892)\n\nWith https://github.com/noir-lang/noir/issues/7912 issue now being\ntackled I remove the original workaround from the codebase. Getting rid\nof the full path from the ABI makes our TS codebase cleaner.\n\n~Currently blocked by https://github.com/noir-lang/noir/issues/8255~",
          "timestamp": "2025-05-13T13:14:25Z",
          "tree_id": "4eca4b6fc764281463662607ceb3dd3787768df8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0592163c0eef7e64a4f961b818923441b06dff43"
        },
        "date": 1747143907059,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8283,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23712247138524575,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 144055,
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
          "distinct": false,
          "id": "8ca9cda6c42c4461f303eed2d94542fc2d9564ee",
          "message": "chore: enable zk-related relation correctness tests in Translator and better handling of const sizes (#14224)\n\nWe merged a micro-optimisation of initialising Translator\nProverPolynomials strictly on their actual mini circuit size. This gets\nin the way of being able to hide such polynomials and, in fact, the\nability to run ZK correctly (hence having the relation correctness tests\nwith zk commented out). As this optimisation is not necessary to ensure\nTranslator is within the WASM memory limits, we roll back to having the\npolynomials initialised on the appropriate fixed sizes. I also attempted\nto cleanup up our initialisation of mini and dyadic circuit size with\nconstants within Translator.",
          "timestamp": "2025-05-13T13:58:19Z",
          "tree_id": "02a3456b2308fec31318c65909f5c275e63a6638",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8ca9cda6c42c4461f303eed2d94542fc2d9564ee"
        },
        "date": 1747148601590,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8924,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2554873574636033,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 162781,
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
          "id": "344a3f53a32d329dfa7a48bb38f88e894e7326cf",
          "message": "fix: bad quoting in noir bootstrap (#14260)\n\nIt was breaking direct calls to noir/bootstrap.sh and release action",
          "timestamp": "2025-05-13T16:39:09+01:00",
          "tree_id": "2bc4bb41a9bf964450fbe77bc57e8a4328ae0097",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/344a3f53a32d329dfa7a48bb38f88e894e7326cf"
        },
        "date": 1747152149144,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8313,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23799992479202375,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 134002,
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
          "distinct": false,
          "id": "2b218153e3ecbec6096436ee227ee082f67f9823",
          "message": "chore: automatically run formatter as part of sync (#13365)\n\nThis PR runs the formatter over all of `noir-projects` when syncing.\n`noir-projects` now has a `format` command to run the formatter on all\nof its noir files.\n\n---------\n\nCo-authored-by: AztecBot <tech@aztecprotocol.com>",
          "timestamp": "2025-05-13T15:45:22Z",
          "tree_id": "7d05391ca99cd5d29820d9939b8620fd480a8963",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/2b218153e3ecbec6096436ee227ee082f67f9823"
        },
        "date": 1747157168102,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8260,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23647107592211306,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 146656,
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
          "distinct": false,
          "id": "5783cd6ce20240dfd6283d4c4e3de2f44fada9a0",
          "message": "fix: use axios for HttpFileStore (#14231)",
          "timestamp": "2025-05-13T17:04:05Z",
          "tree_id": "4c029d036d3a50b7eebb01a89aeb3ba0e4942e76",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5783cd6ce20240dfd6283d4c4e3de2f44fada9a0"
        },
        "date": 1747164103777,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8405,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.24063132033202309,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 137970,
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
          "distinct": false,
          "id": "654d519e32d5a078d7e5815536c3b499d670d2ab",
          "message": "fix!: Handle L1 reorgs on cross-chain messages (#14151)\n\n## L1 contracts\n\n- Adds a `rollingHash` computed over all L1 to L2 messages as they are\nreceived, which gets emitted with each message and kept in storage.\n- Adds a `getState` method that returns both rolling hash and total\ncount of messages, used for syncing.\n\n## Message store\n\n- Changes keys from strings to numbers so they are properly ordered\n- Checks message consistency on insertion (indices, rolling hashes, l2\nblock numbers, etc)\n- Adds method to iterate over arbitrary ranges of messages\n- Stores message metadata (l1 block number, l2 block number, rolling\nhash, etc) along with each leaf\n- Deletes unused in-memory message store\n\n## Archiver\n\n- Compares local messages rolling hash vs the one on the Inbox contract\nto determine if it needs to resync.\n- Before syncing, checks if the rolling hash for the latest message\ndownloaded matches; if not, it considers it a reorg and rolls back\nmessages until a common sync point.\n- Once syncing is completed, checks the resulting rolling hash with the\none obtained, and warns on mismatch.",
          "timestamp": "2025-05-13T17:07:53Z",
          "tree_id": "1c61df178a36b3e5efa54b6421037badaadc805b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/654d519e32d5a078d7e5815536c3b499d670d2ab"
        },
        "date": 1747165813503,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8314,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23802451081202539,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 264497,
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
          "distinct": false,
          "id": "1e1e31c5f1f5a58020b1df3484da6e9caacc0d86",
          "message": "chore: Added timestamp and message id debugging to p2p network (#14239)\n\nThis PR adds timestamps to all P2P messages. Debug logs the publishing\nand receipt of messages.",
          "timestamp": "2025-05-13T19:25:26Z",
          "tree_id": "d7f4d32ede0a1ae32d5fae25d2f1fb61cd0125ac",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1e1e31c5f1f5a58020b1df3484da6e9caacc0d86"
        },
        "date": 1747174794869,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8083,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.231394547835385,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 140989,
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
          "distinct": false,
          "id": "9f0dcc87221b4ccbe61713a77a52527176bad535",
          "message": "chore: bump noir commit (#14254)\n\nThis PR bumps the noir commit to unblock\nhttps://github.com/noir-lang/noir/pull/8470\n\n---------\n\nCo-authored-by: AztecBot <tech@aztecprotocol.com>\nCo-authored-by: Ary Borenszweig <asterite@gmail.com>",
          "timestamp": "2025-05-13T20:05:46Z",
          "tree_id": "0539eacd4b6a3a98742d6b7bbf599a9f67bb68c3",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9f0dcc87221b4ccbe61713a77a52527176bad535"
        },
        "date": 1747176713780,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8172,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23395796991862006,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 149870,
            "unit": "us"
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
        "date": 1747178476467,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8261,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23651033727556647,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 144147,
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
          "distinct": false,
          "id": "35f3be19d1068a609ba0e608115ed6c344e9fe49",
          "message": "test: adding missing L2 to L1 test case (#14249)\n\nWe had a missing L2 to L1 messaging test case and for that reason [this\nissue](https://github.com/AztecProtocol/aztec-packages/issues/14174) got\nin unnoticed.",
          "timestamp": "2025-05-13T22:43:13Z",
          "tree_id": "2de6f2363f38e1e14271b61c86e8e5321d7ba70e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/35f3be19d1068a609ba0e608115ed6c344e9fe49"
        },
        "date": 1747183055850,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8224,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23545394932795558,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 140612,
            "unit": "us"
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
        "date": 1747192071369,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8403,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.24056411322294327,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 142401,
            "unit": "us"
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
          "id": "6fd643f8ee4972a8f6d7c07a0d539f9d054cec95",
          "message": "chore: add builder for simpler test setup (#14264)\n\nAs part of the move to GSE, I am running into a bunch of small things\nthat make the test setups a pain etc. Here adding a builder for the\nrollup such that it is simpler to get one deployed. Idea is essentially\nto only set values that we want to be different from defaults and just\nuse defaults for the rest.",
          "timestamp": "2025-05-14T07:06:55Z",
          "tree_id": "84b9f560938ca337eb43039a084db83f56f28625",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/6fd643f8ee4972a8f6d7c07a0d539f9d054cec95"
        },
        "date": 1747208826116,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8349,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23903281585915803,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 148048,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "105737703+iakovenkos@users.noreply.github.com",
            "name": "sergei iakovenko",
            "username": "iakovenkos"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": false,
          "id": "e0e4b1e3082e6ea1ed1f8115b85072f6f3999424",
          "message": "fix: transcript shared by multiple provers and `add_to_hash_buffer()`  (#14220)\n\nFixed a bug in `add_to_hash_buffer()` Transcript method that would lead\nto incorrect challenge computation in the situations when a transcript\nis shared by several Provers.",
          "timestamp": "2025-05-14T08:15:02Z",
          "tree_id": "b9dbe70935da134a0bf7e1804150f8c2b036accb",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e0e4b1e3082e6ea1ed1f8115b85072f6f3999424"
        },
        "date": 1747213070207,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8453,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.24199932094990542,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 138419,
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
          "distinct": false,
          "id": "2ff9d9f8cfb330f7f99714524a5c2cfac02a7d50",
          "message": "feat: Increase alpha-testnet txs per block (#14280)\n\nThis PR sets the max txs per block for alpha-testnet to 20.",
          "timestamp": "2025-05-14T08:33:08Z",
          "tree_id": "fb87debc0cd593b60ed63cebc05ecc83197f680f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/2ff9d9f8cfb330f7f99714524a5c2cfac02a7d50"
        },
        "date": 1747216270886,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8126,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23263020079708413,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 138107,
            "unit": "us"
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
          "id": "67ec8e8992aa2f0b5976f7358b7690a847709b6d",
          "message": "chore: update l1 codeowners + kill shouting (#14286)\n\nDeletes screaming and shouting, and alters the codeowners to notify\nabout any change in the l1 src. Done to make it a bit less painful as\nthere were many more things that altered this than first expected 😅",
          "timestamp": "2025-05-14T10:40:12+01:00",
          "tree_id": "881298cdde6c211eab4b07787c050bafe4183ed1",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/67ec8e8992aa2f0b5976f7358b7690a847709b6d"
        },
        "date": 1747217571553,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8331,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23851172499788917,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 156597,
            "unit": "us"
          }
        ]
      }
    ]
  }
}