window.BENCHMARK_DATA = {
  "lastUpdate": 1744202275978,
  "repoUrl": "https://github.com/AztecProtocol/aztec-packages",
  "entries": {
    "End-to-end Benchmark": [
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
          "id": "829a315c6a6306a4b36023a64fcc5a04dfc0a496",
          "message": "chore: add get canonical sponsored fpc and cleanup fee opts in cli wallet (#13319)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\nline.\n\nCo-authored-by: sklppy88 <esau@aztecprotocol.com>",
          "timestamp": "2025-04-07T08:35:51Z",
          "tree_id": "ecb82893bfd0342ffa7cae8ae02ffa174c9c8214",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/829a315c6a6306a4b36023a64fcc5a04dfc0a496"
        },
        "date": 1744017008123,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9189,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2336953664051226,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 151091,
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
          "id": "2e6cebde0308f3a4e4fbb0b7cb36e354b23924fa",
          "message": "chore: improve re-ex flake (#13301)\n\nPasses a parallel with 100 iterations on mainframe\n\n**What was happening**\n\n- For the second test, we mock the `publicProcessorFactory.create` which\nis run every time a block will be built.\n- The happy path expects this to get called by the proposer, trigger the\nmapping switch, leading the rest of the calls to trigger a timeout.\n- Every 100 of so times the test is run, the proposer ends up building\nthe block before we mock, which means that not all of the validators run\nthe timeout, so only 2 of them time out, not 3 as the test requires\n\nIn the interests of keeping the test short, and not cleaning out state\nbetween each run, we simply relax the condition that all validators must\nexperience an error, since we assert that the transaction fails to mine",
          "timestamp": "2025-04-07T10:36:17Z",
          "tree_id": "f4d43e0a3ccacd7c8e96718fede34f4e908c20b8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/2e6cebde0308f3a4e4fbb0b7cb36e354b23924fa"
        },
        "date": 1744024245213,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9508,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.24180960637023227,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 156068,
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
          "id": "37001ab4b72abc09c492cf7c05278b211837804a",
          "message": "fix: Wait for L1 mint tx on cross chain test harness (#13344)\n\nAttempt at fixing flakes where the balance expectation failed:\n\n```\n18:22:41   ● e2e_cross_chain_messaging token_bridge_public › Publicly deposit funds from L1 -> L2 and withdraw back to L1\n18:22:41\n18:22:41     expect(received).toEqual(expected) // deep equality\n18:22:41\n18:22:41     Expected: 1000000n\n18:22:41     Received: 0n\n18:22:41\n18:22:41       234 |     });\n18:22:41       235 |     await contract.write.mint([this.ethAccount.toString(), amount]);\n18:22:41     > 236 |     expect(await this.l1TokenManager.getL1TokenBalance(this.ethAccount.toString())).toEqual(amount);\n18:22:41           |                                                                                     ^\n18:22:41       237 |   }\n18:22:41       238 |\n18:22:41       239 |   getL1BalanceOf(address: EthAddress) {\n18:22:41\n18:22:41       at CrossChainTestHarness.toEqual [as mintTokensOnL1] (shared/cross_chain_test_harness.ts:236:85)\n18:22:41       at Object.<anonymous> (e2e_cross_chain_messaging/token_bridge_public.test.ts:46:5)\n```",
          "timestamp": "2025-04-07T12:45:34Z",
          "tree_id": "a42e3890d9aa726c20b393204f52e3f87cc9ae43",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/37001ab4b72abc09c492cf7c05278b211837804a"
        },
        "date": 1744032788611,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9314,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23686158401184307,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 155385,
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
          "id": "29856a8d14e015e16817e915e03c78e8af1a41ed",
          "message": "fix: removeNullifiedNotes respecting only synced nullifiers (#13334)\n\nAs Nico pointed out\n[here](https://github.com/AztecProtocol/aztec-packages/pull/13323#discussion_r2029421426)\nwe have incorrectly obtained nullifiers at the `latest` block instead of\nat the synced one in `removeNullifiedNotes` functions. This PR addresses\nthat along with making NoteDataProvider more strict and a minor\noptimization of `removeNullifiedNotes`.",
          "timestamp": "2025-04-07T14:46:46Z",
          "tree_id": "cc789aa545270346886655d093eecbce327ce174",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/29856a8d14e015e16817e915e03c78e8af1a41ed"
        },
        "date": 1744041665605,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9256,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23539303810966208,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 137206,
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
          "id": "a4d33f690745cb9b3212d4f9d226e6c3df4800b9",
          "message": "chore(discv): improve flakey self update ip test (#13317)\n\n## Overview\n\n\nin http://ci.aztec-labs.com/c3954cbd813c6468 we see that \n\nINFO: p2p:discv5_service:7894 Multiaddr updated\n\nWhich is our success case, even thought the test fails. \n\nSwapping Promise.all to Promise.allSettled as we do not care if we\nreject if we end up with our IP updated",
          "timestamp": "2025-04-07T15:15:50Z",
          "tree_id": "ddb3627c2006c0a8237e72a5ac25e313e54a5939",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a4d33f690745cb9b3212d4f9d226e6c3df4800b9"
        },
        "date": 1744045409490,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9337,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2374652202501791,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 152337,
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
          "id": "79c882937ff1e1adab832ee38298c5318af3bf32",
          "message": "fix: Warn when inconsistent gas limit (#13348)\n\nWe shouldn't throw if a sequencer is configured with a larger L2 gas\nlimit than L1. Just warn and use the L1 value.",
          "timestamp": "2025-04-07T16:00:43Z",
          "tree_id": "ad465adca64c52d51a5de3b1e2e972056e38da0f",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/79c882937ff1e1adab832ee38298c5318af3bf32"
        },
        "date": 1744046477122,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9234,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2348249098507171,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 142636,
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
          "id": "a84a30c4f275da672a4af543424b32d001412158",
          "message": "fix: IVC integration native (#13343)\n\nThis test suite was broken with the changes to use a hardcoded VK for\nCIVC verification. This PR fixes the --write-vk flag in CIVC api so we\ncan write the VK in the mock protocol circuits testing. By default\nwrite-vk is false.",
          "timestamp": "2025-04-07T17:20:15Z",
          "tree_id": "0dead6337c10e9d97d01c3a8ec378e5f855a350e",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a84a30c4f275da672a4af543424b32d001412158"
        },
        "date": 1744050143439,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9293,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2363312503884695,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 146260,
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
          "id": "b4221efeb67a16e037b68416b9bd6e3677fc897d",
          "message": "fix: port_change test + testbench (#13326)\n\n## Overview\n\nA few prs had made this test fall behind, it being a flake left stuff un\ncorrected.\n\nThere are a couple of problems with this test / the testbench. \n**Testbench**\n- log out puts had changed, leaving the testbench itself bricked\n- Turning off transaction validation as we are producing a dummy\ntransaction\n\n**Port Change**\n- reducing node counts so my resource hypothesis can hopefully not be a\ncrutch for me to fallback on\n- Treat the bootnodes as full peers so we actually re discover them",
          "timestamp": "2025-04-07T18:26:32Z",
          "tree_id": "0c77e04334aa9101912539ecfd5249ff1dc3bcfa",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/b4221efeb67a16e037b68416b9bd6e3677fc897d"
        },
        "date": 1744053880881,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9332,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23733429912570791,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 135890,
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
          "id": "bf7882ddf02cbb2d2ec883754f00769ee283694a",
          "message": "feat: txIndexInBlock in response of getTxEffect (#13336)\n\nPartially addresses\nhttps://github.com/AztecProtocol/aztec-packages/issues/13335\n\nIn this PR I add txIndexInBlock to the response of getTxEffect such that\nin a follow-up PR I can store that info along with an event log which\nwill then allow me to return event logs in an ordered manner.\n\nUnfortunately the return value of getTxEffect became a bit ugly but\nintroducing a new type for it seemed excessive as it would be used only\nin that one method.",
          "timestamp": "2025-04-07T20:10:04Z",
          "tree_id": "39e841395467304d0792ce41970a51a093fec670",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/bf7882ddf02cbb2d2ec883754f00769ee283694a"
        },
        "date": 1744058406297,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9320,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23701619365739926,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 136873,
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
          "id": "64675db1232d1344da8e0f1ebd6b87b1522ad59a",
          "message": "chore: rename logs to msg (#13364)\n\nThis expands on the 'message' term:\n\n- contracts send and receive messages\n- messages follow standard encoding, by having a message type id,\nmetadata, and content\n- encoded messages are encrypted into ciphertext\n- ciphertext can be emitted alongside a tag in a log\n- ciphertext is decrypted into plaintext, which is an encoded message\n- from it we get back message metadata and content\n\nBefore this PR, we call both the log and the message 'logs', which is\nincorrect and confusing.\n\nThe renaming is partial since some concepts are still tied to logs (e.g.\nevents *must* be in logs, message processing is currently done on logs\nstored in capsules, etc.), but this is a good first step.",
          "timestamp": "2025-04-07T21:36:12Z",
          "tree_id": "a4f2192b2549e65875b8a92937cd5cdbd244ecfb",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/64675db1232d1344da8e0f1ebd6b87b1522ad59a"
        },
        "date": 1744064230569,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9274,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2358511703642627,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 134517,
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
          "id": "0d5add0bc5ed8f6f32e5299965bb418553178638",
          "message": "chore: improve capsule performance and add tests (#13284)\n\nBest reviewed by ignoring whitespace changes in the diff.\n\nThis makes `copyCapsule` create a transaction, massively reducing how\nlong it takes to copy large numbers of elements, which we do when\ndeleting arbitrary entries in a `CapsuleArray`. I added some tests with\nhardcoded timeouts to try to detect performance regressions, though\neventually these should be collected along with other metrics in some\nmore complete manner.\n\nI also added tests for the `appendToCapsuleArray` function @benesjan\nintroduced, since these were missing.\n\n---------\n\nCo-authored-by: Gregorio Juliana <gregojquiros@gmail.com>",
          "timestamp": "2025-04-07T22:20:16Z",
          "tree_id": "ec9e2096961e9568a3e641574a103f1c3948f5c8",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0d5add0bc5ed8f6f32e5299965bb418553178638"
        },
        "date": 1744066527023,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9173,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23328501223113318,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 139096,
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
          "id": "5026c6259e6a09a3a1ea73c904aa4f12bafbb880",
          "message": "test: `getLogByTag` and `removeNullifiedNotes` on `PXEOracleInterface` (#13323)\n\nAdding tests for `getLogByTag` oracle and `removeNullifiedNotes`",
          "timestamp": "2025-04-07T22:34:35Z",
          "tree_id": "659818506224bd1f3f1616f3eff3247dda2f8649",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5026c6259e6a09a3a1ea73c904aa4f12bafbb880"
        },
        "date": 1744067399793,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9298,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23645765622698234,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 146406,
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
          "id": "ec4fd7454e964965f6ff6529a244b2bffb2cd8e4",
          "message": "git subrepo push --branch=master noir-projects/aztec-nr\n\nsubrepo:\n  subdir:   \"noir-projects/aztec-nr\"\n  merged:   \"50d90d3551\"\nupstream:\n  origin:   \"https://github.com/AztecProtocol/aztec-nr\"\n  branch:   \"master\"\n  commit:   \"50d90d3551\"\ngit-subrepo:\n  version:  \"0.4.6\"\n  origin:   \"???\"\n  commit:   \"???\"",
          "timestamp": "2025-04-08T02:29:34Z",
          "tree_id": "db2e23e429c2e98fd76d7c3b6b248950e4e0532d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ec4fd7454e964965f6ff6529a244b2bffb2cd8e4"
        },
        "date": 1744081103511,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9195,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23383865086322708,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 145240,
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
          "id": "236e9e58c90e469aa9ffb14213586270aa9c62f0",
          "message": "test: `e2e_note_getter` not using `DocsExampleContract` (#13366)\n\nThis PR is a piece of a series of PRs in which I clean up our use of\ntest contracts. In this case I am replacing the use of\nDocsExampleContract in `e2e_note_getter.test.ts` with the goal of\neventually not using `DocsExampleContract` in `/yarn-project` at all.\n\nI introduce a new NoteGetter test contract.",
          "timestamp": "2025-04-08T03:09:45Z",
          "tree_id": "acbb75be09b2c4ebde1dbe50334482b75cee1d98",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/236e9e58c90e469aa9ffb14213586270aa9c62f0"
        },
        "date": 1744083617092,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9292,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23630896735816972,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 141583,
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
          "id": "1c3d70b44a904c3a0542f78995bc0aef50068c96",
          "message": "chore: add option to register contract class to deploy account in cli-wallet (#13359)\n\nWithout this, devnet / testnet were having issues deploying the first\nschnorr account contract.",
          "timestamp": "2025-04-08T09:03:26Z",
          "tree_id": "e328d87de190be914f4bcbcce766210e41d6e130",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1c3d70b44a904c3a0542f78995bc0aef50068c96"
        },
        "date": 1744105393291,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9284,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2361083302796656,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 144566,
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
          "id": "ca6c7a7ba344fa15d3abe5515d24b65c5585c8fd",
          "message": "fix: txe node should not use base fork for find_leaves_indexes (#13341)\n\nThis is a change to unblock defi-wonderland as they're running into some\nissues after moving more log processing to noir. This will be more or\nless refactored in a imminent txe rework / cleanup.\n\nThe crux of this fix was that `this.baseFork` does not include any block\nmetadata, because it is not checkpointed by `handleL2BlocksAndMessages`.\nWe need to specifically fetch for the `lastCommitted` state, or from\n`getSnapshot`\n\nCo-authored-by: sklppy88 <esau@aztecprotocol.com>",
          "timestamp": "2025-04-08T10:03:21Z",
          "tree_id": "5f514996931ec44a88971ef05104c445fa4b2298",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ca6c7a7ba344fa15d3abe5515d24b65c5585c8fd"
        },
        "date": 1744108322410,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9206,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23412761125451428,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 130039,
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
          "id": "d68800a69e03280e0276dc3310c15a8ca528fb35",
          "message": "fix: mega zk in hiding circuit + bug fixes (#13262)\n\nFixed the bugs discovered by Taceo + it was long overdue to switch from\nMega to MegaZK for proving the hiding circuit.\n\n\nCloses https://github.com/AztecProtocol/aztec-packages/issues/13117\nCloses https://github.com/AztecProtocol/aztec-packages/issues/13116",
          "timestamp": "2025-04-08T11:51:35Z",
          "tree_id": "d48158c1a82f4464081440cc98f1e2ea63dd8f69",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d68800a69e03280e0276dc3310c15a8ca528fb35"
        },
        "date": 1744116883212,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9642,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.24521800370965796,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 141029,
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
          "id": "be31389ba3cf9c2833492b5c8f366e9e17bed59d",
          "message": "chore: Fix flake in reqresp p2p test (#13333)\n\nIssue seems to be that the txs get sent to the first proposer with\nlittle time for it to build the block, so it misses its shot, and then\nthat tx never reaches other nodes (since p2p gossip was disabled). This\nattempts to fix it.\n\nWIP: currently running into a `Assertion failed: Failed to get a note\n'self.is_some()'`",
          "timestamp": "2025-04-08T12:09:36Z",
          "tree_id": "50385e1584c39416383f23ef9185b43376aa971d",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/be31389ba3cf9c2833492b5c8f366e9e17bed59d"
        },
        "date": 1744117058055,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9544,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2427159723129036,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 141775,
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
          "id": "5b4848fb027d2e81b2e4fe6b2181f598901a08f0",
          "message": "fix: `PXE::getPrivateEvents(...)` ordering (#13363)\n\nFixes https://github.com/AztecProtocol/aztec-packages/issues/13335\n\nWe didn't return events from getPrivateEvents in ordering in which they\nwere emitted because we didn't have txIndexInBlock info before. That\ninfo got propagated in a [PR down the\nstack](https://github.com/AztecProtocol/aztec-packages/pull/13336) and\nin this PR I am leveraging that to fix the ordering.",
          "timestamp": "2025-04-08T13:53:24Z",
          "tree_id": "14e2b202af7fc8c96108fafd18f1b832ff3f575c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/5b4848fb027d2e81b2e4fe6b2181f598901a08f0"
        },
        "date": 1744122714052,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9428,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23976658243666626,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 144286,
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
          "id": "746353898f4a62189dd896c288e36b231d77c0bf",
          "message": "feat: preload CRS files once in GKE (#13093)\n\nThis PR downloads the CRS file to a volume using a pre-install helm job\nthat then gets cloned into a `ReadOnlyMany` shared volume for all the\nagents",
          "timestamp": "2025-04-08T15:36:18Z",
          "tree_id": "8f0380d391b7aacc40095e9aed49f99bf7530904",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/746353898f4a62189dd896c288e36b231d77c0bf"
        },
        "date": 1744128934463,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9895,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2516428503485002,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 142234,
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
          "id": "668616825cb9cc76bf25884ff40d77f2101272a9",
          "message": "chore: Deflake p2p client unit test (#13387)\n\nRemoves sleeps in favor of forced syncs.\n\nFixes flakes like [this one](http://ci.aztec-labs.com/8be3f58c163e887d).",
          "timestamp": "2025-04-08T15:38:44Z",
          "tree_id": "15d20e84278f842ad1487a18a838a5f1532fc166",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/668616825cb9cc76bf25884ff40d77f2101272a9"
        },
        "date": 1744129282203,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9289,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23622763367235936,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 148266,
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
          "distinct": true,
          "id": "7aabf7c22a6f7bd044c00c591c120c576c00d22b",
          "message": "chore: add encode/decode fns (#13369)\n\nHopefully the last step for a while in our msg encode/decode adventures.\nThis creates `encoding::{encode_message, decode_message}`, which are\nfunctions that already existed in other modules but were not yet a core\nconcept. I also added some tests.\n\n---------\n\nCo-authored-by: Jan Beneš <janbenes1234@gmail.com>",
          "timestamp": "2025-04-08T15:52:23Z",
          "tree_id": "f22dcbe39fd6d2689236e6dfecc8c6fcf5f818a9",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/7aabf7c22a6f7bd044c00c591c120c576c00d22b"
        },
        "date": 1744129869623,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9374,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23840345971100732,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 143686,
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
          "id": "1ad43685678fa74faf4b71641376b378285ecf49",
          "message": "fix: retry download old crs (#13350)\n\nHopefully this whole thing will go away next week when we migrate C++ to\nuse flat crs in ~/.bb-crs",
          "timestamp": "2025-04-08T17:59:01Z",
          "tree_id": "afddb535a2d66371acad6ea3666580a9ec6ca905",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/1ad43685678fa74faf4b71641376b378285ecf49"
        },
        "date": 1744138839264,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9653,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2454798566594021,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 158782,
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
          "id": "ca708e70d1090771faf5f20eb70b4ebd6d4ebf53",
          "message": "chore(civc): Rename e2e trace to aztec trace (#13399)\n\nClient IVC tech debt, this is now 'the' trace not just 'a trace\noptimized for e2e test'",
          "timestamp": "2025-04-08T19:15:43Z",
          "tree_id": "0b61adf7335d40dba34cc9ec1ddaf63dbb454ff1",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/ca708e70d1090771faf5f20eb70b4ebd6d4ebf53"
        },
        "date": 1744143844044,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9576,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2435444880280836,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 161816,
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
          "id": "007811df98c86f29b89ad218eedfa4dfaadc44d4",
          "message": "docs: update utility fn docs (#13310)\n\nReplacement for\nhttps://github.com/AztecProtocol/aztec-packages/pull/13248 to get it out\nof the graphite stack.\n\nThis PR updates mentions of top-level unconstrained contract fns for the\nnew 'utility' term. Some instances may be missing, but I think we\ncovered the vast majority of it. I also updated language in some parts\nwere explanations were outdated, and tried to remove bits that conflated\nNoir unconstrained functions and utility functions. We'll likely want to\nexpand on this given the apparent confusion.\n\n---------\n\nCo-authored-by: benesjan <janbenes1234@gmail.com>",
          "timestamp": "2025-04-08T19:55:01Z",
          "tree_id": "7be517c7601f05a23cf05f78b324cf77c16f8939",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/007811df98c86f29b89ad218eedfa4dfaadc44d4"
        },
        "date": 1744145624295,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9346,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23768477911834635,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 138703,
            "unit": "us"
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
          "id": "4899d3fe8f633b3533f84ad2988ba5bd4f85d8cd",
          "message": "feat: node mempool limiting (#13247)\n\nCloses https://github.com/AztecProtocol/aztec-packages/issues/12879\n\n[Design\ndoc](https://github.com/AztecProtocol/engineering-designs/blob/main/docs/mempools/dd.md)\n\nCurrently, there are no limits on the size of the pending tx pool.\n\nThis PR adds limits on the total number and cumulative tx size of valid\npending txs in the mempool. If either limit is hit, then the lowest\npriority pending txs will be evicted to make room until both limits are\nsatisfied.\n\nAdditionally, whenever a new block is mined, all pending txs will be\nchecked to ensure that they don't share any nullifiers with mined txs,\nhave a sufficient fee payer balance, and have a max block number higher\nthan the mined block.\n\nIn the case of a reorg, all pending txs are checked to ensure that their\narchive root is still valid. If it isn't, then the tx is evicted.",
          "timestamp": "2025-04-08T19:54:09Z",
          "tree_id": "3a977f24bdf3da8427092f718bba78105d40da13",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/4899d3fe8f633b3533f84ad2988ba5bd4f85d8cd"
        },
        "date": 1744146102495,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9734,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2475449114544229,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 169424,
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
          "id": "0ec191783554672ed3a182a1726d2c913a887dd9",
          "message": "feat: Add rollup IVC testing suite (#13371)\n\nAdds mock bases, merge and root rollups that use the rollup ivc scheme.\nThese are testing the IVC integration for rollup honk and will be used\nto test the integration of goblinized AVM recursive verifiers into\nrollup honk.",
          "timestamp": "2025-04-08T22:08:13Z",
          "tree_id": "36b25e12ce9ef5e15bcee03d6a04aa57736f6030",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0ec191783554672ed3a182a1726d2c913a887dd9"
        },
        "date": 1744152402874,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9189,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23369847941747382,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 132102,
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
          "id": "d656743bbd6b88f57b76ec5b30679f14a79b37a6",
          "message": "test: replacing remaining use of DocsExampleContract (#13388)\n\nContinuation of\nhttps://github.com/AztecProtocol/aztec-packages/pull/13368\n\nThis PR is part of a series of PRs in which I clean up our use of test\ncontracts. In this PR I am replacing all the remaining use of\nDocsExampleContract in `/yarn-project`.\n\nI introduce `NoConstructor` and `InvalidAccount` test contracts.",
          "timestamp": "2025-04-08T22:44:40Z",
          "tree_id": "17b0e6f8a75a2c67deff2ab366490cc5ce81123b",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d656743bbd6b88f57b76ec5b30679f14a79b37a6"
        },
        "date": 1744154799931,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9906,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.25191931024492853,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 147002,
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
          "id": "a27fda019057795ac7103033b9f196d6ada6e0fa",
          "message": "git subrepo push --branch=master noir-projects/aztec-nr\n\nsubrepo:\n  subdir:   \"noir-projects/aztec-nr\"\n  merged:   \"7ab89b96ff\"\nupstream:\n  origin:   \"https://github.com/AztecProtocol/aztec-nr\"\n  branch:   \"master\"\n  commit:   \"7ab89b96ff\"\ngit-subrepo:\n  version:  \"0.4.6\"\n  origin:   \"???\"\n  commit:   \"???\"",
          "timestamp": "2025-04-09T02:30:25Z",
          "tree_id": "e0bdc44b6196b64049824ea7d5e5b6d898941bcd",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/a27fda019057795ac7103033b9f196d6ada6e0fa"
        },
        "date": 1744167642712,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9204,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23406102907272042,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 130974,
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
          "id": "0e30b2cb2443694bca769914b1f398fb8b1f81b7",
          "message": "chore: remove setup-l2 job as it's not needed anymore (#13375)",
          "timestamp": "2025-04-09T08:38:53Z",
          "tree_id": "2579ec9ede3e411cd86af34957b9fca8dda8c54c",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/0e30b2cb2443694bca769914b1f398fb8b1f81b7"
        },
        "date": 1744190052218,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9291,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23627189413507002,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 142668,
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
          "id": "20a0aaa43386dcfe2942de7ddb0426ce8b64bddd",
          "message": "fix: logging ABI in errors + more aggressive hex truncation (#12715)\n\nFixes #11003 \nAlso does some more aggressive hex truncation since we're still seeing\nsome logs including the entire `args` and taking up 100s of thousands of\nchars in logs that make them unreadable",
          "timestamp": "2025-04-09T09:20:49Z",
          "tree_id": "4aa499b6f264695c7f127b3bb293d64456e43fd7",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/20a0aaa43386dcfe2942de7ddb0426ce8b64bddd"
        },
        "date": 1744192494792,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 9395,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.23893326808862225,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 140144,
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
          "id": "c4efcb3c14474488ac469814bca60f2144bc8d2d",
          "message": "fix(avm): request paths for appendLeaves (#13389)\n\nPlease read [contributing guidelines](CONTRIBUTING.md) and remove this\nline.",
          "timestamp": "2025-04-09T09:37:50Z",
          "tree_id": "b3af6ec7eb35a2d0aa9a61d89cc97ab89a191e40",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c4efcb3c14474488ac469814bca60f2144bc8d2d"
        },
        "date": 1744194938363,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 10254,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.26076435246995994,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 153635,
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
          "id": "c8a766e9de7e107d5348771b5ad3adee35cab41e",
          "message": "fix: Wait for world-state to start before starting p2p (#13400)\n\nSince #13247 the p2p pool depends on world-state to be up to date for\npurging txs with insufficient balance. This means that if world-state is\nnot yet running, it will not accept `syncImmediate` calls, and will\ncause p2p to fail with the following error:\n\n```\n20:14:28 [20:14:28.999] ERROR: p2p:lmdb-v2:40401 Failed to commit transaction: Error: World State is not running. Unable to perform sync.\n20:14:28     at ServerWorldStateSynchronizer.syncImmediate (/home/aztec-dev/aztec-packages/yarn-project/world-state/dest/synchronizer/server_world_state_synchronizer.js:132:19)\n20:14:28     at AztecKVTxPool.evictInvalidTxsAfterMining (/home/aztec-dev/aztec-packages/yarn-project/p2p/dest/mem_pools/tx_pool/aztec_kv_tx_pool.js:375:44)\n20:14:28     at /home/aztec-dev/aztec-packages/yarn-project/p2p/dest/mem_pools/tx_pool/aztec_kv_tx_pool.js:82:46\n20:14:28     at /home/aztec-dev/aztec-packages/yarn-project/kv-store/dest/lmdb-v2/store.js:111:29\n20:14:29     at /home/aztec-dev/aztec-packages/yarn-project/foundation/dest/queue/serial_queue.js:56:33\n20:14:29     at FifoMemoryQueue.process (/home/aztec-dev/aztec-packages/yarn-project/foundation/dest/queue/base_memory_queue.js:110:17)\n20:14:29 [20:14:28.999] ERROR: p2p:l2-block-stream:40401 Error processing block stream: Error: World State is not running. Unable to perform sync.\n20:14:29     at ServerWorldStateSynchronizer.syncImmediate (/home/aztec-dev/aztec-packages/yarn-project/world-state/dest/synchronizer/server_world_state_synchronizer.js:132:19)\n20:14:29     at AztecKVTxPool.evictInvalidTxsAfterMining (/home/aztec-dev/aztec-packages/yarn-project/p2p/dest/mem_pools/tx_pool/aztec_kv_tx_pool.js:375:44)\n20:14:29     at /home/aztec-dev/aztec-packages/yarn-project/p2p/dest/mem_pools/tx_pool/aztec_kv_tx_pool.js:82:46\n20:14:29     at /home/aztec-dev/aztec-packages/yarn-project/kv-store/dest/lmdb-v2/store.js:111:29\n20:14:29     at /home/aztec-dev/aztec-packages/yarn-project/foundation/dest/queue/serial_queue.js:56:33\n20:14:29     at FifoMemoryQueue.process (/home/aztec-dev/aztec-packages/yarn-project/foundation/dest/queue/base_memory_queue.js:110:17)\n```\n\nSee [here](http://ci.aztec-labs.com/a97eca2e41f285b2) for a sample run.\n\nThis commit changes the Aztec node startup so it waits for world-state\nto start before kicking off p2p.",
          "timestamp": "2025-04-09T10:02:15Z",
          "tree_id": "398083263fd7f297994701285774f000859c3709",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/c8a766e9de7e107d5348771b5ad3adee35cab41e"
        },
        "date": 1744195115109,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 10335,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2628406184429479,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 144425,
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
          "id": "8c58b76ca152b7896e2c4e731d5bc3d8239f431d",
          "message": "feat: unify opcode API between ultra and eccvm ops (#13376)\n\nIn this PR:\n* Use the same representation of opcodes for Ultra Ops and ECCVM ops and\nunit tests the equivalence. We favour the ECCVM representation because\nthis is thightly coupled to the correctness and efficiency of some ECCVM\nrelations.\n* Define the Ultra and ECCVM operation structs in the same file and\nremove the double definition of ECCVM operations\n* Move the op_queue outside of the stdlib_circuit_builder target in its\nown target to avoid the dependency of Goblin VMs on this",
          "timestamp": "2025-04-09T10:15:33Z",
          "tree_id": "9b5dad3c213ada7fe26507915b188f511c9184fa",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/8c58b76ca152b7896e2c4e731d5bc3d8239f431d"
        },
        "date": 1744197281438,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 10435,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2653747516092325,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 151482,
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
          "id": "d5ce03a70b54516a2f3323e95d0878572f63f563",
          "message": "fix: check genesis state before starting node (#13121)\n\nThis PR adds a check that the computed genesis state matches the\nrollup's and refuses to start if there's a mismatch:\n\nExample of it in action: (I previously deployed a rollup without test\naccounts)\n```\nt % export TEST_ACCOUNTS=true\nt % node aztec/dest/bin/index.js start --node --archiver\nInitial funded accounts: 0x28491b8467212d92f515f389a39f1feddcd22dd07d6dbf60a2f162a213746c90, 0x235b767f653b46347246207d9f6dcc199b9204388e76be129e1bb1e57f43cab7, 0x041fc27e559aace70b414b6dfa4a70dc5933aa045afba8e100ec63f31d0fc88b                                                                                                                                                            Genesis block hash: 0x10d6c0bd1f44fdde380fa846ab63ca943f74e567b916774fe1855fcf2f41b105\nGenesis archive root: 0x1ef48c132277b9b2a9b348c763d2f281b4f3d08baa86070fc3a461507bd74ca6\n[10:59:45.136] WARN: foundation:version-manager Rollup or tag has changed, resetting data directory {\"versionFile\":\"/tmp/aztec-world-state-xZNypg/world_state/db_version\",\"storedVersion\":{\"schemaVersion\":0,\"rollupAddress\":\"0x0000000000000000000000000000000000000000\",\"tag\":\"\"},\"currentVersion\":{\"schemaVersion\":1,\"rollupAddress\":\"0x0000000000000000000000000000000000000000\",\"tag\":\"genesisArchiveTreeRoot:0x0000000000000000000000000000000000000000000000000000000000000000\"}}\n[10:59:45.159] INFO: world-state:database Creating world state data store at directory /tmp/aztec-world-state-xZNypg/world_state with map size 10485760 KB and 16 threads.\n[10:59:45.558] ERROR: cli Error in command execution\n[10:59:45.559] ERROR: cli Error: The computed genesis archive tree root 0x1ef48c132277b9b2a9b348c763d2f281b4f3d08baa86070fc3a461507bd74ca6 does not match the expected genesis archive tree root 0x0237797d6a2c04d20d4fa06b74482bd970ccd51a43d9b05b57e9b91fa1ae1cae for the rollup deployed at 0x0b306bf915c4d645ff596e518faf3f9669b97016\nError: The computed genesis archive tree root 0x1ef48c132277b9b2a9b348c763d2f281b4f3d08baa86070fc3a461507bd74ca6 does not match the expected genesis archive tree root 0x0237797d6a2c04d20d4fa06b74482bd970ccd51a43d9b05b57e9b91fa1ae1cae for the rollup deployed at 0x0b306bf915c4d645ff596e518faf3f9669b97016\n    at startNode (file:///mnt/user-data/alexg/code/aztec-packages/alpha/yarn-project/aztec/dest/cli/cmds/start_node.js:63:19)\n```\n\nFix #13020",
          "timestamp": "2025-04-09T11:29:55Z",
          "tree_id": "03ccf1f3be43bc4901ec3654c1450f86d3f74805",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/d5ce03a70b54516a2f3323e95d0878572f63f563"
        },
        "date": 1744200914370,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 10240,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.26042087137865244,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 145752,
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
          "id": "3f11060e5de846f0dc2662985c4b98dd62001302",
          "message": "feat(avm): tree padding (#13394)\n\nFolded creation of db type aliases into this PR.",
          "timestamp": "2025-04-09T11:39:41Z",
          "tree_id": "0dddc76daae5ea17f63d2584e30081bf262b85db",
          "url": "https://github.com/AztecProtocol/aztec-packages/commit/3f11060e5de846f0dc2662985c4b98dd62001302"
        },
        "date": 1744202275343,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Sequencer/aztec.sequencer.block.build_duration",
            "value": 10629,
            "unit": "ms"
          },
          {
            "name": "Sequencer/aztec.sequencer.block.time_per_mana",
            "value": 0.2703238966865319,
            "unit": "us/mana"
          },
          {
            "name": "Sequencer/aztec.sequencer.block_builder_tree_insertion_duration",
            "value": 161027,
            "unit": "us"
          }
        ]
      }
    ]
  }
}