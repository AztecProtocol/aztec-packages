window.BENCHMARK_DATA = {
  "lastUpdate": 1743006054492,
  "repoUrl": "https://github.com/AztecProtocol/aztec-packages",
  "entries": {
    "End-to-end Benchmark": [
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
          "id": "5d871f8f662f5fa2dc3b278cd35e5f54f58ef220",
          "message": "fix: Removed logged config object in L1 Tx Utils (#12901)",
          "timestamp": "2025-03-20T18:35:17Z",
          "tree_id": "72ffa6fb15d7737636aacda48581e16f8f1c9826",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5d871f8f662f5fa2dc3b278cd35e5f54f58ef220"
        },
        "date": 1742497526971,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9676,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2361185324477629,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 131578,
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
          "distinct": true,
          "id": "5b064bcc6eb347dd53ad3870fe0486792d2f79bb",
          "message": "fix(bb.js): remove size metadata from UH proof (#12775)\n\nFixes #11829 \n\n- Remove first 4 bytes from proof (metadata - length of \"proof + PI\" in\nfields) returned from `UltraHonkBackend.generateProof()`\n- `proof` returned is now 14080 bytes (440 fields) and can be directly\nverified in solidity\n\n\nNote: `proof` output from bb CLI also includes the size metadata in the\nfirst 4 bytes. This should go away with #11024\n\n---------\n\nCo-authored-by: Tom French <15848336+TomAFrench@users.noreply.github.com>",
          "timestamp": "2025-03-20T22:26:33+04:00",
          "tree_id": "1575143bb9da65fe27f3bf7c4f6f57b753f29724",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5b064bcc6eb347dd53ad3870fe0486792d2f79bb"
        },
        "date": 1742499866015,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8816,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.21511593888642222,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 107214,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "5764343+charlielye@users.noreply.github.com",
            "name": "Charlie Lye",
            "username": "charlielye"
          },
          "committer": {
            "email": "5764343+charlielye@users.noreply.github.com",
            "name": "Charlie Lye",
            "username": "charlielye"
          },
          "distinct": true,
          "id": "61068dae2f702ce5dba74b36a50b68112ae05d38",
          "message": "Revert \"feat: recording circuit inputs + oracles (#12148)\"\n\nThis reverts commit 5436627816d1b675f7bf68ec43fbd4807bd0d142.",
          "timestamp": "2025-03-20T23:00:01Z",
          "tree_id": "6d09443715c094fdad5e0bc916c5f3e2159b9d3b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/61068dae2f702ce5dba74b36a50b68112ae05d38"
        },
        "date": 1742513649616,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8766,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.21390429237465422,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 105060,
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
          "id": "41bf13e9bfc87167fae10af7e5c84d05ae7d7193",
          "message": "fix: Disallow registration of contract classes with no public bytecode (#12910)\n\nThe transpiler also injects now a revert public_dispatch function of 22\nbytes (1 field) in contracts without public functions.",
          "timestamp": "2025-03-21T09:53:14+01:00",
          "tree_id": "e3d6dad24c65711a9f33bdc1093411e55818d6d6",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/41bf13e9bfc87167fae10af7e5c84d05ae7d7193"
        },
        "date": 1742549505351,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9677,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23614116991419812,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 143280,
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
          "id": "ce84b2ddf99374bb0748d7b020025d087e531c63",
          "message": "chore: Bump Noir reference (#12894)\n\nAutomated pull of nightly from the\n[noir](https://github.com/noir-lang/noir) programming language, a\ndependency of Aztec.\nBEGIN_COMMIT_OVERRIDE\nchore: add more test suites to CI\n(https://github.com/noir-lang/noir/pull/7757)\nchore(docs): Avoid colliding filenames\n(https://github.com/noir-lang/noir/pull/7771)\nfeat(ssa): Basic control dependent LICM\n(https://github.com/noir-lang/noir/pull/7660)\nchore: run `noir_wasm` over `test_programs`\n(https://github.com/noir-lang/noir/pull/7765)\nfix(ci): Fail the CI job on a Brillig report failure\n(https://github.com/noir-lang/noir/pull/7762)\nfix(ci): Exclude inliner specific reference count tests from Brillig\ntrace report (https://github.com/noir-lang/noir/pull/7761)\nchore: pull out pure functions from interpreter\n(https://github.com/noir-lang/noir/pull/7755)\nfix: add missing inputs to `BlackBoxFuncCall::get_inputs_vec` for EcAdd\n(https://github.com/noir-lang/noir/pull/7752)\nfeat: add `EmbeddedCurvePoint::generator()` to return generator point\n(https://github.com/noir-lang/noir/pull/7754)\nchore: remove bun from docs in favour of yarn\n(https://github.com/noir-lang/noir/pull/7756)\nchore: Fix rustdocs error (https://github.com/noir-lang/noir/pull/7750)\nchore: add `shared` module within `noirc_frontend`\n(https://github.com/noir-lang/noir/pull/7746)\nchore: push users towards nargo in tutorial\n(https://github.com/noir-lang/noir/pull/7736)\nchore: Add GITHUB_TOKEN for downloading prost_prebuilt to acvm.js build\n(https://github.com/noir-lang/noir/pull/7745)\nEND_COMMIT_OVERRIDE\n\n---------\n\nCo-authored-by: AztecBot <tech@aztecprotocol.com>",
          "timestamp": "2025-03-21T10:56:43Z",
          "tree_id": "e86921fc239d6fecfe6968486da5bde3fb537bc9",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ce84b2ddf99374bb0748d7b020025d087e531c63"
        },
        "date": 1742557030620,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9142,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2324908253308054,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 131138,
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
          "id": "7aa0b871bb154ad50cb4643bae0879d89244f784",
          "message": "fix: pass bot salt (#12923)\n\nPass deployment salt for the bot's account contract based on the its pod\nname. (This way we can have multiple bots all producing private txs)",
          "timestamp": "2025-03-21T11:56:10Z",
          "tree_id": "8eb2656a7b0c3e8945c741f701f5852dc442b313",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7aa0b871bb154ad50cb4643bae0879d89244f784"
        },
        "date": 1742560111282,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9456,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2404891934978456,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 132321,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "isennovskiy@gmail.com",
            "name": "Innokentii Sennovskii",
            "username": "Rumata888"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "c524339c1fcc5202a634fe2edeff4c4606a31d87",
          "message": "feat: Montgomery optimisation (partial) (#12822)\n\nChanges Montgomery reduction in wasm for 254-bit fields to include\nYuval's trick and prepares constants for similar changes in x86_64.\nBefore:\n\n![image](https://github.com/user-attachments/assets/0fb0f037-b24f-43d2-b12e-ae6c9675abe8)\nAfter:\n\n![image](https://github.com/user-attachments/assets/52914d78-5d8a-4735-be9e-d58bb1822cab)",
          "timestamp": "2025-03-21T12:42:42Z",
          "tree_id": "c3703c4d20381bcfcb427902832d6275209ab565",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c524339c1fcc5202a634fe2edeff4c4606a31d87"
        },
        "date": 1742563267703,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9393,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23888503753122825,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 136933,
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
          "id": "716ab4f58b72225c3a9fd96762d549b29290bc61",
          "message": "feat: add minter role to TestERC20 (#12889)\n\nAllows multiple accounts to be minters of the staking and fee assets.\n\nCreates a FeeAssetHandler in the periphery to allow mints of a fixed\nsize.\n\nAlso allows rollup owner to update the mana target (and thus, the mana\nlimit which is twice the target).\n\nSee\n[design](https://github.com/AztecProtocol/engineering-designs/blob/42455c99b867cde4d67700bc97ac12309c2332ea/docs/faucets/dd.md#testerc20)\n\nFix #12887\nFix #12882",
          "timestamp": "2025-03-21T10:11:56-04:00",
          "tree_id": "9935c202bf8e512b93fb44eb02f255383fcacb23",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/716ab4f58b72225c3a9fd96762d549b29290bc61"
        },
        "date": 1742567978935,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9232,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23478361520280255,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 143834,
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
          "id": "9770e1513e46566147f471f287f4202c27dfd604",
          "message": "feat!: `AztecNode.findLeavesIndexes` returning block info (#12890)",
          "timestamp": "2025-03-21T08:26:50-06:00",
          "tree_id": "b5a2ec16b2d2e9850232410212fff88e9465e365",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9770e1513e46566147f471f287f4202c27dfd604"
        },
        "date": 1742568720900,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9252,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23528786175802854,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 135651,
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
          "id": "cb978b5a848214803d81dc791800c0976835e4ad",
          "message": "chore: Add comment on verifyHistoricBlock (#12933)\n\nAdds comment on `verifyHistoricBlock` for clarity.",
          "timestamp": "2025-03-21T15:17:48Z",
          "tree_id": "9a98b7a24f0f7eae4d0b3aeb28f4f207cf02536c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/cb978b5a848214803d81dc791800c0976835e4ad"
        },
        "date": 1742570917582,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9809,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.24945780346417062,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 131851,
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
          "id": "bf9a034fe72efdc1a8dc8820983ec091d0efb995",
          "message": "feat: reapplying reverted circuits recorder with a fix (#12919)",
          "timestamp": "2025-03-21T15:54:51Z",
          "tree_id": "80110738438c13dc1f7cfd786f4198e108458d79",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/bf9a034fe72efdc1a8dc8820983ec091d0efb995"
        },
        "date": 1742573134203,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9016,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.22927897037234216,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 130212,
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
          "id": "42733a693956e67a38a094688df119a7a87593f8",
          "message": "fix: Fix prover node publisher for multi-proofs (#12924)\n\nThe prover node publisher did not correctly support multi-proofs. This\nshould fix it.",
          "timestamp": "2025-03-21T16:09:06Z",
          "tree_id": "9dce50895632c159921223e7600a6e5f59794ebe",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/42733a693956e67a38a094688df119a7a87593f8"
        },
        "date": 1742574896061,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9234,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2348272258685672,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 135720,
            "unit": "us"
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
          "id": "05af647330aa6ec5dfebbc3f66ab36531ca29ae1",
          "message": "chore: separated multi map and fixed indexeddb map (#12896)\n\nThis PR cleans up `kv-store` a bit, attempting to separate maps and\nmultimaps a little bit better. The old approach caused a very stupid but\ndifficult to track bug in the `IndexedDB` implementation that would\ncause partial notes to never be discovered and simulations to crash.\n\nAlso removed the `WithSize` variants of maps that were not implemented\nin most store types and had a different testing flow, since they appear\nto be completely unused @Maddiaa0\n\n@alexghr do you think we can get rid of the old lmdb implementations\nsoon?",
          "timestamp": "2025-03-21T17:47:05+01:00",
          "tree_id": "b0a8bd96f469c8fee9cde2a6ec88f8fd6f149ac8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/05af647330aa6ec5dfebbc3f66ab36531ca29ae1"
        },
        "date": 1742576996613,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9599,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2441192884020391,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 148508,
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
          "id": "0ae68919479ba44188ad3797ef7832c987870a18",
          "message": "feat(avm): Port field gt to vm2 (#12883)\n\nPorts field greater than to vm2, removing non-ff and eq functionality,\nwhich could be trivally inlined in other gadgets.",
          "timestamp": "2025-03-21T18:36:23+01:00",
          "tree_id": "24dc2925ae93c0ccda3b9cf0d73e24ddb80fa6c0",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0ae68919479ba44188ad3797ef7832c987870a18"
        },
        "date": 1742580527965,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8377,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2130508109139965,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 108081,
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
          "id": "43155d693ef1e957a44cad0d8375a7d771ad857a",
          "message": "fix: pull CRS data ahead of time (#12945)\n\nDownload a bunch of points needed for proof generation/verification.\nNOTE: the point files are cached so if the files that exist in the\ndefault location already contain enough points this is a noop (a good\nidea to use docker volumes)",
          "timestamp": "2025-03-21T18:50:44Z",
          "tree_id": "cb540182784315d15fd870f0df8e3dff0750f182",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/43155d693ef1e957a44cad0d8375a7d771ad857a"
        },
        "date": 1742584232503,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8397,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.21355543098155416,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 106921,
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
          "id": "1a016024b60b6b35946d899b3943a420b010b768",
          "message": "feat: use msgpack for ClientIvc::Proof in API (#12911)\n\nSwitches to using msgpack for serialization/deserialization of a\nClientIVC::Proof, instead of our custom serialization lib.\n\nThis was motivated by the desire to gracefully handle (reject) invalid\nproof buffers (in the form of fully random bytes) in native\nverification. Our custom serialization library is not meant to handle a\nfully random buffer because it relies on 4-byte chunks containing size\ndata that indicate how much to read from an address. When the size bytes\nare corrupted, the code may attempt to read into uninitialized memory.\nMsgpack on the other hand will throw a meaningful and consistent error\nwhen the proof structure is not as expected. This results in\nverification failure by default.\n\nNote: if the proof has valid structure but is not itself valid,\nverification will proceed as normal and return failure in a time less\nthan or equal to that required for successful verification.\n\n---------\n\nCo-authored-by: PhilWindle <philip.windle@gmail.com>\nCo-authored-by: cody <codygunton@gmail.com>",
          "timestamp": "2025-03-21T20:02:31Z",
          "tree_id": "25c0caa77aef167d7c1fa6c708028ff6457b93ae",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1a016024b60b6b35946d899b3943a420b010b768"
        },
        "date": 1742589294409,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8493,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.21599009210249506,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 108298,
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
          "id": "397144f93b72ea7fdbddc7251e3fd3cef8672652",
          "message": "fix: no hardcoded versions in bbup (#12944)\n\nI've updated bbup to pull the version of bb to install for a given noir\nversion from a json file in aztec-packages (previously it would read\nsome file inside of the noir repo at the given release tag of noir that\nthey have installed.\n\nWe can then update this in future without needing to migrate people onto\nnew versions of bbup.",
          "timestamp": "2025-03-21T20:35:32Z",
          "tree_id": "076d83003542592699f9b338ba04ba2d6b26fbe6",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/397144f93b72ea7fdbddc7251e3fd3cef8672652"
        },
        "date": 1742589988851,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8220,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.20904054362247612,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 109884,
            "unit": "us"
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
          "id": "fdf1da45cb25b756eaa6af15e5dc7761d15cbcc3",
          "message": "chore: fee cleanup (#12941)\n\n- `SponsoredFeePaymentMethod` gets into `aztec.js` , but that's it\n(meaning the method can be used from aztec.js, but there's no concept of\nwhere's deployed/how to get the address/bytecode, etc). It's under\n`@aztec/aztec.js/fee/testing` to make abundantly clear that this is not\na \"production acceptable\" approach.\n- Similarly to `setupCanonicalL2FeeJuice` there's a utility method that\ncan be used from the CLI/during sandbox setup to deploy a\n`SponsoredFeePaymentContract`. It spits out the address where the\ncontract is located, just like the test accounts.\n- You CAN programatically obtain the address of the \"canonical\"\n`SponsoredFeePaymentContract` via `@aztec/sandbox`, but you CANNOT via\n`@aztec/aztec.js`. This is because getting the address implies loading\nthe contract bytecode and it's not a protocol contract, making imports\nmessy and tripping the user into making poor decisions in their app\ndesign. If you want to use it in your app, obtain it from the sandbox\noutput or from an announcement (just like a faucet address, for example)\n- This address is only canonical in the sense it's salt is hardcoded to\n0 (this lives in `@aztec/constants` under `SPONSORED_FPC_SALT`. For\ntestnet it should be prefunded! @PhilWindle @alexghr\n\nThis PR also builds upon the work done in `aztec.js`, allowing us to\nfinally get rid of the special handling of account contract deployments\n`deploy_account_method.ts` by creating a new `FeePaymentMethod` (that's\nnot exposed externally!) that allows an account to pay for its own\ndeployment 😁\n\n---------\n\nCo-authored-by: Jan Beneš <janbenes1234@gmail.com>",
          "timestamp": "2025-03-21T21:37:07+01:00",
          "tree_id": "eaa4338861daa992bb53836b61dd28190a07ca6e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/fdf1da45cb25b756eaa6af15e5dc7761d15cbcc3"
        },
        "date": 1742590951089,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8311,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.21135513940667963,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 106240,
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
          "id": "c3337af484a752294b2a817649ac69de5cadae11",
          "message": "fix: Remove workaround (#12952)",
          "timestamp": "2025-03-21T21:41:13Z",
          "tree_id": "78a72acf3442cb57d2283519eb68e18e97c55857",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c3337af484a752294b2a817649ac69de5cadae11"
        },
        "date": 1742594757439,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9140,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23244337737438003,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 146430,
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
          "id": "e13edb83b72a593ba3a5106d411d2537016d036e",
          "message": "chore: L2 chain config for alpha testnet (#12962)\n\nThis PR adds a chain config block for alpha testnet",
          "timestamp": "2025-03-22T14:36:35Z",
          "tree_id": "3dc7765831ac6268495d5133ff4e24d15d2adc41",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e13edb83b72a593ba3a5106d411d2537016d036e"
        },
        "date": 1742655113958,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9253,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2353060767323704,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 138853,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "5764343+charlielye@users.noreply.github.com",
            "name": "Charlie Lye",
            "username": "charlielye"
          },
          "committer": {
            "email": "5764343+charlielye@users.noreply.github.com",
            "name": "Charlie Lye",
            "username": "charlielye"
          },
          "distinct": true,
          "id": "3933b35bcf92f20c32dfd742d01c3caaf7ad977f",
          "message": "fix: yolo txe binds just to localhost by default.",
          "timestamp": "2025-03-22T19:11:58Z",
          "tree_id": "c917dc69dc265ae758cde5692d8f0692512851f9",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/3933b35bcf92f20c32dfd742d01c3caaf7ad977f"
        },
        "date": 1742672130324,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9843,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2503157733480786,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 148031,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "aakoshh@gmail.com",
            "name": "Akosh Farkash",
            "username": "aakoshh"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "7843a6714547a71c64274830ebb6176d78dbb890",
          "message": "chore: Change `/bin/bash` shebang to be env based (#12834)\n\nChanges `#!/bin/bash` in scripts into `#!/usr/bin/env bash`, to be more\ncross platform.\n\n### Why?\n\nI was just trying to test initialising `noir-repo` on my Mac, because I\nwanted to avoid having to delete it on the mainframe, however the\nversion of `bash` shipped with MacOS is 3.2, and it doesn't have all the\noptions that the `ci3` scripts assume, which caused failures. I have the\nlatest `bash` installed via Homebrew, but the scripts are coded to use\nthe one in `/bin`, which is the old version and cannot be updated.\n\n```console\n$ hash=$(./noir/bootstrap.sh hash)\n/Users/aakoshh/Work/aztec/aztec-packages/ci3/source_options: line 9: shopt: globstar: invalid shell option name\n$ shopt\n...\nglobskipdots   \ton\nglobstar       \toff\ngnu_errfmt     \toff\n...\n$ echo $SHELL\n/opt/homebrew/bin/bash\n$ /bin/bash --version\nGNU bash, version 3.2.57(1)-release (arm64-apple-darwin24)\nCopyright (C) 2007 Free Software Foundation, Inc.\n$ /opt/homebrew/bin/bash --version\nGNU bash, version 5.2.37(1)-release (aarch64-apple-darwin24.0.0)\n$ /bin/bash\n$ shopt\n...\nforce_fignore  \ton\ngnu_errfmt     \toff\nhistappend     \toff\n...\n```",
          "timestamp": "2025-03-22T22:36:09Z",
          "tree_id": "cdd738af86bfece376a20ac399eedd13061319f1",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7843a6714547a71c64274830ebb6176d78dbb890"
        },
        "date": 1742685237156,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9303,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23659578414704144,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 142725,
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
          "id": "18bcc1b1777650d6249e2cdc824ed8acbe39c506",
          "message": "refactor: remove selector from public call request (#12828)\n\n- Remove `function_selector` from `PublicCallRequest` as it is no longer\nused.\n- Remove `public_functions` from `ContractClass`.\n- `ContractClass` checks that there's at most 1 public function in the\nartifact.\n- Rename `args` to `calldata` when it's public calldata that includes\nthe function selector.\n- Use different generator indexes for calldata and regular args.\n\n### aztec-nr\n- Rename oracle calls `enqueue_public_function_call_internal ` to\n`notify_enqueued_public_function_call `, and\n`set_public_teardown_function_call_internal` to\n`notify_set_public_teardown_function_call `, to be consistent with other\noracle calls.\n- Storing data to execution cache will need to provide the hash in\naddition to the preimage, making it possible to use it for different\ntypes of data. Currently it's used for calldata and args.\n\n### node\n- Rename `getContractFunctionName` to `getDebugFunctionName`, as the\nfunction name won't always be available. It's set by explicitly calling\n`registerContractFunctionSignatures` for debugging purpose.\n- Remove `ExecutionRequest[]` in `Tx` and replace it with `calldata[]`.\nWe now loop through the `publicCallRequests` in the public inputs and\npair each with an entry in `calldata[]`.\n- `DataValidator` checks that calldata are provided for all the\nnon-empty public call requests, and the hash is correct.",
          "timestamp": "2025-03-23T13:50:19Z",
          "tree_id": "da67f601d8c18deba44229b7133b3a9d7a20a73f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/18bcc1b1777650d6249e2cdc824ed8acbe39c506"
        },
        "date": 1742740221184,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9294,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23636694550087337,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 143174,
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
          "id": "75c1549dd325cd42da22e407de8971c909050561",
          "message": "chore: Set default proving config to true (#12964)\n\nUp until now our configurations have generally defaulted to swtiching\noff proving. This is desirable for e2e tests and the sandbox etc. I\nthink we are at the point where the default should be switched on and\nthe user has to make a decision to switch it off.",
          "timestamp": "2025-03-23T16:17:51Z",
          "tree_id": "34e5b52c6f1215c400e36bf32de7b35881c85b5f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/75c1549dd325cd42da22e407de8971c909050561"
        },
        "date": 1742748521159,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9250,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23525005669526367,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 134222,
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
          "id": "1a37d6d4c5f4470fa87bd5bd3934e23ce0a9fb10",
          "message": "chore: deflake the kind smoke test (#12955)\n\nSmoke test runs in just under 5 minutes in ci now (just under 3 minutes\nlocally).\nIt has ran through the deflaker (locally) 100 times with no error; i.e.\n\n```\n./yarn-project/end-to-end/scripts/deflaker.sh ./spartan/bootstrap.sh test-kind-smoke\n```\n\nHowever, it did flake when I was running it on mainframe, so updating\nmyself to receive slack notifications.\n\nSee [passing CI run](http://ci.aztec-labs.com/5ffc13f772a79c68)\n\nchanges:\n- have the pxe and bot just connect to the boot node\n- retain the setup l2 contracts job if it fails\n- make the 1-validators yaml lighter/faster\n- use 1-validators in the smoke test in CI\n- fix the kubectl await to only await the pxe\n- make the deflaker support bootstrap scripts\n\nFix #11177",
          "timestamp": "2025-03-23T14:40:39-04:00",
          "tree_id": "370aae2582cceb57e889c939284ddc574d7c6e4d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1a37d6d4c5f4470fa87bd5bd3934e23ce0a9fb10"
        },
        "date": 1742756816897,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9256,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2354052843307416,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 131680,
            "unit": "us"
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
          "id": "49d6bfadb0584e7d5238a319540e2b28255fb688",
          "message": "fix: increased poseidon gates (#12973)\n\nAfter this: https://github.com/AztecProtocol/aztec-packages/pull/12061\nwe were overflowing the trace on contract class registrations. This was\nnot caught by tests due to:\n\n- Insufficient tests with full proving (and the ones we have deploy\nwithout proving!)\n- Insufficient WASM testing: this overflow caused the overflowing trace\nto go over 4GB",
          "timestamp": "2025-03-24T12:11:33+01:00",
          "tree_id": "9cf42eebcbf4d5f2a92b189fd26776e6b180c534",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/49d6bfadb0584e7d5238a319540e2b28255fb688"
        },
        "date": 1742815249246,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9149,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23266960450820626,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 130863,
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
          "id": "5a256c8abaeb65a1fdc47eb674ae19819a795d48",
          "message": "chore: Fix for e2e gossip network test (#12954)",
          "timestamp": "2025-03-24T11:46:28Z",
          "tree_id": "7ec30bc2d4f67e00b8bc288c5f7d7a02ebef1e6d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5a256c8abaeb65a1fdc47eb674ae19819a795d48"
        },
        "date": 1742818710745,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9201,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23400308135257525,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 132673,
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
          "id": "1e796e2d1cc293010942b85165aa04c8b3ab31b3",
          "message": "chore: Bump Noir reference (#12958)\n\nAutomated pull of nightly from the\n[noir](https://github.com/noir-lang/noir) programming language, a\ndependency of Aztec.\nBEGIN_COMMIT_OVERRIDE\nchore: remove duplication on library list files\n(https://github.com/noir-lang/noir/pull/7774)\nchore: bump bb to 0.82.0 (https://github.com/noir-lang/noir/pull/7777)\nfeat: optimize unconstrained `embedded_curve_add`\n(https://github.com/noir-lang/noir/pull/7751)\nEND_COMMIT_OVERRIDE\n\n---------\n\nCo-authored-by: AztecBot <tech@aztecprotocol.com>\nCo-authored-by: Tom French <15848336+TomAFrench@users.noreply.github.com>",
          "timestamp": "2025-03-24T12:11:32Z",
          "tree_id": "57061c001e9e1add1f3cc71c979ef2423b4e6a86",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1e796e2d1cc293010942b85165aa04c8b3ab31b3"
        },
        "date": 1742819935890,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9146,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2325898366614613,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 139257,
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
          "id": "33e528f15947eef5697f2b70d7f510b5ba6b60fa",
          "message": "feat: translator zk relation adjustments testing (#12718)\n\nThis PR changes DeltaRangeConstraint and Permutation relation in\nTranslator to operate correctly in the presence of masking data at the\nend of the polynomials as well as unit tests to establish correctness of\nthe changes given masking is not yet full enabled in Translator.",
          "timestamp": "2025-03-24T12:35:09Z",
          "tree_id": "c26431db9a5376c3059f3c292645c306fe11be29",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/33e528f15947eef5697f2b70d7f510b5ba6b60fa"
        },
        "date": 1742821401551,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9276,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23589890693882481,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 135092,
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
          "distinct": true,
          "id": "a85f5305d491e61bb0df159c31a08bf52e2534dc",
          "message": "fix: sponsored fpc arg parsed correctly (#12976) (#12977)\n\nResyncing master after hotfix for alpha-testnet. Holding for release\n0.82.2 to go in !\n\nCo-authored-by: sklppy88 <esau@aztecprotocol.com>",
          "timestamp": "2025-03-24T14:22:44+01:00",
          "tree_id": "c89fe9c6a93cbbbbfb0f71c913853684e78bb142",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a85f5305d491e61bb0df159c31a08bf52e2534dc"
        },
        "date": 1742824274500,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9222,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23453868234761024,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 133036,
            "unit": "us"
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
          "id": "4a0fd588d46617eec8ded7a1bccf746401d8c3a4",
          "message": "docs: Add fees to cli reference (#12884)\n\nCo-authored-by: josh crites <critesjosh@gmail.com>\nCo-authored-by: Josh Crites <jc@joshcrites.com>",
          "timestamp": "2025-03-24T21:32:10Z",
          "tree_id": "49d02ab7d68f5627cedb0c6a8ef58f7d4b5a16f6",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/4a0fd588d46617eec8ded7a1bccf746401d8c3a4"
        },
        "date": 1742853520021,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8560,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.21770219254409176,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 110068,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "ilyas@aztecprotocol.com",
            "name": "Ilyas Ridhuan",
            "username": "IlyasRidhuan"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "e2b1361f73ddcb582275cb9f9bb8100a94bbc9c7",
          "message": "feat(avm): vm2 initial context (#12972)\n\nThis adds the initial work for `context` and `context_stack` to vm2. The\ninterfaces will still need to be updated in the future, but it sets up\nthe points where the context events will happen (i.e. at the end of the\nmain execution loop and within `call`).\n\nThis also outlines the contents of the two events albeit commented out\nfor now (until we have the supported inputs in the context itself)",
          "timestamp": "2025-03-25T11:41:19+08:00",
          "tree_id": "d8c37cf8472368ef6d8562ff6d8e4e84013d76ce",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e2b1361f73ddcb582275cb9f9bb8100a94bbc9c7"
        },
        "date": 1742876193976,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8348,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.21230962726497218,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 111509,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "5764343+charlielye@users.noreply.github.com",
            "name": "Charlie Lye",
            "username": "charlielye"
          },
          "committer": {
            "email": "5764343+charlielye@users.noreply.github.com",
            "name": "Charlie Lye",
            "username": "charlielye"
          },
          "distinct": true,
          "id": "73820e442ed58433874746f9ab47a1dfde6af986",
          "message": "fix: extend e2e 2 pxes timeout. strip color codes for error_regex.",
          "timestamp": "2025-03-25T08:34:15Z",
          "tree_id": "a6a1c0673dc8daea1be2744761bb03bb7cf87957",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/73820e442ed58433874746f9ab47a1dfde6af986"
        },
        "date": 1742893378352,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9351,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23780002634824293,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 153753,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "ilyas@aztecprotocol.com",
            "name": "Ilyas Ridhuan",
            "username": "IlyasRidhuan"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "8871c83fb13d15d5d36d2466e9953e9bb679ffd0",
          "message": "fix(avm): semicolons are hard (#12999)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\nline.",
          "timestamp": "2025-03-25T19:11:29+08:00",
          "tree_id": "dbf25a7a5efadfdaa3670b5dcf69d466f274667e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8871c83fb13d15d5d36d2466e9953e9bb679ffd0"
        },
        "date": 1742901487969,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9276,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23591476776904133,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 140825,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "88586592+porco-rosso-j@users.noreply.github.com",
            "name": "porco",
            "username": "porco-rosso-j"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "0c21c74c146a282b210cc07cbeb227a1ee19bb18",
          "message": "fix: added #[derive(Eq)] to EcdsaPublicKeyNote (#12966)",
          "timestamp": "2025-03-25T12:16:13Z",
          "tree_id": "8c08a239ac2f371e5beb924745ab8ccac8b15176",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0c21c74c146a282b210cc07cbeb227a1ee19bb18"
        },
        "date": 1742906862887,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9747,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.24788486045693608,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 158651,
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
          "id": "1ece539e68b030845808e63b4ac982644687f0bb",
          "message": "fix(e2e): p2p (#13002)",
          "timestamp": "2025-03-25T13:05:16Z",
          "tree_id": "231a6abfaf7132a54dcdaa52cd53528d69d34eda",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1ece539e68b030845808e63b4ac982644687f0bb"
        },
        "date": 1742909782217,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9432,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23988167116924564,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 141486,
            "unit": "us"
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
          "id": "0838084a4d5cc879c8fcced230ed7483e965067e",
          "message": "fix(docs): Load token artifact from the compiled source in the sample dapp tutorial (#12802)\n\ncloses #12810",
          "timestamp": "2025-03-25T13:31:41Z",
          "tree_id": "9f721baf70f61205a0982cf1a6fd0a800caa917c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0838084a4d5cc879c8fcced230ed7483e965067e"
        },
        "date": 1742911345726,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9474,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.24093146030003676,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 152767,
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
          "id": "770695cd24f480b1f3c5c444e3cd7b6089bdc48d",
          "message": "feat: Validators sentinel (#12818)",
          "timestamp": "2025-03-25T15:51:35Z",
          "tree_id": "a5571d05518b4863bceaf5efb5c314fafa2ecf39",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/770695cd24f480b1f3c5c444e3cd7b6089bdc48d"
        },
        "date": 1742919634009,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9750,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.24796636584213716,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 153825,
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
          "distinct": true,
          "id": "98e2576615cef87771583822b856244dc2f8c82a",
          "message": "chore: Revert \"chore: add default native proving for cli wallet (#12855)\" (#13013)\n\nThis reverts commit c0f773c0c614d1a76ee7aef368645bc280e8b761.\n\nReverting to investigate more if this could be causing timeouts.\n\nCo-authored-by: Esau <esau@aztecprotocol.com>",
          "timestamp": "2025-03-25T20:38:22Z",
          "tree_id": "992a4473ec86d6fdf986fd2d8d9fcf9fedce2254",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/98e2576615cef87771583822b856244dc2f8c82a"
        },
        "date": 1742935938192,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9277,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.235927624954348,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 134159,
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
          "id": "ba8d6548f5f97bf68364f007c2c81370fa6d37a2",
          "message": "fix: Allow use of local blob sink client (#13025)\n\nIn #12857 an irresponsible developer changed the blob sink client\nfactory so that the remote `HttpBlobSinkClient` was used if there was a\nblob archive API defined or even an L1 chain id, since we have a method\nfor inferring an archive API just by using the L1 chain id.\n\nThis has the unintended effect of using the `HttpBlobSinkClient` pretty\nmuch always, since L1 chain id is pretty much always defined. Even when\nrunning locally against anvil. Which means the archiver no longer works\nwhen running locally, since we end up with no local blob sink.\n\nThis commit removes the check for L1 chain id when deciding whether to\nuse a local client or an http one. We assume that, if working in a\n\"real\" environment, we have an L1 consensus host url, given we hit the\narchive API just as a fallback.",
          "timestamp": "2025-03-25T19:25:26-03:00",
          "tree_id": "4722ac25ea1946b8532ffda3773ec9b47540e78b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ba8d6548f5f97bf68364f007c2c81370fa6d37a2"
        },
        "date": 1742942256340,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9396,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23894736993019391,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 156147,
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
          "id": "56b1f0d2bc29909041c579d79221388a25d8b6d0",
          "message": "feat: AVM parsing tag validation (#12936)\n\nBEFORE\n```\ninstr_fetching_acc                   8.56 us     8.56 us     81280\ninstr_fetching_interactions_acc      5.24 us     5.23 us    132904\n```\nAFTER this PR (version with committed column)\n```\ninstr_fetching_acc                   8.79 us     8.79 us     79677\ninstr_fetching_interactions_acc      5.74 us     5.74 us    122150\n```",
          "timestamp": "2025-03-26T08:42:59+01:00",
          "tree_id": "1e30faa2cbc56980c615eb6ed05a1ec503cdc203",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/56b1f0d2bc29909041c579d79221388a25d8b6d0"
        },
        "date": 1742976835029,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9220,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23448104771759665,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 135832,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "koenmtb1@users.noreply.github.com",
            "name": "Koen",
            "username": "koenmtb1"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "67018067b9871218cc303d7f9685a7f6fead18c9",
          "message": "fix: parse away trailing slash from consensus host (#12577)\n\nfixes: https://github.com/AztecProtocol/aztec-packages/issues/12576",
          "timestamp": "2025-03-26T10:33:11Z",
          "tree_id": "b1313a2e65984eb542451b6fc274caf823faa98d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/67018067b9871218cc303d7f9685a7f6fead18c9"
        },
        "date": 1742987004290,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9222,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2345206409824351,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 147870,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "9820846+rw0x0@users.noreply.github.com",
            "name": "Roman Walch",
            "username": "rw0x0"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "76ef873f0721843bb2f44e2428d352edf595d1c3",
          "message": "fix: make circuit parsing deterministic (#11772)",
          "timestamp": "2025-03-26T11:36:28Z",
          "tree_id": "99813f93acb4c2bca53cf02b059d89b9e26d43ba",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/76ef873f0721843bb2f44e2428d352edf595d1c3"
        },
        "date": 1742990259661,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9670,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2459136528309088,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 155514,
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
          "distinct": true,
          "id": "34ec9e8300116d27c1903a1daae775672186c945",
          "message": "feat(avm): merkle db hints (part 1) (#12922)\n\nThis PR adds AVM hints for the following merkle operations\n* getPreviousValueIndex to get the low leaf index\n* getLeafPreimage to get the low leaf preimage\n* getSiblingPath to get the low leaf sibling path\n\nOn the C++ side, the operations are called slightly differently. I'm using the C++ world state db names.\n\nThis PR also separates the C++ DB interfaces into low level (basically the equivalent of the TS merkleops) and high level (equivalent of the public trees db/journal). This needed to be done because loose low level operations cannot necessarily be constrained. We usually need more context, and a coarser granularity. Therefore the idea is that low level ops are hinted (and unconstrained), and high level ops are constrained.\n\nHinting is currently tested via the deserialization tests, and it should be used by the bulk test, but we never get there (beyond bytecode processing). So some things might still be wrong.\n\nI'm trying to get this out as quick as possible to unblock others.\n\n```\nInitializing HintedRawContractDB with...\n * contractInstances: 6\n * contractClasses: 3\n * bytecodeCommitments: 3\nInitializing HintedRawMerkleDB with...\n * get_sibling_path hints: 3\n * get_previous_value_index hints: 27\n * get_leaf_preimage hints_public_data_tree: 3\n```\n\nPS: there's probably a lot of duplication happening now in the hints. We'll have to eventually deduplicate.",
          "timestamp": "2025-03-26T12:08:05Z",
          "tree_id": "9d34bec4915bbd9a3cac20240f72ce7da1cdb1ab",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/34ec9e8300116d27c1903a1daae775672186c945"
        },
        "date": 1742993507138,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9692,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2464752195046686,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 147837,
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
          "id": "d768d2661462f93d798a3f535d9a7b33fc619276",
          "message": "chore: fix governance util issue (#13043)\n\nUpdates the governance util such that it uses the correct asset",
          "timestamp": "2025-03-26T14:13:46Z",
          "tree_id": "3fc85ef5b7fbc02975c1cbffd116bf84fba9a9ea",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d768d2661462f93d798a3f535d9a7b33fc619276"
        },
        "date": 1742999646688,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9371,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23832897072152429,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 137681,
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
          "id": "fefffa7a6376066792874da4c5da41126603841d",
          "message": "chore: towards no more mock op_queues (#12984)\n\nRemove occurences of mock ecc ops additions in scenarios where the merge\nprotocol operates properly without adding this merge operations but we\nare also not required to make some actual changes to the protocol\nitself.",
          "timestamp": "2025-03-26T14:24:00Z",
          "tree_id": "5b9e2ccabd7ddb216d8259b5131a737d7e6a7ed1",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/fefffa7a6376066792874da4c5da41126603841d"
        },
        "date": 1743000887473,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9385,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23866604772604957,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 132083,
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
          "distinct": true,
          "id": "1ebd04424dca674b35c4fc3d32e240046f9b27fa",
          "message": "chore(bb): minor acir buf C++ improvements (#13042)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\nline.",
          "timestamp": "2025-03-26T14:38:21Z",
          "tree_id": "74dd59a306f9a0cbd7c2f957d2bafac019b7e930",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1ebd04424dca674b35c4fc3d32e240046f9b27fa"
        },
        "date": 1743002546895,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9322,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23706676345312397,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 138484,
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
          "distinct": true,
          "id": "8a47d8ba6618fa5299923d8b70bb3cfe88e48115",
          "message": "fix: bootstrap network and sponsored fpc devnet (#13044)\n\nEnables sponsoredFPC and fixes bootstrap network\n\nCo-authored-by: sklppy88 <esau@aztecprotocol.com>",
          "timestamp": "2025-03-26T16:29:48+01:00",
          "tree_id": "b61dd476682adffe52546b9638354d5d9af2dcc6",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8a47d8ba6618fa5299923d8b70bb3cfe88e48115"
        },
        "date": 1743004831305,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9278,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23594477004822711,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 131658,
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
          "id": "af48184f5786e21b7e2e7aa980487b04495a2559",
          "message": "feat: staking asset handler (#12968)\n\nFix #12932",
          "timestamp": "2025-03-26T11:38:38-04:00",
          "tree_id": "bd02b0f6ee462d1ce944711ee6f5d9d959089048",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/af48184f5786e21b7e2e7aa980487b04495a2559"
        },
        "date": 1743006051681,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9479,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.24105754839170018,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 146772,
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
          "id": "3a7ba2d12da63833ef233b290d51428594f21c13",
          "message": "chore: redundant if in affine from projective constructor (#13045)\n\nThe if-statement at the end of the projective to affine constructor is\nredundant, we check that the projective point is infinity at the\nbeginning of the function and the operations we perform afterwards do\nnot affect it in a way that would make it become infinity.",
          "timestamp": "2025-03-26T15:36:35Z",
          "tree_id": "755181a5808e6ba644ec16f1406c5572090ed559",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/3a7ba2d12da63833ef233b290d51428594f21c13"
        },
        "date": 1743006052968,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9438,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2400282657285722,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 131302,
            "unit": "us"
          }
        ]
      }
    ]
  }
}