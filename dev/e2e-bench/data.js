window.BENCHMARK_DATA = {
  "lastUpdate": 1743994777257,
  "repoUrl": "https://github.com/AztecProtocol/aztec-packages",
  "entries": {
    "End-to-end Benchmark": [
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
          "id": "4ee1e4ad3c1fa444b187943b9616d7f7d01eb1ad",
          "message": "fix: read and pass rollup version (#13232)\n\nRead the canonical rollup version and enrich the configs",
          "timestamp": "2025-04-02T16:08:45Z",
          "tree_id": "c3c12d3e60adaffce7356be30e0fcc4d9ca7fd13",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/4ee1e4ad3c1fa444b187943b9616d7f7d01eb1ad"
        },
        "date": 1743613222467,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9563,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.24319208088763164,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 147258,
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
          "id": "7f96676164d348cbfb0f8d7c23b88f4844f5a804",
          "message": "feat(avm): merkle db hints (part 3) (#13199)\n\nSequential inserts for `PUBLIC_DATA_TREE` and `NULLIFIER_TREE`.\n\nBulk test yields\n```\nInitializing HintedRawMerkleDB with...\n * get_sibling_path hints: 39\n * get_previous_value_index hints: 37\n * get_leaf_preimage hints_public_data_tree: 28\n * get_leaf_preimage hints_nullifier_tree: 9\n * get_leaf_value_hints: 0\n * sequential_insert_hints_public_data_tree: 7\n * sequential_insert_hints_nullifier_tree: 2\n```",
          "timestamp": "2025-04-02T17:00:37Z",
          "tree_id": "f4548af3dbe89eb17f9e6da1302ff1adce0ed8cc",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7f96676164d348cbfb0f8d7c23b88f4844f5a804"
        },
        "date": 1743617011029,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8415,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.21400316895892593,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 112204,
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
          "distinct": false,
          "id": "13426fe2cb2d1ca94df815532cc3b786bc4e5ab2",
          "message": "fix: prover config read from L1 (#13237)\n\nThis PR is based on #13232",
          "timestamp": "2025-04-02T17:33:40Z",
          "tree_id": "35429d346b99e70021db70cc83d646b5b5c8647d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/13426fe2cb2d1ca94df815532cc3b786bc4e5ab2"
        },
        "date": 1743617507140,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9367,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2382252977637553,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 141238,
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
          "id": "b18486532af6537e648b5f5c90612bfdf0638618",
          "message": "refactor: streamlined log processing (#13107)\n\nStreamlines log processing by loading the logs from capsules after the\n`syncNotes` oracle call finishes. This prevents spawning a new simulator\nfor processing of each individual log.\n\nStumbled upon [a TXE\nissue](https://github.com/AztecProtocol/aztec-packages/issues/13221)\nwhen implementing this.\n\n---------\n\nCo-authored-by: Nicolás Venturo <nicolas.venturo@gmail.com>",
          "timestamp": "2025-04-02T17:53:50Z",
          "tree_id": "40dc859c1814685a4cf787a6259cf3f8e0653a49",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/b18486532af6537e648b5f5c90612bfdf0638618"
        },
        "date": 1743619102293,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9335,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23739441586611335,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 141650,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "159419107+DanielKotov@users.noreply.github.com",
            "name": "DanielKotov",
            "username": "DanielKotov"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "84890c220abbcbfeb63dd8e9ce9e5f590c341bee",
          "message": "feat(Barretenberg):  static analyzer's routine (#13207)\n\nThis PR adds new used_witnesses vector in UltaCircuitBuilder that\ncontains variables in one gate that are not dangerous.\n\nThere were many false cases while testing static analyzer's working with\ndifferent primitives, so it's time to save these variables and remove\nthem at the final step of working.\n\nAlso some code refactoring.",
          "timestamp": "2025-04-02T18:48:41Z",
          "tree_id": "fe74eb7536ea7582fcf965f16cb73288a37d8134",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/84890c220abbcbfeb63dd8e9ce9e5f590c341bee"
        },
        "date": 1743624552910,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9470,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.24084871232644442,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 137545,
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
          "distinct": false,
          "id": "ad0530f0ee53b46e82d09f71b19217a6da158345",
          "message": "feat: register private-only contracts in cli-wallet and misc improvements (#13245)\n\nIn order to support the new paradigm of not deploying sponsoredFPC in\nnetworks but having their address prefunded, this PR adds the ability to\nthe wallet to register private-only contracts (that are not publicly\ndeployed and available in a node)\n\nAlso includes some misc fixes and improvements such as allowing\ndeployment/registration of contracts with no initializer, or\nautomatically loading protocol contracts as aliases on startup",
          "timestamp": "2025-04-02T20:20:44Z",
          "tree_id": "afb76c438e1f07e16c035eb34ac3e21b4b278493",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ad0530f0ee53b46e82d09f71b19217a6da158345"
        },
        "date": 1743628088163,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9514,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.24195312303413088,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 141023,
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
          "id": "49aabfb3df5806e3174d62a1248c46fa3c39e85c",
          "message": "fix(docs): Register FPC docs, contract deployment, events (#13222)\n\n- adds snippets to tell people to register FPCs before using them\n- adds a contract deployment summary cc @jzaki may be relevant for\ncontract upgrades section\n- closes https://github.com/AztecProtocol/aztec-packages/issues/12906\n- adds glossary and call types pages back to the sidebar",
          "timestamp": "2025-04-02T22:59:59Z",
          "tree_id": "608c0f93016dbf245e1b491f25b832e8ca648a86",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/49aabfb3df5806e3174d62a1248c46fa3c39e85c"
        },
        "date": 1743636818846,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9415,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23944754662043732,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 137641,
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
          "id": "d1362978a1352cb9eee6d73a0a81a8bc704d4227",
          "message": "git subrepo push --branch=master noir-projects/aztec-nr\n\nsubrepo:\n  subdir:   \"noir-projects/aztec-nr\"\n  merged:   \"42c00b05de\"\nupstream:\n  origin:   \"https://github.com/AztecProtocol/aztec-nr\"\n  branch:   \"master\"\n  commit:   \"42c00b05de\"\ngit-subrepo:\n  version:  \"0.4.6\"\n  origin:   \"???\"\n  commit:   \"???\"",
          "timestamp": "2025-04-03T02:29:39Z",
          "tree_id": "348e2a8f0eddcc9d49c8b4c17f14df062619cb4b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d1362978a1352cb9eee6d73a0a81a8bc704d4227"
        },
        "date": 1743649157530,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9482,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.24115294257232056,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 146171,
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
          "distinct": false,
          "id": "4b0a4ad1826d0372928c680b9c8891528a73f933",
          "message": "chore: more benchmarking (#13211)\n\nAdded cheapest txs: schnorr + fee_juice transfer variants",
          "timestamp": "2025-04-03T07:47:10Z",
          "tree_id": "6aaed7e9afa4edf4d4c4a7ac4da0cd878ac8d2f0",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/4b0a4ad1826d0372928c680b9c8891528a73f933"
        },
        "date": 1743668991384,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9263,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2355661549855692,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 127411,
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
          "id": "1e470f05d51792066b3d4b24fa164daf4d5b73ad",
          "message": "fix: indexeddb multimap dupes (#13254)\n\nhttps://github.com/AztecProtocol/aztec-packages/pull/13107 uncovered a\nbug in the indexeddb kv store implementation that would generate\nduplicates when using multimaps. This takes care of it, fixing the boxes\ntests in the process\n\n---------\n\nCo-authored-by: thunkar <gregjquiros@gmail.com>",
          "timestamp": "2025-04-03T10:22:50+01:00",
          "tree_id": "01c419accfd8b61eaf9940cb1f0675c2ba06a73f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1e470f05d51792066b3d4b24fa164daf4d5b73ad"
        },
        "date": 1743672625784,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9374,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23840624471781163,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 149782,
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
          "distinct": false,
          "id": "cc609022fe6d31335a67c96521601439907df672",
          "message": "fix: archiver prune issue and slasher flake (#13156)\n\nFixes #13065.\n\n- Fix a problem in the archiver that caused the slashing test to\nconsistently fail.\n- Fix the flake, by handling a race-condition\n\nShould make the slasher consistently run without flakes, at least when\ntrying it locally for 32 parallel runs multiple times.\n\nKeeping it in the flake for now, but will look at removing it from\nflakes if no failures in the next week from it.",
          "timestamp": "2025-04-03T09:40:52Z",
          "tree_id": "518947372c6623f444b755b9c7f3aed5e083d938",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/cc609022fe6d31335a67c96521601439907df672"
        },
        "date": 1743676345053,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9260,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23548732807364536,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 149664,
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
          "id": "0dcc915177db55fc43076caee12b92d830602c85",
          "message": "feat: Remove 4 byte metadata from bb-produced proof (#13231)\n\nCloses https://github.com/AztecProtocol/barretenberg/issues/1312.\n\nRemoves the 4 byte metadata from proof and public inputs produced from\nthe `to_buffer</*include_size=*/true>()` function. We are able to\nserialize and deserialize without this metadata by use many_from_buffer\nfor deserialization.\n\nThe result is that we get to remove a lot of ugly if statements and\nweird proof parsing based on the metadata.",
          "timestamp": "2025-04-03T13:34:25Z",
          "tree_id": "8bc96cb526b03767cf89e06c47294053a97df1ea",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0dcc915177db55fc43076caee12b92d830602c85"
        },
        "date": 1743690912818,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9175,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2333250191851497,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 140103,
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
          "id": "2633856a9a7f4e4976a9738cdd0e9348196c67c7",
          "message": "fix(avm): fix lookup builder and FF hashing (#13263)\n\n### TL;DR\n\nFix field element hashing and improve lookup table processing in the VM2\nimplementation.\n\n### What changed?\n\n- Removed `HashableTuple` class from `utils.hpp` as it's no longer\nneeded\n- Fixed field element hashing by ensuring elements are reduced before\nhashing\n- Replaced `LookupIntoDynamicTableSequential` with\n`LookupIntoDynamicTableGeneric` for field GT lookups\n- Modified the `LookupIntoDynamicTableSequential` implementation to sort\nsource rows before processing\n- Simplified the `RangeCheckEvent` equality operator using default\ncomparison\n- Updated tuple types in `raw_data_dbs.hpp` to use standard `std::tuple`\ninstead of `HashableTuple`. This is supported by the anklr map.",
          "timestamp": "2025-04-03T17:49:13+01:00",
          "tree_id": "c4321f75d1e2929a836fe9d499ba1d0ce83b1c51",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/2633856a9a7f4e4976a9738cdd0e9348196c67c7"
        },
        "date": 1743699356090,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9281,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23601916853279156,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 135513,
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
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "62c32eb0064c0d95527286882b1ec798fd2c3932",
          "message": "chore: flake (#13277)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\nline.",
          "timestamp": "2025-04-03T17:55:18+01:00",
          "tree_id": "c9a81647bec29bfa27bdcda707b84656aaf0f030",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/62c32eb0064c0d95527286882b1ec798fd2c3932"
        },
        "date": 1743700919495,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 8248,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.20974676434153988,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 104842,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "nicolas.venturo@gmail.com",
            "name": "Nicolás Venturo",
            "username": "nventuro"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": false,
          "id": "bd9e690ca9b26f7f0415e89f6a1825d10f07fc87",
          "message": "chore: add some PrivateSet tests (#13270)\n\nIt's a bit shameful that even such a basic component has no tests. I\nadded some basic cases, though we should have more (e.g. multiple notes,\ninsertion after removal, etc.). PrivateSet is a bit strange in that it\ndoesn't actually _do_ much, it's mostly wrappers for the lower level\nnote api. Alas.\n\nI opened #13269 since as of now it's not really possible to test settled\nnotes without creating a contract (!), which we definitely should be\nable to do.",
          "timestamp": "2025-04-03T20:01:07Z",
          "tree_id": "371b6387e969ec9769416ceed773fd9534a6ff88",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/bd9e690ca9b26f7f0415e89f6a1825d10f07fc87"
        },
        "date": 1743719986857,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9262,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2355428508976067,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 154349,
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
          "id": "df9a40c5051229f3c6a6b3f88c6d12f145c64420",
          "message": "chore: move a couple of `SharedMutableValues` functions outside of impl (#13283)\n\nThis was discussed a bit over slack, but here's some context.\n\nIn Rust this gives an error:\n\n```rust\npub struct Foo<T> {\n    x: T,\n}\n\nimpl<T> Foo<T> {\n    fn one(x: T) {\n        Bar::two(x); // Cannot infer the value of const parameter U\n    }\n}\n\nstruct Bar<T, const U: usize> {\n    x: T,\n}\n\nimpl<T, const U: usize> Bar<T, U> {\n    fn two(x: T) -> Foo<T> {\n        Foo { x }\n    }\n}\n\nfn main() {\n    Foo::<i32>::one(1);\n}\n```\n\nIn the call `Bar::two` Rust needs to know what is the value of `U`. It\ncan be solved by doing `Bar::<T, 1234>::two(x)` or using any numeric\nvalue... because the numeric value isn't used in that impl function...\nwhich probably means that it doesn't need to \"belong\" to `Bar`.\n\nIn this [Noir PR](https://github.com/noir-lang/noir/pull/7843) gets\nmerged that's what will happen. We have a similar case in this codebase\nwhere `SharedMutableValues` has two methods:\n- `unpack_value_change`: doesn't refer to `INITIAL_DELAY`\n- `unpack_delay_change`: doesn't refer to `T`\n\nSo, this PR moves those two methods outside of the impl, only specifying\nthe generics that are needed.",
          "timestamp": "2025-04-03T20:54:11Z",
          "tree_id": "c66600a6455491e676ffd9af95cf47c16759ed52",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/df9a40c5051229f3c6a6b3f88c6d12f145c64420"
        },
        "date": 1743722525565,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9254,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23533033083208568,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 145667,
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
          "id": "945ffa29c5d77271b21e037c6e5e03f213d93d56",
          "message": "feat!: `#[utility]` function (#13243)\n\nPartially addresses\nhttps://github.com/AztecProtocol/aztec-packages/issues/12743 (partially\nas the rest will be addressed in PRs up the stacks)\n\nIntroduces a `#[utility]` macro for top-level unconstrained functions\nand applies it to all the relevant functions.",
          "timestamp": "2025-04-03T23:15:57Z",
          "tree_id": "eab6436f6d8e0c132453d424a8a8c007af848d86",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/945ffa29c5d77271b21e037c6e5e03f213d93d56"
        },
        "date": 1743724181310,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9171,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23324093882276767,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 147640,
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
          "id": "69df86f4b234725dfacea686fd7307e45685ddfe",
          "message": "refactor!: `UnsconstrainedContext` --> `UtilityContext` (#13246)\n\nPartially addresses\nhttps://github.com/AztecProtocol/aztec-packages/issues/12743 (partially\nas the rest will be addressed in PRs up the stacks)\n\nIn this PR I only rename `UnconstrainedContext` as `UtilityContext`. The\nrest of the unconstrained --> utility renaming will be done in PRs up\nthe stack.",
          "timestamp": "2025-04-04T01:41:31Z",
          "tree_id": "e8f052c8927277af5fc1b2f33676f41c8bdc6d78",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/69df86f4b234725dfacea686fd7307e45685ddfe"
        },
        "date": 1743732714496,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9472,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2408911817446881,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 147219,
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
          "id": "133bcf6315da989121a8b27d51c46d9798f39fd3",
          "message": "git subrepo push --branch=master noir-projects/aztec-nr\n\nsubrepo:\n  subdir:   \"noir-projects/aztec-nr\"\n  merged:   \"45d3f88ef8\"\nupstream:\n  origin:   \"https://github.com/AztecProtocol/aztec-nr\"\n  branch:   \"master\"\n  commit:   \"45d3f88ef8\"\ngit-subrepo:\n  version:  \"0.4.6\"\n  origin:   \"???\"\n  commit:   \"???\"",
          "timestamp": "2025-04-04T02:29:18Z",
          "tree_id": "d2bb1c947064664c159317d86639458e8b29648e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/133bcf6315da989121a8b27d51c46d9798f39fd3"
        },
        "date": 1743735423585,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9162,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23299980963915554,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 150956,
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
          "id": "8a622c955e568e42753bc5e886027d2e0c0230e8",
          "message": "chore: minor simulator utils cleanup (#13250)\n\n`executeUnconstrainedFunction` was now unnecessary so I nuked it. Also\ncleaned up the related function params which were unnecessarily\ncluttered.",
          "timestamp": "2025-04-04T02:15:08Z",
          "tree_id": "904fc53eeb9f096b7485f13022944c1cfaec8797",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8a622c955e568e42753bc5e886027d2e0c0230e8"
        },
        "date": 1743736353706,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9358,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23798803015403538,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 152045,
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
          "id": "34d03bb3d32f26c2a26b9adcd72e7bd17af0c015",
          "message": "refactor: renaming unconstrained function as utility in TS (#13249)\n\nPartially addresses\nhttps://github.com/AztecProtocol/aztec-packages/issues/12743 (partially\nas the rest will be addressed in PRs up the stacks)\n\nIn this PR I rename occurrences of unconstrained to utility in our TS\ncodebase.\n\nThere are still missing some renamings on ContractClassRegister and\nrenamings of the related constants. That will be done in a separate PR.",
          "timestamp": "2025-04-04T07:58:08Z",
          "tree_id": "ad8c3fc7495ff39b84b074c09fa12b8c37f37f5b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/34d03bb3d32f26c2a26b9adcd72e7bd17af0c015"
        },
        "date": 1743755256083,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9407,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2392449811187861,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 140856,
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
          "id": "9a1ddc5101cb93069cf4621b4b705a307628b80a",
          "message": "chore: update slashing test port (#13274)\n\n## Overview\n\nWas using the same port as the gossip test, could likely cause\ncontention",
          "timestamp": "2025-04-04T07:58:56Z",
          "tree_id": "92f502100c582f9fc47851f4485e0dfffc98b6f3",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/9a1ddc5101cb93069cf4621b4b705a307628b80a"
        },
        "date": 1743755537312,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9598,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.24409622761485034,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 156807,
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
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": false,
          "id": "c8e95ddaf72ccb74e1772357170cd2290f785717",
          "message": "chore: bump full prover test to 32 cores. hoping to boost speed. (#13293)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\nline.",
          "timestamp": "2025-04-04T08:18:12Z",
          "tree_id": "e10f7b887053eb9e466991b28e5377df30950705",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c8e95ddaf72ccb74e1772357170cd2290f785717"
        },
        "date": 1743756725587,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9263,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2355713712939323,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 149209,
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
          "distinct": false,
          "id": "52aceb46b5be60a5b98009dc383ed29465118e06",
          "message": "fix: import right assert (#13268)\n\nWe had assertions that only printed to the console instead of crashing\nthe process. This PR fixes that\n\n---------\n\nCo-authored-by: lucasxia01 <lucasxia01@gmail.com>",
          "timestamp": "2025-04-04T08:43:49Z",
          "tree_id": "e0245417a9f8216d1f02dfad55b5c23fb6f5d7be",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/52aceb46b5be60a5b98009dc383ed29465118e06"
        },
        "date": 1743759035401,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9536,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.24252013341517578,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 134515,
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
          "id": "91f28c4626ed6caf18a1774b6712e88fa8825367",
          "message": "fix: Unhandled rejection in prover broker facade (#13286)\n\nFixes #13166\n\nCo-authored-by: Alex Gherghisan <alexghr@users.noreply.github.com>",
          "timestamp": "2025-04-04T09:02:58Z",
          "tree_id": "1a75d03e8add0f55cb4d0fdf172376e21c5256c6",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/91f28c4626ed6caf18a1774b6712e88fa8825367"
        },
        "date": 1743759422432,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9388,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2387628075354497,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 154274,
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
          "id": "5425d16b5f0cfa3b0fd98560800918fd98ca2e0e",
          "message": "chore(bb): add fr container hashing benchmark (#13295)\n\n```\n-----------------------------------------------------------\nBenchmark         Time            CPU         Iterations\n-----------------------------------------------------------\nhash_bench        564 ns          563 ns      1243422\n```",
          "timestamp": "2025-04-04T11:29:35Z",
          "tree_id": "f1ee7e10af213a3d6c476822b55c7d38b6259c41",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5425d16b5f0cfa3b0fd98560800918fd98ca2e0e"
        },
        "date": 1743767797141,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9516,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2420075201416809,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 140220,
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
          "id": "69c316852a1d72491a6e3a73e0cf6fc328f235ea",
          "message": "chore: give port change test more resources (#13266)\n\nWhen running locally lower resources cause the errors seen in ci",
          "timestamp": "2025-04-04T11:30:09Z",
          "tree_id": "88c25f45e91923246966d5dd6f53bd199cb24401",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/69c316852a1d72491a6e3a73e0cf6fc328f235ea"
        },
        "date": 1743767837423,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9296,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2364155618179411,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 144992,
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
          "id": "ca3da0cb04808fc1b274024c3c71146c19386262",
          "message": "chore: add default native proving for cli-wallet (#13129)\n\nOkay so I've verified [here](http://ci.aztec-labs.com/38a5491ed3a6ac97),\nthat none of the cli-wallet tests in\n\ncli-wallet/tests/flows or\naztec-up/test or\nend-to-end/src/guides\n\nare running with prover. It turns out we needed to export the var in\neach location as the command was being called and not inheriting a\nnon-exported env var.\n\nCo-authored-by: sklppy88 <esau@aztecprotocol.com>",
          "timestamp": "2025-04-04T11:37:26Z",
          "tree_id": "291af593ed185a003bdef4bfa23bd2212f116e1e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ca3da0cb04808fc1b274024c3c71146c19386262"
        },
        "date": 1743768710933,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9911,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.25204776204271606,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 151036,
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
          "id": "c79402b842aeb2966d4e93e86528b8b5a29c23a4",
          "message": "chore(p2p): fix gas message validator (#13299)\n\n## Overview\n\nSome new flakes have appeared after\nhttps://github.com/AztecProtocol/aztec-packages/pull/13154 as the\nmessage validation logic was unaware of the skipped state. This resulted\npeers dropping transactions with too low gas fees, that could become\nvalid later.\n\nexample failing log:\n```\n08:06:17 [08:06:17.334] INFO: pxe:service:f4e6b4 Sent transaction 0x290aafc7b7c9c57f409dfb23dff0a42f126e157c640716eb9b56ead6276ab572\n08:06:17 [08:06:17.339] INFO: e2e:e2e_p2p:e2e_p2p_rediscovery Tx sent with hash 0x290aafc7b7c9c57f409dfb23dff0a42f126e157c640716eb9b56ead6276ab572\n08:06:17 [08:06:17.797] INFO: e2e:e2e_p2p:e2e_p2p_rediscovery Receipt received for 0x290aafc7b7c9c57f409dfb23dff0a42f126e157c640716eb9b56ead6276ab572\n08:06:17 [08:06:17.839] WARN: sequencer:tx_validator:tx_gas Skipping transaction 0x290aafc7b7c9c57f409dfb23dff0a42f126e157c640716eb9b56ead6276ab572 due to insufficient fee per gas {\"txMaxFeesPerGas\":{\"feePerDaGas\":0,\"feePerL2Gas\":28890},\"currentGasFees\":{\"feePerDaGas\":0,\"feePerL2Gas\":270010}}\n08:06:17 [08:06:17.842] VERBOSE: p2p:peer-scoring Penalizing peer 16Uiu2HAmVSN83RZZYAXjTVvjF1SdcKEnovXNd7wK1SzVRngiwFB4 with HighToleranceError (new score is -2)\n08:06:17 [08:06:17.875] WARN: sequencer:tx_validator:tx_gas Skipping transaction 0x290aafc7b7c9c57f409dfb23dff0a42f126e157c640716eb9b56ead6276ab572 due to insufficient fee per gas {\"txMaxFeesPerGas\":{\"feePerDaGas\":0,\"feePerL2Gas\":28890},\"currentGasFees\":{\"feePerDaGas\":0,\"feePerL2Gas\":270010}}\n08:06:17 [08:06:17.876] VERBOSE: p2p:peer-scoring Penalizing peer 16Uiu2HAmVSN83RZZYAXjTVvjF1SdcKEnovXNd7wK1SzVRngiwFB4 with HighToleranceError (new score is -2)\n08:06:18 [08:06:18.020] WARN: sequencer:tx_validator:tx_gas Skipping transaction 0x290aafc7b7c9c57f409dfb23dff0a42f126e157c640716eb9b56ead6276ab572 due to insufficient fee per gas {\"txMaxFeesPerGas\":{\"feePerDaGas\":0,\"feePerL2Gas\":28890},\"currentGasFees\":{\"feePerDaGas\":0,\"feePerL2Gas\":270010}}\n08:06:18 [08:06:18.022] VERBOSE: p2p:peer-scoring Penalizing peer 16Uiu2HAmVSN83RZZYAXjTVvjF1SdcKEnovXNd7wK1SzVRngiwFB4 with HighToleranceError (new score is -2)\n\n```",
          "timestamp": "2025-04-04T12:10:13Z",
          "tree_id": "161bc8177bd5adf9c03e25892323eb9c09a1ba4f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c79402b842aeb2966d4e93e86528b8b5a29c23a4"
        },
        "date": 1743770619844,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9215,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23434504777358145,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 132656,
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
          "id": "65cfdf589b7a9bab63c5fbb07a2f52ef34b47e97",
          "message": "chore: Contract addresses for alpha-testnet (#13303)\n\nThis PR simply configures contract addresses for alpha-testnet",
          "timestamp": "2025-04-04T15:05:25Z",
          "tree_id": "204112c4011f82ca091b8a40d1bdbca38431b831",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/65cfdf589b7a9bab63c5fbb07a2f52ef34b47e97"
        },
        "date": 1743782547516,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9400,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2390560156055767,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 144132,
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
          "id": "d4f45c7eb54eebe22f38f6a67336c02585ba8008",
          "message": "chore: add ci logging to discv5 test (#13306)\n\nStruggling to reproduce this one locally, adding logging to CI for now",
          "timestamp": "2025-04-04T15:44:44Z",
          "tree_id": "1f787c86c62619e026361832ec559b5107abee07",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d4f45c7eb54eebe22f38f6a67336c02585ba8008"
        },
        "date": 1743783557151,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9242,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23504546719517425,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 149535,
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
          "id": "7f9af7cf1042b86ce01e5dc2f6eb63887dddb231",
          "message": "chore: Test that a contract without initializer can still be called (#13324)\n\nIn #12215 the `TestContract` had an `initializer` added, meaning that\nthe e2e test that checked that we could call a private function in a\ncontract without an initializer no longer tested that.\n\nThis PR adds another test that covers that scenario.",
          "timestamp": "2025-04-04T20:11:04Z",
          "tree_id": "547fdd7c14fd6168a952fa9101691d5ba682a721",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7f9af7cf1042b86ce01e5dc2f6eb63887dddb231"
        },
        "date": 1743801396495,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9190,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23372726505676886,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 151320,
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
          "id": "ab0d6c600815e5a75b87b52ceb4fe69654a8bbfc",
          "message": "refactor: using Txhash type (#13318)\n\nIn plenty of the places we didn't use the TxHash type for no apparent\nreason.",
          "timestamp": "2025-04-04T20:47:04Z",
          "tree_id": "91ac4b9a05393f74912424e3e360d7eef2c6ffdb",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ab0d6c600815e5a75b87b52ceb4fe69654a8bbfc"
        },
        "date": 1743801731150,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9284,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23610693660930135,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 137715,
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
          "id": "7db22474e5b1ec959e3afc9dbedad0baec7c022f",
          "message": "chore: Cleanup sequencer block sync check (#13289)\n\nFixes #9316",
          "timestamp": "2025-04-04T20:49:54Z",
          "tree_id": "beeb680f4e3c3047fea8b8744e17c3d4a74f2f11",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7db22474e5b1ec959e3afc9dbedad0baec7c022f"
        },
        "date": 1743803432459,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9460,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.24058737965217802,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 130989,
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
          "id": "a0acbaff1d6be3b7b2fefa16fd820416440f5880",
          "message": "fix: workaround npm install deps cache issue (#13327)",
          "timestamp": "2025-04-04T21:10:03Z",
          "tree_id": "4510acb46b0ff61582e65af7b9f28395f26bde8e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a0acbaff1d6be3b7b2fefa16fd820416440f5880"
        },
        "date": 1743803997599,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9406,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23920234628797427,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 143921,
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
          "distinct": false,
          "id": "8c58c96e8d806c162dc81c5302ae9f57bc744f84",
          "message": "feat: improved pairing point accumulator (#13226)\n\nClean up and refactor the use of `aggregation_state` in preparation to\nperform pairing point aggregation in all of the places its needed. The\nclass now has equivalent support for Ultra and Mega.\n\nThe main components of this work:\n- Use the component-owned methods `set_public` and\n`reconstruct_from_public` to define serialization/deserialization\nmethods for `aggregation_state` rather than relying on one-off\nimplementations and builder methods\n- Avoid explicit use of the underlying witness indices and PairingPoints\n(array of group elements) in favor of an `aggregation_state` instance\n- Template `aggregation_state` on Builder instead of Curve (since only\nbn254 is relevant)\n\n---------\n\nCo-authored-by: ludamad <adam.domurad@gmail.com>",
          "timestamp": "2025-04-04T21:19:26Z",
          "tree_id": "aaf9f511434c89b17ad178c18e2e9b42de1fb298",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8c58c96e8d806c162dc81c5302ae9f57bc744f84"
        },
        "date": 1743805224811,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9283,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23607600136357498,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 137037,
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
          "id": "94f46d6392876d91eaca1451cf678f4dbf1d13a3",
          "message": "refactor: renaming unconstrained to utility in registerer (#13287)\n\nPartially addresses\nhttps://github.com/AztecProtocol/aztec-packages/issues/12743 (partially\nas the rest will be addressed in PRs up the stacks)\n\nIn this PR I rename occurrences of unconstrained to utility\nContractClassRegister and the related code.",
          "timestamp": "2025-04-04T21:25:22Z",
          "tree_id": "2c8205bff8019a31e8447dc874d19ad707ce25a8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/94f46d6392876d91eaca1451cf678f4dbf1d13a3"
        },
        "date": 1743805480633,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9273,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23581551963246736,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 136470,
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
          "id": "405a515aabc6ed74b60173c91c83e8e2a2b5dc1e",
          "message": "fix: Use proof submission window for prover node deadline (#13321)\n\nProver node would abort operations at the end of the following epoch,\nrather than honoring the proof submission window config.\n\nFixes #13320",
          "timestamp": "2025-04-04T22:02:24Z",
          "tree_id": "17b76aac3b07aa424567ffc959d76551a4390676",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/405a515aabc6ed74b60173c91c83e8e2a2b5dc1e"
        },
        "date": 1743806922401,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9272,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23579216618254606,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 139678,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "nicolas.venturo@gmail.com",
            "name": "Nicolás Venturo",
            "username": "nventuro"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": false,
          "id": "8dcebac4fe113cf97aeb25185b168dbf98632ccd",
          "message": "fix: remove second msg discovery call in sync_notes (#13328)\n\nWhen the `#[utility]` macro was added to `sync_notes` in #13243, we\ndidn't realize that by applying the macro to `sync_notes` we were\ncausing for message discovery to be invoked _again_, since that's what\nthe macro does. `sync_notes` can now be an empty function.",
          "timestamp": "2025-04-04T22:19:04Z",
          "tree_id": "c8e236feddba1352b11aa7e3e06fd05b6a356a21",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8dcebac4fe113cf97aeb25185b168dbf98632ccd"
        },
        "date": 1743807452865,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9244,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23507939336352066,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 136105,
            "unit": "us"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "nicolas.venturo@gmail.com",
            "name": "Nicolás Venturo",
            "username": "nventuro"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": false,
          "id": "e3b3b1c890e1bd34b1f59d51e06e55089121b752",
          "message": "chore: move aes code to aes file (#13332)\n\nThis just moves the trait impl outside of the 'log_assembly' dir that\nwe're in the process of removing and into the aes file, along with the\nother aes utils. There's no code changes, renames, nothing - only\nupdated imports.",
          "timestamp": "2025-04-04T22:43:27Z",
          "tree_id": "53b60d488450608f1dad7916b13b013fb3faee7f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/e3b3b1c890e1bd34b1f59d51e06e55089121b752"
        },
        "date": 1743808850743,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9311,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2367880552739093,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 146626,
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
          "id": "4a64f89484835ef5d00f73afbb21ee83b6efbffb",
          "message": "test: `PXEOracleInterface::deliverNote` (#13316)\n\nAdding tests for `deliverNote` oracle.\n\n---------\n\nCo-authored-by: Nicolás Venturo <nicolas.venturo@gmail.com>",
          "timestamp": "2025-04-04T23:00:44Z",
          "tree_id": "ba6bb6a0200dbccc1c9cfc5d8c039dfad838a774",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/4a64f89484835ef5d00f73afbb21ee83b6efbffb"
        },
        "date": 1743810074810,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9458,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.24052765995931233,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 138380,
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
          "id": "81f3d7d4515f2c05232bfe5f164bf2d08232550e",
          "message": "feat(avm): checkpointing hints (#13302)\n\nThe hints are fully implemented but it is NOT being extensively used in\nthe code. I only added one call to `create_checkpoint` in the\n`tx_execution` but the use in TS is complex and intertwined with\ninsertion/call success/failure and I didn't want to understand and\nimplement all that in this PR. This has to be implemented once the\ntx_execution is implemented.",
          "timestamp": "2025-04-04T23:02:10Z",
          "tree_id": "5e264e0e17cc749f0fc5f9c9c9768e4e82662c3b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/81f3d7d4515f2c05232bfe5f164bf2d08232550e"
        },
        "date": 1743811362250,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9280,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2360072482546084,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 143304,
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
          "distinct": false,
          "id": "76a4525ad0fe1f92f10ef7b2a934900f5dfcac34",
          "message": "chore: update hash to fix test and dont skip join split tests (#13175)\n\nRemove the skip on join split tests (which should probably be deleted\nsoon anyway) and update a VK hash to make those tests pass. The cause of\nthe flake seen by Charlie may still be present but we won't know if it\ndoesnt run.",
          "timestamp": "2025-04-04T23:10:56Z",
          "tree_id": "24cb165415c4a3b610004a05e248e6a7c4c8861b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/76a4525ad0fe1f92f10ef7b2a934900f5dfcac34"
        },
        "date": 1743811966929,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9506,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.24174057078816613,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 142645,
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
          "id": "cbf5d3fcab2c0933a0baa884565893b1da7affba",
          "message": "git subrepo push --branch=master noir-projects/aztec-nr\n\nsubrepo:\n  subdir:   \"noir-projects/aztec-nr\"\n  merged:   \"1e5731a7cb\"\nupstream:\n  origin:   \"https://github.com/AztecProtocol/aztec-nr\"\n  branch:   \"master\"\n  commit:   \"1e5731a7cb\"\ngit-subrepo:\n  version:  \"0.4.6\"\n  origin:   \"???\"\n  commit:   \"???\"",
          "timestamp": "2025-04-05T02:28:29Z",
          "tree_id": "d3209b6b86c3741f18b822e0f89468b0eb8d4456",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/cbf5d3fcab2c0933a0baa884565893b1da7affba"
        },
        "date": 1743821821070,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9174,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.233320065198959,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 134580,
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
          "id": "ac55a5f1bf22f45202fcfcc1764208ec07efe9be",
          "message": "chore: Fix expected revert reason in private payment test (#13331)\n\nFix test after change introduced in #13288. This didnt show in the PR\nsince the test was a flake.",
          "timestamp": "2025-04-05T08:36:42Z",
          "tree_id": "c60b70642a3bdf2ab0626a2be0e1bc96bffe8088",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ac55a5f1bf22f45202fcfcc1764208ec07efe9be"
        },
        "date": 1743844237979,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9630,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.24489510040821563,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 149122,
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
          "id": "d888d0e618c242b98551daf954cfe8225226c171",
          "message": "chore(avm): use tx hash as avm proof identifier (#13304)\n\n`functionName` didn't make sense anymore since we now process a whole\nTX.",
          "timestamp": "2025-04-05T08:54:06Z",
          "tree_id": "3e97592b6cd49af08373cc4719a7114a5ce9f518",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d888d0e618c242b98551daf954cfe8225226c171"
        },
        "date": 1743846608338,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9573,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.24345311957175622,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 156073,
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
          "id": "869dc1fbc36d5ab26e5e7828442331332fb9a357",
          "message": "feat(avm): appendLeaves hints (#13312)",
          "timestamp": "2025-04-05T19:47:08Z",
          "tree_id": "d3f48b8d897d7f8aa6aff94e5b0af7a7f9b1fe55",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/869dc1fbc36d5ab26e5e7828442331332fb9a357"
        },
        "date": 1743885850862,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9358,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23798667084253944,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 137545,
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
          "id": "0e38c2665d8dd8f6714b8835bf658ee52f39f0f2",
          "message": "git subrepo push --branch=master noir-projects/aztec-nr\n\nsubrepo:\n  subdir:   \"noir-projects/aztec-nr\"\n  merged:   \"8dde369fd0\"\nupstream:\n  origin:   \"https://github.com/AztecProtocol/aztec-nr\"\n  branch:   \"master\"\n  commit:   \"8dde369fd0\"\ngit-subrepo:\n  version:  \"0.4.6\"\n  origin:   \"???\"\n  commit:   \"???\"",
          "timestamp": "2025-04-06T02:30:51Z",
          "tree_id": "294a64cebd88ce5e0d486a2bfd12da31e5515ed3",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0e38c2665d8dd8f6714b8835bf658ee52f39f0f2"
        },
        "date": 1743908345147,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9415,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23944043727570416,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 146832,
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
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "48e17a45d37590858ea152b82100c04de5f1c432",
          "message": "fix: Might fix some npm install issues. (#13339)\n\nDeletes any node_modules folders before performing yarn installs.\nWorking theory is that if the download from the cache failed halfway,\nyou might have a half install node_modules folder.\nThe failure would look like \"cache not available\" so we then proceed to\ncall yarn install on top of half a node_modules folder.\nI suspect this might leave it in an undefined state, even on success,\nand that could result in a corrupt nm folder then being uploaded to\ncache and breaking everyone.\n\nAlso allows DUMP_FAIL env var which is set when running tests in\nterminal.\nAlso fixes redis not being sourced early enough, resulting in parallel\nattempts to connect.",
          "timestamp": "2025-04-06T18:20:03Z",
          "tree_id": "7d122c15d8cd80bb7684cdd1ba2887e4ce301dcf",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/48e17a45d37590858ea152b82100c04de5f1c432"
        },
        "date": 1743965831630,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9254,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23534029971999212,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 139479,
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
          "id": "c199f2c4ebd3e1045ebab317e1e5f76a0d9a2627",
          "message": "git subrepo push --branch=master noir-projects/aztec-nr\n\nsubrepo:\n  subdir:   \"noir-projects/aztec-nr\"\n  merged:   \"6382fc0870\"\nupstream:\n  origin:   \"https://github.com/AztecProtocol/aztec-nr\"\n  branch:   \"master\"\n  commit:   \"6382fc0870\"\ngit-subrepo:\n  version:  \"0.4.6\"\n  origin:   \"???\"\n  commit:   \"???\"",
          "timestamp": "2025-04-07T02:31:06Z",
          "tree_id": "966d3ab59ca7fad75ed57f358eeb8b69ead08aee",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c199f2c4ebd3e1045ebab317e1e5f76a0d9a2627"
        },
        "date": 1743994775873,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9388,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23876115432422715,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 145766,
            "unit": "us"
          }
        ]
      }
    ]
  }
}